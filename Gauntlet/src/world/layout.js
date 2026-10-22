// Arena layout: the exact gameplay heightfield plus the designed features (lake, plaza, paths,
// outcrops, ruins sites) and the surface/biome functions used both for texturing and placement.
import { fbm, noise, ridged, smoothstep } from './noise.js';

export const ARENA_RADIUS = 60;
export const WATER = -0.45;
export const PLAZA_H = 0.55;

const D2R = Math.PI / 180;
const polar = (deg, r) => ({ x: Math.cos(deg * D2R) * r, z: Math.sin(deg * D2R) * r });

// Gameplay spawn points (see game.js start(): rivals at radius*0.75, angle i/5*2PI+0.4; player at 0,6).
export const SPAWNS = [{ x: 0, z: 6 }];
for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2 + 0.4; SPAWNS.push({ x: Math.cos(a) * ARENA_RADIUS * 0.75, z: Math.sin(a) * ARENA_RADIUS * 0.75 }); }
export const PATH_ANGLES = SPAWNS.slice(1).map((s) => Math.atan2(s.z, s.x));

// Lake: elongated radially, sitting between two spawn paths (bottom-right of the start view).
const LDIR = polar(59, 1);
export const LAKE = { x: LDIR.x * 37, z: LDIR.z * 37, ux: LDIR.x, uz: LDIR.z, long: 1.38, rad: 9.6 };
export const PUDDLES = [
  { ...polar(200, 19), r: 3.0, a: 0.6, e: 1.7 },
  { ...polar(338, 21), r: 2.6, a: 2.1, e: 1.45 },
  { ...polar(152, 41), r: 3.6, a: 1.2, e: 1.6 },
  { ...polar(284, 44), r: 3.0, a: 2.7, e: 1.5 },
];
export const OUTCROPS = [
  { ...polar(203, 33), r: 7.5, h: 3.6 },
  { ...polar(345, 37), r: 6.0, h: 2.8 },
  { ...polar(66, 53), r: 5.5, h: 2.6 },
  { ...polar(133, 47), r: 5.0, h: 2.4 },
  { ...polar(270, 52), r: 5.0, h: 2.2 },
];
export const SITES = {
  shrine: { x: 0, z: 0 },
  graveyard: polar(131, 27),
  chapel: polar(275, 29),
  tower: polar(8, 27),
};

export function lakeSD(x, z) {
  const dx = x - LAKE.x, dz = z - LAKE.z;
  const u = dx * LAKE.ux + dz * LAKE.uz, v = -dx * LAKE.uz + dz * LAKE.ux;
  const d = Math.hypot(u / LAKE.long, v);
  const rad = LAKE.rad + (fbm(x * 0.07 + 11, z * 0.07 - 4, 3) - 0.5) * 9;
  return d - rad;
}

function smax(a, b, k) { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.max(a, b) + h * h * k * 0.25; }

// 0..1, how close to a dirt trail leading from the plaza to each spawn.
export function pathAt(x, z) {
  const r = Math.hypot(x, z);
  if (r < 8 || r > 58) return 0;
  const ang = Math.atan2(z, x);
  let best = 99;
  for (let k = 0; k < PATH_ANGLES.length; k++) {
    const target = PATH_ANGLES[k] + 0.22 * Math.sin(r * 0.075 + k * 2.1) * smoothstep(8, 22, r);
    let da = ang - target; da = Math.atan2(Math.sin(da), Math.cos(da));
    best = Math.min(best, Math.abs(da) * r);
  }
  const w = 1.3 + noise(x * 0.15, z * 0.15) * 1.1;
  return smoothstep(w + 0.9, w - 0.5, best + (noise(x * 0.6, z * 0.6) - 0.5) * 0.8) * smoothstep(8, 12, r) * (1 - smoothstep(52, 58, r));
}

// Normalised distance to a bog puddle's shore (1 = waterline): elongated, rotated ellipse whose edge
// is warped by two noise octaves so it reads as an organic bog, not a punched-out oval.
export function puddleDist(p, x, z) {
  const dx = x - p.x, dz = z - p.z, c = Math.cos(p.a || 0), s = Math.sin(p.a || 0);
  const u = (dx * c + dz * s) / (p.e || 1), v = -dx * s + dz * c;
  const d = Math.hypot(u, v) / p.r;
  return d + (noise(x * 0.32 + 3, z * 0.32) - 0.5) * 0.85 + (noise(x * 0.9 - 7, z * 0.9 + 2) - 0.5) * 0.3;
}

export function rimAt(x, z) {
  const r = Math.hypot(x, z);
  return r - (60 + (fbm(x * 0.035 + 50, z * 0.035, 3) - 0.5) * 12);
}

