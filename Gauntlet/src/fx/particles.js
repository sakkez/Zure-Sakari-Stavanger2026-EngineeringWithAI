// GPU-instanced billboard particle system with CPU simulation.
// One draw call for every particle in the game. Premultiplied-alpha blending lets a single
// pass mix additive (fire, sparks, glow) and alpha-blended (smoke, dust, blood, debris)
// particles: per-particle `add` goes 1 (additive) -> 0 (alpha). Alpha particles are depth-sorted.
//   - size / colour (3-stop) / alpha (fade in/out) over life
//   - velocity-stretched sparks (stretch > 0 aligns the quad with screen-space velocity)
//   - drag, gravity, ground collision with bounce
//   - "push": billboards are nudged toward the camera so big smoke does not clip into the terrain (cheap soft-particle substitute)
import * as THREE from 'three';
import { GRID } from './textures.js';
import { fxOnly } from './meshes.js';

// Per-particle stride layout in the state buffer.
const S = 36;
const PX = 0, VX = 3, LIFE = 6, MAXL = 7, DRAG = 8, GRAV = 9, S0 = 10, S1 = 11, SPOW = 12, ROT = 13, ROTV = 14,
  FRAME = 15, STRETCH = 16, ADD0 = 17, ADD1 = 18, C0 = 19, C1 = 22, C2 = 25, CMID = 28, ALPHA = 29, FIN = 30, FOUT = 31,
  FLAGS = 32, PUSH = 33, SPIN = 34;

export const COLLIDE = 1, STICK = 2;

