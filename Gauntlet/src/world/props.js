// Dark-fantasy set dressing: broken carts, banners, bones, weapon racks, candles, lone graves,
// stake barricades, gibbets, dead campfires and rubble. Everything is merged per material into
// world-space geometry (a handful of draw calls) and placed deterministically off the trail centres.
import * as THREE from 'three';
import { GeoBuilder, rockGeometry } from './geo.js';
import { mulberry, smoothstep } from './noise.js';
import { heightAt, pathAt, lakeSD, nearSpawn, SITES, OUTCROPS, ARENA_RADIUS, WATER, PATH_ANGLES } from './layout.js';
import { texSet, withFade } from './materials.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const Q = new THREE.Quaternion(), E = new THREE.Euler(), S = new THREE.Vector3(), M = new THREE.Matrix4();

function bannerTex() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  const R = mulberry(5150);
  g.fillStyle = '#7a2018'; g.fillRect(0, 0, 64, 128);
  for (let i = 0; i < 600; i++) { g.fillStyle = `rgba(${40 + R() * 50},${R() * 15},${R() * 10},0.3)`; g.fillRect(R() * 64, R() * 128, 2, 2 + R() * 6); }
  g.fillStyle = '#b08a48'; g.fillRect(0, 6, 64, 3); g.fillRect(0, 100, 64, 2);
  // faded sigil: inverted chevron + ring
  g.strokeStyle = 'rgba(200,160,80,0.85)'; g.lineWidth = 4;
  g.beginPath(); g.arc(32, 46, 13, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.moveTo(18, 66); g.lineTo(32, 84); g.lineTo(46, 66); g.stroke();
  // ragged swallow-tail bottom
  g.globalCompositeOperation = 'destination-out';
  g.beginPath(); g.moveTo(0, 128); g.lineTo(32, 104); g.lineTo(64, 128); g.fill();
  for (let i = 0; i < 26; i++) { g.beginPath(); g.arc(R() * 64, 100 + R() * 28, 2 + R() * 4, 0, Math.PI * 2); g.fill(); }
  for (let i = 0; i < 8; i++) { g.beginPath(); g.arc(R() < 0.5 ? 0 : 64, R() * 120, 2 + R() * 3, 0, Math.PI * 2); g.fill(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export function buildProps({ obstacles, grid, ruinMat, emberMat, seed = 777 }) {
  const R = mulberry(seed);
  const wood = new GeoBuilder(), metal = new GeoBuilder(), bone = new GeoBuilder(), stone = new GeoBuilder(), cloth = new GeoBuilder(), glow = new GeoBuilder();
  const candleSpots = [];
  const box = new THREE.BoxGeometry(1, 1, 1);
  const cyl = new THREE.CylinderGeometry(1, 1, 1, 7, 1);
  const cone = new THREE.ConeGeometry(1, 1, 6, 1);
  const sph = new THREE.IcosahedronGeometry(1, 1);
  const torus = new THREE.TorusGeometry(1, 0.1, 4, 14);

  // Local frame: position + yaw on the ground; parts placed in that frame.
  let F = new THREE.Matrix4();
  // Hero-relative scale: large props are built at 0.75x so carts/gibbets/banners don't dwarf the ~60 px heroes.
  let SC = 1;
  const aoSpots = [];
  const frame = (x, z, yaw, tilt = 0, ao = 0) => { E.set(tilt * (R() - 0.5), yaw, tilt * (R() - 0.5)); Q.setFromEuler(E); F = new THREE.Matrix4().compose(V(x, heightAt(x, z), z), Q, V(SC, SC, SC)); if (ao) aoSpots.push({ x, z, r: ao * SC }); };
  const part = (b, geo, p, r, s, color = 1) => {
    E.set(r[0], r[1], r[2]); Q.setFromEuler(E); S.set(s[0], s[1], s[2]);
    M.compose(p, Q, S); M.premultiply(F);
    b.addGeometry(geo, M, typeof color === 'function' ? color : (l, w) => color * (0.55 + 0.45 * smoothstep(-0.1, 1.0, w.y - F.elements[13])));
  };

  // ---- builders ----
  function cart() {
    const tilt = 0.18 + R() * 0.15;
    part(wood, box, V(0, 0.55, 0), [0, 0, tilt], [2.3, 0.1, 1.25], 0.9);
    for (const sz of [-0.6, 0.6]) part(wood, box, V(0.1, 0.78, sz), [0, 0, tilt], [2.1, 0.35, 0.07], 0.85);
    part(wood, box, V(-1.1, 0.78, 0.0), [0, 0, tilt + 0.3], [0.07, 0.35, 1.1], 0.8);
    // standing wheel (on the high side) and a fallen one
    const wheel = (p, r) => {
      part(wood, torus, p, r, [0.48, 0.48, 0.6], 0.8);
      for (let k = 0; k < 6; k++) part(wood, box, p, [r[0], r[1], r[2] + k * Math.PI / 6], [0.9, 0.05, 0.05], 0.75);
      part(wood, cyl, p, [r[0] + Math.PI / 2, r[1], r[2]], [0.09, 0.18, 0.09], 0.7);
    };
    wheel(V(0.6, 0.48, 0.7), [0, 0, 0]);
    wheel(V(1.0 + R(), 0.05, -1.3), [Math.PI / 2, 0, 0]);
    // shafts lying on the ground
    part(wood, box, V(-2.0, 0.08, 0.35), [0, 0.15, 0.05], [2.0, 0.08, 0.08], 0.75);
    part(wood, box, V(-2.1, 0.08, -0.4), [0, -0.1, 0.03], [2.0, 0.08, 0.08], 0.75);
    // spilled crates / sacks
    part(wood, box, V(1.6, 0.2, 0.2), [0, R(), 0.1], [0.45, 0.4, 0.45], 0.85);
    part(bone, sph, V(-0.6, 0.15, -1.0), [0, R() * 3, 0], [0.35, 0.18, 0.25], 0.55);
  }
  function banner() {
    const h = 3.2 + R() * 0.8, lean = (R() - 0.5) * 0.12;
    part(wood, cyl, V(0, h / 2, 0), [lean, 0, 0], [0.055, h, 0.055], 0.7);
    part(wood, box, V(0, h - 0.15, 0), [lean, 0, 0], [0.9, 0.06, 0.06], 0.7);
    part(metal, cone, V(0, h + 0.15, 0), [0, 0, 0], [0.06, 0.3, 0.06], 1);
    // cloth: hanging grid with folds
    const W = 0.75, Hh = 1.7 + R() * 0.4, nx = 4, ny = 6, base = cloth.count;
    for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
      const u = i / nx, v = j / ny;
      const p = V((u - 0.5) * W, h - 0.18 - v * Hh, 0.06 + Math.sin(u * Math.PI * 2.2 + j * 0.4) * 0.05 + v * v * 0.12);
      p.applyMatrix4(F);
      cloth.vert(p, V(0, 0, 1).transformDirection(F), u, 1 - v, 0.6 + 0.4 * (1 - v));
    }
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const a = base + j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1; cloth.tri(a, c, b); cloth.tri(b, c, d); }
  }
  function bones() {
    const n = 2 + Math.floor(R() * 4);
    for (let k = 0; k < n; k++) {
      const p = V((R() - 0.5) * 1.4, 0.03, (R() - 0.5) * 1.4), a = R() * 6.28, len = 0.3 + R() * 0.2;
      part(bone, cyl, p, [Math.PI / 2, a, 0], [0.025, len, 0.025], 1);
      const d = V(Math.sin(a), 0, Math.cos(a)).multiplyScalar(len / 2);
      part(bone, sph, p.clone().add(d), [0, 0, 0], [0.04, 0.035, 0.04], 1);
      part(bone, sph, p.clone().sub(d), [0, 0, 0], [0.04, 0.035, 0.04], 1);
    }
    if (R() < 0.75) {
      const p = V((R() - 0.5) * 0.8, 0.09, (R() - 0.5) * 0.8);
      part(bone, sph, p, [R() * 0.6, R() * 6, 0], [0.11, 0.1, 0.13], 1.05);
      part(bone, box, p.clone().add(V(0, -0.06, 0.07)), [0.3, 0, 0], [0.12, 0.04, 0.08], 0.9);
    }
    if (R() < 0.4) { // ribcage
      const p = V(0.2, 0.05, 0.1), a = R() * 6.28;
      for (let k = 0; k < 5; k++) part(bone, torus, p.clone().add(V(Math.sin(a) * k * 0.07, 0, Math.cos(a) * k * 0.07)), [0, a, 0], [0.15 - k * 0.012, 0.13, 0.4], 0.95);
    }
  }
  function rack() {
    for (const sx of [-0.8, 0.8]) {
      part(wood, box, V(sx, 0.6, 0.18), [0.25, 0, 0], [0.08, 1.3, 0.08], 0.75);
      part(wood, box, V(sx, 0.6, -0.18), [-0.25, 0, 0], [0.08, 1.3, 0.08], 0.75);
    }
    part(wood, box, V(0, 1.15, 0), [0, 0, 0], [1.8, 0.07, 0.07], 0.75);
    for (let k = 0; k < 4; k++) {
      const x = -0.6 + k * 0.4, lean = 0.25 + R() * 0.1;
      if (R() < 0.5) { // spear
        part(wood, cyl, V(x, 0.95, 0.25), [lean, 0, 0], [0.025, 1.9, 0.025], 0.7);
        part(metal, cone, V(x, 1.92, 0.25 - Math.sin(lean) * 0.95), [lean, 0, 0], [0.04, 0.22, 0.04], 1);
      } else { // sword
        part(metal, box, V(x, 0.75, 0.22), [lean, 0, 0], [0.07, 1.0, 0.015], 1);
        part(metal, box, V(x, 1.28, 0.22 - 0.13), [lean, 0, 0], [0.25, 0.04, 0.04], 0.8);
      }
    }
    part(wood, cyl, V(0.5, 0.35, -0.45), [-1.2, 0, 0], [0.38, 0.05, 0.38], 0.8); // shield leaning
    part(metal, sph, V(0.5, 0.38, -0.42), [-1.2, 0, 0], [0.08, 0.04, 0.08], 1);
  }
  function candles(n = 3 + Math.floor(R() * 5), spread = 0.5) {
    for (let k = 0; k < n; k++) {
      const p = V((R() - 0.5) * spread, 0, (R() - 0.5) * spread), h = 0.1 + R() * 0.25;
      part(bone, cyl, p.clone().setY(h / 2), [0, 0, 0], [0.04, h, 0.04], 1.1);
      E.set(0, 0, 0); Q.setFromEuler(E); M.compose(p.clone().setY(h + 0.05), Q, V(1, 1, 1)); M.premultiply(F);
      glow.addGeometry(new THREE.OctahedronGeometry(0.04, 0).scale(1, 1.8, 1), M, 1);
    }
    candleSpots.push(V(0, 0.5, 0).applyMatrix4(F));
  }
  function grave() {
    const s = 0.8 + R() * 0.4;
    part(stone, box, V(0, 0.5 * s, 0), [(R() - 0.5) * 0.3, 0, (R() - 0.5) * 0.25], [0.6 * s, 1.0 * s, 0.16], 1);
    part(stone, box, V(0, 0.08, 0.85), [0, 0, 0], [0.75, 0.2, 1.4], 0.9);
    if (R() < 0.4) candles(2 + Math.floor(R() * 3), 0.4);
  }
  function spikes() {
    for (const sx of [-1.2, 0, 1.2]) { const p = V(sx, 0, 0).applyMatrix4(F); obstacles.push({ x: p.x, z: p.z, r: 0.7 }); }
    part(wood, cyl, V(0, 0.35, 0), [0, 0, Math.PI / 2], [0.13, 3.0, 0.13], 0.7);
    for (let k = 0; k < 4; k++) {
      const x = -1.2 + k * 0.8;
      for (const s of [-1, 1]) {
        const r = [s * 0.75, 0, 0];
        part(wood, cyl, V(x, 0.45 + 0.35, s * 0.3), r, [0.05, 1.1, 0.05], 0.75);
        part(wood, cone, V(x, 0.45 + 0.78, s * 0.67), r, [0.05, 0.25, 0.05], 0.75);
      }
    }
  }
  function gibbet() {
    part(wood, box, V(0, 2.0, 0), [0, 0, 0], [0.18, 4.0, 0.18], 0.7);
    part(wood, box, V(0.65, 3.85, 0), [0, 0, 0], [1.4, 0.14, 0.14], 0.7);
    part(wood, box, V(0.3, 3.55, 0), [0, 0, 0.8], [0.7, 0.1, 0.1], 0.7);
    // hanging cage
    const c = V(1.2, 2.6, 0);
    for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; part(metal, box, c.clone().add(V(Math.cos(a) * 0.32, 0, Math.sin(a) * 0.32)), [0, 0, 0], [0.025, 1.3, 0.025], 1); }
    part(metal, torus, c.clone().add(V(0, 0.65, 0)), [Math.PI / 2, 0, 0], [0.33, 0.33, 0.3], 1);
    part(metal, torus, c.clone().add(V(0, -0.65, 0)), [Math.PI / 2, 0, 0], [0.33, 0.33, 0.3], 1);
    part(metal, box, c.clone().add(V(0, 0.95, 0)), [0, 0, 0], [0.02, 0.5, 0.02], 1);
    part(bone, sph, c.clone().add(V(0.05, -0.45, 0.05)), [0, 0, 0], [0.11, 0.1, 0.13], 1);
  }
  function campfire() {
    for (let k = 0; k < 9; k++) { const a = k / 9 * Math.PI * 2; part(stone, box, V(Math.cos(a) * 0.6, 0.08, Math.sin(a) * 0.6), [R(), a, R()], [0.25, 0.18, 0.22], 0.9); }
    for (let k = 0; k < 4; k++) part(wood, cyl, V(0, 0.12, 0), [Math.PI / 2 - 0.25, k * 0.8 + R(), 0], [0.06, 0.9, 0.06], 0.25);
    E.set(-Math.PI / 2, 0, 0); Q.setFromEuler(E); M.compose(V(0, 0.06, 0), Q, V(1, 1, 1)); M.premultiply(F);
    glow.addGeometry(new THREE.CircleGeometry(0.22, 8), M, 0.18);
    candleSpots.push(V(0, 0.6, 0).applyMatrix4(F));
  }
  const chunks = [1, 2, 3].map((k) => rockGeometry(600 + k, { sx: 1, sy: 0.75, sz: 0.85, rough: 0.12, cuts: 9, detail: 1, flatBottom: -0.5 }));
  const lightSpots = [];
  function brazier(withLight = false) {
    for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI * 2; part(metal, box, V(Math.cos(a) * 0.22, 0.6, Math.sin(a) * 0.22), [Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25], [0.06, 1.25, 0.06], 0.9); }
    part(metal, new THREE.CylinderGeometry(0.45, 0.24, 0.3, 10, 1, true), V(0, 1.3, 0), [0, 0, 0], [1, 1, 1], 0.9);
    part(metal, torus, V(0, 1.45, 0), [Math.PI / 2, 0, 0], [0.46, 0.46, 0.6], 1);
    E.set(-Math.PI / 2, 0, 0); Q.setFromEuler(E); M.compose(V(0, 1.38, 0), Q, V(1, 1, 1)); M.premultiply(F);
    metal.addGeometry(new THREE.CircleGeometry(0.4, 10), M, 0.1);
    for (let k = 0; k < 5; k++) { E.set(R(), R() * 3, R()); Q.setFromEuler(E); M.compose(V((R() - 0.5) * 0.4, 1.45, (R() - 0.5) * 0.4), Q, V(1, 1, 1)); M.premultiply(F); glow.addGeometry(new THREE.IcosahedronGeometry(0.06 + R() * 0.05, 0), M, 0.7); }
    if (withLight) lightSpots.push(V(0, 2.1, 0).applyMatrix4(F));
  }
  function rubble(n = 4 + Math.floor(R() * 7), spread = 1.2) {
    // Clustered: most pieces fall close to one heap centre, a few stragglers further out.
    for (let k = 0; k < n; k++) {
      const s = 0.12 + R() * R() * 0.45, far = R() < 0.25 ? 1 : 0.4;
      const v = 0.78 + R() * 0.2;
      part(stone, chunks[k % 3], V((R() - 0.5) * spread * 2 * far, s * 0.2, (R() - 0.5) * spread * 2 * far), [R() * 0.8, R() * 3, R() * 0.8], [s * (1 + R() * 0.6), s * 0.75, s], () => ({ r: v * 0.98, g: v * 0.96, b: v * 0.88 }));
    }
  }

  // ---- placement ----
  const blocked = (x, z, pad) => Math.hypot(x, z) > ARENA_RADIUS - 3 || heightAt(x, z) < WATER + 0.25 || lakeSD(x, z) < 2 || nearSpawn(x, z, 4)
    || OUTCROPS.some((o) => Math.hypot(x - o.x, z - o.z) < o.r + pad) || !grid.free(x, z, pad);
  // A spot beside a trail (edge band, never the centre lane) or anywhere off-trail.
  function spot(pad, mode = 'edge', rMin = 13, rMax = 55) {
    for (let t = 0; t < 200; t++) {
      let x, z;
      if (mode === 'edge') {
        const k = Math.floor(R() * PATH_ANGLES.length), rr = rMin + R() * (rMax - rMin);
        const ang = PATH_ANGLES[k] + 0.22 * Math.sin(rr * 0.075 + k * 2.1) * smoothstep(8, 22, rr) + (R() < 0.5 ? -1 : 1) * (3.2 + R() * 2.5) / rr;
        x = Math.cos(ang) * rr; z = Math.sin(ang) * rr;
      } else { const a = R() * Math.PI * 2, rr = rMin + R() * (rMax - rMin); x = Math.cos(a) * rr; z = Math.sin(a) * rr; }
      if (pathAt(x, z) > 0.35 || blocked(x, z, pad)) continue;
      return [x, z];
    }
    return null;
  }
  const yawToPath = (x, z) => Math.atan2(x, z) + Math.PI / 2 + (R() - 0.5) * 0.6;
  const place = (n, pad, mode, fn, obsR = 0, rMin, rMax, sc = 1) => {
    SC = sc;
    for (let i = 0; i < n; i++) {
      const s = spot(pad, mode, rMin, rMax); if (!s) continue;
      const [x, z] = s;
      frame(x, z, mode === 'edge' ? yawToPath(x, z) : R() * 6.28, 0.08, pad >= 0.8 ? pad : 0);
      fn();
      grid.add(x, z, pad);
      if (obsR) obstacles.push({ x, z, r: obsR * SC });
    }
  };
  // ---- Composition: dense focal clusters (war camps, landmark aprons), open ground between. ----
  const near = (cx, cz, rMin, rMax, pad) => {
    for (let t = 0; t < 60; t++) {
      const a = R() * Math.PI * 2, rr = rMin + R() * (rMax - rMin), x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
      if (pathAt(x, z) > 0.35 || blocked(x, z, pad)) continue;
      return [x, z];
    }
    return null;
  };
  const putAt = (xz, pad, fn, obsR, sc, yaw) => {
    if (!xz) return;
    const [x, z] = xz; SC = sc;
    frame(x, z, yaw ?? R() * 6.28, 0.08, pad >= 0.8 ? pad : 0); fn(); SC = 1;
    grid.add(x, z, pad);
    if (obsR) obstacles.push({ x, z, r: obsR * sc });
  };
  const camps = [];
  for (const [k, rr, side] of [[0, 33, 1], [2, 30, -1], [3, 38, 1]]) {
    const a = PATH_ANGLES[k] + 0.22 * Math.sin(rr * 0.075 + k * 2.1) + side * 6.5 / rr;
    let cx = Math.cos(a) * rr, cz = Math.sin(a) * rr;
    if (blocked(cx, cz, 1.0)) continue;
    camps.push([cx, cz]);
    putAt([cx, cz], 1.0, campfire, 0.75, 0.85);
    putAt(near(cx, cz, 2.6, 4.5, 1.6), 1.6, cart, 1.3, 0.75);
    putAt(near(cx, cz, 2.4, 4.0, 1.0), 1.0, rack, 0.9, 0.75);
    putAt(near(cx, cz, 3.0, 5.0, 1.4), 1.4, spikes, 0, 0.75);
    for (let i = 0; i < 3; i++) putAt(near(cx, cz, 1.5, 5.5, 0.5), 0.5, bones, 0, 1);
    putAt(near(cx, cz, 2.0, 5.0, 0.8), 0.8, rubble, 0, 1);
  }
  // Gibbets mark the approach to the tower and the graveyard.
  putAt(near(SITES.tower.x, SITES.tower.z, 6, 9, 1.0), 1.0, gibbet, 0.45, 0.72);
  putAt(near(SITES.graveyard.x, SITES.graveyard.z, 8, 11, 1.0), 1.0, gibbet, 0.45, 0.72);
  // Lone graves cluster outside the chapel (a burial ground spilling out of the ruin).
  for (let i = 0; i < 7; i++) putAt(near(SITES.chapel.x, SITES.chapel.z, 10, 14, 0.8), 0.8, grave, 0.4, 0.85);
  // Bones and rubble pile up against walls, outcrops and ruin aprons, not across open ground.
  for (const o of OUTCROPS) for (let i = 0; i < 2; i++) putAt(near(o.x, o.z, o.r * 0.9, o.r * 1.3, 0.6), 0.6, i ? rubble : bones, 0, 1);
  SC = 1;
  // Spike barricades get obstacle circles along their length (they were placed with yaw in F).
  // (Handled approximately: one circle per barricade end.)
  // Banners flanking each trail where it enters the plaza, and at the chapel door.
  for (const a of PATH_ANGLES) for (const s of [-1, 1]) {
    const rr = 13.5, ang = a + s * 2.6 / rr;
    const x = Math.cos(ang) * rr, z = Math.sin(ang) * rr;
    if (nearSpawn(x, z, 3)) continue;
    SC = 0.78; frame(x, z, -ang + Math.PI / 2, 0); banner(); SC = 1; grid.add(x, z, 0.4); obstacles.push({ x, z, r: 0.3 });
  }
  { const c = SITES.chapel; for (const s of [-1, 1]) { const ang = Math.atan2(c.z, c.x) + s * 0.13; const x = Math.cos(ang) * (Math.hypot(c.x, c.z) - 9.5), z = Math.sin(ang) * (Math.hypot(c.x, c.z) - 9.5); SC = 0.78; frame(x, z, -ang, 0); banner(); SC = 1; obstacles.push({ x, z, r: 0.3 }); } }
  // Braziers: flanking the chapel door (one real light between them) and at the tower doorway.
  { const c = SITES.chapel, ang = Math.atan2(c.z, c.x), d = Math.hypot(c.x, c.z) - 9.2;
    for (const sd of [-1, 1]) { const a = ang + sd * 0.075; const x = Math.cos(a) * d, z = Math.sin(a) * d; frame(x, z, 0, 0); brazier(sd === 1); obstacles.push({ x, z, r: 0.45 }); grid.add(x, z, 0.6); } }
  { const t = SITES.tower; const a = 3.95, x = t.x + Math.cos(a) * 4.2, z = t.z + Math.sin(a) * 4.2; frame(x, z, 0, 0); brazier(false); obstacles.push({ x, z, r: 0.45 }); grid.add(x, z, 0.6); }
  // Candles and rubble around the plaza and the ruins.
  for (let i = 0; i < 12; i++) { const a = R() * Math.PI * 2, rr = 5 + R() * 6; const x = Math.cos(a) * rr, z = Math.sin(a) * rr; if (Math.hypot(x, z - 6) < 2.5) continue; frame(x, z, R() * 6, 0); candles(); }
  for (let i = 0; i < 12; i++) { const a = R() * Math.PI * 2, rr = 8 + R() * 6; const x = Math.cos(a) * rr, z = Math.sin(a) * rr; if (Math.hypot(x, z - 6) < 2.5) continue; frame(x, z, R() * 6, 0); rubble(3 + Math.floor(R() * 4), 0.7); }
  for (const k of ['chapel', 'tower', 'graveyard']) {
    const c = SITES[k];
    for (let i = 0; i < 10; i++) { const a = R() * Math.PI * 2, rr = 3 + R() * 9; const x = c.x + Math.cos(a) * rr, z = c.z + Math.sin(a) * rr; if (nearSpawn(x, z, 3) || heightAt(x, z) < WATER + 0.2) continue; frame(x, z, R() * 6, 0.05); if (i % 3 === 0) bones(); else rubble(); if (i % 4 === 0) candles(); }
  }

  // ---- materials & meshes ----
  const bark = texSet('pine_bark');
  const woodMat = withFade(new THREE.MeshStandardMaterial({ map: bark.d, normalMap: bark.n, color: 0xc8b49a, roughness: 0.9, vertexColors: true }));
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x8a8884, metalness: 0.75, roughness: 0.4, vertexColors: true });
  const boneMat = new THREE.MeshStandardMaterial({ color: 0xcfc4a8, roughness: 0.75, vertexColors: true });
  const clothMat = new THREE.MeshStandardMaterial({ map: bannerTex(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.95, vertexColors: true, color: 0xffffff, emissive: 0x1a0402 });
  const out = [];
  for (const [b, m, cast] of [[wood, woodMat, true], [metal, metalMat, true], [bone, boneMat, false], [stone, ruinMat, true], [cloth, clothMat, true], [glow, emberMat, false]]) {
    if (!b.count) continue;
    const mesh = new THREE.Mesh(b.build(), m);
    mesh.castShadow = cast; mesh.receiveShadow = true; mesh.name = 'world-props';
    out.push(mesh);
  }
  return { meshes: out, candleSpots, aoSpots, lightSpots };
}

