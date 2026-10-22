import { describe, expect, it } from 'vitest';
import { Game } from '../src/server/game.js';

const cfg = { countdownMs: 100, zoneIntervalMs: 1000, resultMs: 100, reconnectMs: 500 };

function seq(values: number[]) {
  let i = 0;
  return () => values[i++ % values.length];
}

function startTwo() {
  // Spawn p1 at (0,0) and p2 at (1,0) via a controlled random source.
  const g = new Game(cfg, seq([0, 0, 0, 0, 0, 0, 1 / 30, 0]));
  const a = g.connect(undefined, 0);
  const b = g.connect(undefined, 0);
  g.tick(100);
  return { g, a, b };
}

describe('Game', () => {
  it('goes lobby -> countdown -> playing', () => {
    const g = new Game(cfg);
    expect(g.phase).toBe('lobby');
    g.connect(undefined, 0);
    expect(g.phase).toBe('countdown');
    g.tick(100);
    expect(g.phase).toBe('playing');
  });

  it('adds one bot when a single player starts a round', () => {
    const g = new Game(cfg);
    g.connect(undefined, 0);
    g.tick(100);
    const units = [...g.units.values()];
    expect(units.length).toBe(2);
    expect(units.filter((u) => u.bot).length).toBe(1);
  });

  it('moves one cell, not into occupied cells or off the grid', () => {
    const { g, a, b } = startTwo();
    const ua = g.units.get(a.id)!;
    const ub = g.units.get(b.id)!;
    expect(ua.x === ub.x && ua.y === ub.y).toBe(false);
    const x = ua.x, y = ua.y;
    g.move(a.id, 'up', 200);
    if (y === 0) expect(ua.y).toBe(0);
    else expect(ua.y).toBe(y - 1);
    expect(ua.x).toBe(x);
  });

  it('limits moves to 5 per second', () => {
    const g = new Game(cfg, seq([0.5, 0.5, 0.1, 0.1]));
    const a = g.connect(undefined, 0);
    g.tick(100);
    const u = g.units.get(a.id)!;
    const x0 = u.x;
    for (let i = 0; i < 8; i++) g.move(a.id, 'right', 200 + i);
    expect(u.x - x0).toBe(5);
  });

  it('attack hits adjacent players for 25, with a 1s cooldown, and kills score 100', () => {
    const { g, a, b } = startTwo();
    const ua = g.units.get(a.id)!;
    const ub = g.units.get(b.id)!;
    ub.x = ua.x + 1; ub.y = ua.y;
    g.attack(a.id, 1000);
    expect(ub.hp).toBe(75);
    g.attack(a.id, 1500);
    expect(ub.hp).toBe(75);
    g.attack(a.id, 2000);
    g.attack(a.id, 3000);
    g.attack(a.id, 4000);
    expect(ub.alive).toBe(false);
    expect(g.phase).toBe('over');
    expect(g.winner).toBe(a.name);
    expect(a.score).toBe(100 + 250);
    expect(g.highscores()[0]).toEqual({ name: a.name, score: 350 });
  });

  it('shrinks the zone and damages players outside it', () => {
    const { g, a } = startTwo();
    const ua = g.units.get(a.id)!;
    ua.x = 0; ua.y = 0;
    g.tick(1100);
    expect(g.zone).toEqual({ x0: 1, y0: 1, x1: 28, y1: 28 });
    expect(ua.hp).toBe(90);
    expect(a.score).toBe(10);
  });

  it('keeps a disconnected player for the grace period, then eliminates them', () => {
    const { g, a, b } = startTwo();
    g.disconnect(b.id, 200);
    expect(g.units.get(b.id)!.alive).toBe(true);
    const again = g.connect(b.token, 300);
    expect(again.id).toBe(b.id);
    g.disconnect(b.id, 400);
    g.tick(950);
    expect(g.phase).toBe('over');
    expect(g.winner).toBe(a.name);
  });
});
