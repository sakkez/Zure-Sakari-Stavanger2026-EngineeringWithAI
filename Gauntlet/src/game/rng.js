// Seeded RNG for gameplay code (spawns, AI decisions, drops). api.stage() reseeds it so staged scenes are deterministic.
let s = 1337;

export function seed(n) { s = n | 0; }

export function rng() {
  s = (s + 0x6d2b79f5) | 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const rand = (a, b) => a + (b - a) * rng();
export const pick = (arr) => arr[Math.floor(rng() * arr.length)];
export const chance = (p) => rng() < p;
