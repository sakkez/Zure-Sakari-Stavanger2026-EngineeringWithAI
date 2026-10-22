export type Phase = 'lobby' | 'countdown' | 'playing' | 'over';
export type Dir = 'up' | 'down' | 'left' | 'right';

export interface PlayerView {
  id: string;
  name: string;
  x: number;
  y: number;
  hp: number;
  bot: boolean;
  alive: boolean;
  connected: boolean;
}

export interface DamageEvent {
  id: number;
  target: string;
  attacker: string | null;
  amount: number;
  x: number;
  y: number;
}

export interface Zone {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface HighscoreEntry {
  name: string;
  score: number;
}

export interface Snapshot {
  phase: Phase;
  phaseEndsAt: number | null;
  now: number;
  winner: string | null;
  zone: Zone;
  players: PlayerView[];
  damage: DamageEvent[];
  highscores: HighscoreEntry[];
  lobby: string[];
}

/** Per-connection view of "me", sent alongside the shared snapshot. */
export interface MeView {
  id: string;
  name: string;
  hp: number;
  hpMax: number;
  score: number;
  inRound: boolean;
  alive: boolean;
  cooldownStart: number;
  cooldownEnd: number;
}

export type ServerMsg =
  | { t: 'welcome'; id: string; token: string; name: string }
  | { t: 'state'; s: Snapshot; me: MeView | null };

export type ClientMsg =
  | { t: 'hello'; token?: string }
  | { t: 'move'; dir: Dir }
  | { t: 'attack' };
