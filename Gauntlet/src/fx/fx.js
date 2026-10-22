// Combat VFX. Game code calls fx.spawn(type, position, opts) for one-shots and
// fx.attach(type, anchor, opts) to bind a looping effect to a moving Object3D (projectiles).
// An attached effect ends automatically when its anchor is removed from the scene.
//
// Layers (all pooled, fixed draw-call cost):
//   particles  one instanced draw: additive + alpha mixed via premultiplied blending, sorted
//   decals     one merged draw: terrain-draped scorch / frost / blood / cracks / telegraphs / shockwaves
//   ribbons    one merged draw: projectile and motion trails
//   arcs       pooled slash / whirlwind / nova-wall meshes
//   lights     fixed pool of 6 PointLights (count never changes -> no shader recompiles)
//   props      instanced arrows, ice spikes, rock spikes, meteor
import * as THREE from 'three';
import { makeParticleAtlas, makeDecalAtlas, makeNoiseTexture, makeLavaTexture, P, D } from './textures.js';
import { createParticles, COLLIDE, STICK } from './particles.js';
import { createDecals } from './decals.js';
import { createArcs, createRibbons, createLights, createProps, createChunks } from './meshes.js';
import { createFloor } from './floor.js';

// ---------------------------------------------------------------- palettes (linear HDR)
const FIRE = { core: [4, 2.2, 0.75], hot: [3, 0.85, 0.1], mid: [1.5, 0.17, 0.01], cool: [0.28, 0.012, 0.0], light: [1, 0.45, 0.15] };
const FROST = { core: [1.4, 2.9, 4.2], hot: [0.35, 1.4, 3.2], mid: [0.08, 0.55, 1.6], cool: [0.02, 0.14, 0.5], light: [0.25, 0.6, 1] };
const ARCANE = { core: [2.6, 1.4, 4.2], hot: [1.4, 0.3, 3.2], mid: [0.55, 0.08, 1.7], cool: [0.12, 0.02, 0.45], light: [0.6, 0.25, 1] };
const NECRO = { core: [1.0, 4.0, 1.4], hot: [0.25, 2.6, 0.5], mid: [0.06, 1.2, 0.2], cool: [0.02, 0.3, 0.06], light: [0.3, 1, 0.35] };
const SMOKE = [[0.11, 0.095, 0.085], [0.055, 0.05, 0.048]];
const DUST = [[0.25, 0.215, 0.17], [0.17, 0.15, 0.125]];
const DIRT = [0.11, 0.085, 0.06];

