function envMs(name: string, fallback: number): number {
  const raw = process.env[name];
  const value = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

export interface GameConfig {
  countdownMs: number;
  zoneIntervalMs: number;
  resultMs: number;
  reconnectMs: number;
}

export function configFromEnv(): GameConfig {
  return {
    countdownMs: envMs('COUNTDOWN_MS', 5000),
    zoneIntervalMs: envMs('ZONE_INTERVAL_MS', 15000),
    resultMs: envMs('RESULT_MS', 5000),
    reconnectMs: envMs('RECONNECT_MS', 10000),
  };
}

export const GRID = 30;
export const MAX_HP = 100;
export const ATTACK_DAMAGE = 25;
export const ATTACK_COOLDOWN_MS = 1000;
export const MAX_MOVES_PER_SEC = 5;
export const ZONE_DAMAGE = 10;
export const ZONE_TICK_MS = 1000;
export const ZONE_MIN = 13;
export const ZONE_MAX = 16;
export const KILL_POINTS = 100;
export const SURVIVE_POINTS = 10;
export const WIN_POINTS = 250;
export const HIGHSCORE_SIZE = 10;
export const SPAWN_DISTANCE = 3;
export const BOT_STEP_MS = 500;
