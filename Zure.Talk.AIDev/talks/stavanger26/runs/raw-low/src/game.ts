export const SIZE = 30;
export const cfg = {
  hpMax: 100,
  damage: 25,
  cooldownMs: 1000,
  moveMs: 100,
  zoneDamage: 10,
  zoneTickMs: 1000,
  killPts: 100,
  survivePts: 10,
  winPts: 250,
  countdownMs: Number(process.env.COUNTDOWN_MS) || 5000,
  zoneIntervalMs: Number(process.env.ZONE_INTERVAL_MS) || 15000,
  resultMs: Number(process.env.RESULT_MS) || 5000,
  reconnectMs: Number(process.env.RECONNECT_MS) || 10000,
};

export type Phase = 'lobby' | 'countdown' | 'playing' | 'over';
export interface Player {
  id: string; name: string; x: number; y: number; hp: number; score: number;
  bot: boolean; alive: boolean; inRound: boolean; connected: boolean;
  lastAttack: number; lastMove: number; goneAt?: number;
}
export interface Hit { target: string; attacker: string; amount: number; at: number }

const ADJ = ['Swift', 'Neon', 'Crimson', 'Wild', 'Iron', 'Shadow', 'Turbo', 'Lucky', 'Frost', 'Blaze'];
const NOUN = ['Fox', 'Viper', 'Falcon', 'Tiger', 'Wolf', 'Otter', 'Raven', 'Shark', 'Lynx', 'Comet'];

export class Game {
  phase: Phase = 'lobby';
  players = new Map<string, Player>();
  zone = { x0: 0, y0: 0, x1: SIZE - 1, y1: SIZE - 1 };
  winner: string | null = null;
  phaseEnds = 0;
  nextShrink = 0;
  nextZoneTick = 0;
  nextSurvive = 0;
  hits: Hit[] = [];
  highscores: { name: string; score: number }[] = [];
  private seq = 0;
  constructor(private now: () => number = Date.now) {}

  newName() {
    for (;;) {
      const n = ADJ[Math.floor(Math.random() * ADJ.length)] + NOUN[Math.floor(Math.random() * NOUN.length)] + Math.floor(Math.random() * 100);
      if (![...this.players.values()].some(p => p.name === n)) return n;
    }
  }

  join(bot = false): Player {
    const p: Player = {
      id: 'p' + ++this.seq, name: bot ? 'Bot' + this.seq : this.newName(), x: 0, y: 0, hp: cfg.hpMax, score: 0,
      bot, alive: false, inRound: false, connected: true, lastAttack: 0, lastMove: 0,
    };
    this.players.set(p.id, p);
    return p;
  }

  disconnect(id: string) {
    const p = this.players.get(id);
    if (!p) return;
    p.connected = false; p.goneAt = this.now();
  }

  reconnect(id: string) {
    const p = this.players.get(id);
    if (!p || p.bot) return undefined;
    p.connected = true; p.goneAt = undefined;
    return p;
  }

  humans() { return [...this.players.values()].filter(p => !p.bot && p.connected); }
  living() { return [...this.players.values()].filter(p => p.inRound && p.alive); }

