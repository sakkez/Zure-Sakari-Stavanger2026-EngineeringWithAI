// Mob packs: mixed orcs + skeletons around a leader, spawned across the map (not just next to the player).
// Difficulty ramps with the zone stage: bigger packs, tougher stats, more ranged/caster skeletons.
import * as THREE from 'three';
import { rng, pick } from './rng.js';
import { ENEMIES } from './enemies.js';
import { skipOverridePasses } from './zone.js';

const LEADER_NAMES = ['Gorrash the Flayer', 'Urzog Bonecrusher', 'Skarn the Rotten', 'Mortis the Hollow', 'Grukk Skullsplitter', 'Vexra the Pale', 'Draug Ironjaw', 'Kel the Unburied'];

export function createSpawner(G) {
  // G: { state, world, zone, units, makeUnit, fx, walkable }
  const { state, world, fx } = G;
  const packs = [];
  let packId = 0;
  const ringGeo = new THREE.RingGeometry(0.55, 0.85, 32).rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.35, 0.08), transparent: true, opacity: 0.55,
    blending: THREE.AdditiveBlending, depthWrite: false });

  function memberPool(stage) {
    const pool = ['orc', 'orc', 'skeletonMinion', 'skeletonMinion', 'skeletonWarrior', 'skeletonArcher'];
    if (stage >= 1) pool.push('skeletonMage', 'skeletonWarrior');
    if (stage >= 2) pool.push('orc', 'skeletonArcher', 'skeletonMage');
    return pool.filter((k) => ENEMIES[k]);
  }

  function clearAt(x, z, r) {
    if (!G.walkable(x, z, r)) return false;
    if (world.heightAt(x, z) < world.waterLevel + 0.3) return false;
    return true;
  }

  // Spawn one pack at (x,z). opts: { size, stage, leaderKind, kinds:[...], noIntro, facing }
  function spawnPack(x, z, opts = {}) {
    const stage = opts.stage ?? state.zone.stage;
    const pool = memberPool(stage);
    const size = opts.size ?? Math.min(7, 3 + stage + Math.floor(rng() * 2));
    const pack = { id: ++packId, members: [], leader: null, target: null, home: new THREE.Vector3(x, 0, z) };
    const hpMul = 1 + stage * 0.3, dmgMul = 0.75 + stage * 0.2;
    for (let i = 0; i < size; i++) {
      const isLeader = i === 0;
      const kind = opts.kinds?.[i] ?? (isLeader ? (opts.leaderKind ?? (rng() < 0.6 ? 'orc' : 'skeletonWarrior')) : pick(pool));
      const a = isLeader ? 0 : (i / (size - 1)) * Math.PI * 2 + rng() * 0.5, r = isLeader ? 0 : 1.8 + rng() * 1.4;
      let px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      if (!clearAt(px, pz, 0.5)) { px = x + (rng() - 0.5); pz = z + (rng() - 0.5); }
      const u = G.makeUnit(kind, 'mob', px, pz, ENEMIES[kind]);
      u.hp = u.maxHp = ENEMIES[kind].hp * hpMul * (isLeader ? 2.6 : 1);
      u.dmgMul = dmgMul * (isLeader ? 1.3 : 1);
      u.pack = pack; u.slot = i;
      u.facing = opts.facing ?? rng() * Math.PI * 2;
      u.actor.root.rotation.y = u.facing;
      if (isLeader) {
        u.leader = true; u.mass = 2.5; u.radius = 0.65; u.name = pick(LEADER_NAMES);
        u.actor.root.scale.multiplyScalar(1.3);
        // Elite marker: a faint ember ring at the feet (materials stay untouched; the actor pipeline owns them).
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.y = 0.06; ring.renderOrder = 3; skipOverridePasses(ring);
        u.actor.root.add(ring);
        pack.leader = u;
      }
      pack.members.push(u);
      if (!opts.noIntro) {
        fx.spawn('spawn', u.pos.clone());
        if (u.actor.clips.Spawn_Ground) { u.actor.play('Spawn_Ground', { loop: false }); u.lock = 1.2; }
      }
    }
    packs.push(pack);
    return pack;
  }

  // Find a spawn point: mostly random inside the zone, sometimes in a ring around the player.
  function findSpot(nearPlayer) {
    const p = state.player, z = state.zone;
    for (let tries = 0; tries < 30; tries++) {
      let x, zz;
      if (nearPlayer && p) {
        const a = rng() * Math.PI * 2, r = 20 + rng() * 10;
        x = p.pos.x + Math.cos(a) * r; zz = p.pos.z + Math.sin(a) * r;
      } else {
        const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * Math.max(4, z.radius - 4);
        x = z.center.x + Math.cos(a) * r; zz = z.center.z + Math.sin(a) * r;
      }
      if (Math.hypot(x, zz) > world.radius - 5) continue;
      if (G.zone.outsideDist(x, zz) > -3) continue;
      if (!clearAt(x, zz, 2)) continue;
      let ok = true;
      for (const u of G.units) {
        if (u.dead) continue;
        const d = Math.hypot(u.pos.x - x, u.pos.z - zz);
        if ((u === p && d < 17) || (u.rival && d < 10) || (u.team === 'mob' && d < 6)) { ok = false; break; }
      }
      if (ok) return { x, z: zz };
    }
    return null;
  }

  return {
    packs, spawnPack, findSpot,
    clear() { packs.length = 0; },
    initial() {
      for (let i = 0; i < 6; i++) { const s = findSpot(false); if (s) spawnPack(s.x, s.z, { noIntro: true, size: 3 + Math.floor(rng() * 2) }); }
    },
    update(dt) {
      for (let i = packs.length - 1; i >= 0; i--) {
        const pk = packs[i];
        pk.members = pk.members.filter((m) => !m.dead);
        if (!pk.members.length) { packs.splice(i, 1); continue; }
        if (!pk.leader || pk.leader.dead) pk.leader = pk.members[0]; // next in line takes over
        if (pk.target?.dead) pk.target = null;
      }
      state.spawnTimer -= dt;
      if (state.spawnTimer > 0) return;
      const stage = state.zone.stage;
      state.spawnTimer = Math.max(5, 9 - stage);
      const alive = G.units.reduce((n, u) => n + (!u.dead && u.team === 'mob' ? 1 : 0), 0);
      if (alive > 18) return; // keep <= ~25 mobs alive (draw-call budget)
      for (let n = alive < 10 ? 2 : 1; n > 0; n--) {
        const s = findSpot(rng() < 0.4);
        if (s) spawnPack(s.x, s.z);
      }
    },
  };
}
