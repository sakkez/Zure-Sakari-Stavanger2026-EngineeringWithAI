import { test, expect, join, players, find, phase, number, dist, attack, highscores } from "../fixtures";

// The bot walks up to a player who stands still: at most 29 steps at 2 a second.
const WALK = { timeout: 25_000, intervals: [50] };

async function loneRound(browser: Parameters<typeof join>[0], url: string) {
  const a = await join(browser, url);
  await phase(a, "playing");
  const bot = (await players(a.page)).find((p) => p.bot)!;
  expect(bot, "a bot joins a lone player").toBeTruthy();
  return { a, bot };
}

test("the bot walks up to you, waits a second after its last step, then hits for 25 once a second", async ({ browser, game }) => {
  const { a, bot } = await loneRound(browser, game.url);
  // Watch it come: when it last moved, and when the first hit landed.
  let pos = await find(a.page, bot.name), movedAt = Date.now(), hitAt = 0;
  for (const until = Date.now() + 25_000; Date.now() < until && !hitAt;) {
    const b = await find(a.page, bot.name);
    if (b && pos && (b.x !== pos.x || b.y !== pos.y)) { pos = b; movedAt = Date.now(); }
    if ((await number(a.page, "hp")) < 100) hitAt = Date.now();
    else await a.page.waitForTimeout(40);
  }
  expect(hitAt, "the bot hit you").toBeGreaterThan(0);
  expect(await number(a.page, "hp"), "a hit is 25").toBe(75);
  expect(hitAt - movedAt, "a second's wait after its last step").toBeGreaterThanOrEqual(850);

  const me = await find(a.page, a.name), where = await find(a.page, bot.name);
  expect(dist(me!, where!), "hit from a neighbouring cell").toBeLessThanOrEqual(1);
  await a.page.waitForTimeout(600);
  expect(await number(a.page, "hp"), "no second hit within a second").toBe(75);
  expect(await find(a.page, bot.name), "it stands still while attacking").toEqual(where);
  await expect(a.page.getByTestId("hp")).toHaveText("50", { timeout: 1500 });
});

test("killing the bot is worth 100, and bots never enter the highscores", async ({ browser, game }) => {
  const { a, bot } = await loneRound(browser, game.url);
  expect(bot.hp, "a bot starts with 100 like everyone").toBe(100);
  await expect
    .poll(async () => { const me = await find(a.page, a.name), b = await find(a.page, bot.name); return me && b && dist(me, b); }, WALK)
    .toBeLessThanOrEqual(1);
  // You stood still, so you are ready; it just moved, so it waits a second. Press as fast as
  // the cooldown allows: presses during the wait are dropped, so pressing often is the rule.
  for (let i = 0; i < 150 && (await find(a.page, bot.name)); i++) {
    await attack(a);
    await a.page.waitForTimeout(40);
  }
  await phase(a, "over");
  await expect(a.page.getByTestId("winner")).toHaveText(a.name);
  await expect(a.page.getByTestId("score")).toHaveText("350");
  expect(await highscores(a.page)).toEqual([{ name: a.name, score: 350 }]);
});
