// Authoritative game logic. Pure: time is passed in, no I/O.

export const GRID = 30;
export const MAX_HP = 100;
export const ATTACK_DAMAGE = 25;
export const ATTACK_COOLDOWN_MS = 1000;
export const BOT_STEP_MS = 500;
export const ZONE_DAMAGE = 10;
export const ZONE_DAMAGE_MS = 1000;
export const ZONE_MIN = 4;
export const KILL_POINTS = 100;
export const WIN_POINTS = 250;
export const SHRINK_POINTS = 10;

export type Phase = 'lobby' | 'countdown' | 'playing' | 'over';

export interface Config {
  countdownMs: number;
  zoneIntervalMs: number;
  resultMs: number;
  reconnectMs: number;
}

export interface Player {
  id: string;
  token: string;
  name: string;
  bot: boolean;
  x: number;
  y: number;
  hp: number;
  score: number;
  inRound: boolean;
  alive: boolean;
  connected: boolean;
  disconnectedAt: number;
  lastAttack: number;
  nextBotStep: number;
}

export interface Zone { x0: number; y0: number; x1: number; y1: number }
export interface DamageEvent { id: number; attacker: string | null; target: string; amount: number }
export interface HighScore { name: string; score: number; seq: number }

const ADJ = ['Swift', 'Neon', 'Crimson', 'Silent', 'Wild', 'Frosty', 'Lucky', 'Brave', 'Shadow', 'Turbo', 'Cosmic', 'Electric'];
const NOUN = ['Fox', 'Viper', 'Falcon', 'Otter', 'Tiger', 'Raven', 'Wolf', 'Lynx', 'Cobra', 'Panda', 'Shark', 'Badger'];

export class Game {
  players = new Map<string, Player>();
  phase: Phase = 'lobby';
  phaseEndsAt = 0;
  zone: Zone = { x0: 0, y0: 0, x1: GRID - 1, y1: GRID - 1 };
  nextShrink = 0;
  nextZoneDamage = 0;
  winner: string | null = null;
  highscores: HighScore[] = [];
  events: DamageEvent[] = [];
  private seq = 0;
  private eventSeq = 0;
  private idSeq = 0;
  private usedNames = new Set<string>();

  constructor(public cfg: Config, private rand: () => number = Math.random) {}

  private genName(): string {
    for (let i = 0; i < 50; i++) {
      const n = ADJ[Math.floor(this.rand() * ADJ.length)] + NOUN[Math.floor(this.rand() * NOUN.length)] + Math.floor(this.rand() * 100);
      if (!this.usedNames.has(n)) { this.usedNames.add(n); return n; }
    }
    return 'Player' + ++this.idSeq;
  }

  join(token: string | undefined, now: number): Player {
    if (token) {
      for (const p of this.players.values()) {
        if (!p.bot && p.token === token) { p.connected = true; p.disconnectedAt = 0; return p; }
      }
    }
    const id = 'p' + ++this.idSeq;
    const p: Player = {
      id, token: id + '-' + Math.floor(this.rand() * 1e9).toString(36) + now.toString(36),
      name: this.genName(), bot: false, x: 0, y: 0, hp: MAX_HP, score: 0,
      inRound: false, alive: false, connected: true, disconnectedAt: 0, lastAttack: -Infinity, nextBotStep: 0,
    };
    this.players.set(id, p);
    return p;
  }

  disconnect(id: string, now: number) {
    const p = this.players.get(id);
    if (p) { p.connected = false; p.disconnectedAt = now; }
  }

  occupied(x: number, y: number, except?: Player): Player | undefined {
    for (const p of this.players.values()) if (p !== except && p.inRound && p.alive && p.x === x && p.y === y) return p;
    return undefined;
  }

  move(id: string, dx: number, dy: number) {
    const p = this.players.get(id);
    if (!p || this.phase !== 'playing' || !p.inRound || !p.alive) return;
    this.step(p, dx, dy);
  }

