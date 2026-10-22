// World materials: texture loading, world-space triplanar stone, splatted terrain, wind sway.
import * as THREE from 'three';

const BASE = 'assets/world/tex/';
const loader = new THREE.TextureLoader();
const cache = new Map();

export function tex(name, srgb = false) {
  const key = name + srgb;
  if (cache.has(key)) return cache.get(key);
  const t = loader.load(BASE + name);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, t);
  return t;
}
export const texSet = (id) => ({
  d: tex(`${id}_diff_1k.jpg`, true),
  n: tex(`${id}_nor_gl_1k.jpg`),
  r: tex(`${id}_rough_1k.jpg`),
});

// Tileable value-noise texture (R,G,B,A = four independent octave sets) for macro variation.
let noiseTex = null;
export function getNoiseTex() {
  if (noiseTex) return noiseTex;
  const N = 256, data = new Uint8Array(N * N * 4);
  const lat = (p, s) => { const g = new Float32Array(p * p); let a = s; for (let i = 0; i < g.length; i++) { a = (a * 16807) % 2147483647; g[i] = a / 2147483647; } return g; };
  for (let c = 0; c < 4; c++) {
    const vals = new Float32Array(N * N);
    let amp = 0.5, tot = 0;
    for (let o = 0; o < 5; o++) {
      const p = 4 << o, g = lat(p, 1234 + c * 97 + o * 13);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const fx = (x / N) * p, fy = (y / N) * p, ix = Math.floor(fx), iy = Math.floor(fy);
        let tx = fx - ix, ty = fy - iy; tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
        const x0 = ix % p, x1 = (ix + 1) % p, y0 = iy % p, y1 = (iy + 1) % p;
        const v = g[y0 * p + x0] * (1 - tx) * (1 - ty) + g[y0 * p + x1] * tx * (1 - ty) + g[y1 * p + x0] * (1 - tx) * ty + g[y1 * p + x1] * tx * ty;
        vals[y * N + x] += v * amp;
      }
      tot += amp; amp *= 0.5;
    }
    for (let i = 0; i < N * N; i++) data[i * 4 + c] = Math.max(0, Math.min(255, ((vals[i] / tot - 0.5) * 1.8 + 0.5) * 255));
  }
  noiseTex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  noiseTex.wrapS = noiseTex.wrapT = THREE.RepeatWrapping;
  noiseTex.magFilter = THREE.LinearFilter; noiseTex.minFilter = THREE.LinearMipmapLinearFilter;
  noiseTex.generateMipmaps = true; noiseTex.needsUpdate = true;
  return noiseTex;
}

// Shared GLSL: world position/normal varyings + triplanar helpers.
const VERT_PARS = /* glsl */`
varying vec3 vTpPos; varying vec3 vTpN;
`;
const VERT_MAIN = /* glsl */`
#include <project_vertex>
{
  vec4 tpW = vec4(transformed, 1.0);
  vec3 tpN = objectNormal;
  #ifdef USE_INSTANCING
    tpW = instanceMatrix * tpW;
    tpN = mat3(instanceMatrix) * tpN;
  #endif
  tpW = modelMatrix * tpW;
  vTpPos = tpW.xyz;
  vTpN = normalize(mat3(modelMatrix) * tpN);
}
`;
export const GLSL_COMMON = /* glsl */`
varying vec3 vTpPos; varying vec3 vTpN;
vec3 tpUnpack(vec4 s) { return s.xyz * 2.0 - 1.0; }
// Whiteout-blended triplanar normal (Golus). Returns world normal.
vec3 tpNormal(sampler2D nm, vec3 p, vec3 N, vec3 w, float sc, float str) {
  vec3 tx = tpUnpack(texture2D(nm, p.zy * sc)); tx.xy *= str;
  vec3 ty = tpUnpack(texture2D(nm, p.xz * sc)); ty.xy *= str;
  vec3 tz = tpUnpack(texture2D(nm, p.xy * sc)); tz.xy *= str;
  tx = vec3(tx.xy + N.zy, abs(tx.z) * N.x);
  ty = vec3(ty.xy + N.xz, abs(ty.z) * N.y);
  tz = vec3(tz.xy + N.xy, abs(tz.z) * N.z);
  return normalize(tx.zyx * w.x + ty.xzy * w.y + tz.xyz * w.z);
}
vec4 tpSample(sampler2D t, vec3 p, vec3 w, float sc) {
  return texture2D(t, p.zy * sc) * w.x + texture2D(t, p.xz * sc) * w.y + texture2D(t, p.xy * sc) * w.z;
}
vec3 tpWeights(vec3 N, float k) { vec3 w = pow(abs(N), vec3(k)); return w / (w.x + w.y + w.z); }
// Top-projected (xz) normal sample folded into world space around N.
vec3 topNormal(vec3 tn, vec3 N) { return normalize(vec3(tn.x + N.x, abs(tn.z) * N.y, tn.y + N.z)); }
`;

