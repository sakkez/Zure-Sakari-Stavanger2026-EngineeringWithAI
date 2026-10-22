// Low-lying drifting mist wisps: soft horizontal sheets with animated noise, soft-faded where they
// intersect the terrain (via a baked height texture) so no hard clipping lines appear.
import * as THREE from 'three';
import { heightAt, WATER, LAKE, PUDDLES, forestAt, nearSpawn } from './layout.js';
import { getNoiseTex } from './materials.js';
import { mulberry } from './noise.js';

function heightTexture(size = 200, res = 256) {
  const data = new Uint16Array(res * res);
  for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) {
    const x = -size / 2 + (i / (res - 1)) * size, z = -size / 2 + (j / (res - 1)) * size;
    data[j * res + i] = THREE.DataUtils.toHalfFloat(heightAt(x, z));
  }
  const t = new THREE.DataTexture(data, res, res, THREE.RedFormat, THREE.HalfFloatType);
  t.magFilter = t.minFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
}

export function buildMist(uTime) {
  const R = mulberry(909);
  const spots = [];
  // Over the lake and puddles, in forest hollows, along the rim.
  for (let i = 0; i < 5; i++) spots.push({ x: LAKE.x + (R() - 0.5) * 16, z: LAKE.z + (R() - 0.5) * 22, s: 14 + R() * 8, o: 0.28 });
  for (const p of PUDDLES) spots.push({ x: p.x, z: p.z, s: 9 + R() * 4, o: 0.4 });
  for (let i = 0; i < 400 && spots.length < 34; i++) {
    const a = R() * Math.PI * 2, r = 18 + R() * 60;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (forestAt(x, z) < 0.35 || nearSpawn(x, z, 3)) continue;
    spots.push({ x, z, s: 12 + R() * 10, o: 0.35 + R() * 0.2 });
  }
  const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      tNoise: { value: getNoiseTex() }, tHeight: { value: heightTexture() },
      uColor: { value: new THREE.Color(0.55, 0.58, 0.64) }, uTime: { value: 0 },
    }]),
    vertexShader: /* glsl */`
      attribute float aOpacity;
      varying vec2 vUv; varying vec3 vW; varying float vOp;
      #include <fog_pars_vertex>
      void main() {
        vUv = uv; vOp = aOpacity;
        vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vW = w.xyz;
        vec4 mvPosition = viewMatrix * w;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D tNoise, tHeight; uniform vec3 uColor; uniform float uTime;
      varying vec2 vUv; varying vec3 vW; varying float vOp;
      #include <fog_pars_fragment>
      void main() {
        vec2 p = vW.xz;
        float n1 = texture2D(tNoise, p * 0.021 + vec2(uTime * 0.006, uTime * 0.0025)).r;
        float n2 = texture2D(tNoise, p * 0.057 - vec2(uTime * 0.009, -uTime * 0.004)).g;
        float n = n1 * 0.65 + n2 * 0.55;
        float edge = 1.0 - smoothstep(0.25, 0.5, length(vUv - 0.5));
        float th = texture2D(tHeight, (p + 100.0) / 200.0).r;
        float soft = smoothstep(0.0, 1.1, vW.y - th);
        float a = smoothstep(0.42, 0.95, n) * edge * soft * vOp * 0.32;
        if (a < 0.003) discard;
        gl_FragColor = vec4(uColor, a);
        #include <fog_fragment>
      }`,
  });
  mat.uniforms.uTime = uTime;
  const im = new THREE.InstancedMesh(geo, mat, spots.length * 2);
  const op = new Float32Array(spots.length * 2);
  const m = new THREE.Matrix4();
  let k = 0;
  for (const s of spots) {
    for (let layer = 0; layer < 2; layer++) {
      let h = -1e9;
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; h = Math.max(h, heightAt(s.x + Math.cos(a) * s.s * 0.25, s.z + Math.sin(a) * s.s * 0.25)); }
      h = Math.max(h, WATER) + 0.45 + layer * 0.7;
      m.makeRotationY(R() * 6.28).scale(new THREE.Vector3(s.s * (1 + layer * 0.3), 1, s.s * (0.7 + R() * 0.5)));
      m.setPosition(s.x, h, s.z);
      im.setMatrixAt(k, m); op[k] = s.o * (layer ? 0.7 : 1); k++;
    }
  }
  geo.setAttribute('aOpacity', new THREE.InstancedBufferAttribute(op, 1));
  im.renderOrder = 2;
  im.frustumCulled = false;
  im.name = 'mist';
  return { mesh: im, uniforms: mat.uniforms };
}
