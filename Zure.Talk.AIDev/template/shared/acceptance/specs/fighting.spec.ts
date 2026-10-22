import { test, expect, pair, players, find, phase, number, walkTo, approach, attack, room, roomiest, highscores, ready, progress } from "../fixtures";

const KEY = { up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight" } as const;

test("moves stop at the edge of the grid and at other players", async ({ browser, game }) => {
  const [a, b] = await pair(browser, game.url);
  const other = (await find(a.page, b.name))!;
  const me = (await find(a.page, a.name))!;

  // To the left edge, on a row B is not blocking, then try to walk off it.
  const y = other.x === 0 && other.y === me.y ? (me.y > 0 ? me.y - 1 : me.y + 1) : me.y;
  await walkTo(a, { x: 0, y });
  for (let i = 0; i < 3; i++) { await a.page.keyboard.press("ArrowLeft"); await a.page.waitForTimeout(250); }
  expect(await find(a.page, a.name)).toMatchObject({ x: 0, y });

  // Next to B on the same row, then try to walk into B.
  const side = other.x > 0 ? other.x - 1 : other.x + 1;
  await walkTo(a, { x: side, y: other.y });
  await a.page.keyboard.press(side < other.x ? "ArrowRight" : "ArrowLeft");
  await a.page.waitForTimeout(500);
  expect(await find(a.page, a.name)).toMatchObject({ x: side, y: other.y });
  expect(await find(a.page, b.name)).toMatchObject({ x: other.x, y: other.y });
});

test("more than 5 moves a second are dropped, not queued", async ({ browser, game }) => {
  const [a] = await pair(browser, game.url);
  const me = (await find(a.page, a.name))!;
  const r = room(me, await players(a.page));
  const dir = roomiest(r);
  expect(r[dir], "room for the test").toBeGreaterThanOrEqual(12);
  for (let i = 0; i < 20; i++) await a.page.keyboard.press(KEY[dir]);
  await a.page.waitForTimeout(2000);
  const now = (await find(a.page, a.name))!;
  const moved = Math.abs(now.x - me.x) + Math.abs(now.y - me.y);
  expect(moved).toBeGreaterThanOrEqual(1);
  expect(moved, "20 quick presses, 2 seconds later").toBeLessThanOrEqual(10);
});

test("an attack hits the players around you for 25, then waits a second", async ({ browser, game }) => {
  const [a, b] = await pair(browser, game.url);
  await approach(a, b.name);
  await ready(a);
  for (let i = 0; i < 5; i++) await attack(a);
  await expect(b.page.getByTestId("hp")).toHaveText("75");
  await a.page.waitForTimeout(500);
  await expect(b.page.getByTestId("hp")).toHaveText("75");
  expect((await find(a.page, b.name))!.hp).toBe(75);
  await a.page.waitForTimeout(700);
  await attack(a);
  await expect(b.page.getByTestId("hp")).toHaveText("50");
  expect(await number(a.page, "hp"), "the attacker is not hurt").toBe(100);
});

test("a kill ends the round: the winner scores 350 and tops the highscores, and the next round starts fresh", async ({ browser, game }) => {
  const [a, b] = await pair(browser, game.url);
  await approach(a, b.name);
  await ready(a);
  for (let hp = 75; hp >= 0; hp -= 25) {
    await attack(a);
    await expect(b.page.getByTestId("hp")).toHaveText(String(hp));
    if (hp > 0) await a.page.waitForTimeout(1100);
  }
  await phase(a, "over");
  await phase(b, "over");
  await expect(a.page.getByTestId("winner")).toHaveText(a.name);
  await expect(b.page.getByTestId("winner")).toHaveText(a.name);
  await expect(a.page.getByTestId("score")).toHaveText("350");
  await expect(b.page.getByTestId("score")).toHaveText("0");
  expect(await highscores(a.page)).toEqual([{ name: a.name, score: 350 }, { name: b.name, score: 0 }]);

  await phase(a, "playing");
  await expect.poll(async () => (await players(a.page)).map((p) => p.hp)).toEqual([100, 100]);
  await expect(a.page.getByTestId("score")).toHaveText("0");
  // The new round's live entries come after the fixed ones on a tie.
  expect((await highscores(a.page)).slice(0, 2), "kept between rounds").toEqual([{ name: a.name, score: 350 }, { name: b.name, score: 0 }]);
});

test("moving starts the 1 second wait too, and the cooldown bar shows it", async ({ browser, game }) => {
  const [a, b] = await pair(browser, game.url);
  await approach(a, b.name); // ends on a move, about a quarter of a second ago
  const bar = a.page.getByTestId("cooldown");
  await expect(bar, "waiting after a move").toHaveAttribute("data-ready", "false", { timeout: 500 });
  await attack(a);
  await a.page.waitForTimeout(300);
  await expect(b.page.getByTestId("hp"), "an attack right after moving is dropped").toHaveText("100");

  await ready(a);
  expect(await progress(a.page)).toBeGreaterThanOrEqual(0.99);
  await attack(a);
  await expect(b.page.getByTestId("hp")).toHaveText("75");
  await expect(bar, "waiting after an attack").toHaveAttribute("data-ready", "false", { timeout: 500 });
  await a.page.waitForTimeout(450);
  const half = await progress(a.page);
  expect(half, "the bar fills as the wait passes").toBeGreaterThan(0.2);
  expect(half).toBeLessThan(0.95);
  await ready(a, 1500);
});
