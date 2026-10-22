// Procedural VFX textures, generated once on canvas at boot (no downloads needed).
//  - particle atlas (4x4 cells): glow, flames, smoke, sparks, flares, rings, shards, debris, wisps, ...
//  - decal atlas (4x4 cells): scorch, frost, blood, cracks, telegraphs, runes, ...
//  - ribbon noise strip (tiling) for trails and slash arcs.
import * as THREE from 'three';

export const CELL = 256;
export const GRID = 4;

// Particle atlas frames.
export const P = {
  glow: 0, flame: 1, flame2: 2, smoke: 3, smoke2: 4, spark: 5, flare: 6, ring: 7,
  shard: 8, debris: 9, wisp: 10, drop: 11, star: 12, ember: 13, dust: 14, smoke3: 15,
};
// Decal atlas frames.
export const D = {
  scorch: 0, frost: 1, blood: 2, crack: 3, telegraph: 4, disk: 5, arcane: 6, hole: 7,
  shock: 8, scuff: 9, necro: 10, bloodSmall: 11, telegraphFill: 12, rune: 13, ash: 14, sigil: 15,
};

// ---------- noise ----------
function hash(x, y, s) {
  const h = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453;
  return h - Math.floor(h);
}
function vnoise(x, y, s = 0) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy, s), b = hash(ix + 1, iy, s), c = hash(ix, iy + 1, s), d = hash(ix + 1, iy + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, s = 0, oct = 4) {
  let f = 0, amp = 0.5, fr = 1, norm = 0;
  for (let i = 0; i < oct; i++) { f += amp * vnoise(x * fr, y * fr, s + i * 17); norm += amp; amp *= 0.5; fr *= 2.03; }
  return f / norm;
}
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
// Voronoi F1/F2 distances (for cracks and frost).
function voronoi(x, y, s) {
  const ix = Math.floor(x), iy = Math.floor(y);
  let f1 = 9, f2 = 9;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = ix + i + hash(ix + i, iy + j, s), cy = iy + j + hash(ix + i, iy + j, s + 3.1);
    const d = Math.hypot(x - cx, y - cy);
    if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
  }
  return [f1, f2];
}

// Fill one atlas cell via a pixel function fn(u, v) -> [r,g,b,a] in 0..1, u/v in [-1,1], v up.
function pixelCell(ctx, index, fn) {
  const col = index % GRID, row = Math.floor(index / GRID);
  const img = ctx.createImageData(CELL, CELL);
  const d = img.data;
  for (let y = 0; y < CELL; y++) {
    const v = 1 - ((y + 0.5) / CELL) * 2;
    for (let x = 0; x < CELL; x++) {
      const u = ((x + 0.5) / CELL) * 2 - 1;
      const c = fn(u, v);
      const k = (y * CELL + x) * 4;
      d[k] = clamp(c[0]) * 255; d[k + 1] = clamp(c[1]) * 255; d[k + 2] = clamp(c[2]) * 255; d[k + 3] = clamp(c[3]) * 255;
    }
  }
  ctx.putImageData(img, col * CELL, row * CELL);
}
// Draw into a cell with canvas vector ops; callback gets ctx translated so (0,0) is cell centre and radius R = CELL/2.
function vectorCell(ctx, index, fn) {
  const col = index % GRID, row = Math.floor(index / GRID);
  ctx.save();
  ctx.beginPath(); ctx.rect(col * CELL, row * CELL, CELL, CELL); ctx.clip();
  ctx.translate(col * CELL + CELL / 2, row * CELL + CELL / 2);
  fn(ctx, CELL / 2);
  ctx.restore();
}

function makeCanvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}
function toTexture(canvas, { repeat = false, mips = true } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.NoColorSpace; // treated as linear data; colour comes from particle tint
  t.generateMipmaps = mips;
  t.minFilter = mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}