// Faint contact grime under ruin footprints: irregular, noise-warped blobs elongated along a random
// axis and pushed toward the shadow side (sun comes from -x,-z). Alpha is carried per vertex.
export function buildAODecals(spots, shadowDir = new THREE.Vector2(0.62, 0.78).normalize()) {
  const R = mulberry(9191);
  const b = new GeoBuilder();
  const SEG = 14;
  for (const s of spots) {
    const yaw = R() * Math.PI, ex = 1.0 + R() * 0.6, ez = 0.6 + R() * 0.3, r = s.r * 1.15;
    const cx = s.x + shadowDir.x * r * 0.35, cz = s.z + shadowDir.y * r * 0.35;
    const ca = Math.cos(yaw), sa = Math.sin(yaw);
    const c = b.vert(V(cx, heightAt(cx, cz) + 0.03, cz), V(0, 1, 0), 0, 0, 1);
    const ring = [], mid = [];
    for (let i = 0; i < SEG; i++) {
      const a = (i / SEG) * Math.PI * 2;
      const warp = 0.65 + 0.7 * R();
      const lx = Math.cos(a) * ex * r * warp, lz = Math.sin(a) * ez * r * warp;
      const x = cx + lx * ca - lz * sa, z = cz + lx * sa + lz * ca;
      const mx = cx + (x - cx) * 0.5, mz = cz + (z - cz) * 0.5;
      mid.push(b.vert(V(mx, heightAt(mx, mz) + 0.03, mz), V(0, 1, 0), 0, 0, 0.6));
      ring.push(b.vert(V(x, heightAt(x, z) + 0.03, z), V(0, 1, 0), 0, 0, 0));
    }
    for (let i = 0; i < SEG; i++) {
      const j = (i + 1) % SEG;
      b.tri(c, mid[j], mid[i]);
      b.tri(mid[i], mid[j], ring[i]); b.tri(ring[i], mid[j], ring[j]);
    }
  }
  const mat = new THREE.MeshBasicMaterial({ color: 0x000000, vertexColors: true, transparent: true, opacity: 0.13, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', 'diffuseColor.a *= vColor.r; diffuseColor.rgb = vec3(0.0);');
  };
  mat.customProgramCacheKey = () => 'world-ao-v2';
  const mesh = new THREE.Mesh(b.build(), mat);
  mesh.name = 'world-ao';
  return mesh;
}
