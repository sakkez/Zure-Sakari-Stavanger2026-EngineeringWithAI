// Lake + bog puddles: depth-tinted, shoreline foam, animated detail normals, sky fresnel, sun glint.
import * as THREE from 'three';
import { heightAt, WATER, LAKE, PUDDLES } from './layout.js';
import { getNoiseTex } from './materials.js';

function waterNormalTex() {
  const src = getNoiseTex().image, N = src.width, d = src.data;
  const out = new Uint8Array(N * N * 4);
  const hgt = (x, y) => { x = (x + N) % N; y = (y + N) % N; const i = (y * N + x) * 4; return (d[i + 3] * 0.6 + d[i + 1] * 0.4) / 255; };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = (hgt(x + 1, y) - hgt(x - 1, y)) * 6, dy = (hgt(x, y + 1) - hgt(x, y - 1)) * 6;
    const l = Math.hypot(dx, dy, 1), i = (y * N + x) * 4;
    out[i] = (-dx / l * 0.5 + 0.5) * 255; out[i + 1] = (-dy / l * 0.5 + 0.5) * 255; out[i + 2] = (1 / l * 0.5 + 0.5) * 255; out[i + 3] = 255;
  }
  const t = new THREE.DataTexture(out, N, N, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true; t.needsUpdate = true;
  return t;
}

function gridPatch(x0, z0, x1, z1, step, pos, dep, idx) {
  const nx = Math.ceil((x1 - x0) / step) + 1, nz = Math.ceil((z1 - z0) / step) + 1;
  const base = pos.length / 3;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = x0 + i * step, z = z0 + j * step;
    pos.push(x, WATER, z); dep.push(WATER - heightAt(x, z));
  }
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = base + j * nx + i, b = a + 1, c = a + nx, e = c + 1;
    if (Math.max(dep[a], dep[b], dep[c], dep[e]) < -0.12) continue;
    idx.push(a, c, b, b, c, e);
  }
}

