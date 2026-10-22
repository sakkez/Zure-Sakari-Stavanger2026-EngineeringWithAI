// The Warlord: a boss-scale orc that enters the arena at zone stage 3+.
// Abilities: Cleave (melee chop), Ground Slam (telegraphed AoE, knockback), War Roar (summons an add pack).
// Uses KINDS.warlord from the actor pipeline if present, else falls back to orcBrute scaled up.
import * as THREE from 'three';
import { KINDS } from '../actors/assets.js';
import { rng } from './rng.js';

const SLAM_R = 4.6, SLAM_T = 1.15;

function anim(u, name, lock, speed = 1) { u.actor.play(name, { loop: false, force: true, speed }); u.lock = lock; }

export const BOSS = {
  name: 'Gharok the Warlord', hp: 1500, speed: 2.9, aggro: 34, run: 'Running_A', idle: '2H_Melee_Idle',
  abilities: {
    primary: { name: 'Cleave', cd: 2.0, range: 3.4, cast(api, u, aim) {
      anim(u, '2H_Melee_Attack_Chop', 1.0, 0.85);
      api.after(0.6, () => {
        if (u.dead) return;
        const fwd = new THREE.Vector3(Math.sin(u.facing), 0, Math.cos(u.facing));
        const c = u.pos.clone().addScaledVector(fwd, 2);
        api.fx.spawn('chop', c.clone().setY(u.pos.y + 0.3), { dir: fwd });
        api.aoe(c, 2.2, 32, u, null, { knockback: 7 });
        api.engine.shake?.(0.25, 0.2);
      });
    } },
    secondary: { name: 'Ground Slam', cd: 7.5, range: 7, cast(api, u, aim) {
      const c = aim.clone();
      const d = Math.hypot(c.x - u.pos.x, c.z - u.pos.z);
      if (d > 4) c.set(u.pos.x + (c.x - u.pos.x) / d * 4, 0, u.pos.z + (c.z - u.pos.z) / d * 4); // lands in front of him
      c.y = api.world.heightAt(c.x, c.z);
      anim(u, '2H_Melee_Attack_Spin', SLAM_T + 0.5, 0.75);
      api.state.telegraphUntil = api.state.time + SLAM_T;
      api.fx.telegraph ? api.fx.telegraph(c.clone(), SLAM_R, SLAM_T) : api.fx.spawn('meteorTelegraph', c.clone(), { radius: SLAM_R, duration: SLAM_T });
      api.after(SLAM_T, () => {
        if (u.dead) return;
        api.fx.spawn('earthshatter', c.clone(), { radius: SLAM_R });
        api.fx.spawn('explosion', c.clone().setY(c.y + 0.3), { color: new THREE.Color(1, 0.35, 0.1) });
        api.aoe(c, SLAM_R, 60, u, null, { knockback: 12 });
        api.engine.shake?.(0.8, 0.5);
        api.hitStop(0.08, 0.1);
      });
    } },
    ultimate: { name: 'War Roar', cd: 24, range: 30, cast(api, u) {
      anim(u, 'Cheer', 1.4);
      api.fx.spawn('levelUp', u.pos.clone());
      api.engine.shake?.(0.4, 0.6);
      api.after(0.7, () => {
        if (u.dead || !api.spawnPack) return;
        const a = rng() * Math.PI * 2;
        const pk = api.spawnPack(u.pos.x + Math.cos(a) * 3.5, u.pos.z + Math.sin(a) * 3.5, { size: 3 });
        if (pk && u.target) pk.target = u.target;
      });
    } },
  },
};

// Create the boss unit via game helpers. Returns the unit.
export function spawnBoss(G, x, z, opts = {}) {
  const real = !!KINDS.warlord;
  const kind = real ? 'warlord' : (KINDS.orcBrute ? 'orcBrute' : 'orc');
  const u = G.makeUnit(kind, 'mob', x, z, BOSS);
  if (!real) u.actor.root.scale.multiplyScalar(2.2 / (KINDS[kind]?.scale || 1));
  const stage = opts.stage ?? G.state.zone.stage;
  u.hp = u.maxHp = BOSS.hp * (1 + Math.max(0, stage - 3) * 0.25);
  u.boss = true; u.leader = true; u.name = BOSS.name;
  u.radius = 1.1; u.mass = 8; u.dmgMul = 1 + Math.max(0, stage - 3) * 0.15;
  u.facing = opts.facing ?? 0; u.actor.root.rotation.y = u.facing;
  u.cooldowns.ultimate = opts.roarIn ?? 8; // first roar after a while
  u.cooldowns.secondary = opts.slamIn ?? 2.5;
  G.state.boss = u;
  G.api.emit('boss', { unit: u });
  return u;
}
