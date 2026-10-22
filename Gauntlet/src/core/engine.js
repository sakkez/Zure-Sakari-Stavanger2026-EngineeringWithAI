// Renderer, scene, camera rig, lighting and post-processing.
//
// Public contract: createEngine(canvas, ctx) -> {
//   THREE, renderer, scene, camera, composer, sun, hemi, rim, heroLight, bloom, gtao, grade, quality,
//   follow(obj), shake(amp, t), update(dt, t), render(), resize()
// }
//
// Look: late dusk. Low warm key light (sun) from behind-left, cool hemisphere + IBL fill,
// cool rim light from the front-right, distance + low-lying height fog, D4-style teal/amber grade.
//
// Notes for other workstreams:
//  * BLOOM: runs on linear HDR before tone mapping with threshold ~1. Ordinary lit surfaces never
//    bloom. To make magic glow, give it emissive / MeshBasicMaterial colors with components > 1
//    (e.g. color.setRGB(4, 1.5, 0.4) or emissiveIntensity 3-6). Additive blended particles add up too.
//  * DYNAMIC POINT LIGHTS: three.js recompiles every lit material when the NUMBER of lights in the
//    scene changes (visible toggles count too). Keep a FIXED pool (<= engine.maxDynamicLights, 8)
//    of PointLights created once at startup, always visible, and "turn off" by intensity = 0.
//    Do not castShadow on point lights. Use decay 2 and a distance (6-12) so they stay local.
//  * LIGHT BUDGET: point/spot lights (other than the hero fill) are clamped every frame to
//    engine.lightBudget (intensity <= 60, distance <= 8 m; opt out with light.userData.noBudget) so spell lights tint the ground locally.
//  * QUALITY: engine.quality is 'high' or 'low' (?q=low): low drops GTAO, uses FXAA, 2k shadows, DPR 1.
//  * FOG/ATMOSPHERE: materials with fog:true get distance + height + arena-rim fog and sun-lit mist;
//    every lit material gets drifting cloud shadows on the sun (post.js installAtmosphere, engine.atmo).
//    Additive FX usually want fog:false.
//  * GTAO: transparent, alpha-tested, depthWrite:false, Points/Lines/Sprites are skipped in the AO
//    prepass automatically (no need for per-mesh workarounds).
//  * HDR: values are hue-preservingly capped at 7 before bloom and shouldered to ~2.6 before tone
//    mapping, so FX should keep emissive in the 2-4 range; brighter just costs more bloom, not more white.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { FXAAPass } from 'three/addons/postprocessing/FXAAPass.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { GradeShader, HdrClampShader, HdrShoulderShader, installAtmosphere, ATMO } from './post.js';

const ENV_URL = 'assets/env/kloppenheim_02_1k.hdr';