  private step(p: Player, dx: number, dy: number): boolean {
    const x = p.x + Math.sign(dx), y = p.y + Math.sign(dy);
    if (x < 0 || y < 0 || x >= GRID || y >= GRID || this.occupied(x, y, p)) return false;
    p.x = x; p.y = y;
    return true;
  }

  attack(id: string, now: number) {
    const p = this.players.get(id);
    if (!p || this.phase !== 'playing' || !p.inRound || !p.alive) return;
    if (now - p.lastAttack < ATTACK_COOLDOWN_MS) return;
    p.lastAttack = now;
    for (const t of this.living()) {
      if (t === p) continue;
      if (Math.abs(t.x - p.x) <= 1 && Math.abs(t.y - p.y) <= 1) {
        this.damage(t, ATTACK_DAMAGE, p);
      }
    }
    this.checkEnd(now);
  }

  private damage(t: Player, amount: number, attacker: Player | null) {
    t.hp = Math.max(0, t.hp - amount);
    this.events.push({ id: ++this.eventSeq, attacker: attacker ? attacker.name : null, target: t.name, amount });
    if (t.hp <= 0) {
      t.alive = false;
      if (attacker) attacker.score += KILL_POINTS;
    }
  }

  living(): Player[] {
    return [...this.players.values()].filter((p) => p.inRound && p.alive);
  }

  cooldownLeft(p: Player, now: number) {
    return Math.max(0, ATTACK_COOLDOWN_MS - (now - p.lastAttack));
  }

  private startRound(now: number) {
    const humans = [...this.players.values()].filter((p) => !p.bot && p.connected);
    if (humans.length === 0) { this.phase = 'lobby'; return; }
    this.zone = { x0: 0, y0: 0, x1: GRID - 1, y1: GRID - 1 };
    this.winner = null;
    this.events = [];
    const participants = [...humans];
    if (humans.length === 1) {
      const id = 'b' + ++this.idSeq;
      const bot: Player = {
        id, token: '', name: 'Bot' + this.genName(), bot: true, x: 0, y: 0, hp: MAX_HP, score: 0,
        inRound: false, alive: false, connected: true, disconnectedAt: 0, lastAttack: -Infinity, nextBotStep: now + BOT_STEP_MS,
      };
      this.players.set(id, bot);
      participants.push(bot);
    }
    for (const p of participants) {
      p.hp = MAX_HP; p.score = 0; p.inRound = true; p.alive = true; p.lastAttack = -Infinity;
      p.x = -1; p.y = -1;
    }
    for (const p of participants) {
      let x = 0, y = 0;
      for (let i = 0; i < 1000; i++) {
        x = 2 + Math.floor(this.rand() * (GRID - 4));
        y = 2 + Math.floor(this.rand() * (GRID - 4));
        if (!this.occupied(x, y, p) && !this.nearOther(x, y, p)) break;
      }
      p.x = x; p.y = y;
    }
    this.phase = 'playing';
    this.nextShrink = now + this.cfg.zoneIntervalMs;
    this.nextZoneDamage = now + ZONE_DAMAGE_MS;
  }

  private nearOther(x: number, y: number, self: Player) {
    return this.living().some((o) => o !== self && o.x >= 0 && Math.abs(o.x - x) <= 2 && Math.abs(o.y - y) <= 2);
  }

  inZone(p: Player) {
    const z = this.zone;
    return p.x >= z.x0 && p.x <= z.x1 && p.y >= z.y0 && p.y <= z.y1;
  }

  private checkEnd(now: number) {
    if (this.phase !== 'playing') return;
    const alive = this.living();
    if (alive.length > 1) return;
    if (alive.length === 1) { this.winner = alive[0].name; alive[0].score += WIN_POINTS; }
    else this.winner = null;
    this.phase = 'over';
    this.phaseEndsAt = now + this.cfg.resultMs;
    for (const p of this.players.values()) {
      if (p.inRound && !p.bot) this.highscores.push({ name: p.name, score: p.score, seq: ++this.seq });
    }
    this.highscores.sort((a, b) => b.score - a.score || a.seq - b.seq);
    this.highscores = this.highscores.slice(0, 10);
  }

