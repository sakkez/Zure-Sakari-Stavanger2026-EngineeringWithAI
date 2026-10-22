import { test, expect, join, pair, players, find, phase, highscores, NAME } from "../fixtures";

test("a lone player gets a countdown, then a round against one bot", async ({ browser, game }) => {
  const a = await join(browser, game.url);
  await phase(a, "countdown");
  await phase(a, "playing");
  const all = await players(a.page);
  expect(all).toHaveLength(2);
  const bot = all.find((p) => p.bot)!;
  expect(bot, "one bot").toBeTruthy();
  expect(bot.name).toMatch(NAME);
  expect(bot.name).not.toBe(a.name);
  expect(bot.hp, "the same 100 as a player").toBe(100);
  expect((await find(a.page, a.name))!.hp).toBe(100);
  await expect(a.page.getByTestId("hp")).toHaveText("100");
  await expect(a.page.getByTestId("score")).toHaveText("0");
});

test.describe("between rounds", () => {
  test.use({ gameEnv: { RECONNECT_MS: "1000" } });

  test("a player who arrives mid-round spectates it, then plays the next one", async ({ browser, game }) => {
    const [a, b] = await pair(browser, game.url);
    const c = await join(browser, game.url);
    await phase(c, "playing");
    await expect.poll(async () => (await players(c.page)).map((p) => p.name).sort()).toEqual([a.name, b.name].sort());
    await c.page.keyboard.press("ArrowRight");
    await c.page.keyboard.press("Space");
    await c.page.waitForTimeout(500);
    expect(await find(c.page, c.name), "a spectator is not on the grid").toBeUndefined();

    // B leaves, A wins; everyone still here plays the next round, without a bot.
    await b.ctx.close();
    await phase(c, "over");
    await expect(c.page.getByTestId("winner")).toHaveText(a.name);
    await phase(c, "playing");
    await expect.poll(async () => (await players(c.page)).map((p) => p.name).sort()).toEqual([a.name, c.name].sort());
    expect(await highscores(c.page)).toEqual(expect.arrayContaining([{ name: a.name, score: 250 }]));
  });
});

test("the highscores list starts empty", async ({ browser, game }) => {
  const a = await join(browser, game.url);
  await phase(a, "countdown");
  expect(await highscores(a.page)).toEqual([]);
});
