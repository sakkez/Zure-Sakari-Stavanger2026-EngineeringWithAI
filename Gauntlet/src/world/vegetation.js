// Procedural vegetation geometry: conifers (branch cards), gnarled dead trees, bushes, grass, ferns, logs.
import * as THREE from 'three';
import { GeoBuilder } from './geo.js';
import { mulberry } from './noise.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// Returns { trunk: BufferGeometry (bark), foliage: BufferGeometry (needle cards), height, radius }
export function coniferGeometry(seed) {
  const R = mulberry(seed * 977 + 3);
  const H = 8.5 + R() * 3.5, Rmax = 2.1 + R() * 0.7, y0 = 1.3 + R() * 0.6;
  const trunk = new GeoBuilder(), fol = new GeoBuilder();
  // Trunk with slight lean, root flare.
  const pts = [], rad = [];
  for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push(V((R() - 0.5) * 0.08, t * H * 0.92 - 0.3, (R() - 0.5) * 0.08)); rad.push(0.32 * (1 - t) ** 0.9 + 0.03 + (i === 0 ? 0.12 : 0)); }
  trunk.tube(pts, rad, 7, (t) => 0.55 + 0.45 * t, 1.6);
  // Dark interior body so the crown never looks hollow.
  const core = new THREE.ConeGeometry(Rmax * 0.5, H - y0, 7, 1, true).translate(0, y0 + (H - y0) / 2, 0);
  trunk.addGeometry(core, new THREE.Matrix4(), 0.22);
  // Tiers of drooping branch cards.
  const T = 9 + Math.floor(R() * 3);
  for (let k = 0; k < T; k++) {
    const t = k / (T - 1);
    const y = y0 + (H - y0) * Math.pow(t, 0.92);
    const r = Rmax * Math.pow(1 - t, 0.85) * (0.85 + R() * 0.3) + 0.35;
    const B = Math.round(5 + r * 2.4);
    for (let b = 0; b < B; b++) {
      const a = (b / B) * Math.PI * 2 + R() * 0.6 + k * 0.9;
      const dir = V(Math.cos(a), 0, Math.sin(a)), side = V(-dir.z, 0, dir.x);
      const rr = r * (0.8 + R() * 0.35), w = rr * 0.42 + 0.25;
      const droop = rr * (0.32 + R() * 0.15);
      const root = V(0, y + 0.15, 0), mid = root.clone().addScaledVector(dir, rr * 0.5).add(V(0, -droop * 0.25, 0));
      const tip = root.clone().addScaledVector(dir, rr).add(V(0, -droop, 0));
      const nUp = V(0, 1, 0).addScaledVector(dir, 0.55).normalize();
      const ao = 0.55 + 0.45 * t, aoIn = ao * 0.45;
      // two segments: root->mid, mid->tip, each a quad of width w (narrower at root)
      const p = [root, mid, tip], wid = [w * 0.35, w, w * 0.6], u = [0, 0.5, 1], c = [aoIn, ao * 0.85, ao * 1.05];
      for (let s = 0; s < 2; s++) {
        const a0 = p[s].clone().addScaledVector(side, -wid[s] / 2), a1 = p[s].clone().addScaledVector(side, wid[s] / 2);
        const b0 = p[s + 1].clone().addScaledVector(side, -wid[s + 1] / 2), b1 = p[s + 1].clone().addScaledVector(side, wid[s + 1] / 2);
        fol.quad(a0, b0, b1, a1, nUp, [[u[s], 0], [u[s + 1], 0], [u[s + 1], 1], [u[s], 1]], [c[s], c[s + 1], c[s + 1], c[s]]);
      }
    }
  }
  // Leader at the top: two crossed upright cards.
  for (let i = 0; i < 2; i++) {
    const a = i * Math.PI / 2, d = V(Math.cos(a), 0, Math.sin(a)).multiplyScalar(0.35);
    fol.quad(V(-d.x, H - 1.4, -d.z), V(d.x, H - 1.4, d.z), V(d.x * 0.2, H + 0.4, d.z * 0.2), V(-d.x * 0.2, H + 0.4, -d.z * 0.2), V(0, 0.6, 0).add(V(d.z, 0, -d.x)).normalize(),
      [[0, 0], [0, 1], [1, 1], [1, 0]], [0.8, 0.8, 1, 1]);
  }
  return { trunk: trunk.build(), foliage: fol.build(), height: H, radius: Rmax };
}

