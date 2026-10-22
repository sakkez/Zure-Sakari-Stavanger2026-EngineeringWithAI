// Orc dressing for the KayKit Barbarian: green skin atlas recolor, tusks, spiky pauldrons, bulkier bones.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Barbarian atlas cells (row,col): 0,0 face skin | 1,0 + 1,1 blue shirt -> bare orc torso/arms | 2,7 gloves -> hands
// 0,1 beard -> heavy jaw | 0,6 leather straps/belt | 1,2 white fur trim | 0,7 bear-pelt hat | 1,7 trousers | 2,3 boots
const SKIN_CELLS = new Set(['0,0', '1,0', '1,1', '2,7']);
const BEARD_CELLS = new Set(['0,1']);
const FUR_CELLS = new Set(['1,2', '0,7']);
const CLOTH_CELLS = new Set(['1,7', '2,3']);

export const ORC_VARIANTS = {
  orc: { skin: [0.2, 0.4, 0.09], leather: 0.95, steel: [0.66, 0.62, 0.58], jaw: [0.15, 0.3, 0.07], fur: [0.42, 0.36, 0.28], cloth: [0.24, 0.2, 0.16] },
  // Boss: grey-green hide, torso/arms (shirt cells) become dark iron plate, black fur, crimson cape.
  warlord: { skin: [0.3, 0.35, 0.23], leather: 0.55, steel: [0.3, 0.28, 0.27], rust: true, jaw: [0.2, 0.23, 0.15], fur: [0.15, 0.12, 0.1], cloth: [0.12, 0.1, 0.09], armor: [0.25, 0.235, 0.23], cape: [0.23, 0.085, 0.07] },
  orcBrute: { skin: [0.3, 0.4, 0.16], leather: 0.88, steel: [0.5, 0.46, 0.44], jaw: [0.22, 0.25, 0.15], fur: [0.52, 0.41, 0.3], cloth: [0.24, 0.19, 0.16] },
};

/** recolor callback for processAtlas: (r,g,b,row,col,surface,fy,fx) with fy/fx = position inside the cell */
export function orcRecolor(variant) {
  const v = ORC_VARIANTS[variant];
  const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
  return (r, g, b, row, col, surf, fy, fx) => {
    const key = row + ',' + col;
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (v.armor && (key === '1,0' || key === '1,1')) {
      const k = 1.15 - 0.55 * fy;
      return mul(v.armor, k);
    }
    if (v.cape && key === '0,7') return mul(v.cape, 1.1 - 0.6 * fy);
    if (SKIN_CELLS.has(key)) {
      // KayKit cells are vertical gradients; keep the gradient but normalise per cell.
      const k = 1.12 - 0.42 * fy + (key === '2,7' ? -0.12 : 0);
      return mul(v.skin, k);
    }
    if (BEARD_CELLS.has(key)) return mul(v.jaw, 0.7 + 0.6 * l);
    if (FUR_CELLS.has(key)) return mul(v.fur, 0.55 + 0.75 * l);
    if (CLOTH_CELLS.has(key)) return mul(v.cloth, 0.6 + 0.8 * l);
    if (surf === 'steel') {
      const c = [r * v.steel[0], g * v.steel[1], b * v.steel[2]];
      if (v.rust) { // rust and dried-blood blotches on the boss's iron
        const n = Math.sin(fx * 23 + fy * 11) * Math.sin(fx * 7 - fy * 19 + row * 3 + col);
        if (n > 0.25) { const t = Math.min(1, (n - 0.25) * 2.5); return [c[0] + (0.26 - c[0]) * t, c[1] + (0.09 - c[1]) * t, c[2] + (0.05 - c[2]) * t]; }
      }
      return c;
    }
    // leather / wood: darker and dirtier
    const d = v.leather;
    return [r * d * 0.98, g * d * 0.9, b * d * 0.8];
  };
}
export function orcSurfaceFor(variant) {
  const v = ORC_VARIANTS[variant];
  return (row, col, surf) => {
    const key = row + ',' + col;
    if (v.armor && (key === '1,0' || key === '1,1')) return 'steel';
    return orcSurface(row, col, surf);
  };
}
export function orcSurface(row, col, surf) {
  const key = row + ',' + col;
  if (SKIN_CELLS.has(key)) return 'skin';
  if (BEARD_CELLS.has(key) || FUR_CELLS.has(key) || CLOTH_CELLS.has(key)) return 'cloth';
  return surf;
}

let padGeo = null;
function bentCone(radius, height, bend, seg = 7) {
  const g = new THREE.ConeGeometry(radius, height, seg, 10);
  g.translate(0, height / 2, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / height;
    p.setZ(i, p.getZ(i) + bend * y * y);
  }
  g.computeVertexNormals();
  return g;
}

