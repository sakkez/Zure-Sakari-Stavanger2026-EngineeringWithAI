// Post-processing shaders + global shader-chunk upgrades for the Diablo IV-ish look.
//
//  * HdrClampShader    - before bloom: hue-preserving cap of HDR values (stops spells blowing out to
//                        400px white discs; bloom input never exceeds `cap`).
//  * HdrShoulderShader - after bloom, before tone mapping: hue-preserving highlight shoulder so hot
//                        fire stays saturated orange instead of ACES' per-channel white.
//  * GradeShader       - after OutputPass (display space): cool desaturated teal environment, warmth
//                        only in bright (lit) regions, olive/yellow suppression, far-field haze toward
//                        the top of frame, vignette, film grain.
//  * installAtmosphere - patches THREE.ShaderChunk once (before any material compiles):
//                        distance fog + low height fog + radial "rim" fog outside the arena, sun-lit
//                        mist patches (light-shaft feel) and drifting cloud shadows that modulate
//                        the shadow-casting directional light (the sun) on every lit material.
//                        Driven by the shared ATMO object (engine updates ATMO.time each frame).
import * as THREE from 'three';

const FS_VERT = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

export const HdrClampShader = {
  name: 'HdrClampShader',
  uniforms: { tDiffuse: { value: null }, knee: { value: 2.5 }, cap: { value: 5.5 }, chroma: { value: 0.6 } },
  vertexShader: FS_VERT,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float knee, cap, chroma; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      // Sanitize: a single NaN/Inf pixel from any material would be smeared over the whole frame
      // by the bloom mip chain (all-black frames). Kill NaN, clamp Inf and negatives.
      if (any(isnan(c.rgb))) c.rgb = vec3(0.0);
      c.rgb = clamp(c.rgb, vec3(0.0), vec3(60000.0));
      // Hue-preserving soft roll-off above knee, asymptotic to cap: stacked additive FX
      // saturate toward their colour instead of climbing to white. The more a pixel is compressed,
      // the more its chroma is pushed back out (so a pile of orange flames stays orange).
      float m = max(c.r, max(c.g, c.b));
      if (m > knee) {
        float x = m - knee, r = cap - knee;
        float nm = knee + x / (1.0 + x / r);
        float k = nm / m;
        c.rgb *= k;
        float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
        c.rgb = max(vec3(0.0), vec3(l) + (c.rgb - vec3(l)) * (1.0 + chroma * (1.0 - k)));
      }
      gl_FragColor = c;
    }
  `,
};

export const HdrShoulderShader = {
  name: 'HdrShoulderShader',
  uniforms: { tDiffuse: { value: null }, knee: { value: 1.0 }, limit: { value: 2.6 } },
  vertexShader: FS_VERT,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float knee, limit; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float m = max(c.r, max(c.g, c.b));
      if (m > knee) {
        float x = m - knee, r = limit - knee;
        float nm = knee + x / (1.0 + x / r);
        c.rgb *= nm / m;
      }
      gl_FragColor = c;
    }
  `,
};

