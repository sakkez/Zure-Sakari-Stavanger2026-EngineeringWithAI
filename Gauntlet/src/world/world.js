// World: terrain, lake, vegetation, rocks and gothic ruins. heightAt(x,z) is the gameplay ground query.
// Layout/height functions live in layout.js; this file assembles meshes and fills obstacles[].
import * as THREE from 'three';
import {
  ARENA_RADIUS, WATER, heightAt, slopeAt, surfaceAt, forestAt, pathAt, lakeSD, rimAt, nearSpawn,
  OUTCROPS, SITES, LAKE, PUDDLES, puddleDist,
} from './layout.js';
import { mulberry, noise, smoothstep } from './noise.js';
import { buildTerrain, TERRAIN_DEBUG } from './terrain.js';
import { buildWater } from './water.js';
import { buildRuins } from './ruins.js';
import { buildMist } from './mist.js';
import { buildProps, buildAODecals } from './props.js';
import { texSet, triplanarMaterial, addWind, withFade, OCC } from './materials.js';
import { rockGeometry } from './geo.js';
import { coniferGeometry, deadTreeGeometry, grassGeometry, logGeometry, grassVariant, brackenGeometry, heatherGeometry, brokenBushGeometry } from './vegetation.js';
import { firBranchTex, grassTex, wispTex, brackenTex, heatherTex, leafClusterTex } from './cardtex.js';

export { ARENA_RADIUS, heightAt, mulberry };

// Collects instance transforms per (geometry, material) and builds one InstancedMesh per spatial tile,
// so frustum culling (camera and shadow camera) skips off-screen vegetation.
const TILE = 40;
class Batch {
  constructor(geo, mat, { cast = true, receive = true, tile = cast ? 64 : TILE } = {}) { this.geo = geo; this.mat = mat; this.tiles = new Map(); this.cast = cast; this.receive = receive; this.tile = tile; }
  add(matrix, color) {
    const k = Math.floor(matrix.elements[12] / this.tile) + ',' + Math.floor(matrix.elements[14] / this.tile);
    let t = this.tiles.get(k); if (!t) this.tiles.set(k, (t = { m: [], c: [] }));
    t.m.push(matrix.clone()); t.c.push(color ? color.clone() : null);
  }
  build(scene, out, key = "") {
    for (const t of this.tiles.values()) {
      const im = new THREE.InstancedMesh(this.geo, this.mat, t.m.length);
      for (let i = 0; i < t.m.length; i++) { im.setMatrixAt(i, t.m[i]); if (t.c[i]) im.setColorAt(i, t.c[i]); }
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.castShadow = this.cast; im.receiveShadow = this.receive; im.name = "world-inst-" + key;
      im.computeBoundingSphere();
      scene.add(im); out.push(im);
    }
  }
}

// Spatial hash for spacing checks.
class Grid {
  constructor(cell = 4) { this.cell = cell; this.map = new Map(); }
  key(x, z) { return Math.floor(x / this.cell) + ',' + Math.floor(z / this.cell); }
  add(x, z, r) { const k = this.key(x, z); if (!this.map.has(k)) this.map.set(k, []); this.map.get(k).push({ x, z, r }); }
  free(x, z, r) {
    const cx = Math.floor(x / this.cell), cz = Math.floor(z / this.cell);
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
      const l = this.map.get((cx + i) + ',' + (cz + j)); if (!l) continue;
      for (const o of l) if (Math.hypot(x - o.x, z - o.z) < r + o.r) return false;
    }
    return true;
  }
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
function mat4(x, y, z, ry, sx, sy = sx, sz = sx, rx = 0, rz = 0) {
  _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e); _s.set(sx, sy, sz); _p.set(x, y, z);
  return _m.compose(_p, _q, _s);
}