// Head props in one vertex-coloured mesh: two bone tusks, plus (regular orc) a dark crest of hair spikes
// that breaks the bald "ball" silhouette from the top-down camera.
const headGeos = {};
function getTuskGeo(mohawk = false) {
  if (headGeos[mohawk]) return headGeos[mohawk];
  const parts = [];
  for (const s of [-1, 1]) {
    const t = bentCone(0.055, 0.26, 0.09);
    t.rotateZ(-s * 0.32); // splay outward
    t.rotateX(-0.25);
    t.translate(s * 0.2, 0.06, 0.5);
    parts.push(colorize(t.toNonIndexed(), 0xd8cbb0));
  }
  if (mohawk) {
    for (let i = 0; i < 7; i++) {
      const z = 0.36 - i * 0.13;
      const h = 0.26 - Math.abs(i - 2) * 0.025;
      const c = new THREE.ConeGeometry(0.085, h, 5);
      c.translate(0, h / 2, 0);
      c.rotateX(-0.35 - i * 0.12); // fan backwards following the skull
      c.translate(0, 0.86 - 0.55 * z * z, z);
      parts.push(colorize(c.toNonIndexed(), 0x17120e));
    }
  }
  for (const p of parts) p.deleteAttribute('uv');
  return (headGeos[mohawk] = mergeGeometries(parts));
}

function colorize(g, hex) {
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

// Pauldron: dented iron dome + rivet rim + bone spikes (vertex coloured, one draw call).
function getPadGeo() {
  if (padGeo) return padGeo;
  const parts = [];
  const dome = new THREE.SphereGeometry(0.26, 28, 10, 0, Math.PI * 2, 0, Math.PI * 0.5);
  dome.scale(1, 0.62, 1.05);
  parts.push(colorize(dome.toNonIndexed(), 0x8a7a68));
  const rim = new THREE.TorusGeometry(0.255, 0.04, 8, 32);
  rim.rotateX(Math.PI / 2);
  parts.push(colorize(rim.toNonIndexed(), 0x3a302a));
  const spikes = [[0, 0.16, 0, 0], [0.12, 0.1, 0.1, 0.6], [0.12, 0.1, -0.1, 0.6], [0.16, 0.06, 0, 0.9]];
  for (const [x, y, z, tilt] of spikes) {
    const c = new THREE.ConeGeometry(0.05, 0.26, 10);
    c.translate(0, 0.13, 0);
    c.rotateZ(-tilt);
    c.translate(x, y, z);
    parts.push(colorize(c.toNonIndexed(), 0x40382f));
  }
  for (const p of parts) { p.deleteAttribute('uv'); }
  padGeo = mergeGeometries(parts); // keep the generators' smooth normals (no flat recompute)
  return padGeo;
}

let boneMat = null, ironMat = null, capeMat = null;
export function orcPropMaterials() {
  if (!boneMat) {
    boneMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0, envMapIntensity: 0.6 });
    ironMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.45, envMapIntensity: 1.0 });
  }
  capeMat ||= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, side: THREE.DoubleSide });
  return { boneMat, ironMat, capeMat };
}

/** Adds tusks and spiked pauldrons to a cloned Barbarian. Returns created meshes. */
export function dressOrc(root, bones, variant, mats) {
  const out = [];
  if (bones.head) {
    const tusks = new THREE.Mesh(getTuskGeo(variant !== 'orcBrute'), mats.bone);
    if (variant === 'warlord') tusks.scale.setScalar(1.25);
    tusks.castShadow = true;
    tusks.name = 'Orc_Tusks';
    bones.head.add(tusks);
    out.push(tusks);
  }
  {
    for (const side of ['l', 'r']) {
      const arm = bones['upperarm' + side];
      if (!arm) continue;
      const pad = new THREE.Mesh(getPadGeo(), mats.iron);
      pad.castShadow = true;
      pad.name = 'Orc_Pauldron_' + side;
      // Model-space placement (character faces +Z, left = +X), converted into bone-local space.
      const s = side === 'l' ? 1 : -1;
      const worldPos = new THREE.Vector3(s * 0.4, 1.16, -0.02);
      root.updateMatrixWorld(true);
      const inv = arm.matrixWorld.clone().invert();
      pad.position.copy(worldPos).applyMatrix4(inv);
      const q = new THREE.Quaternion().setFromRotationMatrix(arm.matrixWorld).invert();
      const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -s * 0.5));
      pad.quaternion.copy(q.multiply(tilt));
      pad.scale.setScalar(variant === 'warlord' ? 0.95 : variant === 'orcBrute' ? 0.66 : 0.5); if (side === 'r') pad.scale.x *= -1;
      arm.add(pad);
      out.push(pad);
    }
  }
  if (variant === 'warlord') {
    if (bones.head) {
      const helm = new THREE.Mesh(getHelmGeo(), mats.iron);
      helm.castShadow = true; helm.name = 'Orc_Helm';
      bones.head.add(helm); out.push(helm);
      // glowing red eye slit across the brow, visible from the high camera
      const slitGeo = new THREE.TorusGeometry(0.61, 0.028, 6, 24, 1.3);
      slitGeo.rotateX(Math.PI / 2); slitGeo.rotateY(Math.PI / 2 - 0.65); slitGeo.translate(0, 0.5, 0.02);
      const slit = new THREE.Mesh(slitGeo, new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff2208, emissiveIntensity: 3.2 }));
      slit.name = 'Orc_EyeSlit'; bones.head.add(slit); out.push(slit);
      const horns = new THREE.Mesh(getHornGeo(), mats.bone);
      horns.castShadow = true; horns.name = 'Orc_Horns';
      bones.head.add(horns); out.push(horns);
    }
    // (A cape and then a fur mantle were tried here; both read as a flat disc from the top-down camera, so the
    // boss silhouette is carried by the horned helm, pauldrons and axe instead.)
  }
  return out;
}

