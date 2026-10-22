// Mesh-based VFX: slash arcs, ribbon trails, pooled point lights and instanced props (arrows, ice, rock spikes, meteor).
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

// Keep a transparent FX mesh out of override-material passes (e.g. GTAO's normal/depth prepass),
// otherwise the camera-facing quads get written as solid geometry and AO paints dark bands around them.
export function fxOnly(mesh) {
  mesh.onBeforeRender = (r, scene, cam, geo, mat) => {
    if (scene.overrideMaterial || mat !== mesh.material) { geo.userData.fxSaved = geo.drawRange.count; geo.drawRange.count = 0; }
  };
  mesh.onAfterRender = (r, scene, cam, geo) => {
    if (geo.userData.fxSaved !== undefined) { geo.drawRange.count = geo.userData.fxSaved; geo.userData.fxSaved = undefined; }
  };
  return mesh;
}

const additive = { transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor };

// ------------------------------------------------------------------ slash arcs
// One shared polar grid geometry; the arc shape (angles, radii, slope) is evaluated in the vertex shader.
export function createArcs(scene, noiseTex, MAX = 10) {
  const SEG = 48, RS = 4;
  const geo = new THREE.BufferGeometry();
  const p = [], uv = [], idx = [];
  for (let j = 0; j <= RS; j++) for (let i = 0; i <= SEG; i++) { p.push(0, 0, 0); uv.push(i / SEG, j / RS); }
  for (let j = 0; j < RS; j++) for (let i = 0; i < SEG; i++) {
    const a = j * (SEG + 1) + i, b = a + 1, c = a + SEG + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);

  const base = new THREE.ShaderMaterial({
    uniforms: {
      uStart: { value: 0 }, uSpan: { value: 2 }, uR0: { value: 0.5 }, uR1: { value: 2 }, uSlope: { value: 0 }, uLift: { value: 0 },
      uProg: { value: 0 }, uTail: { value: 0.3 }, uSpin: { value: 0 }, uDir: { value: 1 }, uAlpha: { value: 1 }, uTime: { value: 0 },
      uColor: { value: new THREE.Color() }, uHot: { value: new THREE.Color() }, uNoise: { value: noiseTex },
    },
    vertexShader: /* glsl */`
      uniform float uStart, uSpan, uR0, uR1, uSlope, uLift;
      varying vec2 vUv;
      void main(){
        vUv = uv;
        float ang = uStart + uv.x * uSpan;
        float r = mix(uR0, uR1, uv.y);
        vec3 p = vec3(sin(ang) * r, (uv.x - 0.5) * uSlope + uv.y * uLift, cos(ang) * r);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform float uProg, uTail, uSpin, uDir, uAlpha, uTime;
      uniform vec3 uColor, uHot; uniform sampler2D uNoise;
      varying vec2 vUv;
      vec3 capc(vec3 c, float m){ float k = max(max(c.r, c.g), c.b); return c * min(1.0, m / max(k, 1e-4)); }
      void main(){
        float u = uDir > 0.0 ? vUv.x : 1.0 - vUv.x;
        float d = uSpin > 0.5 ? fract(uProg - u) : (uProg - u);
        if (d < 0.0) discard;
        float tr = exp(-d / uTail);
        float rr = vUv.y;
        float edge = smoothstep(0.6, 0.93, rr) * smoothstep(1.0, 0.93, rr);
        float body = smoothstep(0.0, 0.85, rr) * smoothstep(1.0, 0.9, rr);
        float nz = texture2D(uNoise, vec2(u * 1.5 - uTime * 0.7, rr * 0.35 + 0.1)).r;
        float head = exp(-d / 0.035) * smoothstep(0.3, 0.95, rr);
        float a = (tr * (edge * 1.3 + body * (0.25 + 0.6 * nz)) + head * 0.9) * uAlpha;
        if (uSpin < 0.5) a *= smoothstep(0.0, 0.08, u);
        float hot = clamp(head + edge * tr * tr, 0.0, 1.0);
        vec3 col = mix(uColor, uHot, hot);
        gl_FragColor = vec4(capc(col, 2.0) * min(a, 1.0), a);
      }`,
    side: THREE.DoubleSide, ...additive,
  });
  const pool = [];
  for (let i = 0; i < MAX; i++) {
    const m = new THREE.Mesh(geo, base.clone());
    m.frustumCulled = false; m.visible = false; m.renderOrder = 25; fxOnly(m);
    scene.add(m);
    pool.push({ mesh: m, active: false });
  }

  // spawn({ pos, follow, facing, span, r0, r1, slope, lift, dur, fade, tail, dir, color, hot, spin, spinSpeed, alpha })
  function spawn(o) {
    let a = pool.find((q) => !q.active) || pool.reduce((b, q) => (q.age > b.age ? q : b));
    const u = a.mesh.material.uniforms;
    const span = o.span ?? 2.4;
    u.uStart.value = (o.facing ?? 0) - span / 2; u.uSpan.value = span;
    u.uR0.value = o.r0 ?? 0.6; u.uR1.value = o.r1 ?? 2.4; u.uSlope.value = o.slope ?? 0; u.uLift.value = o.lift ?? 0;
    u.uTail.value = o.tail ?? 0.35; u.uSpin.value = o.spin ? 1 : 0; u.uDir.value = o.dir ?? 1;
    u.uColor.value.setRGB(...(o.color || [2.5, 1.0, 0.3])); u.uHot.value.setRGB(...(o.hot || [6, 5, 3.5]));
    u.uProg.value = 0; u.uAlpha.value = o.alpha ?? 1;
    a.mesh.position.copy(o.pos || o.follow); a.mesh.position.y += o.yOff ?? 0; a.mesh.visible = true;
    Object.assign(a, { active: true, age: 0, dur: o.dur ?? 0.16, fade: o.fade ?? 0.22, follow: o.follow || null, spin: !!o.spin, spinSpeed: o.spinSpeed ?? 2.5, alpha: o.alpha ?? 1, yOff: o.yOff ?? 0, growFrom: o.growFrom ?? 1, phase: 0 });
    a.mesh.scale.set(a.growFrom, 1, a.growFrom);
    return a;
  }
  function update(dt, t) {
    for (const a of pool) {
      if (!a.active) continue;
      a.age += dt;
      const u = a.mesh.material.uniforms;
      u.uTime.value = t;
      if (a.follow) a.mesh.position.set(a.follow.x, a.follow.y + a.yOff, a.follow.z);
      if (a.growFrom !== 1) { const k = a.growFrom + (1 - a.growFrom) * (1 - Math.pow(1 - Math.min(1, a.age / a.dur), 3)); a.mesh.scale.set(k, 1, k); }
      if (a.spin) {
        u.uProg.value = a.age * a.spinSpeed + (a.phase || 0);
        const env = Math.min(1, a.age / 0.08) * Math.min(1, (a.dur + a.fade - a.age) / a.fade);
        u.uAlpha.value = a.alpha * Math.max(0, env);
      } else {
        u.uProg.value = Math.min(a.age / a.dur, 1) * 1.0 + Math.max(0, a.age - a.dur) * 0.6;
        u.uAlpha.value = a.alpha * Math.max(0, Math.min(1, (a.dur + a.fade - a.age) / a.fade));
      }
      if (a.age > a.dur + a.fade) { a.active = false; a.mesh.visible = false; }
    }
  }
  return { spawn, update };
}