// Gnarled dead tree (bark only) + optional sparse twig cards.
export function deadTreeGeometry(seed) {
  const R = mulberry(seed * 619 + 17);
  const g = new GeoBuilder();
  const grow = (p, dir, len, rad, depth) => {
    const pts = [p.clone()], radii = [rad];
    const n = depth === 0 ? 6 : depth === 1 ? 4 : 3;
    const d = dir.clone();
    for (let i = 1; i <= n; i++) {
      d.add(V((R() - 0.5) * 0.55, (R() - 0.35) * 0.25 + (depth === 0 ? 0.08 : -0.02), (R() - 0.5) * 0.55)).normalize();
      p = p.clone().addScaledVector(d, len / n);
      pts.push(p); radii.push(rad * (1 - (i / n) * 0.62));
    }
    g.tube(pts, radii, depth === 0 ? 6 : depth === 1 ? 4 : 3, (t) => (depth === 0 ? 0.5 + t * 0.4 : 0.85), 1.4);
    if (depth >= 3) return;
    const kids = depth === 0 ? 3 + Math.floor(R() * 2) : 2 + Math.floor(R() * 2);
    for (let k = 0; k < kids; k++) {
      const at = Math.floor(n * (0.45 + R() * 0.55));
      const base = pts[Math.min(at, pts.length - 1)];
      const ang = R() * Math.PI * 2;
      const nd = d.clone().multiplyScalar(0.5).add(V(Math.cos(ang), 0.25 + R() * 0.55, Math.sin(ang))).normalize();
      grow(base, nd, len * (0.5 + R() * 0.2), radii[Math.min(at, radii.length - 1)] * 0.62, depth + 1);
    }
  };
  const H = 4.5 + R() * 2.5;
  grow(V(0, -0.2, 0), V((R() - 0.5) * 0.3, 1, (R() - 0.5) * 0.3).normalize(), H, 0.36 + R() * 0.1, 0);
  // Root flare.
  for (let i = 0; i < 4; i++) {
    const a = i / 4 * Math.PI * 2 + R();
    const o = V(Math.cos(a), 0, Math.sin(a));
    g.tube([V(0, 0.5, 0).addScaledVector(o, 0.1), V(0, 0.15, 0).addScaledVector(o, 0.55), V(0, -0.15, 0).addScaledVector(o, 1.1)], [0.22, 0.14, 0.05], 5, 0.5, 1.4);
  }
  return { bark: g.build(), height: H };
}

export function bushGeometry(seed) {
  const R = mulberry(seed * 331 + 5);
  const g = new GeoBuilder();
  const n = 16;
  for (let i = 0; i < n; i++) {
    const phi = Math.acos(1 - R() * 1.15), th = R() * Math.PI * 2;
    const d = V(Math.sin(phi) * Math.cos(th), Math.cos(phi), Math.sin(phi) * Math.sin(th));
    const c = V(d.x * 0.55, 0.45 + d.y * 0.45, d.z * 0.55);
    const s = 0.55 + R() * 0.25;
    const t1 = new THREE.Vector3().crossVectors(d, Math.abs(d.y) > 0.9 ? V(1, 0, 0) : V(0, 1, 0)).normalize();
    const t2 = new THREE.Vector3().crossVectors(d, t1).normalize();
    const ao = 0.4 + 0.6 * (c.y / 0.9);
    const P = (a, b) => c.clone().addScaledVector(t1, a * s).addScaledVector(t2, b * s);
    g.quad(P(-1, -1), P(1, -1), P(1, 1), P(-1, 1), d, undefined, [ao * 0.8, ao * 0.8, ao, ao]);
  }
  return g.build();
}

export function grassGeometry() {
  const g = new GeoBuilder();
  const R = mulberry(5);
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 4 + R() * 0.3;
    const d = V(Math.cos(a), 0, Math.sin(a)), side = V(-d.z, 0, d.x);
    const w = 0.42, h = 0.5;
    const lean = (i % 2 ? 1 : -1) * 0.18;
    const top = d.clone().multiplyScalar(lean);
    g.quad(side.clone().multiplyScalar(-w), side.clone().multiplyScalar(w), side.clone().multiplyScalar(w).add(top).add(V(0, h, 0)), side.clone().multiplyScalar(-w).add(top).add(V(0, h, 0)),
      V(0, 1, 0), [[0, 0], [1, 0], [1, 1], [0, 1]], [0.62, 0.62, 1, 1]);
  }
  return g.build();
}

