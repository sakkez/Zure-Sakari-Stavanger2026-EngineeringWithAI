// Gothic ruins: central shrine with pillar ring, chapel walls, round tower stump, graveyard.
// Everything merges into one world-space geometry (one draw call) using the triplanar stone material.
import * as THREE from 'three';
import { GeoBuilder, rockGeometry } from './geo.js';
import { mulberry, smoothstep } from './noise.js';
import { heightAt, SITES, PLAZA_H } from './layout.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), S = new THREE.Vector3();

function groundMin(x, z, r) {
  let h = heightAt(x, z);
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; h = Math.min(h, heightAt(x + Math.cos(a) * r, z + Math.sin(a) * r)); }
  return h;
}

export function buildRuins(obstacles) {
  const R = mulberry(4242);
  const g = new GeoBuilder();
  const emissive = new GeoBuilder();
  const runes = new GeoBuilder();
  const candles = [];
  // Ground contact: darker, mossy-green grime fading up the first ~1.6 m; never below 0.5 so stone
  // keeps a readable value in low light.
  const aoCol = (ground) => (local, w) => {
    const t = smoothstep(-0.15, 1.6, w.y - ground);
    const k = 0.5 + 0.5 * t;
    return { r: k * (0.86 + 0.14 * t), g: k * (0.92 + 0.08 * t), b: k * (0.8 + 0.2 * t) };
  };
  // Small broken masonry chunks scattered around a footprint.
  // Broken masonry chunks: faceted 3D fragments (not boxes), lit with a light, ground-matched tint so
  // they read as stone debris rather than dark squares.
  const chunks = [1, 2, 3].map((k) => rockGeometry(500 + k, { sx: 1, sy: 0.75, sz: 0.85, rough: 0.12, cuts: 9, detail: 1, flatBottom: -0.5 }));
  const chunkCol = () => { const v = 0.78 + R() * 0.2; return { r: v * 0.98, g: v * 0.96, b: v * 0.88 }; };
  const rubbleAt = (x, z, rad, n) => {
    for (let k = 0; k < n; k++) {
      const a = R() * Math.PI * 2, d = rad * (0.9 + R() * 0.9);
      const rx = x + Math.cos(a) * d, rz = z + Math.sin(a) * d, gh = heightAt(rx, rz);
      const s = 0.12 + R() * R() * 0.4;
      E.set(R() * 0.7, R() * 3, R() * 0.7); Q.setFromEuler(E); S.set(s * (1 + R() * 0.6), s * 0.75, s * (0.8 + R() * 0.5));
      M.compose(V(rx, gh + s * 0.15, rz), Q, S);
      g.addGeometry(chunks[Math.floor(R() * 3)], M, chunkCol());
    }
  };
  const put = (geo, pos, rot, scale, ground) => {
    E.set(rot.x, rot.y, rot.z); Q.setFromEuler(E); S.set(scale.x, scale.y, scale.z);
    M.compose(pos, Q, S);
    g.addGeometry(geo, M, aoCol(ground ?? pos.y));
  };
  const box = new THREE.BoxGeometry(1, 1, 1);
  // Weathered ashlar blocks: corners and edges knocked in by a position hash (stays watertight).
  const chipped = (seed) => {
    const b = new THREE.BoxGeometry(1, 1, 1, 2, 2, 2), p = b.attributes.position;
    const h = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + seed * 19.3) * 43758.5453; return s - Math.floor(s); };
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const ex = Math.abs(x) > 0.49, ey = Math.abs(y) > 0.49, ez = Math.abs(z) > 0.49, n = ex + ey + ez;
      const k = n === 3 ? 0.16 : n === 2 ? 0.07 : 0.015;
      const r = h(x, y, z);
      p.setXYZ(i, x * (1 - (ex ? k * r * 2 : 0)), y * (1 - (ey ? k * h(y, z, x) * 2 : 0)), z * (1 - (ez ? k * h(z, x, y) * 2 : 0)));
    }
    b.computeVertexNormals();
    return b;
  };
  const blocks = [chipped(1), chipped(2), chipped(3), chipped(4)];
  const blk = () => blocks[Math.floor(R() * 4)];
  const cyl8 = new THREE.CylinderGeometry(1, 1, 1, 8, 1);
  const cyl12 = new THREE.CylinderGeometry(1, 1, 1, 12, 1);

  // Jagged broken shaft: cylinder with randomized top ring.
  function brokenShaft(r, h, seed) {
    const RR = mulberry(seed);
    const c = new THREE.CylinderGeometry(r * 0.92, r, h, 8, 3);
    const p = c.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      if (y > h / 2 - 0.01) p.setY(i, y - RR() * Math.min(1.1, h * 0.4));
      else if (y > h / 6) { p.setX(i, p.getX(i) * (0.94 + RR() * 0.1)); p.setZ(i, p.getZ(i) * (0.94 + RR() * 0.1)); }
    }
    c.computeVertexNormals();
    return c;
  }

  function pillar(x, z, height, broken, seed) {
    const gh = groundMin(x, z, 0.8);
    const rot = R() * 0.4;
    // Plinth sunk ~0.3 m into the soil, slightly tilted by settling.
    const settle = V((R() - 0.5) * 0.06, rot, (R() - 0.5) * 0.06);
    put(box, V(x, gh - 0.02, z), settle, V(1.4, 0.75, 1.4), gh + 0.15);
    put(box, V(x, gh + 0.45, z), settle, V(1.12, 0.25, 1.12), gh + 0.15);
    rubbleAt(x, z, 0.95, 4 + Math.floor(R() * 4));
    const sh = broken ? height : height - 1.1;
    const shaft = broken ? brokenShaft(0.42, sh, seed) : new THREE.CylinderGeometry(0.38, 0.42, sh, 8, 1);
    const lean = broken ? V((R() - 0.5) * 0.08, rot, (R() - 0.5) * 0.08) : V(0, rot, 0);
    put(shaft, V(x, gh + 0.57 + sh / 2, z), lean, V(1, 1, 1), gh);
    if (!broken) {
      // Weathered capital: uneven blocks with a knocked-off corner.
      const top = gh + 0.57 + sh;
      put(box, V(x, top + 0.15, z), V((R() - 0.5) * 0.06, rot + (R() - 0.5) * 0.1, (R() - 0.5) * 0.06), V(0.95, 0.3, 0.95), gh);
      put(box, V(x + (R() - 0.5) * 0.08, top + 0.45, z + (R() - 0.5) * 0.08), V((R() - 0.5) * 0.08, rot, (R() - 0.5) * 0.08), V(1.25 - R() * 0.15, 0.33, 1.2 - R() * 0.2), gh);
      put(box, V(x + Math.cos(rot) * 0.5, top + 0.66, z - Math.sin(rot) * 0.5), V(R(), rot, R()), V(0.35, 0.18, 0.4), gh);
    } else {
      // Fallen fragments of the missing upper shaft at its feet.
      rubbleAt(x, z, 1.3, 3);
    }
    obstacles.push({ x, z, r: 0.85 });
    return gh + 0.57 + sh + 0.62;
  }

  function fallenDrum(x, z, len, r) {
    const gh = groundMin(x, z, len / 2);
    put(cyl8, V(x, gh + r * 0.7, z), V(Math.PI / 2, 0, R() * Math.PI), V(r, len, r), gh);
    rubbleAt(x, z, len * 0.6, 3);
    obstacles.push({ x, z, r: Math.max(r, len * 0.4) });
  }

  // Pointed gothic arch shape (extruded), spanning width w, springing at height 0.
  function gothicArch(w, rise, thick, depth) {
    const s = new THREE.Shape();
    const hw = w / 2;
    s.moveTo(-hw - thick, 0);
    s.quadraticCurveTo(-hw - thick, rise * 0.75, 0, rise + thick * 1.1);
    s.quadraticCurveTo(hw + thick, rise * 0.75, hw + thick, 0);
    s.lineTo(hw, 0);
    s.quadraticCurveTo(hw, rise * 0.7, 0, rise);
    s.quadraticCurveTo(-hw, rise * 0.7, -hw, 0);
    s.lineTo(-hw - thick, 0);
    const e = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 8 });
    e.translate(0, 0, -depth / 2);
    return e;
  }

  // ---------------- Central shrine ----------------
  {
    const y = PLAZA_H;
    put(cyl8, V(0, y - 0.1 + 0.05, 0), V(0, Math.PI / 8, 0), V(4.1, 0.22, 4.1), y - 0.3);
    rubbleAt(0, 0, 4.2, 14);
    put(cyl8, V(0, y + 0.22, 0), V(0, 0, 0), V(3.0, 0.45, 3.0), y);
    put(cyl8, V(0, y + 0.55, 0), V(0, Math.PI / 8, 0), V(2.25, 0.3, 2.25), y);
    // Altar
    put(box, V(0, y + 1.05, 0.2), V(0, 0, 0), V(1.9, 0.75, 1.0), y);
    put(box, V(0, y + 1.5, 0.2), V(0, 0, 0), V(2.2, 0.16, 1.25), y);
    // Spire behind the altar.
    put(box, V(0, y + 1.3, -1.1), V(0, Math.PI / 4, 0), V(1.2, 1.1, 1.2), y);
    const spire = new THREE.CylinderGeometry(0.22, 0.62, 5.2, 4, 3);
    { const p = spire.attributes.position; const RR = mulberry(9); for (let i = 0; i < p.count; i++) if (p.getY(i) > 2.5) p.setY(i, p.getY(i) - RR() * 0.9); spire.computeVertexNormals(); }
    put(spire, V(0, y + 4.4, -1.1), V(0.03, Math.PI / 4, -0.02), V(1, 1, 1), y);
    obstacles.push({ x: 0, z: -0.3, r: 2.9 });
    // Candles along the altar top.
    for (let c = 0; c < 7; c++) {
      const cx = -0.9 + c * 0.3 + (R() - 0.5) * 0.08, cz = 0.55 + (R() - 0.5) * 0.25, ch = 0.12 + R() * 0.22;
      put(cyl8, V(cx, y + 1.58 + ch / 2, cz), V(0, 0, 0), V(0.05, ch, 0.05), y - 1);
      M.compose(V(cx, y + 1.58 + ch + 0.05, cz), new THREE.Quaternion(), V(1, 1, 1));
      emissive.addGeometry(new THREE.OctahedronGeometry(0.05, 0).scale(1, 1.8, 1), M, 1);
    }
    // Broken masonry strewn across the plaza.
    for (let k = 0; k < 22; k++) {
      const a = R() * Math.PI * 2, d = 4.3 + R() * 8.5;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (Math.hypot(x, z - 6) < 2.2) continue;
      const s = 0.18 + R() * R() * 0.55;
      put(box, V(x, PLAZA_H + s * 0.25, z), V((R() - 0.5) * 0.6, R() * 3, (R() - 0.5) * 0.6), V(s * (1 + R()), s * (0.5 + R() * 0.5), s * (0.8 + R() * 0.6)), PLAZA_H - 0.3);
    }
    // Faint ritual ring of rune marks around the dais.
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2, rr = 4.55;
      if (R() < 0.2) continue;
      M.compose(V(Math.cos(a) * rr, PLAZA_H + 0.025, Math.sin(a) * rr), new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, -a + (R() - 0.5) * 0.3)), V(1, 1, 1));
      runes.addGeometry(new THREE.PlaneGeometry(0.42 + R() * 0.2, 0.07 + R() * 0.05), M, 0.4 + R() * 0.6);
    }
    // Braziers (ember bowls) flanking the altar.
    for (const sx of [-1, 1]) {
      const bx = sx * 4.5, bz = 2.9;
      obstacles.push({ x: bx, z: bz, r: 0.5 });
      for (let k = 0; k < 3; k++) {
        const a = k / 3 * Math.PI * 2;
        put(box, V(bx + Math.cos(a) * 0.2, y + 0.6, bz + Math.sin(a) * 0.2), V(Math.sin(a) * 0.22, 0, -Math.cos(a) * 0.22), V(0.07, 1.25, 0.07), y);
      }
      put(new THREE.CylinderGeometry(0.42, 0.22, 0.28, 10, 1, true), V(bx, y + 1.3, bz), V(0, 0, 0), V(1, 1, 1), y);
      M.compose(V(bx, y + 1.38, bz), new THREE.Quaternion(), V(1, 1, 1));
      g.addGeometry(new THREE.CircleGeometry(0.34, 10).rotateX(-Math.PI / 2), M, 0.12);
      M.compose(V(bx, y + 1.43, bz), new THREE.Quaternion(), V(1, 1, 1));
      emissive.addGeometry(new THREE.IcosahedronGeometry(0.14, 0).scale(1, 0.6, 1), M, 1);
    }
    // Pillar ring (r=9.5), with two pointed arches spanning neighbours.
    const n = 10, PR = 9.6;
    const tops = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.31;
      const x = Math.cos(a) * PR, z = Math.sin(a) * PR;
      if (Math.hypot(x - 0, z - 6) < 3) { tops.push(null); continue; }
      const full = i === 4 || i === 5 || i === 7 || i === 8 || i === 0;
      const h = full ? 5.6 : 1.3 + R() * 2.4;
      tops.push({ x, z, top: pillar(x, z, h, !full, 100 + i), full, a });
      if (!full && R() < 0.75) {
        const da = a + (R() - 0.5) * 0.6, dr = PR + 1.5 + R() * 2;
        fallenDrum(Math.cos(da) * dr, Math.sin(da) * dr, 1.0 + R() * 1.2, 0.42);
      }
    }
    for (const [i, j] of [[4, 5], [7, 8]]) {
      const A = tops[i], B = tops[j];
      if (!A || !B) continue;
      const mx = (A.x + B.x) / 2, mz = (A.z + B.z) / 2, w = Math.hypot(A.x - B.x, A.z - B.z);
      const arch = gothicArch(w - 0.9, 2.6, 0.45, 0.8);
      const ang = Math.atan2(B.z - A.z, B.x - A.x);
      put(arch, V(mx, Math.min(A.top, B.top) - 0.1, mz), V(0, -ang, 0), V(1, 1, 1), PLAZA_H);
    }
  }

  // ---------------- Block-built walls ----------------
  function wall(x0, z0, x1, z1, height, seed, opts = {}) {
    const RR = mulberry(seed);
    const len = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(z1 - z0, x1 - x0);
    const bl = 0.85, bh = 0.42, th = opts.thick || 0.75;
    const cols = Math.max(1, Math.round(len / bl));
    for (let c = 0; c < cols; c++) {
      const t = (c + 0.5) / cols;
      const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
      const gh = groundMin(x, z, 0.5) - 0.05;
      let colH = height * (0.35 + 0.65 * Math.abs(Math.sin(t * Math.PI * (1.2 + RR()) + seed))) * (0.75 + RR() * 0.35);
      if (opts.profile) colH = opts.profile(t, colH);
      if (opts.gap && t > opts.gap[0] && t < opts.gap[1]) colH = Math.min(colH, 0.3);
      const rows = Math.max(1, Math.round(colH / bh));
      for (let r = 0; r < rows; r++) {
        if (r === rows - 1 && RR() < 0.35) continue;
        const off = (r % 2) * 0.5 * bl * 0.5;
        const top = r > rows - 3;
        const jit = top ? 0.1 : 0.025;
        // A few loose top blocks have slipped and lean out of the course.
        const slip = top && RR() < 0.12;
        const out = slip ? (RR() < 0.5 ? -1 : 1) * (0.12 + RR() * 0.15) : (RR() - 0.5) * 0.04;
        put(blocks[Math.floor(RR() * 4)], V(x + Math.cos(ang) * off - Math.sin(ang) * out, gh + r * bh + bh / 2 - (slip ? 0.05 : 0), z + Math.sin(ang) * off + Math.cos(ang) * out),
          V((RR() - 0.5) * jit + (slip ? out * 1.8 : 0), -ang + (RR() - 0.5) * jit * 2, (RR() - 0.5) * jit + (slip ? (RR() - 0.5) * 0.4 : 0)),
          V(bl * (0.9 + RR() * 0.12), bh * (0.9 + RR() * 0.08), th * (0.88 + RR() * 0.14)), gh);
      }
      if (rows > 0 && c % 1 === 0) obstacles.push({ x, z, r: 0.55 });
      // Rubble at the foot.
      const nr = 1 + Math.floor(RR() * 3);
      for (let k = 0; k < nr; k++) {
        const side = RR() < 0.5 ? -1 : 1, d = 0.55 + RR() * 1.1, along = (RR() - 0.5) * bl;
        const rx = x - Math.sin(ang) * d * side + Math.cos(ang) * along, rz = z + Math.cos(ang) * d * side + Math.sin(ang) * along;
        const s = 0.18 + RR() * RR() * 0.5, gg = groundMin(rx, rz, 0.3);
        put(blocks[Math.floor(RR() * 4)], V(rx, gg + s * 0.25, rz), V(RR() * 0.8, RR() * 3, RR() * 0.8), V(s * 1.6, s, s * 1.2), gg - 0.4);
      }
    }
  }

  // ---------------- Chapel ----------------
  {
    const { x: cx, z: cz } = SITES.chapel;
    const a = Math.atan2(cz, cx) + Math.PI / 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    const L = (u, v) => [cx + u * ca - v * sa, cz + u * sa + v * ca];
    const W = 5, D = 8;
    const c = [L(-W, -D), L(W, -D), L(W, D), L(-W, D)];
    wall(...c[0], ...c[1], 4.5, 11, { profile: (t, h) => h + Math.sin(t * Math.PI) * 2.5 });
    wall(...c[1], ...c[2], 3.2, 12, { gap: [0.55, 0.75] });
    wall(...c[2], ...c[3], 1.6, 13, { gap: [0.3, 0.62] });
    wall(...c[3], ...c[0], 3.6, 14);
    // Interior pillars, one standing, others broken.
    let k = 0;
    for (const v of [-4, 0, 4]) for (const u of [-2.4, 2.4]) {
      const [px, pz] = L(u, v);
      pillar(px, pz, k === 1 ? 5.2 : 0.9 + R() * 1.8, k !== 1, 300 + k);
      k++;
    }
  }

  // ---------------- Round tower stump ----------------
  {
    const { x: tx, z: tz } = SITES.tower;
    const RR = mulberry(77);
    const TR = 2.9, ring = 22;
    for (let i = 0; i < ring; i++) {
      const a = i / ring * Math.PI * 2;
      if (a > 3.6 && a < 4.3) continue; // doorway gap
      const x = tx + Math.cos(a) * TR, z = tz + Math.sin(a) * TR;
      const gh = groundMin(x, z, 0.5) - 0.05;
      const colH = 1.2 + 5.5 * Math.pow(Math.max(0, Math.sin(a * 0.5 + 0.6)), 2) * (0.8 + RR() * 0.3);
      const rows = Math.round(colH / 0.45);
      for (let r = 0; r < rows; r++) {
        if (r === rows - 1 && RR() < 0.4) continue;
        const aa = a + (r % 2) * (Math.PI / ring);
        put(box, V(tx + Math.cos(aa) * TR, gh + r * 0.45 + 0.22, tz + Math.sin(aa) * TR), V(0, -aa, (RR() - 0.5) * 0.04), V(0.7, 0.42, 0.85), gh);
      }
      if (i % 2 === 0) obstacles.push({ x, z, r: 0.75 });
    }
    for (let i = 0; i < 7; i++) {
      const a = RR() * Math.PI * 2, d = TR + 1 + RR() * 2.5;
      const x = tx + Math.cos(a) * d, z = tz + Math.sin(a) * d, gh = groundMin(x, z, 0.4);
      put(box, V(x, gh + 0.15, z), V(RR() * 0.5, RR() * 3, RR() * 0.5), V(0.7, 0.4, 0.8), gh);
    }
  }

  // ---------------- Graveyard ----------------
  {
    const { x: gx, z: gz } = SITES.graveyard;
    const RR = mulberry(555);
    const stone = (() => {
      const s = new THREE.Shape();
      s.moveTo(-0.35, 0); s.lineTo(0.35, 0); s.lineTo(0.35, 0.75);
      s.quadraticCurveTo(0.35, 1.0, 0, 1.12); s.quadraticCurveTo(-0.35, 1.0, -0.35, 0.75); s.lineTo(-0.35, 0);
      return new THREE.ExtrudeGeometry(s, { depth: 0.16, bevelEnabled: false, curveSegments: 5 }).translate(0, 0, -0.08);
    })();
    const ga = Math.atan2(gz, gx);
    for (let row = 0; row < 3; row++) for (let i = 0; i < 6; i++) {
      if (RR() < 0.2) continue;
      const u = (i - 2.5) * 1.7 + (RR() - 0.5) * 0.5, v = (row - 1) * 2.4 + (RR() - 0.5) * 0.4;
      const x = gx + u * Math.cos(ga + Math.PI / 2) + v * Math.cos(ga), z = gz + u * Math.sin(ga + Math.PI / 2) + v * Math.sin(ga);
      const gh = groundMin(x, z, 0.4) - 0.1;
      const kind = RR();
      const rotY = -ga + Math.PI / 2 + (RR() - 0.5) * 0.3, tilt = (RR() - 0.5) * 0.35;
      if (kind < 0.7) {
        const sc = 0.8 + RR() * 0.5;
        put(stone, V(x, gh, z), V(tilt, rotY, (RR() - 0.5) * 0.2), V(sc, sc, sc), gh);
      } else {
        // Cross
        put(box, V(x, gh + 0.7, z), V(tilt, rotY, 0), V(0.18, 1.4, 0.16), gh);
        put(box, V(x, gh + 1.1, z), V(tilt, rotY, 0), V(0.75, 0.16, 0.16), gh);
      }
      // grave mound slab
      put(box, V(x + Math.cos(ga) * 0.9, gh + 0.08, z + Math.sin(ga) * 0.9), V(0, rotY, 0), V(0.8, 0.22, 1.5), gh);
      obstacles.push({ x, z, r: 0.45 });
      // Votive candles at the foot of some graves.
      if (RR() < 0.4) {
        for (let c = 0; c < 3; c++) {
          const cx = x + Math.cos(ga) * (0.35 + RR() * 0.3) + (RR() - 0.5) * 0.5, cz = z + Math.sin(ga) * (0.35 + RR() * 0.3) + (RR() - 0.5) * 0.5;
          const ch = 0.12 + RR() * 0.18, cg = heightAt(cx, cz);
          put(cyl8, V(cx, cg + ch / 2, cz), V(0, 0, 0), V(0.045, ch, 0.045), cg - 0.6);
          M.compose(V(cx, cg + ch + 0.05, cz), new THREE.Quaternion(), V(1, 1, 1));
          emissive.addGeometry(new THREE.OctahedronGeometry(0.045, 0).scale(1, 1.8, 1), M, 1);
        }
        candles.push(V(x + Math.cos(ga) * 0.6, heightAt(x, z) + 0.6, z + Math.sin(ga) * 0.6));
      }
    }
    // Low broken boundary wall.
    const [ax, az] = [gx + Math.cos(ga) * -5 + Math.cos(ga + Math.PI / 2) * -6, gz + Math.sin(ga) * -5 + Math.sin(ga + Math.PI / 2) * -6];
    const [bx, bz] = [gx + Math.cos(ga) * -5 + Math.cos(ga + Math.PI / 2) * 3, gz + Math.sin(ga) * -5 + Math.sin(ga + Math.PI / 2) * 3];
    wall(ax, az, bx, bz, 1.4, 21, { thick: 0.55 });
    const [cx2, cz2] = [gx + Math.cos(ga) * 5 + Math.cos(ga + Math.PI / 2) * -6, gz + Math.sin(ga) * 5 + Math.sin(ga + Math.PI / 2) * -6];
    wall(ax, az, cx2, cz2, 1.2, 22, { thick: 0.55 });
  }

  return { geometry: g.build(), emissive: emissive.build(), runes: runes.build(), candles };
}