// ------------------------------------------------------------------ ribbon trails
// Camera-facing strips that follow a moving anchor. All trails share one merged geometry (one draw call).
export function createRibbons(scene, noiseTex, MAXT = 32, N = 18) {
  const VPT = N * 2;
  const pos = new Float32Array(MAXT * VPT * 3), uv = new Float32Array(MAXT * VPT * 2), col = new Float32Array(MAXT * VPT * 4), add = new Float32Array(MAXT * VPT);
  const idx = [];
  for (let t = 0; t < MAXT; t++) for (let i = 0; i < N - 1; i++) {
    const a = t * VPT + i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const geo = new THREE.BufferGeometry();
  const aPos = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
  const aUv = new THREE.BufferAttribute(uv, 2).setUsage(THREE.DynamicDrawUsage);
  const aCol = new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage);
  const aAdd = new THREE.BufferAttribute(add, 1).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', aPos); geo.setAttribute('uv', aUv); geo.setAttribute('rcol', aCol); geo.setAttribute('radd', aAdd);
  geo.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uNoise: { value: noiseTex }, uTime: { value: 0 } },
    vertexShader: /* glsl */`
      attribute vec4 rcol; attribute float radd; varying vec2 vUv; varying vec4 vCol; varying float vAdd;
      void main(){ vUv = uv; vCol = rcol; vAdd = radd; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uNoise; uniform float uTime;
      varying vec2 vUv; varying vec4 vCol; varying float vAdd;
      vec3 capc(vec3 c, float m){ float k = max(max(c.r, c.g), c.b); return c * min(1.0, m / max(k, 1e-4)); }
      void main(){
        float x = (vUv.y - 0.5) * 2.0;
        float prof = exp(-x * x * 2.8);
        float core = exp(-x * x * 18.0);
        float nz = texture2D(uNoise, vec2(vUv.x * 2.5 - uTime * 1.7, vUv.y * 0.6 + vUv.x * 0.2)).r;
        float a = vCol.a * (prof * (0.35 + 0.8 * nz) + core * 0.7) * smoothstep(1.0, 0.75, vUv.x);
        if (a < 0.003) discard;
        vec3 c = capc(vCol.rgb, 1.6) * (1.0 + core * 0.4 * vAdd);
        gl_FragColor = vec4(c * a, a * (1.0 - vAdd));
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false; mesh.renderOrder = 22; fxOnly(mesh);
  scene.add(mesh);

  const trails = [];
  for (let i = 0; i < MAXT; i++) trails.push({ i, active: false, pts: [] });
  const camPos = new THREE.Vector3(), tan = new THREE.Vector3(), view = new THREE.Vector3(), side = new THREE.Vector3();

  // create({ follow: Object3D|Vector3, width, life, color:[head, tail], alpha, add, minDist, offset })
  function create(o) {
    const tr = trails.find((q) => !q.active);
    if (!tr) return { stop() {} };
    const c = o.color || [[3, 2, 1], [1, 0.3, 0.1]];
    Object.assign(tr, {
      active: true, stopped: false, follow: o.follow, pts: [], width: o.width ?? 0.4, life: o.life ?? 0.35,
      ch: c[0], ct: c[1] || c[0], alpha: o.alpha ?? 1, add: o.add ?? 1, minDist: o.minDist ?? 0.25, maxAge: 0,
    });
    tr.stop = () => { tr.stopped = true; };
    return tr;
  }
  function headPos(tr, out) {
    const f = tr.follow;
    if (f.isObject3D) { if (!f.parent) return false; out.copy(f.position); return true; }
    out.copy(f); return true;
  }
  const hp = new THREE.Vector3();
  function update(dt, t, camera) {
    mat.uniforms.uTime.value = t;
    camera.getWorldPosition(camPos);
    for (const tr of trails) {
      if (!tr.active) continue;
      for (const q of tr.pts) q.age += dt;
      while (tr.pts.length && tr.pts[tr.pts.length - 1].age > tr.life) tr.pts.pop();
      if (!tr.stopped && headPos(tr, hp)) {
        const h = tr.pts[0];
        if (!h || tr.pts.length < 2 || Math.hypot(hp.x - tr.pts[1].x, hp.y - tr.pts[1].y, hp.z - tr.pts[1].z) > tr.minDist) {
          tr.pts.unshift({ x: hp.x, y: hp.y, z: hp.z, age: 0 });
          if (tr.pts.length > N) tr.pts.length = N;
        } else { h.x = hp.x; h.y = hp.y; h.z = hp.z; h.age = 0; }
      } else tr.stopped = true;
      const o = tr.i * N * 2;
      const pts = tr.pts;
      if (tr.stopped && pts.length < 2) { tr.active = false; col.fill(0, o * 4, (o + N * 2) * 4); pos.fill(0, o * 3, (o + N * 2) * 3); continue; }
      for (let i = 0; i < N; i++) {
        const k = o + i * 2;
        if (i >= pts.length) {
          const last = pts[pts.length - 1] || { x: 0, y: 0, z: 0 };
          for (const kk of [k, k + 1]) { pos[kk * 3] = last.x; pos[kk * 3 + 1] = last.y; pos[kk * 3 + 2] = last.z; col[kk * 4 + 3] = 0; }
          continue;
        }
        const q = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
        tan.set(a.x - b.x, a.y - b.y, a.z - b.z);
        view.set(camPos.x - q.x, camPos.y - q.y, camPos.z - q.z);
        side.crossVectors(tan, view).normalize();
        const f = Math.min(1, q.age / tr.life);
        const w = tr.width * Math.pow(1 - f, 0.6) * 0.5;
        const al = tr.alpha * Math.pow(1 - f, 1.3);
        for (let s = 0; s < 2; s++) {
          const kk = k + s, sg = s ? -1 : 1;
          pos[kk * 3] = q.x + side.x * w * sg; pos[kk * 3 + 1] = q.y + side.y * w * sg; pos[kk * 3 + 2] = q.z + side.z * w * sg;
          uv[kk * 2] = f; uv[kk * 2 + 1] = s;
          col[kk * 4] = tr.ch[0] + (tr.ct[0] - tr.ch[0]) * f; col[kk * 4 + 1] = tr.ch[1] + (tr.ct[1] - tr.ch[1]) * f; col[kk * 4 + 2] = tr.ch[2] + (tr.ct[2] - tr.ch[2]) * f;
          col[kk * 4 + 3] = al; add[kk] = tr.add;
        }
      }
    }
    aPos.needsUpdate = aUv.needsUpdate = aCol.needsUpdate = aAdd.needsUpdate = true;
  }
  return { create, update, mesh };
}

// ------------------------------------------------------------------ pooled point lights
// Fixed pool created at boot. Lights are never added/removed at runtime (avoids shader recompiles);
// idle lights sit at intensity 0.
export function createLights(scene, COUNT = 6) {
  const pool = [];
  for (let i = 0; i < COUNT; i++) {
    const l = new THREE.PointLight(0xffffff, 0, 10, 1.6);
    l.castShadow = false;
    scene.add(l);
    pool.push({ light: l, active: false, prio: 0 });
  }
  // spawn({ pos, follow, color:[r,g,b], intensity, distance, life, fadeIn, flicker, prio, y })
  function spawn(o) {
    const prio = o.prio ?? 1;
    let s = pool.find((q) => !q.active);
    if (!s) {
      // steal the weakest lower/equal-priority light
      let best = null;
      for (const q of pool) if (q.prio <= prio && (!best || q.cur < best.cur)) best = q;
      if (!best) return null;
      s = best;
    }
    Object.assign(s, {
      active: true, prio, age: 0, life: o.life ?? (o.follow ? Infinity : 0.5), fadeIn: o.fadeIn ?? 0.02, base: o.intensity ?? 40, cur: 0,
      follow: o.follow || null, flicker: o.flicker ?? 0, y: o.y ?? 0, ending: -1,
    });
    s.light.color.setRGB(...(o.color || [1, 0.6, 0.3]));
    s.light.distance = o.distance ?? 10;
    if (o.pos) s.light.position.copy(o.pos);
    s.light.position.y += s.y;
    return s;
  }
  function update(dt) {
    for (const s of pool) {
      if (!s.active) { s.light.intensity = 0; continue; }
      s.age += dt;
      let env;
      if (s.follow) {
        const f = s.follow;
        const alive = (f.isObject3D ? !!f.parent : true) && s.age < s.life;
        if (alive && s.ending < 0) { s.light.position.copy(f.isObject3D ? f.position : f); s.light.position.y += s.y; env = Math.min(1, s.age / s.fadeIn); }
        else { if (s.ending < 0) s.ending = s.age; env = Math.max(0, 1 - (s.age - s.ending) / 0.12); if (env <= 0) s.active = false; }
      } else {
        const t = s.age / s.life;
        env = Math.min(1, s.age / s.fadeIn) * Math.max(0, 1 - t) ** 1.5;
        if (t >= 1) s.active = false;
      }
      const fl = s.flicker ? 1 - s.flicker * 0.5 + Math.random() * s.flicker : 1;
      s.cur = s.base * env * fl;
      s.light.intensity = s.active ? s.cur : 0;
    }
  }
  return { spawn, update };
}

// ------------------------------------------------------------------ instanced props
// A pooled InstancedMesh; each live item gets a per-frame callback that writes its transform.
function createInstLayer(scene, geo, mat, max, { shadow = false } = {}) {
  const mesh = new THREE.InstancedMesh(geo, mat, max);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.count = 0; mesh.frustumCulled = false; mesh.castShadow = shadow; mesh.visible = false;
  scene.add(mesh);
  const items = [];
  const dummy = new THREE.Object3D();
  return {
    mesh,
    add(item) { if (items.length >= max) items.shift(); item.age = 0; items.push(item); return item; },
    update(dt) {
      let n = 0;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        it.age += dt;
        dummy.position.set(0, 0, 0); dummy.quaternion.identity(); dummy.scale.set(1, 1, 1);
        if (it.tick(it, dummy, dt) === false) { items.splice(i, 1); i--; continue; }
        dummy.updateMatrix();
        mesh.setMatrixAt(n++, dummy.matrix);
      }
      mesh.count = n; mesh.visible = n > 0;
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

function colored(g, hex) {
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

// ---- procedural rock / lava shading shared by the meteor and earthshatter spikes ----
const GLSL_NOISE = /* glsl */`
  varying vec3 vOP;
  float h3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float n3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }
  float fbm3(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * n3(p); p *= 2.03; a *= 0.5; } return s; }
  float cracks(vec3 p){ float a = 1.0 - smoothstep(0.0, 0.045, abs(n3(p * 2.2) - 0.5)); float b = 1.0 - smoothstep(0.0, 0.035, abs(n3(p * 4.7 + 3.1) - 0.5)); return max(a, b * 0.7); }
