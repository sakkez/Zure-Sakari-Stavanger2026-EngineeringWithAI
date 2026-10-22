// Shrinking battle-royale zone: stage logic (drifting centers, next-circle preview) plus visuals:
//  - a swirling arcane storm wall (terrain-hugging open cylinder, additive noise shader, fades upward)
//  - a terrain-conforming ground overlay that darkens/tints everything outside the zone, glows at the wall base,
//    and draws the next-zone circle as an animated dashed line.
import * as THREE from 'three';
import { rng } from './rng.js';

// Fraction of world.radius per stage. Stage 0 is the full arena.
export const ZONE_STAGES = [
  { r: 1.0, wait: 40, shrink: 0 },
  { r: 0.7, wait: 32, shrink: 18 },
  { r: 0.48, wait: 28, shrink: 16 },
  { r: 0.3, wait: 24, shrink: 14 },
  { r: 0.16, wait: 20, shrink: 12 },
  { r: 0.06, wait: 9999, shrink: 10 },
];

const NOISE = /* glsl */`
float h31(vec3 p){ p = fract(p*0.3183099 + vec3(0.71,0.113,0.419)); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float n3(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(h31(i),h31(i+vec3(1,0,0)),f.x), mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),f.x), mix(h31(i+vec3(0,1,1)),h31(i+vec3(1,1,1)),f.x),f.y), f.z); }
float fbm3(vec3 p){ float a=0.5, s=0.0; for(int i=0;i<4;i++){ s+=a*n3(p); p=p*2.03+vec3(1.7,9.2,3.1); a*=0.5; } return s; }
`;

// Transparent effect meshes must not land in override-material passes (e.g. the engine's GTAO normal/depth
// prepass renders the scene with scene.overrideMaterial; an 18m storm wall in that buffer blacks out everything behind it).
// Zero the draw range whenever the mesh is drawn with any material other than its own.
export function skipOverridePasses(mesh) {
  mesh.onBeforeRender = (renderer, scene, camera, geometry, material) => {
    geometry.drawRange.count = material === mesh.material ? Infinity : 0;
  };
  return mesh;
}