function patchVertex(shader) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\n' + VERT_PARS)
    .replace('#include <project_vertex>', VERT_MAIN);
}

// Wind sway on top of any material (vegetation). amp scales with object-space height.
export function addWind(shader, uTime, amp = 0.12, stiff = 1.4) {
  shader.uniforms.uTime = uTime;
  // Cards are lit with their authored (upward/outward) normals on both faces: no back-face flip.
  shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.split('normal *= faceDirection;').join(''))
    // Coverage-preserving alpha: boost alpha with mip level so distant cards stay solid instead of
    // breaking up into stipple; then clamp foliage albedo (~0.35 sRGB luma) so it never reads as mould.
    .replace('#include <map_fragment>', `#include <map_fragment>
#ifdef USE_MAP
{
  vec2 tsz = vec2(textureSize(map, 0));
  vec2 ddx = dFdx(vMapUv * tsz), ddy = dFdy(vMapUv * tsz);
  float lod = 0.5 * log2(max(max(dot(ddx, ddx), dot(ddy, ddy)), 1e-6));
  diffuseColor.a = min(1.0, diffuseColor.a * (1.0 + clamp(lod, 0.0, 3.0) * 0.12));
}
#endif`)
    .replace('#include <color_fragment>', `#include <color_fragment>
{
  float fl = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
  diffuseColor.rgb *= min(1.0, 0.13 / max(fl, 1e-4));
}`);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nuniform float uTime;')
    .replace('#include <begin_vertex>', /* glsl */`
#include <begin_vertex>
{
  vec3 ip = vec3(0.0);
  #ifdef USE_INSTANCING
    ip = instanceMatrix[3].xyz;
  #endif
  float hh = pow(max(position.y, 0.0), ${stiff.toFixed(2)});
  float ph = ip.x * 0.31 + ip.z * 0.23;
  float gust = 0.6 + 0.4 * sin(uTime * 0.37 + ip.x * 0.05 - ip.z * 0.04);
  float s = (sin(uTime * 1.9 + ph) + 0.45 * sin(uTime * 3.7 + ph * 2.3)) * ${amp.toFixed(3)} * gust * hh;
  transformed.x += s;
  transformed.z += s * 0.55 + sin(uTime * 2.6 + ph * 1.7) * ${(amp * 0.4).toFixed(3)} * hh;
}`);
}