// Warlord helm: smooth blackened iron skullcap + brow band + low crown spikes (head-bone space; head spans y -0.1..0.95).
// Normals come from the generators (smooth); parts are merged without recomputing so nothing turns faceted.
let helmGeo = null, hornGeo = null;
function getHelmGeo() {
  if (helmGeo) return helmGeo;
  const parts = [];
  const cap = new THREE.SphereGeometry(0.6, 36, 14, 0, Math.PI * 2, 0, Math.PI * 0.55);
  cap.scale(1, 0.66, 1.02); cap.translate(0, 0.6, 0.02);
  parts.push(colorize(cap.toNonIndexed(), 0x56504b));
  const band = new THREE.TorusGeometry(0.6, 0.055, 8, 40);
  band.rotateX(Math.PI / 2); band.translate(0, 0.6, 0.02);
  parts.push(colorize(band.toNonIndexed(), 0x7d7268)); // worn, lighter edge
  const ridge = new THREE.TorusGeometry(0.42, 0.045, 8, 28, Math.PI);
  ridge.rotateY(Math.PI / 2); ridge.scale(1, 0.95, 1.4); ridge.translate(0, 0.6, 0.02); // front-to-back crest
  parts.push(colorize(ridge.toNonIndexed(), 0x7d7268));
  for (let i = 0; i < 5; i++) {
    const a = (i - 2) * 0.38;
    const c = new THREE.ConeGeometry(0.045, 0.18 - Math.abs(i - 2) * 0.03, 10);
    c.translate(0, 0.09, 0); c.rotateX(0.35);
    c.rotateY(a); c.translate(Math.sin(a) * 0.56, 0.62, Math.cos(a) * 0.56 + 0.02);
    parts.push(colorize(c.toNonIndexed(), 0x3e3832));
  }
  for (const p of parts) if (p.attributes.uv) p.deleteAttribute('uv');
  return (helmGeo = mergeGeometries(parts));
}

// Long, darker bone horns sweeping out, up and back: the boss's readable silhouette from above.
function getHornGeo() {
  if (hornGeo) return hornGeo;
  const parts = [];
  for (const sd of [-1, 1]) {
    const h = bentCone(0.14, 1.25, -0.75, 14);
    h.rotateX(-0.35);              // lean back
    h.rotateZ(-sd * 0.95);         // out to the side; the negative bend curls the tip up and backwards
    h.translate(sd * 0.5, 0.62, -0.02);
    const g = h.toNonIndexed();
    // darken toward the tip (old bone), lighter at the root ring
    const p = g.attributes.position, col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const d = Math.min(1, Math.hypot(p.getX(i) - sd * 0.5, p.getY(i) - 0.62, p.getZ(i)) / 1.2);
      const k = 0.46 - 0.3 * d;
      col[i * 3] = 0.78 * k; col[i * 3 + 1] = 0.7 * k; col[i * 3 + 2] = 0.56 * k;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.deleteAttribute('uv');
    parts.push(g);
  }
  return (hornGeo = mergeGeometries(parts));
}


// Non-uniform bone scales giving a hunched, heavy upper body and smaller head ratio.
export const ORC_BONE_SCALE = {
  orc: { chest: [1.22, 1.08, 1.22], head: [0.86, 0.88, 0.88], upperarml: [1.12, 1.12, 1.12], upperarmr: [1.12, 1.12, 1.12], upperlegl: [1.12, 1, 1.12], upperlegr: [1.12, 1, 1.12] },
  warlord: { chest: [1.4, 1.12, 1.34], head: [0.74, 0.76, 0.76], upperarml: [1.26, 1.26, 1.26], upperarmr: [1.26, 1.26, 1.26], upperlegl: [1.24, 1, 1.24], upperlegr: [1.24, 1, 1.24], spine: [1.16, 1, 1.16] },
  orcBrute: { chest: [1.34, 1.1, 1.3], head: [0.78, 0.8, 0.8], upperarml: [1.2, 1.2, 1.2], upperarmr: [1.2, 1.2, 1.2], upperlegl: [1.2, 1, 1.2], upperlegr: [1.2, 1, 1.2], spine: [1.12, 1, 1.12] },
};