export function fernGeometry(seed) {
  const g = new GeoBuilder();
  const R = mulberry(seed * 71 + 9);
  const n = 8;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + R() * 0.4;
    const d = V(Math.cos(a), 0, Math.sin(a)), side = V(-d.z, 0, d.x);
    const L = 0.9 + R() * 0.4, W = 0.32, rise = 0.35 + R() * 0.2;
    const seg = 4;
    let prev = null;
    for (let s = 0; s <= seg; s++) {
      const t = s / seg;
      const p = d.clone().multiplyScalar(t * L).add(V(0, Math.sin(t * Math.PI * 0.85) * rise + 0.03, 0));
      const nrm = V(0, 1, 0).addScaledVector(d, 0.3).normalize();
      const c = 0.45 + 0.55 * t;
      const a0 = g.vert(p.clone().addScaledVector(side, -W / 2), nrm, t, 0, c), a1 = g.vert(p.clone().addScaledVector(side, W / 2), nrm, t, 1, c);
      if (prev) { g.tri(prev[0], a0, a1); g.tri(prev[0], a1, prev[1]); }
      prev = [a0, a1];
    }
  }
  return g.build();
}

export function logGeometry(seed) {
  const R = mulberry(seed * 53 + 1);
  const g = new GeoBuilder();
  const L = 4 + R() * 2.5, r = 0.28 + R() * 0.12;
  const pts = [], rad = [];
  for (let i = 0; i <= 5; i++) { const t = i / 5; pts.push(V(-L / 2 + t * L, r * 0.8 + (R() - 0.5) * 0.06, (R() - 0.5) * 0.12)); rad.push(r * (1 - t * 0.25)); }
  g.tube(pts, rad, 8, (t, s) => 0.6 + 0.4 * Math.abs(Math.sin(s / 8 * Math.PI)), 1.2, 1.6);
  // cap at the start
  g.tube([pts[1], pts[0]], [rad[1], rad[0]], 8, 0.7, 1.2, 1.6);
  // broken branch stubs
  for (let i = 0; i < 3; i++) {
    const t = 0.2 + R() * 0.6, base = V(-L / 2 + t * L, r * 0.9, 0), a = R() * Math.PI;
    const dir = V(R() - 0.5, Math.sin(a), Math.cos(a)).normalize();
    g.tube([base, base.clone().addScaledVector(dir, 0.5 + R() * 0.6)], [r * 0.35, r * 0.12], 5, 0.7, 1.2);
  }
  return { geo: g.build(), length: L, radius: r };
}

// ---------- Round 2 flora ----------
// Grass tuft variants: 0 = short tuft, 1 = tall wispy, 2 = broad low clump.
export function grassVariant(kind, seed = 1) {
  const g = new GeoBuilder();
  const R = mulberry(seed * 97 + kind * 13);
  const n = kind === 2 ? 6 : kind === 1 ? 3 : 4;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI + R() * 0.5;
    const d = V(Math.cos(a), 0, Math.sin(a)), side = V(-d.z, 0, d.x);
    const w = kind === 2 ? 0.5 : kind === 1 ? 0.32 : 0.4, h = kind === 2 ? 0.32 : kind === 1 ? 0.95 : 0.5;
    const lean = (R() - 0.5) * (kind === 2 ? 0.7 : 0.35);
    const off = d.clone().multiplyScalar((R() - 0.5) * 0.25);
    const top = d.clone().multiplyScalar(lean).add(off);
    g.quad(side.clone().multiplyScalar(-w).add(off), side.clone().multiplyScalar(w).add(off), side.clone().multiplyScalar(w).add(top).add(V(0, h, 0)), side.clone().multiplyScalar(-w).add(top).add(V(0, h, 0)),
      V(0, 1, 0), [[0, 0], [1, 0], [1, 1], [0, 1]], [0.55, 0.55, 1, 1]);
  }
  return g.build();
}

