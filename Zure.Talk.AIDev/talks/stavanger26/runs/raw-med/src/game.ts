export const GRID = 30;
export const MAX_HP = 100;
export const ATTACK_DAMAGE = 25;
export const ATTACK_COOLDOWN_MS = 1000;
export const ZONE_DAMAGE = 10;
export const ZONE_DAMAGE_EVERY_MS = 1000;
export const ZONE_MIN = { x0: 13, y0: 13, x1: 16, y1: 16 };
export const MOVES_PER_SECOND = 5;
export const BOT_STEP_MS = 500;
export const KILL_POINTS = 100;
export const SURVIVE_POINTS = 10;
export const WIN_POINTS = 250;
export const HIGHSCORE_SIZE = 10;

export type Phase = "lobby" | "countdown" | "playing" | "over";
export type Dir = "up" | "down" | "left" | "right";

export interface Config {
  countdownMs: number;
  zoneIntervalMs: number;
  resultMs: number;
  reconnectMs: number;
}

export const defaultConfig = (env: Record<string, string | undefined> = {}): Config => {
  const num = (v: string | undefined, d: number) => {
    const n = Number(v);
    return v !== undefined && v !== "" && Number.isFinite(n) && n >= 0 ? n : d;
  };
  return {
    countdownMs: num(env.COUNTDOWN_MS, 5000),
    zoneIntervalMs: num(env.ZONE_INTERVAL_MS, 15000),
    resultMs: num(env.RESULT_MS, 5000),
    reconnectMs: num(env.RECONNECT_MS, 10000),
  };
};

export interface Session {
  token: string;
  name: string;
  connected: boolean;
  disconnectedAt: number;
}

export interface Fighter {
  name: string;
  token: string | null; // null for bots
  bot: boolean;
  x: number;
  y: number;
  hp: number;
  alive: boolean;
  score: number;
  readyAt: number; // when the next attack is allowed
  cooldownStart: number;
  moveTimes: number[];
  nextStepAt: number;
}

export interface Zone {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface HitEvent {
  type: "hit";
  attacker: string | null; // null = zone
  target: string;
  amount: number;
}

export interface HighScore {
  name: string;
  score: number;
}

const ADJ = ["Brave", "Swift", "Fierce", "Sly", "Mighty", "Lucky", "Wild", "Silent", "Bold", "Clever", "Crimson", "Electric", "Neon", "Frosty", "Golden", "Shadow", "Turbo", "Cosmic", "Rapid", "Savage"];
const ANIMALS = ["Otter", "Falcon", "Tiger", "Wolf", "Badger", "Panda", "Cobra", "Lynx", "Raven", "Shark", "Fox", "Bear", "Hawk", "Moose", "Gecko", "Viper", "Bison", "Puma", "Orca", "Yak"];

export class Game {
  cfg: Config;
  rand: () => number;
  sessions = new Map<string, Session>();
  phase: Phase = "lobby";
  phaseEndsAt = 0;
  fighters: Fighter[] = [];
  zone: Zone = { x0: 0, y0: 0, x1: GRID - 1, y1: GRID - 1 };
  nextShrinkAt = 0;
  nextZoneDamageAt = 0;
  winner: string | null = null;
  highscores: HighScore[] = [];
  events: HitEvent[] = [];
  version = 0;
  private tokenSeq = 0;

  constructor(cfg: Config, rand: () => number = Math.random) {
    this.cfg = cfg;
    this.rand = rand;
  }

  private changed() {
    this.version++;
  }

  usedNames(): Set<string> {
    const s = new Set<string>();
    for (const se of this.sessions.values()) s.add(se.name);
    for (const f of this.fighters) s.add(f.name);
    return s;
  }

  genName(): string {
    const used = this.usedNames();
    for (let i = 0; i < 200; i++) {
      const n = `${ADJ[Math.floor(this.rand() * ADJ.length)]} ${ANIMALS[Math.floor(this.rand() * ANIMALS.length)]}`;
      if (!used.has(n)) return n;
    }
    for (const a of ADJ) for (const b of ANIMALS) if (!used.has(`${a} ${b}`)) return `${a} ${b}`;
    let k = 2;
    while (used.has(`Brave Otter ${k}`)) k++;
    return `Brave Otter ${k}`;
  }

  /** Join or rejoin. Returns the session. */
  connect(token: string | undefined, now: number): Session {
    let s = token ? this.sessions.get(token) : undefined;
    if (s) {
      s.connected = true;
    } else {
      const t = `${now.toString(36)}-${(this.tokenSeq++).toString(36)}-${Math.floor(this.rand() * 1e9).toString(36)}`;
      s = { token: t, name: this.genName(), connected: true, disconnectedAt: 0 };
      this.sessions.set(t, s);
    }
    this.changed();
    this.tick(now);
    return s;
  }

  disconnect(token: string, now: number) {
    const s = this.sessions.get(token);
    if (!s) return;
    s.connected = false;
    s.disconnectedAt = now;
    this.changed();
    this.tick(now);
  }

