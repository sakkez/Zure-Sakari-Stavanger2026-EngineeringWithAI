// Deterministic screenshot staging: api.stage(name, opts) clears the arena and composes a scene around the player.
//   window.__game.game.api.stage('battle')   // also: 'horde', 'rivals', 'zone', 'loot', 'boss'
// Every scene has its own landmark (tower ruins, graveyard, chapel, lake shore, rock outcrops). The anchor is chosen so
// that <10% of the action area is hidden from the camera (pines, dead trees, ruins are raycast), and the storm edge is
// kept off-screen or in a frame corner. api.visibility() reports how visible the staged units are (capture QA).
// opts: { seed, cls, autopilot, frozen=false, god=true, anchor:{x,z} }
import * as THREE from 'three';
import { rng } from './rng.js';
import * as layout from '../world/layout.js';

const polar = (deg, r) => ({ x: Math.cos((deg * Math.PI) / 180) * r, z: Math.sin((deg * Math.PI) / 180) * r });
const SITES = layout.SITES || {};
const LAKE = layout.LAKE;
const OUT = layout.OUTCROPS || [];

export function createStager(G) {
  const { state, world, zone, spawner, engine, pickups, units, cast, fx } = G;
  const ray = new THREE.Raycaster();
  let camDir = new THREE.Vector3(0, Math.sin(0.9), Math.cos(0.9));

  // Static geometry that can hide the action: trees (instanced), ruins/props. Terrain, water, sky, FX, units excluded.
  let staticOcc = null; // static world occluders, captured once at staging time (before FX/projectiles exist)
  function occluders() {
    const list = [];
    const unitObjs = new Set();
    for (const u of units) u.actor.root.traverse((c) => unitObjs.add(c));
    engine.scene.traverse((o) => {
      if (!(o.isMesh || o.isInstancedMesh) || o.isSkinnedMesh || !o.visible) return;
      if (o.name === 'terrain' || o.name === 'water' || o.name === 'mist' || o.userData.pickup) return;
      if (o.material?.transparent && !o.material.alphaTest) return;
      if (o.onBeforeRender && o.renderOrder >= 2 && o.material?.type === 'ShaderMaterial') return; // zone / beams
      const g = o.geometry; if (!g) return;
      if (!g.boundingSphere) g.computeBoundingSphere();
      if (g.boundingSphere.radius > 150) return; // sky dome
      if (!unitObjs.has(o)) list.push(o);
    });
    return list;
  }

  // Fraction of rays from sample points (x,z,h) to the camera that hit an occluder (ignoring grass-level hits).
  function occludedFraction(points, occ) {
    let hits = 0;
    const o = new THREE.Vector3();
    for (const [x, z, h] of points) {
      o.set(x, world.heightAt(x, z) + h, z);
      ray.set(o, camDir); ray.near = 1.6; ray.far = 70; // near: skip the unit's own helmet/weapon
      const hit = ray.intersectObjects(occ, false).find((i) => i.point.y > world.heightAt(i.point.x, i.point.z) + 1.0);
      if (hit) hits++;
    }
    return hits / Math.max(1, points.length);
  }

  const AREA = []; // default action area relative to the anchor (the fight happens east/north-east of the hero)
  for (const dx of [-3, 0, 3, 6]) for (const dz of [-3, 0, 2.5]) for (const h of [0.7, 1.5]) AREA.push([dx, dz, h]);

  // Search around a landmark: cheap scoring (water, obstacles, clearance) first, then raycast the best candidates.
  function findAnchor(prefer, o = {}) {
    const cands = [];
    const maxR = o.maxR ?? 14;
    for (let ring = 0; ring * 2 <= maxR; ring++) for (let k = 0; k < Math.max(1, ring * 6); k++) {
      const a = (k / Math.max(1, ring * 6)) * Math.PI * 2, r = ring * 2;
      const x = prefer.x + Math.cos(a) * r, z = prefer.z + Math.sin(a) * r;
      if (Math.hypot(x, z) > world.radius - 14) continue;
      if (!G.walkable(x, z, 1.2)) continue;
      let s = r * 0.25, bad = false;
      for (let i = 0; i < 10; i++) {
        const b = (i / 10) * Math.PI * 2;
        for (const rr of [1.5, 3.5, 6]) {
          const sx = x + Math.cos(b) * rr, sz = z + Math.sin(b) * rr;
          if (world.heightAt(sx, sz) < world.waterLevel + 0.15) { if (rr < (o.waterOk ? 3 : 4)) bad = true; else s += o.waterOk ? -0.3 : 2; }
        }
      }
      for (const ob of world.obstacles) { const d = Math.hypot(ob.x - x, ob.z - z); if (d < ob.r + (o.clear ?? 2)) bad = true; else if (d < 5) s += (5 - d) * 0.4; }
      if (!bad) cands.push({ x, z, s });
    }
    cands.sort((a, b) => a.s - b.s);
    const occ = staticOcc = occluders();
    // + the foreground strip between hero and camera: no tower/wall may stand in front of the fight
    const FORE = [[-3, 4, 0.3], [0, 4, 0.3], [3, 4, 0.3], [-4, 7, 0.3], [0, 7, 0.3], [4, 7, 0.3], [6, 3, 0.3]];
    const area = [...(o.area || AREA), ...FORE];
    // ranked: fully clear candidates first (in score order), then the least occluded ones
    const ranked = cands.slice(0, 18).map((c) => ({ ...c, f: occludedFraction(area.map(([dx, dz, h]) => [c.x + dx, c.z + dz, h]), occ) }));
    ranked.sort((a, b) => (a.f > 0.05) - (b.f > 0.05) || a.f - b.f || a.s - b.s);
    const out = ranked.map((c) => new THREE.Vector3(c.x, 0, c.z));
    return out.length ? out : [new THREE.Vector3(prefer.x, 0, prefer.z)];
  }

  // Nearest walkable spot to (x,z) so staged units never sit inside rocks or water.
  function free(x, z) {
    if (G.walkable(x, z, 0.5)) return { x, z };
    for (let r = 0.5; r < 4; r += 0.5) for (let k = 0; k < 8; k++) {
      const a = k * 0.785, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      if (G.walkable(px, pz, 0.5)) return { x: px, z: pz };
    }
    return { x, z };
  }

  function place(u, x, z, faceX, faceZ) {
    const f = free(x, z);
    u.pos.set(f.x, world.heightAt(f.x, f.z), f.z);
    if (faceX !== undefined) u.facing = Math.atan2(faceX - f.x, faceZ - f.z);
    u.actor.root.rotation.y = u.facing;
  }
  const at = (A, dx, dz) => ({ x: A.x + dx, z: A.z + dz });

  function corpse(kind, x, z, anim = 'Death_A') {
    const f = free(x, z);
    const u = G.api.spawnUnit(kind, 'mob', f.x, f.z);
    u.facing = rng() * Math.PI * 2; u.actor.root.rotation.y = u.facing;
    u.dead = true; u.hp = 0; u.deadTime = -30; // lingers for the shot
    u.actor.play(anim, { loop: false, force: true });
    u.actor.update(3);
    fx?.spawn('death', u.pos.clone(), { unit: u }); // blood / bone decal under the body
    return u;
  }

  function loot(kind, x, z, value) {
    const f = free(x, z);
    const p = pickups.spawn(kind, { x: f.x, y: 0, z: f.z }, value);
    p.pos.set(f.x, 0, f.z); p.landed = true; p.vel.set(0, 0, 0);
    p.y = world.heightAt(f.x, f.z); p.beamT = 1;
    return p;
  }

  // Old battle damage on the ground: scorch / blood marks (decals live ~10s, particles die during warm-up).
  function scars(A, pts) {
    for (const [dx, dz, type] of pts) {
      const x = A.x + dx, z = A.z + dz;
      fx?.spawn(type, new THREE.Vector3(x, world.heightAt(x, z) + 0.3, z), {});
    }
  }

  // Zone layout: the storm edge sits `dist` m from the anchor in direction `dir` (deg, 0=east, 90=south/toward camera,
  // 225=north-west corner). dist ~24 puts it in a frame corner; >= 34 keeps it off-screen. Realistic timer.
  function frameZone(A, R, stage, dir = 225, dist = 24, timer = 45) {
    const e = polar(dir, 1);
    if (dist >= R) R = dist; // off-screen: centre the circle on the action
    const center = new THREE.Vector3(A.x - e.x * (R - dist), 0, A.z - e.z * (R - dist));
    // next circle: smaller, drawn faintly, contains the anchor
    const nr = Math.min(R * 0.8, R - 3), nc = new THREE.Vector3(A.x + (center.x - A.x) * 0.15, 0, A.z + (center.z - A.z) * 0.15);
    zone.set({ center, radius: R, stage, timer, next: { center: nc, radius: nr } });
  }

  function packAt(kinds, spots, A, faceTo, opts = {}) {
    const pk = spawner.spawnPack(A.x, A.z, { kinds, size: kinds.length, noIntro: true, stage: opts.stage ?? 1 });
    pk.members.forEach((m, i) => {
      const s = spots[i]; place(m, s.x, s.z, faceTo.x, faceTo.z);
      m.cooldowns.primary = 0.2 + ((i * 0.37) % 1.3); // de-sync attack swings
      m.think = (i * 0.13) % 0.4;
    });
    return pk;
  }

  const scenes = {
    // Tower ruins: the hero fights a mixed pack; a rival joins from the west. The first kill spills loot.
    battle: {
      site: () => SITES.tower ? at(SITES.tower, 3, 10) : polar(8, 18),
      opts: { area: [[0, 0, 0.7], [0, 0, 1.5], [3, -1, 1], [6, -2, 1], [8, -1, 1], [11, -2, 1], [-8, -2.5, 1], [-4, 2, 0.7], [4, 3, 0.7], [2, -3, 1]] },
      build(A, p) {
        frameZone(A, 30, 2, 225, 25);
        place(p, A.x, A.z, A.x + 5, A.z - 1.5);
        const melee = p.kind === 'warrior';
        const c = melee ? at(A, 2.6, -0.6) : at(A, 6.2, -1.6);
        const pk = packAt(['orc', 'skeletonWarrior', 'orc', 'skeletonMinion', 'skeletonWarrior', 'skeletonMage'], [
          at(c, 0, 0), at(c, -0.6, -2.4), at(c, 1.2, 2.1), at(c, -2.0, 1.8), at(c, 2.3, -1.6), at(c, 5, -0.6),
        ], A, p.pos);
        pk.target = p;
        const dying = pk.members[3];
        dying.hp = 1; dying.forceDrop = ['health', 'gold']; // the first kill spills loot into the shot
        const r = G.spawnRival(1, A.x - 8, A.z - 2.5, p.kind === 'mage' ? 'archer' : 'mage');
        place(r, r.pos.x, r.pos.z, c.x, c.z);
        r.huntAt = 1e9; r.target = pk.members[0];
        corpse('skeletonMinion', A.x - 2.6, A.z + 2.4);
        corpse('orc', A.x + 3.4, A.z + 3.4, 'Death_B');
        scars(A, [[3.0, 2.6, 'explosion'], [-2.2, 1.6, 'blood'], [1.2, -2.8, 'blood']]);
        loot('gold', A.x - 1.6, A.z + 3.2, 28); loot('health', A.x + 4.6, A.z + 2.6); loot('relic', A.x - 3.8, A.z + 1.2);
        return { aim: pk.members[0].pos, slot: 'primary' };
      },
    },
    // Graveyard: a wide, readable ring of the dead closing on the hero.
    horde: {
      site: () => SITES.graveyard ? at(SITES.graveyard, 2, 4) : polar(131, 24),
      opts: { area: [[0, 0, 1.2], [0, 0, 0.6], [-4, -3, 1], [4, -3, 1], [-5, 2, 1], [5, 2, 1], [0, -5, 1], [0, 4, 1], [-7, -1, 1], [7, -1, 1]] },
      build(A, p) {
        frameZone(A, 32, 3, 220, 36);
        place(p, A.x, A.z, A.x + 1, A.z - 3);
        const kinds = [], spots = [];
        const pool = ['skeletonMinion', 'skeletonWarrior', 'orc', 'skeletonMinion', 'skeletonArcher', 'skeletonWarrior', 'orc', 'skeletonMage'];
        for (let i = 0; i < 14; i++) {
          const ring = i < 6 ? 3.0 : i < 11 ? 5.8 : 8.6;
          const n = i < 6 ? 6 : i < 11 ? 5 : 3, k = i < 6 ? i : i < 11 ? i - 6 : i - 11;
          const a = (k / n) * Math.PI * 2 + ring * 0.7 + (rng() - 0.5) * 0.3;
          kinds.push(i === 0 ? 'orc' : pool[i % pool.length]);
          spots.push(at(A, Math.sin(a) * ring, Math.cos(a) * ring));
        }
        const hp = packAt(kinds, spots, A, p.pos, { stage: 2 });
        hp.target = p;
        // only the inner ring engages; the outer rings close in slowly so the crowd reads as individuals
        state.maxEngaged = 4;
        // inner ring fights; outer melee close in slowly; ranged skeletons in the outer rings shoot (arrows in the air)
        hp.members.forEach((m, i) => { m.target = p; if (i >= 6 && (m.stats.abilities.primary.range || 0) < 6) m.hold = i < 11 ? 1.6 + (i % 3) * 0.3 : 3; });
        corpse('skeletonWarrior', A.x - 3.8, A.z + 2.6, 'Death_B'); corpse('skeletonMinion', A.x + 4.2, A.z + 1.4);
        scars(A, [[-1.5, 1.8, 'explosion'], [2.4, -1.2, 'blood']]);
        loot('gold', A.x - 4.4, A.z + 3.8, 30);
        return { aim: new THREE.Vector3(A.x + 1, 0, A.z - 2), slot: p.kind === 'archer' ? 'ultimate' : 'secondary' };
      },
    },
    // Chapel ruins: a one-on-one duel with a rival hero on open ground.
    rivals: {
      site: () => SITES.chapel ? at(SITES.chapel, 0, 6) : polar(275, 22),
      build(A, p) {
        frameZone(A, 30, 3, 300, 36);
        place(p, A.x - 2.5, A.z + 0.8, A.x + 3.5, A.z - 1.4);
        const kind = p.kind === 'warrior' ? 'mage' : 'warrior';
        const r = G.spawnRival(0, A.x + 4.5, A.z - 2.2, kind);
        place(r, r.pos.x, r.pos.z, p.pos.x, p.pos.z);
        r.huntAt = 0; r.target = p; r.hp = r.maxHp * 0.7;
        corpse('skeletonWarrior', A.x + 0.6, A.z + 3.4); corpse('orc', A.x - 5.5, A.z - 2.5, 'Death_B');
        scars(A, [[0.8, -0.4, 'explosion'], [-1.2, 2.2, 'blood']]);
        loot('health', A.x - 4.6, A.z + 2.8);
        if (kind !== 'warrior') G.cast(r, 'primary', p.pos.clone());
        r.cooldowns.dodge = 3; // no opening charge: keep the two silhouettes apart for the shot
        return { aim: r.pos, slot: 'primary' };
      },
    },
    // Lake shore: the storm closes across the water (the one scene where the edge is the subject, kept to a corner).
    zone: {
      site: () => LAKE ? { x: LAKE.x - LAKE.ux * 16, z: LAKE.z - LAKE.uz * 16 + 4 } : { x: 10, z: 12 },
      opts: { waterOk: true },
      build(A, p) {
        frameZone(A, 22, 4, 300, 15);
        place(p, A.x, A.z, A.x + 2, A.z - 4);
        const pk = packAt(['orc', 'skeletonMinion', 'skeletonWarrior', 'skeletonArcher'], [at(A, 4, -4), at(A, 6, -2.4), at(A, 2.6, -5.6), at(A, 7.4, -5.2)], A, p.pos);
        pk.target = p;
        corpse('skeletonMinion', A.x - 2, A.z + 2.2);
        scars(A, [[-1.5, -1.5, 'explosion']]);
        return { aim: pk.members[0].pos, slot: 'primary' };
      },
    },
    // South-west outcrop after a fight: corpses and a spread of loot covering every rarity tier.
    loot: {
      site: () => OUT[0] ? at(OUT[0], 6, 7) : polar(203, 24),
      opts: { area: [[0, 0, 0.8], [2, 0, 0.5], [4, -1, 0.5], [1, 2, 0.5], [3, 2, 0.5], [-1, -2, 0.5], [5, 1, 0.5], [0, 3, 0.5]] },
      build(A, p) {
        frameZone(A, 32, 1, 225, 36);
        place(p, A.x - 2.5, A.z + 1.5, A.x + 2, A.z);
        const bodies = [[1.5, -1.5, 'orc'], [3.2, 0.8, 'skeletonWarrior'], [0.2, 2.6, 'orc'], [4.4, -2.4, 'skeletonMinion'], [-1.4, -2.2, 'skeletonWarrior']];
        bodies.forEach(([dx, dz, k], i) => corpse(k, A.x + dx, A.z + dz, i % 2 ? 'Death_A' : 'Death_B'));
        scars(A, [[4.5, -3.5, 'explosion'], [0.5, -1.2, 'blood'], [3.6, 1.6, 'blood']]); // smoke kept clear of the relic
        const drops = [['relic', 1.6, 1.4], ['gold', 1.0, -0.6, 34], ['health', 3.0, -1.8], ['gold', 4.0, 1.0, 12], ['mana', 1.2, 1.8], ['gold', 0.4, 3.6, 22], ['health', 5.2, -0.6], ['gold', 5.4, 2.2, 8], ['gold', -0.6, -3.2, 16]];
        for (const [k, dx, dz, v] of drops) loot(k, A.x + dx, A.z + dz, v);
        return { manual: true }; // hero stands over the spoils instead of wandering off on autopilot
      },
    },
    // South-east outcrop: the Warlord, boss-scale, slamming the ground while his adds close in.
    boss: {
      site: () => OUT[1] ? at(OUT[1], -6, -7) : polar(345, 28),
      opts: { area: [[0, 0, 1.2], [0, 0, 0.6], [4.5, -2.5, 1.5], [4.5, -2.5, 3], [6, -1, 1.5], [2, -4, 1], [-2, 2, 1], [7, 1, 1]] },
      build(A, p) {
        frameZone(A, 34, 4, 225, 38);
        // Hero at the anchor; the Warlord 4.5m to the north-east, winding up a ground slam whose red telegraph is
        // ~70% filled at capture; two adds engage the hero from the west while a third flanks.
        place(p, A.x, A.z + 1, A.x + 3.2, A.z - 2.2);
        const b = G.api.spawnBoss(A.x + 3.4, A.z - 2.2, { stage: 4, slamIn: 9, roarIn: 30 });
        place(b, A.x + 3.4, A.z - 2.2, p.pos.x, p.pos.z);
        b.target = p; b.hold = 0.6;
        G.api.after(0.65, () => {
          if (b.dead) return;
          b.hold = 0; b.lock = 0; b.cooldowns.secondary = 0;
          G.cast(b, 'secondary', new THREE.Vector3(p.pos.x + 0.8, 0, p.pos.z - 0.6));
        });
        const pk = packAt(['orc', 'skeletonWarrior', 'skeletonMinion'], [at(A, -1.9, 0.4), at(A, -1.2, -1.4), at(A, 5.5, 1.2)], A, p.pos, { stage: 3 });
        pk.target = p;
        corpse('orc', A.x - 2.4, A.z + 3); corpse('skeletonWarrior', A.x + 2.4, A.z + 3.6, 'Death_B');
        scars(A, [[3, -0.5, 'explosion'], [-1.8, 2.4, 'blood'], [1.4, 1.6, 'blood']]);
        loot('gold', A.x - 3.6, A.z + 2.2, 26);
        return { aim: pk.members[0].pos, slot: 'primary' };
      },
    },
  };

  // How much of the staged action the camera can see (for capture QA). Returns { player, occluded }.
  // Strict QA: rays from several heights and lateral offsets per key unit, plus the ground just in front of the hero.
  function unitPts(u, big) {
    const hs = big ? [1.0, 2.4, 3.8] : [0.4, 1.0, 1.6];
    const pts = [];
    for (const h of hs) for (const dx of [-0.4, 0, 0.4]) pts.push([u.pos.x + dx, u.pos.z, h]);
    return pts;
  }
  function visibility() {
    const occ = staticOcc || occluders();
    const live = units.filter((u) => !u.dead);
    const p = state.player, b = live.find((u) => u.boss);
    const pf = p ? occludedFraction([...unitPts(p), [p.pos.x, p.pos.z + 2, 0.3], [p.pos.x - 2, p.pos.z + 3, 0.3], [p.pos.x + 2, p.pos.z + 3, 0.3]], occ) : 1;
    const bf = b ? occludedFraction(unitPts(b, true), occ) : 0;
    const f = occludedFraction(live.flatMap((u) => [[u.pos.x, u.pos.z, 0.6], [u.pos.x, u.pos.z, 1.4]]), occ);
    const ok = pf <= 0.1 && bf <= 0.1 && f <= 0.1;
    return { ok, player: pf <= 0.1, playerOccluded: +pf.toFixed(2), boss: b ? bf <= 0.1 : null, bossOccluded: +bf.toFixed(2), occluded: +f.toFixed(2), units: live.length };
  }

  return {
    names: Object.keys(scenes),
    visibility,
    stage(name = 'battle', opts = {}) {
      const sc = scenes[name] || scenes.battle;
      G.seedRng(opts.seed ?? 4242);
      const cls = opts.cls || state.player?.kind || 'warrior';
      // Camera offset direction (camera sits south of and above the player).
      const cd = engine.camera.position.clone().sub(state.player ? state.player.pos : new THREE.Vector3());
      if (cd.y > 5) camDir = cd.normalize();
      engine.scene.updateMatrixWorld(true);
      G.resetWorld();
      state.maxEngaged = undefined;
      const cands = findAnchor(opts.anchor || sc.site(), sc.opts || {});
      // Build at the best anchor, verify the composition is unobstructed, else rebuild at the next candidate.
      let A, p, r, vis;
      for (let i = 0; i < Math.min(6, cands.length); i++) {
        if (i > 0) G.resetWorld();
        G.seedRng(opts.seed ?? 4242);
        A = cands[i];
        p = G.spawnPlayer(cls, A.x, A.z);
        p.level = opts.level ?? 6; p.xp = 310; p.xpNext = 680; p.gold = opts.gold ?? 1240; // a mid-match hero, not a fresh spawn
        p.maxHp = Math.round(p.maxHp * 1.35); p.hp = p.maxHp;
        state.kills = opts.kills ?? 23;
        r = sc.build(A, p);
        vis = visibility();
        if (vis.ok || opts.anchor) break;
      }
      state.phase = 'staged';
      state.autopilot = opts.autopilot ?? !r?.manual;
      state.frozen = !!opts.frozen;
      state.godMode = opts.god ?? true; // keep the hero standing (and the HP orb full) for screenshots
      state.spawnTimer = 9999;
      state.rivalsLeft = Math.max(2, units.filter((u) => u.rival && !u.dead).length);
      engine.follow(p.actor.root);
      if (r?.aim && !opts.frozen) cast(p, r.slot, r.aim.clone ? r.aim.clone() : new THREE.Vector3(r.aim.x, 0, r.aim.z));
      // Money shot: the hero fires a signature ability just before the standard capture moment (~1.35-1.5s),
      // so every combat frame has a visible ability or impact on the hero.
      if (!r?.manual && !opts.frozen && opts.money !== false) {
        G.api.after(opts.moneyAt ?? 1.15, () => {
          if (p.dead) return;
          const t = G.api.nearestEnemy(p, 14);
          if (!t) return;
          const slot = p.kind === 'warrior' ? 'secondary' : p.kind === 'archer' ? 'secondary' : (Math.hypot(t.pos.x - p.pos.x, t.pos.z - p.pos.z) < 4.5 ? 'secondary' : 'primary');
          p.cooldowns[slot] = 0; p.mana = p.maxMana; p.lock = 0; p.dash = null;
          cast(p, slot, t.pos.clone());
        });
      }
      zone.visuals(0, state.time);
      // Let HUD banners (match start / stage change) expire so they don't cover the shot.
      for (let i = 0; i < 4; i++) G.ctx?.ui?.update?.(6, state.time);
      return { anchor: A, units: units.length, vis };
    },
  };
}