export function createWorld(engine) {
  const { scene } = engine;
  const uTime = { value: 0 };
  const obstacles = [];
  const grid = new Grid(4);
  const block = (x, z, r, solid = true) => { grid.add(x, z, r); if (solid) obstacles.push({ x, z, r }); };

  // ---------- Terrain + water ----------
  scene.add(buildTerrain());
  const WU = { uHorizon: { value: new THREE.Color(0.3, 0.33, 0.38) }, uZenith: { value: new THREE.Color(0.07, 0.09, 0.12) }, uSunDir: { value: new THREE.Vector3(0.5, 0.7, 0.3).normalize() }, uSunCol: { value: new THREE.Color(1, 0.85, 0.7) } };
  scene.add(buildWater(uTime, WU));

  // ---------- Ruins ----------
  const ruinObs = [];
  const ruins = buildRuins(ruinObs);
  const ruinMat = triplanarMaterial({
    set: texSet('castle_brick_broken_06'), scale: 0.42, tint: 0xe2e2e0, desat: 0.7, vertexColors: true,
    top: texSet('leafy_grass'), topScale: 0.5, topAmount: 0.46, topTint: 0x5f6a40, normalStrength: 1.2,
  });
  withFade(ruinMat);
  const ruinMesh = new THREE.Mesh(ruins.geometry, ruinMat);
  ruinMesh.castShadow = ruinMesh.receiveShadow = true;
  scene.add(ruinMesh);
  const emberMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 0.9, 0.22), toneMapped: true });
  const embers = new THREE.Mesh(ruins.emissive, emberMat);
  scene.add(embers);
  const runeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.1, 0.14, 0.06), vertexColors: true, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending });
  scene.add(new THREE.Mesh(ruins.runes, runeMat));
  const shrineLight = new THREE.PointLight(0xff7a30, 60, 15, 2);
  shrineLight.position.set(0, 2.0, 1.4);
  scene.add(shrineLight);
  for (const o of ruinObs) block(o.x, o.z, o.r);
  // Set dressing claims its spots before vegetation fills the grid.
  const props = buildProps({ obstacles, grid, ruinMat, emberMat });
  for (const m of props.meshes) scene.add(m);
  // World light budget: exactly 3 point lights (shrine braziers, graveyard candles, chapel brazier).
  const brazierLight = new THREE.PointLight(0xff8a3a, 0, 13, 2);
  if (props.lightSpots[0]) { brazierLight.position.copy(props.lightSpots[0]); brazierLight.intensity = 30; }
  scene.add(brazierLight);
  // Props cast real shadows, so only ruin footprints get the faint contact grime.
  scene.add(buildAODecals(ruinObs.filter((o) => o.r >= 0.6).map((o) => ({ x: o.x, z: o.z, r: o.r }))));
  // One warm light over the graveyard candles (average of candle spots).
  let graveLight = null;
  if (ruins.candles.length) {
    const c = ruins.candles.reduce((a, b) => a.add(b), new THREE.Vector3()).multiplyScalar(1 / ruins.candles.length);
    graveLight = new THREE.PointLight(0xffa050, 14, 11, 2);
    graveLight.position.copy(c).add(new THREE.Vector3(0, 0.8, 0));
    scene.add(graveLight);
  }
  const mist = buildMist(uTime);
  scene.add(mist.mesh);

  // ---------- Materials ----------
  const bark = texSet('pine_bark');
  const barkMat = new THREE.MeshStandardMaterial({ map: bark.d, normalMap: bark.n, roughnessMap: bark.r, color: 0x8c8178, vertexColors: true });
  const deadMat = new THREE.MeshStandardMaterial({ map: bark.d, normalMap: bark.n, roughnessMap: bark.r, color: 0x6a6460, vertexColors: true });
  const windMat = (map, amp, stiff, opts = {}) => {
    const m = new THREE.MeshStandardMaterial({ map, alphaTest: 0.42, side: THREE.DoubleSide, vertexColors: true, roughness: 0.92, ...opts });
    m.onBeforeCompile = (sh) => addWind(sh, uTime, amp, stiff);
    m.customProgramCacheKey = () => `wind-${amp}-${stiff}`;
    return m;
  };
  withFade(barkMat); withFade(deadMat);
  const needleMat = withFade(windMat(firBranchTex(), 0.0035, 1.6));
  const grassMat = windMat(grassTex(), 0.16, 1.5);
  const wispMat = windMat(wispTex(), 0.12, 1.6);
  const brackenMat = windMat(brackenTex(), 0.05, 1.3);
  const heatherMat = windMat(heatherTex(), 0.06, 1.4);
  const bushMat = windMat(leafClusterTex(), 0.05, 1.3);
  const rockMat = triplanarMaterial({ set: texSet('mossy_rock'), scale: 0.32, tint: 0xa8a8a8, desat: 0.3, vertexColors: true, top: texSet('leafy_grass'), topScale: 0.4, topAmount: 0.52, topTint: 0x5e6c3c });
  const cliffMat = withFade(triplanarMaterial({ set: texSet('rock_face_03'), scale: 0.14, tint: 0xc2c4c6, desat: 0.4, vertexColors: true, normalStrength: 1.4, top: texSet('leafy_grass'), topScale: 0.35, topAmount: 0.3, topTint: 0x66704a }));

  // ---------- Geometry variants ----------
  const conifers = [0, 1].map((i) => coniferGeometry(i + 1));
  const deads = [0, 1].map((i) => deadTreeGeometry(i + 1));
  const boulderGeos = [0, 1].map((i) => rockGeometry(i + 1, { sx: 1, sy: 0.72, sz: 0.9 + i * 0.08, rough: 0.2, cuts: 10 + i * 3, detail: 4 }));
  const cliffGeos = [0, 1, 2].map((i) => rockGeometry(i + 11, { sx: 1.0, sy: 1.4, sz: 0.8, rough: 0.25, cuts: 14, strata: 4, detail: 4, flatBottom: -0.7 }));
  const logs = [logGeometry(1)];

  const B = {
    trunk: conifers.map((c) => new Batch(c.trunk, barkMat, { cast: false, tile: 64 })),
    needles: conifers.map((c) => new Batch(c.foliage, needleMat)),
    dead: deads.map((d) => new Batch(d.bark, deadMat)),
    // Rim forest (beyond r 52) does not cast sun shadows into the playable area.
    needlesFar: conifers.map((c) => new Batch(c.foliage, needleMat, { cast: false, tile: 64 })),
    deadFar: deads.map((d) => new Batch(d.bark, deadMat, { cast: false, tile: 64 })),
    boulder: boulderGeos.map((g) => new Batch(g, rockMat)),
    cliff: cliffGeos.map((g) => new Batch(g, cliffMat)),
    log: logs.map((l) => new Batch(l.geo, deadMat)),
    grass: [new Batch(grassVariant(0), grassMat, { cast: false }), new Batch(grassVariant(1), wispMat, { cast: false }), new Batch(grassVariant(2), grassMat, { cast: false })],
    bracken: [new Batch(brackenGeometry(1), brackenMat, { cast: false }), new Batch(brackenGeometry(2), brackenMat, { cast: false })],
    heather: new Batch(heatherGeometry(1), heatherMat, { cast: false }),
    bush: [new Batch(brokenBushGeometry(1), bushMat), new Batch(brokenBushGeometry(2), bushMat)],
    pebble: new Batch(rockGeometry(7, { sx: 1, sy: 0.6, sz: 0.9, rough: 0.2, cuts: 7, detail: 1 }), rockMat, { cast: false }),
  };
  const col = new THREE.Color();
  const R = mulberry(1337);

  const nearSite = (x, z, pad) => {
    for (const k in SITES) { const s = SITES[k]; const rr = k === 'shrine' ? 13 : k === 'chapel' ? 11 : 7; if (Math.hypot(x - s.x, z - s.z) < rr + pad) return true; }
    return false;
  };
  // Landmarks are where fights get framed: keep the camera side (+z, ~24 m) of each one free of trees.
  const cameraSideOfSite = (x, z) => Object.values(SITES).some((s) => z > s.z - 4 && z - s.z < 24 && Math.abs(x - s.x) < 16);
  const inOutcrop = (x, z, f = 1) => OUTCROPS.some((o) => Math.hypot(x - o.x, z - o.z) < o.r * f);

  // ---------- Outcrops: big stratified rocks ----------
  for (const o of OUTCROPS) {
    const n = 9 + Math.floor(o.r * 1.4);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 * 2.6 + R() * 0.8, d = i === 0 ? 0 : o.r * (0.25 + 0.7 * Math.sqrt(R()));
      const x = o.x + Math.cos(a) * d, z = o.z + Math.sin(a) * d;
      const s = i === 0 ? 2.6 + R() : 1.1 + R() * 1.7 * (1.15 - d / o.r);
      const y = heightAt(x, z) - s * 0.45;
      B.cliff[i % 3].add(mat4(x, y, z, R() * 6.28, s * (0.9 + R() * 0.4), s * (0.8 + R() * 0.7), s, (R() - 0.5) * 0.3, (R() - 0.5) * 0.3), col.setHSL(0.08, 0.05, 0.75 + R() * 0.3));
      block(x, z, s * 0.85);
    }
    block(o.x, o.z, o.r * 0.7);
  }
  // ---------- Rim cliffs: crags along the arena boundary ----------
  for (let i = 0; i < 150; i++) {
    const a = (i / 150) * Math.PI * 2 + R() * 0.03;
    let lo = 50, hi = 75;
    for (let k = 0; k < 18; k++) { const m = (lo + hi) / 2; if (rimAt(Math.cos(a) * m, Math.sin(a) * m) < 0) lo = m; else hi = m; }
    const rr = lo + 0.5 + R() * 3.5 + (i % 3 === 0 ? 7 : 0);
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    if (lakeSD(x, z) < 3) continue;
    const s = 1.6 + R() * 1.8;
    B.cliff[i % 3].add(mat4(x, heightAt(x, z) - s * 0.75, z, R() * 6.28, s * (1 + R() * 0.6), s * (0.8 + R() * 0.8), s, (R() - 0.5) * 0.4, (R() - 0.5) * 0.4), col.setHSL(0.08, 0.05, 0.7 + R() * 0.3));
    block(x, z, s * 0.8, rr < ARENA_RADIUS + 6);
  }

  // ---------- Trees ----------
  const STEP = 2.7;
  for (let gx = -98; gx <= 98; gx += STEP) for (let gz = -98; gz <= 98; gz += STEP) {
    const x = gx + (R() - 0.5) * STEP * 0.9, z = gz + (R() - 0.5) * STEP * 0.9;
    const r = Math.hypot(x, z);
    if (r > 102) continue;
    const roll = R();
    const f = forestAt(x, z);
    // Forest lives at the rim; the combat interior keeps only sparse trees well away from landmarks.
    let p = f * (r < ARENA_RADIUS ? 0.5 * smoothstep(32, 52, r) : 0.8);
    if (r > 38 && r < ARENA_RADIUS) p = Math.max(p, 0.012);
    if (roll > p) continue;
    const h = heightAt(x, z);
    if (h < WATER + 0.35 || lakeSD(x, z) < 2.5) continue;
    if (r < 15 || cameraSideOfSite(x, z) || nearSpawn(x, z, 8) || pathAt(x, z) > 0.2 || nearSite(x, z, 7) || inOutcrop(x, z, 1.05) || lakeSD(x, z) < 6) continue;
    const slope = slopeAt(x, z);
    if (slope > 0.95) continue;
    const dead = R() < (r < ARENA_RADIUS ? 0.28 : 0.1) || Math.hypot(x - SITES.graveyard.x, z - SITES.graveyard.z) < 22 && R() < 0.7;
    const s = (dead ? 0.85 : 0.75) + R() * 0.5 + (r > 64 ? 0.25 : 0);
    if (!grid.free(x, z, dead ? 1.0 : 1.3 * s)) continue;
    const v = Math.floor(R() * 2);
    const m = mat4(x, h - 0.1, z, R() * 6.28, s, s * (0.9 + R() * 0.25), s, (R() - 0.5) * 0.06, (R() - 0.5) * 0.06);
    if (dead) {
      (r > 52 ? B.deadFar : B.dead)[v].add(m, col.setHSL(0.07, 0.08, 0.6 + R() * 0.3));
      block(x, z, 0.45 * s, r < ARENA_RADIUS + 6);
    } else {
      B.trunk[v].add(m, col.setHSL(0.07, 0.1, 0.7 + R() * 0.3));
      (r > 52 ? B.needlesFar : B.needles)[v].add(m, col.setHSL(0.2 + R() * 0.1, 0.2 + R() * 0.2, 0.68 + R() * 0.25));
      block(x, z, 0.5 * s, r < ARENA_RADIUS + 6);
    }
  }

  // ---------- Boulders & pebbles ----------
  for (let i = 0; i < 2600; i++) {
    const a = R() * Math.PI * 2, r = Math.sqrt(R()) * 92;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const h = heightAt(x, z);
    if (h < WATER - 0.6) continue;
    const big = i < 340;
    const slope = slopeAt(x, z);
    const rocky = smoothstep(0.4, 0.9, slope) + forestAt(x, z) * 0.35 + (lakeSD(x, z) < 3 && lakeSD(x, z) > -1.5 ? 0.6 : 0) + smoothstep(-6, 0, rimAt(x, z)) * 0.6;
    if (R() > 0.12 + rocky) continue;
    if (r < 13 && big) continue;
    if (big && (nearSpawn(x, z, 4) || pathAt(x, z) > 0.3)) continue;
    const s = big ? 0.5 + R() * R() * 1.6 : 0.08 + R() * 0.22;
    if (big && !grid.free(x, z, s * 0.9)) continue;
    const v = i % 2;
    (big ? B.boulder[v] : B.pebble).add(mat4(x, h - s * 0.25, z, R() * 6.28, s * (0.8 + R() * 0.5), s * (0.7 + R() * 0.5), s, (R() - 0.5) * 0.4, (R() - 0.5) * 0.4), big ? col.setHSL(0.1, 0.06, 0.7 + R() * 0.35) : col.setRGB(1.2, 1.17, 1.12).multiplyScalar(0.9 + R() * 0.6));
    if (big && s > 0.45) block(x, z, s * 0.85, r < ARENA_RADIUS + 6);
    else if (big) grid.add(x, z, s * 0.8);
  }

  // ---------- Trail-edge stones and forest-floor twigs ----------
  B.twig = new Batch(logs[0].geo, deadMat, { cast: false });
  for (let i = 0; i < 26000; i++) {
    const x = (R() - 0.5) * 170, z = (R() - 0.5) * 170;
    const pth = pathAt(x, z), f = forestAt(x, z);
    const edge = pth > 0.1 && pth < 0.75 ? 1 - Math.abs(pth - 0.4) * 2.2 : 0;
    if (edge > 0 && R() < edge * 0.28) {
      const h = heightAt(x, z), s = 0.07 + R() * R() * 0.3;
      B.pebble.add(mat4(x, h - s * 0.2, z, R() * 6.28, s * (0.8 + R() * 0.6), s * (0.6 + R() * 0.5), s), col.setRGB(1.2, 1.17, 1.12).multiplyScalar(0.9 + R() * 0.6));
    } else if (f > 0.5 && R() < f * 0.035) {
      const h = heightAt(x, z), s = 0.06 + R() * 0.07;
      B.twig.add(mat4(x, h + 0.01, z, R() * 6.28, s * 1.4, s * 0.5, s * 0.5, 0, (R() - 0.5) * 0.2), col.setHSL(0.07, 0.15, 0.55 + R() * 0.3));
    }
  }

  // ---------- Lake: deep water is impassable, reeds along the shore ----------
  for (let x = -40; x <= 60; x += 2.2) for (let z = -10; z <= 75; z += 2.2) {
    const sd = lakeSD(x, z);
    if (sd > 4) continue;
    if (WATER - heightAt(x, z) > 0.75) obstacles.push({ x, z, r: 1.7 });
  }
  B.reed = new Batch(grassGeometry(), grassMat, { cast: false });
  for (let i = 0; i < 9000; i++) {
    const x = LAKE.x + (R() - 0.5) * 60, z = LAKE.z + (R() - 0.5) * 60;
    const sd = lakeSD(x, z);
    if (sd < -2.2 || sd > 1.2 || R() > 0.9 * smoothstep(0.4, 0.62, noise(x * 0.25 + 9, z * 0.25))) continue;
    const h = heightAt(x, z), s = 0.7 + R() * 0.6;
    B.reed.add(mat4(x, h - 0.05, z, R() * 6.28, s * 0.55, s * (2.4 + R() * 1.6), s * 0.55), col.setHSL(0.14 + R() * 0.06, 0.22, 0.36 + R() * 0.2));
  }
  // Bog puddles: reed beds in clumps on part of the shore, and half-sunk stones along the bank.
  for (const pd of PUDDLES) {
    const span = pd.r * 2.6 * (pd.e || 1);
    for (let i = 0; i < 700; i++) {
      const x = pd.x + (R() - 0.5) * 2 * span, z = pd.z + (R() - 0.5) * 2 * span;
      const d = puddleDist(pd, x, z);
      if (d < 0.75 || d > 1.3) continue;
      const clumpN = noise(x * 0.35 + 21, z * 0.35 - 4);
      if (R() < smoothstep(0.5, 0.68, clumpN) * 0.7) {
        const h = heightAt(x, z), s = 0.6 + R() * 0.5;
        B.reed.add(mat4(x, h - 0.05, z, R() * 6.28, s * 0.55, s * (2.0 + R() * 1.6), s * 0.55), col.setHSL(0.13 + R() * 0.06, 0.22, 0.36 + R() * 0.2));
      } else if (d > 0.95 && R() < 0.035) {
        const h = heightAt(x, z), s = 0.18 + R() * R() * 0.5;
        B.boulder[i % 2].add(mat4(x, h - s * 0.35, z, R() * 6.28, s * 1.2, s * 0.7, s), col.setHSL(0.1, 0.05, 0.62 + R() * 0.25));
      }
    }
  }

  // ---------- Fallen logs ----------
  let logsPlaced = 0;
  for (let i = 0; i < 400 && logsPlaced < 30; i++) {
    const a = R() * Math.PI * 2, r = 16 + R() * 60;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (forestAt(x, z) < 0.25 && R() > 0.15) continue;
    const L = logs[0], ry = R() * Math.PI;
    const dx = Math.cos(ry) * L.length / 2, dz = -Math.sin(ry) * L.length / 2;
    const h0 = heightAt(x - dx, z - dz), h1 = heightAt(x + dx, z + dz);
    if (Math.min(h0, h1) < WATER + 0.2 || Math.abs(h0 - h1) > 1.0) continue;
    if (nearSpawn(x, z, 5) || pathAt(x, z) > 0.2 || nearSite(x, z, 2) || inOutcrop(x, z, 1.2)) continue;
    if (!grid.free(x - dx, z - dz, 0.6) || !grid.free(x, z, 0.6) || !grid.free(x + dx, z + dz, 0.6)) continue;
    const tilt = Math.atan2(h1 - h0, L.length);
    B.log[0].add(mat4(x, (h0 + h1) / 2 - 0.12, z, ry, 1, 1, 1, 0, tilt), col.setHSL(0.07, 0.1, 0.75 + R() * 0.25));
    for (const t of [-0.35, 0, 0.35]) block(x + dx * t * 2, z + dz * t * 2, L.radius + 0.25, r < ARENA_RADIUS + 6);
    logsPlaced++;
  }

  // ---------- Ground cover: clumped grass (3 variants), bracken, heather, ragged bushes ----------
  const GS = 0.75;
  for (let gx = -92; gx <= 92; gx += GS) for (let gz = -92; gz <= 92; gz += GS) {
    const x = gx + (R() - 0.5) * GS, z = gz + (R() - 0.5) * GS;
    const r = Math.hypot(x, z);
    if (r > 92) continue;
    const h = heightAt(x, z);
    if (h < WATER + 0.05) continue;
    const w = surfaceAt(x, z, undefined, h);
    const clump = noise(x * 0.09 + 40, z * 0.09) * 0.6 + noise(x * 0.37 - 7, z * 0.37 + 3) * 0.4;
    // Clumps at two scales, inside large clearings where the sward gives way to bare ground.
    const dens = smoothstep(0.4, 0.72, clump) * smoothstep(0.28, 0.5, noise(x * 0.024 + 5, z * 0.024 - 9));
    const kindN = noise(x * 0.045 + 90, z * 0.045 - 30);
    const f = forestAt(x, z);
    const far = r > 70 ? 0.55 : 1;
    if (R() < w[0] * dens * 1.35 * far) {
      const n = 1 + Math.floor(R() * (1 + dens * 3));
      for (let k = 0; k < n; k++) {
        const ox = x + (R() - 0.5) * 0.9, oz = z + (R() - 0.5) * 0.9, oh = k ? heightAt(ox, oz) : h;
        const kind = kindN > 0.62 && R() < 0.7 ? 1 : (w[3] > 0.2 || R() < 0.25) ? 2 : 0;
        const sc = 0.45 + dens * 0.55 + R() * 0.35;
        const pal = noise(ox * 0.06 - 13, oz * 0.06 + 31) + (R() - 0.5) * 0.25;
        if (pal < 0.38) col.setHSL(0.24 + R() * 0.04, 0.32 + R() * 0.12, 0.34 + R() * 0.14);      // dark green
        else if (pal < 0.62) col.setHSL(0.17 + R() * 0.04, 0.34 + R() * 0.12, 0.46 + R() * 0.16); // olive
        else col.setHSL(0.1 + R() * 0.04, 0.42 + R() * 0.12, 0.55 + R() * 0.15);                  // ochre
        const scK = (0.75 + R() * 0.5) * (pal > 0.62 ? 1.15 : 1);
        B.grass[kind].add(mat4(ox, oh - 0.03, oz, R() * 6.28, sc * scK, sc * scK * (0.75 + R() * 0.5), sc * scK), col);
      }
      continue;
    }
    if (w[2] > 0.35 || w[4] > 0.3) continue;
    const cB = noise(x * 0.11 - 50, z * 0.11 + 20);
    // Bracken only in the forest understorey and along the rim, not on the open fighting ground.
    if (f > 0.45 && r > ARENA_RADIUS - 2 && R() < f * 0.22 * smoothstep(0.5, 0.75, cB)) {
      const sc = 0.6 + R() * 0.45;
      const rust = R();
      B.bracken[Math.floor(R() * 2)].add(mat4(x, h - 0.03, z, R() * 6.28, sc), rust < 0.35 ? col.setHSL(0.07 + R() * 0.03, 0.35, 0.82 + R() * 0.12) : col.setHSL(0.15 + R() * 0.05, 0.18, 0.85 + R() * 0.12));
      continue;
    }
    const cH = noise(x * 0.07 + 11, z * 0.07 - 70);
    if (R() < 0.05 * (w[0] + w[2] * 0.6) * smoothstep(0.6, 0.8, cH) && !nearSite(x, z, 0)) {
      const sc = 0.8 + R() * 0.6;
      B.heather.add(mat4(x, h - 0.04, z, R() * 6.28, sc, sc * (0.8 + R() * 0.4), sc), col.setHSL(0.9 + R() * 0.12, 0.1 + R() * 0.1, 0.8 + R() * 0.15));
      continue;
    }
    if (f > 0.12 && f < 0.7 && R() < 0.035 && !nearSpawn(x, z, 3) && pathAt(x, z) < 0.3 && grid.free(x, z, 0.7)) {
      const sc = 0.8 + R() * 0.8;
      B.bush[Math.floor(R() * 2)].add(mat4(x, h - 0.08, z, R() * 6.28, sc, sc * (0.7 + R() * 0.5), sc), col.setHSL(0.15 + R() * 0.07, 0.2, 0.75 + R() * 0.2));
      grid.add(x, z, 0.6 * sc);
    }
  }

  // ---------- Build all batches ----------
  const meshes = [];
  for (const k in B) for (const b of [].concat(B[k])) b.build(scene, meshes, k);

  // Ground point under the screen centre (the followed hero) for the occlusion fade.
  const cam = engine.camera, fwd = new THREE.Vector3(), fp = new THREE.Vector3();
  function updateFocus() {
    cam.getWorldDirection(fwd);
    fp.copy(cam.position);
    let step = 4;
    for (let i = 0; i < 200; i++) {
      fp.addScaledVector(fwd, step);
      if (fp.y < heightAt(fp.x, fp.z)) { if (step < 0.3) break; fp.addScaledVector(fwd, -step); step *= 0.5; }
    }
    OCC.uFocus.value.copy(fp);
  }

  return {
    heightAt, obstacles, radius: ARENA_RADIUS, waterLevel: WATER, debug: TERRAIN_DEBUG,
    update(dt, t) {
      uTime.value = t;
      updateFocus();
      if (engine.sun) {
        WU.uSunDir.value.subVectors(engine.sun.position, engine.sun.target.position).normalize();
        WU.uSunCol.value.copy(engine.sun.color);
      }
      const fl = 0.85 + 0.15 * Math.sin(t * 11.3) * Math.sin(t * 7.1 + 1.3) + 0.05 * Math.sin(t * 23.0);
      shrineLight.intensity = 60 * fl;
      emberMat.color.setRGB(2.6 * fl, 0.9 * fl, 0.22);
      runeMat.opacity = 0.55 + 0.25 * Math.sin(t * 1.3);
      if (props.lightSpots[0]) brazierLight.intensity = 30 * (0.82 + 0.18 * Math.sin(t * 10.1 + 4) * Math.sin(t * 6.7));
      if (graveLight) graveLight.intensity = 14 * (0.85 + 0.15 * Math.sin(t * 9.7 + 2) * Math.sin(t * 5.3));
      if (scene.fog) {
        WU.uHorizon.value.copy(scene.fog.color).multiplyScalar(1.7).lerp(new THREE.Color(0.32, 0.36, 0.4), 0.4);
        WU.uZenith.value.copy(scene.fog.color).multiplyScalar(1.1).lerp(new THREE.Color(0.1, 0.12, 0.15), 0.4);
      }
      if (scene.fog) mist.uniforms.uColor.value.copy(scene.fog.color).multiplyScalar(2.4).lerp(new THREE.Color(0.5, 0.53, 0.6), 0.35);
    },
  };
}