  private botAct(b: Player, now: number) {
    if (now < b.nextBotStep) return;
    b.nextBotStep = now + BOT_STEP_MS;
    const others = this.living().filter((o) => o !== b);
    if (others.some((o) => Math.abs(o.x - b.x) <= 1 && Math.abs(o.y - b.y) <= 1)) return; // attacking handled each tick
    let tx: number, ty: number;
    if (!this.inZone(b)) {
      tx = (this.zone.x0 + this.zone.x1) / 2; ty = (this.zone.y0 + this.zone.y1) / 2;
    } else {
      const humans = others.filter((o) => !o.bot);
      const pool = humans.length ? humans : others;
      if (!pool.length) return;
      let best = pool[0], bd = Infinity;
      for (const o of pool) { const d = Math.abs(o.x - b.x) + Math.abs(o.y - b.y); if (d < bd) { bd = d; best = o; } }
      tx = best.x; ty = best.y;
    }
    const gx = tx - b.x, gy = ty - b.y;
    const sx = Math.abs(gx) >= 1 ? Math.sign(gx) : 0, sy = Math.abs(gy) >= 1 ? Math.sign(gy) : 0;
    if (Math.abs(gx) >= Math.abs(gy)) { if (!(sx && this.step(b, sx, 0))) if (sy) this.step(b, 0, sy); }
    else { if (!(sy && this.step(b, 0, sy))) if (sx) this.step(b, sx, 0); }
  }

  tick(now: number) {
    // expire disconnected players
    for (const p of [...this.players.values()]) {
      if (!p.bot && !p.connected && now - p.disconnectedAt >= this.cfg.reconnectMs) {
        this.players.delete(p.id);
        this.usedNames.delete(p.name);
        if (p.inRound && p.alive) { p.alive = false; this.checkEnd(now); }
      }
    }
    const humansPresent = [...this.players.values()].some((p) => !p.bot && p.connected);
    switch (this.phase) {
      case 'lobby':
        if (humansPresent) { this.phase = 'countdown'; this.phaseEndsAt = now + this.cfg.countdownMs; }
        break;
      case 'countdown':
        if (!humansPresent) this.phase = 'lobby';
        else if (now >= this.phaseEndsAt) this.startRound(now);
        break;
      case 'playing': {
        for (const b of this.living().filter((p) => p.bot)) {
          const adj = this.living().some((o) => o !== b && Math.abs(o.x - b.x) <= 1 && Math.abs(o.y - b.y) <= 1);
          if (adj && this.cooldownLeft(b, now) === 0) this.attack(b.id, now);
          if (this.phase !== 'playing') break;
          this.botAct(b, now);
        }
        if (this.phase !== 'playing') break;
        if (now >= this.nextZoneDamage) {
          this.nextZoneDamage += ZONE_DAMAGE_MS;
          for (const p of this.living()) if (!this.inZone(p)) this.damage(p, ZONE_DAMAGE, null);
          this.checkEnd(now);
          if (this.phase !== 'playing') break;
        }
        if (now >= this.nextShrink) {
          this.nextShrink += this.cfg.zoneIntervalMs;
          const z = this.zone;
          if (z.x1 - z.x0 + 1 > ZONE_MIN) {
            this.zone = { x0: z.x0 + 1, y0: z.y0 + 1, x1: z.x1 - 1, y1: z.y1 - 1 };
            for (const p of this.living()) p.score += SHRINK_POINTS;
          }
        }
        break;
      }
      case 'over':
        if (now >= this.phaseEndsAt) {
          for (const p of [...this.players.values()]) {
            if (p.bot) this.players.delete(p.id);
            else { p.inRound = false; p.alive = false; p.hp = MAX_HP; p.score = 0; }
          }
          this.events = [];
          this.winner = null;
          this.zone = { x0: 0, y0: 0, x1: GRID - 1, y1: GRID - 1 };
          this.phase = 'lobby';
          this.tick(now);
        }
        break;
    }
  }

  takeEvents(): DamageEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }
}
