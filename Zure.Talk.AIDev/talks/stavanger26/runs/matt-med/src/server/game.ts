import type { DamageEvent, Dir, HighscoreEntry, MeView, Phase, Snapshot, Zone } from '../shared/types.js';
import { generateName } from './names.js';

export const GRID = 30;
export const HP_MAX = 100;
export const ATTACK_DAMAGE = 25;
export const COOLDOWN_MS = 1000;
export const MAX_MOVES_PER_SEC = 5;
export const ZONE_DAMAGE = 10;
export const ZONE_TICK_MS = 1000;
export const ZONE_MIN = 13; // final zone is 13..16
export const BOT_STEP_MS = 500;
export const KILL_POINTS = 100;
export const SHRINK_POINTS = 10;
export const WIN_POINTS = 250;
export const DAMAGE_TTL_MS = 1200;
export const HIGHSCORE_SIZE = 10;

export interface GameConfig {
  countdownMs: number;
  zoneIntervalMs: number;
  resultMs: number;
  reconnectMs: number;
}

export function configFromEnv(env: Record<string, string | undefined>): GameConfig {
  const num = (k: string, d: number) => {
    const v = Number(env[k]);
    return env[k] !== undefined && env[k] !== '' && Number.isFinite(v) && v >= 0 ? v : d;
  };
  return {
    countdownMs: num('COUNTDOWN_MS', 5000),
    zoneIntervalMs: num('ZONE_INTERVAL_MS', 15000),
    resultMs: num('RESULT_MS', 5000),
    reconnectMs: num('RECONNECT_MS', 10000),
  };
}

/** A unit on the grid during a round: a human player or a bot. */
interface Unit {
  id: string;
  name: string;
  bot: boolean;
  x: number;
  y: number;
  hp: number;
  alive: boolean;
  cooldownStart: number;
  cooldownEnd: number;
  moveTimes: number[];
  nextBotStep: number;
}

interface Human {
  id: string;
  token: string;
  name: string;
  connected: boolean;
  disconnectedAt: number | null;
  score: number;
}

interface FixedScore extends HighscoreEntry {
  at: number;
  seq: number;
}

const FULL_ZONE: Zone = { x0: 0, y0: 0, x1: GRID - 1, y1: GRID - 1 };

export class Game {
  phase: Phase = 'lobby';
  phaseEndsAt: number | null = null;
  winner: string | null = null;
  zone: Zone = { ...FULL_ZONE };
  humans = new Map<string, Human>();
  units = new Map<string, Unit>();
  private damage: DamageEvent[] = [];
  private fixedScores: FixedScore[] = [];
  private seq = 0;
  private nextShrinkAt = 0;
  private nextZoneTickAt = 0;
  private idCounter = 0;

  constructor(
    public cfg: GameConfig,
    private rnd: () => number = Math.random,
  ) {}

  private newId(prefix: string) {
    return `${prefix}${++this.idCounter}`;
  }

  private takenNames(): Set<string> {
    const s = new Set<string>();
    for (const h of this.humans.values()) s.add(h.name);
    for (const u of this.units.values()) s.add(u.name);
    return s;
  }

  /** Connect a client. Reuses the human for a known token, otherwise creates one. */
  connect(token: string | undefined, now: number): Human {
    if (token) {
      for (const h of this.humans.values()) {
        if (h.token === token) {
          h.connected = true;
          h.disconnectedAt = null;
          return h;
        }
      }
    }
    const id = this.newId('p');
    const h: Human = {
      id,
      token: token || id + '-' + Math.floor(this.rnd() * 1e9).toString(36),
      name: generateName(this.takenNames(), this.rnd),
      connected: true,
      disconnectedAt: null,
      score: 0,
    };
    this.humans.set(id, h);
    this.tick(now);
    return h;
  }

  disconnect(id: string, now: number) {
    const h = this.humans.get(id);
    if (!h) return;
    h.connected = false;
    h.disconnectedAt = now;
    this.tick(now);
  }

  private removeHuman(id: string, now: number) {
    this.humans.delete(id);
    const u = this.units.get(id);
    if (u && u.alive && this.phase === 'playing') this.kill(u, null, now);
    this.units.delete(id);
  }

  move(id: string, dir: Dir, now: number) {
    if (this.phase !== 'playing') return;
    const u = this.units.get(id);
    if (!u || !u.alive) return;
    this.tryMove(u, dir, now);
  }