export function createEngine(canvas, ctx = {}) {
  const params = ctx.params || new URLSearchParams(location.search);
  const quality = params.get('q') === 'low' ? 'low' : 'high';
  const high = quality === 'high';
  const shotMode = params.has('shot');
  let renderQueued = false;

  installAtmosphere();

  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true, stencil: false,
  });
  renderer.setPixelRatio(high ? Math.min(devicePixelRatio, 1.5) : 1);
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.63;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // ---- Scene / atmosphere ------------------------------------------------------------------
  const scene = new THREE.Scene();
  const FOG_COLOR = new THREE.Color(0x141b21);
  scene.background = FOG_COLOR.clone();
  // Depth haze: the fog is LIGHTER than the ground (cool blue-grey), so the far part of the view
  // lifts toward #2a3036 after grading instead of sinking to black.
  scene.fog = new THREE.Fog(new THREE.Color(0x3a4756), 48, 125);
  scene.environmentIntensity = 0.55;
  scene.environmentRotation.set(0, Math.PI * 0.75, 0);

  // Sky dome: gradient that melts into the fog color so a shaken / tilted camera never shows void.
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(400, 24, 12),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { horizon: { value: FOG_COLOR }, zenith: { value: new THREE.Color(0x0b1018) }, glow: { value: new THREE.Color(0x5a3a22) } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 horizon, zenith, glow; varying vec3 vDir;
        void main(){ float h = clamp(vDir.y, -1.0, 1.0);
          vec3 c = mix(horizon, zenith, smoothstep(0.0, 0.6, h));
          float s = pow(max(dot(normalize(vDir), normalize(vec3(-0.6, 0.15, -0.8))), 0.0), 6.0);
          c += glow * s * smoothstep(-0.2, 0.3, h);
          gl_FragColor = vec4(c, 1.0); }`,
    }),
  );
  dome.renderOrder = -1000;
  dome.frustumCulled = false;
  scene.add(dome);

  // ---- Camera ------------------------------------------------------------------------------
  // D4-ish pitch (~52 deg), long lens, pulled back further than D4 so heroes read ~60px tall.
  const PITCH = THREE.MathUtils.degToRad(52);
  const DIST = 58;
  const camera = new THREE.PerspectiveCamera(27, innerWidth / innerHeight, 20, 600);
  const camOffset = new THREE.Vector3(0, Math.sin(PITCH) * DIST, Math.cos(PITCH) * DIST);
  const camTarget = new THREE.Vector3();   // smoothed follow point
  const lookAhead = new THREE.Vector3();   // smoothed mouse look-ahead
  const focus = new THREE.Vector3();       // camTarget + lookAhead

  // ---- Lights ------------------------------------------------------------------------------
  // Cool fill: sky blue-grey from above, dark warm earth bounce from below.
  const hemi = new THREE.HemisphereLight(0x6a88bc, 0x2c2621, 0.85);
  scene.add(hemi);

  // Warm low key light (late dusk sun, ~27 deg elevation), from the left/behind so long hard shadows
  // rake across the ground toward the viewer-right.
  const SUN_DIR = new THREE.Vector3(-0.62, 0.0, -0.78).normalize(); // behind-left: back-lit glints on wet ground
  SUN_DIR.y = Math.tan(THREE.MathUtils.degToRad(28));
  SUN_DIR.normalize(); // points toward the sun
  const sun = new THREE.DirectionalLight(0xffd2a8, 6.0);
  sun.castShadow = true;
  const SHADOW_HALF = 46;
  const SHADOW_SIZE = high ? 4096 : 2048;
  sun.shadow.mapSize.set(SHADOW_SIZE, SHADOW_SIZE);
  const sc = sun.shadow.camera;
  sc.left = -SHADOW_HALF; sc.right = SHADOW_HALF; sc.top = SHADOW_HALF; sc.bottom = -SHADOW_HALF;
  sc.near = 1; sc.far = 220;
  sc.updateProjectionMatrix();
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.04;
  // Keep a little sky/sun light in shadow so off-screen canopy shadows read as shade, not holes.
  sun.shadow.intensity = 0.9;
  scene.add(sun, sun.target);

  // Cool rim / moon light from the camera side-right: separates characters from the ground.
  const rim = new THREE.DirectionalLight(0x8aaeff, 1.6);
  const RIM_DIR = new THREE.Vector3(0.75, 0.35, 0.2).normalize();
  scene.add(rim, rim.target);

  // Hero light: a soft warm pool that follows the player (D4 keeps the hero in a pocket of light
  // while the periphery falls into gloom). Always present, so it never changes the light count.
  const heroLight = new THREE.PointLight(0xffb27a, 9, 6, 1.0);
  heroLight.castShadow = false;
  scene.add(heroLight);
  // Cool back/rim light for the hero only (short range, behind and above the player as seen from
  // the camera), so the hero separates by a cool edge rather than by brightness.
  const heroRim = new THREE.PointLight(0x8fb0ff, 16, 4.2, 1.0);
  heroRim.castShadow = false;
  scene.add(heroRim);

  // Light-space basis for texel snapping of the shadow frustum (prevents shimmering).
  const lz = SUN_DIR.clone();
  const lx = new THREE.Vector3(0, 1, 0).cross(lz).normalize();
  const ly = lz.clone().cross(lx).normalize();
  const texel = (SHADOW_HALF * 2) / SHADOW_SIZE;
  const _snap = new THREE.Vector3();
  function placeSun(center) {
    let u = center.dot(lx), v = center.dot(ly);
    const w = center.dot(lz);
    u = Math.round(u / texel) * texel;
    v = Math.round(v / texel) * texel;
    _snap.copy(lx).multiplyScalar(u).addScaledVector(ly, v).addScaledVector(lz, w);
    sun.target.position.copy(_snap);
    sun.position.copy(_snap).addScaledVector(lz, 110);
    rim.target.position.copy(center);
    rim.position.copy(center).addScaledVector(RIM_DIR, 50);
    heroLight.position.set(camTarget.x + 0.5, camTarget.y + 2.6, camTarget.z + 1.4);
    heroRim.position.set(camTarget.x + 0.6, camTarget.y + 2.2, camTarget.z - 1.8);
  }

  // Environment map (CC0 Poly Haven HDRI) for PBR reflections / ambient.
  const pmrem = new THREE.PMREMGenerator(renderer);
  new HDRLoader().load(ENV_URL, (tex) => {
    tex.mapping = THREE.EquirectangularReflectionMapping;
    const rt = pmrem.fromEquirectangular(tex);
    scene.environment = rt.texture;
    tex.dispose();
    pmrem.dispose();
  }, undefined, (e) => console.warn('env map failed', e));

  // ---- Post ---------------------------------------------------------------------------------
  const w = innerWidth, h = innerHeight;
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  let gtao = null;
  if (high) {
    gtao = new GTAOPass(scene, camera, w, h);
    gtao.output = GTAOPass.OUTPUT.Default;
    gtao.blendIntensity = 0.95;
    gtao.updateGtaoMaterial({ radius: 1.5, distanceExponent: 1.5, thickness: 2.5, scale: 1.35, samples: 8, distanceFallOff: 1 });
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 2, samples: 8 });
    // Run AO (incl. its normal/depth prepass) at half resolution; it is upsampled in the blend.
    const gtaoSetSize = gtao.setSize.bind(gtao);
    gtao.setSize = (sw, sh) => gtaoSetSize(Math.max(1, sw >> 1), Math.max(1, sh >> 1));
    gtao.setSize(w, h);
    // The AO prepass renders the scene with an override MeshNormalMaterial, which ignores
    // transparency/alpha-test: zone walls, decals, particles and foliage cards would write opaque
    // depth and black out what is behind them. Hide all such objects during the prepass.
    const skipInAO = (m) => m && (m.transparent || m.alphaTest > 0 || m.depthWrite === false || m.alphaHash);
    gtao._overrideVisibility = function () {
      const cache = this._visibilityCache;
      this.scene.traverse((o) => {
        if (!o.visible) return;
        const m = o.material;
        if (o.isPoints || o.isLine || o.isLine2 || o.isSprite || o.userData.noAO ||
            (Array.isArray(m) ? m.some(skipInAO) : skipInAO(m))) {
          o.visible = false;
          cache.push(o);
        }
      });
    };
    composer.addPass(gtao);
  }

  // HDR cap (hue preserving) so the bloom input and spell cores never exceed ~7.
  const hdrClamp = new ShaderPass(HdrClampShader);
  composer.addPass(hdrClamp);
  // Only HDR (> ~1.1) values bloom: magic, fire, emissive. Lit ground stays clean.
  const bloom = new UnrealBloomPass(new THREE.Vector2(w / 2, h / 2), 0.38, 0.3, 1.1);
  composer.addPass(bloom);
  // Hue-preserving highlight shoulder so fire stays orange (not ACES white) after bloom.
  const hdrShoulder = new ShaderPass(HdrShoulderShader);
  composer.addPass(hdrShoulder);
  composer.addPass(new OutputPass());

  const aa = high ? new SMAAPass() : new FXAAPass();
  composer.addPass(aa);

  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);

  // ---- Follow / shake ----------------------------------------------------------------------
  let followTarget = null;
  const shake = { t: 0, amp: 0 };
  const _la = new THREE.Vector3();

  function resize() {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    composer.setSize(innerWidth, innerHeight);
    const pr = renderer.getPixelRatio();
    grade.uniforms.resolution.value.set(innerWidth * pr, innerHeight * pr);
  }
  addEventListener('resize', resize);
  resize();

  const engine = {
    THREE, renderer, scene, camera, composer, sun, hemi, rim, heroLight, heroRim, bloom, gtao, grade, dome, quality,
    hdrClamp, hdrShoulder, atmo: ATMO,
    maxDynamicLights: 8,
    // Camera-to-focus distance in world units (for distance-scaled rim / outline widths).
    cameraDistance: DIST,
    follow(obj) {
      followTarget = obj;
      if (obj) { camTarget.copy(obj.position); lookAhead.set(0, 0, 0); }
    },
    shake(amp = 0.3, t = 0.25) { shake.amp = Math.max(shake.amp, amp); shake.t = Math.max(shake.t, t); },
    update(dt, t = 0) {
      if (followTarget) {
        // Critically-damped-ish follow (frame-rate independent).
        camTarget.lerp(followTarget.position, 1 - Math.exp(-7 * dt));
        // Look-ahead toward the mouse: up to ~5 units across, ~4 forward/back.
        const m = ctx.input?.mouse;
        if (m) _la.set(m.x * 5.5, 0, -m.y * 4.0); else _la.set(0, 0, 0);
        lookAhead.lerp(_la, 1 - Math.exp(-2.5 * dt));
      }
      focus.copy(camTarget).add(lookAhead);
      camera.position.copy(focus).add(camOffset);
      if (shake.t > 0) {
        shake.t -= dt;
        const a = shake.amp * Math.max(0, shake.t) * 4;
        camera.position.x += (Math.random() - 0.5) * a;
        camera.position.y += (Math.random() - 0.5) * a;
        camera.position.z += (Math.random() - 0.5) * a * 0.5;
      }
      camera.lookAt(focus);
      // Shadow frustum centered slightly up-screen (the visible footprint extends further away).
      _snapCenter.copy(focus); _snapCenter.z -= 4;
      placeSun(_snapCenter);
      dome.position.copy(focus);
      grade.uniforms.time.value = t;
      ATMO.time = t;
      ATMO.focus.set(camTarget.x, camTarget.z);
      const wr = ctx.world?.radius;
      if (wr && ATMO.rimRadius !== wr) { ATMO.rimRadius = wr; ATMO.rimWidth = Math.max(6, wr * 0.12); ATMO.rimFog = 0.75; }
    },
    render() {
      enforceLightBudget();
      // In ?shot=1 mode the harness steps many frames synchronously; rendering each one through the
      // full post chain in SwiftShader is very slow. Coalesce: render once on the next animation frame.
      if (shotMode) {
        if (!renderQueued) { renderQueued = true; requestAnimationFrame(() => { renderQueued = false; composer.render(); }); }
        return;
      }
      composer.render();
    },
    resize,
  };
  const _snapCenter = new THREE.Vector3();

  // Brightness budget for dynamic point lights (FX/world): a spell light at intensity 150 / 18 m
  // paints a cream disc over the ground and chalks pale units. Clamp centrally, every frame,
  // just before rendering. The list is refreshed every ~2 s (lights should be pooled anyway).
  engine.lightBudget = { maxIntensity: 60, maxDistance: 8 };
  let budgetLights = [], budgetAge = 1e9;
  function enforceLightBudget() {
    if (++budgetAge > 120) {
      budgetAge = 0; budgetLights = [];
      scene.traverse((o) => { if ((o.isPointLight || o.isSpotLight) && o !== heroLight && o !== heroRim && !o.userData.noBudget) budgetLights.push(o); });
    }
    const b = engine.lightBudget;
    for (const l of budgetLights) {
      if (l.intensity > b.maxIntensity) l.intensity = b.maxIntensity;
      if (!(l.distance > 0) || l.distance > b.maxDistance) l.distance = b.maxDistance;
    }
  }
  return engine;
}
