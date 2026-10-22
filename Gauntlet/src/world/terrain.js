// Terrain mesh: exact heightAt() grid with a 5-layer height-blended splat material
// (grass / forest floor / rock (triplanar) / mud / flagstone), detail normals, macro variation,
// baked cavity AO and wet shorelines.
import * as THREE from 'three';
import { heightAt, surfaceAt, pathAt, WATER } from './layout.js';
import { texSet, getNoiseTex, GLSL_COMMON, patchVertex } from './materials.js';

// Debug hook: set TERRAIN_DEBUG.uRoughForce.value = 0.2 to force terrain roughness (pipeline check).
export const TERRAIN_DEBUG = { uRoughForce: { value: -1 } };
export const TERRAIN_SIZE = 200;
const SEG = 320, TILES = 8;

// Returns a Group of TILES x TILES chunk meshes (so off-screen chunks are frustum culled).
export function buildTerrain() {
  const N = SEG + 1, step = TERRAIN_SIZE / SEG, half = TERRAIN_SIZE / 2;
  const H = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) H[j * N + i] = heightAt(-half + i * step, -half + j * step);
  const at = (i, j) => H[Math.min(N - 1, Math.max(0, j)) * N + Math.min(N - 1, Math.max(0, i))];
  // Per-vertex attributes for the whole grid.
  const NRM = new Float32Array(N * N * 3), SA = new Float32Array(N * N * 4), SB = new Float32Array(N * N * 3);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const v = j * N + i, x = -half + i * step, z = -half + j * step, h = at(i, j);
    const dx = (at(i + 1, j) - at(i - 1, j)) / (2 * step), dz = (at(i, j + 1) - at(i, j - 1)) / (2 * step);
    const l = Math.hypot(dx, 1, dz);
    NRM[v * 3] = -dx / l; NRM[v * 3 + 1] = 1 / l; NRM[v * 3 + 2] = -dz / l;
    const w = surfaceAt(x, z, Math.hypot(dx, dz), h);
    SA[v * 4] = w[0]; SA[v * 4 + 1] = w[1]; SA[v * 4 + 2] = w[2]; SA[v * 4 + 3] = w[3];
    // Cavity: how far below the local average this vertex sits (baked AO).
    let avg = 0;
    for (const [a, b] of [[-3, 0], [3, 0], [0, -3], [0, 3], [-2, -2], [2, 2], [-2, 2], [2, -2]]) avg += at(i + a, j + b);
    avg /= 8;
    SB[v * 3] = w[4];
    SB[v * 3 + 1] = Math.max(-1, Math.min(1, (avg - h) * 1.4));
    SB[v * 3 + 2] = pathAt(x, z);
  }
  const mat = terrainMaterial();
  const group = new THREE.Group();
  group.name = 'terrain';
  const C = SEG / TILES, CN = C + 1;
  const idx = [];
  for (let j = 0; j < C; j++) for (let i = 0; i < C; i++) { const a = j * CN + i, b = a + 1, c = a + CN, d = c + 1; idx.push(a, c, b, b, c, d); }
  for (let tj = 0; tj < TILES; tj++) for (let ti = 0; ti < TILES; ti++) {
    const pos = new Float32Array(CN * CN * 3), nrm = new Float32Array(CN * CN * 3), sa = new Float32Array(CN * CN * 4), sb = new Float32Array(CN * CN * 3);
    for (let j = 0; j < CN; j++) for (let i = 0; i < CN; i++) {
      const gi = ti * C + i, gj = tj * C + j, v = gj * N + gi, o = j * CN + i;
      pos[o * 3] = -half + gi * step; pos[o * 3 + 1] = H[v]; pos[o * 3 + 2] = -half + gj * step;
      nrm.set(NRM.subarray(v * 3, v * 3 + 3), o * 3); sa.set(SA.subarray(v * 4, v * 4 + 4), o * 4); sb.set(SB.subarray(v * 3, v * 3 + 3), o * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    geo.setAttribute('splatA', new THREE.BufferAttribute(sa, 4));
    geo.setAttribute('splatB', new THREE.BufferAttribute(sb, 3));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.name = 'terrain';
    group.add(mesh);
  }
  return group;
}

function terrainMaterial() {
  const L = {
    grass: texSet('leafy_grass'), dirt: texSet('forrest_ground_01'), rock: texSet('rock_face_03'),
    mud: texSet('brown_mud_leaves_01'), flag: texSet('monastery_stone_floor'),
  };
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    patchVertex(shader);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 splatA; attribute vec3 splatB; varying vec4 vSplatA; varying vec3 vSplatB;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSplatA = splatA; vSplatB = splatB;');
    Object.assign(shader.uniforms, {
      tGD: { value: L.grass.d }, tGN: { value: L.grass.n },
      tDD: { value: L.dirt.d }, tDN: { value: L.dirt.n },
      tRD: { value: L.rock.d }, tRN: { value: L.rock.n },
      tMD: { value: L.mud.d }, tMN: { value: L.mud.n },
      tFD: { value: L.flag.d }, tFN: { value: L.flag.n },
      tNoise: { value: getNoiseTex() }, uRoughForce: TERRAIN_DEBUG.uRoughForce,
    });
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GLSL_COMMON + /* glsl */`
uniform float uRoughForce;
uniform sampler2D tGD, tGN, tDD, tDN, tRD, tRN, tMD, tMN, tFD, tFN, tNoise;
varying vec4 vSplatA; varying vec3 vSplatB;
float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
`)
      .replace('#include <map_fragment>', /* glsl */`
vec3 P = vTpPos; vec3 Ng = normalize(vTpN);
vec2 uv = P.xz;
vec4 nz = texture2D(tNoise, uv * 0.011);
// Very large-scale material masks (tens of metres) for macro variation.
vec4 nzL = texture2D(tNoise, uv * 0.0042 + 0.37);
vec4 nz2 = texture2D(tNoise, uv * 0.053);
vec4 nz3 = texture2D(tNoise, uv * 0.21);
// Anti-tiling: two scales with a slight rotation, blended by noise.
vec2 uvR = mat2(0.8, -0.6, 0.6, 0.8) * uv;
float ab = smoothstep(0.3, 0.7, nz2.r);
vec3 gD = mix(texture2D(tGD, uv * 0.30).rgb, texture2D(tGD, uvR * 0.17).rgb, ab);
vec3 gN = tpUnpack(mix(texture2D(tGN, uv * 0.30), texture2D(tGN, uvR * 0.17), ab));
vec3 dD = mix(texture2D(tDD, uv * 0.26).rgb, texture2D(tDD, uvR * 0.15).rgb, ab);
vec3 dN = tpUnpack(mix(texture2D(tDN, uv * 0.26), texture2D(tDN, uvR * 0.15), ab));
vec3 mD = texture2D(tMD, uvR * 0.24).rgb;
vec3 mN = tpUnpack(texture2D(tMN, uvR * 0.24));
vec3 fD = texture2D(tFD, uv * 0.16).rgb;
vec3 fN = tpUnpack(texture2D(tFN, uv * 0.16));
vec3 tw = tpWeights(Ng, 3.0);
vec3 rD = tpSample(tRD, P, tw, 0.13).rgb;
vec3 rWN = tpNormal(tRN, P, Ng, tw, 0.13, 1.3);
// Grade the photo textures toward a darker, desaturated gothic palette.
gD = mix(vec3(lum(gD)), gD, 0.6) * (0.7 + 0.45 * nz.g);
dD = mix(vec3(lum(dD)), dD, 0.75) * vec3(0.95, 0.85, 0.72) * (0.7 + 0.5 * nz.a);
dD = pow(dD, vec3(1.3)) * 1.25;
mD = mix(vec3(lum(mD)), mD, 0.5) * vec3(0.82, 0.74, 0.62);
rD = mix(vec3(lum(rD)), rD, 0.5) * vec3(0.8, 0.8, 0.82) * (0.75 + 0.5 * nz2.g);
fD = mix(vec3(lum(fD)), fD, 0.45) * vec3(0.82, 0.8, 0.78);
// ---- Camera-scale macro biomes inside the open ground (features ~8-25 m, visible in one frame) ----
vec4 nzM = texture2D(tNoise, uv * 0.03 + vec2(0.13, 0.71));
vec4 nzM2 = texture2D(tNoise, uv * 0.065 + vec2(0.55, 0.2));
// Gravel: rock photo, top-projected at pebble scale, desaturated grey.
vec3 gvD = texture2D(tRD, uvR * 0.85).rgb;
gvD = vec3(lum(gvD)) * vec3(1.0, 0.93, 0.82) * 0.95;
vec3 gvN = tpUnpack(texture2D(tRN, uvR * 0.85));
vec3 mossD = vec3(lum(gD)) * vec3(0.36, 0.66, 0.22) * 1.1;
vec3 swardD = vec3(lum(gD)) * vec3(0.78, 0.86, 0.38) * 1.05;
vec3 strawD = vec3(lum(gD)) * vec3(1.6, 1.12, 0.52);
// Height-blended sub-biome selection (crisp, organic borders instead of soft fades).
float sMoss = smoothstep(0.42, 0.58, nzM.r + (lum(gD) - 0.2) * 0.6);
float sStraw = smoothstep(0.5, 0.64, nzM.g + (lum(gD) - 0.2) * 0.8);
float sGravel = smoothstep(0.66, 0.74, nzM2.r * 0.75 + vSplatB.z * 0.45 + (lum(gvD) - 0.3) * 0.5);
vec3 grassMix = mix(swardD, mossD, sMoss);
grassMix = mix(grassMix, strawD, sStraw * (1.0 - sMoss * 0.6));
gD = mix(grassMix, gvD, sGravel);
vec3 gN2 = gN;
gN = normalize(mix(gN2, gvN * vec3(1.6, 1.6, 1.0), sGravel));
// Moss and dirt creeping into flagstone joints.
float grout = smoothstep(0.085, 0.035, lum(fD));
fD = mix(fD, mossD * 0.8, grout * 0.5);
fD *= 1.0 - grout * 0.45;
// Height-based splat blending using texture luminance as a height proxy.
float w0 = vSplatA.x, w1 = vSplatA.y, w2 = vSplatA.z, w3 = vSplatA.w, w4 = vSplatB.x;
float hg = lum(gD) * 1.6 + nz3.r * 0.25, hd = lum(dD) * 1.2 + nz3.g * 0.3, hr = lum(rD) * 1.4 + 0.15, hm = lum(mD) * 0.8, hf = lum(fD) * 1.5 + nz3.b * 0.3;
float b0 = w0 + hg * 0.6, b1 = w1 + hd * 0.6, b2 = w2 + hr * 0.6, b3 = w3 + hm * 0.6, b4 = w4 + hf * 0.5;
float bm = max(max(max(b0, b1), max(b2, b3)), b4) - 0.18;
float e0 = max(b0 - bm, 0.0) * step(0.001, w0), e1 = max(b1 - bm, 0.0) * step(0.001, w1), e2 = max(b2 - bm, 0.0) * step(0.001, w2), e3 = max(b3 - bm, 0.0) * step(0.001, w3), e4 = max(b4 - bm, 0.0) * step(0.001, w4);
float es = e0 + e1 + e2 + e3 + e4 + 1e-4;
e0 /= es; e1 /= es; e2 /= es; e3 /= es; e4 /= es;
// Bare loam breaking through the sward in patches.
float bare = smoothstep(0.58, 0.7, nzM2.g + nz3.r * 0.25) * (1.0 - sGravel);
gD = mix(gD, dD * vec3(1.0, 0.95, 0.9), bare * 0.7);
// Standing-water mud patches: dark, flat and glossy so torch/sun light pools on them.
float pool = smoothstep(0.6, 0.66, nzM2.b - nz3.g * 0.3 + (nz2.a - 0.5) * 0.25) * smoothstep(0.14, 0.26, vSplatB.y)
  * (1.0 - e2) * (1.0 - e4) * smoothstep(0.85, 0.97, Ng.y);
float poolRim = smoothstep(0.48, 0.62, nzM2.b - nz3.g * 0.3 + (nz2.a - 0.5) * 0.25) * smoothstep(0.06, 0.2, vSplatB.y) * (1.0 - e2) * (1.0 - e4);
vec3 alb = gD * e0 + dD * e1 + rD * e2 + mD * e3 + fD * e4;
// High-frequency detail layer (grit, twigs) so the ground holds up at gameplay zoom.
vec4 micro = texture2D(tDD, uvR * 1.15);
vec3 microN = tpUnpack(texture2D(tDN, uv * 1.3));
float soft = 1.0 - e2 - e4 * 0.6;
alb *= mix(1.0, 0.62 + 0.75 * lum(micro.rgb), 0.55 * soft);
// Trodden wear paths: compacted, darker centre line with fewer details.
float pth = vSplatB.z * (1.0 - e2) * (1.0 - e4);
float rut = smoothstep(0.55, 1.0, pth) * (0.6 + 0.4 * nz3.a);
alb = mix(alb, alb * vec3(0.66, 0.6, 0.55), rut * 0.7);
vec3 tn = gN * e0 * 1.6 + dN * e1 * 1.8 + mN * e3 * 1.2 + fN * e4 * 1.7 + vec3(0.0, 0.0, 1.0) * e2;
tn.xy += microN.xy * 0.7 * soft * (1.0 - rut * 0.6);
tn = normalize(vec3(tn.xy, max(tn.z, 0.25)));
vec3 WN = topNormal(tn, Ng);
WN = normalize(mix(WN, rWN, e2));
// Water films are flat: kill the detail normal under standing water.
WN = normalize(mix(WN, Ng, pool * 0.75));
// Faint ripple breakup on standing water so it never reads as a flat decal.
WN = normalize(WN + vec3(nz3.r - 0.5, 0.0, nz3.b - 0.5) * 0.12 * pool);
// Wetness: darken + gloss near the water line, inside puddle rims and in mud.
float wet = smoothstep(${(WATER + 0.85).toFixed(2)}, ${(WATER + 0.02).toFixed(2)}, P.y);
wet = max(wet, e3 * 0.3);
wet = max(wet, smoothstep(0.12, 0.45, vSplatB.y) * 0.7);
alb *= mix(1.0, 0.8, wet);
alb = mix(alb, alb * vec3(0.82, 0.78, 0.72), poolRim * 0.6);
alb = mix(alb, mD * vec3(1.05, 0.92, 0.78) * (0.85 + 0.3 * nz3.b), pool);
// Cavity AO and macro light/dark patches.
float cav = vSplatB.y;
alb *= clamp(1.0 - cav * 0.3, 0.7, 1.1);
alb *= 0.82 + 0.36 * nz.r;
diffuseColor.rgb *= alb;
// Roughness drives the specular response (verified by forcing 0.2): grass 0.85-0.95,
// gravel 0.6, soil 0.65, mud 0.3, trodden path centres 0.35, wet banks 0.2, standing water 0.08.
float tRough = 0.92 * e0 + 0.66 * e1 + 0.58 * e2 + 0.3 * e3 + 0.5 * e4;
tRough = mix(tRough, 0.6, sGravel * e0);
tRough = mix(tRough, 0.95, grout * e4);
tRough = mix(tRough, 0.82, sMoss * e0 * (1.0 - sGravel));
tRough = mix(tRough, 0.42, bare * e0);
tRough = mix(tRough, 0.35, rut);
tRough = mix(tRough, 0.4, smoothstep(0.08, 0.35, vSplatB.y) * (1.0 - e2));
tRough = mix(tRough, 0.3, wet * 0.85);
tRough = mix(tRough, 0.3, poolRim * 0.8);
tRough *= 0.85 + 0.3 * lum(micro.rgb) / 0.35;
tRough = mix(tRough, 0.12 + 0.12 * nz3.g, pool);
tRough = clamp(tRough, 0.06, 1.0);
`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = uRoughForce >= 0.0 ? uRoughForce : tRough;')
      .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(WN, 0.0)).xyz);')
      // Standing water mirrors the hazy sky: a fresnel-weighted fog-colour reflection so puddles read as
      // water rather than black stains, even where no light source lines up for a highlight.
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
#ifdef USE_FOG
{
  float pf = 0.25 + 0.75 * pow(1.0 - max(dot(normal, normalize(vViewPosition)), 0.0), 3.0);
  totalEmissiveRadiance += fogColor * (pool * 0.45 + poolRim * 0.06 + wet * 0.05) * pf;
}
#endif`);
  };
  mat.customProgramCacheKey = () => 'gauntlet-terrain-v5';
  return mat;
}
