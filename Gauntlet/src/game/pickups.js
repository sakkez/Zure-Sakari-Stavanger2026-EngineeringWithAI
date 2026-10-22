// Loot on the ground: health/mana potions and gold. Simple glowing meshes (bloom picks up the emissive);
// particle flair goes through fx.spawn so the FX workstream controls the look.
import * as THREE from 'three';
import { rng } from './rng.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { skipOverridePasses } from './zone.js';

const KINDS = {
  health: { color: 0xc81818, emissive: 0xff2a14, intensity: 2.0, beam: [1.0, 0.12, 0.08] },
  mana: { color: 0x2448d8, emissive: 0x3a6cff, intensity: 2.0, beam: [0.2, 0.45, 1.0] },
  gold: { color: 0xffbf3a, emissive: 0xffa020, intensity: 0.5, beam: [1.0, 0.7, 0.2] },
  // Legendary tier (D4 orange): a relic that permanently empowers whoever claims it.
  relic: { color: 0xff7a18, emissive: 0xff6a10, intensity: 2.2, beam: [1.0, 0.38, 0.04] },
};

// D4-style loot beam: a soft vertical light shaft fading upward, with a bright core.
function beamMaterial(rgb) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uColor: { value: new THREE.Color(...rgb) }, uTime: { value: 0 } },
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){ vUv=uv; vec4 w=modelMatrix*vec4(position,1.0); vN=normalize(mat3(modelMatrix)*normal); vV=normalize(cameraPosition-w.xyz); gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uTime; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){
        float edge = pow(abs(dot(normalize(vN.xz), normalize(vV.xz + 1e-4))), 2.0);   // soft core, feathered sides
        float h = vUv.y;
        float fade = pow(1.0 - h, 2.2) * smoothstep(0.0, 0.12, h);              // lifts off the item, dissolves upward
        float shimmer = 0.85 + 0.15*sin(h*18.0 - uTime*3.0);
        gl_FragColor = vec4(uColor * edge * fade * shimmer * 2.6, 1.0); // steep camera foreshortens the beam: needs energy to read
      }`,
  });
}

export function createPickups(ctx, state, events) {
  const { engine, world, fx } = ctx;
  const { scene } = engine;
  const list = [];
  // ---- Item meshes: one merged geometry per kind (one draw call each). Vertex colours give the parts their
  // albedo; the aGlow attribute (0..1) says which parts emit (the potion liquid, the relic blade, nothing on coins).
  const cr = (() => { let s = 99; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
  function part(g, rgb, glow) {
    g = g.index ? g.toNonIndexed() : g;
    const n = g.attributes.position.count, col = new Float32Array(n * 3), gl = new Float32Array(n).fill(glow);
    for (let i = 0; i < n; i++) col.set(rgb, i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aGlow', new THREE.BufferAttribute(gl, 1));
    return g;
  }
  // Potion: squat dark-glass flask, glowing liquid in the lower bowl, long neck, cork.
  function bottle(liquid) {
    const glass = [0.05, 0.055, 0.065], cork = [0.28, 0.17, 0.09];
    return mergeGeometries([
      part(new THREE.SphereGeometry(0.2, 14, 10, 0, Math.PI * 2, Math.PI * 0.42, Math.PI * 0.58).translate(0, 0.2, 0), liquid, 1),   // liquid bowl
      part(new THREE.SphereGeometry(0.205, 14, 6, 0, Math.PI * 2, 0, Math.PI * 0.42).translate(0, 0.2, 0), glass, 0),              // glass shoulder
      part(new THREE.CylinderGeometry(0.055, 0.075, 0.2, 10).translate(0, 0.47, 0), glass, 0),                                      // neck
      part(new THREE.CylinderGeometry(0.075, 0.06, 0.03, 10).translate(0, 0.575, 0), glass, 0),                                     // lip
      part(new THREE.CylinderGeometry(0.05, 0.045, 0.09, 8).translate(0, 0.63, 0), cork, 0),                                        // cork
    ]);
  }
  // Gold: a heap of ~16 thin coins, the top ones tilted (catches the glints).
  const coins = [];
  for (let i = 0; i < 16; i++) {
    const c = new THREE.CylinderGeometry(0.11, 0.11, 0.025, 12);
    const lay = i < 7 ? 0 : i < 12 ? 1 : 2;
    c.rotateX((cr() - 0.5) * (lay ? 1.2 : 0.3)); c.rotateZ((cr() - 0.5) * (lay ? 1.2 : 0.3));
    const a = cr() * 6.28, r = lay === 0 ? 0.08 + cr() * 0.2 : lay === 1 ? cr() * 0.12 : cr() * 0.06;
    c.translate(Math.cos(a) * r, 0.015 + lay * 0.035 + cr() * 0.01, Math.sin(a) * r);
    coins.push(part(c, cr() < 0.2 ? [0.95, 0.72, 0.32] : [1, 0.8, 0.4], 0.15));
  }
  // Relic: a legendary blade driven into the ground, glowing edge, dark hilt.
  function relicGeo() {
    const blade = part(new THREE.BoxGeometry(0.07, 0.62, 0.018).translate(0, 0.34, 0), [1, 0.62, 0.3], 1);
    const tip = part(new THREE.ConeGeometry(0.05, 0.12, 4).rotateY(Math.PI / 4).scale(0.7, 1, 0.26).rotateX(Math.PI).translate(0, -0.0, 0), [1, 0.62, 0.3], 1);
    const guard = part(new THREE.BoxGeometry(0.3, 0.045, 0.06).translate(0, 0.66, 0), [0.25, 0.2, 0.16], 0.1);
    const grip = part(new THREE.CylinderGeometry(0.022, 0.026, 0.2, 6).translate(0, 0.79, 0), [0.12, 0.07, 0.05], 0);
    const pommel = part(new THREE.SphereGeometry(0.04, 8, 6).translate(0, 0.91, 0), [1, 0.5, 0.15], 1);
    return mergeGeometries([blade, tip, guard, grip, pommel]).rotateZ(0.18).rotateX(-0.12).translate(0, -0.06, 0);
  }
  const geos = { health: bottle([1, 0.1, 0.07]), mana: bottle([0.15, 0.35, 1]), gold: mergeGeometries(coins), relic: relicGeo() };
  // Only the legendary tier gets a beam (short, tapering); every drop gets a soft coloured ground pool.
  const beamGeo = new THREE.CylinderGeometry(0.32, 0.62, 4.5, 16, 1, true).translate(0, 2.25, 0);
  const POOL_MAX = 48;
  const poolMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    vertexShader: `varying vec2 vUv; varying vec3 vC;
      void main(){ vUv = uv; vC = vec3(1.0);
        #ifdef USE_INSTANCING_COLOR
        vC = instanceColor;
        #endif
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying vec2 vUv; varying vec3 vC;
      void main(){ float d = length(vUv - 0.5) * 2.0; float a = pow(max(0.0, 1.0 - d), 2.2);
        gl_FragColor = vec4(vC * a, 1.0); }`,
  });
  const pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), poolMat, POOL_MAX);
  pools.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  pools.setColorAt(0, new THREE.Color());
  pools.frustumCulled = false; pools.renderOrder = 3; pools.count = 0;
  skipOverridePasses(pools);
  scene.add(pools);
  const POOL = { health: [0.5, 0.06, 0.04, 1.3], mana: [0.08, 0.18, 0.55, 1.3], gold: [0.4, 0.26, 0.06, 1.2], relic: [0.9, 0.35, 0.04, 2.2] };
  const pm = new THREE.Matrix4(), pc = new THREE.Color();
  const glintT = { value: 0 };
  const mats = {}, beams = {};
  for (const k in KINDS) {
    const d = KINDS[k];
    mats[k] = new THREE.MeshStandardMaterial({ vertexColors: true, color: 0xffffff, emissive: d.emissive, emissiveIntensity: d.intensity,
      roughness: k === 'gold' ? 0.28 : 0.08, metalness: k === 'gold' || k === 'relic' ? 1.0 : 0.0, envMapIntensity: 1.2 });
    if (k === 'relic') beams[k] = beamMaterial(d.beam);
  }
  // Gold glints: sparse, position-hashed sparkles pulsing over time (different per coin, never in sync).
  const glint = (sh) => {
    sh.uniforms.uGlintT = glintT;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGlintW;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvGlintW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vGlintW; uniform float uGlintT;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        vec3 gc = floor(vGlintW * 9.0);
        float gh = fract(sin(dot(gc, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
        float gp = pow(max(0.0, sin(uGlintT * (2.0 + gh * 3.0) + gh * 40.0)), 24.0);
        totalEmissiveRadiance += vec3(3.5, 2.6, 1.2) * gp * step(0.6, gh);`);
  };
  for (const k in mats) mats[k].onBeforeCompile = glint; // every item glints, out of sync

  // One mesh per pickup (plus a beam for potions and big gold piles) to stay inside the draw-call budget.
  function makeMesh(kind, value) {
    const m = new THREE.Mesh(geos[kind], mats[kind]);
    m.userData.pickup = true;
    // sized to read at the zoomed-out camera (~D4 item scale relative to the 2m heroes)
    if (kind === 'gold') m.scale.setScalar(Math.min(2.4, 1.5 + value / 40));
    else m.scale.setScalar(kind === 'relic' ? 2.2 : 1.8);
    return m;
  }

  function spawn(kind, pos, value = 0) {
    if (list.length > 40) { const old = list.shift(); scene.remove(old.mesh); if (old.beam) scene.remove(old.beam); }
    const a = rng() * Math.PI * 2, r = 0.4 + rng() * 1.1;
    const mesh = makeMesh(kind, value);
    const p = { kind, value, mesh, pos: new THREE.Vector3(pos.x, 0, pos.z), life: 45, t: rng() * 6,
      vel: new THREE.Vector3(Math.cos(a) * r * 2.2, 5 + rng() * 2, Math.sin(a) * r * 2.2), y: (pos.y || 0) + 1, landed: false };
    mesh.position.copy(p.pos);
    scene.add(mesh);
    if (kind === 'relic') {
      p.beam = skipOverridePasses(new THREE.Mesh(beamGeo, beams[kind]));
      p.beam.visible = false; p.beam.renderOrder = 6;
      scene.add(p.beam);
    }
    list.push(p);
    return p;
  }

  // Loot table for a dying unit.
  function drop(u) {
    const p = u.pos;
    if (u.forceDrop) { for (const k of u.forceDrop) spawn(k, p, k === 'gold' ? 26 : 0); return; }
    if (u.boss) { spawn('relic', p); spawn('relic', p); spawn('health', p); spawn('gold', p, 80); spawn('gold', p, 60); spawn('gold', p, 40); return; }
    if (u.rival) {
      spawn('relic', p); spawn('health', p); spawn('mana', p); spawn('gold', p, 40); spawn('gold', p, 25);
      return;
    }
    const lead = u.leader ? 3 : 1;
    if (rng() < 0.22 * lead) spawn('health', p);
    if (rng() < 0.14 * lead) spawn('mana', p);
    if (rng() < 0.7) spawn('gold', p, Math.round((2 + rng() * 5 + state.zone.stage * 2) * lead));
  }

  function collect(p, u) {
    if (p.kind === 'health') {
      if (u.hp >= u.maxHp) return false;
      u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.35);
    } else if (p.kind === 'mana') {
      if (u.mana >= u.maxMana) return false;
      u.mana = Math.min(u.maxMana, u.mana + u.maxMana * 0.5);
    } else if (p.kind === 'relic') {
      u.dmgMul = (u.dmgMul || 1) * 1.08; u.maxHp += 12; u.hp += 12;
    } else {
      u.gold = (u.gold || 0) + p.value;
    }
    fx.spawn('hit', p.mesh.position.clone().setY(p.mesh.position.y + 0.3), { color: new THREE.Color(KINDS[p.kind].color) });
    fx.spawn('pickup', p.mesh.position.clone(), { kind: p.kind });
    events.emit('pickup', { unit: u, kind: p.kind, value: p.value });
    return true;
  }

  return {
    list, spawn, drop,
    clear() { for (const p of list) { scene.remove(p.mesh); if (p.beam) scene.remove(p.beam); } list.length = 0; },
    // Nearest potion of a kind (used by AI looking for heals).
    nearest(kind, pos, range) {
      let best = null, bd = range;
      for (const p of list) if (p.kind === kind && p.landed) { const d = Math.hypot(p.pos.x - pos.x, p.pos.z - pos.z); if (d < bd) { bd = d; best = p; } }
      return best;
    },
    update(dt, units) {
      glintT.value += dt;
      // ground light pools (one instanced draw)
      let n = 0;
      for (const p of list) {
        if (!p.landed || !p.mesh.visible || n >= POOL_MAX) continue;
        const c = POOL[p.kind], s = c[3] * (0.9 + 0.1 * Math.sin(p.t * 2.5));
        pm.makeScale(s, 1, s).setPosition(p.pos.x, p.y + 0.06, p.pos.z);
        pools.setMatrixAt(n, pm); pools.setColorAt(n, pc.setRGB(c[0], c[1], c[2])); n++;
      }
      pools.count = n;
      pools.instanceMatrix.needsUpdate = true; if (pools.instanceColor) pools.instanceColor.needsUpdate = true;
      for (const k in beams) beams[k].uniforms.uTime.value = glintT.value;
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i];
        p.t += dt; p.life -= dt;
        const gy = Math.max(world.heightAt(p.pos.x, p.pos.z), world.waterLevel);
        if (!p.landed) {
          p.vel.y -= 22 * dt; p.pos.x += p.vel.x * dt; p.pos.z += p.vel.z * dt; p.y += p.vel.y * dt;
          if (p.y <= gy) { p.y = gy; p.landed = true; }
        } else p.y = gy;
        const gold = p.kind === 'gold' || p.kind === 'relic'; // heaps and the planted blade stay put
        p.mesh.position.set(p.pos.x, p.y + (p.landed && !gold ? 0.1 + Math.sin(p.t * 3) * 0.05 : 0), p.pos.z);
        if (!gold) p.mesh.rotation.y += dt * 1.2;
        else if (!p.landed) p.mesh.rotation.y += dt * 8;
        if (p.life < 3) p.mesh.visible = Math.floor(p.life * 8) % 2 === 0;
        if (p.beam) {
          p.beam.visible = p.landed && p.mesh.visible;
          p.beam.position.set(p.pos.x, p.y, p.pos.z);
          p.beam.scale.y = Math.min(1, (p.beamT = (p.beamT || 0) + (p.landed ? dt * 3 : 0)));
        }
        let taken = false;
        if (p.landed) for (const u of units) {
          if (u.dead || u.team === 'mob') continue;
          const d = Math.hypot(u.pos.x - p.pos.x, u.pos.z - p.pos.z);
          // gold is magnetised toward the player
          if (p.kind === 'gold' && u === state.player && d < 3.5 && d > 0.01) {
            const k = Math.min(1, dt * 9 / d); p.pos.x += (u.pos.x - p.pos.x) * k; p.pos.z += (u.pos.z - p.pos.z) * k;
          }
          if (d < 0.9 && collect(p, u)) { taken = true; break; }
        }
        if (taken || p.life <= 0) { scene.remove(p.mesh); if (p.beam) scene.remove(p.beam); list.splice(i, 1); }
      }
    },
  };
}
