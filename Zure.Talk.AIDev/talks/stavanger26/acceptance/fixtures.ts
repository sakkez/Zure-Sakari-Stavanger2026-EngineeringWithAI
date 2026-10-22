import { test as base, expect, type Browser, type BrowserContext, type BrowserContextOptions, type Page } from "@playwright/test";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";

const RUN_DIR = path.resolve(process.env.RUN_DIR ?? ".");

// The referee's speed-ups (AGENTS.md "What the referee needs"). A test overrides them
// with test.use({ gameEnv: { ... } }). The zone stays still unless a test is about it.
const FAST = { COUNTDOWN_MS: "2500", RESULT_MS: "1500", RECONNECT_MS: "2000", ZONE_INTERVAL_MS: "600000" };

type Game = { url: string };
export const test = base.extend<{ gameEnv: Record<string, string>; game: Game }>({
  gameEnv: [{}, { option: true }],
  game: async ({ gameEnv }, use, testInfo) => {
    const port = await freePort();
    const child = spawn("npm start", {
      cwd: RUN_DIR,
      env: { ...process.env, ...FAST, ...gameEnv, PORT: String(port) },
      shell: true,
      detached: process.platform !== "win32",
    });
    let log = "";
    child.stdout.on("data", (d) => (log += d));
    child.stderr.on("data", (d) => (log += d));
    const url = `http://localhost:${port}`;
    try {
      await waitUp(url, 60_000, () => child.exitCode !== null);
      await use({ url });
    } finally {
      if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"]);
      else try { process.kill(-child.pid!, "SIGKILL"); } catch {}
      if (testInfo.status !== testInfo.expectedStatus) await testInfo.attach("server.log", { body: log });
    }
  },
  baseURL: async ({ game }, use) => use(game.url),
});
export { expect };

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer().listen(0, () => {
      const { port } = s.address() as { port: number };
      s.close(() => resolve(port));
    });
    s.on("error", reject);
  });
}

async function waitUp(url: string, ms: number, died: () => boolean) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (died()) throw new Error("npm start exited before the game came up");
    try { await fetch(url); return; } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`the game did not answer on ${url} within ${ms} ms`);
}

// ---- Playing through the browser contract ----

export type Player = { name: string; x: number; y: number; hp: number; bot: boolean };
export type Seat = { ctx: BrowserContext; page: Page; name: string };

export const NAME = /^[A-Z][a-z]+ [A-Z][a-z]+$/;
export const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

/** Open the game in a fresh browser, as a new player, and wait for a name. */
export async function join(browser: Browser, url: string, options: BrowserContextOptions = {}): Promise<Seat> {
  const ctx = await browser.newContext(options);
  const page = await ctx.newPage();
  await page.goto(url);
  await expect(page.getByTestId("me")).toHaveText(/\S/);
  return { ctx, page, name: (await page.getByTestId("me").innerText()).trim() };
}

export async function players(page: Page): Promise<Player[]> {
  return page.locator('[data-testid="player"]').evaluateAll((els) =>
    els.map((e) => {
      const d = (e as HTMLElement).dataset;
      return { name: d.name ?? "", x: Number(d.x), y: Number(d.y), hp: Number(d.hp), bot: d.bot === "true" };
    }),
  );
}

export async function find(page: Page, name: string): Promise<Player | undefined> {
  return (await players(page)).find((p) => p.name === name);
}

export async function phase(seat: Seat, value: string, timeout = 15_000) {
  await expect(seat.page.getByTestId("phase")).toHaveText(value, { timeout });
}

export async function number(page: Page, testid: string): Promise<number> {
  return Number((await page.getByTestId(testid).innerText()).trim());
}

const KEYS = { up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight" } as const;
export type Dir = keyof typeof KEYS;
const STEP = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] } as const;

/** One move, then wait for the server to show it. Spaced to stay under 5 moves a second. */
async function move(seat: Seat, dir: Dir) {
  const before = await find(seat.page, seat.name);
  await seat.page.keyboard.press(KEYS[dir]);
  await expect
    .poll(async () => { const p = await find(seat.page, seat.name); return p && before && (p.x !== before.x || p.y !== before.y); }, { timeout: 1500, intervals: [50] })
    .toBe(true)
    .catch(() => {}); // a dropped or blocked move: the caller looks again
  await seat.page.waitForTimeout(220);
}

/** Walk until `done` says stop, stepping along the bigger gap to the target first, around other players. */
async function walk(seat: Seat, target: () => Promise<{ x: number; y: number }>, done: (me: Player, t: { x: number; y: number }) => boolean) {
  for (let i = 0; i < 120; i++) {
    const me = await find(seat.page, seat.name);
    if (!me) throw new Error(`${seat.name} is not on the grid`);
    const t = await target();
    if (done(me, t)) return;
    const others = (await players(seat.page)).filter((p) => p.name !== seat.name);
    const free = (d: Dir) => {
      const [sx, sy] = STEP[d];
      return !others.some((o) => o.x === me.x + sx && o.y === me.y + sy);
    };
    const gaps: [Dir, number][] = [
      [t.x > me.x ? "right" : "left", Math.abs(t.x - me.x)],
      [t.y > me.y ? "down" : "up", Math.abs(t.y - me.y)],
    ];
    const toward = gaps.filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).map(([d]) => d);
    const dir = toward.find(free) ?? (["up", "down", "left", "right"] as Dir[]).find(free);
    if (dir) await move(seat, dir);
  }
  throw new Error(`${seat.name} could not get there`);
}

