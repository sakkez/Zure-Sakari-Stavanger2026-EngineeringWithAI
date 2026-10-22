// Character material pipeline: palette-atlas grading, derived roughness/metalness maps, a small
// character-only environment map, and a shader patch adding fresnel rim light + hit flash.
import * as THREE from 'three';

const CELL_W = 1 / 8, CELL_H = 1 / 4; // KayKit atlases are an 8x4 grid of palette cells.

// ---------- canvas helpers ----------
export function imageToCanvas(image, maxSize = 512) {
  // KayKit atlases are flat gradient cells: 512px is visually identical and 4x cheaper to process.
  const c = document.createElement('canvas');
  const k = Math.min(1, maxSize / Math.max(image.width, image.height));
  c.width = Math.round(image.width * k); c.height = Math.round(image.height * k);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(image, 0, 0, c.width, c.height);
  return c;
}

function rgb2hsv(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d > 1e-5) {
    if (max === r) h = ((g - b) / d) % 6; else if (max === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return [h, max > 0 ? d / max : 0, max];
}

// Classify a texel into a surface kind used for roughness/metalness.
function surfaceOf(r, g, b) {
  const [h, s, v] = rgb2hsv(r, g, b);
  if (s < 0.2 && b >= r - 0.015 && v > 0.16 && v < 0.82) return 'steel';
  if (h > 34 && h < 58 && s > 0.45 && v > 0.55) return 'gold';
  if (h > 8 && h < 38 && s > 0.18 && s < 0.6 && v > 0.62) return 'skin';
  return 'cloth';
}

const SURF = { steel: [0.42, 0.72], gold: [0.36, 0.85], skin: [0.62, 0], cloth: [0.86, 0] }; // [roughness, metalness]

function makeTexture(canvas, like) {
  const t = new THREE.CanvasTexture(canvas);
  t.flipY = false;
  t.colorSpace = like ? like.colorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

/**
 * Builds graded color + ORM textures from a KayKit atlas.
 * opts.grade: { sat, val, contrast } global grade toward a desaturated D4 palette.
 * opts.recolor(r,g,b,cellRow,cellCol,surface) -> [r,g,b] | null  per-texel override (0..1 floats).
 * opts.surface(cellRow,cellCol,surface) -> surface   optional surface override per cell.
 */
export function processAtlas(srcTex, opts = {}) {
  const canvas = imageToCanvas(srcTex.image);
  const W = canvas.width, H = canvas.height;
  const g = canvas.getContext('2d', { willReadFrequently: true });
  const img = g.getImageData(0, 0, W, H);
  const d = img.data;
  const orm = new ImageData(W, H);
  const o = orm.data;
  const { sat = 0.8, val = 0.9, contrast = 1.08, metal: metalBoost = 1.15, metalSat, maxAlbedo = 1, cloth: clothVal = 1 } = opts.grade || {};
  for (let y = 0; y < H; y++) {
    const row = Math.floor((y / H) / CELL_H);
    for (let x = 0; x < W; x++) {
      const col = Math.floor((x / W) / CELL_W);
      const i = (y * W + x) * 4;
      let r = d[i] / 255, gg = d[i + 1] / 255, b = d[i + 2] / 255;
      let surf = surfaceOf(r, gg, b);
      if (opts.surface) surf = opts.surface(row, col, surf, r, gg, b) || surf;
      if (opts.recolor) {
        const rc = opts.recolor(r, gg, b, row, col, surf, (y / H) / CELL_H - row, (x / W) / CELL_W - col);
        if (rc) { [r, gg, b] = rc; }
      }
      // grade: desaturate toward luma, darken, add contrast around mid grey
      const l = 0.2126 * r + 0.7152 * gg + 0.0722 * b;
      const metalSurf = surf === 'steel' || surf === 'gold';
      const sk = metalSurf ? (metalSat ?? Math.min(1, sat + 0.1)) : sat;
      r = l + (r - l) * sk; gg = l + (gg - l) * sk; b = l + (b - l) * sk;
      r = (r - 0.5) * contrast + 0.5; gg = (gg - 0.5) * contrast + 0.5; b = (b - 0.5) * contrast + 0.5;
      const vv = metalSurf ? Math.min(1.05, val * metalBoost) : surf === 'cloth' ? val * clothVal : val; // metals keep their albedo (they read via reflections)
      // clamp albedo (e.g. bone) so it can never clip to chalk-white under strong fill light
      r = Math.min(r * vv, maxAlbedo) / vv; gg = Math.min(gg * vv, maxAlbedo) / vv; b = Math.min(b * vv, maxAlbedo) / vv;
      d[i] = Math.max(0, Math.min(255, r * vv * 255));
      d[i + 1] = Math.max(0, Math.min(255, gg * vv * 255));
      d[i + 2] = Math.max(0, Math.min(255, b * vv * 255));
      const [rough, metal] = (opts.surfaces && opts.surfaces[surf]) || SURF[surf];
      o[i] = 255; o[i + 1] = rough * 255; o[i + 2] = metal * 255; o[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const ormCanvas = document.createElement('canvas');
  ormCanvas.width = W; ormCanvas.height = H;
  ormCanvas.getContext('2d').putImageData(orm, 0, 0);
  let emissive = null;
  if (opts.glowCells) {
    const ec = document.createElement("canvas"); ec.width = W; ec.height = H;
    const eg = ec.getContext("2d"); eg.fillStyle = "#000"; eg.fillRect(0, 0, W, H);
    for (const key of opts.glowCells) {
      const [row, col] = key.split(",").map(Number);
      const sx = col * CELL_W * W, sy = row * CELL_H * H, sw = CELL_W * W, sh = CELL_H * H;
      if (opts.glowColor) { eg.fillStyle = opts.glowColor; eg.fillRect(sx, sy, sw, sh); }
      else eg.drawImage(canvas, sx, sy, sw, sh, sx, sy, sw, sh);
    }
    emissive = makeTexture(ec, srcTex);
  }
  return { map: makeTexture(canvas, srcTex), orm: makeTexture(ormCanvas, null), emissive };
}


// ---------- shader patch ----------
// Adds to MeshStandardMaterial: cool fresnel rim, weak camera fill (characters are backlit by the sun),
// grime/AO gradient toward the feet + procedural roughness breakup (skinned bodies), edge darkening,
// and a capped hit-flash emissive. All per-actor values live in shared uniforms.
export const FLASH_MAX = 0.24;

/** Creates per-actor uniforms shared by all of that actor's materials. */
export function makeActorUniforms(rimColor = 0x9fb8e0, rimStrength = 0.9) {
  return {
    uRimColor: { value: new THREE.Color(rimColor).multiplyScalar(rimStrength) },
    uRimPow: { value: 3.0 },
    uFill: { value: 0.16 },
    uFlash: { value: new THREE.Color(0, 0, 0) },
  };
}

const NOISE_GLSL = `
uniform vec3 uRimColor;
uniform float uRimPow;
uniform float uFill;
uniform vec3 uFlash;
varying vec3 vKkObj;
float kkHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float kkNoise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(kkHash(i), kkHash(i + vec3(1, 0, 0)), f.x), mix(kkHash(i + vec3(0, 1, 0)), kkHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(kkHash(i + vec3(0, 0, 1)), kkHash(i + vec3(1, 0, 1)), f.x), mix(kkHash(i + vec3(0, 1, 1)), kkHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}`;

export function patchMaterial(mat, uniforms, { grime = true, axe = false } = {}) {
  mat.defines = { ...(mat.defines || {}) };
  if (grime) mat.defines.KK_GRIME = ''; else delete mat.defines.KK_GRIME;
  if (axe) mat.defines.KK_AXE = ''; else delete mat.defines.KK_AXE;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vKkObj;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvKkObj = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + NOISE_GLSL)
      .replace('#include <color_fragment>', `#include <color_fragment>
      #ifdef KK_GRIME
        float kkH = clamp(vKkObj.y / 2.1, 0.0, 1.0);   // 0 at the feet, 1 at the top of the head (bind pose)
      #else
        float kkH = 0.65;
      #endif
      float kkN = kkNoise(vKkObj * 7.0) * 0.65 + kkNoise(vKkObj * 23.0) * 0.35;
      {
        float low = 1.0 - smoothstep(0.0, 0.62, kkH);
        float grime = mix(1.0, 0.5, low) * (0.86 + 0.28 * kkN);       // ~50% darker at the boots, blotchy
        vec3 dirt = vec3(dot(diffuseColor.rgb, vec3(0.3, 0.55, 0.15))) * vec3(1.0, 0.84, 0.66);
        diffuseColor.rgb = mix(diffuseColor.rgb, dirt, low * 0.55) * grime;
      }
      #ifdef KK_AXE
      {
        // boss axe blade, per pixel in blade space: dark pitted iron, a bright worn cutting-edge band, dried blood
        float ax = vKkObj.x;
        float edgeBand = smoothstep(0.6, 0.67, ax + 0.025 * kkNoise(vKkObj * 30.0)); // thin worn cutting edge only
        vec3 iron = vec3(0.075, 0.07, 0.068) * (0.75 + 0.5 * kkN);
        vec3 col = mix(iron, vec3(0.34, 0.33, 0.31), edgeBand);
        float bl = smoothstep(0.55, 0.75, kkNoise(vKkObj * vec3(6.0, 14.0, 6.0))) * smoothstep(0.3, 0.55, ax);
        col = mix(col, vec3(0.13, 0.012, 0.008), bl * 0.9);
        diffuseColor.rgb = col;
      }
      #endif`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor = clamp(roughnessFactor + (kkN - 0.5) * 0.3 + (1.0 - kkH) * 0.1, 0.08, 1.0);`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
      // metal: worn and dirty, never uniformly glossy. Blotchy roughness (0.3..0.8) + fine scratch lines that
      // catch the light (scratches stretch along the object's long axis via anisotropic noise).
      float kkMetal = clamp(metalnessFactor, 0.0, 1.0);
      float kkScr = smoothstep(0.72, 0.9, kkNoise(vec3(vKkObj.x * 70.0, vKkObj.y * 5.0, vKkObj.z * 70.0)))
                  * smoothstep(0.35, 0.6, kkNoise(vKkObj * 3.0));
      float kkBlot = kkNoise(vKkObj * 4.0 + 7.0);
      roughnessFactor = mix(roughnessFactor, mix(0.32 + 0.48 * kkBlot, 0.2, kkScr), kkMetal);
      #ifdef KK_AXE
        metalnessFactor *= 1.0 - 0.8 * smoothstep(0.55, 0.75, kkNoise(vKkObj * vec3(6.0, 14.0, 6.0))) * smoothstep(0.3, 0.55, vKkObj.x); // blood isn't metal
      #endif`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      {
        vec3 vdir = normalize(vViewPosition);
        float ndv = clamp(dot(normal, vdir), 0.0, 1.0);
        // Rim widens and strengthens with camera distance so it still reads when the unit is ~60 px tall.
        float kkD = smoothstep(12.0, 55.0, length(vViewPosition));
        float fres = pow(1.0 - ndv, mix(uRimPow, 2.5, kkD)) * mix(1.0, 0.7, kkD);
        diffuseColor.rgb *= 1.0 - 0.3 * pow(1.0 - ndv, 1.6);          // edge darkening: kills the plastic look
        // cavity: screen-space curvature (normal change per pixel / pixel footprint) darkens creases and recesses
        float kkCurv = length(fwidth(normal)) / max(length(vViewPosition) * 0.00053, 1e-4);
        float kkEdge = smoothstep(3.0, 10.0, kkCurv);
        diffuseColor.rgb *= 1.0 - 0.32 * kkEdge * (1.0 - kkMetal);
        // metal edge wear: creases/edges go brighter bare steel, scratches lift albedo a touch
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.7 + 0.025, kkMetal * (kkEdge * 0.7 + kkScr * 0.35));
        float up = 1.0;
        totalEmissiveRadiance += mix(uRimColor, uRimColor * min(diffuseColor.rgb * 2.6, vec3(1.0)), 0.55) * fres * up; // albedo-tinted so it doesn't wash colours out
        totalEmissiveRadiance += diffuseColor.rgb * uFill * (0.35 + 0.65 * max(normal.z, 0.0));
        totalEmissiveRadiance += uFlash * (0.2 + 1.6 * diffuseColor.rgb); // capped CPU-side (FLASH_MAX); scales with albedo so dark units never go chalk-white
      }`);
  };
  mat.customProgramCacheKey = () => 'kk-actor-v7' + (grime ? 'g' : '') + (axe ? 'a' : '');
  mat.needsUpdate = true;
  return mat;
}

// ---------- silhouette outline (inverted hull, constant screen width) ----------
// Back faces pushed out along the projected normal by uOutlinePx pixels; works for skinned and rigid meshes.
const outlineMats = new Map();
export function outlineMaterial(color = 0x050403, px = 1.6) {
  const k = color + ':' + px;
  if (outlineMats.has(k)) return outlineMats.get(k);
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide, fog: true });
  const u = { uOutlinePx: { value: px } };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uOutlinePx = u.uOutlinePx;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uOutlinePx;')
      .replace('#include <project_vertex>', `#include <project_vertex>
      {
        #ifdef USE_SKINNING
          vec3 kkN = objectNormal;
        #else
          vec3 kkN = normal;
        #endif
        vec3 nv = normalize(normalMatrix * kkN);
        vec2 dir = normalize(nv.xy + vec2(1e-5));
        dir.x *= projectionMatrix[0][0] / projectionMatrix[1][1];
        gl_Position.xy += dir * uOutlinePx * 2.0 / 900.0 * gl_Position.w;
        gl_Position.z += 0.0004 * gl_Position.w; // stay behind the body it outlines
      }`);
  };
  m.customProgramCacheKey = () => 'kk-outline-v1';
  outlineMats.set(k, m);
  return m;
}

// ---------- ground decals: blob shadow + team ring ----------
let blobTex = null, ringTex = null;
function radialTexture(draw) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'); draw(g);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export function blobTexture() {
  return blobTex || (blobTex = radialTexture((g) => {
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(0,0,0,0.88)'); gr.addColorStop(0.5, 'rgba(0,0,0,0.62)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  }));
}
export function ringTexture() {
  return ringTex || (ringTex = radialTexture((g) => {
    const gr = g.createRadialGradient(64, 64, 40, 64, 64, 62);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.7, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  }));
}

let glowTex = null;
/** Soft radial glow (white, alpha falloff) for additive under-glows / boss auras. */
export function glowTexture() {
  return glowTex || (glowTex = radialTexture((g) => {
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  }));
}
