// Gameplay: player, rival heroes, mob packs, the shrinking zone, combat resolution and movement physics.
// Submodules (all under src/game/): ai.js (brains), spawner.js (mob packs), zone.js (zone logic + visuals),
// pickups.js (loot), stage.js (deterministic screenshot scenes), rng.js (seeded RNG).
//
// api (handed to classes.js / enemies.js ability code; only ever ADD to it, keep old fields working):
//   THREE, fx, world, engine, units, projectiles, state, damage(target, amount, source, color, opts),
//   enemiesOf(u), nearestEnemy(u, range), after(seconds, fn), spawnProjectile(p), aoe(center, r, amount, source, color, opts)
//   dash(unit, dir, distance, duration, opts)  -> obstacle/water-aware dash (opts: { invuln, onEnd, onStep })
//   knockback(unit, fromPosOrDir, force)       -> push a unit (velocity impulse, decays, collides)
//   hitStop(seconds, scale)                    -> brief game-time slow-mo for heavy impacts
//   walkable(x, z, r), rng(), on(evt, fn), emit(evt, data), stage(name), spawnPack(x, z, opts), spawnUnit(kind, team, x, z)
// Events (api.on): 'damage', 'kill', 'eliminated', 'levelup', 'pickup', 'zone', 'phase'
import * as THREE from 'three';
import { CLASSES } from './classes.js';
import { ENEMIES } from './enemies.js';
import { rng, seed as seedRng } from './rng.js';
import { createZone } from './zone.js';
import { createPickups } from './pickups.js';
import { createAI } from './ai.js';
import { createSpawner } from './spawner.js';
import { createStager } from './stage.js';
import { spawnBoss } from './boss.js';

const tmp = new THREE.Vector3();
const DEEP = 0.35; // water deeper than this (below world.waterLevel) blocks walking
const RIVAL_NAMES = ['Kael the Ashen', 'Sorrow-Eyed Ilsa', 'Brannoch Grimhelm', 'Veyra Nightbloom', 'Old Thorne', 'Mirela of the Pyre'];