export const walkTo = (seat: Seat, cell: { x: number; y: number }) =>
  walk(seat, async () => cell, (me, t) => me.x === t.x && me.y === t.y);

/** Walk until standing in one of the 8 cells around `name`. */
export const approach = (seat: Seat, name: string) =>
  walk(seat, async () => {
    const o = await find(seat.page, name);
    if (!o) throw new Error(`${name} is not on the grid`);
    return o;
  }, (me, t) => dist(me, t) <= 1);

export async function attack(seat: Seat) {
  await seat.page.keyboard.press("Space");
}

/** Free cells from `me` to the edge in each direction, stopping at other players. */
export function room(me: Player, others: Player[]): Record<Dir, number> {
  const out = {} as Record<Dir, number>;
  for (const d of Object.keys(STEP) as Dir[]) {
    const [sx, sy] = STEP[d];
    let n = 0;
    for (let x = me.x + sx, y = me.y + sy; x >= 0 && y >= 0 && x < 30 && y < 30; x += sx, y += sy, n++) {
      if (others.some((o) => o.x === x && o.y === y)) break;
    }
    out[d] = n;
  }
  return out;
}

export const roomiest = (r: Record<Dir, number>) => (Object.keys(r) as Dir[]).sort((a, b) => r[b] - r[a])[0];

export async function highscores(page: Page) {
  return page.locator('[data-testid="highscore"]').evaluateAll((els) =>
    els.map((e) => ({ name: (e as HTMLElement).dataset.name ?? "", score: Number((e as HTMLElement).dataset.score) })),
  );
}

/** Two players who join together, so they share a round without a bot. */
export async function pair(browser: Browser, url: string): Promise<[Seat, Seat]> {
  const [a, b] = await Promise.all([join(browser, url), join(browser, url)]);
  await Promise.all([phase(a, "playing"), phase(b, "playing")]);
  await expect.poll(async () => (await players(a.page)).length).toBe(2);
  return [a, b];
}

/** Wait until the cooldown bar says this player can attack. */
export async function ready(seat: Seat, timeout = 3000) {
  await expect(seat.page.getByTestId("cooldown")).toHaveAttribute("data-ready", "true", { timeout });
}

export async function progress(page: Page): Promise<number> {
  return Number(await page.getByTestId("cooldown").getAttribute("data-progress"));
}

export type Damage = {
  target: string; amount: number; kind: string; color: string;
  x: number; top: number; block: { x: number; top: number; bottom: number; w: number } | null;
  later: { top: number; opacity: number } | null; // 300 ms on, if still there
  goneBy2500: boolean;
};

/** Record every damage number as it appears: they fade, so reading them later would miss them. */
export async function watchDamage(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __damage: unknown[] };
    w.__damage = [];
    const seen = new WeakSet<Element>();
    const record = (el: HTMLElement) => {
      if (seen.has(el)) return;
      seen.add(el);
      const r = el.getBoundingClientRect();
      const blockEl = document.querySelector(`[data-testid="player"][data-name="${CSS.escape(el.dataset.target ?? "")}"]`);
      const b = blockEl?.getBoundingClientRect();
      const d = {
        target: el.dataset.target, amount: Number(el.dataset.amount), kind: el.dataset.kind, color: getComputedStyle(el).color,
        x: r.left + r.width / 2, top: r.top, block: b ? { x: b.left + b.width / 2, top: b.top, bottom: b.bottom, w: b.width } : null,
        later: null as null | { top: number; opacity: number }, goneBy2500: false,
      };
      w.__damage.push(d);
      setTimeout(() => { if (el.isConnected) d.later = { top: el.getBoundingClientRect().top, opacity: Number(getComputedStyle(el).opacity) }; }, 300);
      setTimeout(() => { d.goneBy2500 = !el.isConnected || Number(getComputedStyle(el).opacity) < 0.1 || getComputedStyle(el).visibility === "hidden"; }, 2500);
    };
    new MutationObserver(() => document.querySelectorAll<HTMLElement>('[data-testid="damage"]').forEach(record))
      .observe(document.body, { childList: true, subtree: true });
  });
}

export async function damages(page: Page): Promise<Damage[]> {
  return page.evaluate(() => (window as unknown as { __damage: Damage[] }).__damage);
}

/** Hue in degrees of a CSS rgb() colour, or -1 for a grey. */
export function hue(color: string): number {
  const [r, g, b] = (color.match(/[\d.]+/g) ?? []).slice(0, 3).map((n) => Number(n) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d < 0.15) return -1;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

/** True when the element is shown and its top lies on screen, with no scrolling or tapping. */
export async function inView(page: Page, testid: string): Promise<boolean> {
  const el = page.getByTestId(testid);
  const box = await el.boundingBox();
  if (!box || !(await el.isVisible())) return false;
  const vp = page.viewportSize()!;
  return box.x >= 0 && box.x + box.width <= vp.width && box.y >= 0 && box.y < vp.height;
}