export function createFX(engine, ctx = {}) {
  const { scene, camera } = engine;
  const terrainAt = (x, z) => (ctx.world?.heightAt ? ctx.world.heightAt(x, z) : 0);
  // floor = terrain or raised static geometry (dais, steps) once the top-down height map is built
  const floor = createFloor(engine, terrainAt);
  const heightAt = floor.floorAt;

  const pAtlas = makeParticleAtlas(), dAtlas = makeDecalAtlas(), noise = makeNoiseTexture(), lava = makeLavaTexture();
  const parts = createParticles(scene, pAtlas, heightAt, 6000);
  const decals = createDecals(scene, dAtlas, heightAt, 64);
  const arcs = createArcs(scene, noise, 10);
  const ribbons = createRibbons(scene, noise, 32, 18);
  const lights = createLights(scene, 6);
  const props = createProps(scene, lava);
  const emit = parts.emit;
  // hot chunks leave a short ember trail
  const chunks = createChunks(scene, heightAt, (it) => emit({ p: { x: it.x, y: it.y, z: it.z }, v: { x: 0, y: 0.6, z: 0 }, size: 0.07, life: 0.4, color: [[2.4, 0.7, 0.08], [0.8, 0.1, 0.0]], frame: P.ember }), 160);

  // ---------------------------------------------------------------- helpers
  const R = Math.random;
  const rr = (a, b) => a + (b - a) * R();
  const rs = (a) => (R() * 2 - 1) * a;
  const pick = (a) => a[(R() * a.length) | 0];
  const cnt = (rate, dt) => Math.floor(rate * dt + R());
  const P3 = (x, y, z) => ({ x, y, z });
  function sph(s) {
    let x, y, z, l;
    do { x = rs(1); y = rs(1); z = rs(1); l = x * x + y * y + z * z; } while (l > 1 || l < 1e-4);
    l = Math.sqrt(l); return { x: (x / l) * s, y: (y / l) * s, z: (z / l) * s };
  }
  const add3 = (a, b, k = 1) => ({ x: a.x + b.x * k, y: a.y + b.y * k, z: a.z + b.z * k });
  const ground = (p, lift = 0) => ({ x: p.x, y: heightAt(p.x, p.z) + lift, z: p.z });
  const scale3 = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
  const fwdOf = (f) => ({ x: Math.sin(f), y: 0, z: Math.cos(f) });
  const flames = [P.flame, P.flame2];
  const smokes = [P.smoke, P.smoke2];

  // fx-local timers (driven by fx.update dt = game time)
  const tasks = [];
  const later = (t, fn) => tasks.push({ t, fn });
  const during = (dur, fn, end) => tasks.push({ dur, age: 0, fn, end });
  const alive = (a) => (a.isObject3D ? !!a.parent : a.dead === undefined ? true : !a.dead);
  const follow = (anchor, fn, end) => tasks.push({ anchor, fn, end, age: 0 });
  const anchorPos = (a) => (a.isObject3D ? a.position : a.pos || a);

  const shake = (amp, t) => engine.shake?.(amp, t);

  // ---------------------------------------------------------------- reusable building blocks
  function flash(p, color, size = 3, life = 0.14) {
    emit({ p, size: [size * 0.5, size * 0.8], life, color: scale3(color, 0.45), frame: P.glow, fadeIn: 0.01, fadeOut: 0.9, sizePow: 0.5 });
    emit({ p, size: [size * 0.8, size * 0.3], life: life * 1.2, color: scale3(color, 0.3), frame: P.flare, fadeIn: 0.01, fadeOut: 0.8, rot: R() * 6.28 });
  }
  function sparks(p, n, { speed = [4, 12], color = [[4, 2.6, 1.2], [2.2, 0.5, 0.05]], life = [0.25, 0.6], grav = -10, size = 0.12, stretch = 0.045, up = 0.3, dir = null, spread = 1, collide = true } = {}) {
    for (let i = 0; i < n; i++) {
      let v = sph(rr(speed[0], speed[1]));
      if (dir) v = { x: dir.x * rr(speed[0], speed[1]) + v.x * spread, y: dir.y * rr(speed[0], speed[1]) + v.y * spread, z: dir.z * rr(speed[0], speed[1]) + v.z * spread };
      v.y += up * speed[1];
      emit({ p, v, size: size * rr(0.6, 1.3), life: rr(life[0], life[1]), color, frame: P.spark, stretch, grav, drag: 1.2, flags: collide ? COLLIDE : 0, fadeIn: 0.01, fadeOut: 0.5 });
    }
  }
  function smoke(p, n, { size = [1, 3], life = [1, 1.8], speed = 1.5, up = 1.2, color = SMOKE, alpha = 0.6, spread = 0.3 } = {}) {
    for (let i = 0; i < n; i++) {
      const v = sph(speed * rr(0.3, 1)); v.y = Math.abs(v.y) * 0.5 + up * rr(0.5, 1);
      emit({ p: add3(p, sph(spread)), v, size: [size[0] * rr(0.7, 1.2), size[1] * rr(0.8, 1.2)], sizePow: 0.6, life: rr(life[0], life[1]), color, alpha, add: 0, frame: pick(smokes), rotV: rs(0.6), drag: 1.6, fadeIn: 0.12, fadeOut: 0.6, push: 0.5 });
    }
  }
  // fire that turns into smoke as it rises (additive -> alpha transition)
  function fireball(p, n, { speed = [2, 7], size = [0.8, 2.2], life = [0.45, 0.85], pal = FIRE, up = 1.5, drag = 4, smokeEnd = true, alpha = 0.6 } = {}) {
    alpha *= Math.min(1, 3 / Math.sqrt(Math.max(1, n))); // cap summed density so bursts never stack into white discs
    for (let i = 0; i < n; i++) {
      const v = sph(rr(speed[0], speed[1])); v.y = v.y * 0.7 + up * rr(0.5, 1.5);
      emit({ p: add3(p, sph(0.2)), v, size: [size[0] * rr(0.7, 1.2), size[1] * rr(0.8, 1.3)], sizePow: 0.45, life: rr(life[0], life[1]),
        color: smokeEnd ? [pal.hot, pal.mid, [0.07, 0.055, 0.05]] : [pal.core, pal.hot, pal.cool], cmid: 0.35,
        add: smokeEnd ? [0.85, 0] : 1, alpha, frame: pick(flames.concat(smokes)), rotV: rs(2), drag, grav: 1.5, fadeIn: 0.02, fadeOut: 0.5, push: 0.4 });
    }
  }
  function embers(p, n, { pal = FIRE, speed = 4, life = [0.8, 1.6], grav = 1.2, size = 0.09, spread = 0.3 } = {}) {
    for (let i = 0; i < n; i++) {
      const v = sph(rr(0.4, 1) * speed); v.y = Math.abs(v.y) + 0.5;
      emit({ p: add3(p, sph(spread)), v, size: size * rr(0.6, 1.4), life: rr(life[0], life[1]), color: [pal.core, pal.hot, pal.mid], frame: P.ember, stretch: 0.02, drag: 1.8, grav, fadeIn: 0.05, fadeOut: 0.5 });
    }
  }
  // 3D tumbling chunks (lit rock / bone); `hot` chunks trail embers briefly.
  const ROCK = [0.15, 0.12, 0.095], BONE = [0.55, 0.52, 0.45];
  function debris(p, n, { speed = [3, 7], up = 6, color = ROCK, size = [0.12, 0.28], life = [2.2, 3.4], radial = 1, hot = 0 } = {}) {
    for (let i = 0; i < n; i++) {
      const a = R() * 6.283, s = rr(speed[0], speed[1]) * radial;
      chunks.spawn({ p: add3(p, sph(0.3)), v: { x: Math.cos(a) * s, y: up * rr(0.6, 1.3), z: Math.sin(a) * s }, size: rr(size[0], size[1]), life: rr(life[0], life[1]),
        color: [color[0] * rr(0.8, 1.2), color[1] * rr(0.8, 1.2), color[2] * rr(0.8, 1.2)], hot: hot ? rr(0.3, hot) : 0 });
    }
  }
  function dustRing(p, n, { speed = [6, 11], size = [0.8, 2.4], life = [0.8, 1.4], color = DUST, alpha = 0.55, y = 0.3 } = {}) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 6.283 + rs(0.2), s = rr(speed[0], speed[1]);
      emit({ p: add3(ground(p, y), P3(Math.cos(a) * 0.4, 0, Math.sin(a) * 0.4)), v: P3(Math.cos(a) * s, rr(0.3, 1.2), Math.sin(a) * s), size: [size[0] * rr(0.7, 1.1), size[1] * rr(0.8, 1.2)], sizePow: 0.5,
        life: rr(life[0], life[1]), color, alpha, add: 0, frame: pick([P.dust, P.smoke, P.smoke2]), rotV: rs(1), drag: 3.2, fadeIn: 0.22, fadeOut: 0.7, push: 0.5 });
    }
  }
  function dustPuff(p, n, { size = [0.4, 1.4], life = [0.5, 0.9], alpha = 0.45, speed = 1.2, color = DUST } = {}) {
    for (let i = 0; i < n; i++) {
      const v = sph(speed); v.y = Math.abs(v.y) * 0.7 + 0.4;
      emit({ p: add3(p, sph(0.2)), v, size: [size[0] * rr(0.7, 1.2), size[1] * rr(0.8, 1.2)], sizePow: 0.5, life: rr(life[0], life[1]), color, alpha, add: 0, frame: pick([P.dust, P.smoke]), rotV: rs(1), drag: 2.5, fadeIn: 0.1, fadeOut: 0.7, push: 0.4 });
    }
  }
  // Flat expanding ground rings read as UI: only enemy telegraphs keep them (ringDecal). Player effects use
  // textured ground marks (scorch, frost, cracks), real ground light and particles instead.
  function shockDecal() {}
  function ringDecal(p, r, color, life = 0.4, add = 1) {
    decals.spawn({ x: p.x, z: p.z, size: [r * 0.15, r * 2], sizePow: 0.35, frame: D.shock, life, color, add, fadeIn: 0.01, fadeOut: 0.7, lift: 0.1 });
  }
  function groundGlow() {}
  function groundGlowDecal(p, r, color, life = 0.5) {
    decals.spawn({ x: p.x, z: p.z, size: r * 2, frame: D.disk, life, color, add: 1, fadeIn: 0.02, fadeOut: 0.9, lift: 0.1 });
  }
  function ringParticle(p, size, color, life = 0.25) {
    emit({ p, size: [size * 0.2, size], sizePow: 0.4, life, color, frame: P.ring, fadeIn: 0.01, fadeOut: 0.8, rot: 0 });
  }
  function sparkleBurst(p, n, pal, speed = 4, life = [0.4, 0.8]) {
    for (let i = 0; i < n; i++) emit({ p: add3(p, sph(0.3)), v: sph(rr(0.3, 1) * speed), size: rr(0.15, 0.35), life: rr(life[0], life[1]), color: [pal.core, pal.hot, pal.mid], frame: P.star, rotV: rs(4), drag: 3, grav: 0.5, fadeIn: 0.02, fadeOut: 0.6 });
  }

  // nearest unit (to decide blood vs bone, etc.)
  function unitNear(p, r = 1.6) {
    const us = ctx.game?.units; if (!us) return null;
    let best = null, bd = r;
    for (const u of us) { const d = Math.hypot(u.pos.x - p.x, u.pos.z - p.z); if (d < bd) { bd = d; best = u; } }
    return best;
  }
  const isSkeleton = (u) => !!u && /^skeleton/.test(u.kind);

  // ---------------------------------------------------------------- one-shot effects
  const types = {
    // --- legacy names (kept working) ---
    fireTrail(p) {
      for (let i = 0; i < 2; i++) emit({ p: add3(p, sph(0.15)), v: add3(sph(0.8), P3(0, 0.6, 0)), size: [0.55, 0.12], life: rr(0.18, 0.3), color: [FIRE.core, FIRE.hot, FIRE.cool], frame: pick(flames), rotV: rs(3) });
    },
    explosion(p, o = {}) {
      const pal = o.color ? { core: [o.color.r * 6, o.color.g * 6, o.color.b * 6], hot: [o.color.r * 4, o.color.g * 3, o.color.b * 2], mid: [o.color.r * 2, o.color.g, o.color.b * 0.5], cool: [0.3, 0.1, 0.03], light: [o.color.r, o.color.g, o.color.b] } : FIRE;
      const s = o.scale ?? 1;
      flash(p, pal.core, 5 * s, 0.16);
      fireball(p, Math.round(22 * s), { pal, speed: [2 * s, 7 * s], size: [0.9 * s, 2.2 * s], alpha: 0.45 });
      for (let i = 0; i < 5 * s; i++) emit({ p: add3(p, sph(0.3)), v: sph(rr(1, 3)), size: [1.1 * s, 0.4 * s], life: rr(0.15, 0.3), alpha: 0.6, color: [pal.core, pal.hot, pal.mid], frame: pick(flames), rotV: rs(3), drag: 3 });
      sparks(p, Math.round(24 * s), { speed: [6, 16], color: [pal.core, pal.mid], up: 0.25 });
      embers(add3(p, P3(0, 0.3, 0)), Math.round(12 * s), { pal, speed: 5 });
      smoke(add3(p, P3(0, 0.4, 0)), Math.round(9 * s), { size: [1.2 * s, 3.2 * s], life: [1.4, 2.4], speed: 1.6, up: 2.4, alpha: 0.75, color: [[0.07, 0.06, 0.055], [0.035, 0.032, 0.03]] });
      during(1.4, (dt, k) => { if (R() < dt * 9 * (1 - k)) smoke(add3(ground(p), P3(rs(0.6), 0.5, rs(0.6))), 1, { size: [1, 2.6], life: [1.6, 2.4], speed: 0.4, up: 2.2, alpha: 0.55, color: [[0.07, 0.06, 0.055], [0.035, 0.032, 0.03]] }); });
      const g = ground(p);
      if (p.y - g.y < 3) {
        shockDecal(g, 3 * s, scale3(pal.hot, 0.4), 0.3);
        groundGlow(g, 2.6 * s, scale3(pal.hot, 0.3), 0.45);
        during(3.5, (dt, k) => { if (R() < dt * 10 * (1 - k)) embers(P3(g.x + rs(1.1 * s), g.y + 0.1, g.z + rs(1.1 * s)), 1, { speed: 1.2, life: [0.6, 1.2], size: 0.07 }); });
        decals.spawn({ x: g.x, z: g.z, size: rr(2.6, 3.4) * s, frame: D.scorch, life: 13, color: [scale3(pal.hot, 0.5), [0.035, 0.028, 0.022]], cmid: 0.08, add: [1, 0], alpha: 0.9, fadeIn: 0.01, fadeOut: 0.3 });
      }
      lights.spawn({ pos: p, color: pal.light, intensity: 150 * s, distance: 6.5 * s, life: 0.5, y: 0.6, prio: 3 });
      if (p.y - g.y < 3) lights.spawn({ pos: g, color: [1, 0.35, 0.08], intensity: 14 * s, distance: 5 * s, life: 2.8, fadeIn: 0.4, y: 0.4, prio: 0, flicker: 0.6 });
      shake(0.18 * s, 0.18);
    },
    hit(p, o = {}) {
      const c = o.color ? [o.color.r * 3.5, o.color.g * 3.5, o.color.b * 3.5] : [4, 3, 1.8];
      flash(p, c, 1.9, 0.09);
      sparks(p, 12, { speed: [4, 10], color: [c, [c[0] * 0.4, c[1] * 0.15, c[2] * 0.05]], life: [0.15, 0.35], up: 0.3, dir: o.dir || null, spread: 0.7 });
      ringParticle(p, 1.3, scale3(c, 0.3), 0.16);
      // hits read on the ground too: a brief light pop and a small scuff
      lights.spawn({ pos: p, color: [Math.min(1, c[0] / 4), Math.min(1, c[1] / 4), Math.min(1, c[2] / 4)], intensity: 30, distance: 3.5, life: 0.14, prio: 0 });
      if (R() < 0.35) { const g = ground(p); decals.spawn({ x: g.x + rs(0.3), z: g.z + rs(0.3), size: rr(0.6, 1.0), frame: D.scuff, life: 6, color: [0.08, 0.07, 0.06], add: 0, alpha: 0.5, fadeOut: 0.4 }); }
    },
    blood(p) {
      const u = unitNear(p);
      if (isSkeleton(u)) {
        debris(p, 4, { speed: [1.5, 4], up: 3, color: BONE, size: [0.05, 0.1], life: [1.5, 2.5] });
        dustPuff(p, 2, { color: [[0.5, 0.48, 0.42], [0.3, 0.3, 0.28]], alpha: 0.3, size: [0.3, 0.9] });
        for (let i = 0; i < 4; i++) emit({ p: add3(p, sph(0.3)), v: add3(sph(1), P3(0, 1.5, 0)), size: rr(0.1, 0.2), life: rr(0.4, 0.7), color: [NECRO.core, NECRO.mid], frame: P.ember, drag: 2 });
        return;
      }
      for (let i = 0; i < 10; i++) {
        const v = add3(sph(rr(1.5, 4.5)), P3(0, 2, 0));
        emit({ p: add3(p, sph(0.15)), v, size: rr(0.07, 0.15), life: rr(0.5, 0.9), color: [[0.32, 0.01, 0.01], [0.14, 0.005, 0.005]], add: 0, frame: P.drop, stretch: 0.03, grav: -15, flags: COLLIDE | STICK, fadeIn: 0.01, fadeOut: 0.3 });
      }
      for (let i = 0; i < 2; i++) emit({ p: add3(p, sph(0.2)), v: sph(1.2), size: [0.3, 1.0], life: rr(0.3, 0.5), color: [0.22, 0.01, 0.01], alpha: 0.45, add: 0, frame: P.smoke, push: 0.3 });
      if (R() < 0.4) {
        const g = ground(add3(p, P3(rs(0.6), 0, rs(0.6))));
        decals.spawn({ x: g.x, z: g.z, size: rr(0.7, 1.4), frame: pick([D.blood, D.bloodSmall]), life: 12, color: [[0.2, 0.008, 0.008], [0.1, 0.015, 0.012]], cmid: 1, add: 0, alpha: 0.9, fadeIn: 0.05, fadeOut: 0.3 });
      }
    },
    frost(p) {
      flash(p, FROST.core, 2.5, 0.2);
      sparkleBurst(p, 24, FROST, 5);
      for (let i = 0; i < 16; i++) emit({ p, v: sph(rr(3, 7)), size: rr(0.2, 0.35), life: rr(0.3, 0.5), color: [FROST.core, FROST.mid], add: 1, frame: P.shard, stretch: 0.03, drag: 3, fadeOut: 0.5 });
    },
    arrowTrail(p) { emit({ p, size: [0.2, 0.05], life: 0.15, color: [0.7, 0.5, 0.3], alpha: 0.6, frame: P.glow }); },
    slash(p, o = {}) {
      const c = o.color || [4, 2.8, 1.4];
      sparks(p, 10, { speed: [3, 8], color: [c, [2, 0.6, 0.1]], life: [0.12, 0.3], up: 0.2, dir: o.dir || null, spread: 0.8 });
      flash(p, scale3(c, 0.5), 1.2, 0.08);
    },
    zone(p) {
      emit({ p: add3(p, P3(rs(0.5), 0, rs(0.5))), v: P3(rs(0.3), rr(0.8, 2), rs(0.3)), size: [0.5, 0.2], life: rr(0.8, 1.4), color: [ARCANE.hot, ARCANE.mid, ARCANE.cool], frame: pick([P.wisp, P.ember]), drag: 0.5, fadeIn: 0.2 });
    },
    spawn(p) {
      const g = ground(p);
      decals.spawn({ x: g.x, z: g.z, size: [0.8, 2.2], sizePow: 0.3, frame: D.hole, life: 7, color: [0.05, 0.04, 0.03], alpha: 0.95, add: 0, fadeIn: 0.05, fadeOut: 0.3 });
      decals.spawn({ x: g.x, z: g.z, size: [1.6, 3.0], sizePow: 0.4, frame: D.necro, life: 1.4, color: NECRO.hot, add: 1, alpha: 0.4, rotV: 1.2, fadeIn: 0.15, fadeOut: 0.5, pulse: 14 });
      debris(g, 9, { speed: [0.6, 2.4], up: 5, size: [0.08, 0.18] });
      dustPuff(add3(g, P3(0, 0.3, 0)), 6, { size: [0.6, 2], life: [0.9, 1.4], alpha: 0.5, speed: 1.5 });
      lights.spawn({ pos: g, color: NECRO.light, intensity: 30, distance: 6, life: 1.5, y: 1, prio: 0, flicker: 0.3 });
      during(1.25, (dt, k) => {
        const n = cnt(45 * (1 - k * 0.5), dt);
        for (let i = 0; i < n; i++) {
          const a = R() * 6.283, r = rr(0, 0.7);
          emit({ p: P3(g.x + Math.cos(a) * r, g.y + 0.05, g.z + Math.sin(a) * r), v: P3(rs(0.3), rr(1.5, 3.2), rs(0.3)), size: [rr(0.4, 0.7), 0.08], life: rr(0.35, 0.65), color: [NECRO.core, NECRO.hot, NECRO.cool], frame: pick(flames), rotV: rs(2), drag: 1, fadeIn: 0.1 });
        }
        if (R() < dt * 20) emit({ p: P3(g.x + rs(0.6), g.y + 0.2, g.z + rs(0.6)), v: P3(rs(0.4), rr(0.4, 1), rs(0.4)), size: [0.6, 1.6], life: rr(0.8, 1.2), color: [[0.04, 0.12, 0.06], [0.03, 0.04, 0.035]], alpha: 0.5, add: 0, frame: P.smoke, push: 0.4 });
      });
    },

    // Enemy / boss AoE warning (Diablo IV style): dark-red disc whose inner fill grows to the edge, then snaps.
    telegraph(p, o = {}) {
      const Rr = o.radius ?? 3, dur = o.duration ?? 1, g = ground(p);
      const col = o.color ? (o.color.isColor ? [o.color.r, o.color.g, o.color.b] : o.color) : [1.1, 0.07, 0.02];
      decals.spawn({ x: g.x, z: g.z, size: Rr * 2, frame: D.telegraphFill, life: dur + 0.12, color: [0.06, 0.0, 0.0], add: 0, alpha: 0.4, fadeIn: 0.08, fadeOut: 0.08 });
      decals.spawn({ x: g.x, z: g.z, size: Rr * 2.3, frame: D.shock, life: dur + 0.12, color: col, add: 0.55, alpha: 0.65, fadeIn: 0.08, fadeOut: 0.08 });
      decals.spawn({ x: g.x, z: g.z, size: [Rr * 0.05, Rr * 2], sizePow: 1, frame: D.telegraphFill, life: dur, color: scale3(col, 0.9), add: 0.6, alpha: 0.6, fadeIn: 0.03, fadeOut: 0.02 });
      // readable leading edge riding on the fill front
      decals.spawn({ x: g.x, z: g.z, size: [Rr * 0.06, Rr * 2 * (0.95 / 0.86)], sizePow: 1, frame: D.shock, life: dur, color: scale3(col, 1.5), add: 0.9, alpha: 0.55, fadeIn: 0.05, fadeOut: 0.02 });
      later(dur, () => { ringDecal(g, Rr * 1.05, scale3(col, 1.3), 0.25); });
    },

    // --- Sorceress ---
    fireballImpact(p, o) { types.explosion(p, o); },
    castGlow(p, o = {}) {
      const pal = o.pal || FIRE, u = o.unit, dur = o.duration ?? 0.25;
      during(dur, (dt, k) => {
        const base = u ? u.pos : p;
        const f = fwdOf(u ? u.facing : 0);
        const hp = P3(base.x + f.x * 0.55, base.y + 1.35, base.z + f.z * 0.55);
        emit({ p: hp, size: 0.9 + k * 0.5, life: 0.05, color: scale3(pal.hot, 0.8), frame: P.glow, fadeIn: 0.3 });
        const n = cnt(40, dt);
        for (let i = 0; i < n; i++) { const s = sph(0.9); emit({ p: add3(hp, s), v: P3(-s.x * 3.5, -s.y * 3.5, -s.z * 3.5), size: rr(0.06, 0.12), life: 0.26, color: [pal.core, pal.hot], frame: P.ember, stretch: 0.03, fadeIn: 0.3 }); }
      });
    },
    frostNova(p, o = {}) {
      const Rr = o.radius ?? 5, g = ground(p);
      const c = add3(g, P3(0, 0.6, 0));
      flash(c, FROST.core, 2.6, 0.16);
      shockDecal(g, Rr * 1.05, scale3(FROST.hot, 0.5), 0.4);
      decals.spawn({ x: g.x, z: g.z, size: [Rr * 0.6, Rr * 2.1], sizePow: 0.07, frame: D.frost, life: 11, color: [[0.25, 0.7, 1.4], [0.2, 0.32, 0.5]], cmid: 0.08, add: [0.5, 0], alpha: 0.85, fadeIn: 0.01, fadeOut: 0.35 });
      groundGlow(g, Rr, scale3(FROST.mid, 0.3), 0.5);
      // expanding wall of frost
      // ice spikes erupting outward, staggered by distance
      const n = Math.round(Rr * 4.5);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * 6.283 + rs(0.15), r = rr(1.2, Rr * 0.95);
        const x = g.x + Math.sin(a) * r, z = g.z + Math.cos(a) * r, y = heightAt(x, z) - 0.15;
        const tilt = rr(0.25, 0.6), sc = rr(0.8, 1.4) * (1.15 - r / Rr * 0.35), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, a, rs(0.2), 'YXZ'));
        const delay = (r / Rr) * 0.22, hold = rr(1.1, 1.6);
        props.ice.add({ tick(it, d) {
          const t = it.age - delay;
          if (t < 0) { d.scale.setScalar(0.0001); d.position.set(x, y, z); return; }
          if (t > hold + 0.35) { return false; }
          const k = t < 0.1 ? 1 - Math.pow(1 - t / 0.1, 3) : 1;
          const sink = t > hold ? (t - hold) / 0.35 : 0;
          d.position.set(x, y - sink * 1.4 * sc, z); d.quaternion.copy(q); d.scale.set(sc * k, sc * k * (1.1 - sink * 0.3), sc * k);
        } });
        later(delay, () => { const sp = P3(x, y + 0.3, z); dustPuff(sp, 1, { color: [[0.6, 0.75, 0.9], [0.3, 0.4, 0.5]], alpha: 0.35 }); sparkleBurst(sp, 2, FROST, 2); });
        later(delay + hold, () => { for (let j = 0; j < 3; j++) emit({ p: P3(x, y + 0.6, z), v: add3(sph(3), P3(0, 2, 0)), size: rr(0.15, 0.3), life: rr(0.4, 0.7), color: [FROST.hot, FROST.cool], add: [1, 0.5], frame: P.shard, rotV: rs(10), grav: -12, flags: COLLIDE }); });
      }
      // shards racing outward along the ground
      for (let i = 0; i < 40; i++) {
        const a = R() * 6.283, s = rr(Rr * 2.2, Rr * 3.4);
        emit({ p: add3(c, P3(0, rs(0.3), 0)), v: P3(Math.sin(a) * s, rr(0, 2), Math.cos(a) * s), size: rr(0.25, 0.45), life: rr(0.3, 0.45), color: [FROST.hot, FROST.mid, FROST.cool], frame: P.shard, stretch: 0.025, drag: 2.5, fadeOut: 0.4 });
      }
      // cold mist rolling out
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * 6.283, s = rr(Rr * 1.2, Rr * 1.9);
        emit({ p: add3(g, P3(0, 0.4, 0)), v: P3(Math.sin(a) * s, rr(0.1, 0.6), Math.cos(a) * s), size: [1.0, 2.6], life: rr(0.9, 1.5), color: [[0.15, 0.4, 0.8], [0.08, 0.16, 0.3]], alpha: 0.2, add: [0.5, 0], fadeIn: 0.2, frame: pick(smokes), drag: 2.4, rotV: rs(1), push: 0.5 });
      }
      sparkleBurst(c, 16, FROST, 7, [0.5, 1.0]);
      lights.spawn({ pos: g, color: FROST.light, intensity: 140, distance: Rr * 1.6, life: 0.8, y: 1.2, prio: 3 });
      shake(0.15, 0.15);
    },
    freeze(p, o = {}) {
      const u = o.unit, dur = o.duration ?? 2;
      if (!u) return;
      const spikes = [];
      for (let i = 0; i < 6; i++) spikes.push({ a: (i / 6) * 6.283 + rs(0.3), r: rr(0.2, 0.4), tilt: rr(0.25, 0.55), s: rr(0.5, 0.85) });
      for (const sp of spikes) {
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(sp.tilt, sp.a, 0, 'YXZ'));
        props.ice.add({ tick(it, d) {
          if (it.age > dur || u.removed) return false;
          const k = Math.min(1, it.age / 0.12);
          d.position.set(u.pos.x + Math.sin(sp.a) * sp.r, u.pos.y - 0.1, u.pos.z + Math.cos(sp.a) * sp.r);
          d.quaternion.copy(q); d.scale.setScalar(sp.s * k);
        } });
      }
      decals.spawn({ x: u.pos.x, z: u.pos.z, size: 1.8, frame: D.frost, life: dur, color: [0.7, 0.9, 1.2], add: 0.3, alpha: 0.8, fadeIn: 0.05, fadeOut: 0.2 });
      during(dur, (dt) => {
        if (cnt(10, dt)) emit({ p: P3(u.pos.x + rs(0.5), u.pos.y + rr(0.2, 1.6), u.pos.z + rs(0.5)), v: P3(0, rr(-0.3, 0.3), 0), size: rr(0.12, 0.25), life: rr(0.4, 0.8), color: [FROST.core, FROST.mid], frame: P.star, rotV: rs(3) });
        if (R() < dt * 4) emit({ p: P3(u.pos.x + rs(0.3), u.pos.y + 0.5, u.pos.z + rs(0.3)), v: P3(0, 0.4, 0), size: [0.8, 1.6], life: 1, color: [0.6, 0.8, 1], alpha: 0.2, add: 0.3, frame: P.smoke, push: 0.5 });
      }, () => {
        const c = P3(u.pos.x, u.pos.y + 0.8, u.pos.z);
        for (let j = 0; j < 14; j++) emit({ p: add3(c, sph(0.4)), v: add3(sph(rr(2, 5)), P3(0, 2, 0)), size: rr(0.15, 0.3), life: rr(0.4, 0.8), color: [FROST.hot, FROST.cool], add: [1, 0.3], frame: P.shard, rotV: rs(10), grav: -12, flags: COLLIDE });
        sparkleBurst(c, 8, FROST, 3);
      });
    },
    meteorTelegraph(p, o = {}) {
      // the player's own targeting: a dim, thin, desaturated line + faint fill (never the brightest thing on screen)
      const Rr = o.radius ?? 5, dur = o.duration ?? 1.0, g = ground(p);
      decals.spawn({ x: g.x, z: g.z, size: [Rr * 0.6, Rr * 2], sizePow: 0.7, frame: D.scorch, life: dur + 0.1, color: [[0.06, 0.03, 0.02], [0.5, 0.12, 0.02]], cmid: 1, add: [0, 0.6], alpha: 0.45, fadeIn: 0.3, fadeOut: 0.1 });
      during(dur, (dt) => {
        const n = cnt(10, dt);
        for (let i = 0; i < n; i++) { const a = R() * 6.283, rq = Math.sqrt(R()) * Rr; emit({ p: P3(g.x + Math.sin(a) * rq, g.y + 0.1, g.z + Math.cos(a) * rq), v: P3(0, rr(0.8, 2), 0), size: rr(0.08, 0.14), life: rr(0.4, 0.7), color: [FIRE.core, FIRE.mid], frame: P.ember, stretch: 0.03 }); }
      });
    },
    meteorFall(p, o = {}) {
      const dur = o.duration ?? 0.65, g = ground(p);
      const start = P3(g.x - 8, g.y + 18, g.z + 5);
      const cur = new THREE.Vector3(start.x, start.y, start.z);
      const dir = new THREE.Vector3(g.x - start.x, g.y - start.y, g.z - start.z).normalize();
      const spinQ = new THREE.Quaternion(), axis = new THREE.Vector3(1, 0, 0.6).normalize();
      props.meteors.add({ tick(it, d) {
        if (it.age > dur) return false;
        spinQ.setFromAxisAngle(axis, it.age * 9);
        d.position.copy(cur); d.quaternion.copy(spinQ); d.scale.setScalar(1.0);
      } });
      const fire = ribbons.create({ follow: cur, width: 1.8, life: 0.3, color: [[2.4, 0.6, 0.06], [0.6, 0.05, 0.0]], add: 1, alpha: 0.7, minDist: 0.6 });
      const smk = ribbons.create({ follow: cur, width: 2.6, life: 0.9, color: [[0.12, 0.09, 0.08], [0.05, 0.05, 0.05]], add: 0, alpha: 0.7, minDist: 0.6 });
      lights.spawn({ follow: cur, color: FIRE.light, intensity: 70, distance: 16, prio: 4, flicker: 0.2, life: dur });
      during(dur, (dt, k) => {
        const t = Math.min(1, k);
        cur.set(start.x + (g.x - start.x) * t, start.y + (g.y - start.y) * t, start.z + (g.z - start.z) * t);
        emit({ p: cur, size: 3.2, life: 0.06, color: FIRE.hot, frame: P.glow, fadeIn: 0.3 });
        const n = cnt(90, dt);
        for (let i = 0; i < n; i++) emit({ p: add3(cur, sph(0.7)), v: add3(sph(2), dir, -rr(3, 8)), size: [rr(1.0, 1.6), 0.3], life: rr(0.2, 0.4), alpha: 0.45, color: [FIRE.hot, FIRE.mid, FIRE.cool], frame: pick(flames), rotV: rs(3), drag: 2 });
        const m = cnt(50, dt);
        for (let i = 0; i < m; i++) emit({ p: add3(cur, sph(0.8)), v: add3(sph(1), dir, -rr(1, 3)), size: [1.0, 2.8], life: rr(0.8, 1.4), color: SMOKE, alpha: 0.65, add: 0, frame: pick(smokes), rotV: rs(1), drag: 1.5, fadeIn: 0.1, push: 0.5 });
        embers(cur, cnt(40, dt), { speed: 5 });
      }, () => { fire.stop(); smk.stop(); });
    },
    meteorImpact(p, o = {}) {
      const g = ground(p), c = add3(g, P3(0, 0.5, 0)), Rr = o.radius ?? 5;
      flash(add3(g, P3(0, 1, 0)), FIRE.core, 4, 0.18);
      fireball(c, 28, { speed: [3, 11], size: [1.2, 2.8], life: [0.6, 1.2], up: 3, alpha: 0.3 });
      for (let i = 0; i < 18; i++) emit({ p: add3(c, sph(0.8)), v: P3(rs(1.5), rr(8, 16), rs(1.5)), size: [1.4, 2.4], life: rr(0.5, 0.9), alpha: 0.5, color: [FIRE.hot, FIRE.mid, [0.07, 0.055, 0.05]], add: [1, 0], frame: pick(flames), drag: 2.5, rotV: rs(2), push: 0.4 });
      sparks(c, 80, { speed: [8, 22], up: 0.4, life: [0.4, 1.0] });
      debris(c, 18, { speed: [4, 10], up: 9, size: [0.16, 0.36], hot: 1.2 });
      embers(add3(c, P3(0, 1, 0)), 40, { speed: 8, life: [1.2, 2.4] });
      smoke(add3(c, P3(0, 1.2, 0)), 22, { size: [2, 5], life: [1.8, 3.2], speed: 3, up: 2.5, alpha: 0.75 });
      dustRing(g, 24, { speed: [10, 16], size: [1, 3], alpha: 0.24, color: [[0.15, 0.13, 0.1], [0.1, 0.09, 0.075]] });
      shockDecal(g, Rr * 1.3, [0.6, 0.18, 0.03], 0.35);
            decals.spawn({ x: g.x, z: g.z, size: Rr * 1.4, frame: D.crack, life: 14, color: [[2.6, 0.6, 0.06], [0.04, 0.03, 0.025]], cmid: 0.12, add: [1, 0], alpha: 0.95, fadeIn: 0.01, fadeOut: 0.3 });
      decals.spawn({ x: g.x, z: g.z, size: Rr * 1.5, frame: D.scorch, life: 15, color: [[1.2, 0.35, 0.06], [0.03, 0.025, 0.02]], cmid: 0.15, add: [1, 0], alpha: 0.95, fadeIn: 0.01, fadeOut: 0.3 });
      lights.spawn({ pos: g, color: FIRE.light, intensity: 300, distance: 11, life: 0.8, y: 1.6, prio: 5 });
      lights.spawn({ pos: g, color: [1, 0.38, 0.1], intensity: 40, distance: 9, life: 2.8, fadeIn: 0.5, y: 0.8, prio: 1, flicker: 0.5 });
      shake(0.9, 0.5);
      // burning ground afterwards
      during(2.6, (dt, k) => {
        const n = cnt(34 * (1 - k), dt);
        for (let i = 0; i < n; i++) {
          const a = R() * 6.283, r = Math.sqrt(R()) * Rr * 0.6;
          const x = g.x + Math.sin(a) * r, z = g.z + Math.cos(a) * r;
          emit({ p: P3(x, heightAt(x, z) + 0.1, z), v: P3(rs(0.3), rr(1, 2.5), rs(0.3)), size: [rr(0.5, 1.0), 0.1], life: rr(0.4, 0.8), color: [FIRE.core, FIRE.hot, FIRE.cool], frame: pick(flames), rotV: rs(2), fadeIn: 0.15 });
        }
        if (R() < dt * 14 * (1 - k * 0.6)) smoke(P3(g.x + rs(1.6), g.y + 0.6, g.z + rs(1.6)), 1, { size: [1.4, 3.6], life: [2.0, 3.0], alpha: 0.6, speed: 0.4, up: 2.8, color: [[0.06, 0.05, 0.045], [0.03, 0.028, 0.026]] });
        if (R() < dt * 15) embers(P3(g.x + rs(2), g.y + 0.2, g.z + rs(2)), 1, { speed: 2 });
        if (R() < dt * 10 * (1 - k)) emit({ p: P3(g.x + rs(2), g.y + 0.5, g.z + rs(2)), v: P3(rs(0.2), rr(1.2, 2.2), rs(0.2)), size: [0.8, 2.2], life: rr(0.8, 1.3), color: [0.35, 0.12, 0.03], alpha: 0.35, add: 1, frame: P.smoke3, rotV: rs(1), fadeIn: 0.3 });
      });
    },
    blink(p, o = {}) {
      const to = o.to || p;
      for (const [q, k] of [[p, 1], [to, 1.2]]) {
        const g = ground(q), c = add3(g, P3(0, 1, 0));
        flash(c, ARCANE.core, 3.2 * k, 0.18);
        sparkleBurst(c, 22, ARCANE, 5);
        for (let i = 0; i < 10; i++) emit({ p: add3(c, sph(0.4)), v: sph(rr(0.5, 2)), size: [0.9, 1.8], life: rr(0.3, 0.6), color: [ARCANE.hot, ARCANE.mid, ARCANE.cool], frame: P.wisp, rotV: rs(4), drag: 2 });
        shockDecal(g, 1.8 * k, ARCANE.mid, 0.3);
      }
      const n = 26;
      for (let i = 0; i < n; i++) {
        const t = i / n;
        const q = P3(p.x + (to.x - p.x) * t + rs(0.25), heightAt(p.x, p.z) + 0.3 + rr(0, 1.5), p.z + (to.z - p.z) * t + rs(0.25));
        emit({ p: q, v: P3((to.x - p.x) * 1.5, 0, (to.z - p.z) * 1.5), size: rr(0.12, 0.25), life: rr(0.25, 0.5) * (0.5 + t), color: [ARCANE.core, ARCANE.mid], frame: P.spark, stretch: 0.03, drag: 6 });
      }
      lights.spawn({ pos: ground(to), color: ARCANE.light, intensity: 45, distance: 9, life: 0.45, y: 1.2, prio: 2 });
    },

    // --- Warrior ---
    cleave(p, o = {}) {
      const f = o.facing ?? 0, dir = o.dir ?? 1, reach = o.reach ?? 2.4;
      const col = o.color || [0.95, 0.42, 0.13], hot = o.hot || [2.0, 1.15, 0.45];
      arcs.spawn({ pos: p, yOff: 0.95, facing: f, span: 2.7, r0: 0.7, r1: reach + 0.4, slope: 0.7 * dir, dir, dur: 0.1, fade: 0.26, tail: 0.35, color: col, hot, alpha: 1.3 });
      arcs.spawn({ pos: p, yOff: 1.0, facing: f, span: 2.5, r0: reach - 0.3, r1: reach + 0.6, slope: 0.7 * dir, dir, dur: 0.11, fade: 0.14, tail: 0.14, color: scale3(col, 0.8), hot, alpha: 0.8 });
      later(0.06, () => {
        for (let i = 0; i < 10; i++) {
          const a = f + rs(1.1), r = reach * rr(0.8, 1.05);
          const q = P3(p.x + Math.sin(a) * r, p.y + 1 + rs(0.3), p.z + Math.cos(a) * r);
          emit({ p: q, v: P3(Math.cos(a) * 6 * dir + Math.sin(a) * 2, rr(0, 2), -Math.sin(a) * 6 * dir + Math.cos(a) * 2), size: 0.1, life: rr(0.12, 0.3), color: [hot, col], frame: P.spark, stretch: 0.04, grav: -6, drag: 2 });
        }
      });
      const fw = fwdOf(f);
      dustPuff(ground(add3(p, fw, 1.4), 0.2), 2, { size: [0.4, 1.2], alpha: 0.3 });
      lights.spawn({ pos: add3(p, fw, 1.4), color: [1, 0.55, 0.25], intensity: 40, distance: 4.5, life: 0.22, y: 1, prio: 1 });
    },
    whirlwind(p, o = {}) {
      const u = o.unit, dur = o.duration ?? 1.0;
      const tgt = u ? u.pos : p;
      for (const [ph, yo, al] of [[0, 0.85, 1.0], [0.5, 1.05, 0.8]]) {
        const a = arcs.spawn({ follow: tgt, yOff: yo, span: Math.PI * 2, r0: 2.45, r1: 2.85, spin: true, spinSpeed: 3.4, tail: 0.07, slope: 0, dur, fade: 0.2, color: [1.1, 0.5, 0.16], hot: [2.4, 1.5, 0.7], alpha: al * 0.95 });
        a.phase = ph;
      }
      let ang = 0;
      during(dur, (dt) => {
        ang += dt * 3.4 * 6.283;
        const gp = ground(tgt);
        // motion-blurred steel glints racing around the blade circle
        const m = cnt(70, dt);
        for (let i = 0; i < m; i++) {
          const a = ang - R() * 1.2, r = rr(2.3, 2.85), y = gp.y + rr(0.8, 1.15);
          emit({ p: P3(gp.x + Math.sin(a) * r, y, gp.z + Math.cos(a) * r), v: P3(Math.cos(a) * 14, 0, -Math.sin(a) * 14), size: rr(0.08, 0.13), life: rr(0.07, 0.13), color: [[2.6, 1.9, 1.1], [1.2, 0.45, 0.1]], frame: P.spark, stretch: 0.035, fadeIn: 0.01 });
        }
        // dust kicked outward at the feet
        const n = cnt(16, dt);
        for (let i = 0; i < n; i++) {
          const a = ang + rs(0.5), r = rr(1.6, 2.6);
          const x = gp.x + Math.sin(a) * r, z = gp.z + Math.cos(a) * r;
          emit({ p: P3(x, heightAt(x, z) + 0.2, z), v: P3(Math.sin(a) * 5 + Math.cos(a) * 2, rr(0.4, 1.4), Math.cos(a) * 5 - Math.sin(a) * 2), size: [0.35, 1.1], life: rr(0.4, 0.7), color: DUST, alpha: 0.4, add: 0, frame: pick([P.dust, P.smoke]), rotV: rs(2), drag: 3, fadeIn: 0.1, push: 0.4 });
        }
        if (R() < dt * 26) { const a = ang, r = 2.75; sparks(P3(gp.x + Math.sin(a) * r, gp.y + 0.95, gp.z + Math.cos(a) * r), 3, { speed: [4, 9], life: [0.15, 0.35], dir: P3(Math.sin(a), 0.2, Math.cos(a)), spread: 0.5 }); }
      });
      lights.spawn({ follow: tgt, color: [1, 0.55, 0.25], intensity: 30, distance: 5, life: dur, y: 1, prio: 1, flicker: 0.5 });
    },
    earthshatter(p, o = {}) {
      const g = ground(p), Rr = o.radius ?? 5, f = o.facing ?? 0;
      const c = add3(g, P3(0, 0.3, 0));
      flash(add3(g, P3(0, 0.8, 0)), [3, 1.6, 0.6], 2.4, 0.14);
      decals.spawn({ x: g.x, z: g.z, size: Rr * 1.45, rot: f, frame: D.crack, life: 13, color: [[2.6, 0.55, 0.06], [0.035, 0.028, 0.022]], cmid: 0.12, add: [1, 0], alpha: 1, fadeIn: 0.01, fadeOut: 0.3 });
      shockDecal(g, Rr * 1.1, [0.45, 0.25, 0.1], 0.4);
      dustRing(g, 22, { speed: [11, 17], size: [0.8, 2.4], alpha: 0.18, life: [0.8, 1.3], color: [[0.14, 0.12, 0.1], [0.1, 0.09, 0.075]] });
      debris(c, 18, { speed: [2, 8], up: 8, size: [0.14, 0.34], hot: 0.8 });
      sparks(c, 30, { speed: [5, 12], up: 0.5, life: [0.3, 0.7] });
      // rock spikes erupting in rings
      const n = 12;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * 6.283 + rs(0.2), r = rr(1.6, Rr * 0.9);
        const x = g.x + Math.sin(a) * r, z = g.z + Math.cos(a) * r, y = heightAt(x, z) - 0.05;
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rr(0.3, 0.6), a, rs(0.3), 'YXZ'));
        const sc = rr(1.0, 1.6), sx = rr(0.7, 1.3), sz = rr(0.7, 1.3), delay = (r / Rr) * 0.18, hold = rr(0.8, 1.2);
        props.rocks.add({ tick(it, d) {
          const t = it.age - delay;
          if (t < 0) { d.scale.setScalar(0.0001); return; }
          if (t > hold + 0.4) return false;
          const k = t < 0.08 ? 1 - Math.pow(1 - t / 0.08, 3) : 1;
          const sink = t > hold ? (t - hold) / 0.4 : 0;
          d.position.set(x, y - sink * 1.5 * sc, z); d.quaternion.copy(q); d.scale.set(sc * k * sx, sc * k, sc * k * sz);
        } });
        later(delay, () => { const sp = P3(x, y + 0.4, z); dustPuff(sp, 2, { size: [0.6, 1.8], alpha: 0.5 }); debris(sp, 2, { speed: [1, 3], up: 5, size: [0.1, 0.2] }); });
      }
      lights.spawn({ pos: g, color: [1, 0.55, 0.2], intensity: 170, distance: 8, life: 0.6, y: 1.2, prio: 3 });
      lights.spawn({ pos: g, color: [1, 0.3, 0.06], intensity: 18, distance: 7, life: 2.2, fadeIn: 0.3, y: 0.5, prio: 0, flicker: 0.5 });
      shake(0.7, 0.45);
    },
    charge(p, o = {}) {
      const u = o.unit, dur = o.duration ?? 0.3;
      if (!u) return;
      const anchor = new THREE.Vector3().copy(u.pos);
      const rib = ribbons.create({ follow: anchor, width: 1.1, life: 0.2, color: [[1.2, 0.6, 0.22], [0.4, 0.15, 0.04]], add: 1, alpha: 0.4, minDist: 0.2 });
      during(dur, (dt) => {
        anchor.set(u.pos.x, u.pos.y + 0.9, u.pos.z);
        const gp = ground(u.pos, 0.15);
        const n = cnt(70, dt);
        for (let i = 0; i < n; i++) emit({ p: add3(gp, P3(rs(0.4), 0, rs(0.4))), v: P3(rs(1.5), rr(0.5, 1.8), rs(1.5)), size: [0.5, 1.6], life: rr(0.5, 0.9), color: DUST, alpha: 0.5, add: 0, frame: pick([P.dust, P.smoke]), rotV: rs(1), drag: 2.5, fadeIn: 0.08, push: 0.4 });
        if (R() < dt * 10) debris(gp, 1, { speed: [1, 3], up: 3, size: [0.05, 0.1], life: [1.2, 2] });
      }, () => { rib.stop(); dustRing(u.pos, 12, { speed: [3, 6], size: [0.6, 1.8], alpha: 0.5 }); });
    },
    dust(p, o = {}) {
      const u = o.unit, dur = o.duration ?? 0.35;
      if (!u) { dustPuff(ground(p, 0.2), 5); return; }
      during(dur, (dt) => {
        const gp = ground(u.pos, 0.15);
        const n = cnt(40, dt);
        for (let i = 0; i < n; i++) emit({ p: add3(gp, P3(rs(0.3), 0, rs(0.3))), v: P3(rs(1), rr(0.4, 1.2), rs(1)), size: [0.4, 1.4], life: rr(0.5, 0.9), color: [[0.36, 0.31, 0.25], [0.22, 0.2, 0.17]], alpha: 0.55, add: 0, frame: pick([P.dust, P.smoke]), rotV: rs(1), drag: 2.5, fadeIn: 0.08, push: 0.4 });
      }, () => dustPuff(ground(u.pos, 0.2), 4, { size: [0.4, 1.4] }));
    },

    // --- Ranger ---
    arrowHit(p, o = {}) {
      sparks(p, 8, { speed: [3, 7], life: [0.12, 0.28], color: [[3.5, 3.4, 3], [1.5, 1, 0.5]], dir: o.dir ? P3(-o.dir.x * 0.5, 0.3, -o.dir.z * 0.5) : null, spread: 0.8 });
      flash(p, [3, 3, 2.6], 0.9, 0.07);
      if (o.stick && o.dir) {
        const g = ground(p), d = new THREE.Vector3(o.dir.x, -0.55, o.dir.z).normalize();
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), d);
        const tip = P3(g.x + d.x * 0.15, g.y + d.y * 0.15, g.z + d.z * 0.15);
        props.arrows.add({ tick(it, m) { if (it.age > 3.5) return false; const s = it.age > 3 ? (it.age - 3) * 1.2 : 0; m.position.set(tip.x, tip.y - s, tip.z); m.quaternion.copy(q); } });
        dustPuff(ground(p, 0.15), 2, { size: [0.3, 0.9], alpha: 0.35 });
      }
    },
    multishot(p, o = {}) {
      const f = o.facing ?? 0;
      arcs.spawn({ pos: p, yOff: 0, facing: f, span: 0.9, r0: 0.6, r1: 2.2, dur: 0.05, fade: 0.12, tail: 0.5, color: [0.35, 0.22, 0.1], hot: [0.9, 0.6, 0.3], alpha: 0.35 });
      const fw = fwdOf(f);
      flash(add3(p, fw, 0.6), [2.5, 2.8, 3.2], 1.4, 0.08);
      sparks(add3(p, fw, 0.6), 18, { speed: [5, 12], dir: fw, spread: 0.6, up: 0, color: [[3, 3.4, 4], [0.8, 1.1, 1.6]], life: [0.1, 0.25], grav: 0 });
    },
    rainTelegraph(p, o = {}) {
      const Rr = o.radius ?? 3.5, dur = o.duration ?? 1.6, g = ground(p);
      decals.spawn({ x: g.x, z: g.z, size: Rr * 2, frame: D.ash, life: dur, color: [0.05, 0.045, 0.04], add: 0, alpha: 0.35, fadeIn: 0.2, fadeOut: 0.3 });
    },
    arrowRain(p, o = {}) {
      const Rr = o.radius ?? 3, count = o.count ?? 28, dur = o.duration ?? 1.3, delay = o.delay ?? 0.25, g = ground(p);
      for (let i = 0; i < count; i++) {
        later(delay + (i / count) * dur + rs(0.03), () => {
          const a = R() * 6.283, r = Math.sqrt(R()) * Rr;
          const x = g.x + Math.sin(a) * r, z = g.z + Math.cos(a) * r, y = heightAt(x, z);
          const d = new THREE.Vector3(rs(0.15) + 0.12, -1, rs(0.15) + 0.08).normalize();
          const fall = 0.32, start = new THREE.Vector3(x - d.x * 14, y - d.y * 14, z - d.z * 14);
          const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), d);
          const cur = start.clone();
          const rib = ribbons.create({ follow: cur, width: 0.08, life: 0.05, color: [[0.6, 0.42, 0.22], [0.15, 0.1, 0.05]], add: 1, alpha: 0.45, minDist: 0.5 });
          let landed = false;
          props.arrows.add({ tick(it, m) {
            const t = Math.min(1, it.age / fall);
            if (t < 1) cur.set(start.x + (x - start.x) * t, start.y + (y + 0.25 - start.y) * t, start.z + (z - start.z) * t);
            else if (!landed) {
              landed = true; rib.stop();
              const gp = P3(x, y + 0.1, z);
              sparks(add3(gp, P3(0, 0.1, 0)), 5, { speed: [2, 6], life: [0.1, 0.25], color: [[3.5, 3.4, 3], [1.5, 1, 0.5]] });
              dustPuff(add3(gp, P3(0, 0.1, 0)), 2, { size: [0.4, 1.2], alpha: 0.4 });
              if (R() < 0.3) decals.spawn({ x, z, size: rr(0.8, 1.3), frame: D.scuff, life: 4, color: [0.12, 0.1, 0.08], add: 0, alpha: 0.6 });
            }
            if (it.age > fall + 2.2) return false;
            const s = it.age > fall + 1.8 ? (it.age - fall - 1.8) * 1.5 : 0;
            m.position.set(cur.x, cur.y - s, cur.z); m.quaternion.copy(q);
          } });
        });
      }
    },

    // --- enemies ---
    chop(p, o = {}) {
      const g = ground(p);
      flash(add3(p, P3(0, 0.2, 0)), [3.5, 2.2, 1], 2.2, 0.12);
      sparks(p, 22, { speed: [4, 11], up: 0.4, life: [0.2, 0.5] });
      dustRing(g, 12, { speed: [3, 6], size: [0.5, 1.6], alpha: 0.5, life: [0.6, 1.0] });
      debris(add3(g, P3(0, 0.2, 0)), 5, { speed: [1, 4], up: 5, size: [0.07, 0.15] });
      decals.spawn({ x: g.x, z: g.z, size: 1.8, frame: D.crack, life: 5, color: [[2, 0.8, 0.2], [0.05, 0.04, 0.03]], cmid: 0.1, add: [0.8, 0], alpha: 0.85, fadeOut: 0.3 });
      shockDecal(g, 1.4, [1.5, 1.1, 0.7], 0.25);
    },
    necroCharge(p, o = {}) { types.castGlow(p, { ...o, pal: NECRO }); },
    necroImpact(p) {
      flash(p, NECRO.core, 2.6, 0.14);
      fireball(p, 12, { pal: NECRO, speed: [1.5, 4], size: [0.6, 1.5], life: [0.35, 0.6] });
      sparks(p, 14, { speed: [3, 8], color: [NECRO.core, NECRO.mid], life: [0.2, 0.45] });
      for (let i = 0; i < 4; i++) emit({ p: add3(p, sph(0.3)), v: add3(sph(1), P3(0, 1.5, 0)), size: [0.8, 1.5], life: rr(0.5, 0.8), color: [NECRO.hot, NECRO.cool], frame: P.wisp, rotV: rs(4), drag: 2 });
      const g = ground(p);
      if (p.y - g.y < 2.5) decals.spawn({ x: g.x, z: g.z, size: 1.6, frame: D.scorch, life: 6, color: [[0.6, 3, 1], [0.03, 0.045, 0.03]], cmid: 0.15, add: [1, 0], alpha: 0.85, fadeOut: 0.3 });
      lights.spawn({ pos: p, color: NECRO.light, intensity: 60, distance: 7, life: 0.35, prio: 1 });
    },
    boltHit(p, o = {}) { types.hit(p, o); },

    // --- progression / loot (called by game.js and pickups.js) ---
    levelUp(p) {
      const g = ground(p), GOLD = { core: [4, 3.2, 1.6], hot: [4, 2.6, 0.9], mid: [1.8, 1.0, 0.25], cool: [0.4, 0.2, 0.05] };
      flash(add3(g, P3(0, 1, 0)), GOLD.core, 4, 0.25);
      decals.spawn({ x: g.x, z: g.z, size: [1.5, 3.6], sizePow: 0.3, frame: D.arcane, life: 1.0, color: GOLD.hot, add: 1, alpha: 0.45, rotV: 1.2, fadeIn: 0.02, fadeOut: 0.6 });
      shockDecal(g, 2.5, GOLD.hot, 0.4);
      arcs.spawn({ pos: g, span: Math.PI * 2, r0: 0.9, r1: 0.9, lift: 3.5, yOff: 0, spin: true, tail: 60, spinSpeed: 0, dur: 0.9, fade: 0.5, growFrom: 1.6, color: GOLD.mid, hot: GOLD.hot, alpha: 0.35 });
      during(1.0, (dt) => {
        const n = cnt(60, dt);
        for (let i = 0; i < n; i++) { const a = R() * 6.283, r = rr(0.3, 1.0); emit({ p: P3(g.x + Math.sin(a) * r, g.y + rr(0, 0.5), g.z + Math.cos(a) * r), v: P3(0, rr(2, 5), 0), size: rr(0.08, 0.16), life: rr(0.5, 0.9), color: [GOLD.core, GOLD.hot, GOLD.mid], frame: pick([P.ember, P.star]), stretch: 0.03, drag: 0.5 }); }
      });
      lights.spawn({ pos: g, color: [1, 0.8, 0.4], intensity: 90, distance: 8, life: 1.0, y: 1.5, prio: 2 });
    },
    pickup(p, o = {}) {
      const col = { health: [5, 0.6, 0.5], mana: [0.8, 1.6, 6], gold: [6, 4, 1.2] }[o.kind] || [4, 4, 4];
      const pal = { core: col, hot: scale3(col, 0.6), mid: scale3(col, 0.3) };
      for (let i = 0; i < 18; i++) { const a = R() * 6.283; emit({ p: add3(p, P3(Math.sin(a) * 0.4, 0, Math.cos(a) * 0.4)), v: P3(-Math.sin(a) * 0.6, rr(1.5, 3.5), -Math.cos(a) * 0.6), size: rr(0.08, 0.14), life: rr(0.4, 0.8), color: [pal.core, pal.mid], frame: P.ember, stretch: 0.03, drag: 1 }); }
      flash(add3(p, P3(0, 0.4, 0)), pal.hot, 1.6, 0.15);
    },

    // --- deaths ---
    death(p, o = {}) {
      const u = o.unit;
      const skel = isSkeleton(u);
      const c = add3(p, P3(0, 0.9, 0));
      if (skel) {
        for (let i = 0; i < 12; i++) emit({ p: add3(c, sph(0.4)), v: add3(sph(rr(1, 3)), P3(0, 1.5, 0)), size: rr(0.4, 0.8), life: rr(0.5, 0.9), color: [NECRO.core, NECRO.hot, NECRO.cool], frame: pick(flames), rotV: rs(3), drag: 2 });
        dustPuff(c, 5, { color: [[0.42, 0.4, 0.36], [0.25, 0.25, 0.24]], alpha: 0.45, size: [0.6, 1.8] });
      } else {
        smoke(c, 4, { size: [0.8, 2], life: [0.8, 1.2], color: [[0.08, 0.02, 0.02], [0.04, 0.03, 0.03]], alpha: 0.45, speed: 1, up: 0.6 });
        const g = ground(p);
        decals.spawn({ x: g.x + rs(0.4), z: g.z + rs(0.4), size: [0.6, 2.2], sizePow: 0.35, frame: D.blood, life: 14, color: [[0.2, 0.008, 0.008], [0.09, 0.012, 0.01]], cmid: 1, add: 0, alpha: 0.92, fadeIn: 0.02, fadeOut: 0.2 });
      }
    },
    soul(p, o = {}) {
      const u = o.unit, skel = isSkeleton(u);
      const pal = skel ? NECRO : u?.rival || u?.team === 'player' ? { core: [3, 3.6, 4.5], hot: [1.6, 2.2, 3.4], mid: [0.6, 1.0, 2.2], cool: [0.1, 0.2, 0.5] } : { core: [4, 2, 1.2], hot: [2.6, 0.8, 0.35], mid: [1.4, 0.3, 0.12], cool: [0.3, 0.05, 0.02] };
      const pos = new THREE.Vector3(p.x, p.y + 0.6, p.z);
      const vel = new THREE.Vector3(rs(0.3), 1.6, rs(0.3));
      const rib = ribbons.create({ follow: pos, width: 0.32, life: 0.35, color: [scale3(pal.hot, 0.6), pal.cool], add: 1, alpha: 0.4, minDist: 0.15 });
      during(1.6, (dt, k) => {
        vel.x += Math.sin(k * 12) * dt * 3; vel.z += Math.cos(k * 10) * dt * 3;
        pos.addScaledVector(vel, dt);
        emit({ p: pos, size: 0.9 * (1 - k * 0.5), life: 0.05, color: scale3(pal.hot, 1 - k * 0.6), frame: P.wisp, fadeIn: 0.3 });
        if (R() < dt * 30) emit({ p: add3(pos, sph(0.2)), v: sph(0.4), size: rr(0.08, 0.15), life: rr(0.3, 0.6), color: [pal.core, pal.mid], frame: P.ember });
      }, () => { rib.stop(); sparkleBurst(pos, 6, pal, 1.5); });
    },
    dissolve(p, o = {}) {
      const u = o.unit, skel = isSkeleton(u), dur = o.duration ?? 1.2;
      const pal = skel ? NECRO : FIRE;
      during(dur, (dt, k) => {
        const n = cnt(50 * (1 - k * 0.6), dt);
        for (let i = 0; i < n; i++) {
          const q = P3(p.x + rs(0.6), p.y + rr(0.05, 0.6), p.z + rs(0.6));
          emit({ p: q, v: P3(rs(0.4), rr(0.8, 2.2), rs(0.4)), size: rr(0.06, 0.12), life: rr(0.6, 1.2), color: [pal.core, pal.hot, pal.mid], frame: P.ember, drag: 1, grav: 0.4, stretch: 0.02 });
          if (R() < 0.4) emit({ p: q, v: P3(rs(0.3), rr(0.4, 1.2), rs(0.3)), size: rr(0.06, 0.12), life: rr(0.8, 1.4), color: [0.05, 0.045, 0.04], add: 0, frame: P.dust, rotV: rs(6), drag: 1, alpha: 0.6 });
        }
        if (R() < dt * 6) smoke(P3(p.x, p.y + 0.3, p.z), 1, { size: [0.6, 1.6], alpha: 0.35, speed: 0.4, up: 0.8, color: skel ? [[0.05, 0.1, 0.06], [0.04, 0.04, 0.04]] : SMOKE });
      });
      decals.spawn({ x: p.x, z: p.z, size: 1.8, frame: D.ash, life: 10, color: [0.05, 0.045, 0.04], add: 0, alpha: 0.7, fadeIn: 0.3, fadeOut: 0.3 });
    },
  };

  // ---------------------------------------------------------------- attached (anchor-following) effects
  const attachTypes = {
    fireball(anchor, o = {}) {
      const pal = o.pal || FIRE, sc = o.scale ?? 1;
      const prev = anchor.position.clone(), dir = new THREE.Vector3();
      const rib = ribbons.create({ follow: anchor, width: 0.6 * sc, life: 0.2, color: [scale3(pal.hot, 0.7), scale3(pal.cool, 0.8)], add: 1, minDist: 0.3 });
      lights.spawn({ follow: anchor, color: pal.light, intensity: 90 * sc, distance: 6, prio: 2, flicker: 0.35 });
      return (dt) => {
        const p = anchor.position;
        dir.subVectors(p, prev); const sp = dir.length() / Math.max(dt, 1e-4); dir.normalize(); prev.copy(p);
        emit({ p, size: 1.3 * sc, life: 0.07, color: scale3(pal.hot, 0.45), frame: P.glow, fadeIn: 0.3, fadeOut: 0.6 });
        emit({ p, size: 0.55 * sc, life: 0.05, color: pal.core, frame: P.glow, fadeIn: 0.3 });
        const n = cnt(140 * sc, dt);
        for (let i = 0; i < n; i++) emit({ p: add3(p, sph(0.18 * sc)), v: add3(sph(1.0), dir, -sp * rr(0.0, 0.12)), size: [rr(0.75, 1.05) * sc, 0.15], sizePow: 0.7, life: rr(0.12, 0.26), color: [pal.hot, pal.mid, pal.cool], cmid: 0.3, alpha: 0.75, frame: pick(flames), rot: rs(0.5), rotV: rs(2), drag: 3, fadeIn: 0.05 });
        const m = cnt(45, dt);
        for (let i = 0; i < m; i++) emit({ p: add3(p, sph(0.2)), v: add3(sph(2.5), dir, -rr(2, 5)), size: rr(0.06, 0.11), life: rr(0.35, 0.7), color: [pal.core, pal.hot, pal.mid], frame: P.ember, stretch: 0.03, drag: 1.5, grav: 1.5 });
        const s = cnt(10, dt);
        for (let i = 0; i < s; i++) emit({ p: add3(p, sph(0.3)), v: add3(sph(0.4), P3(0, 0.8, 0)), size: [0.8, 2.0], life: rr(0.6, 1.0), color: SMOKE, alpha: 0.16, add: 0, frame: pick(smokes), rotV: rs(1), drag: 1.5, fadeIn: 0.3, push: 0.5 });
      };
    },
    necroBolt(anchor) {
      const prev = anchor.position.clone(), dir = new THREE.Vector3();
      const rib = ribbons.create({ follow: anchor, width: 0.55, life: 0.25, color: [NECRO.hot, scale3(NECRO.cool, 0.8)], add: 1, minDist: 0.25 });
      lights.spawn({ follow: anchor, color: NECRO.light, intensity: 35, distance: 7, prio: 1, flicker: 0.3 });
      void rib;
      return (dt) => {
        const p = anchor.position;
        dir.subVectors(p, prev).normalize(); prev.copy(p);
        emit({ p, size: 0.8, life: 0.06, color: NECRO.hot, frame: P.glow, fadeIn: 0.3 });
        emit({ p, size: 0.4, life: 0.05, color: NECRO.core, frame: P.glow, fadeIn: 0.3 });
        const n = cnt(70, dt);
        for (let i = 0; i < n; i++) emit({ p: add3(p, sph(0.12)), v: add3(sph(1), dir, -rr(1, 3)), size: [0.5, 0.08], life: rr(0.18, 0.32), color: [NECRO.core, NECRO.hot, NECRO.cool], frame: pick(flames), rotV: rs(4), drag: 3 });
        if (R() < dt * 18) emit({ p, v: add3(sph(0.4), dir, -1), size: [0.4, 1.1], life: rr(0.5, 0.8), color: [[0.05, 0.02, 0.07], [0.03, 0.03, 0.03]], alpha: 0.45, add: 0, frame: P.smoke, push: 0.4 });
        if (R() < dt * 30) emit({ p: add3(p, sph(0.3)), v: sph(0.6), size: [0.5, 0.2], life: 0.4, color: [NECRO.hot, NECRO.cool], frame: P.wisp, rotV: rs(6) });
      };
    },
    arrow(anchor, o = {}) {
      const glow = o.color || [0.75, 0.5, 0.26];
      const rib = ribbons.create({ follow: anchor, width: o.width ?? 0.14, life: 0.1, color: [glow, scale3(glow, 0.2)], add: 1, alpha: 0.55, minDist: 0.4 });
      void rib;
      props.arrows.add({ tick(it, m) { if (!anchor.parent) return false; m.position.copy(anchor.position); m.quaternion.copy(anchor.quaternion); } });
      return (dt) => {
        if (R() < dt * 12) emit({ p: anchor.position, size: [0.22, 0.05], life: 0.14, color: glow, alpha: 0.5, frame: P.glow });
      };
    },
  };

  // ---------------------------------------------------------------- ambient life: dust motes and drifting embers
  const camPos = new THREE.Vector3(), camDir = new THREE.Vector3(), focus = new THREE.Vector3();
  function ambient(dt) {
    camera.getWorldPosition(camPos); camera.getWorldDirection(camDir);
    if (Math.abs(camDir.y) < 1e-3) return;
    const t = -camPos.y / camDir.y;
    focus.copy(camPos).addScaledVector(camDir, t);
    const n = cnt(22, dt);
    for (let i = 0; i < n; i++) {
      const x = focus.x + rs(22), z = focus.z + rs(15);
      emit({ p: P3(x, heightAt(x, z) + rr(0.3, 4), z), v: P3(rr(0.1, 0.4), rs(0.1), rs(0.15)), size: rr(0.05, 0.1), life: rr(5, 9), color: [0.9, 0.8, 0.6], alpha: rr(0.2, 0.5), frame: P.ember, fadeIn: 0.3, fadeOut: 0.3, drag: 0 });
    }
    if (R() < dt * 1.2) {
      const x = focus.x + rs(20), z = focus.z + rs(14);
      emit({ p: P3(x, heightAt(x, z) + rr(0.2, 1.5), z), v: P3(rr(0.1, 0.3), rr(0.3, 0.7), rs(0.2)), size: rr(0.05, 0.08), life: rr(3, 5), color: [FIRE.hot, FIRE.mid, FIRE.cool], alpha: 0.8, frame: P.ember, fadeIn: 0.2, fadeOut: 0.4 });
    }
    if (R() < dt * 0.7) {
      const x = focus.x + rs(20), z = focus.z + rs(14);
      emit({ p: P3(x, heightAt(x, z) + 0.4, z), v: P3(rr(0.2, 0.5), 0.02, rs(0.2)), size: [4, 8], life: rr(9, 14), color: [0.16, 0.17, 0.19], alpha: 0.07, add: 0, frame: pick(smokes), rotV: rs(0.1), fadeIn: 0.3, fadeOut: 0.4, push: 0.6 });
    }
  }

  // ---------------------------------------------------------------- death watcher (souls + dissolve), no game.js changes needed
  let floorWait = 0, floorFailed = false;
  const deathState = new WeakMap();
  function watchUnits() {
    const us = ctx.game?.units; if (!us) return;
    for (const u of us) {
      if (!u.dead) continue;
      let s = deathState.get(u);
      if (!s) { s = { stage: 0 }; deathState.set(u, s); types.death(u.pos, { unit: u }); }
      if (s.stage === 0 && u.deadTime > 0.9) { s.stage = 1; types.soul(u.pos, { unit: u }); }
      if (s.stage === 1 && u.deadTime > 4.6 && u !== ctx.game?.state?.player) { s.stage = 2; types.dissolve(P3(u.pos.x, u.pos.y, u.pos.z), { unit: u }); }
    }
  }

  // ---------------------------------------------------------------- public API
  return {
    spawn(type, p, o) { types[type]?.(p, o); },
    // Gameplay-facing AoE warning: red fill-up circle that completes exactly at `duration` (use for enemy/boss slams).
    telegraph(pos, radius = 3, duration = 1, opts = {}) { types.telegraph(pos, { ...opts, radius, duration }); },
    // Bind a looping effect to a moving anchor (Object3D). Ends when the anchor leaves the scene.
    attach(type, anchor, o) {
      const fn = attachTypes[type]?.(anchor, o);
      if (fn) follow(anchor, fn);
    },
    update(dt, t = 0) {
      for (let i = tasks.length - 1; i >= 0; i--) {
        const k = tasks[i];
        if (k.anchor) { if (!alive(k.anchor)) { k.end?.(); tasks.splice(i, 1); } else k.fn(dt); continue; }
        if (k.dur !== undefined) {
          k.age += dt;
          k.fn(dt, Math.min(1, k.age / k.dur), k.age);
          if (k.age >= k.dur) { tasks.splice(i, 1); k.end?.(); }
          continue;
        }
        if ((k.t -= dt) <= 0) { tasks.splice(i, 1); k.fn(); }
      }
      if (!floor.ready && !floorFailed && ctx.game?.state?.phase === 'playing' && (floorWait += dt) > 0.15) {
        try { floor.build((ctx.game.units || []).map((u) => u.actor?.root)); } catch (e) { floorFailed = true; console.warn('fx floor map unavailable', e); }
      }
      watchUnits();
      ambient(dt);
      parts.update(dt, camera);
      decals.update(dt);
      arcs.update(dt, t);
      ribbons.update(dt, t, camera);
      lights.update(dt);
      props.update(dt);
      chunks.update(dt);
    },
    stats() { return { particles: parts.count, tasks: tasks.length }; },
    palettes: { FIRE, FROST, ARCANE, NECRO },
    anchorPos,
  };
}
