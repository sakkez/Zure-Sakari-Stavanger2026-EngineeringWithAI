// Playable hero classes. Each ability: { cd, mana, range (AI use), cast(api, caster, aimPoint) }.
// All timing uses game time (api.after); visuals go through api.fx (src/fx).
import * as THREE from 'three';

const up = new THREE.Vector3(0, 1, 0);

function dirTo(from, to) {
  const d = new THREE.Vector3(to.x - from.x, 0, to.z - from.z);
  return d.lengthSq() < 1e-4 ? new THREE.Vector3(0, 0, 1) : d.normalize();
}
function anim(u, name, lock, speed = 1) { u.actor.play(name, { loop: false, force: true, speed }); u.lock = lock; }
const fwdOf = (u) => new THREE.Vector3(Math.sin(u.facing), 0, Math.cos(u.facing));

// Movement dash in game time. Prefers game.js' physics-aware api.dash; falls back to api.after steps.
function dash(api, u, dir, dist, dur, opts = {}) {
  if (api.dash) return api.dash(u, dir, dist, dur, opts);
  const steps = Math.max(1, Math.round(dur * 60)), step = dist / steps;
  for (let i = 0; i < steps; i++) api.after(i / 60 + 1e-4, () => {
    if (u.dead) return;
    const nx = u.pos.x + dir.x * step, nz = u.pos.z + dir.z * step;
    for (const o of api.world.obstacles || []) if (Math.hypot(nx - o.x, nz - o.z) < o.r + u.radius) return;
    u.pos.x = nx; u.pos.z = nz;
  });
  if (opts.onEnd) api.after(dur, opts.onEnd);
  return null;
}

function melee(api, u, aim, { arc = 1.6, reach = 2.4, dmg = 20, delay = 0.25 }) {
  u.swing = -(u.swing || 1);
  const sweep = u.swing;
  api.after(delay, () => {
    if (u.dead) return;
    const fwd = fwdOf(u);
    api.fx.spawn('cleave', u.pos.clone(), { facing: u.facing, dir: sweep, reach });
    for (const o of api.enemiesOf(u)) {
      const d = new THREE.Vector3().subVectors(o.pos, u.pos); d.y = 0;
      if (d.length() < reach + o.radius && fwd.angleTo(d.normalize()) < arc / 2) {
        api.damage(o, dmg, u);
        api.fx.spawn('hit', o.pos.clone().setY(o.pos.y + 1.1), { dir: d });
      }
    }
  });
}