// ---------------- boss axe ----------------
// Replaces the KayKit 2H_Axe on the warlord: dark notched iron crescent with a bright worn edge line and
// blood on the edge (metal mesh), plus a leather-wrapped haft with iron collars (non-metal mesh).
// Weapon space matches the KayKit convention: haft along +Y from the grip, blade in the X/Y plane.
let axeBladeGeo = null, axeHaftGeo = null;
export function getAxeGeos() {
  if (axeBladeGeo) return { blade: axeBladeGeo, haft: axeHaftGeo };
  // blade outline (x>0 side): crescent with notches along the cutting edge
  const sh = new THREE.Shape();
  sh.moveTo(0.04, 0.92);
  sh.quadraticCurveTo(0.3, 0.86, 0.52, 0.66);           // lower beard
  const edge = [[0.6, 0.78], [0.64, 0.86], [0.6, 0.9], [0.67, 0.98], [0.7, 1.1], [0.66, 1.16], [0.69, 1.24], [0.66, 1.36], [0.6, 1.46], [0.55, 1.5]];
  for (const [x, y] of edge) sh.lineTo(x, y);            // notched cutting edge
  sh.quadraticCurveTo(0.3, 1.32, 0.04, 1.3);             // upper curve back to the haft
  sh.lineTo(0.04, 0.92);
  const blade = new THREE.ExtrudeGeometry(sh, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.02, bevelSegments: 2, curveSegments: 10 });
  blade.translate(0, 0, -0.035);
  // back spike
  const spike = new THREE.ConeGeometry(0.07, 0.36, 6);
  spike.rotateZ(Math.PI / 2); spike.translate(-0.2, 1.12, 0);
  const top = new THREE.ConeGeometry(0.05, 0.22, 6); top.translate(0, 1.55, 0);
  const parts = [blade, spike, top].map((g) => { g = g.index ? g.toNonIndexed() : g; if (g.attributes.uv) g.deleteAttribute('uv'); return g; });
  for (const g of parts) {
    const p = g.attributes.position, col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i);
      // dark iron body -> bright worn edge band -> blood smears near the edge
      const edgeT = Math.min(1, Math.max(0, (x - 0.52) / 0.12));
      const blood = Math.max(0, Math.sin(y * 23.0) * Math.sin(y * 7.0 + 1.0)) * Math.min(1, Math.max(0, (x - 0.35) / 0.2));
      let c = [0.07, 0.065, 0.062];
      c = c.map((v, k) => v + ([0.42, 0.4, 0.38][k] - v) * edgeT);
      c = c.map((v, k) => v + ([0.16, 0.012, 0.008][k] - v) * Math.min(1, blood * 1.2) * (1 - edgeT * 0.5));
      col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  axeBladeGeo = mergeGeometries(parts);
  axeBladeGeo.computeVertexNormals();
  // haft: long shaft with leather wraps (darker bands) and two iron collars
  const haft = new THREE.CylinderGeometry(0.045, 0.05, 2.0, 10, 24);
  haft.translate(0, 0.55, 0);
  const hp = haft.attributes.position, hc = new Float32Array(hp.count * 3);
  for (let i = 0; i < hp.count; i++) {
    const y = hp.getY(i);
    const wrap = (y < 0.75 && y > -0.35) ? (Math.sin(y * 60) > 0 ? 0.75 : 1.0) : 1.0;
    const collar = (Math.abs(y - 0.8) < 0.05 || Math.abs(y + 0.4) < 0.05) ? 1 : 0;
    const base = collar ? [0.12, 0.11, 0.1] : (y < 0.75 && y > -0.35 ? [0.16, 0.09, 0.05] : [0.1, 0.07, 0.05]);
    hc[i * 3] = base[0] * wrap; hc[i * 3 + 1] = base[1] * wrap; hc[i * 3 + 2] = base[2] * wrap;
    if (collar) { const a = Math.atan2(hp.getZ(i), hp.getX(i)); hp.setX(i, Math.cos(a) * 0.065); hp.setZ(i, Math.sin(a) * 0.065); }
  }
  haft.setAttribute('color', new THREE.BufferAttribute(hc, 3));
  haft.deleteAttribute('uv');
  haft.computeVertexNormals();
  axeHaftGeo = haft;
  return { blade: axeBladeGeo, haft: axeHaftGeo };
}