export function createParticles(scene, atlas, heightAt, MAX = 6000) {
  const st = new Float32Array(MAX * S);
  let n = 0;

  const quad = new THREE.PlaneGeometry(1, 1);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = quad.index;
  geo.setAttribute('position', quad.attributes.position);
  geo.setAttribute('uv', quad.attributes.uv);
  const iPos = new Float32Array(MAX * 3), iVel = new Float32Array(MAX * 3), iCol = new Float32Array(MAX * 4), iMisc = new Float32Array(MAX * 4), iMisc2 = new Float32Array(MAX * 2);
  const mk = (arr, k) => { const a = new THREE.InstancedBufferAttribute(arr, k); a.setUsage(THREE.DynamicDrawUsage); return a; };
  const aPos = mk(iPos, 3), aVel = mk(iVel, 3), aCol = mk(iCol, 4), aMisc = mk(iMisc, 4), aMisc2 = mk(iMisc2, 2);
  geo.setAttribute('iPos', aPos); geo.setAttribute('iVel', aVel); geo.setAttribute('iCol', aCol);
  geo.setAttribute('iMisc', aMisc); geo.setAttribute('iMisc2', aMisc2);
  geo.instanceCount = 0;

  const mat = new THREE.ShaderMaterial({
    uniforms: { map: { value: atlas }, grid: { value: GRID } },
    vertexShader: /* glsl */`
      attribute vec3 iPos; attribute vec3 iVel; attribute vec4 iCol; attribute vec4 iMisc; attribute vec2 iMisc2;
      uniform float grid;
      varying vec2 vUv; varying vec4 vCol; varying float vAdd;
      void main(){
        float size = iMisc.x, rot = iMisc.y, frame = iMisc.z, stretch = iMisc.w;
        vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
        vec2 c = position.xy;
        vec2 off;
        if (stretch > 0.0) {
          vec2 d = (modelViewMatrix * vec4(iVel, 0.0)).xy;
          float l = length(d);
          vec2 dir = l > 1e-4 ? d / l : vec2(0.0, 1.0);
          vec2 perp = vec2(-dir.y, dir.x);
          float len = size + l * stretch;
          off = perp * c.x * size + dir * (c.y * len - len * 0.5 + size * 0.5);
        } else {
          float cs = cos(rot), sn = sin(rot);
          off = mat2(cs, sn, -sn, cs) * c * size;
        }
        mv.xy += off;
        // nudge toward the camera (soft-particle substitute): view-space z moves toward 0
        mv.xyz += normalize(-mv.xyz) * size * iMisc2.y;
        gl_Position = projectionMatrix * mv;
        float col = mod(frame, grid), row = floor(frame / grid);
        vUv = vec2((col + uv.x) / grid, (grid - 1.0 - row + uv.y) / grid);
        vCol = iCol; vAdd = iMisc2.x;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D map;
      varying vec2 vUv; varying vec4 vCol; varying float vAdd;
      // central emissive cap (hue preserving): no single particle may exceed this HDR value
      vec3 capc(vec3 c, float m){ float k = max(max(c.r, c.g), c.b); return c * min(1.0, m / max(k, 1e-4)); }
      void main(){
        vec4 t = texture2D(map, vUv);
        float a = t.a * vCol.a;
        if (a < 0.002) discard;
        gl_FragColor = vec4(capc(vCol.rgb, 3.0) * t.rgb * a, a * (1.0 - vAdd));
      }`,
    transparent: true, depthWrite: false, depthTest: true,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 20;
  fxOnly(mesh);
  scene.add(mesh);

  // ---- emission ----
  const def = (v, d) => (v === undefined ? d : v);
  function emit(o) {
    if (n >= MAX) return; // budget hit: drop silently
    const b = n * S; n++;
    const p = o.p, v = o.v;
    st[b + PX] = p.x; st[b + PX + 1] = p.y; st[b + PX + 2] = p.z;
    st[b + VX] = v ? v.x : 0; st[b + VX + 1] = v ? v.y : 0; st[b + VX + 2] = v ? v.z : 0;
    const life = def(o.life, 1);
    st[b + LIFE] = life; st[b + MAXL] = life;
    st[b + DRAG] = def(o.drag, 0); st[b + GRAV] = def(o.grav, 0);
    const s = o.size; // number | [s0, s1]
    if (typeof s === 'number') { st[b + S0] = s; st[b + S1] = s; } else { st[b + S0] = s ? s[0] : 0.5; st[b + S1] = s ? s[1] : 0.5; }
    st[b + SPOW] = def(o.sizePow, 1);
    st[b + ROT] = def(o.rot, Math.random() * 6.283); st[b + ROTV] = def(o.rotV, 0);
    st[b + FRAME] = def(o.frame, 0); st[b + STRETCH] = def(o.stretch, 0);
    const add = def(o.add, 1);
    if (typeof add === 'number') { st[b + ADD0] = add; st[b + ADD1] = add; } else { st[b + ADD0] = add[0]; st[b + ADD1] = add[1]; }
    const col = o.color; // [r,g,b] or [[..],[..],[..]]
    let c0, c1, c2;
    if (typeof col[0] === 'number') { c0 = c1 = c2 = col; }
    else { c0 = col[0]; c1 = col[1] || col[0]; c2 = col[2] || c1; }
    st[b + C0] = c0[0]; st[b + C0 + 1] = c0[1]; st[b + C0 + 2] = c0[2];
    st[b + C1] = c1[0]; st[b + C1 + 1] = c1[1]; st[b + C1 + 2] = c1[2];
    st[b + C2] = c2[0]; st[b + C2 + 1] = c2[1]; st[b + C2 + 2] = c2[2];
    st[b + CMID] = def(o.cmid, col.length === 2 ? 0.999 : 0.4);
    st[b + ALPHA] = def(o.alpha, 1);
    st[b + FIN] = Math.max(1e-3, def(o.fadeIn, 0.05)); st[b + FOUT] = Math.max(1e-3, def(o.fadeOut, 0.6));
    st[b + FLAGS] = def(o.flags, 0);
    st[b + PUSH] = def(o.push, 0);
    st[b + SPIN] = 0;
  }

  const keys = new Float32Array(MAX);
  let order = [];
  const camPos = new THREE.Vector3(), camDir = new THREE.Vector3();

  function update(dt, camera) {
    camera.getWorldPosition(camPos);
    camera.getWorldDirection(camDir);
    for (let i = 0; i < n; i++) {
      let b = i * S;
      st[b + LIFE] -= dt;
      if (st[b + LIFE] <= 0) {
        n--;
        if (i !== n) st.copyWithin(b, n * S, n * S + S);
        i--; continue;
      }
      const k = st[b + DRAG];
      if (k > 0) { const f = Math.exp(-k * dt); st[b + VX] *= f; st[b + VX + 1] *= f; st[b + VX + 2] *= f; }
      st[b + VX + 1] += st[b + GRAV] * dt;
      st[b + PX] += st[b + VX] * dt; st[b + PX + 1] += st[b + VX + 1] * dt; st[b + PX + 2] += st[b + VX + 2] * dt;
      st[b + ROT] += st[b + ROTV] * dt;
      const fl = st[b + FLAGS];
      if (fl) {
        const h = heightAt(st[b + PX], st[b + PX + 2]) + 0.03;
        if (st[b + PX + 1] < h) {
          st[b + PX + 1] = h;
          if (fl & STICK) { st[b + VX] = st[b + VX + 1] = st[b + VX + 2] = 0; st[b + ROTV] = 0; st[b + STRETCH] = 0; }
          else { st[b + VX + 1] = Math.abs(st[b + VX + 1]) * 0.3; st[b + VX] *= 0.55; st[b + VX + 2] *= 0.55; st[b + ROTV] *= 0.5; }
        }
      }
      keys[i] = (st[b + PX] - camPos.x) * camDir.x + (st[b + PX + 1] - camPos.y) * camDir.y + (st[b + PX + 2] - camPos.z) * camDir.z;
    }
    // back-to-front order so alpha-blended particles composite correctly
    order.length = n;
    for (let i = 0; i < n; i++) order[i] = i;
    order.sort((a, b) => keys[b] - keys[a]);

    for (let j = 0; j < n; j++) {
      const b = order[j] * S;
      const t = 1 - st[b + LIFE] / st[b + MAXL];
      const size = st[b + S0] + (st[b + S1] - st[b + S0]) * Math.pow(t, st[b + SPOW]);
      const cm = st[b + CMID];
      let r, g, bl;
      if (t < cm) { const f = t / cm; r = st[b + C0] + (st[b + C1] - st[b + C0]) * f; g = st[b + C0 + 1] + (st[b + C1 + 1] - st[b + C0 + 1]) * f; bl = st[b + C0 + 2] + (st[b + C1 + 2] - st[b + C0 + 2]) * f; }
      else { const f = Math.min(1, (t - cm) / Math.max(1e-3, 1 - cm)); r = st[b + C1] + (st[b + C2] - st[b + C1]) * f; g = st[b + C1 + 1] + (st[b + C2 + 1] - st[b + C1 + 1]) * f; bl = st[b + C1 + 2] + (st[b + C2 + 2] - st[b + C1 + 2]) * f; }
      const a = st[b + ALPHA] * Math.min(1, t / st[b + FIN]) * Math.min(1, (1 - t) / st[b + FOUT]);
      const j3 = j * 3, j4 = j * 4, j2 = j * 2;
      iPos[j3] = st[b + PX]; iPos[j3 + 1] = st[b + PX + 1]; iPos[j3 + 2] = st[b + PX + 2];
      iVel[j3] = st[b + VX]; iVel[j3 + 1] = st[b + VX + 1]; iVel[j3 + 2] = st[b + VX + 2];
      iCol[j4] = r; iCol[j4 + 1] = g; iCol[j4 + 2] = bl; iCol[j4 + 3] = a;
      iMisc[j4] = size; iMisc[j4 + 1] = st[b + ROT]; iMisc[j4 + 2] = st[b + FRAME]; iMisc[j4 + 3] = st[b + STRETCH];
      iMisc2[j2] = st[b + ADD0] + (st[b + ADD1] - st[b + ADD0]) * t; iMisc2[j2 + 1] = st[b + PUSH];
    }
    geo.instanceCount = n;
    for (const a of [aPos, aVel, aCol, aMisc, aMisc2]) {
      a.clearUpdateRanges(); a.addUpdateRange(0, n * a.itemSize); a.needsUpdate = true;
    }
    mesh.visible = n > 0;
  }

  return { emit, update, get count() { return n; }, mesh };
}