export const GradeShader = {
  name: 'GradeShader',
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    resolution: { value: new THREE.Vector2(1, 1) },
    lift: { value: new THREE.Vector3(0.024, 0.032, 0.042) },  // added to shadows (teal)
    gamma: { value: new THREE.Vector3(0.94, 0.95, 0.97) },
    gain: { value: new THREE.Vector3(1.04, 1.0, 0.95) },
    saturation: { value: 0.74 },     // saturation of dull (environment) colors
    satProtect: { value: 1.12 },     // saturation of already-vivid colors (magic, fire)
    yellowCut: { value: 0.58 },      // extra desaturation of olive / yellow / ochre hues
    contrast: { value: 1.15 },
    haze: { value: 0.0 },            // screen-space haze (off: haze is depth-based scene fog now)
    hazeColor: { value: new THREE.Vector3(0x2a / 255, 0x30 / 255, 0x36 / 255) }, // display-space #2a3036
    vignette: { value: 0.45 },
    vignetteSoft: { value: 0.8 },
    grain: { value: 0.03 },
  },
  vertexShader: FS_VERT,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform vec2 resolution;
    uniform vec3 lift, gamma, gain, hazeColor;
    uniform float saturation, satProtect, yellowCut, contrast, haze, vignette, vignetteSoft, grain;
    varying vec2 vUv;

    float hash(vec2 p) { p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
    vec3 rgb2hsv(vec3 c) {
      vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
      vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
      vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
      float d = q.x - min(q.w, q.y);
      return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-10)), d / (q.x + 1e-10), q.x);
    }

    void main() {
      vec4 src = texture2D(tDiffuse, vUv);
      vec3 c = clamp(src.rgb, 0.0, 1.0);
      vec3 hsv = rgb2hsv(c);

      // Vivid + bright = magic / fire: protected. Dull = environment: desaturated, olive hues hardest.
      float vivid = smoothstep(0.5, 0.85, hsv.y) * smoothstep(0.35, 0.7, hsv.z);
      float yellow = smoothstep(0.05, 0.11, hsv.x) * (1.0 - smoothstep(0.36, 0.45, hsv.x)); // ochre..olive..grass green
      // Desaturate by value structure: only the environment MIDTONES/shadows lose chroma; lit pools
      // (highlights) keep their warmth, vivid magic/faction colours are boosted.
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      float envSat = mix(saturation * (1.0 - yellowCut * yellow), 1.0, smoothstep(0.42, 0.8, l));
      float sAmt = mix(envSat, satProtect, vivid);
      c = mix(vec3(l), c, sAmt);

      // Lift / gamma / gain.
      c = c * gain + lift * (1.0 - c);
      c = pow(max(c, 0.0), 1.0 / gamma);

      // Split tone: cold teal base (#1a2228-ish shadows), warmth only where light actually lands.
      l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      vec3 shadowTint = vec3(0.72, 0.95, 1.2);
      vec3 midTint = vec3(0.9, 0.99, 1.07);
      vec3 highTint = vec3(1.12, 1.0, 0.82);
      vec3 tint = mix(shadowTint, midTint, smoothstep(0.03, 0.16, l));
      tint = mix(tint, highTint, smoothstep(0.16, 0.45, l));
      c *= mix(tint, vec3(1.0), vivid * 0.7);

      // Contrast around a low pivot (keeps the blacks deep).
      c = (c - 0.18) * contrast + 0.18;

      // Far-field atmospheric haze and desaturation toward the top of the frame.
      float far = smoothstep(0.5, 0.85, vUv.y) * step(0.001, haze);
      float lf = dot(max(c, 0.0), vec3(0.2126, 0.7152, 0.0722));
      c = mix(c, vec3(lf), far * 0.3 * (1.0 - vivid));
      c = mix(c, hazeColor, far * haze * (1.0 - vivid * 0.6));

      // Vignette (aspect-corrected oval): darker frame edges, neutral color (UI owns red low-HP tint).
      vec2 d = (vUv - 0.5) * vec2(resolution.x / resolution.y, 1.0) * 0.95;
      float v = smoothstep(0.32, 0.32 + vignetteSoft, length(d));
      c *= 1.0 - vignette * v;

      // Film grain, weighted to midtones.
      float n = hash(vUv * resolution + fract(time * 7.13) * 917.0) - 0.5;
      c += n * grain * (1.0 - abs(l - 0.4) * 1.5);

      gl_FragColor = vec4(clamp(c, 0.0, 1.0), src.a);
    }
  `,
};

// Shared atmosphere parameters. Referenced BY OBJECT from every material's uniforms (struct uniform
// values are not cloned by three), so mutating these fields updates all materials at once.
export const ATMO = {
  time: 0,
  cloud: 0.32,                // cloud-shadow strength on the sun (0 = off)
  cloudScale: 0.018,           // 1/size of cloud features (world units)
  wind: new THREE.Vector2(0.035, 0.018), // cloud drift in noise-space per second
  heightBase: -0.2,            // height fog: base world Y
  heightFalloff: 0.65,         // height fog: exponential falloff per unit up
  heightDensity: 0.34,         // height fog: amount at the base
  mistGlow: new THREE.Color(0.55, 0.36, 0.2), // sun-lit mist (light-shaft feel), added where clouds part
  focus: new THREE.Vector2(),  // player XZ: clouds thin out around the hero (readability cheat)
  focusClear: 9,               // radius of the clear pocket
  rimRadius: 0,                // radial fog outside the arena (engine sets from world.radius)
  rimWidth: 10,
  rimFog: 0,
};

const ATMO_DECL = /* glsl */`
#ifndef GAUNTLET_ATMO
#define GAUNTLET_ATMO
struct GauntletAtmo {
  float time; float cloud; float cloudScale; vec2 wind; vec2 focus; float focusClear;
  float heightBase; float heightFalloff; float heightDensity; vec3 mistGlow;
  float rimRadius; float rimWidth; float rimFog;
};
uniform GauntletAtmo gAtmo;
float gHash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float gNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(gHash12(i), gHash12(i + vec2(1, 0)), f.x), mix(gHash12(i + vec2(0, 1)), gHash12(i + vec2(1, 1)), f.x), f.y);
}
// 0 = clear sky, 1 = full cloud cover at this world position.
float gCloudCover(vec3 wp) {
  if (gAtmo.cloud <= 0.0) return 0.0;
  vec2 p = wp.xz * gAtmo.cloudScale + gAtmo.wind * gAtmo.time;
  float n = 0.55 * gNoise(p) + 0.3 * gNoise(p * 2.07 + 13.1 - gAtmo.wind * gAtmo.time * 0.6) + 0.15 * gNoise(p * 4.3 + 7.7);
  float clear = smoothstep(gAtmo.focusClear * 0.4, gAtmo.focusClear, length(wp.xz - gAtmo.focus));
  return smoothstep(0.2, 0.85, n) * clear;
}
float gCloudShadow(vec3 wp) { return 1.0 - gAtmo.cloud * gCloudCover(wp); }
#endif
`;

export function installAtmosphere() {
  const C = THREE.ShaderChunk;
  if (C.fog_pars_fragment.includes('GAUNTLET_ATMO')) return;

  // Attach the shared struct uniform to every built-in shader that has fog or lights.
  for (const key of Object.keys(THREE.ShaderLib)) {
    const u = THREE.ShaderLib[key].uniforms;
    if (u && (u.fogColor || u.directionalLights)) u.gAtmo = { value: ATMO };
  }

  C.fog_pars_vertex = /* glsl */`
