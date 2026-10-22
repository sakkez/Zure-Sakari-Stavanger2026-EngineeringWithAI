// Mob definitions (orcs and skeletons). Same ability shape as classes.js. Timing uses game time (api.after).
import * as THREE from 'three';

function anim(u, name, lock, speed = 1) { u.actor.play(name, { loop: false, force: true, speed }); u.lock = lock; }
function strike(api, u, target, dmg, delay, reach = 2.2, heavy = false) {
  api.after(delay, () => {
    if (u.dead || target.dead || target.pos.distanceTo(u.pos) > reach + 0.6) return;
    api.damage(target, dmg, u);
    const d = new THREE.Vector3().subVectors(target.pos, u.pos).setY(0).normalize();
    const p = target.pos.clone().setY(target.pos.y + 1);
    if (heavy) api.fx.spawn('chop', target.pos.clone().addScaledVector(d, -0.3).setY(target.pos.y + 0.6), { dir: d });
    else api.fx.spawn('hit', p, { dir: d });
  });
}
function closest(api, u) { return api.nearestEnemy(u, 30); }

function bolt(api, u, aim, { kind, speed, dmg }) {
  const d = new THREE.Vector3(aim.x - u.pos.x, 0, aim.z - u.pos.z).normalize();
  const pos = u.pos.clone().addScaledVector(d, 0.7).setY(u.pos.y + 1.1);
  const anchor = new THREE.Object3D();
  anchor.position.copy(pos); anchor.lookAt(pos.clone().add(d));
  api.engine.scene.add(anchor);
  if (kind === 'necro') api.fx.attach('necroBolt', anchor);
  else api.fx.attach('arrow', anchor, { color: [1.4, 2.2, 1.5], width: 0.22 });
  api.spawnProjectile({ owner: u, pos, vel: d.multiplyScalar(speed), mesh: anchor, radius: 0.4,
    onHit: (p, hit) => {
      if (hit) api.damage(hit, dmg, u);
      if (kind === 'necro') api.fx.spawn('necroImpact', p.pos.clone());
      else api.fx.spawn('arrowHit', p.pos.clone(), { dir: p.vel.clone().normalize(), stick: !hit });
    } });
}

export const ENEMIES = {
  orc: { hp: 90, speed: 3.6, aggro: 22, run: 'Running_A', abilities: {
    primary: { cd: 1.6, range: 2.2, cast(api, u) { anim(u, '2H_Melee_Attack_Chop', 0.9); const t = closest(api, u); if (t) strike(api, u, t, 16, 0.5, 2.2, true); } } } },
  skeletonMinion: { hp: 40, speed: 3.8, aggro: 20, run: 'Running_A', abilities: {
    primary: { cd: 1.2, range: 1.8, cast(api, u) { anim(u, 'Unarmed_Melee_Attack_Punch_A', 0.6); const t = closest(api, u); if (t) strike(api, u, t, 7, 0.3); } } } },
  skeletonWarrior: { hp: 75, speed: 3.2, aggro: 20, run: 'Walking_D_Skeletons', abilities: {
    primary: { cd: 1.5, range: 2, cast(api, u) { anim(u, '1H_Melee_Attack_Chop', 0.8); const t = closest(api, u); if (t) strike(api, u, t, 12, 0.4); } } } },
  skeletonArcher: { hp: 45, speed: 3.4, aggro: 24, abilities: {
    primary: { cd: 2.2, range: 14, cast(api, u, aim) { anim(u, '2H_Ranged_Shoot', 0.6); api.after(0.3, () => !u.dead && bolt(api, u, aim, { kind: 'arrow', speed: 20, dmg: 9 })); } } } },
  skeletonMage: { hp: 50, speed: 3.2, aggro: 24, abilities: {
    primary: { cd: 2.6, range: 13, cast(api, u, aim) {
      anim(u, 'Spellcast_Shoot', 0.7);
      api.fx.spawn('necroCharge', u.pos, { unit: u, duration: 0.35 });
      api.after(0.35, () => !u.dead && bolt(api, u, aim, { kind: 'necro', speed: 13, dmg: 11 }));
    } } } },
};