// Bracken: 3-5 fronds clustered to one side, rising on stems then arching over and drooping.
export function brackenGeometry(seed) {
  const g = new GeoBuilder();
  const R = mulberry(seed * 131 + 7);
  const n = 3 + Math.floor(R() * 3);
  const base = R() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const a = base + (R() - 0.5) * 2.6;
    const d = V(Math.cos(a), 0, Math.sin(a)), side = V(-d.z, 0, d.x);
    const stemH = 0.35 + R() * 0.35, L = 0.75 + R() * 0.45, W = 0.62 * L;
    const seg = 4;
    let prev = null;
    const twist = (R() - 0.5) * 0.5;
    for (let s = 0; s <= seg; s++) {
      const t = s / seg;
      const p = d.clone().multiplyScalar(0.1 + t * L).add(V(0, stemH + Math.sin(t * Math.PI * 0.6) * 0.18 - t * t * (0.3 + R() * 0.05), 0));
      const sd = side.clone().applyAxisAngle(d, twist + t * 0.3);
      const nrm = V(0, 1, 0).addScaledVector(d, 0.25).normalize();
      const c = 0.55 + 0.45 * t;
      const a0 = g.vert(p.clone().addScaledVector(sd, -W / 2), nrm, t, 0, c), a1 = g.vert(p.clone().addScaledVector(sd, W / 2), nrm, t, 1, c);
      if (prev) { g.tri(prev[0], a0, a1); g.tri(prev[0], a1, prev[1]); }
      prev = [a0, a1];
    }
  }
  return g.build();
}

// Heather: an irregular low mound of upright sprig cards (not a sphere).
export function heatherGeometry(seed) {
  const g = new GeoBuilder();
  const R = mulberry(seed * 211 + 3);
  const lobes = 2 + Math.floor(R() * 3);
  for (let l = 0; l < lobes; l++) {
    const cx = (R() - 0.5) * 0.9, cz = (R() - 0.5) * 0.9, rad = 0.25 + R() * 0.25;
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 4 + R(), d = V(Math.cos(a), 0, Math.sin(a));
      const c = V(cx, 0, cz), h = 0.28 + R() * 0.22;
      g.quad(c.clone().addScaledVector(d, -rad), c.clone().addScaledVector(d, rad), c.clone().addScaledVector(d, rad).add(V(0, h, 0)), c.clone().addScaledVector(d, -rad).add(V(0, h, 0)),
        V(0, 1, 0), [[0, 0], [1, 0], [1, 1], [0, 1]], [0.5, 0.5, 1, 1]);
    }
  }
  return g.build();
}

// Bush: 3-5 offset sub-clumps of tilted twig/leaf cards with a ragged, asymmetric silhouette.
export function brokenBushGeometry(seed) {
  const g = new GeoBuilder();
  const R = mulberry(seed * 331 + 19);
  const clumps = 3 + Math.floor(R() * 3);
  for (let k = 0; k < clumps; k++) {
    const cx = (R() - 0.5) * 1.3, cz = (R() - 0.5) * 1.3, ch = 0.25 + R() * 0.6, cs = 0.35 + R() * 0.35;
    const cards = 4 + Math.floor(R() * 4);
    for (let i = 0; i < cards; i++) {
      const a = R() * Math.PI * 2, tilt = 0.2 + R() * 0.9;
      const d = V(Math.cos(a) * Math.sin(tilt), Math.cos(tilt), Math.sin(a) * Math.sin(tilt));
      const c = V(cx + d.x * cs * 0.6, ch * (0.5 + R() * 0.6), cz + d.z * cs * 0.6);
      const s = cs * (0.7 + R() * 0.6);
      const up = Math.abs(d.y) > 0.9 ? V(1, 0, 0) : V(0, 1, 0);
      const t1 = new THREE.Vector3().crossVectors(d, up).normalize(), t2 = new THREE.Vector3().crossVectors(d, t1).normalize();
      if (t2.y < 0) t2.negate();
      const ao = 0.4 + 0.6 * Math.min(1, c.y / 0.9);
      const P = (u, v) => c.clone().addScaledVector(t1, u * s).addScaledVector(t2, v * s);
      g.quad(P(-1, -1), P(1, -1), P(1, 1), P(-1, 1), V(0, 1, 0).addScaledVector(d, 0.6).normalize(), undefined, [ao * 0.7, ao * 0.7, ao, ao]);
    }
  }
  return g.build();
}