  move(id: string, dir: string) {
    const p = this.players.get(id);
    if (!p || !p.alive || this.phase !== 'playing') return;
    const t = this.now();
    if (t - p.lastMove < cfg.moveMs) return;
    const d: Record<string, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    const v = d[dir]; if (!v) return;
    const nx = p.x + v[0], ny = p.y + v[1];
    if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) return;
    if (this.living().some(o => o !== p && o.x === nx && o.y === ny)) return;
    p.x = nx; p.y = ny; p.lastMove = t; p.lastAttack = t;
  }

  canAttack(p: Player) { return this.now() - p.lastAttack >= cfg.cooldownMs; }

  attack(id: string) {
    const p = this.players.get(id);
    if (!p || !p.alive || this.phase !== 'playing' || !this.canAttack(p)) return;
    p.lastAttack = this.now();
    for (const o of this.living()) {
      if (o === p || Math.max(Math.abs(o.x - p.x), Math.abs(o.y - p.y)) !== 1) continue;
      this.hurt(o, cfg.damage, p);
    }
  }

  hurt(o: Player, amount: number, by?: Player) {
    o.hp = Math.max(0, o.hp - amount);
    this.hits.push({ target: o.name, attacker: by?.name ?? '', amount, at: this.now() });
    if (o.hp === 0) {
      o.alive = false;
      if (by) this.addScore(by, cfg.killPts);
    }
  }

  addScore(p: Player, n: number) {
    p.score += n;
  }

  startRound() {
    for (const b of [...this.players.values()].filter(p => p.bot)) this.players.delete(b.id);
    if (this.humans().length === 1) this.join(true);
    const t = this.now();
    this.zone = { x0: 0, y0: 0, x1: SIZE - 1, y1: SIZE - 1 };
    this.winner = null;
    const taken = new Set<string>();
    for (const p of this.players.values()) {
      p.inRound = p.connected; p.alive = p.inRound; p.hp = cfg.hpMax; p.score = 0; p.lastAttack = 0;
      if (!p.inRound) continue;
      let x, y;
      do { x = Math.floor(Math.random() * SIZE); y = Math.floor(Math.random() * SIZE); } while (taken.has(x + ',' + y));
      taken.add(x + ',' + y); p.x = x; p.y = y;
    }
    this.phase = 'playing';
    this.nextShrink = t + cfg.zoneIntervalMs;
    this.nextZoneTick = t + cfg.zoneTickMs;
    this.nextSurvive = t + 1000;
  }

  tick() {
    const t = this.now();
    // drop players gone too long
    for (const p of [...this.players.values()]) {
      if (!p.connected && p.goneAt !== undefined && t - p.goneAt >= cfg.reconnectMs) {
        p.alive = false; this.players.delete(p.id);
      }
    }
    const humans = this.humans();
    const bots = [...this.players.values()].filter(p => p.bot);
    if (this.phase === 'lobby') {
      if (humans.length >= 1) { this.phase = 'countdown'; this.phaseEnds = t + cfg.countdownMs; }
    } else if (this.phase === 'countdown') {
      if (humans.length === 0) { this.phase = 'lobby'; for (const b of bots) this.players.delete(b.id); }
      else if (t >= this.phaseEnds) this.startRound();
    } else if (this.phase === 'playing') {
      if (t >= this.nextShrink) {
        this.nextShrink = t + cfg.zoneIntervalMs;
        const z = this.zone;
        if (z.x1 - z.x0 > 1) { z.x0++; z.y0++; z.x1--; z.y1--; }
        for (const p of this.living()) this.addScore(p, cfg.survivePts);
      }
      if (t >= this.nextZoneTick) {
        this.nextZoneTick = t + cfg.zoneTickMs;
        const z = this.zone;
        for (const p of this.living()) if (p.x < z.x0 || p.x > z.x1 || p.y < z.y0 || p.y > z.y1) this.hurt(p, cfg.zoneDamage);
      }
      for (const b of this.living().filter(p => p.bot)) this.botAct(b);
      const alive = this.living();
      if (alive.length <= 1) {
        const w = alive[0];
        if (w) this.addScore(w, cfg.winPts);
        this.winner = w ? w.name : 'none';
        this.phase = 'over'; this.phaseEnds = t + cfg.resultMs;
        for (const p of this.players.values()) if (p.inRound && !p.bot) this.highscores.push({ name: p.name, score: p.score });
        this.highscores.sort((a, b) => b.score - a.score); this.highscores.length = Math.min(10, this.highscores.length);
      }
    } else if (this.phase === 'over' && t >= this.phaseEnds) {
      this.phase = 'lobby';
      for (const p of this.players.values()) { p.inRound = false; p.alive = false; }
    }
    this.hits = this.hits.filter(h => t - h.at < 1500);
  }

  botAct(b: Player) {
    const foes = this.living().filter(p => p !== b);
    if (!foes.length) return;
    const f = foes.reduce((a, c) => (Math.abs(c.x - b.x) + Math.abs(c.y - b.y) < Math.abs(a.x - b.x) + Math.abs(a.y - b.y) ? c : a));
    if (Math.max(Math.abs(f.x - b.x), Math.abs(f.y - b.y)) === 1) { this.attack(b.id); return; }
    if (this.now() - b.lastMove < cfg.moveMs * 4) return;
    const dx = f.x - b.x, dy = f.y - b.y;
    this.move(b.id, Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  }

  view(id: string) {
    const me = this.players.get(id);
    const t = this.now();
    return {
      t, phase: this.phase, winner: this.winner, zone: this.zone,
      me: me && { name: me.name, hp: me.hp, score: me.score, alive: me.alive,
        progress: Math.min(1, (t - me.lastAttack) / cfg.cooldownMs) },
      hpMax: cfg.hpMax,
      players: this.phase === 'playing' || this.phase === 'over'
        ? this.living().map(p => ({ name: p.name, x: p.x, y: p.y, hp: p.hp, bot: p.bot, connected: p.connected })) : [],
      hits: this.hits.map(h => ({ ...h, id: h.target + h.at + h.amount })),
      highscores: this.highscores,
      online: this.humans().map(p => p.name),
    };
  }
}