  private tryMove(u: Unit, dir: Dir, now: number): boolean {
    u.moveTimes = u.moveTimes.filter((t) => now - t < 1000);
    if (u.moveTimes.length >= MAX_MOVES_PER_SEC) return false;
    const [dx, dy] = dir === 'up' ? [0, -1] : dir === 'down' ? [0, 1] : dir === 'left' ? [-1, 0] : [1, 0];
    const nx = u.x + dx;
    const ny = u.y + dy;
    if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) return false;
    if (this.occupied(nx, ny)) return false;
    u.x = nx;
    u.y = ny;
    u.moveTimes.push(now);
    u.cooldownStart = now;
    u.cooldownEnd = now + COOLDOWN_MS;
    return true;
  }

  private occupied(x: number, y: number) {
    for (const u of this.units.values()) if (u.alive && u.x === x && u.y === y) return true;
    return false;
  }

  attack(id: string, now: number) {
    if (this.phase !== 'playing') return;
    const u = this.units.get(id);
    if (!u || !u.alive) return;
    this.doAttack(u, now);
  }

  private doAttack(u: Unit, now: number) {
    if (now < u.cooldownEnd) return;
    u.cooldownStart = now;
    u.cooldownEnd = now + COOLDOWN_MS;
    for (const t of this.units.values()) {
      if (t === u || !t.alive) continue;
      if (Math.max(Math.abs(t.x - u.x), Math.abs(t.y - u.y)) !== 1) continue;
      this.hurt(t, ATTACK_DAMAGE, u, now);
    }
    this.checkRoundEnd(now);
  }

  private hurt(t: Unit, amount: number, by: Unit | null, now: number) {
    const dealt = Math.min(amount, t.hp);
    t.hp -= dealt;
    this.damage.push({ id: ++this.seq, target: t.name, attacker: by?.name ?? null, amount: dealt, x: t.x, y: t.y, at: now } as DamageEvent & { at: number });
    if (t.hp <= 0) this.kill(t, by, now);
  }

  private kill(t: Unit, by: Unit | null, _now: number) {
    t.hp = 0;
    t.alive = false;
    if (by && !by.bot) {
      const h = this.humans.get(by.id);
      if (h) h.score += KILL_POINTS;
    }
  }

  tick(now: number) {
    // Drop humans whose reconnect grace ran out.
    for (const h of [...this.humans.values()]) {
      if (!h.connected && h.disconnectedAt !== null && now - h.disconnectedAt >= this.cfg.reconnectMs) {
        this.removeHuman(h.id, now);
      }
    }
    this.damage = this.damage.filter((d) => now - (d as DamageEvent & { at: number }).at < DAMAGE_TTL_MS);

    const connected = this.humans.size; // disconnected humans still count during their grace period
    switch (this.phase) {
      case 'lobby':
        if (connected > 0) this.setPhase('countdown', now + this.cfg.countdownMs);
        break;
      case 'countdown':
        if (connected === 0) this.setPhase('lobby', null);
        else if (now >= this.phaseEndsAt!) this.startRound(now);
        break;
      case 'playing':
        this.tickPlaying(now);
        break;
      case 'over':
        if (now >= this.phaseEndsAt!) {
          this.units.clear();
          this.winner = null;
          this.setPhase('lobby', null);
          this.tick(now);
        }
        break;
    }
  }

  private setPhase(p: Phase, endsAt: number | null) {
    this.phase = p;
    this.phaseEndsAt = endsAt;
  }

  private startRound(now: number) {
    this.units.clear();
    this.damage = [];
    this.zone = { ...FULL_ZONE };
    this.winner = null;
    const players = [...this.humans.values()];
    for (const h of players) {
      h.score = 0;
      this.spawn(h.id, h.name, false, now);
    }
    if (players.length === 1) {
      this.spawn(this.newId('b'), generateName(this.takenNames(), this.rnd), true, now);
    }
    this.nextShrinkAt = now + this.cfg.zoneIntervalMs;
    this.nextZoneTickAt = now + ZONE_TICK_MS;
    this.setPhase('playing', null);
  }

  private spawn(id: string, name: string, bot: boolean, now: number) {
    let x = 0;
    let y = 0;
    for (let i = 0; i < 1000; i++) {
      x = Math.floor(this.rnd() * GRID);
      y = Math.floor(this.rnd() * GRID);
      if (!this.occupied(x, y)) break;
    }
    this.units.set(id, {
      id, name, bot, x, y, hp: HP_MAX, alive: true,
      cooldownStart: now - COOLDOWN_MS, cooldownEnd: now, moveTimes: [], nextBotStep: now + BOT_STEP_MS,
    });
  }

  private tickPlaying(now: number) {
    while (now >= this.nextShrinkAt && this.zone.x0 < ZONE_MIN) {
      this.zone = { x0: this.zone.x0 + 1, y0: this.zone.y0 + 1, x1: this.zone.x1 - 1, y1: this.zone.y1 - 1 };
      this.nextShrinkAt += this.cfg.zoneIntervalMs;
      for (const u of this.units.values()) {
        if (u.alive && !u.bot) {
          const h = this.humans.get(u.id);
          if (h) h.score += SHRINK_POINTS;
        }
      }
    }
    while (now >= this.nextZoneTickAt) {
      this.nextZoneTickAt += ZONE_TICK_MS;
      for (const u of this.units.values()) {
        if (u.alive && !this.inZone(u.x, u.y)) this.hurt(u, ZONE_DAMAGE, null, now);
      }
    }
    for (const u of this.units.values()) if (u.bot && u.alive && now >= u.nextBotStep) this.botStep(u, now);
    this.checkRoundEnd(now);
  }

  private inZone(x: number, y: number) {
    const z = this.zone;
    return x >= z.x0 && x <= z.x1 && y >= z.y0 && y <= z.y1;
  }

  private botStep(b: Unit, now: number) {
    b.nextBotStep = now + BOT_STEP_MS;
    let tx: number;
    let ty: number;
    if (!this.inZone(b.x, b.y)) {
      tx = (this.zone.x0 + this.zone.x1) / 2;
      ty = (this.zone.y0 + this.zone.y1) / 2;
    } else {
      const others = [...this.units.values()].filter((u) => u !== b && u.alive && !u.bot);
      if (others.length === 0) return;
      const adjacent = others.some((o) => Math.max(Math.abs(o.x - b.x), Math.abs(o.y - b.y)) === 1);
      if (adjacent) {
        this.doAttack(b, now);
        return;
      }
      others.sort((p, q) => Math.abs(p.x - b.x) + Math.abs(p.y - b.y) - (Math.abs(q.x - b.x) + Math.abs(q.y - b.y)));
      tx = others[0].x;
      ty = others[0].y;
    }
    const dx = tx - b.x;
    const dy = ty - b.y;
    const hx: Dir | null = dx > 0 ? 'right' : dx < 0 ? 'left' : null;
    const vy: Dir | null = dy > 0 ? 'down' : dy < 0 ? 'up' : null;
    const order = Math.abs(dx) >= Math.abs(dy) ? [hx, vy] : [vy, hx];
    for (const d of order) if (d && this.tryMove(b, d, now)) return;
  }

  /** Bots attack as soon as their wait allows, so check adjacency each tick too. */
  private checkRoundEnd(now: number) {
    if (this.phase !== 'playing') return;
    const alive = [...this.units.values()].filter((u) => u.alive);
    if (alive.length > 1) return;
    const w = alive[0];
    this.winner = w ? w.name : null;
    if (w && !w.bot) {
      const h = this.humans.get(w.id);
      if (h) h.score += WIN_POINTS;
    }
    for (const u of this.units.values()) {
      if (u.bot) continue;
      const h = this.humans.get(u.id);
      if (h) this.fixedScores.push({ name: h.name, score: h.score, at: now, seq: ++this.seq });
    }
    this.fixedScores.sort((a, b) => b.score - a.score || a.seq - b.seq);
    this.fixedScores = this.fixedScores.slice(0, HIGHSCORE_SIZE);
    this.setPhase('over', now + this.cfg.resultMs);
  }

  highscores(): HighscoreEntry[] {
    const list: { name: string; score: number; seq: number }[] = this.fixedScores.map((f) => ({ ...f }));
    if (this.phase === 'playing') {
      let s = this.seq + 1;
      for (const u of this.units.values()) {
        if (u.bot) continue;
        const h = this.humans.get(u.id);
        if (h) list.push({ name: h.name, score: h.score, seq: s++ });
      }
    }
    list.sort((a, b) => b.score - a.score || a.seq - b.seq);
    return list.slice(0, HIGHSCORE_SIZE).map(({ name, score }) => ({ name, score }));
  }

  snapshot(now: number): Snapshot {
    return {
      phase: this.phase,
      phaseEndsAt: this.phaseEndsAt,
      now,
      winner: this.winner,
      zone: { ...this.zone },
      players: [...this.units.values()].map((u) => ({
        id: u.id, name: u.name, x: u.x, y: u.y, hp: u.hp, bot: u.bot, alive: u.alive,
        connected: u.bot ? true : (this.humans.get(u.id)?.connected ?? false),
      })),
      damage: this.damage.map(({ id, target, attacker, amount, x, y }) => ({ id, target, attacker, amount, x, y })),
      highscores: this.highscores(),
      lobby: [...this.humans.values()].filter((h) => h.connected).map((h) => h.name),
    };
  }

  meView(id: string, now: number): MeView | null {
    const h = this.humans.get(id);
    if (!h) return null;
    const u = this.units.get(id);
    return {
      id, name: h.name,
      hp: u ? u.hp : HP_MAX,
      hpMax: HP_MAX,
      score: h.score,
      inRound: !!u,
      alive: !!u && u.alive,
      cooldownStart: u ? u.cooldownStart : now - COOLDOWN_MS,
      cooldownEnd: u ? u.cooldownEnd : now,
    };
  }
}