// ---------------------------------------------------------------- particle atlas
export function makeParticleAtlas() {
  const canvas = makeCanvas(CELL * GRID);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const W = 1;

  pixelCell(ctx, P.glow, (u, v) => {
    const r2 = u * u + v * v;
    const a = Math.exp(-r2 * 9) * 0.8 + Math.exp(-r2 * 3.2) * 0.35;
    return [W, W, W, a * smooth(1, 0.85, Math.sqrt(r2))];
  });
  const flame = (seed) => (u, v) => {
    // full licking flame: round body in the lower half, noisy tongues rising to the top
    const n = fbm(u * 2.2 + seed, v * 1.6 - seed, seed, 4);
    const n2 = fbm(u * 4.5 + seed * 2, v * 3.5, seed + 5, 3);
    const yy = v + 0.15;
    const w = 0.78 * (1 - smooth(-0.5, 1.0, yy) * 0.6);
    const d = Math.hypot(u / Math.max(0.05, w), (yy < 0 ? yy * 1.35 : yy * 0.82));
    const shape = 1 - d + (n - 0.5) * 0.8 + (n2 - 0.5) * 0.25;
    const a = smooth(0.0, 0.4, shape) * smooth(1, 0.82, Math.hypot(u, v));
    const core = smooth(0.1, 0.75, shape);
    const g = 0.4 + 0.6 * core;
    return [g, g, g, a];
  };
  pixelCell(ctx, P.flame, flame(1.3));
  pixelCell(ctx, P.flame2, flame(7.9));
  const smoke = (seed, puff = 0.8) => (u, v) => {
    // soft billowing puff with fake top lighting (low frequency, no grain)
    const r = Math.hypot(u, v);
    const n = fbm(u * 1.6 + seed, v * 1.6 + seed * 2, seed, 4);
    const n2 = fbm(u * 3.2 + seed * 3, v * 3.2, seed + 9, 3);
    const shape = 1 - r * 1.1 + (n - 0.5) * 0.9;
    const a = smooth(0.0, 0.6, shape) * (0.7 + 0.3 * n2) * smooth(1, 0.82, r);
    const lit = fbm(u * 1.6 + seed - 0.1, v * 1.6 + seed * 2 + 0.12, seed, 4) - n;
    const g = clamp(0.62 + lit * 2.4 + v * 0.2 + (n2 - 0.5) * 0.15);
    return [g, g, g, a * puff];
  };
  pixelCell(ctx, P.smoke, smoke(2.1));
  pixelCell(ctx, P.smoke2, smoke(5.7));
  pixelCell(ctx, P.spark, (u, v) => {
    // streak along +v, hot head
    const along = (v + 1) / 2; // 0 tail .. 1 head
    const width = 0.06 + 0.12 * along;
    const a = Math.exp(-(u * u) / (width * width)) * Math.pow(along, 1.4) * smooth(1, 0.9, v);
    return [W, W, W, a];
  });
  pixelCell(ctx, P.flare, (u, v) => {
    const r = Math.hypot(u, v);
    const core = Math.exp(-r * r * 30);
    const halo = Math.exp(-r * r * 5) * 0.35;
    const rays = (Math.exp(-Math.abs(u) * 40) * Math.exp(-v * v * 2.5) + Math.exp(-Math.abs(v) * 40) * Math.exp(-u * u * 2.5)) * 0.8;
    const diag = (Math.exp(-Math.abs(u - v) * 50) + Math.exp(-Math.abs(u + v) * 50)) * Math.exp(-r * r * 8) * 0.3;
    return [W, W, W, clamp(core + halo + rays + diag) * smooth(1, 0.85, r)];
  });
  pixelCell(ctx, P.ring, (u, v) => {
    const r = Math.hypot(u, v);
    const a = Math.exp(-Math.pow((r - 0.78) / 0.07, 2)) + Math.exp(-Math.pow((r - 0.78) / 0.25, 2)) * 0.25;
    return [W, W, W, a * smooth(1, 0.95, r)];
  });
  pixelCell(ctx, P.shard, (u, v) => {
    // elongated crystal diamond with facet shading
    const d = Math.abs(u) * 3.2 + Math.abs(v) * 1.05;
    if (d > 1) return [0, 0, 0, 0];
    const facet = u > 0 ? (v > 0 ? 1 : 0.75) : (v > 0 ? 0.6 : 0.45);
    const edge = smooth(0.8, 1, d) * 0.6;
    const g = clamp(facet + edge);
    return [g, g, g, smooth(1, 0.93, d)];
  });
  pixelCell(ctx, P.debris, (u, v) => {
    const ang = Math.atan2(v, u), r = Math.hypot(u, v);
    const rad = 0.55 + (fbm(Math.cos(ang) * 1.5 + 3, Math.sin(ang) * 1.5 + 3, 4, 3) - 0.5) * 0.7;
    if (r > rad) return [0, 0, 0, smooth(rad + 0.04, rad, r)];
    const n = fbm(u * 6, v * 6, 11, 3);
    const g = clamp(0.35 + (u * -0.3 + v * 0.45) + (n - 0.5) * 0.5);
    return [g, g, g, 1];
  });
  pixelCell(ctx, P.wisp, (u, v) => {
    const r = Math.hypot(u, v), ang = Math.atan2(v, u);
    const swirl = fbm(Math.cos(ang + r * 4) * 2 + 5, Math.sin(ang + r * 4) * 2 + 5, 8, 4);
    const a = Math.exp(-r * r * 4) * (0.35 + swirl * 0.9) + Math.exp(-r * r * 30) * 0.6;
    return [W, W, W, clamp(a) * smooth(1, 0.8, r)];
  });
  pixelCell(ctx, P.drop, (u, v) => {
    const r = Math.hypot(u * 1.0, v * 0.8);
    const a = smooth(0.62, 0.52, r + (fbm(u * 4, v * 4, 3, 2) - 0.5) * 0.2);
    const hl = Math.exp(-((u + 0.2) ** 2 + (v - 0.2) ** 2) * 40) * 0.8;
    const g = clamp(0.55 + hl - r * 0.4);
    return [g, g, g, a];
  });
  pixelCell(ctx, P.star, (u, v) => {
    const r = Math.hypot(u, v);
    const s = Math.exp(-Math.abs(u * v) * 90) * Math.exp(-r * r * 3) + Math.exp(-r * r * 40);
    return [W, W, W, clamp(s) * smooth(1, 0.8, r)];
  });
  pixelCell(ctx, P.ember, (u, v) => {
    const r2 = u * u + v * v;
    return [W, W, W, clamp(Math.exp(-r2 * 28) * 1.2 + Math.exp(-r2 * 6) * 0.2)];
  });
  pixelCell(ctx, P.dust, (u, v) => {
    const r = Math.hypot(u, v);
    const n = fbm(u * 1.6 + 4, v * 1.6 + 1, 21, 4);
    const a = smooth(0, 0.7, 1 - r * 1.1 + (n - 0.5) * 0.8) * 0.8;
    const g = 0.75 + (n - 0.5) * 0.4;
    return [g, g, g, a];
  });
  pixelCell(ctx, P.smoke3, (u, v) => {
    // wispy, stringy smoke
    const r = Math.hypot(u, v);
    const n = fbm(u * 1.5 + 9, v * 4 + 2, 31, 5);
    const streak = Math.pow(1 - Math.abs(n - 0.5) * 2, 4);
    const a = streak * smooth(1, 0.3, r) * 0.9;
    return [0.8, 0.8, 0.8, a];
  });
  return toTexture(canvas);
}

