import { describe, it, expect } from "vitest";
import { Game, type Config, type Fighter } from "../src/game.ts";

const cfg: Config = { countdownMs: 1000, zoneIntervalMs: 15000, resultMs: 1000, reconnectMs: 2000 };

function startTwo() {
  const g = new Game(cfg);
  const a = g.connect(undefined, 0);
  const b = g.connect(undefined, 0);
  g.tick(1000);
  return { g, a, b, fa: g.fighterOf(a.token)!, fb: g.fighterOf(b.token)! };
}

function place(f: Fighter, x: number, y: number) {
  f.x = x;
  f.y = y;
}

describe("game", () => {
  it("counts down then starts a round with both players and no bot", () => {
    const { g } = startTwo();
    expect(g.phase).toBe("playing");
    expect(g.fighters.length).toBe(2);
    expect(g.fighters.some((f) => f.bot)).toBe(false);
  });

  it("adds a bot for a lone player", () => {
    const g = new Game(cfg);
    g.connect(undefined, 0);
    g.tick(1000);
    expect(g.fighters.length).toBe(2);
    expect(g.fighters.filter((f) => f.bot).length).toBe(1);
  });

  it("names are Adjective Animal and unique", () => {
    const g = new Game(cfg);
    const names = new Set<string>();
    for (let i = 0; i < 50; i++) names.add(g.connect(undefined, 0).name);
    expect(names.size).toBe(50);
    for (const n of names) expect(n).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
  });

  it("spawns players at least 3 apart", () => {
    const { fa, fb } = startTwo();
    expect(Math.max(Math.abs(fa.x - fb.x), Math.abs(fa.y - fb.y))).toBeGreaterThanOrEqual(3);
  });

  it("moves one cell, blocks walls, occupied cells and more than 5 moves a second", () => {
    const { g, a, fa, fb } = startTwo();
    place(fa, 0, 0);
    place(fb, 1, 0);
    expect(g.move(a.token, "left", 2000)).toBe(false);
    expect(g.move(a.token, "right", 2000)).toBe(false);
    expect(g.move(a.token, "down", 2000)).toBe(true);
    expect([fa.x, fa.y]).toEqual([0, 1]);
    for (let i = 0; i < 4; i++) g.move(a.token, i % 2 ? "up" : "down", 2001 + i);
    expect(g.move(a.token, "down", 2010)).toBe(false);
    expect(g.move(a.token, "down", 3001)).toBe(true);
  });

  it("attack hits all 8 neighbours for 25 with a 1s cooldown", () => {
    const { g, a, fa, fb } = startTwo();
    place(fa, 5, 5);
    place(fb, 6, 6);
    expect(g.attack(a.token, 2000)).toBe(true);
    expect(fb.hp).toBe(75);
    expect(g.attack(a.token, 2500)).toBe(false);
    expect(g.attack(a.token, 3000)).toBe(true);
    expect(fb.hp).toBe(50);
  });

  it("a kill gives 100, the win 250, and goes to over with the winner", () => {
    const { g, a, fa, fb } = startTwo();
    place(fa, 5, 5);
    place(fb, 5, 6);
    for (let i = 0; i < 4; i++) g.attack(a.token, 2000 + i * 1000);
    expect(fb.alive).toBe(false);
    expect(g.phase).toBe("over");
    expect(g.winner).toBe(fa.name);
    expect(fa.score).toBe(350);
    expect(g.highscores[0]).toEqual({ name: fa.name, score: 350 });
  });

  it("zone shrinks by one per side, pays survivors 10 and hurts outside 10/s", () => {
    const { g, fa, fb } = startTwo();
    place(fa, 0, 0);
    place(fb, 15, 15);
    for (let t = 1000; t <= 16000; t += 100) g.tick(t);
    expect(g.zone).toEqual({ x0: 1, y0: 1, x1: 28, y1: 28 });
    expect(fa.score).toBe(10);
    expect(fb.score).toBe(10);
    g.tick(1000 + 16000);
    expect(fa.hp).toBeLessThan(100);
    expect(fb.hp).toBe(100);
  });

  it("zone stops at 13..16", () => {
    const { g, fa, fb } = startTwo();
    place(fa, 14, 14);
    place(fb, 15, 16);
    g.tick(1000 + 15000 * 20);
    expect(g.zone).toEqual({ x0: 13, y0: 13, x1: 16, y1: 16 });
  });

  it("simultaneous last deaths mean no winner", () => {
    const { g, fa, fb } = startTwo();
    place(fa, 0, 0);
    place(fb, 29, 29);
    fa.hp = 10;
    fb.hp = 10;
    g.tick(1000 + 15000);
    expect(g.phase).toBe("over");
    expect(g.winner).toBeNull();
  });

  it("disconnected players stay, and are eliminated after the reconnect window", () => {
    const { g, a, b, fb } = startTwo();
    g.disconnect(b.token, 2000);
    expect(fb.alive).toBe(true);
    const back = g.connect(b.token, 3000);
    expect(back.name).toBe(b.name);
    g.disconnect(b.token, 3000);
    g.tick(5000);
    expect(fb.alive).toBe(false);
    expect(g.phase).toBe("over");
    expect(g.winner).toBe(g.fighterOf(a.token)!.name);
  });

  it("mid-round joiners wait for the next round", () => {
    const { g } = startTwo();
    const c = g.connect(undefined, 2000);
    expect(g.fighterOf(c.token)).toBeUndefined();
  });

  it("bot steps towards the player and attacks when adjacent", () => {
    const g = new Game(cfg);
    const a = g.connect(undefined, 0);
    g.tick(1000);
    const me = g.fighterOf(a.token)!;
    const bot = g.fighters.find((f) => f.bot)!;
    place(me, 10, 10);
    place(bot, 15, 11);
    bot.nextStepAt = 0;
    g.tick(1100);
    expect([bot.x, bot.y]).toEqual([14, 11]);
    place(bot, 11, 11);
    g.tick(1200);
    expect(me.hp).toBe(75);
  });
});