export function heightAt(x, z) {
  const r = Math.hypot(x, z);
  let h = (fbm(x * 0.022 + 3, z * 0.022 - 7, 4) - 0.5) * 7.0 + 0.7;
  h += (fbm(x * 0.09, z * 0.09, 3) - 0.5) * 1.1;
  // Keep dry land above the water line except where we carve water on purpose.
  h = smax(h, WATER + 0.35, 0.8);
  // Flat central plaza for the shrine.
  const pf = smoothstep(12, 24, r);
  h = PLAZA_H + (h - PLAZA_H) * pf;
  // Rocky outcrops.
  for (const o of OUTCROPS) {
    const d = Math.hypot(x - o.x, z - o.z) / o.r;
    if (d > 1.6) continue;
    const e = d + (noise(x * 0.35, z * 0.35) - 0.5) * 0.45;
    h += o.h * 0.6 * smoothstep(1.1, 0.5, e) + ridged(x * 0.25, z * 0.25, 3) * 0.8 * smoothstep(1.2, 0.5, e);
  }
  // Rim: stepped cliffs rising out of the arena into forested highlands.
  const t = rimAt(x, z);
  if (t > -2) {
    const tt = Math.max(0, t);
    h += tt * 0.42 + 3.2 * smoothstep(0, 2.6, t) + 3.6 * smoothstep(8, 10.5, t)
      + ridged(x * 0.09, z * 0.09, 4) * Math.min(tt, 10) * 0.55;
  }
  // Lake basin.
  const sd = lakeSD(x, z);
  if (sd < 7) {
    const k = smoothstep(7, -1.0, sd);
    const target = sd > 0 ? WATER + 0.1 + sd * 0.2 : WATER - 0.15 - Math.min(1.9, -sd * 0.34);
    h = h * (1 - k) + target * k;
  }
  // Boggy puddles.
  for (const p of PUDDLES) {
    const d = puddleDist(p, x, z);
    if (d > 2.4) continue;
    const dn = d;
    const target = dn < 1 ? WATER - 0.26 * (1 - dn * dn) : WATER + (dn - 1) * 0.16;
    const k = smoothstep(2.2, 0.85, dn);
    h = h * (1 - k) + target * k;
  }
  return h;
}

export function slopeAt(x, z, e = 0.35) {
  const dx = heightAt(x + e, z) - heightAt(x - e, z), dz = heightAt(x, z + e) - heightAt(x, z - e);
  return Math.hypot(dx, dz) / (2 * e);
}

// Forest density 0..1 (where trees cluster; also drives the forest-floor texture).
export function forestAt(x, z) {
  const r = Math.hypot(x, z);
  const n = fbm(x * 0.045 + 21, z * 0.045 + 5, 3);
  let f = smoothstep(0.48, 0.62, n) * smoothstep(17, 30, r);
  f = Math.max(f, smoothstep(-2, 6, rimAt(x, z)));
  f *= 1 - smoothstep(3, -1, lakeSD(x, z)) * 0.9;
  return f;
}

// Plaza flagstone coverage 0..1 (broken, overgrown).
export function plazaAt(x, z) {
  const r = Math.hypot(x, z);
  const edge = smoothstep(12.5, 10, r + (noise(x * 0.3, z * 0.3) - 0.5) * 4);
  const holes = smoothstep(0.3, 0.45, noise(x * 0.42 + 7, z * 0.42 - 2));
  return edge * (0.35 + 0.65 * holes) * (r < 6.5 ? 1 : 1) ;
}

// Surface weights [grass, forestFloor, rock, mud, flagstone] (unnormalized -> normalized).
export function surfaceAt(x, z, slope, h) {
  if (slope === undefined) slope = slopeAt(x, z);
  if (h === undefined) h = heightAt(x, z);
  const sd = lakeSD(x, z);
  let mud = smoothstep(3.2, 0.2, sd) + smoothstep(WATER + 0.6, WATER + 0.1, h);
  // Scattered mud patches: soft, noise-ragged edges and partial weight (they used to read as hard dark ellipses).
  mud += smoothstep(0.6, 0.8, fbm(x * 0.06 - 9, z * 0.06 + 13, 3) + (noise(x * 0.28 + 5, z * 0.28 - 3) - 0.5) * 0.14) * 0.45;
  const path = pathAt(x, z);
  let rock = smoothstep(0.55, 0.95, slope);
  rock = Math.max(rock, smoothstep(0.5, 0.8, ridged(x * 0.12, z * 0.12, 3)) * smoothstep(2, 6, rimAt(x, z)));
  const forest = forestAt(x, z);
  let dirt = Math.max(forest * 0.85, path) + smoothstep(0.55, 0.7, fbm(x * 0.08 + 4, z * 0.08 + 8, 3)) * 0.6;
  const flag = plazaAt(x, z);
  let grass = 1.0;
  const w = [grass, dirt, rock, Math.min(1.2, mud), flag];
  // Dominance: rock and flagstone override, the rest blend.
  w[0] *= (1 - Math.min(1, dirt)) * (1 - rock) * (1 - flag) * (1 - Math.min(1, mud) * 0.9);
  w[1] *= (1 - rock) * (1 - flag) * (1 - Math.min(1, mud) * 0.7);
  w[3] *= (1 - rock) * (1 - flag);
  w[4] *= (1 - rock);
  const s = w[0] + w[1] + w[2] + w[3] + w[4] + 1e-5;
  for (let i = 0; i < 5; i++) w[i] /= s;
  return w;
}

export function nearSpawn(x, z, pad) {
  for (const s of SPAWNS) if (Math.hypot(x - s.x, z - s.z) < pad) return true;
  return false;
}
