import {
  ATTACK_COOLDOWN_MS, ATTACK_DAMAGE, BOT_STEP_MS, GRID, HIGHSCORE_SIZE, KILL_POINTS, MAX_HP,
  MAX_MOVES_PER_SEC, SPAWN_DISTANCE, SURVIVE_POINTS, WIN_POINTS, ZONE_DAMAGE, ZONE_MAX, ZONE_MIN,
  ZONE_TICK_MS, type GameConfig,
} from './config.js';
import { generateName } from './names.js';

export type Phase = 'lobby' | 'countdown' | 'playing' | 'over';
export type Dir = 'up' | 'down' | 'left' | 'right';

export interface Zone { x0: number; y0: number; x1: number; y1: number }

export interface Player {
  id: string;
  token: string;
  name: string;
  bot: boolean;
  connected: boolean;
  disconnectedAt: number;
  inRound: boolean;
  alive: boolean;
  x: number;
  y: number;
  hp: number;
  score: number;
  cooldownStart: number;
  moveTimes: number[];
  nextBotStep: number;
}

export interface DamageEvent { target: string; targetId: string; attackerId: string | null; amount: number; x: number; y: number }

export interface HighscoreEntry { name: string; score: number; at: number }

export interface PublicPlayer {
  id: string; name: string; bot: boolean; x: number; y: number; hp: number; connected: boolean;
}

export interface Snapshot {
  phase: Phase;
  phaseRemainingMs: number;
  zone: Zone;
  winner: string | null;
  players: PublicPlayer[];
  highscores: HighscoreEntry[];
}

export interface PersonalView {
  id: string; name: string; score: number; hp: number; maxHp: number;
  alive: boolean; inRound: boolean; cooldownRemainingMs: number;
}

const DELTAS: Record<Dir, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

const fullZone = (): Zone => ({ x0: 0, y0: 0, x1: GRID - 1, y1: GRID - 1 });
const chebyshev = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const inZone = (z: Zone, x: number, y: number): boolean => x >= z.x0 && x <= z.x1 && y >= z.y0 && y <= z.y1;

export class Game {
  readonly players = new Map<string, Player>();
  phase: Phase = 'lobby';
  phaseEndsAt = 0;
  zone: Zone = fullZone();
  winner: string | null = null;
  private fixedScores: HighscoreEntry[] = [];
  private roundEntrants: Player[] = [];
  private nextZoneShrink = 0;
  private nextZoneTick = 0;
  private nextId = 1;
  private pendingDamage: DamageEvent[] = [];

  constructor(private readonly config: GameConfig, private readonly rnd: () => number = Math.random) {}

  join(now: number, token: string): Player {
    const existing = [...this.players.values()].find((p) => !p.bot && p.token === token);
    const player = existing ?? this.createPlayer(token, false);
    player.connected = true;
    this.players.set(player.id, player);
    if (this.phase === 'lobby') this.startCountdown(now);
    return player;
  }

  disconnect(now: number, id: string): void {
    const p = this.players.get(id);
    if (!p) return;
    p.connected = false;
    p.disconnectedAt = now;
  }

