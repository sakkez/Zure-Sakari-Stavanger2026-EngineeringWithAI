import { test, expect, join, pair, approach, attack, ready, highscores, watchDamage, damages, hue, inView, type Seat } from "../fixtures";

/** Each health bar's fill as a share of the bar, by name. */
async function bars(seat: Seat) {
  return seat.page.locator('[data-testid="player"]').evaluateAll((els) =>
    els.map((e) => {
      const bar = e.querySelector('[data-testid="healthbar"]')?.getBoundingClientRect();
      const fill = e.querySelector('[data-testid="healthbar-fill"]')?.getBoundingClientRect();
      return {
        name: (e as HTMLElement).dataset.name ?? "",
        shown: !!bar && bar.width > 0 && bar.height > 0,
        share: bar && fill && bar.width ? fill.width / bar.width : -1,
      };
    }),
  );
}

const isRed = (h: number) => h >= 0 && (h <= 20 || h >= 340);
const isYellowOrGreen = (h: number) => h >= 40 && h <= 170;

test("everyone has a health bar, and you always see your hit points out of 100", async ({ browser, game }) => {
  const [a, b] = await pair(browser, game.url);
  for (const bar of await bars(a)) expect(bar, `${bar.name}'s health bar`).toMatchObject({ shown: true });
  for (const bar of await bars(a)) expect(bar.share).toBeCloseTo(1, 1);

  await expect(a.page.getByTestId("hp-max")).toHaveText("100");
  for (const id of ["hp", "hp-max"]) expect(await inView(a.page, id), `${id} is in view`).toBe(true);

  await approach(a, b.name);
  await ready(a);
  await attack(a);
  await expect(b.page.getByTestId("hp")).toHaveText("75");
  await expect.poll(async () => (await bars(a)).find((x) => x.name === b.name)?.share, { message: "B's bar on A's screen" }).toBeCloseTo(0.75, 1);
  await expect.poll(async () => (await bars(b)).find((x) => x.name === b.name)?.share, { message: "B's own bar" }).toBeCloseTo(0.75, 1);
  await expect(b.page.getByTestId("hp-max")).toHaveText("100");
});

test("a hit floats its damage up from whoever was hit: yellow or green for you, red on them, then fades", async ({ browser, game }) => {
  const [a, b] = await pair(browser, game.url);
  await approach(a, b.name);
  await Promise.all([watchDamage(a.page), watchDamage(b.page)]);
  await ready(a);
  await attack(a);
  await expect(b.page.getByTestId("hp")).toHaveText("75");
  await a.page.waitForTimeout(2700);

  const dealt = (await damages(a.page)).filter((d) => d.target === b.name);
  expect(dealt, "A sees one number on B").toHaveLength(1);
  const taken = (await damages(b.page)).filter((d) => d.target === b.name);
  expect(taken, "B sees one number on themselves").toHaveLength(1);
  expect((await damages(a.page)).filter((d) => d.target === a.name), "A was not hit").toHaveLength(0);

  for (const [d, kind, colour, ok] of [[dealt[0], "dealt", "yellow or green", isYellowOrGreen], [taken[0], "taken", "red", isRed]] as const) {
    expect(d).toMatchObject({ amount: 25, kind });
    expect(ok(hue(d.color)), `${kind} damage is ${colour}, got ${d.color}`).toBe(true);
    expect(d.block, "B is on the grid when the number appears").not.toBeNull();
    expect(Math.abs(d.x - d.block!.x), "it starts at B's block").toBeLessThanOrEqual(2 * d.block!.w);
    expect(d.top, "it starts no lower than B's block").toBeLessThanOrEqual(d.block!.bottom);
    if (d.later && d.later.opacity > 0.1) expect(d.later.top, "it floats up").toBeLessThan(d.top - 1);
    expect(d.goneBy2500, "it fades out").toBe(true);
  }
});

test("the rules button shows the rules as a list, and hides them again", async ({ browser, game }) => {
  const a = await join(browser, game.url);
  const rules = a.page.getByTestId("rules");
  await expect(rules).toBeHidden();
  await a.page.getByTestId("rules-button").click();
  await expect(rules).toBeVisible();
  expect(await rules.locator("li").count(), "a list of the rules").toBeGreaterThanOrEqual(5);
  const text = await rules.innerText();
  for (const n of ["5", "25", "10", "100", "250"]) expect(text, `the rules mention ${n}`).toMatch(new RegExp(`\\b${n}\\b`));
  await a.page.getByTestId("rules-button").click();
  await expect(rules).toBeHidden();
});

test.describe("live highscores", () => {
  // A shrink every 2 seconds pays both players 10 while the round runs.
  test.use({ gameEnv: { ZONE_INTERVAL_MS: "2000" } });

  test("update during the round, and stay in view with the grid on a laptop", async ({ browser, game }) => {
    const [a, b] = await pair(browser, game.url);
    const live = async () => (await highscores(a.page)).sort((x, y) => x.name.localeCompare(y.name));
    const both = (score: number) => [{ name: a.name, score }, { name: b.name, score }].sort((x, y) => x.name.localeCompare(y.name));
    await expect.poll(live, { message: "everyone in the round is on the list" }).toEqual(both(0));
    for (const id of ["highscores", "grid"]) expect(await inView(a.page, id), `${id} in view while playing`).toBe(true);
    await expect.poll(live, { message: "a shrink shows up mid-round", timeout: 5000 }).toEqual(both(10));
    await expect(a.page.getByTestId("phase")).toHaveText("playing");
  });
});