`;
function rockShader(mat, { lava, heat, tex = 4.0, time }) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uLava = { value: new THREE.Color(...lava) };
    sh.uniforms.uHeat = heat; sh.uniforms.uTime = time;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vOP;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vOP = position;
        #ifdef USE_INSTANCING
          vOP += instanceMatrix[3].xyz * 0.37;
        #endif`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uLava; uniform float uHeat; uniform float uTime;\n' + GLSL_NOISE)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float rk = fbm3(vOP * ${tex.toFixed(1)});
        diffuseColor.rgb *= 0.45 + 1.1 * rk;
        float ck = cracks(vOP * 1.3);
        diffuseColor.rgb *= 1.0 - ck * 0.6;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float fl = 0.8 + 0.2 * sin(uTime * 9.0 + vOP.x * 5.0);
        totalEmissiveRadiance = uLava * ck * uHeat * fl + uLava * 0.12 * uHeat * smoothstep(0.55, 0.8, 1.0 - rk);`);
  };
  mat.customProgramCacheKey = () => 'fxrock' + lava.join(',') + tex;
  return mat;
}
// JS value noise for geometry displacement.
function hashJ(x, y, z) { const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return h - Math.floor(h); }
function noiseJ(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), fx = x - ix, fy = y - iy, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const L = (a, b, t) => a + (b - a) * t;
  const c = (i, j, k) => hashJ(ix + i, iy + j, iz + k);
  return L(L(L(c(0, 0, 0), c(1, 0, 0), u), L(c(0, 1, 0), c(1, 1, 0), u), v), L(L(c(0, 0, 1), c(1, 0, 1), u), L(c(0, 1, 1), c(1, 1, 1), u), v), w);
}
function fbmJ(x, y, z) { let s = 0, a = 0.5; for (let i = 0; i < 4; i++) { s += a * noiseJ(x, y, z); x *= 2.03; y *= 2.03; z *= 2.03; a *= 0.5; } return s; }
function stripTo(g, keep) { for (const k of Object.keys(g.attributes)) if (!keep.includes(k)) g.deleteAttribute(k); return g; }

export function createProps(scene, lavaTex) {
  const time = { value: 0 };
  // Arrow: dark wooden shaft, iron broadhead, muted fletching. Points +Z, origin at the tip.
  const L = 1.0;
  const shaft = colored(new THREE.CylinderGeometry(0.028, 0.028, L, 6, 1, true).rotateX(Math.PI / 2).translate(0, 0, -L / 2 - 0.12), 0x2e1e12);
  const head = colored(new THREE.ConeGeometry(0.07, 0.24, 4).rotateX(Math.PI / 2).translate(0, 0, -0.12), 0x55585e);
  const f1 = colored(new THREE.PlaneGeometry(0.13, 0.24).rotateY(Math.PI / 2).translate(0, 0, -L - 0.02), 0x4a3a2c);
  const f2 = colored(new THREE.PlaneGeometry(0.13, 0.24).rotateY(Math.PI / 2).rotateZ(Math.PI / 2).translate(0, 0, -L - 0.02), 0x4a3a2c);
  for (const g of [shaft, head, f1, f2]) stripTo(g, ['position', 'normal', 'color']);
  const arrowGeo = mergeGeometries([shaft, head, f1, f2]);
  const arrowMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.15, side: THREE.DoubleSide });
  const arrows = createInstLayer(scene, arrowGeo, arrowMat, 96);

  // Ice spike: faceted crystal, base at y=0.
  const iceGeo = new THREE.ConeGeometry(0.22, 1.5, 6, 1).translate(0, 0.75, 0);
  iceGeo.computeVertexNormals();
  const iceMat = new THREE.MeshStandardMaterial({ color: 0xa8dcff, emissive: 0x3a8ad0, emissiveIntensity: 0.8, roughness: 0.08, metalness: 0.3, transparent: true, opacity: 0.82, flatShading: true });
  const ice = createInstLayer(scene, iceGeo, iceMat, 96);

  // Rock spike (earthshatter): jagged, irregular shard, base at y=0, dark stone with glowing cracks only.
  let rockGeo = stripTo(new THREE.CylinderGeometry(0.05, 0.5, 1.8, 11, 7), ['position']);
  rockGeo = mergeVertices(rockGeo);
  { const p = rockGeo.attributes.position; const lean = 0.25;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const t = (y + 0.9) / 1.8, a = Math.atan2(z, x);
      const k = 0.62 + 0.75 * fbmJ(Math.cos(a) * 1.7 + 3, y * 2.2, Math.sin(a) * 1.7) + (hashJ(i, 1, 2) - 0.5) * 0.18;
      x *= k; z *= k;
      x += lean * t * t; z += Math.sin(t * 5) * 0.06;
      p.setXYZ(i, x, y + 0.75, z);
    } }
  rockGeo = rockGeo.toNonIndexed(); rockGeo.computeVertexNormals();
  const rockMat = rockShader(new THREE.MeshStandardMaterial({ color: 0x4a4038, roughness: 0.95, flatShading: true, emissive: 0x000000 }), { lava: [2.2, 0.5, 0.06], heat: { value: 1 }, tex: 3.0, time });
  const rocks = createInstLayer(scene, rockGeo, rockMat, 48, { shadow: true });

  // Meteor: dense displaced boulder with crusted rock and molten lava cracks.
  let metGeo = mergeVertices(stripTo(new THREE.IcosahedronGeometry(1, 5), ['position']));
  { const p = metGeo.attributes.position; const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const k = 0.78 + 0.42 * fbmJ(v.x * 1.6 + 5, v.y * 1.6, v.z * 1.6) + 0.08 * fbmJ(v.x * 6, v.y * 6, v.z * 6);
      v.multiplyScalar(k); v.y *= 0.88; p.setXYZ(i, v.x, v.y, v.z);
    } }
  metGeo.computeVertexNormals();
  const metMat = rockShader(new THREE.MeshStandardMaterial({ color: 0x2a1e18, roughness: 0.9 }), { lava: [3.0, 0.75, 0.08], heat: { value: 1 }, tex: 2.5, time });
  const meteors = createInstLayer(scene, metGeo, metMat, 4);
  void lavaTex;

  return {
    arrows, ice, rocks, meteors,
    update(dt) { time.value += dt; arrows.update(dt); ice.update(dt); rocks.update(dt); meteors.update(dt); },
  };
}

// ------------------------------------------------------------------ 3D debris chunks
// Small lit, tumbling rock/bone chunks that bounce on the floor and settle (replaces flat debris sprites).
export function createChunks(scene, floorAt, onHot, MAX = 160) {
  let g = new THREE.IcosahedronGeometry(0.5, 0);
  g = mergeVertices(stripTo(g, ['position']));
  { const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const k = 0.65 + hashJ(i, 7, 3) * 0.6; p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.75, p.getZ(i) * k); } }
  g = g.toNonIndexed(); g.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0.0, flatShading: true });
  const mesh = new THREE.InstancedMesh(g, mat, MAX);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.setColorAt(0, new THREE.Color());
  mesh.count = 0; mesh.frustumCulled = false; mesh.castShadow = true; mesh.visible = false;
  scene.add(mesh);
  const items = [];
  const dummy = new THREE.Object3D(), col = new THREE.Color(), axis = new THREE.Vector3(), q = new THREE.Quaternion();
  return {
    // spawn({ p, v, size, color:[r,g,b] (linear albedo), life, hot (seconds of ember trail) })
    spawn(o) {
      if (items.length >= MAX) items.shift();
      axis.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      items.push({ x: o.p.x, y: o.p.y, z: o.p.z, vx: o.v.x, vy: o.v.y, vz: o.v.z, s: o.size ?? 0.2, c: o.color || [0.1, 0.08, 0.06],
        life: o.life ?? 3, age: 0, hot: o.hot || 0, q: new THREE.Quaternion().setFromAxisAngle(axis, Math.random() * 6.28),
        ax: axis.clone(), spin: 6 + Math.random() * 10, rest: false });
    },
    update(dt) {
      let n = 0;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        it.age += dt;
        if (it.age > it.life) { items.splice(i, 1); i--; continue; }
        if (!it.rest) {
          it.vy -= 18 * dt;
          it.x += it.vx * dt; it.y += it.vy * dt; it.z += it.vz * dt;
          const fy = floorAt(it.x, it.z) + it.s * 0.3;
          if (it.y < fy) {
            it.y = fy;
            if (Math.abs(it.vy) < 1.5) { it.rest = true; it.vx = it.vz = it.vy = 0; }
            else { it.vy = -it.vy * 0.35; it.vx *= 0.5; it.vz *= 0.5; it.spin *= 0.5; }
          }
          q.setFromAxisAngle(it.ax, it.spin * dt); it.q.premultiply(q);
          if (it.hot > it.age && onHot && Math.random() < dt * 25) onHot(it);
        }
        const shrink = Math.min(1, (it.life - it.age) / 0.5);
        dummy.position.set(it.x, it.y - (1 - shrink) * it.s * 0.4, it.z); dummy.quaternion.copy(it.q); dummy.scale.setScalar(it.s * shrink);
        dummy.updateMatrix();
        mesh.setMatrixAt(n, dummy.matrix);
        col.setRGB(it.c[0], it.c[1], it.c[2]);
        mesh.setColorAt(n, col);
        n++;
      }
      mesh.count = n; mesh.visible = n > 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    },
  };
}