// ---------------------------------------------------------------- decal atlas
export function makeDecalAtlas() {
  const canvas = makeCanvas(CELL * GRID);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  pixelCell(ctx, D.scorch, (u, v) => {
    // charred blast mark: dense dark core, radial soot streaks, broken edge
    const r = Math.hypot(u, v), ang = Math.atan2(v, u);
    const n = fbm(u * 2.5, v * 2.5, 41, 5);
    const rays = fbm(Math.cos(ang) * 4 + 10, Math.sin(ang) * 4 + 10, 42, 3);
    const streak = Math.pow(fbm(Math.cos(ang) * 9 + 3, Math.sin(ang) * 9 + 3, 44, 2), 2);
    const edge = 0.7 + (rays - 0.5) * 0.5 + (n - 0.5) * 0.25 + streak * 0.25;
    const a = smooth(edge, edge * 0.35, r) * (0.75 + 0.25 * n);
    // rgb = heat mask for the glowing phase: hot molten centre + glowing veins
    const vein = smooth(0.62, 0.72, fbm(u * 5, v * 5, 45, 3)) * smooth(0.8, 0.2, r);
    const g = clamp(smooth(0.55, 0.0, r) * 0.8 + vein * 0.6 + (n - 0.5) * 0.2);
    return [g, g, g, a];
  });
  pixelCell(ctx, D.frost, (u, v) => {
    // hoarfrost: feathery radial ice streaks over a thin frozen sheet, crystalline rim
    const r = Math.hypot(u, v), ang = Math.atan2(v, u);
    const n = fbm(u * 3, v * 3, 53, 4);
    const edge = 0.8 + (fbm(Math.cos(ang) * 3 + 2, Math.sin(ang) * 3 + 2, 51, 3) - 0.5) * 0.35;
    const body = smooth(edge, edge - 0.3, r);
    const streak = Math.pow(fbm(Math.cos(ang) * 14 + r * 1.5, Math.sin(ang) * 14 + r * 1.5, 54, 3), 3) * 3;
    const fine = Math.pow(fbm(u * 18, v * 18, 55, 2), 4) * 2;
    const [f1, f2] = voronoi(u * 6, v * 6, 52);
    const cells = smooth(0.05, 0.0, f2 - f1) * 0.3;
    const rim = smooth(edge - 0.25, edge - 0.05, r) * body * 0.6;
    const a = clamp(body * (0.18 + streak * 0.6 + fine * 0.3 + cells + rim + n * 0.15));
    const g = clamp(0.65 + streak * 0.3 + rim * 0.4);
    return [g, g, g, a];
  });
  const splat = (seed, drops) => (u, v) => {
    const r = Math.hypot(u, v), ang = Math.atan2(v, u);
    const lobes = fbm(Math.cos(ang) * 2 + seed, Math.sin(ang) * 2 + seed, seed, 4);
    let a = smooth(0.42 + lobes * 0.3, 0.38 + lobes * 0.3, r);
    for (let i = 0; i < drops; i++) {
      const da = hash(i, 1, seed) * 6.283, dr = 0.45 + hash(i, 2, seed) * 0.45, ds = 0.03 + hash(i, 3, seed) * 0.07;
      const dx = u - Math.cos(da) * dr, dy = v - Math.sin(da) * dr;
      a = Math.max(a, smooth(ds, ds * 0.7, Math.hypot(dx, dy)));
    }
    const n = fbm(u * 6, v * 6, seed + 1, 3);
    const g = clamp(0.5 + (n - 0.5) * 0.6 + smooth(0.4, 0, r) * 0.2);
    return [g, g, g, a];
  };
  pixelCell(ctx, D.blood, splat(61, 14));
  pixelCell(ctx, D.bloodSmall, splat(67, 6));
  pixelCell(ctx, D.crack, (u, v) => {
    const r = Math.hypot(u, v), ang = Math.atan2(v, u);
    // radial cracks: thin lines at angles perturbed by noise
    const wob = (fbm(r * 3, ang * 0.5 + 5, 71, 3) - 0.5) * 1.2;
    const k = 7;
    const t = ((ang + wob * 0.4) / (Math.PI * 2)) * k;
    const lineD = Math.abs(t - Math.round(t)) * (Math.PI * 2 / k) * r * CELL * 0.5; // pixels from crack centre
    const lenMask = smooth(0.95, 0.5 + hash(Math.round(t), 0, 72) * 0.3, r);
    let radial = smooth(3.5 * (1.2 - r), 0.5, lineD) * lenMask;
    const [f1, f2] = voronoi(u * 4.5, v * 4.5, 73);
    const cell = smooth(0.06, 0.0, f2 - f1) * smooth(0.75, 0.15, r);
    const crater = smooth(0.32, 0.0, r) * 0.7;
    const a = clamp(Math.max(radial, cell, crater * (0.6 + fbm(u * 6, v * 6, 74, 3) * 0.4)));
    // rgb: crack "heat" for glowing magma phase (bright in thin lines)
    const g = clamp(Math.max(radial, cell) * 1.0 + crater * 0.3);
    return [g, g, g, a];
  });
  vectorCell(ctx, D.telegraph, (c, R) => {
    c.strokeStyle = '#fff';
    c.shadowColor = '#fff'; c.shadowBlur = 10;
    c.lineWidth = 7; c.beginPath(); c.arc(0, 0, R * 0.92, 0, Math.PI * 2); c.stroke();
    c.lineWidth = 2; c.beginPath(); c.arc(0, 0, R * 0.8, 0, Math.PI * 2); c.stroke();
    c.lineWidth = 4;
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      c.beginPath(); c.moveTo(Math.cos(a) * R * 0.82, Math.sin(a) * R * 0.82); c.lineTo(Math.cos(a) * R * (i % 2 ? 0.86 : 0.9), Math.sin(a) * R * (i % 2 ? 0.86 : 0.9)); c.stroke();
    }
    // inward chevrons
    c.lineWidth = 3;
    for (let i = 0; i < 4; i++) {
      c.save(); c.rotate((i / 4) * Math.PI * 2 + Math.PI / 4);
      c.beginPath(); c.moveTo(-10, R * 0.66); c.lineTo(0, R * 0.58); c.lineTo(10, R * 0.66); c.stroke();
      c.restore();
    }
  });
  pixelCell(ctx, D.disk, (u, v) => {
    const r2 = u * u + v * v;
    return [1, 1, 1, Math.exp(-r2 * 3.5) * smooth(1, 0.85, Math.sqrt(r2))];
  });
  vectorCell(ctx, D.arcane, (c, R) => {
    c.strokeStyle = '#fff'; c.shadowColor = '#fff'; c.shadowBlur = 8;
    c.lineWidth = 4; c.beginPath(); c.arc(0, 0, R * 0.9, 0, Math.PI * 2); c.stroke();
    c.lineWidth = 2; c.beginPath(); c.arc(0, 0, R * 0.74, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.arc(0, 0, R * 0.3, 0, Math.PI * 2); c.stroke();
    // 6-point star
    c.lineWidth = 2.5; c.beginPath();
    for (let i = 0; i <= 6; i++) { const a = (i / 6) * Math.PI * 2 * 2 + Math.PI / 2; const x = Math.cos(a) * R * 0.74, y = Math.sin(a) * R * 0.74; i ? c.lineTo(x, y) : c.moveTo(x, y); }
    c.stroke();
    c.beginPath();
    for (let i = 0; i <= 6; i++) { const a = (i / 6) * Math.PI * 2 * 2 - Math.PI / 2; const x = Math.cos(a) * R * 0.74, y = Math.sin(a) * R * 0.74; i ? c.lineTo(x, y) : c.moveTo(x, y); }
    c.stroke();
    // rune ticks between the rings
    c.lineWidth = 3;
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2, r0 = R * 0.77, r1 = R * (0.8 + (i % 3) * 0.03);
      c.beginPath(); c.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); c.lineTo(Math.cos(a + 0.05) * r1, Math.sin(a + 0.05) * r1); c.stroke();
    }
  });
  pixelCell(ctx, D.hole, (u, v) => {
    const r = Math.hypot(u, v), ang = Math.atan2(v, u);
    const n = fbm(u * 4, v * 4, 81, 4);
    const lip = 0.45 + (fbm(Math.cos(ang) * 2 + 1, Math.sin(ang) * 2 + 1, 82, 3) - 0.5) * 0.35;
    const inner = smooth(lip, lip - 0.15, r);
    const clumps = smooth(0.55, 0.75, fbm(u * 9, v * 9, 83, 3)) * smooth(lip + 0.45, lip, r) * smooth(lip - 0.1, lip + 0.05, r);
    const a = clamp(inner * 0.95 + clumps * 0.9);
    const g = clamp(inner ? 0.15 + n * 0.2 : 0.5) * (clumps > inner ? 2.2 : 1);
    return [g, g, g, a];
  });
  pixelCell(ctx, D.shock, (u, v) => {
    const r = Math.hypot(u, v);
    const n = fbm(u * 5, v * 5, 91, 3);
    const band = Math.exp(-Math.pow((r - 0.86) / 0.06, 2)) + Math.exp(-Math.pow((r - 0.8) / 0.2, 2)) * 0.35;
    return [1, 1, 1, clamp(band * (0.75 + n * 0.5)) * smooth(1, 0.96, r)];
  });
  pixelCell(ctx, D.scuff, (u, v) => {
    const r = Math.hypot(u, v);
    const n = fbm(u * 3, v * 8, 95, 4);
    const a = smooth(0.95, 0.2, r) * smooth(0.35, 0.7, n);
    return [0.8, 0.8, 0.8, a];
  });
  vectorCell(ctx, D.necro, (c, R) => {
    c.strokeStyle = '#fff'; c.shadowColor = '#fff'; c.shadowBlur = 10;
    c.lineWidth = 5; c.beginPath(); c.arc(0, 0, R * 0.88, 0, Math.PI * 2); c.stroke();
    c.lineWidth = 3; c.beginPath();
    for (let i = 0; i <= 5; i++) { const a = (i / 5) * Math.PI * 2 * 2 - Math.PI / 2; const x = Math.cos(a) * R * 0.85, y = Math.sin(a) * R * 0.85; i ? c.lineTo(x, y) : c.moveTo(x, y); }
    c.stroke();
  });
  pixelCell(ctx, D.telegraphFill, (u, v) => {
    const r = Math.hypot(u, v);
    const n = fbm(u * 4, v * 4, 101, 3);
    const a = smooth(0.95, 0.88, r) * (0.08 + 0.92 * Math.pow(smooth(0.2, 0.95, r), 2)) * (0.7 + n * 0.3);
    return [1, 1, 1, a];
  });
  vectorCell(ctx, D.rune, (c, R) => {
    c.strokeStyle = '#fff'; c.shadowColor = '#fff'; c.shadowBlur = 6; c.lineWidth = 3;
    for (let i = 0; i < 12; i++) {
      c.save(); c.rotate((i / 12) * Math.PI * 2);
      c.translate(0, -R * 0.82);
      const s = (hash(i, 5, 7) * 3) | 0;
      c.beginPath();
      if (s === 0) { c.moveTo(-8, -8); c.lineTo(0, 8); c.lineTo(8, -8); }
      else if (s === 1) { c.moveTo(0, -10); c.lineTo(0, 10); c.moveTo(-7, 0); c.lineTo(7, -6); }
      else { c.arc(0, 0, 7, 0.4, Math.PI * 1.7); c.moveTo(0, -10); c.lineTo(0, 10); }
      c.stroke(); c.restore();
    }
    c.lineWidth = 2; c.beginPath(); c.arc(0, 0, R * 0.95, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.arc(0, 0, R * 0.68, 0, Math.PI * 2); c.stroke();
  });
  pixelCell(ctx, D.ash, (u, v) => {
    const r = Math.hypot(u, v);
    const n = fbm(u * 3, v * 3, 111, 5);
    const a = smooth(0.7 + (n - 0.5) * 0.5, 0.2, r) * (0.5 + n * 0.5);
    return [0.5, 0.5, 0.5, a];
  });
  vectorCell(ctx, D.sigil, (c, R) => {
    c.strokeStyle = '#fff'; c.shadowColor = '#fff'; c.shadowBlur = 12;
    c.lineWidth = 6; c.beginPath(); c.arc(0, 0, R * 0.6, 0, Math.PI * 2); c.stroke();
    for (let i = 0; i < 8; i++) {
      c.save(); c.rotate((i / 8) * Math.PI * 2);
      c.lineWidth = 3; c.beginPath(); c.moveTo(0, R * 0.62); c.lineTo(0, R * 0.92); c.stroke();
      c.restore();
    }
  });
  return toTexture(canvas);
}