  fighterOf(token: string): Fighter | undefined {
    return this.fighters.find((f) => f.token === token);
  }

  occupied(x: number, y: number, except?: Fighter): boolean {
    return this.fighters.some((f) => f.alive && f !== except && f.x === x && f.y === y);
  }

  move(token: string, dir: Dir, now: number): boolean {
    if (this.phase !== "playing") return false;
    const f = this.fighterOf(token);
    if (!f || !f.alive) return false;
    f.moveTimes = f.moveTimes.filter((t) => now - t < 1000);
    if (f.moveTimes.length >= MOVES_PER_SECOND) return false;
    if (!this.step(f, dir)) return false;
    f.moveTimes.push(now);
    return true;
  }

  private step(f: Fighter, dir: Dir): boolean {
    const dx = dir === "left" ? -1 : dir === "right" ? 1 : 0;
    const dy = dir === "up" ? -1 : dir === "down" ? 1 : 0;
    const nx = f.x + dx;
    const ny = f.y + dy;
    if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) return false;
    if (this.occupied(nx, ny, f)) return false;
    f.x = nx;
    f.y = ny;
    this.changed();
    return true;
  }

  attack(token: string, now: number): boolean {
    if (this.phase !== "playing") return false;
    const f = this.fighterOf(token);
    if (!f || !f.alive) return false;
    return this.doAttack(f, now);
  }

  private doAttack(f: Fighter, now: number): boolean {
    if (now < f.readyAt) return false;
    f.cooldownStart = now;
    f.readyAt = now + ATTACK_COOLDOWN_MS;
    for (const t of this.fighters) {
      if (t === f || !t.alive) continue;
      if (Math.max(Math.abs(t.x - f.x), Math.abs(t.y - f.y)) !== 1) continue;
      this.damage(t, ATTACK_DAMAGE, f);
    }
    this.changed();
    this.checkEnd(now);
    return true;
  }

  private damage(t: Fighter, amount: number, by: Fighter | null) {
    t.hp = Math.max(0, t.hp - amount);
    this.events.push({ type: "hit", attacker: by ? by.name : null, target: t.name, amount });
    if (t.hp <= 0) {
      t.alive = false;
      if (by && !by.bot) by.score += KILL_POINTS;
    }
  }

  private checkEnd(now: number) {
    if (this.phase !== "playing") return;
    const alive = this.fighters.filter((f) => f.alive);
    if (alive.length > 1) return;
    const w = alive[0];
    this.winner = w ? w.name : null;
    if (w && !w.bot) w.score += WIN_POINTS;
    for (const f of this.fighters) {
      if (f.bot) continue;
      this.highscores.push({ name: f.name, score: f.score });
    }
    // stable sort keeps the earlier entry first on ties
    this.highscores.sort((a, b) => b.score - a.score);
    this.highscores = this.highscores.slice(0, HIGHSCORE_SIZE);
    this.phase = "over";
    this.phaseEndsAt = now + this.cfg.resultMs;
    this.changed();
  }

  private spawnCell(): { x: number; y: number } {
    const free: { x: number; y: number }[] = [];
    const far: { x: number; y: number }[] = [];
    for (let y = 0; y < GRID; y++)
      for (let x = 0; x < GRID; x++) {
        if (this.occupied(x, y)) continue;
        free.push({ x, y });
        if (this.fighters.every((f) => !f.alive || Math.max(Math.abs(f.x - x), Math.abs(f.y - y)) >= 3)) far.push({ x, y });
      }
    const pool = far.length ? far : free;
    return pool[Math.floor(this.rand() * pool.length)];
  }

  private addFighter(name: string, token: string | null, now: number) {
    const f: Fighter = {
      name, token, bot: token === null, x: 0, y: 0, hp: MAX_HP, alive: true, score: 0,
      readyAt: now, cooldownStart: now - ATTACK_COOLDOWN_MS, moveTimes: [], nextStepAt: now + BOT_STEP_MS,
    };
    // place before pushing so occupied() ignores it
    const c = this.spawnCell();
    f.x = c.x;
    f.y = c.y;
    this.fighters.push(f);
  }

  private startRound(now: number) {
    this.fighters = [];
    this.winner = null;
    this.zone = { x0: 0, y0: 0, x1: GRID - 1, y1: GRID - 1 };
    for (const s of this.sessions.values()) this.addFighter(s.name, s.token, now);
    if (this.fighters.length === 1) this.addFighter(this.genName(), null, now);
    this.phase = "playing";
    this.nextShrinkAt = now + this.cfg.zoneIntervalMs;
    this.nextZoneDamageAt = now + ZONE_DAMAGE_EVERY_MS;
    this.changed();
  }

  inZone(f: Fighter): boolean {
    const z = this.zone;
    return f.x >= z.x0 && f.x <= z.x1 && f.y >= z.y0 && f.y <= z.y1;
  }

