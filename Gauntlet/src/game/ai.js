// AI brains for rival heroes and mob packs.
// Rivals: pick targets (biased toward the player once hunting), kite if ranged, close in if melee, dodge incoming
// projectiles and melee, use abilities situationally, retreat to heal at low HP, respect the zone.
// Mobs: move as packs around a leader, share aggro, encircle melee targets, ranged mobs hold distance.
import * as THREE from 'three';
import { rng } from './rng.js';

const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), v4 = new THREE.Vector3();
const flat = (v) => { v.y = 0; return v; };
const dist2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const PROJ_SPEED = { mage: 22, archer: 34 };

export function createAI(G) {
  // G: { api, state, units, projectiles, zone, pickups, move(u, dir, dt, opts), face(u, pos), cast(u, slot, aim), play(u, name) }
  const { api, state, zone, pickups } = G;

  function isRanged(u) { return (u.stats.abilities.primary?.range || 0) > 6; }

  // Direction that keeps a unit inside the (next) safe zone. Returns null if comfortable.
  function zonePull(u, out) {
    const z = state.zone;
    const outNow = dist2(u.pos, z.center) - z.radius;
    let c = null;
    if (outNow > -2) c = z.next && z.shrinking ? z.next.center : z.center;
    else if (z.next && (z.shrinking || z.timer < 14) && dist2(u.pos, z.next.center) > z.next.radius - 3) c = z.next.center;
    if (!c) return null;
    return out.set(c.x - u.pos.x, 0, c.z - u.pos.z);
  }

  function countNear(u, pos, r) {
    let n = 0;
    for (const o of api.enemiesOf(u)) if (dist2(o.pos, pos) < r + o.radius) n++;
    return n;
  }

  function leadAim(u, t) {
    const sp = PROJ_SPEED[u.kind];
    const aim = t.pos.clone();
    if (sp && t.vel) {
      const tt = dist2(u.pos, t.pos) / sp;
      aim.addScaledVector(t.vel, tt * (0.6 + rng() * 0.5));
    }
    aim.x += (rng() - 0.5) * 0.8; aim.z += (rng() - 0.5) * 0.8;
    return aim;
  }

  // Cast the dodge ability toward a direction (aim point placed far enough for blink to use full range).
  function dodgeDir(u, dir) {
    const ab = u.stats.abilities.dodge;
    if (!ab || (u.cooldowns.dodge || 0) > 0 || u.mana < (ab.mana || 0)) return false;
    dir.y = 0; if (dir.lengthSq() < 1e-4) return false; dir.normalize();
    // Don't dodge into walls/water/outside the zone.
    const tx = u.pos.x + dir.x * 5, tz = u.pos.z + dir.z * 5;
    if (!G.walkable(tx, tz, u.radius) || zone.outsideDist(tx, tz) > -1) dir.negate();
    const aim = u.pos.clone().addScaledVector(dir, 8);
    return G.cast(u, 'dodge', aim, dir);
  }

  // Look for incoming enemy projectiles that will hit soon.
  function threatProjectile(u) {
    for (const pr of api.projectiles) {
      if (!pr.owner || pr.owner.team === u.team || !pr.vel) continue;
      const rx = u.pos.x - pr.pos.x, rz = u.pos.z - pr.pos.z;
      if (rx * rx + rz * rz > 81) continue;
      const vx = pr.vel.x, vz = pr.vel.z, vv = vx * vx + vz * vz;
      if (vv < 1) continue;
      const t = (rx * vx + rz * vz) / vv;
      if (t < 0 || t > 0.55) continue;
      const mx = rx - vx * t, mz = rz - vz * t;
      if (mx * mx + mz * mz < 1.4 * 1.4) return pr;
    }
    return null;
  }

  // ---------------- Rival heroes ----------------
  function chooseTarget(u) {
    const p = state.player;
    const hunting = state.time > u.huntAt || state.zone.stage >= 2;
    let best = null, bs = Infinity;
    for (const o of api.enemiesOf(u)) {
      if (o.hold > 0) continue; // scripted (staged) units aren't engaged until they act
      const d = dist2(o.pos, u.pos);
      const range = (o === p && hunting) ? 48 : o.rival ? 24 : 30;
      if (d > range) continue;
      // Before the hunt starts, rivals only engage the player up close or when provoked.
      if (o === p && !hunting && d > 13 && u.lastAttacker !== p) continue;
      let s = d + (o.hp / o.maxHp) * 6;
      if (o === p) s -= hunting ? 14 : 3;
      else if (o.rival) s += 3; // rivals feud less with each other than they hunt you
      if (o === u.lastAttacker && state.time - u.lastHurt < 3) s -= 8;
      if (o === u.target) s -= 3; // stickiness
      if (s < bs) { bs = s; best = o; }
    }
    return best;
  }

  function rival(u, dt) {
    const ab = u.stats.abilities;
    const ranged = isRanged(u);
    u.think = (u.think || 0) - dt;
    if (u.think <= 0) {
      u.think = 0.3 + rng() * 0.25;
      u.target = chooseTarget(u);
      if (u.hp < u.maxHp * 0.3) u.retreat = true;
      if (u.retreat && u.hp > u.maxHp * 0.6) u.retreat = false;
    }
    const t = u.target && !u.target.dead ? u.target : null;

    // 1) Reactive dodge vs projectiles (reaction chance per projectile).
    const pr = threatProjectile(u);
    if (pr && !pr._seen?.has(u)) {
      (pr._seen ||= new Set()).add(u);
      if (rng() < 0.55) {
        const perp = v1.set(-pr.vel.z, 0, pr.vel.x);
        if (rng() < 0.5) perp.negate();
        if (dodgeDir(u, perp)) return;
      }
    }
    // 2) Ranged heroes evade melee threats that got too close.
    if (ranged && t && dist2(t.pos, u.pos) < 3 && !isRanged(t) && rng() < dt * 4) {
      if (ab.secondary && u.kind === 'mage' && (u.cooldowns.secondary || 0) <= 0 && G.cast(u, 'secondary', t.pos.clone())) return;
      if (dodgeDir(u, v1.subVectors(u.pos, t.pos))) return;
    }

    const pull = zonePull(u, v3);
    const dir = v2.set(0, 0, 0);
    let anim = null, faceTarget = false;

    if (u.retreat) {
      const potion = pickups.nearest('health', u.pos, 20);
      if (potion) dir.set(potion.pos.x - u.pos.x, 0, potion.pos.z - u.pos.z);
      else if (t) {
        dir.subVectors(u.pos, t.pos); flat(dir).normalize();
        const c = zone.safeCenter(); v1.set(c.x - u.pos.x, 0, c.z - u.pos.z).normalize();
        dir.add(v1.multiplyScalar(0.7));
      } else if (pull) dir.copy(pull);
      if (t && dist2(t.pos, u.pos) < 4 && rng() < dt * 2) { if (dodgeDir(u, v1.subVectors(u.pos, t.pos))) return; }
      // fire back while retreating if ranged
      if (t && ranged && tryAbilities(u, t, true)) return;
      anim = 'Running_A';
    } else if (t) {
      const d = dist2(t.pos, u.pos);
      if (tryAbilities(u, t, false)) return;
      if (ranged) {
        const R = ab.primary.range;
        const lo = Math.min(8, R * 0.45), hi = R * 0.78;
        v1.subVectors(t.pos, u.pos); flat(v1).normalize();
        u.strafeT = (u.strafeT || 0) - dt;
        if (u.strafeT <= 0) { u.strafeT = 1 + rng() * 1.6; u.strafeSide = rng() < 0.5 ? -1 : 1; }
        const side = v4.set(v1.z * u.strafeSide, 0, -v1.x * u.strafeSide);
        if (d < lo) dir.copy(v1).negate().addScaledVector(side, 0.5);
        else if (d > hi) dir.copy(v1).addScaledVector(side, 0.25);
        else dir.copy(side).multiplyScalar(0.8);
        faceTarget = true;
      } else {
        // Melee: close in; gap-close with dodge (charge) at mid range.
        v1.subVectors(t.pos, u.pos); flat(v1);
        if (d > 5 && d < 10 && rng() < dt * 1.5 && dodgeDir(u, v1.clone())) return;
        if (d > ab.primary.range * 0.8) dir.copy(v1);
        else faceTarget = true;
      }
      anim = 'Running_A';
    } else {
      // No target: hunt the player once allowed, otherwise roam the safe area.
      const p = state.player;
      const hunting = state.time > u.huntAt || state.zone.stage >= 2;
      if (hunting && p && !p.dead) dir.set(p.pos.x - u.pos.x, 0, p.pos.z - u.pos.z);
      else {
        u.roamT = (u.roamT || 0) - dt;
        if (u.roamT <= 0 || !u.roam) {
          u.roamT = 5 + rng() * 6;
          // Roam the hero's own territory (around its spawn), drifting inward as the zone closes.
          const c = zone.safeCenter(), sr = zone.safeRadius();
          const home = u.home || c;
          const a = rng() * Math.PI * 2, rr = 4 + rng() * 10;
          const g = new THREE.Vector3(home.x + Math.cos(a) * rr, 0, home.z + Math.sin(a) * rr);
          const off = v1.set(g.x - c.x, 0, g.z - c.z), l = off.length(), lim = Math.max(2, sr * 0.8);
          if (l > lim) g.set(c.x + off.x / l * lim, 0, c.z + off.z / l * lim);
          u.roam = g;
        }
        if (dist2(u.roam, u.pos) > 2) dir.set(u.roam.x - u.pos.x, 0, u.roam.z - u.pos.z);
      }
      anim = 'Running_A';
    }

    if (pull) { pull.normalize(); if (dir.lengthSq() > 0) dir.normalize(); dir.addScaledVector(pull, 1.6); }
    if (dir.lengthSq() > 1e-4) {
      dir.normalize();
      if (faceTarget && t) {
        G.face(u, t.pos);
        if (G.move(u, dir, dt, { noFace: true })) {
          const fwd = v1.set(Math.sin(u.facing), 0, Math.cos(u.facing));
          const dot = fwd.dot(dir), cross = fwd.x * dir.z - fwd.z * dir.x;
          G.play(u, dot > 0.6 ? 'Running_A' : dot < -0.6 ? 'Walking_Backwards' : (cross > 0 ? 'Running_Strafe_Left' : 'Running_Strafe_Right'));
        } else G.play(u, u.stats.idle || 'Idle');
      } else if (G.move(u, dir, dt)) G.play(u, anim);
      else G.play(u, u.stats.idle || 'Idle');
    } else {
      if (t) G.face(u, t.pos);
      G.play(u, u.stats.idle || 'Idle');
    }
  }

  // Pick and cast the best ability for the situation. Returns true if something was cast.
  function tryAbilities(u, t, defensiveOnly) {
    const ab = u.stats.abilities;
    const d = dist2(t.pos, u.pos);
    const ready = (s) => ab[s] && (u.cooldowns[s] || 0) <= 0 && u.mana >= (ab[s].mana || 0) && d <= ab[s].range;
    // Rivals react a bit slower than the player can: small random hesitation.
    if (rng() < 0.15) return false;
    const heroT = t.rival || t === state.player;
    if (!defensiveOnly && ready('ultimate')) {
      const cluster = countNear(u, t.pos, 4.5);
      if (cluster >= 3 || (heroT && t.hp > t.maxHp * 0.35) || u.retreat) return G.cast(u, 'ultimate', leadAim(u, t));
    }
    if (ready('secondary')) {
      if (u.kind === 'warrior') { if (countNear(u, u.pos, 3.2) >= 2 || heroT) return G.cast(u, 'secondary', t.pos.clone()); }
      else if (u.kind === 'mage') { if (d < 4) return G.cast(u, 'secondary', t.pos.clone()); }
      else if (!defensiveOnly || heroT) return G.cast(u, 'secondary', leadAim(u, t));
    }
    if (ready('primary')) return G.cast(u, 'primary', leadAim(u, t));
    return false;
  }

  // Boids separation: push away from packmates closer than `r` so packs read as individuals, not a blob.
  const sepV = new THREE.Vector3();
  const SEP_R = 2.4; // one personal-space radius for steering, crowd shuffling and approach
  function separation(u, r = SEP_R) {
    sepV.set(0, 0, 0);
    for (const o of G.units) {
      if (o === u || o.dead || o.team !== u.team) continue;
      const dx = u.pos.x - o.pos.x, dz = u.pos.z - o.pos.z, d = Math.hypot(dx, dz);
      const rr = r + (o.radius - 0.5) * 2;
      if (d < rr && d > 1e-3) { const w = (rr - d) / rr; sepV.x += (dx / d) * w; sepV.z += (dz / d) * w; }
    }
    return sepV;
  }

  // ---------------- Mobs ----------------
  // While holding position in a crowd, shuffle sideways out of packmates (strafing, still facing the target).
  function sepStep(u, dt) {
    const sv = separation(u);
    if (sv.lengthSq() < 0.04) return false;
    if (G.move(u, sv, dt * 0.6, { noFace: true })) { G.play(u, 'Walking_A'); return true; }
    return false;
  }

  // Engagement tokens: at most 3 melee attackers on one target at a time; the rest wait their turn in a ring.
  const MAX_ENGAGED = 3;
  function engage(u, t, d) {
    const set = (t._engaged ||= new Set());
    for (const m of set) if (m.dead || m.target !== t || dist2(m.pos, t.pos) > 6.5) set.delete(m);
    if (set.has(u)) return true;
    if (set.size < (t.boss ? 6 : state.maxEngaged || MAX_ENGAGED) && d < 9) { set.add(u); return true; }
    return false;
  }

  function mob(u, dt) {
    const def = u.stats;
    const pack = u.pack;
    const aggro = (def.aggro || 20) * (u.leader ? 1.2 : 1);
    u.think = (u.think || 0) - dt;
    if (u.think <= 0) {
      u.think = 0.35 + rng() * 0.3;
      let t = pack?.target && !pack.target.dead && dist2(pack.target.pos, u.pos) < aggro * 1.8 ? pack.target : null;
      if (!t) t = api.nearestEnemy(u, aggro);
      if (u.lastAttacker && !u.lastAttacker.dead && state.time - u.lastHurt < 2 && dist2(u.lastAttacker.pos, u.pos) < aggro * 1.5) t = u.lastAttacker;
      u.target = t;
      if (t && pack && (!pack.target || pack.target.dead)) pack.target = t; // alert the whole pack
    }
    const t = u.target && !u.target.dead ? u.target : null;
    const pull = zonePull(u, v3);
    const dir = v2.set(0, 0, 0);
    let speedMul = 1, anim = def.run || 'Running_A';

    if (t) {
      const d = dist2(t.pos, u.pos);
      const prim = def.abilities.primary;
      if ((u.cooldowns.primary || 0) <= 0 && d <= prim.range + t.radius * 0.5) {
        if (G.cast(u, 'primary', t.pos.clone())) return;
      }
      if (prim.range > 6) {
        // ranged mob: hold a distance band
        v1.subVectors(t.pos, u.pos); flat(v1).normalize();
        if (d < prim.range * 0.45) dir.copy(v1).negate();
        else if (d > prim.range * 0.85) dir.copy(v1);
        else { G.face(u, t.pos); if (!pull && !sepStep(u, dt)) { G.play(u, def.idle || 'Idle'); return; } if (!pull) return; }
      } else if (!engage(u, t, d)) {
        // waiting its turn: hold a loose ring ~4.5m out, drifting sideways and facing the fight
        const ang = Math.atan2(u.pos.x - t.pos.x, u.pos.z - t.pos.z) + Math.sin(state.time * 0.4 + (u.slot || 0)) * 0.25;
        const R = 4.2 + ((u.slot || 0) % 3) * 0.6;
        const gx = t.pos.x + Math.sin(ang) * R, gz = t.pos.z + Math.cos(ang) * R;
        if (Math.hypot(gx - u.pos.x, gz - u.pos.z) > 0.6) { dir.set(gx - u.pos.x, 0, gz - u.pos.z); speedMul = d < R ? 0.6 : 0.8; anim = 'Walking_A'; }
        else { G.face(u, t.pos); if (!pull && !sepStep(u, dt)) { G.play(u, def.idle || 'Idle'); return; } if (!pull) return; }
      } else {
        // melee (engaged): approach a slot around the target so attackers encircle with gaps instead of queueing
        const ang = Math.atan2(u.pos.x - t.pos.x, u.pos.z - t.pos.z) + ((u.slot || 0) - 0.5) * 0.9;
        const r = Math.max(1.1, prim.range * 0.75);
        const gx = t.pos.x + Math.sin(ang) * r, gz = t.pos.z + Math.cos(ang) * r;
        if (d > prim.range * 0.85) dir.set(gx - u.pos.x, 0, gz - u.pos.z);
        else { G.face(u, t.pos); if (!pull && !sepStep(u, dt)) { G.play(u, def.idle || 'Idle'); return; } if (!pull) return; }
      }
    } else if (pack) {
      if (u === pack.leader) {
        pack.wanderT = (pack.wanderT || 0) - dt;
        if (pack.wanderT <= 0 || !pack.goal) {
          pack.wanderT = 5 + rng() * 6;
          const c = zone.safeCenter(), sr = zone.safeRadius();
          // Drift toward the zone center (and the action) with some randomness.
          const a = rng() * Math.PI * 2;
          pack.goal = new THREE.Vector3(u.pos.x + Math.cos(a) * 8, 0, u.pos.z + Math.sin(a) * 8)
            .lerp(new THREE.Vector3(c.x, 0, c.z), Math.min(0.6, dist2(u.pos, c) / Math.max(sr, 1) * 0.4));
        }
        if (dist2(pack.goal, u.pos) > 1.5) dir.set(pack.goal.x - u.pos.x, 0, pack.goal.z - u.pos.z);
      } else if (pack.leader && !pack.leader.dead) {
        const L = pack.leader, a = (u.slot || 0) * 2.4 + L.facing + Math.PI;
        const gx = L.pos.x + Math.sin(a) * 2.6, gz = L.pos.z + Math.cos(a) * 2.6;
        if (Math.hypot(gx - u.pos.x, gz - u.pos.z) > 1.2) dir.set(gx - u.pos.x, 0, gz - u.pos.z);
        speedMul = dist2(L.pos, u.pos) > 6 ? 1 : 0.6;
      }
      if (!t) { speedMul *= 0.55; anim = 'Walking_A'; }
    }
    if (dir.lengthSq() > 1e-4) { dir.normalize(); dir.addScaledVector(separation(u), 2.0); }
    if (pull) { pull.normalize(); if (dir.lengthSq() > 0) dir.normalize(); dir.addScaledVector(pull, 1.5); speedMul = 1; anim = def.run || 'Running_A'; }
    if (dir.lengthSq() > 1e-4 && G.move(u, dir, dt * speedMul)) G.play(u, anim);
    else G.play(u, def.idle || 'Idle');
  }

  // ---------------- Boss ----------------
  function boss(u, dt) {
    u.think = (u.think || 0) - dt;
    if (u.think <= 0) {
      u.think = 0.4;
      const p = state.player;
      let t = api.nearestEnemy(u, u.stats.aggro);
      if (p && !p.dead && dist2(p.pos, u.pos) < u.stats.aggro * 1.3) t = p; // the warlord wants the challenger
      if (u.lastAttacker && !u.lastAttacker.dead && state.time - u.lastHurt < 2) t = u.lastAttacker;
      u.target = t;
    }
    const t = u.target && !u.target.dead ? u.target : null;
    const pull = zonePull(u, v3);
    if (t) {
      const d = dist2(t.pos, u.pos);
      const ready = (s) => (u.cooldowns[s] || 0) <= 0 && d <= u.stats.abilities[s].range;
      if (ready('ultimate') && (u.hp < u.maxHp * 0.8 || state.time - (u.spawnedAt ?? 0) > 20)) { if (G.cast(u, 'ultimate', t.pos.clone())) return; }
      if (ready('secondary')) { if (G.cast(u, 'secondary', t.pos.clone())) return; }
      if (ready('primary')) { if (G.cast(u, 'primary', t.pos.clone())) return; }
      if (d > 2.8 || pull) {
        const dir = v2.set(t.pos.x - u.pos.x, 0, t.pos.z - u.pos.z);
        if (pull) dir.normalize().addScaledVector(pull.normalize(), 1.5);
        if (G.move(u, dir, dt)) { G.play(u, u.stats.run); return; }
      }
      G.face(u, t.pos); G.play(u, u.stats.idle);
    } else if (pull && G.move(u, pull, dt * 0.7)) G.play(u, 'Walking_A');
    else G.play(u, u.stats.idle);
  }

  return { rival, mob, boss, isRanged };
}
