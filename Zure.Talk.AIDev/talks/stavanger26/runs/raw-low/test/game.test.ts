import { describe, it, expect } from 'vitest';
import { Game, cfg } from '../src/game.ts';

function setup(n: number) {
  let t = 1_000_000; const g = new Game(() => t);
  const ps = Array.from({ length: n }, () => g.join());
  g.tick(); t += cfg.countdownMs; g.tick();
  return { g, ps, adv: (ms: number) => { t += ms; } };
}

describe('game', () => {
  it('adds a bot when alone', () => {
    const { g } = setup(1);
    expect(g.phase).toBe('playing');
    expect(g.living().filter(p => p.bot)).toHaveLength(1);
  });
  it('no bot with two players, attacks hurt neighbours and kills end round', () => {
    const { g, ps, adv } = setup(2);
    const [a, b] = ps;
    expect(g.living()).toHaveLength(2);
    a.x = 5; a.y = 5; b.x = 6; b.y = 6;
    for (let i = 0; i < 4; i++) { adv(cfg.cooldownMs); g.attack(a.id); }
    expect(b.alive).toBe(false);
    g.tick();
    expect(g.phase).toBe('over');
    expect(g.winner).toBe(a.name);
    expect(a.score).toBe(cfg.killPts + cfg.winPts);
    expect(g.highscores[0]).toEqual({ name: a.name, score: a.score });
  });
  it('cooldown blocks rapid attacks and moves reset it', () => {
    const { g, ps, adv } = setup(2);
    const [a, b] = ps; a.x = 5; a.y = 5; b.x = 5; b.y = 6;
    adv(cfg.cooldownMs); g.attack(a.id); g.attack(a.id);
    expect(b.hp).toBe(cfg.hpMax - cfg.damage);
    adv(cfg.cooldownMs); g.move(a.id, 'up'); g.attack(a.id);
    expect(b.hp).toBe(cfg.hpMax - cfg.damage);
  });
  it('cannot move onto an occupied cell', () => {
    const { g, ps, adv } = setup(2);
    const [a, b] = ps; a.x = 5; a.y = 5; b.x = 6; b.y = 5;
    adv(500); g.move(a.id, 'right');
    expect(a.x).toBe(5);
  });
});