#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vFogWorld;
#endif
`;
  // World position from the view-space position (viewMatrix is rigid, so invert cheaply).
  C.fog_vertex = /* glsl */`
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vFogWorld = transpose( mat3( viewMatrix ) ) * ( mvPosition.xyz - viewMatrix[ 3 ].xyz );
#endif
`;
  C.fog_pars_fragment = /* glsl */`
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying vec3 vFogWorld;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
  ${ATMO_DECL}
#endif
`;
  C.fog_fragment = /* glsl */`
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
  #endif
  float hFog = clamp( exp( - ( vFogWorld.y - gAtmo.heightBase ) * gAtmo.heightFalloff ), 0.0, 1.6 ) * gAtmo.heightDensity;
  float rFog = 0.0;
  if ( gAtmo.rimFog > 0.0 ) rFog = gAtmo.rimFog * smoothstep( gAtmo.rimRadius - gAtmo.rimWidth, gAtmo.rimRadius + gAtmo.rimWidth, length( vFogWorld.xz ) );
  // Low mist + arena-rim fog use a darker tint of the fog colour (gloom), lit by the sun where the
  // clouds part (shafts-of-light feel); the distance haze uses the lighter fog colour itself.
  float lowF = clamp( 1.0 - ( 1.0 - hFog ) * ( 1.0 - rFog ), 0.0, 1.0 );
  vec3 mistCol = fogColor * 0.45 + gAtmo.mistGlow * ( 1.0 - gCloudCover( vFogWorld ) ) * hFog * step( 0.001, gAtmo.cloud );
  gl_FragColor.rgb = mix( gl_FragColor.rgb, mistCol, lowF );
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif
`;

  // Cloud shadows on the shadow-casting directional light (the sun).
  C.lights_pars_begin = C.lights_pars_begin + ATMO_DECL;
  const shadowLine = 'directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;';
  if (C.lights_fragment_begin.includes(shadowLine)) {
    C.lights_fragment_begin = C.lights_fragment_begin.replace(shadowLine,
      shadowLine + '\n\t\tdirectLight.color *= gCloudShadow( transpose( mat3( viewMatrix ) ) * ( geometryPosition - viewMatrix[ 3 ].xyz ) );');
  } else {
    console.warn('[engine] cloud shadows: lights_fragment_begin layout changed; skipped');
  }
}
