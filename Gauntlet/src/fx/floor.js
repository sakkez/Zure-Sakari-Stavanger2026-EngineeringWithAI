// "Walkable floor" height lookup for decals and ground effects.
// The gameplay heightAt() is the terrain only; raised static geometry (shrine dais, steps, flagstone
// slabs) sits above it and would bury decals. We render the static scene once from above into a float
// height map (max world Y per texel) and use it where it is a little above the terrain.
import * as THREE from 'three';

export function createFloor(engine, heightAt, { extent = 64, res = 512, maxRise = 1.4 } = {}) {
  let map = null;
  const texel = (extent * 2) / res;

  function build(excludeRoots = []) {
    const { renderer, scene } = engine;
    const rt = new THREE.WebGLRenderTarget(res, res, { type: THREE.FloatType, format: THREE.RGBAFormat, depthBuffer: true });
    const cam = new THREE.OrthographicCamera(-extent, extent, extent, -extent, 0.1, 400);
    cam.position.set(0, 200, 0);
    cam.up.set(0, 0, -1); // texture +v = world -z
    cam.lookAt(0, 0, 0);
    cam.updateMatrixWorld();
    const mat = new THREE.ShaderMaterial({
      vertexShader: 'varying float vY; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vY = w.y; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: 'varying float vY; void main(){ gl_FragColor = vec4(vY, 0.0, 0.0, 1.0); }',
      side: THREE.DoubleSide,
    });
    const hidden = [];
    const skip = new Set();
    for (const r of excludeRoots) r?.traverse?.((o) => skip.add(o));
    scene.traverse((o) => {
      if (!o.visible) return;
      const m = o.material;
      const bad = skip.has(o) || o.isSkinnedMesh || o.isInstancedMesh || o.isPoints || o.isLine || o.isSprite || o.userData.fx
        || (o.isMesh && (!m || (Array.isArray(m) ? m.some((x) => x.transparent) : m.transparent) || o.geometry?.isInstancedBufferGeometry));
      if (bad && (o.isMesh || o.isPoints || o.isLine || o.isSprite)) { hidden.push(o); o.visible = false; }
    });
    const prevTarget = renderer.getRenderTarget(), prevOverride = scene.overrideMaterial, prevBg = scene.background, prevFog = scene.fog;
    const prevClear = renderer.getClearColor(new THREE.Color()), prevAlpha = renderer.getClearAlpha();
    const prevAuto = renderer.shadowMap.autoUpdate;
    scene.overrideMaterial = mat; scene.background = null; scene.fog = null;
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(rt);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, cam);
    const buf = new Float32Array(res * res * 4);
    renderer.readRenderTargetPixels(rt, 0, 0, res, res, buf);
    renderer.setRenderTarget(prevTarget);
    renderer.setClearColor(prevClear, prevAlpha);
    renderer.shadowMap.autoUpdate = prevAuto;
    scene.overrideMaterial = prevOverride; scene.background = prevBg; scene.fog = prevFog;
    for (const o of hidden) o.visible = true;
    rt.dispose(); mat.dispose();
    map = new Float32Array(res * res);
    for (let i = 0; i < res * res; i++) map[i] = buf[i * 4 + 3] > 0.5 ? buf[i * 4] : -1e4;
  }

  function floorAt(x, z) {
    const h = heightAt(x, z);
    if (!map) return h;
    const u = Math.floor((x + extent) / texel), v = Math.floor((-z + extent) / texel);
    if (u < 0 || v < 0 || u >= res || v >= res) return h;
    const y = map[v * res + u];
    return y > h + 0.02 && y < h + maxRise ? y : h;
  }

  return { build, floorAt, get ready() { return !!map; } };
}