export const CLASSES = {
  warrior: {
    name: 'Warrior', hp: 220, speed: 5.2, idle: '2H_Melee_Idle',
    abilities: {
      primary: { name: 'Cleave', cd: 0.7, mana: 0, range: 2.4, cast(api, u, aim) { anim(u, '2H_Melee_Attack_Slice', 0.55); melee(api, u, aim, { dmg: 26 }); } },
      secondary: { name: 'Whirlwind', cd: 5, mana: 25, range: 3, cast(api, u) {
        anim(u, '2H_Melee_Attack_Spinning', 1.0);
        api.after(0.08, () => { if (!u.dead) api.fx.spawn('whirlwind', u.pos, { unit: u, duration: 0.95 }); });
        for (let i = 0; i < 4; i++) api.after(0.15 + i * 0.22, () => { if (!u.dead) api.aoe(u.pos, 3.2, 14, u); });
      } },
      ultimate: { name: 'Earthshatter', cd: 14, mana: 50, range: 4, cast(api, u) {
        anim(u, '2H_Melee_Attack_Chop', 0.9);
        api.after(0.45, () => {
          if (u.dead) return;
          api.fx.spawn('earthshatter', u.pos.clone().addScaledVector(fwdOf(u), 0.6), { radius: 5, facing: u.facing });
          api.aoe(u.pos, 5, 60, u);
        });
      } },
      dodge: { name: 'Charge', cd: 4, mana: 10, range: 0, cast(api, u, aim) {
        anim(u, 'Dodge_Forward', 0.45);
        const d = dirTo(u.pos, aim);
        u.facing = Math.atan2(d.x, d.z);
        api.fx.spawn('charge', u.pos, { unit: u, duration: 0.32 });
        dash(api, u, d, 5.6, 0.3);
      } },
    },
  },
  mage: {
    name: 'Sorceress', hp: 140, speed: 5, idle: 'Idle',
    abilities: {
      primary: { name: 'Fireball', cd: 0.55, mana: 6, range: 18, cast(api, u, aim) {
        anim(u, 'Spellcast_Shoot', 0.4);
        api.fx.spawn('castGlow', u.pos, { unit: u, duration: 0.2 });
        api.after(0.2, () => {
          if (u.dead) return;
          const d = dirTo(u.pos, aim);
          const pos = u.pos.clone().addScaledVector(d, 0.8).setY(u.pos.y + 1.3);
          const anchor = new THREE.Object3D(); anchor.position.copy(pos); api.engine.scene.add(anchor);
          api.fx.attach('fireball', anchor);
          api.spawnProjectile({ owner: u, pos, vel: d.multiplyScalar(22), mesh: anchor, radius: 0.5,
            onHit: (p) => { api.fx.spawn('explosion', p.pos.clone()); api.aoe(p.pos, 2.2, 30, u, '#ff9a3c'); } });
        });
      } },
      secondary: { name: 'Frost Nova', cd: 6, mana: 30, range: 4, cast(api, u) {
        anim(u, 'Spellcast_Raise', 0.6);
        api.fx.spawn('castGlow', u.pos, { unit: u, duration: 0.3, pal: api.fx.palettes?.FROST });
        api.after(0.3, () => {
          if (u.dead) return;
          api.fx.spawn('frostNova', u.pos.clone(), { radius: 5 });
          api.aoe(u.pos, 5, 24, u, '#9fdcff', { knockback: 2 });
          for (const o of api.enemiesOf(u)) if (o.pos.distanceTo(u.pos) < 5) {
            o.lock = Math.max(o.lock, 2);
            api.fx.spawn('freeze', o.pos, { unit: o, duration: 2 });
          }
        });
      } },
      ultimate: { name: 'Meteor', cd: 12, mana: 55, range: 16, cast(api, u, aim) {
        anim(u, 'Spellcast_Long', 0.8);
        const target = aim.clone();
        api.fx.spawn('castGlow', u.pos, { unit: u, duration: 0.6 });
        if (u === api.state.player || !api.fx.telegraph) api.fx.spawn('meteorTelegraph', target, { radius: 5, duration: 1.0 });
        else api.fx.telegraph(target, 5, 1.0); // enemy casts read as red danger zones
        api.after(0.35, () => api.fx.spawn('meteorFall', target, { duration: 0.65 }));
        api.after(1.0, () => { api.fx.spawn('meteorImpact', target, { radius: 5 }); api.aoe(target, 5, 80, u, '#ff6a2a'); });
      } },
      dodge: { name: 'Blink', cd: 3, mana: 15, range: 0, cast(api, u, aim) {
        const from = u.pos.clone();
        const d = dirTo(u.pos, aim); const dist = Math.min(8, u.pos.distanceTo(aim));
        // walk the blink line and stop before obstacles / deep water
        let ok = 0;
        for (let s = 0.5; s <= dist; s += 0.5) {
          const x = from.x + d.x * s, z = from.z + d.z * s;
          if (api.walkable && !api.walkable(x, z, u.radius)) break;
          if (!api.walkable && (api.world.obstacles || []).some((o) => Math.hypot(x - o.x, z - o.z) < o.r + u.radius)) break;
          ok = s;
        }
        u.pos.addScaledVector(d, ok);
        api.fx.spawn('blink', from, { to: u.pos.clone() });
      } },
    },
  },
  archer: {
    name: 'Ranger', hp: 160, speed: 5.6, idle: '2H_Ranged_Aiming',
    abilities: {
      primary: { name: 'Bolt', cd: 0.45, mana: 0, range: 20, cast(api, u, aim) {
        anim(u, '2H_Ranged_Shoot', 0.35, 1.4);
        api.after(0.12, () => shootBolt(api, u, dirTo(u.pos, aim), 24));
      } },
      secondary: { name: 'Multishot', cd: 4, mana: 25, range: 14, cast(api, u, aim) {
        anim(u, '2H_Ranged_Shoot', 0.45);
        api.after(0.15, () => {
          if (u.dead) return;
          const d = dirTo(u.pos, aim);
          api.fx.spawn('multishot', u.pos.clone().setY(u.pos.y + 1.1), { facing: Math.atan2(d.x, d.z) });
          for (let i = -3; i <= 3; i++) shootBolt(api, u, d.clone().applyAxisAngle(up, i * 0.12), 18);
        });
      } },
      ultimate: { name: 'Rain of Arrows', cd: 12, mana: 50, range: 16, cast(api, u, aim) {
        anim(u, '2H_Ranged_Shooting', 0.7);
        const c = aim.clone();
        if (u === api.state.player || !api.fx.telegraph) api.fx.spawn('rainTelegraph', c, { radius: 3.5, duration: 1.75 });
        else api.fx.telegraph(c, 3.5, 0.62);
        api.fx.spawn('arrowRain', c, { radius: 3.2, count: 30, duration: 1.2, delay: 0.3 });
        for (let i = 0; i < 10; i++) api.after(0.62 + i * 0.12, () => {
          const p = c.clone().add(new THREE.Vector3((Math.random() - 0.5) * 6, 0, (Math.random() - 0.5) * 6));
          api.aoe(p, 2, 12, u);
        });
      } },
      dodge: { name: 'Roll', cd: 2.5, mana: 5, range: 0, cast(api, u, aim) {
        anim(u, 'Dodge_Forward', 0.4);
        const d = dirTo(u.pos, aim);
        u.facing = Math.atan2(d.x, d.z);
        api.fx.spawn('dust', u.pos, { unit: u, duration: 0.35 });
        dash(api, u, d, 4.8, 0.35, { invuln: true });
      } },
    },
  },
};

function shootBolt(api, u, d, dmg) {
  if (u.dead) return;
  const anchor = new THREE.Object3D();
  const pos = u.pos.clone().addScaledVector(d, 0.8).setY(u.pos.y + 1.1);
  anchor.position.copy(pos);
  anchor.lookAt(pos.clone().add(d));
  api.engine.scene.add(anchor);
  api.fx.attach('arrow', anchor);
  api.spawnProjectile({ owner: u, pos, vel: d.clone().multiplyScalar(34), mesh: anchor, radius: 0.35,
    onHit: (p, hit) => {
      if (hit) { api.damage(hit, dmg, u); api.fx.spawn('arrowHit', p.pos.clone(), { dir: p.vel.clone().normalize() }); }
      else api.fx.spawn('arrowHit', p.pos.clone(), { dir: p.vel.clone().normalize(), stick: true });
    } });
}