// World-space triplanar stone (rocks, cliffs, ruins). Optional moss/top layer by normal.y.
export function triplanarMaterial({ set, scale = 0.25, tint = 0xffffff, normalStrength = 1.0, top = null, topScale = 0.3, topAmount = 0.5, topTint = 0xffffff, roughness = 1.0, vertexColors = false, wetBase = false, desat = 0 }) {
  const mat = new THREE.MeshStandardMaterial({ color: tint, roughness, metalness: 0, vertexColors });
  const noise = getNoiseTex();
  mat.onBeforeCompile = (shader) => {
    patchVertex(shader);
    Object.assign(shader.uniforms, {
      tD: { value: set.d }, tN: { value: set.n }, tR: { value: set.r }, tNoise: { value: noise },
      tTopD: { value: top ? top.d : set.d }, tTopN: { value: top ? top.n : set.n },
      uTopTint: { value: new THREE.Color(topTint) },
    });
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GLSL_COMMON + `
uniform sampler2D tD, tN, tR, tNoise, tTopD, tTopN; uniform vec3 uTopTint;`)
      .replace('#include <map_fragment>', /* glsl */`
vec3 tpNw = normalize(vTpN);
vec3 tpW3 = tpWeights(tpNw, 4.0);
vec4 tpAlb = tpSample(tD, vTpPos, tpW3, ${scale.toFixed(3)});
float tpRgh = tpSample(tR, vTpPos, tpW3, ${scale.toFixed(3)}).r;
tpAlb.rgb = mix(tpAlb.rgb, vec3(dot(tpAlb.rgb, vec3(0.3, 0.59, 0.11))), ${desat.toFixed(2)});
vec3 tpWN = tpNormal(tN, vTpPos, tpNw, tpW3, ${scale.toFixed(3)}, ${normalStrength.toFixed(2)});
float macro = texture2D(tNoise, vTpPos.xz * 0.021 + vTpPos.y * 0.01).r;
tpAlb.rgb *= 0.75 + 0.5 * macro;
${top ? `
float topN = texture2D(tNoise, vTpPos.xz * 0.13).g;
float topMask = smoothstep(0.35, 0.85, tpWN.y + (topN - 0.5) * 0.9 + ${(topAmount - 0.5).toFixed(2)});
vec3 topAlb = texture2D(tTopD, vTpPos.xz * ${topScale.toFixed(3)}).rgb * uTopTint;
vec3 topNrm = topNormal(tpUnpack(texture2D(tTopN, vTpPos.xz * ${topScale.toFixed(3)})), tpNw);
tpAlb.rgb = mix(tpAlb.rgb, topAlb, topMask);
tpWN = normalize(mix(tpWN, topNrm, topMask * 0.8));
tpRgh = mix(tpRgh, 0.95, topMask);` : ''}
${wetBase ? `
tpAlb.rgb *= mix(0.55, 1.0, smoothstep(${0}, 0.9, vTpPos.y + 0.2));` : ''}
diffuseColor.rgb *= tpAlb.rgb;
`)
      .replace('#include <roughnessmap_fragment>', `float roughnessFactor = roughness * clamp(tpRgh, 0.3, 1.0);`)
      .replace('#include <normal_fragment_maps>', `normal = normalize((viewMatrix * vec4(tpWN, 0.0)).xyz);`);
  };
  mat.customProgramCacheKey = () => `tri-${scale}-${!!top}-${topScale}-${topAmount}-${normalStrength}-${wetBase}-${desat}`;
  return mat;
}

export { patchVertex };

// ---------- Occlusion fade ----------
// Soft circular cut-out of anything (trees, ruins, crags) standing between the camera and the player,
// D4-style: a clean hole around the camera->hero ray (a circle on screen) with a thin noise-dithered rim. world.update() keeps OCC.uFocus on the camera's ground focus point.
export const OCC = { uFocus: { value: new THREE.Vector3() }, uRadius: { value: 4.2 } };
export function withFade(mat) {
  const prev = mat.onBeforeCompile;
  const prevKey = mat.customProgramCacheKey;
  mat.onBeforeCompile = (shader, renderer) => {
    if (prev) prev.call(mat, shader, renderer);
    shader.uniforms.uFocus = OCC.uFocus; shader.uniforms.uOccR = OCC.uRadius;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vOccW;')
      .replace('#include <project_vertex>', `#include <project_vertex>
{
  vec4 ow = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    ow = instanceMatrix * ow;
  #endif
  vOccW = (modelMatrix * ow).xyz;
}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vOccW; uniform vec3 uFocus; uniform float uOccR;
float occIGN(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
{
  vec3 oa = cameraPosition, ob = uFocus + vec3(0.0, 1.0, 0.0);
  vec3 oab = ob - oa;
  float ot = clamp(dot(vOccW - oa, oab) / dot(oab, oab), 0.0, 1.0);
  float od = length(vOccW - (oa + oab * ot));
  // Radius widens slightly with height so tall canopies open up more than trunks.
  float rr = uOccR * (1.0 + 0.06 * max(vOccW.y - uFocus.y - 2.0, 0.0));
  float cut = 1.0 - smoothstep(rr * 0.78, rr, od);
  cut *= step(ot, 0.975) * smoothstep(uFocus.y + 0.9, uFocus.y + 1.6, vOccW.y);
  if (cut > 0.999 || cut > occIGN(gl_FragCoord.xy)) discard;
}`);
  };
  mat.customProgramCacheKey = () => (prevKey ? prevKey.call(mat) : '') + '-occfade';
  return mat;
}