// Tiling noise strip used by ribbons / slash arcs (R = streaky noise, G = soft noise).
export function makeNoiseTexture() {
  const W = 256, H = 64;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(W, H);
  // tileable via periodic sampling on a torus-ish mapping
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const a = (x / W) * Math.PI * 2, b = (y / H) * Math.PI * 2;
    const sx = Math.cos(a) * 2, sy = Math.sin(a) * 2, sz = Math.cos(b) * 0.6, sw = Math.sin(b) * 0.6;
    const streak = fbm(sx + sz * 4, sy + sw * 4, 5, 4);
    const soft = fbm(sx * 0.8 + sz, sy * 0.8 + sw, 9, 3);
    const k = (y * W + x) * 4;
    img.data[k] = clamp((streak - 0.25) * 2) * 255;
    img.data[k + 1] = soft * 255;
    img.data[k + 2] = 0; img.data[k + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(canvas, { repeat: true });
}

// Emissive lava/rock texture for the meteor.
export function makeLavaTexture() {
  const S = 128;
  const canvas = makeCanvas(S);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = (x / S) * 6, v = (y / S) * 6;
    const [f1, f2] = voronoi(u, v, 121);
    const crack = smooth(0.15, 0.0, f2 - f1);
    const n = fbm(u, v, 122, 3);
    const k = (y * S + x) * 4;
    const h = clamp(crack * (0.6 + n));
    img.data[k] = 255 * clamp(h * 1.2); img.data[k + 1] = 255 * clamp(h * 0.55); img.data[k + 2] = 255 * clamp(h * 0.12); img.data[k + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