  private botThink(b: Fighter, now: number) {
    const humans = this.fighters.filter((f) => f.alive && !f.bot);
    const adjacent = humans.some((h) => Math.max(Math.abs(h.x - b.x), Math.abs(h.y - b.y)) === 1);
    if (adjacent) {
      if (now >= b.readyAt) this.doAttack(b, now);
      return;
    }
    if (now < b.nextStepAt) return;
    b.nextStepAt = now + BOT_STEP_MS;
    let tx: number, ty: number;
    if (!this.inZone(b)) {
      tx = (this.zone.x0 + this.zone.x1) / 2;
      ty = (this.zone.y0 + this.zone.y1) / 2;
    } else {
      let best: Fighter | undefined;
      let bd = Infinity;
      for (const h of humans) {
        const d = Math.abs(h.x - b.x) + Math.abs(h.y - b.y);
        if (d < bd) { bd = d; best = h; }
      }
      if (!best) return;
      tx = best.x;
      ty = best.y;
    }
    const gx = tx - b.x;
    const gy = ty - b.y;
    const hDir: Dir | null = Math.abs(gx) >= 0.5 ? (gx > 0 ? "right" : "left") : null;
    const vDir: Dir | null = Math.abs(gy) >= 0.5 ? (gy > 0 ? "down" : "up") : null;
    const order = Math.abs(gx) >= Math.abs(gy) ? [hDir, vDir] : [vDir, hDir];
    for (const d of order) if (d && this.step(b, d)) return;
  }

  tick(now: number) {
    // expire disconnected sessions
    for (const s of [...this.sessions.values()]) {
      if (!s.connected && now - s.disconnectedAt >= this.cfg.reconnectMs) {
        this.sessions.delete(s.token);
        const f = this.fighterOf(s.token);
        if (f && this.phase === "playing" && f.alive) {
          f.alive = false;
          this.changed();
        }
        this.changed();
      }
    }
    if (this.phase === "playing") this.checkEnd(now);

    const connected = [...this.sessions.values()].filter((s) => s.connected).length;
    if (this.phase === "lobby") {
      if (connected > 0) {
        this.phase = "countdown";
        this.phaseEndsAt = now + this.cfg.countdownMs;
        this.changed();
      }
    }
    if (this.phase === "countdown") {
      if (connected === 0) {
        this.phase = "lobby";
        this.changed();
      } else if (now >= this.phaseEndsAt) {
        this.startRound(now);
      }
    }
    if (this.phase === "playing") {
      while (now >= this.nextShrinkAt && this.phase === "playing") {
        const z = this.zone;
        if (z.x0 < ZONE_MIN.x0) {
          this.zone = { x0: z.x0 + 1, y0: z.y0 + 1, x1: z.x1 - 1, y1: z.y1 - 1 };
          for (const f of this.fighters) if (f.alive && !f.bot) f.score += SURVIVE_POINTS;
          this.changed();
        }
        this.nextShrinkAt += Math.max(1, this.cfg.zoneIntervalMs);
      }
      while (now >= this.nextZoneDamageAt && this.phase === "playing") {
        this.nextZoneDamageAt += ZONE_DAMAGE_EVERY_MS;
        let any = false;
        for (const f of this.fighters) {
          if (f.alive && !this.inZone(f)) {
            this.damage(f, ZONE_DAMAGE, null);
            any = true;
          }
        }
        if (any) {
          this.changed();
          this.checkEnd(now);
        }
      }
      for (const b of this.fighters) {
        if (this.phase !== "playing") break;
        if (b.bot && b.alive) this.botThink(b, now);
      }
    }
    if (this.phase === "over" && now >= this.phaseEndsAt) {
      this.fighters = [];
      this.winner = null;
      this.phase = "lobby";
      this.changed();
      this.tick(now);
    }
  }

  takeEvents(): HitEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  /** Per-viewer view of the game. */
  view(token: string, now: number) {
    const s = this.sessions.get(token);
    const me = this.fighterOf(token);
    const showFighters = this.phase === "playing" || this.phase === "over";
    return {
      type: "state",
      me: s?.name ?? "",
      phase: this.phase,
      phaseRemaining: Math.max(0, this.phaseEndsAt - now),
      inRound: !!me,
      alive: !!me?.alive,
      score: me?.score ?? 0,
      hp: me ? me.hp : MAX_HP,
      hpMax: MAX_HP,
      cooldownRemaining: me ? Math.max(0, me.readyAt - now) : 0,
      cooldownTotal: ATTACK_COOLDOWN_MS,
      winner: this.phase === "over" ? this.winner ?? "none" : "",
      zone: this.zone,
      zoneRemaining: this.phase === "playing" ? Math.max(0, this.nextShrinkAt - now) : 0,
      players: showFighters
        ? this.fighters.filter((f) => f.alive).map((f) => ({
            name: f.name, x: f.x, y: f.y, hp: f.hp, bot: f.bot,
            connected: f.bot || !!(f.token && this.sessions.get(f.token)?.connected),
          }))
        : [],
      online: [...this.sessions.values()].map((x) => ({ name: x.name, connected: x.connected })),
      highscores: this.highscores,
    };
  }
}