export function createGame(ctx) {
  const { engine, world, fx, assets, input } = ctx;
  const { scene, camera } = engine;
  const units = [];      // every combatant (player, rivals, mobs); dead ones linger ~6s
  const projectiles = [];
  const raycaster = new THREE.Raycaster();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const state = {
    phase: 'menu', player: null, kills: 0, time: 0, rivalsLeft: 5, rivals: [], eliminated: [],
    zone: {}, spawnTimer: 10, timeScale: 1,
  };
  const timers = []; // game-time timers so ?shot=1 stepping stays deterministic
  const listeners = {};
  const events = {
    on(e, fn) { (listeners[e] ||= []).push(fn); return () => { listeners[e] = listeners[e].filter((f) => f !== fn); }; },
    emit(e, d) { const l = listeners[e]; if (l) for (const f of l) { try { f(d); } catch (err) { console.warn(err); } } },
  };
  let hitStop = { t: 0, scale: 1 }, lastHitStop = -1;

  function makeUnit(kind, team, x, z, stats) {
    const actor = assets.createActor(kind);
    actor.setTeam?.(team); // [characters hook] team ground ring (player gold, rivals red)
    actor.root.position.set(x, world.heightAt(x, z), z);
    scene.add(actor.root);
    actor.play(stats.idle || 'Idle');
    const u = {
      kind, team, actor, pos: actor.root.position, facing: 0,
      hp: stats.hp, maxHp: stats.hp, mana: 100, maxMana: 100, speed: stats.speed, radius: 0.5,
      stats, cooldowns: {}, lock: 0, dead: false, deadTime: 0, target: null, ai: stats.ai || null, hitFlash: 0,
      vel: new THREE.Vector3(), kb: new THREE.Vector3(), mass: kind === 'orc' ? 1.4 : kind.startsWith('skeleton') ? 0.85 : 1.2,
      dmgMul: 1, dash: null, invuln: 0, lastHurt: -99, lastAttacker: null, kills: 0, gold: 0, id: units.length + Math.floor(rng() * 1e6),
    };
    units.push(u);
    return u;
  }

  function removeUnit(u) {
    scene.remove(u.actor.root);
    u.removed = true; u.dead = true;
  }

  // ---------------- Movement physics ----------------
  function walkable(x, z, r = 0.5) {
    if (Math.hypot(x, z) > world.radius + 2) return false;
    if (world.heightAt(x, z) < world.waterLevel - DEEP) return false;
    for (const o of world.obstacles) {
      const dx = x - o.x, dz = z - o.z, rr = o.r + r;
      if (dx * dx + dz * dz < rr * rr) return false;
    }
    return true;
  }

  // Try to displace a unit by (dx,dz); slides along blockers. Returns the fraction actually moved (0..1).
  const SLIDE = [0, 0.6, -0.6, 1.2, -1.2];
  function step(u, dx, dz, preferSide = 0) {
    const len = Math.hypot(dx, dz);
    if (len < 1e-6) return 0;
    for (let i = 0; i < SLIDE.length; i++) {
      let a = SLIDE[i];
      if (preferSide && i > 0) a = Math.abs(a) * preferSide * (i % 2 ? 1 : -1);
      const c = Math.cos(a), s = Math.sin(a);
      const k = i === 0 ? 1 : Math.cos(a) * 0.9;
      const nx = u.pos.x + (dx * c - dz * s) * k, nz = u.pos.z + (dx * s + dz * c) * k;
      if (walkable(nx, nz, u.radius)) {
        if (i > 0) u.slideSide = Math.sign(a);
        u.pos.x = nx; u.pos.z = nz; return k;
      }
    }
    // Already inside something (e.g. pushed in by an ability): allow moves that increase clearance.
    return 0;
  }

  // Steer around obstacles ahead (simple whisker avoidance) and move. opts: { noFace }
  function move(u, dir, dt, opts = {}) {
    if (dir.lengthSq() < 1e-4) return false;
    tmp.copy(dir).setY(0).normalize();
    const look = 2.2;
    let ax = 0, az = 0;
    for (const o of world.obstacles) {
      const ox = o.x - u.pos.x, oz = o.z - u.pos.z;
      const along = ox * tmp.x + oz * tmp.z;
      if (along < 0 || along > look + o.r) continue;
      const lat = ox * tmp.z - oz * tmp.x; // offset along perp = (tmp.z, -tmp.x)
      const clear = o.r + u.radius + 0.3;
      if (Math.abs(lat) > clear) continue;
      const push = (1 - along / (look + o.r)) * 1.4;
      const side = lat === 0 ? (u.slideSide || 1) : -Math.sign(lat);
      ax += tmp.z * side * push; az += -tmp.x * side * push;
    }
    tmp.x += ax; tmp.z += az;
    tmp.normalize();
    const sp = u.speed * (u.slow ? 0.5 : 1) * dt;
    const moved = step(u, tmp.x * sp, tmp.z * sp, u.slideSide || 0);
    if (!opts.noFace) u.facing = Math.atan2(tmp.x, tmp.z);
    return moved > 0;
  }

  function face(u, pos) { u.facing = Math.atan2(pos.x - u.pos.x, pos.z - u.pos.z); }
  function play(u, name) { u.actor.play(name); }

  function cast(u, slot, aim) {
    const ab = u.stats.abilities[slot];
    if (!ab || (u.cooldowns[slot] || 0) > 0 || u.mana < (ab.mana || 0)) return false;
    u.cooldowns[slot] = ab.cd * (u.stats.cdScale || 1); u.mana -= ab.mana || 0;
    if (slot !== 'dodge') face(u, aim);
    ab.cast(api, u, aim);
    state.lastCast = { t: state.time, unit: u, slot };
    return true;
  }

  // ---------------- Combat ----------------
  function doHitStop(seconds = 0.06, scale = 0.08) {
    if (state.time - lastHitStop < 0.18) return;
    lastHitStop = state.time;
    hitStop = { t: Math.max(hitStop.t, seconds), scale: Math.min(hitStop.scale === 1 ? scale : hitStop.scale, scale) };
  }

  // Push u away from a world position `from` with an impulse (m/s), scaled by mass.
  function knockback(u, from, force) {
    if (u.dead || !force) return;
    const dx = u.pos.x - from.x, dz = u.pos.z - from.z;
    const l = Math.hypot(dx, dz);
    const f = force / (u.mass || 1);
    if (l < 1e-3) { u.kb.x += Math.sin(u.facing + Math.PI) * f; u.kb.z += Math.cos(u.facing + Math.PI) * f; return; }
    u.kb.x += (dx / l) * f; u.kb.z += (dz / l) * f;
  }

  function nearPlayer(pos, r = 32) { const p = state.player; return p && Math.hypot(p.pos.x - pos.x, p.pos.z - pos.z) < r; }

  function damage(target, amount, source, color, opts = {}) {
    if (!target || target.dead || target.invuln > 0) return;
    amount *= source?.dmgMul ?? 1;
    if (target === state.player && state.godMode) return;
    // Rival heroes shrug off trash mobs (they should mostly fall to heroes and the storm, not to skeletons).
    if (target.rival && source?.team === 'mob') amount *= 0.45;
    target.hp -= amount;
    target.hitFlash = 0.15;
    // Secondary AoE victims skip the flash/hit-react so a whole pack never strobes in unison.
    if (!opts.quiet) target.actor.flash?.(0.12, target === state.player ? 0xff3020 : 0xffffff);
    target.lastHurt = state.time;
    if (source && source !== target) target.lastAttacker = source;
    const p = state.player;
    if (nearPlayer(target.pos)) {
      const col = source === p ? (color || '#ffd27a') : target === p ? '#ff5050' : '#b8a898';
      ctx.ui.damageNumber(target.pos, Math.round(amount), col);
      fx.spawn('blood', tmp.copy(target.pos).setY(target.pos.y + 1));
    }
    // Knockback away from the impact point (explosion center or attacker).
    const from = opts.from || source?.pos;
    if (from) {
      const force = opts.knockback ?? Math.min(7, amount * 0.16);
      knockback(target, from, force * (target === p ? 0.5 : 1));
    }
    if ((source === p || target === p) && amount >= 24) { doHitStop(0.05 + Math.min(0.05, amount / 1500)); if (source === p) engine.shake(0.15, 0.12); }
    state.lastHitT = state.time;
    events.emit('damage', { target, amount, source });
    if (target.hp <= 0) kill(target, source);
    else if (!opts.quiet && target.lock <= 0 && target !== p && !target.dash && amount >= target.maxHp * 0.06) {
      target.actor.play(rng() < 0.5 ? 'Hit_A' : 'Hit_B', { loop: false, force: true });
      target.lock = 0.3;
    }
  }

  function xpValue(u) {
    const base = u.boss ? 400 : u.rival ? 120 : u.leader ? 30 : u.kind === 'skeletonMinion' ? 5 : u.kind === 'orc' ? 10 : 8;
    return Math.round(base * (1 + state.zone.stage * 0.25));
  }
  const xpToNext = (lvl) => Math.round(50 * Math.pow(lvl, 1.45));

  function gainXP(u, n) {
    u.xp += n;
    while (u.xp >= u.xpNext) {
      u.xp -= u.xpNext; u.level++; u.xpNext = xpToNext(u.level);
      u.maxHp = Math.round(u.maxHp * 1.08); u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.3);
      u.maxMana += 5; u.mana = u.maxMana; u.dmgMul *= 1.06;
      fx.spawn('levelUp', u.pos.clone());
      fx.spawn('hit', u.pos.clone().setY(u.pos.y + 1.2), { color: new THREE.Color(1, 0.85, 0.4) });
      ctx.ui.damageNumber(u.pos, `LEVEL ${u.level}`, '#ffe08a');
      events.emit('levelup', { unit: u, level: u.level });
    }
  }

  function kill(u, source) {
    u.dead = true; u.hp = 0; u.dash = null; u.kb.set(0, 0, 0);
    u.actor.play(rng() < 0.5 ? 'Death_A' : 'Death_B', { loop: false, force: true });
    if (nearPlayer(u.pos, 40)) fx.spawn('death', u.pos.clone(), { unit: u });
    const p = state.player;
    if (source && !source.dead) {
      source.kills = (source.kills || 0) + 1;
      if (source === p) { state.kills++; gainXP(p, xpValue(u)); }
      else if (source.rival) { source.maxHp += u.rival ? 25 : 2; source.hp = Math.min(source.maxHp, source.hp + (u.rival ? 60 : 4)); }
    }
    if (u.team !== 'player') pickups.drop(u);
    if (source === p) { doHitStop(u.rival || u.leader ? 0.12 : 0.07, 0.05); if (u.rival || u.boss) engine.shake(0.5, 0.35); }
    if (u.boss) state.boss = null;
    events.emit('kill', { unit: u, source });
    if (u.rival) {
      state.eliminated.push({ name: u.name, kind: u.kind, by: source === p ? 'you' : source?.name || source?.kind || 'the storm', time: state.time });
      events.emit('eliminated', { unit: u, source });
    }
    if (u === p && state.phase === 'playing') { state.phase = 'dead'; events.emit('phase', 'dead'); ctx.ui.showEnd(false, state); }
  }

  function enemiesOf(u) { return units.filter((o) => !o.dead && o.team !== u.team); }
  function nearestEnemy(u, range = Infinity) {
    let best = null, bd = range;
    for (const o of units) {
      if (o.dead || o.team === u.team) continue;
      const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  // API handed to class/enemy ability code.
  const api = {
    THREE, fx, world, engine, units, projectiles, damage, enemiesOf, nearestEnemy, state,
    after(seconds, fn) { timers.push({ t: seconds, fn }); },
    spawnProjectile(p) { projectiles.push({ life: 3, ...p }); },
    aoe(center, radius, amount, source, color, opts = {}) {
      const hit = enemiesOf(source).map((o) => [o, Math.hypot(o.pos.x - center.x, o.pos.z - center.z)])
        .filter(([o, d]) => d < radius + o.radius).sort((x, y) => x[1] - y[1]);
      hit.forEach(([o], i) => damage(o, amount, source, color, { from: center, quiet: i >= 1 && (i + Math.floor(state.time * 10)) % 3 !== 0, ...opts }));
    },
    // Obstacle/water-aware dash. dir: Vector3 (y ignored). Returns the dash record.
    dash(u, dir, distance, duration = 0.25, opts = {}) {
      const d = new THREE.Vector3(dir.x, 0, dir.z);
      if (d.lengthSq() < 1e-6) d.set(Math.sin(u.facing), 0, Math.cos(u.facing));
      d.normalize();
      u.dash = { dir: d, speed: distance / Math.max(0.01, duration), t: duration, opts };
      if (opts.invuln) u.invuln = Math.max(u.invuln, duration);
      u.kb.set(0, 0, 0);
      return u.dash;
    },
    knockback(u, from, force) { knockback(u, from, force); },
    hitStop(seconds, scale) { doHitStop(seconds, scale); },
    walkable, rng, on: events.on, emit: events.emit,
    spawnUnit: (kind, team, x, z) => makeUnit(kind, team, x, z, ENEMIES[kind] || CLASSES[kind]),
  };

  const zone = createZone(ctx, state);
  const pickups = createPickups(ctx, state, events);
  const G = { api, state, units, projectiles, zone, pickups, world, fx, move, face, play, cast, walkable, makeUnit };
  const ai = createAI(G);
  const spawner = createSpawner(G);
  api.spawnPack = (x, z, opts) => spawner.spawnPack(x, z, opts);
  api.spawnBoss = (x, z, opts) => { const b = spawnBoss(G, x, z, opts); b.spawnedAt = state.time; return b; };
  // The Warlord arrives once the storm reaches stage 3.
  events.on('zone', ({ stage }) => {
    if (stage < 3 || state.bossSpawned || state.phase !== 'playing') return;
    const spot = spawner.findSpot(false);
    if (!spot) return;
    state.bossSpawned = true;
    api.spawnBoss(spot.x, spot.z);
    fx.spawn('spawn', new THREE.Vector3(spot.x, world.heightAt(spot.x, spot.z), spot.z));
    ctx.ui.announce?.('The Warlord Comes', 'Gharok has entered the arena', 3);
  });
  api.zone = zone; api.pickups = pickups; api.spawner = spawner;

  function mouseGround() {
    raycaster.setFromCamera(input.mouse, camera);
    groundPlane.constant = -(state.player ? state.player.pos.y : 0);
    const hit = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(groundPlane, hit) && state.player) hit.copy(state.player.pos);
    return hit;
  }

  function updatePlayer(p, dt) {
    const cls = CLASSES[p.kind];
    const aim = mouseGround();
    const dir = new THREE.Vector3(
      (input.down('d') ? 1 : 0) - (input.down('a') ? 1 : 0), 0,
      (input.down('s') ? 1 : 0) - (input.down('w') ? 1 : 0));
    p.mana = Math.min(p.maxMana, p.mana + 12 * dt);
    if (state.time - p.lastHurt > 5) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.006 * dt);
    if (p.lock > 0 || p.dash) return;
    const tryCast = (slot) => {
      const ab = cls.abilities[slot];
      if ((p.cooldowns[slot] || 0) > 0 || p.mana < ab.mana) return false;
      p.cooldowns[slot] = ab.cd; p.mana -= ab.mana;
      p.facing = Math.atan2(aim.x - p.pos.x, aim.z - p.pos.z);
      ab.cast(api, p, aim.clone());
      state.lastCast = { t: state.time, unit: p, slot };
      return true;
    };
    if (input.mouse.left && tryCast('primary')) return;
    if ((input.mouse.rightPressed || input.pressed('q') || input.down('q')) && tryCast('secondary')) return;
    if (input.pressed('e') && tryCast('ultimate')) return;
    if (input.pressed(' ') && tryCast('dodge')) return;
    if (move(p, dir, dt)) p.actor.play('Running_A');
    else p.actor.play(cls.idle || 'Idle');
  }

  function updateMobBasics(u, dt) {
    u.mana = Math.min(u.maxMana, u.mana + 10 * dt);
    if (u.rival && state.time - u.lastHurt > 4) u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.015 * dt);
  }

  function updateProjectiles(dt) {
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const pr = projectiles[i];
      pr.life -= dt;
      pr.pos.addScaledVector(pr.vel, dt);
      pr.mesh?.position.copy(pr.pos);
      if (pr.mesh && pr.vel.lengthSq() > 0) pr.mesh.lookAt(tmp.copy(pr.pos).add(pr.vel));
      pr.onUpdate?.(pr, dt);
      let hit = null;
      for (const o of units) {
        if (o.dead || o.team === pr.owner.team || pr.hitSet?.has(o) || o.invuln > 0) continue;
        if (Math.hypot(o.pos.x - pr.pos.x, o.pos.z - pr.pos.z) < o.radius + (pr.radius || 0.4) && Math.abs(pr.pos.y - (o.pos.y + 1)) < 2) { hit = o; break; }
      }
      const ground = world.heightAt(pr.pos.x, pr.pos.z);
      if (hit || pr.life <= 0 || pr.pos.y < ground) {
        pr.onHit?.(pr, hit);
        if (hit && pr.pierce) { (pr.hitSet ||= new Set()).add(hit); continue; }
        if (pr.mesh) { scene.remove(pr.mesh); pr.mesh.traverse?.((m) => m.geometry?.dispose()); }
        projectiles.splice(i, 1);
      }
    }
  }

  // Dash / knockback / separation / ground snap / facing — applied to every living unit.
  function physics(dt) {
    for (const u of units) {
      if (u.dead) continue;
      if (u.dash) {
        const d = u.dash, s = d.speed * Math.min(dt, d.t);
        const k = step(u, d.dir.x * s, d.dir.z * s);
        d.opts.onStep?.(u, d);
        d.t -= dt;
        if (d.t <= 0 || k === 0) { u.dash = null; d.opts.onEnd?.(u); }
      }
      if (u.kb.lengthSq() > 0.01) {
        step(u, u.kb.x * dt, u.kb.z * dt);
        u.kb.multiplyScalar(Math.exp(-6 * dt));
      } else u.kb.set(0, 0, 0);
    }
    // Boids-style separation so crowds spread instead of stacking.
    for (let i = 0; i < units.length; i++) {
      const a = units[i];
      if (a.dead) continue;
      for (let j = i + 1; j < units.length; j++) {
        const b = units[j];
        if (b.dead) continue;
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, min = (a.radius + b.radius) * (a.team === 'mob' && b.team === 'mob' ? 1.35 : 1.05);
        const d2 = dx * dx + dz * dz;
        if (d2 >= min * min) continue;
        const d = Math.sqrt(d2) || 0.01, overlap = (min - d) * Math.min(1, dt * 12);
        const nx = d2 > 1e-6 ? dx / d : Math.cos(i), nz = d2 > 1e-6 ? dz / d : Math.sin(i);
        const ma = a === state.player ? 3 : a.mass || 1, mb = b === state.player ? 3 : b.mass || 1;
        const wa = mb / (ma + mb), wb = ma / (ma + mb);
        step(a, -nx * overlap * wa, -nz * overlap * wa);
        step(b, nx * overlap * wb, nz * overlap * wb);
      }
    }
  }

  function updateZoneDamage(dt) {
    const z = state.zone;
    for (const u of units) {
      if (u.dead) continue;
      if (zone.outsideDist(u.pos.x, u.pos.z) > 0) {
        u.zoneTick = (u.zoneTick || 0) - dt;
        if (u.zoneTick <= 0) {
          u.zoneTick = 1;
          damage(u, z.dps * (u.team === 'mob' ? 2 : 1) * (u === state.player ? 1 : 1) / (u.dmgMulTaken || 1), null, null, { knockback: 0 });
          fx.spawn('hit', u.pos.clone().setY(u.pos.y + 1), { color: new THREE.Color(0.8, 0.2, 1) });
        }
      } else u.zoneTick = 0;
    }
  }

  function resetWorld() {
    for (const u of units) scene.remove(u.actor.root);
    units.length = 0;
    for (const pr of projectiles) if (pr.mesh) scene.remove(pr.mesh);
    projectiles.length = 0;
    timers.length = 0;
    pickups.clear(); spawner.clear();
    state.kills = 0; state.eliminated.length = 0; state.rivals.length = 0; state.boss = null; state.bossSpawned = false;
  }

  function spawnPlayer(clsName, x, z) {
    const cls = CLASSES[clsName] ? clsName : 'warrior';
    const p = makeUnit(cls, 'player', x, z, CLASSES[cls]);
    p.radius = 0.5; p.mass = 1.5; p.level = 1; p.xp = 0; p.xpNext = xpToNext(1); p.gold = 0; p.name = 'You';
    state.player = p;
    engine.follow(p.actor.root);
    return p;
  }

  function spawnRival(i, x, z, kind) {
    const k = kind || Object.keys(CLASSES)[i % 3];
    const u = makeUnit(k, 'rival' + i, x, z, { ...CLASSES[k], ai: true, aggro: 30, cdScale: 1.7 });
    u.hp = u.maxHp = CLASSES[k].hp * 0.85;
    u.dmgMul = 0.65; // rivals use the player's ability kits; scaled so a 1v1 is fair-ish
    u.rival = true; u.name = RIVAL_NAMES[i % RIVAL_NAMES.length];
    u.huntAt = 25 + i * 14 + rng() * 10; // staggered: they farm first, then come for you
    u.level = 1; u.home = new THREE.Vector3(x, 0, z);
    state.rivals.push(u);
    return u;
  }

  // Advance the whole simulation without rendering (cheap warm-up for screenshot staging / headless tests).
  api.simulate = (seconds, hz = 60) => {
    const n = Math.max(1, Math.round(seconds * hz)), dt = 1 / hz;
    for (let i = 0; i < n; i++) {
      simT += dt;
      game.update(dt, simT); ctx.world.update?.(dt, simT); ctx.fx.update?.(dt, simT); engine.update?.(dt, simT); ctx.ui.update?.(dt, simT);
    }
  };
  let simT = 0;

  const stager = createStager({ ...G, ctx, resetWorld, spawnPlayer, spawnRival, spawner, engine, seedRng, scene });
  api.stage = (name, opts) => stager.stage(name, opts);
  api.visibility = () => stager.visibility();
  // Capture QA: is something actually happening right now? (an ability cast, a projectile, a telegraph, a fresh hit)
  api.actionCheck = (window = 0.7) => {
    const t = state.time, lc = state.lastCast;
    const r = {
      projectiles: projectiles.length,
      telegraph: (state.telegraphUntil || 0) > t,
      recentCast: !!lc && t - lc.t < window, castBy: lc && t - lc.t < window ? (lc.unit === state.player ? 'hero' : lc.unit.boss ? 'boss' : lc.unit.kind) : null,
      recentHit: t - (state.lastHitT ?? -99) < window,
      heroBusy: !!state.player && (state.player.lock > 0 || !!state.player.dash),
    };
    r.ok = r.projectiles > 0 || r.telegraph || r.heroBusy || r.castBy === 'hero' || r.castBy === 'boss';
    return r;
  };

  const game = {
    state, units, api, events,
    start(clsName) {
      seedRng(Number(ctx.params?.get?.('seed')) || ((Date.now() & 0xffff) ^ 0x5bd1));
      if (ctx.params?.has?.('shot')) seedRng(1234);
      resetWorld();
      state.godMode = false; state.autopilot = false; state.frozen = false; state.maxEngaged = undefined;
      zone.reset();
      // Spawn on dry, open ground near the middle.
      let px = 0, pz = 6;
      for (let i = 0; i < 40 && !walkable(px, pz, 1.2); i++) { px = (rng() - 0.5) * 20; pz = (rng() - 0.5) * 20; }
      spawnPlayer(clsName, px, pz);
      for (let i = 0; i < 5; i++) {
        let x = 0, z = 0;
        for (let k = 0; k < 30; k++) {
          const a = (i / 5) * Math.PI * 2 + 0.4 + (rng() - 0.5) * 0.4, r = world.radius * (0.6 + rng() * 0.2);
          x = Math.cos(a) * r; z = Math.sin(a) * r;
          if (walkable(x, z, 1)) break;
        }
        spawnRival(i, x, z);
      }
      spawner.initial();
      state.spawnTimer = 8;
      state.phase = 'playing';
      events.emit('phase', 'playing');
      ctx.ui.showHUD(state);
    },
    update(dt, t) {
      if (state.phase === 'menu') return;
      // Hit-stop: game simulation runs slowed for a few real milliseconds.
      if (hitStop.t > 0) { hitStop.t -= dt; state.timeScale = hitStop.scale; if (hitStop.t <= 0) hitStop.scale = 1; }
      else state.timeScale = 1;
      dt *= state.timeScale;
      state.time += dt;
      for (let i = timers.length - 1; i >= 0; i--) {
        const tm = timers[i];
        if ((tm.t -= dt) <= 0) { timers.splice(i, 1); tm.fn(); }
      }
      const playing = state.phase === 'playing' || state.phase === 'staged';
      for (const u of units) {
        for (const k in u.cooldowns) u.cooldowns[k] = Math.max(0, u.cooldowns[k] - dt);
        u.lock -= dt; u.hitFlash -= dt; u.invuln = Math.max(0, u.invuln - dt);
        u._px = u.pos.x; u._pz = u.pos.z;
        if (u.dead) {
          u.deadTime += dt;
          if (u.deadTime > 4 && u !== state.player) u.pos.y -= dt * 0.4; // sink into the ground
          if (u.deadTime > 6.5 && u !== state.player) removeUnit(u);
        } else if (playing && !state.frozen) {
          // Staged autopilot hands control back as soon as real input arrives (e.g. the capture harness clicking).
          if (u === state.player && state.autopilot && (input.mouse.left || input.mouse.rightPressed || input.keys?.size)) state.autopilot = false;
          if (u === state.player) { if (!state.autopilot) updatePlayer(u, dt); else if (u.lock <= 0 && !u.dash) { updateMobBasics(u, dt); ai.rival(u, dt); } }
          else if (u.hold > 0) { // staged / scripted: hold position menacingly before engaging
            u.hold -= dt;
            const t = u.target || state.player;
            if (t) u.facing = Math.atan2(t.pos.x - u.pos.x, t.pos.z - u.pos.z);
            u.actor.play(u.stats.idle || 'Idle');
          }
          else if (u.lock <= 0 && !u.dash) { updateMobBasics(u, dt); if (u.rival) ai.rival(u, dt); else if (u.boss) ai.boss(u, dt); else ai.mob(u, dt); }
        }
      }
      physics(dt);
      for (const u of units) {
        if (u.removed) continue;
        const gy = Math.max(world.heightAt(u.pos.x, u.pos.z), world.waterLevel - DEEP - 0.2);
        if (!u.dead || u.deadTime <= 4) u.pos.y += (gy - u.pos.y) * Math.min(1, dt * 20);
        if (dt > 0) u.vel.set((u.pos.x - u._px) / dt, 0, (u.pos.z - u._pz) / dt);
        if (!u.dead) u.actor.setMoveSpeed?.(Math.hypot(u.vel.x, u.vel.z)); // match run cycle to ground speed
        const r = u.actor.root.rotation;
        let dy = u.facing - r.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        r.y += dy * Math.min(1, dt * 14);
        u.actor.update(dt);
      }
      for (let i = units.length - 1; i >= 0; i--) if (units[i].removed) units.splice(i, 1);
      updateProjectiles(dt);
      pickups.update(dt, units);
      if (state.phase !== 'playing') { zone.visuals(dt, t); return; }
      zone.update(dt, t, (what) => events.emit('zone', { what, stage: state.zone.stage }));
      updateZoneDamage(dt);
      spawner.update(dt);
      const rivalsLeft = units.filter((u) => u.rival && !u.dead).length;
      state.rivalsLeft = rivalsLeft;
      if (rivalsLeft === 0 && !state.player.dead) {
        state.phase = 'won'; state.player.actor.play('Cheer'); events.emit('phase', 'won'); ctx.ui.showEnd(true, state);
      }
    },
  };
  return game;
}
