// Terrain-conforming ground decals (scorch, frost, blood, cracks, telegraphs, shockwave rings).
// All decals live in one merged dynamic mesh = one draw call. Each decal is a GxG vertex grid
// draped over heightAt(). Premultiplied blending: `add` 1 = glowing/additive, 0 = alpha (dark scorch etc).
// Colour, alpha and additivity animate over life (e.g. a scorch mark glows orange, then cools to black).
import * as THREE from 'three';
import { GRID } from './textures.js';
import { fxOnly } from './meshes.js';

const G = 7; // vertices per side
const VPD = G * G;

export function createDecals(scene, atlas, heightAt, MAX = 64) {
  const pos = new Float32Array(MAX * VPD * 3), uv = new Float32Array(MAX * VPD * 2), col = new Float32Array(MAX * VPD * 4), add = new Float32Array(MAX * VPD);
  const idx = [];
  for (let d = 0; d < MAX; d++) {
    const o = d * VPD;
    for (let y = 0; y < G - 1; y++) for (let x = 0; x < G - 1; x++) {
      const a = o + y * G + x, b = a + 1, c = a + G, e = c + 1;
      idx.push(a, c, b, b, c, e);
    }
  }
  const geo = new THREE.BufferGeometry();
  const aPos = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
  const aUv = new THREE.BufferAttribute(uv, 2).setUsage(THREE.DynamicDrawUsage);
  const aCol = new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage);
  const aAdd = new THREE.BufferAttribute(add, 1).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', aPos); geo.setAttribute('uv', aUv); geo.setAttribute('dcol', aCol); geo.setAttribute('dadd', aAdd);
  geo.setIndex(idx);

  const mat = new THREE.ShaderMaterial({
    uniforms: { map: { value: atlas } },
    vertexShader: /* glsl */`
      attribute vec4 dcol; attribute float dadd;
      varying vec2 vUv; varying vec4 vCol; varying float vAdd;
      void main(){ vUv = uv; vCol = dcol; vAdd = dadd; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform sampler2D map;
      varying vec2 vUv; varying vec4 vCol; varying float vAdd;
      vec3 capc(vec3 c, float m){ float k = max(max(c.r, c.g), c.b); return c * min(1.0, m / max(k, 1e-4)); }
      void main(){
        vec4 t = texture2D(map, vUv);
        float a = t.a * vCol.a;
        if (a < 0.003) discard;
        gl_FragColor = vec4(capc(vCol.rgb, 2.2) * t.rgb * a, a * (1.0 - vAdd));
      }`,
    transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  fxOnly(mesh);
  scene.add(mesh);

  const decals = [];
  for (let i = 0; i < MAX; i++) decals.push({ active: false, i });
  let dirtyAll = true;

  function writeGeometry(d, size) {
    const o = d.i * VPD;
    const cs = Math.cos(d.rot) * size, sn = Math.sin(d.rot) * size;
    const fr = d.frame, cx = fr % GRID, cy = Math.floor(fr / GRID);
    for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) {
      const u = x / (G - 1) - 0.5, v = y / (G - 1) - 0.5;
      const wx = d.x + u * cs - v * sn, wz = d.z + u * sn + v * cs;
      const k = o + y * G + x;
      pos[k * 3] = wx; pos[k * 3 + 1] = heightAt(wx, wz) + d.lift; pos[k * 3 + 2] = wz;
      // inset a hair to avoid atlas bleeding
      uv[k * 2] = (cx + 0.004 + (u + 0.5) * 0.992) / GRID;
      uv[k * 2 + 1] = (GRID - 1 - cy + 0.004 + (v + 0.5) * 0.992) / GRID;
    }
    aPos.needsUpdate = true; aUv.needsUpdate = true;
  }
  function clear(d) {
    const o = d.i * VPD;
    col.fill(0, o * 4, (o + VPD) * 4);
    pos.fill(0, o * 3, (o + VPD) * 3);
    aCol.needsUpdate = aPos.needsUpdate = true;
  }

  // spawn({ x, z, size:[s0,s1]|n, sizePow, rot, rotV, frame, life, fadeIn, fadeOut, color:[c0,c1?], cmid, add:[a0,a1]|n, alpha, lift })
  function spawn(o) {
    let d = decals.find((q) => !q.active);
    if (!d) { // steal the most-faded one
      d = decals.reduce((best, q) => ((q.age / q.life) > (best.age / best.life) ? q : best));
    }
    const s = o.size ?? 2;
    const cc = o.color || [1, 1, 1];
    const col2 = Array.isArray(cc[0]) ? [cc[0], cc[1] || cc[0]] : [cc, cc];
    Object.assign(d, {
      active: true, x: o.x, z: o.z, rot: o.rot ?? Math.random() * 6.283, rotV: o.rotV ?? 0,
      s0: typeof s === 'number' ? s : s[0], s1: typeof s === 'number' ? s : s[1], sizePow: o.sizePow ?? 0.5,
      frame: o.frame ?? 0, life: o.life ?? 5, age: 0, fadeIn: o.fadeIn ?? 0.02, fadeOut: o.fadeOut ?? 0.4,
      c0: col2[0], c1: col2[1],
      cmid: o.cmid ?? 1, a0: typeof o.add === 'number' ? o.add : (o.add?.[0] ?? 0), a1: typeof o.add === 'number' ? o.add : (o.add?.[1] ?? 0),
      alpha: o.alpha ?? 1, lift: o.lift ?? 0.06, follow: o.follow || null, lastSize: -1, pulse: o.pulse || 0,
    });
    d.animated = d.s0 !== d.s1 || d.rotV !== 0 || !!d.follow;
    writeGeometry(d, d.s0);
    d.lastSize = d.s0;
    return d;
  }

  function update(dt) {
    let anyCol = false;
    for (const d of decals) {
      if (!d.active) continue;
      d.age += dt;
      const t = Math.min(1, d.age / d.life);
      if (d.age >= d.life) { d.active = false; clear(d); continue; }
      if (d.animated) {
        if (d.follow) { d.x = d.follow.x; d.z = d.follow.z; }
        d.rot += d.rotV * dt;
        const size = d.s0 + (d.s1 - d.s0) * Math.pow(t, d.sizePow);
        writeGeometry(d, size);
      }
      const f = Math.min(1, t / d.cmid);
      const c = [0, 1, 2].map((k) => d.c0[k] + (d.c1[k] - d.c0[k]) * f);
      let a = d.alpha * Math.min(1, t / Math.max(1e-3, d.fadeIn)) * Math.min(1, (1 - t) / Math.max(1e-3, d.fadeOut));
      if (d.pulse) a *= 0.75 + 0.25 * Math.sin(d.age * d.pulse);
      const ad = d.a0 + (d.a1 - d.a0) * f;
      const o = d.i * VPD;
      for (let k = o; k < o + VPD; k++) { col[k * 4] = c[0]; col[k * 4 + 1] = c[1]; col[k * 4 + 2] = c[2]; col[k * 4 + 3] = a; add[k] = ad; }
      anyCol = true;
    }
    if (anyCol || dirtyAll) { aCol.needsUpdate = true; aAdd.needsUpdate = true; dirtyAll = false; }
  }

  return { spawn, update, mesh };
}