export function buildWater(uTime, WU = {}) {
  const pos = [], dep = [], idx = [];
  const R = LAKE.rad * LAKE.long + 13;
  gridPatch(LAKE.x - R, LAKE.z - R, LAKE.x + R, LAKE.z + R, 0.5, pos, dep, idx);
  for (const p of PUDDLES) { const r = p.r * 2.4 * (p.e || 1); gridPatch(p.x - r, p.z - r, p.x + r, p.z + r, 0.35, pos, dep, idx); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('depth', new THREE.Float32BufferAttribute(dep, 1));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  geo.setIndex(idx);

  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.1, metalness: 0.0, transparent: true, depthWrite: false, envMapIntensity: 1.0 });
  const wn = waterNormalTex(), noise = getNoiseTex();
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, { uTime, tWN: { value: wn }, tNoise: { value: noise },
      uHorizon: WU.uHorizon || { value: new THREE.Color(0.32, 0.35, 0.4) }, uZenith: WU.uZenith || { value: new THREE.Color(0.08, 0.1, 0.14) },
      uSunDir: WU.uSunDir || { value: new THREE.Vector3(0.5, 0.7, 0.3).normalize() }, uSunCol: WU.uSunCol || { value: new THREE.Color(1, 0.85, 0.7) } });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float depth; varying float vDepth; varying vec3 vWP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDepth = depth; vWP = (modelMatrix * vec4(position, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', /* glsl */`#include <common>
uniform float uTime; uniform sampler2D tWN, tNoise; uniform vec3 uHorizon, uZenith, uSunDir, uSunCol;
varying float vDepth; varying vec3 vWP;
vec3 wnS(vec2 uv) { return texture2D(tWN, uv).xyz * 2.0 - 1.0; }`)
      .replace('#include <map_fragment>', /* glsl */`
float dpt = vDepth;
if (dpt < -0.02) discard;
vec2 wuv = vWP.xz;
// Two dominant ripple normals scrolling against each other, plus a fine wind-chop layer.
vec3 n1 = wnS(wuv * 0.07 + vec2(uTime * 0.021, uTime * 0.013));
vec3 n2 = wnS(mat2(0.8, -0.6, 0.6, 0.8) * wuv * 0.13 + vec2(-uTime * 0.027, uTime * 0.019));
vec3 n3 = wnS(wuv * 0.42 + vec2(uTime * 0.05, -uTime * 0.04));
// Detail chop fades out with distance from camera so the far lake stays calm.
float farK = 1.0 - 0.5 * smoothstep(20.0, 45.0, length(cameraPosition.xz - wuv));
vec3 tnW = normalize(vec3((n1.xy * 0.55 + n2.xy * 0.4) * farK + n3.xy * 0.1 * farK, 1.0));
vec3 wN = normalize(vec3(tnW.x, tnW.z, tnW.y));
float nzF = texture2D(tNoise, wuv * 0.35 + vec2(uTime * 0.02, 0.0)).r;
float nzF2 = texture2D(tNoise, wuv * 0.9 - vec2(0.0, uTime * 0.03)).g;
// Lake/puddle body colour (linear): murky green-teal shallows to dark teal depths.
vec3 shallowC = vec3(0.085, 0.082, 0.06); // peaty brown shallows
vec3 deepC = vec3(0.012, 0.028, 0.032);
vec3 wcol = mix(shallowC, mix(vec3(0.05, 0.07, 0.065), deepC, smoothstep(0.6, 1.6, dpt)), smoothstep(0.1, 0.7, dpt));
// Shoreline foam: thin, broken, gently pulsing bands.
float edge = dpt + (nzF - 0.5) * 0.12;
float band = 0.5 + 0.5 * sin(edge * 55.0 - uTime * 1.6 + nzF2 * 5.0);
// Only where wind-driven waves reach the shore (large-scale gate), never a continuous ring.
float reach = smoothstep(0.5, 0.75, texture2D(tNoise, wuv * 0.04 + vec2(uTime * 0.003, 0.0)).b) * smoothstep(0.25, 0.7, dpt + 0.3);
// Soft, sparse lapping at real shorelines only: a broad faint band (no thin bright rim that would
// outline every half-sunk stone), gated by the wave-reach mask.
float foam = smoothstep(0.14, 0.03, edge) * smoothstep(0.0, 0.03, dpt) * (0.5 + 0.5 * band) * smoothstep(0.45, 0.8, nzF2 + 0.15);
foam *= 0.22 * reach;
foam = clamp(foam, 0.0, 1.0);
wcol = mix(wcol, vec3(0.42, 0.44, 0.42), foam);
float walpha = mix(0.18, 0.93, smoothstep(0.05, 0.7, dpt));
walpha = max(walpha, foam * 0.6) * smoothstep(-0.02, 0.06, dpt);
diffuseColor = vec4(wcol, walpha);
`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = 0.42;')
      .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(wN, 0.0)).xyz);')
      .replace('#include <lights_fragment_begin>', THREE.ShaderChunk.lights_fragment_begin.split('? getShadow(').join('? 0.7 + 0.3 * getShadow('))
      .replace('#include <emissivemap_fragment>', /* glsl */`
#include <emissivemap_fragment>
{
  // Stylised sky reflection: Schlick fresnel (lifted so it reads from a top-down camera),
  // gradient sky with drifting cloud breakup, and a tight sun glint on the ripples.
  vec3 Vw = normalize(cameraPosition - vWP);
  float fr = 0.02 + 0.98 * pow(1.0 - max(dot(wN, Vw), 0.0), 5.0);
  fr = max(fr, 0.25);
  vec3 Rw = reflect(-Vw, wN);
  float up = clamp(Rw.y, 0.0, 1.0);
  vec3 sky = mix(uHorizon, uZenith, pow(up, 0.5));
  float cl = texture2D(tNoise, Rw.xz / max(Rw.y, 0.2) * 0.12 + vec2(uTime * 0.004, 0.0)).r;
  // Ripple slopes catch the bright horizon: makes the surface read as moving water, not a slab.
  float slope = clamp((1.0 - wN.y) * 9.0, 0.0, 1.0);
  sky *= (0.7 + 0.3 * cl) * (0.85 + 0.2 * slope);
  float sd = max(dot(Rw, uSunDir), 0.0);
  // Specular from a smoothed (large-ripple only) normal: broad soft sheen, few sparkles.
  vec3 sN = normalize(vec3(n1.x * 1.3 + n2.x * 1.1, 1.0 / 0.55, n1.y * 1.3 + n2.y * 1.1));
  float sd2 = max(dot(reflect(-Vw, sN), uSunDir), 0.0);
  // One broad soft sheen; a large slow mask breaks it into a few drifting streaks, never a sparkle field.
  float streak = smoothstep(0.35, 0.75, texture2D(tNoise, wuv * 0.025 + vec2(uTime * 0.004, -uTime * 0.003)).g);
  float glint = (pow(sd2, 40.0) * 0.45 * (0.4 + 0.6 * streak) + pow(sd2, 10.0) * 0.18) * mix(0.25, 1.0, smoothstep(0.15, 0.6, dpt));
  totalEmissiveRadiance += (sky * fr + uSunCol * glint) * (1.0 - foam) * smoothstep(0.0, 0.12, dpt);
}`)
      // Water sits below the engine's low-lying height fog base; use distance fog only so the
      // surface stays dark and glossy instead of turning into flat grey discs.
      .replace('#include <fog_fragment>', /* glsl */`
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float wFog = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
  #else
    float wFog = smoothstep( fogNear, fogFar, vFogDepth );
  #endif
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, wFog );
#endif`);
  };
  mat.customProgramCacheKey = () => 'gauntlet-water-v6';
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.renderOrder = 1;
  mesh.name = 'water';
  return mesh;
}