  move(now: number, id: string, dir: Dir): boolean {
    const p = this.players.get(id);
    if (!p || !this.canAct(p) || !DELTAS[dir]) return false;
    p.moveTimes = p.moveTimes.filter((t) => now - t < 1000);
    if (p.moveTimes.length >= MAX_MOVES_PER_SEC) return false;
    const [dx, dy] = DELTAS[dir];
    const nx = p.x + dx;
    const ny = p.y + dy;
    if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) return false;
    if (this.livingPlayers().some((o) => o.x === nx && o.y === ny)) return false;
    p.x = nx;
    p.y = ny;
    p.moveTimes.push(now);
    p.cooldownStart = now;
    return true;
  }

  attack(now: number, id: string): boolean {
    const p = this.players.get(id);
    if (!p || !this.canAct(p) || this.cooldownRemaining(p, now) > 0) return false;
    p.cooldownStart = now;
    for (const target of this.livingPlayers()) {
      if (target === p || chebyshev(p, target) !== 1) continue;
      this.damage(target, ATTACK_DAMAGE, p);
    }
    this.checkRoundEnd(now);
    return true;
  }

  tick(now: number): void {
    this.expireDisconnected(now);
    if (this.phase === 'countdown' && now >= this.phaseEndsAt) this.startRound(now);
    if (this.phase === 'playing') this.tickPlaying(now);
    if (this.phase === 'over' && now >= this.phaseEndsAt) this.backToLobby(now);
  }

  takeDamageEvents(): DamageEvent[] {
    const events = this.pendingDamage;
    this.pendingDamage = [];
    return events;
  }

  cooldownRemaining(p: Player, now: number): number {
    return Math.max(0, ATTACK_COOLDOWN_MS - (now - p.cooldownStart));
  }

  snapshot(now: number): Snapshot {
    const showPlayers = this.phase === 'playing' || this.phase === 'over';
    return {
      phase: this.phase,
      phaseRemainingMs: Math.max(0, this.phaseEndsAt - now),
      zone: { ...this.zone },
      winner: this.winner,
      players: showPlayers
        ? this.livingPlayers().map((p) => ({
          id: p.id, name: p.name, bot: p.bot, x: p.x, y: p.y, hp: p.hp, connected: p.connected || p.bot,
        }))
        : [],
      highscores: this.highscores(now),
    };
  }

  personal(id: string, now: number): PersonalView | null {
    const p = this.players.get(id);
    if (!p) return null;
    return {
      id: p.id, name: p.name, score: p.score, hp: p.hp, maxHp: MAX_HP, alive: p.alive,
      inRound: p.inRound, cooldownRemainingMs: this.cooldownRemaining(p, now),
    };
  }

  highscores(now: number): HighscoreEntry[] {
    const live = this.phase === 'playing'
      ? this.roundEntrants.filter((p) => !p.bot).map((p) => ({ name: p.name, score: p.score, at: now }))
      : [];
    return [...this.fixedScores, ...live]
      .sort((a, b) => b.score - a.score || a.at - b.at)
      .slice(0, HIGHSCORE_SIZE);
  }

  livingPlayers(): Player[] {
    return [...this.players.values()].filter((p) => p.inRound && p.alive);
  }

  private canAct(p: Player): boolean {
    return this.phase === 'playing' && p.inRound && p.alive;
  }

  private createPlayer(token: string, bot: boolean): Player {
    const taken = new Set([...this.players.values()].map((p) => p.name));
    return {
      id: `p${this.nextId++}`, token, name: generateName(taken, this.rnd), bot, connected: true,
      disconnectedAt: 0, inRound: false, alive: false, x: 0, y: 0, hp: MAX_HP, score: 0,
      cooldownStart: -Infinity, moveTimes: [], nextBotStep: 0,
    };
  }

  private humans(): Player[] {
    return [...this.players.values()].filter((p) => !p.bot);
  }

  private startCountdown(now: number): void {
    this.phase = 'countdown';
    this.phaseEndsAt = now + this.config.countdownMs;
    this.winner = null;
  }

  private startRound(now: number): void {
    const entrants = this.humans().filter((p) => p.connected);
    if (entrants.length === 0) {
      this.phase = 'lobby';
      return;
    }
    if (entrants.length === 1) {
      const bot = this.createPlayer('', true);
      this.players.set(bot.id, bot);
      entrants.push(bot);
    }
    this.zone = fullZone();
    this.winner = null;
    const placed: Player[] = [];
    for (const p of entrants) {
      const spot = this.spawnSpot(placed);
      Object.assign(p, {
        inRound: true, alive: true, hp: MAX_HP, score: 0, x: spot.x, y: spot.y,
        cooldownStart: -Infinity, moveTimes: [], nextBotStep: now + BOT_STEP_MS,
      });
      placed.push(p);
    }
    this.roundEntrants = entrants;
    this.phase = 'playing';
    this.phaseEndsAt = 0;
    this.nextZoneShrink = now + this.config.zoneIntervalMs;
    this.nextZoneTick = now + ZONE_TICK_MS;
  }

  private spawnSpot(placed: Player[]): { x: number; y: number } {
    const free: { x: number; y: number }[] = [];
    const farEnough: { x: number; y: number }[] = [];
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        if (placed.some((p) => p.x === x && p.y === y)) continue;
        free.push({ x, y });
        if (placed.every((p) => chebyshev(p, { x, y }) >= SPAWN_DISTANCE)) farEnough.push({ x, y });
      }
    }
    const pool = farEnough.length > 0 ? farEnough : free;
    return pool[Math.floor(this.rnd() * pool.length)];
  }

  private tickPlaying(now: number): void {
    for (const bot of this.livingPlayers().filter((p) => p.bot)) this.stepBot(bot, now);
    if (now >= this.nextZoneShrink) {
      this.nextZoneShrink += this.config.zoneIntervalMs;
      if (this.zone.x0 < ZONE_MIN) {
        const z = this.zone;
        this.zone = { x0: z.x0 + 1, y0: z.y0 + 1, x1: Math.max(ZONE_MAX, z.x1 - 1), y1: Math.max(ZONE_MAX, z.y1 - 1) };
        for (const p of this.livingPlayers()) p.score += SURVIVE_POINTS;
      }
    }
    if (now >= this.nextZoneTick) {
      while (this.nextZoneTick <= now) this.nextZoneTick += ZONE_TICK_MS;
      for (const p of this.livingPlayers()) {
        if (!inZone(this.zone, p.x, p.y)) this.damage(p, ZONE_DAMAGE, null);
      }
    }
    this.checkRoundEnd(now);
  }

  private stepBot(bot: Player, now: number): void {
    const enemies = this.livingPlayers().filter((p) => p !== bot);
    if (enemies.length === 0) return;
    if (enemies.some((e) => chebyshev(e, bot) === 1)) {
      this.attack(now, bot.id);
      return;
    }
    if (now < bot.nextBotStep) return;
    bot.nextBotStep = now + BOT_STEP_MS;
    const target = inZone(this.zone, bot.x, bot.y)
      ? enemies.reduce((best, e) => (chebyshev(e, bot) < chebyshev(best, bot) ? e : best))
      : { x: (this.zone.x0 + this.zone.x1) / 2, y: (this.zone.y0 + this.zone.y1) / 2 };
    const dx = target.x - bot.x;
    const dy = target.y - bot.y;
    const horizontal: Dir | null = dx > 0 ? 'right' : dx < 0 ? 'left' : null;
    const vertical: Dir | null = dy > 0 ? 'down' : dy < 0 ? 'up' : null;
    const order = Math.abs(dx) >= Math.abs(dy) ? [horizontal, vertical] : [vertical, horizontal];
    for (const dir of order) {
      if (dir && this.move(now, bot.id, dir)) return;
    }
  }

  private damage(target: Player, amount: number, attacker: Player | null): void {
    const dealt = Math.min(amount, target.hp);
    target.hp -= dealt;
    this.pendingDamage.push({
      target: target.name, targetId: target.id, attackerId: attacker?.id ?? null, amount, x: target.x, y: target.y,
    });
    if (target.hp <= 0) {
      target.alive = false;
      if (attacker) attacker.score += KILL_POINTS;
    }
  }

  private checkRoundEnd(now: number): void {
    if (this.phase !== 'playing') return;
    const alive = this.livingPlayers();
    if (alive.length > 1) return;
    const winner = alive[0] ?? null;
    if (winner) winner.score += WIN_POINTS;
    this.winner = winner ? winner.name : 'none';
    this.fixedScores = [
      ...this.fixedScores,
      ...this.roundEntrants.filter((p) => !p.bot).map((p) => ({ name: p.name, score: p.score, at: now })),
    ];
    this.phase = 'over';
    this.phaseEndsAt = now + this.config.resultMs;
  }

  private backToLobby(now: number): void {
    for (const p of [...this.players.values()]) {
      if (p.bot) this.players.delete(p.id);
      else Object.assign(p, { inRound: false, alive: false, hp: MAX_HP, score: 0 });
    }
    this.roundEntrants = [];
    this.zone = fullZone();
    this.phase = 'lobby';
    if (this.humans().some((p) => p.connected)) this.startCountdown(now);
  }

  private expireDisconnected(now: number): void {
    for (const p of [...this.players.values()]) {
      if (p.bot || p.connected || now - p.disconnectedAt < this.config.reconnectMs) continue;
      p.alive = false;
      this.players.delete(p.id);
    }
    if (this.phase === 'countdown' && !this.humans().some((p) => p.connected)) this.phase = 'lobby';
    this.checkRoundEnd(now);
  }
}