export function createZone(ctx, state) {
  const { engine, world, fx } = ctx;
  const { scene } = engine;
  const z = state.zone;
  Object.assign(z, {
    radius: world.radius, target: world.radius, center: new THREE.Vector3(), stage: 0,
    timer: ZONE_STAGES[0].wait, shrinking: false, next: null, dps: 3,
    _from: { c: new THREE.Vector3(), r: world.radius }, _shrinkT: 0,
  });

  // ---------- Wall ----------
  const SEG = 180, ROWS = 8, H = 5.2, SINK = 0.7; // ~4.5m visible curtain
  const wallGeo = new THREE.BufferGeometry();
  const wpos = new Float32Array((SEG + 1) * (ROWS + 1) * 3), wuv = new Float32Array((SEG + 1) * (ROWS + 1) * 2);
  const idx = [];
  for (let i = 0; i <= SEG; i++) for (let j = 0; j <= ROWS; j++) {
    const k = i * (ROWS + 1) + j;
    wuv[k * 2] = i / SEG; wuv[k * 2 + 1] = j / ROWS;
    if (i < SEG && j < ROWS) { const a = k, b = k + ROWS + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  }
  wallGeo.setAttribute('position', new THREE.BufferAttribute(wpos, 3));
  wallGeo.setAttribute('uv', new THREE.BufferAttribute(wuv, 2));
  wallGeo.setIndex(idx);
  const wallMat = new THREE.ShaderMaterial({
    // Premultiplied blend: dark storm smoke (alpha) + additive ember/arcane glow (rgb) in one pass.
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    uniforms: {
      uTime: { value: 0 }, uCenter: { value: new THREE.Vector2() }, uIntensity: { value: 1.0 },
      uColB: { value: new THREE.Color(0.55, 0.12, 0.09) }, uColC: { value: new THREE.Color(0.85, 0.3, 0.22) }, // desaturated storm reds
      uSink: { value: SINK / H }, uR: { value: 60 },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv; varying vec3 vW; varying vec3 vN; varying vec3 vV;
      uniform vec2 uCenter;
      void main(){ vUv=uv; vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz;
        vN=normalize(vec3(w.x-uCenter.x,0.0,w.z-uCenter.y)); vV=normalize(cameraPosition-w.xyz);
        gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: NOISE + /* glsl */`
      uniform float uTime, uIntensity, uSink, uR; uniform vec2 uCenter; uniform vec3 uColB, uColC;
      varying vec2 vUv; varying vec3 vW; varying vec3 vN; varying vec3 vV;
      void main(){
        float h = clamp((vUv.y - uSink) / (1.0 - uSink), 0.0, 1.0);
        float top = 1.0 - smoothstep(0.25, 1.0, h); top *= top;          // soft top fade
        float foot = smoothstep(-0.12, 0.08, h);
        vec2 q = vW.xz - uCenter; float ang = uTime*0.05; q = mat2(cos(ang),-sin(ang),sin(ang),cos(ang))*q;
        vec3 p = vec3(q.x*0.26, vW.y*0.32, q.y*0.26);
        float t = uTime;
        float n1 = fbm3(p + vec3(t*0.06, -t*0.45, 0.0));
        float n2 = fbm3(p*2.2 + vec3(0.0, -t*1.1, t*0.1) + n1*1.6);
        float streak = smoothstep(0.42, 0.85, n2);
        float ridge = pow(1.0 - abs(n2*2.0 - 1.0), 14.0);
        // near side of the ring (between camera and arena) is seen through: keep it thin
        float through = mix(1.0, 0.2, smoothstep(-0.15, 0.35, dot(vN, vV)));
        float smoke = (0.3 + 0.7*n1) * top * foot;
        float aSmoke = clamp(smoke * 0.85 * through, 0.0, 0.82);
        float base = exp(-max(h, 0.0)*8.0) * foot;
        // sparse lightning: a few wall sectors flare briefly, the rest stays a dim smoky curtain
        vec2 qw = vW.xz - uCenter;
        float sector = floor(atan(qw.y, qw.x) * uR / 6.0);
        float tc = floor(uTime * 2.5);
        float hs = fract(sin(sector * 12.9898 + tc * 78.233) * 43758.5453);
        // rare and brief: ~2% of sectors, only in the first 40% of a 0.4s window, flickering
        float ph = fract(uTime * 2.5);
        float flash = step(0.98, hs) * step(ph, 0.4) * (1.0 - ph / 0.4) * step(0.45, fract(uTime * 23.0 + hs * 7.0));
        vec3 glow = (uColB * streak * n1 * 0.2 * top + uColC * ridge * top * (0.06 + 2.6 * flash) + uColB * base * 0.18) * through * uIntensity;
        gl_FragColor = vec4(vec3(0.055, 0.05, 0.055) * (0.6 + 0.6 * n1) * aSmoke + glow, aSmoke); // grey storm smoke
      }`,
  });
  const wall = new THREE.Mesh(wallGeo, wallMat);
  wall.frustumCulled = false; wall.renderOrder = 5; skipOverridePasses(wall);
  scene.add(wall);
  // Ragged edge: radius displaced by slowly animated low-frequency waves (shared by wall, overlay and damage test).
  let edgeT = 0;
  const amp = () => 1.5 * Math.min(1, z.radius / 12);
  function edgeOff(a, t = edgeT) {
    return amp() * (0.5 * Math.sin(3 * a + 0.2 * t) + 0.3 * Math.sin(7 * a - 0.13 * t + 1.3) + 0.2 * Math.sin(13 * a + 0.31 * t + 2.1));
  }
  let lastWall = { t: NaN };
  function rebuildWall() {
    const cx = z.center.x, cz = z.center.z;
    if (Math.abs(edgeT - lastWall.t) < 0.05 && lastWall.r === z.radius && lastWall.x === cx && lastWall.z === cz) return;
    lastWall = { t: edgeT, r: z.radius, x: cx, z: cz };
    for (let i = 0; i <= SEG; i++) {
      const a = (i / SEG) * Math.PI * 2, R = z.radius + edgeOff(a);
      const x = cx + Math.cos(a) * R, zz = cz + Math.sin(a) * R;
      const g = Math.max(world.heightAt(x, zz), world.waterLevel) - SINK;
      for (let j = 0; j <= ROWS; j++) {
        const k = (i * (ROWS + 1) + j) * 3;
        wpos[k] = x; wpos[k + 1] = g + (j / ROWS) * H; wpos[k + 2] = zz;
      }
    }
    wallGeo.attributes.position.needsUpdate = true;
  }

  // ---------- Ground overlay (outside tint + wall base glow + next circle) ----------
  const SIZE = 190, GS = 170;
  const og = new THREE.PlaneGeometry(SIZE, SIZE, GS, GS).rotateX(-Math.PI / 2);
  const op = og.attributes.position;
  for (let i = 0; i < op.count; i++) op.setY(i, Math.max(world.heightAt(op.getX(i), op.getZ(i)), world.waterLevel) + 0.07);
  const overMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
    uniforms: {
      uTime: { value: 0 }, uCenter: { value: new THREE.Vector2() }, uRadius: { value: world.radius },
      uNext: { value: new THREE.Vector2() }, uNextR: { value: 0 }, uNextOn: { value: 0 }, uAmp: { value: 1.5 }, uPlayer: { value: new THREE.Vector2(1e4, 1e4) },
    },
    vertexShader: /* glsl */`varying vec3 vW; void main(){ vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: NOISE + /* glsl */`
      uniform float uTime, uRadius, uNextR, uNextOn, uAmp; uniform vec2 uCenter, uNext, uPlayer; varying vec3 vW;
      void main(){
        vec2 rel = vW.xz - uCenter; float ea = atan(rel.y, rel.x);
        float R = uRadius + uAmp*(0.5*sin(3.0*ea+0.2*uTime) + 0.3*sin(7.0*ea-0.13*uTime+1.3) + 0.2*sin(13.0*ea+0.31*uTime+2.1));
        float d = length(rel); float e = d - R;
        // drifting storm-cloud shadows outside the zone
        float n = fbm3(vec3(vW.xz*0.06 + vec2(uTime*0.22, uTime*0.09), uTime*0.07));
        float n2 = fbm3(vec3(vW.xz*0.22 - vec2(uTime*0.5, 0.0), uTime*0.3));
        float outside = smoothstep(R - 0.3, R + 2.5, d);
        // cold, desaturated storm fog (mixes the ground toward grey-blue instead of crushing it to black)
        float dark = outside * clamp(0.36 + 0.2*n, 0.0, 0.55);
        vec3 tint = vec3(0.07, 0.075, 0.085) * (0.6 + 0.6*n);
        // glow hugging the wall foot + soft spill onto the ground inside the circle
        float foot = exp(-abs(e)*2.2) * (0.5 + 0.7*n2);
        float spill = exp(-max(-e, 0.0)*0.7) * (1.0 - outside) * (0.4 + 0.8*n2);
        vec3 glow = vec3(0.6, 0.12, 0.1) * (foot*0.2 + spill*0.06);
        float dn = length(vW.xz - uNext);
        // next zone: barely there (0.04), dashed, and only near the hero
        float nang = atan(vW.z - uNext.y, vW.x - uNext.x);
        float dash = step(0.5, fract(nang * uNextR / 1.4));
        float nearP = 1.0 - smoothstep(6.0, 16.0, length(vW.xz - uPlayer));
        float line = smoothstep(0.06, 0.02, abs(dn - uNextR)) * uNextOn * dash * nearP * 0.5;
        vec3 nextCol = vec3(0.5, 0.5, 0.48) * line * 0.04;
        float a = dark + line * 0.04 * (1.0 - dark);
        gl_FragColor = vec4(tint*dark + glow + nextCol, a);
      }`,
  });
  const overlay = new THREE.Mesh(og, overMat);
  overlay.renderOrder = 2; overlay.frustumCulled = false; skipOverridePasses(overlay);
  scene.add(overlay);

  // ---------- Logic ----------
  function pickNext(stageIdx) {
    const def = ZONE_STAGES[stageIdx];
    if (!def) return null;
    const nr = world.radius * def.r;
    const maxOff = Math.max(0, z.radius - nr) * 0.9;
    const c = new THREE.Vector3();
    for (let tries = 0; tries < 20; tries++) {
      const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * maxOff;
      c.set(z.center.x + Math.cos(a) * d, 0, z.center.z + Math.sin(a) * d);
      const lim = world.radius - nr - 3;
      const l = Math.hypot(c.x, c.z);
      if (l > lim) c.multiplyScalar(Math.max(0, lim) / l);
      if (world.heightAt(c.x, c.z) > world.waterLevel + 0.4) break;
    }
    return { center: c, radius: nr };
  }

  function outsideDist(x, zz) { const dx = x - z.center.x, dz = zz - z.center.z; return Math.hypot(dx, dz) - z.radius - edgeOff(Math.atan2(dz, dx)); }

  const tmp = new THREE.Vector3();
  const zone = {
    mesh: { wall, overlay },
    outsideDist,
    // Safe point to run toward: the next circle if one is shown, else the current one.
    safeCenter() { return z.next ? z.next.center : z.center; },
    safeRadius() { return z.next ? z.next.radius : z.radius; },
    reset() {
      z.radius = z.target = world.radius; z.center.set(0, 0, 0); z.stage = 0; z.shrinking = false;
      z.timer = ZONE_STAGES[0].wait; z.next = pickNext(1); z.target = z.next.radius; z.dps = 3; lastWall.r = NaN;
    },
    // Force an exact layout (used by api.stage for screenshots).
    set({ center, radius, stage = z.stage, next = null, timer = 999 }) {
      z.center.copy(center); z.radius = z.target = radius; z.stage = stage; z.timer = timer; z.shrinking = false;
      z.next = next ? { center: next.center.clone(), radius: next.radius } : null; lastWall.r = NaN;
      z.target = z.next ? z.next.radius : radius;
      z.dps = 3 + stage * 3;
    },
    update(dt, t, onStage) {
      z.timer -= dt;
      if (!z.shrinking && z.timer <= 0 && z.next) {
        z.shrinking = true; z._from.c.copy(z.center); z._from.r = z.radius;
        z.timer = ZONE_STAGES[z.stage + 1].shrink; z._shrinkT = z.timer; z.target = z.next.radius;
        onStage?.('shrink');
      } else if (z.shrinking) {
        const k = 1 - Math.max(0, z.timer) / z._shrinkT, e = k * k * (3 - 2 * k);
        z.center.lerpVectors(z._from.c, z.next.center, e);
        z.radius = z._from.r + (z.next.radius - z._from.r) * e;
        if (z.timer <= 0) {
          z.shrinking = false; z.stage++; z.radius = z.next.radius; z.center.copy(z.next.center);
          z.dps = 3 + z.stage * 3;
          z.timer = ZONE_STAGES[z.stage].wait; z.next = pickNext(z.stage + 1); z.target = z.next ? z.next.radius : z.radius;
          onStage?.('stage');
        }
      }
      this.visuals(dt, t);
    },
    visuals(dt, t) {
      edgeT = t;
      rebuildWall();
      wallMat.uniforms.uTime.value = t;
      wallMat.uniforms.uCenter.value.set(z.center.x, z.center.z);
      wallMat.uniforms.uIntensity.value = z.shrinking ? 1.25 : 1.0;
      const u = overMat.uniforms;
      u.uTime.value = t; u.uCenter.value.set(z.center.x, z.center.z); u.uRadius.value = z.radius; u.uAmp.value = amp(); if (state.player) u.uPlayer.value.set(state.player.pos.x, state.player.pos.z);
      wallMat.uniforms.uR.value = z.radius;
      if (z.next) { u.uNext.value.set(z.next.center.x, z.next.center.z); u.uNextR.value = z.next.radius; u.uNextOn.value = 1; }
      else u.uNextOn.value = 0;
      // Drifting arcane motes along the stretch of wall nearest the camera focus.
      const focus = state.player?.pos;
      if (focus && fx && dt > 0) {
        const dx = focus.x - z.center.x, dz = focus.z - z.center.z;
        const base = Math.atan2(dz, dx), arc = Math.min(Math.PI, 30 / Math.max(1, z.radius));
        const distToWall = Math.abs(Math.hypot(dx, dz) - z.radius);
        if (distToWall < 35 && Math.random() < 0.6) for (let i = 0; i < 1; i++) {
          const a = base + (Math.random() - 0.5) * 2 * arc;
          const x = z.center.x + Math.cos(a) * z.radius, zz = z.center.z + Math.sin(a) * z.radius;
          fx.spawn('zone', tmp.set(x, world.heightAt(x, zz) + Math.random() * 1.5, zz));
        }
      }
    },
  };
  zone.reset();
  zone.visuals(0, 0);
  return zone;
}
