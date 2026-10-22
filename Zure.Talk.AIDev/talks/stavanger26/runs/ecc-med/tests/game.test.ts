import { describe, expect, test } from 'vitest';
import { Game, type Player } from '../src/game.js';

const config = { countdownMs: 1000, zoneIntervalMs: 15000, resultMs: 1000, reconnectMs: 2000 };

function startTwo(): { game: Game; a: Player; b: Player } {
  const game = new Game(config);
  const a = game.join(0, 'a');
  const b = game.join(0, 'b');
  game.tick(1000);
  return { game, a, b };
}

function place(p: Player, x: number, y: number): void {
  p.x = x;
  p.y = y;
}

describe('Game', () => {
  test('first join starts countdown, round starts after COUNTDOWN_MS', () => {
    const game = new Game(config);
    game.join(0, 'a');
    expect(game.phase).toBe('countdown');
    game.tick(999);
    expect(game.phase).toBe('countdown');
    game.tick(1000);
    expect(game.phase).toBe('playing');
  });

  test('a lone player gets one bot', () => {
    const game = new Game(config);
    game.join(0, 'a');
    game.tick(1000);
    const living = game.livingPlayers();
    expect(living).toHaveLength(2);
    expect(living.filter((p) => p.bot)).toHaveLength(1);
  });

  test('two players get no bot and spawn at least 3 apart with unique names', () => {
    const { game, a, b } = startTwo();
    expect(game.livingPlayers().some((p) => p.bot)).toBe(false);
    expect(Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))).toBeGreaterThanOrEqual(3);
    expect(a.name).not.toBe(b.name);
    expect(a.name).toMatch(/^\w+ \w+$/);
  });

  test('moves one cell, blocked by walls and occupied cells, max 5 per second', () => {
    const { game, a, b } = startTwo();
    place(a, 0, 0);
    place(b, 1, 0);
    expect(game.move(1000, a.id, 'left')).toBe(false);
    expect(game.move(1000, a.id, 'right')).toBe(false);
    expect(game.move(1000, a.id, 'down')).toBe(true);
    expect([a.x, a.y]).toEqual([0, 1]);
    for (let i = 0; i < 4; i++) expect(game.move(1001 + i, a.id, i % 2 ? 'up' : 'down')).toBe(true);
    expect(game.move(1010, a.id, 'down')).toBe(false);
    expect(game.move(2001, a.id, 'down')).toBe(true);
  });

  test('attack hits all 8 neighbours for 25 and respects 1s cooldown after attack or move', () => {
    const { game, a, b } = startTwo();
    place(a, 5, 5);
    place(b, 6, 6);
    expect(game.attack(1000, a.id)).toBe(true);
    expect(b.hp).toBe(75);
    expect(game.attack(1500, a.id)).toBe(false);
    expect(game.attack(2000, a.id)).toBe(true);
    expect(b.hp).toBe(50);
    game.move(2100, a.id, 'up');
    expect(game.attack(2500, a.id)).toBe(false);
    const events = game.takeDamageEvents();
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ target: b.name, attackerId: a.id, amount: 25 });
  });

  test('kill gives 100, win gives 250, round goes over then back to countdown', () => {
    const { game, a, b } = startTwo();
    place(a, 5, 5);
    place(b, 5, 6);
    for (let t = 1000; t <= 4000; t += 1000) game.attack(t, a.id);
    expect(b.alive).toBe(false);
    expect(game.phase).toBe('over');
    expect(game.winner).toBe(a.name);
    expect(a.score).toBe(350);
    expect(game.highscores(4000)[0]).toMatchObject({ name: a.name, score: 350 });
    game.tick(5000);
    expect(game.phase).toBe('countdown');
  });

  test('zone shrinks each interval, gives survival points and hurts outside', () => {
    const { game, a, b } = startTwo();
    place(a, 0, 0);
    place(b, 10, 10);
    game.tick(2000);
    expect(a.hp).toBe(100);
    game.tick(16000);
    expect(game.zone).toEqual({ x0: 1, y0: 1, x1: 28, y1: 28 });
    expect(b.score).toBe(10);
    expect(a.hp).toBe(90);
    game.tick(17000);
    expect(a.hp).toBe(80);
    expect(b.hp).toBe(100);
  });

  test('simultaneous zone deaths end with winner none', () => {
    const { game, a, b } = startTwo();
    game.tick(16000);
    place(a, 0, 0);
    place(b, 29, 29);
    a.hp = 10;
    b.hp = 10;
    game.tick(17000);
    expect(game.phase).toBe('over');
    expect(game.winner).toBe('none');
  });

  test('disconnected player stays until RECONNECT_MS, can rejoin with token, then is eliminated', () => {
    const { game, a, b } = startTwo();
    game.disconnect(1000, b.id);
    game.tick(2500);
    expect(game.snapshot(2500).players.find((p) => p.id === b.id)?.connected).toBe(false);
    expect(game.join(2600, 'b').id).toBe(b.id);
    game.disconnect(2700, b.id);
    game.tick(4800);
    expect(game.players.has(b.id)).toBe(false);
    expect(game.phase).toBe('over');
    expect(game.winner).toBe(a.name);
    expect(a.score).toBe(250);
  });

  test('countdown stops when everyone leaves and restarts when a player reconnects', () => {
    const game = new Game(config);
    const a = game.join(0, 'a');
    game.disconnect(100, a.id);
    game.tick(200);
    expect(game.phase).toBe('lobby');
    game.join(300, 'a');
    expect(game.phase).toBe('countdown');
    game.tick(1300);
    expect(game.phase).toBe('playing');
  });

  test('a player who left during countdown does not enter the round', () => {
    const game = new Game(config);
    const a = game.join(0, 'a');
    const b = game.join(0, 'b');
    game.disconnect(500, b.id);
    game.tick(1000);
    expect(a.inRound).toBe(true);
    expect(b.inRound).toBe(false);
    expect(game.livingPlayers().filter((p) => p.bot)).toHaveLength(1);
  });

  test('mid-round joiner spectates and plays next round', () => {
    const { game } = startTwo();
    const c = game.join(1500, 'c');
    expect(c.inRound).toBe(false);
    expect(game.move(1600, c.id, 'up')).toBe(false);
  });

  test('spectator from the last round plays in the next one, without a bot', () => {
    const { game, a, b } = startTwo();
    const c = game.join(1500, 'c');
    place(a, 5, 5);
    place(b, 5, 6);
    for (let t = 2000; t <= 5000; t += 1000) game.attack(t, a.id);
    expect(game.phase).toBe('over');
    game.tick(6000);
    game.tick(7000);
    expect(game.phase).toBe('playing');
    expect(c.inRound).toBe(true);
    expect(game.livingPlayers().some((p) => p.bot)).toBe(false);
  });

  test('dead player leaves the grid, keeps their score and cannot act', () => {
    const game = new Game(config);
    const [a, b, c] = ['a', 'b', 'c'].map((t) => game.join(0, t));
    game.tick(1000);
    place(a, 5, 5);
    place(b, 5, 6);
    place(c, 20, 20);
    b.score = 30;
    for (let t = 1000; t <= 4000; t += 1000) game.attack(t, a.id);
    expect(game.phase).toBe('playing');
    expect(game.snapshot(4000).players.map((p) => p.id)).not.toContain(b.id);
    expect(b.score).toBe(30);
    expect(game.move(4100, b.id, 'up')).toBe(false);
    expect(game.attack(5100, b.id)).toBe(false);
  });

  test('zone deaths give nobody kill points', () => {
    const game = new Game(config);
    const [a, b, c] = ['a', 'b', 'c'].map((t) => game.join(0, t));
    game.tick(1000);
    game.tick(16000);
    place(a, 0, 0);
    place(b, 10, 10);
    place(c, 12, 12);
    a.hp = 10;
    game.tick(17000);
    expect(a.alive).toBe(false);
    expect([b.score, c.score]).toEqual([10, 10]);
  });

  test('zone stops shrinking at 13..16', () => {
    const { game, a, b } = startTwo();
    place(a, 14, 14);
    place(b, 15, 15);
    for (let t = 16000; t <= 16000 + 15000 * 20; t += 15000) game.tick(t);
    expect(game.zone).toEqual({ x0: 13, y0: 13, x1: 16, y1: 16 });
  });

  test('bots never appear on the highscore list', () => {
    const game = new Game(config);
    game.join(0, 'a');
    game.tick(1000);
    expect(game.highscores(1000)).toHaveLength(1);
    expect(game.highscores(1000)[0].name).not.toBe(game.livingPlayers().find((p) => p.bot)?.name);
  });

  test('highscores hold the 10 best, earlier first on a tie, live entries after fixed ones', () => {
    const game = new Game(config);
    const a = game.join(0, 'a');
    const b = game.join(0, 'b');
    for (let round = 0; round < 6; round++) {
      const start = round * 10_000;
      game.tick(start + 1000);
      place(a, 5, 5);
      place(b, 5, 6);
      for (let t = start + 1000; t <= start + 4000; t += 1000) game.attack(t, a.id);
      game.tick(start + 6000);
    }
    const list = game.highscores(70_000);
    expect(list).toHaveLength(10);
    expect(list.slice(0, 6).every((h) => h.name === a.name && h.score === 350)).toBe(true);
    expect(list.slice(6).every((h) => h.name === b.name && h.score === 0)).toBe(true);
    game.tick(70_000);
    expect(game.phase).toBe('playing');
    const live = game.highscores(70_000);
    expect(live.filter((h) => h.score === 0).every((h) => h.name === b.name)).toBe(true);
  });

  test('bot outside the zone steps towards its centre, one step per half second', () => {
    const game = new Game(config);
    const a = game.join(0, 'a');
    game.tick(1000);
    const bot = game.livingPlayers().find((p) => p.bot) as Player;
    game.tick(16000);
    place(a, 29, 29);
    place(bot, 0, 10);
    game.tick(16500);
    expect([bot.x, bot.y]).toEqual([1, 10]);
    game.tick(16600);
    expect([bot.x, bot.y]).toEqual([1, 10]);
  });

  test('bot chases and attacks the lone player', () => {
    const game = new Game(config);
    const a = game.join(0, 'a');
    game.tick(1000);
    const bot = game.livingPlayers().find((p) => p.bot) as Player;
    place(a, 10, 10);
    place(bot, 14, 10);
    for (let t = 1050; t <= 4000; t += 50) game.tick(t);
    expect(Math.max(Math.abs(a.x - bot.x), Math.abs(a.y - bot.y))).toBe(1);
    expect(a.hp).toBeLessThan(100);
  });
});
