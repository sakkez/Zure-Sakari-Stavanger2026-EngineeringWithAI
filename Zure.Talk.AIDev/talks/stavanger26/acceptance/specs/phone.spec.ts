import { test, expect, join, players, find, phase, room, roomiest } from "../fixtures";

const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 };
const STEP = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] } as const;

test("on a phone, the on-screen buttons are on screen and move you", async ({ browser, game }) => {
  const a = await join(browser, game.url, PHONE);
  await phase(a, "playing");
  for (const id of ["up", "down", "left", "right", "attack"]) await expect(a.page.getByTestId(id)).toBeInViewport();
  const me = (await find(a.page, a.name))!;
  const dir = roomiest(room(me, await players(a.page)));
  await a.page.getByTestId(dir).tap();
  const [sx, sy] = STEP[dir];
  // The bot spawns 3 or more cells away and steps twice a second, so the next cell is still free.
  await expect.poll(async () => { const p = await find(a.page, a.name); return p && { x: p.x, y: p.y }; }).toEqual({ x: me.x + sx, y: me.y + sy });
});
