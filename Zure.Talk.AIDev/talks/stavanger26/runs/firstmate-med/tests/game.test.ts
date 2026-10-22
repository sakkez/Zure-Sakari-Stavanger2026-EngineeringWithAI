import { describe, it, expect } from 'vitest';
import { Game } from '../src/game.ts';

const cfg = { countdownMs: 100, zoneIntervalMs: 1000, resultMs: 100, reconnectMs: 500 };

function started(n: number) {
  const g = new Game(cfg);
  const ps = Array.from({ length: n }, () => g.join(undefined, 0));
  g.tick(0); // -> countdown
  g.tick(100); // -> playing
  return { g, ps };
}

describe('game rules', () => {
  it('starts countdown with one player and adds a bot', () => {
    const { g } = started(1);
    expect(g.phase).toBe('playing');
    expect(g.living().filter((p) => p.bot).length).toBe(1);
  });

  it('no bot with two players', () => {
    const { g } = started(2);
    expect(g.living().length).toBe(2);
    expect(g.living().some((p) => p.bot)).toBe(false);
  });

  it('attack hits all 8 neighbours for 25 with 1s cooldown', () => {
    const { g, ps } = started(2);
    const [a, b] = ps;
    a.x = 5; a.y = 5; b.x = 6; b.y = 6;
    g.attack(a.id, 200);
    expect(b.hp).toBe(75);
    g.attack(a.id, 700);
    expect(b.hp).toBe(75);
    g.attack(a.id, 1200);
    expect(b.hp).toBe(50);
  });

  it('kill gives 100 and win 250, highscore recorded', () => {
    const { g, ps } = started(2);
    const [a, b] = ps;
    a.x = 5; a.y = 5; b.x = 5; b.y = 6; b.hp = 25;
    g.attack(a.id, 200);
    expect(g.phase).toBe('over');
    expect(g.winner).toBe(a.name);
    expect(a.score).toBe(350);
    expect(g.highscores[0]).toMatchObject({ name: a.name, score: 350 });
  });

  it('cannot move into an occupied cell', () => {
    const { g, ps } = started(2);
    const [a, b] = ps;
    a.x = 5; a.y = 5; b.x = 6; b.y = 5;
    g.move(a.id, 1, 0);
    expect(a.x).toBe(5);
    g.move(a.id, 0, 1);
    expect(a.y).toBe(6);
  });

  it('zone shrinks, scores +10, damages outside players 10/s', () => {
    const { g, ps } = started(2);
    const [a, b] = ps;
    a.x = 0; a.y = 0; b.x = 10; b.y = 10;
    g.tick(1100); // zone damage + shrink
    expect(g.zone).toEqual({ x0: 1, y0: 1, x1: 28, y1: 28 });
    expect(a.score).toBe(10);
    g.tick(2100);
    expect(a.hp).toBe(90);
    expect(b.hp).toBe(100);
  });

  it('simultaneous death means no winner', () => {
    const { g, ps } = started(2);
    const [a, b] = ps;
    a.x = 0; a.y = 0; b.x = 29; b.y = 29; a.hp = 10; b.hp = 10;
    g.zone = { x0: 5, y0: 5, x1: 20, y1: 20 };
    g.tick(1100);
    expect(g.phase).toBe('over');
    expect(g.winner).toBeNull();
  });

  it('reconnect keeps the player; expiry eliminates without kill', () => {
    const { g, ps } = started(3);
    const [a] = ps;
    g.disconnect(a.id, 200);
    const again = g.join(a.token, 300);
    expect(again).toBe(a);
    g.disconnect(a.id, 400);
    g.tick(950);
    expect(g.players.has(a.id)).toBe(false);
    expect(g.living().length).toBe(2);
  });

  it('bot steps toward the player along the bigger gap', () => {
    const { g, ps } = started(1);
    const bot = g.living().find((p) => p.bot)!;
    const [a] = ps;
    a.x = 10; a.y = 10; bot.x = 15; bot.y = 12;
    bot.nextBotStep = 0;
    g.tick(150);
    expect([bot.x, bot.y]).toEqual([14, 12]);
  });
});
