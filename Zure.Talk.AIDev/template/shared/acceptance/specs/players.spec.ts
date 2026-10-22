import { test, expect, join, pair, players, find, phase, dist, room, roomiest, NAME } from "../fixtures";

test("two players get distinct generated names and spawn at least 3 cells apart", async ({ browser, game }) => {
  const [a, b] = await pair(browser, game.url);
  expect(a.name).toMatch(NAME);
  expect(b.name).toMatch(NAME);
  expect(a.name).not.toBe(b.name);
  const all = await players(a.page);
  expect(all.map((p) => p.name).sort()).toEqual([a.name, b.name].sort());
  expect(all.some((p) => p.bot)).toBe(false);
  expect(dist(all[0], all[1])).toBeGreaterThanOrEqual(3);
  for (const p of all) expect(p.hp).toBe(100);
});

test("each player sees the other's moves", async ({ browser, game }) => {
  const [a, b] = await pair(browser, game.url);
  const me = (await find(a.page, a.name))!;
  const dir = roomiest(room(me, await players(a.page)));
  await a.page.keyboard.press({ up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight" }[dir]);
  const moved = { up: { x: me.x, y: me.y - 1 }, down: { x: me.x, y: me.y + 1 }, left: { x: me.x - 1, y: me.y }, right: { x: me.x + 1, y: me.y } }[dir];
  await expect.poll(async () => {
    const seen = await find(b.page, a.name);
    return seen && { x: seen.x, y: seen.y };
  }).toEqual(moved);
});

test.describe("reconnecting", () => {
  test.use({ gameEnv: { RECONNECT_MS: "8000" } });

  test("a reload keeps the name, place and hit points", async ({ browser, game }) => {
    const [a, b] = await pair(browser, game.url);
    const before = (await find(a.page, b.name))!;
    await b.page.reload();
    await expect(b.page.getByTestId("me")).toHaveText(b.name);
    await phase(b, "playing");
    await expect.poll(async () => find(b.page, b.name)).toEqual(before);
    expect(await find(a.page, b.name)).toEqual(before);
  });
});

test.describe("leaving", () => {
  test.use({ gameEnv: { RECONNECT_MS: "3000" } });

  test("a player who leaves stays until the reconnect window ends, then the last one standing wins without kill points", async ({ browser, game }) => {
    const [a, b] = await pair(browser, game.url);
    await b.ctx.close();
    await a.page.waitForTimeout(1000);
    expect(await find(a.page, b.name), "still on the grid inside the window").toBeTruthy();
    await phase(a, "over");
    await expect(a.page.getByTestId("winner")).toHaveText(a.name);
    await expect(a.page.getByTestId("score")).toHaveText("250");
  });
});

test("everyone leaving during the countdown stops it", async ({ browser, game }) => {
  const a = await join(browser, game.url);
  await phase(a, "countdown");
  await a.ctx.close();
  // Past the countdown (2.5 s) and the reconnect window (2 s): the round never started with A.
  await new Promise((r) => setTimeout(r, 4000));
  const b = await join(browser, game.url);
  await phase(b, "playing");
  const all = await players(b.page);
  expect(all.map((p) => p.name)).not.toContain(a.name);
  expect(all).toHaveLength(2);
  expect(all.filter((p) => p.bot)).toHaveLength(1);
});
