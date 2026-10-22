// World-space overlays: pooled enemy health bars / rival nameplates and Diablo-style floating damage numbers.
// Positions are written with transform only; DOM nodes are pooled and reused.
import * as THREE from 'three';
import { CLASSES } from '../game/classes.js';

const v = new THREE.Vector3();
// Subtitle under a pack leader's own name: what kind of creature leads the pack.
const MOB_NAMES = { orc: 'Orc', skeletonMinion: 'Risen Thrall', skeletonWarrior: 'Bone Knight', skeletonArcher: 'Bone Archer', skeletonMage: 'Bone Mage' };

export function createOverlays(ctx, root) {
  const layer = document.createElement('div');
  layer.className = 'overlays';
  root.append(layer);
  const bars = document.createElement('div'); bars.className = 'ov-bars';
  const nums = document.createElement('div'); nums.className = 'ov-nums';
  layer.append(bars, nums);

  // ---------- health bars ----------
  const barPool = [];
  const lag = new WeakMap();
  function getBar(i) {
    if (!barPool[i]) {
      const d = document.createElement('div');
      d.className = 'hb';
      d.innerHTML = '<div class="hb-name"></div><div class="hb-frame"><i class="hb-lag"></i><i class="hb-fill"></i></div>';
      bars.append(d);
      barPool[i] = { d, name: d.firstChild, lag: d.querySelector('.hb-lag'), fill: d.querySelector('.hb-fill'), vis: false, kind: '', nm: '' };
    }
    return barPool[i];
  }

  // ---------- damage numbers ----------
  const numPool = [];
  const live = [];
  let seq = 0;
  function getNum() {
    let n = numPool.pop();
    if (!n) { const d = document.createElement('div'); d.className = 'dn'; nums.append(d); n = { d }; }
    return n;
  }

  const recent = new WeakMap(); // target pos object -> its youngest live number (for merging rapid ticks)
  function damageNumber(pos, amount, color, opts) {
    if (!pos) return;
    const rawColor = color;
    const o = typeof opts === 'object' && opts ? opts : { crit: opts === true };
    // merge rapid multi-hits on the same target (whirlwind, DoTs) into one rising total instead of a pile
    if (typeof amount === 'number' && typeof pos === 'object') {
      const prev = recent.get(pos);
      if (prev && live.includes(prev) && prev.t < 0.3 && !prev.text && !prev.crit && prev.color === color && !o.crit) {
        prev.val += Math.round(amount);
        prev.d.textContent = String(prev.val);
        prev.hw = String(prev.val).length * prev.fpx * 0.36 + 3;
        prev.base = Math.max(prev.base, Math.max(0.62, Math.min(1, 0.6 + prev.val / 55)));
        prev.t = Math.min(prev.t, 0.05); // refresh: pop again and extend its life a little
        return;
      }
    }
    const n = getNum();
    const val = typeof amount === 'number' ? Math.round(amount) : amount;
    const toPlayer = o.toPlayer ?? (color === '#ff5050');
    // crits come from opts; very heavy hits get the same oversized treatment
    const crit = !!o.crit || (!toPlayer && typeof val === 'number' && val >= 55);
    if (!toPlayer && (!color || color === '#ffd27a')) color = crit ? '#ffc93a' : '#f3ead8';
    let cls = 'dn';
    if (toPlayer) cls += ' taken';
    else if (crit) cls += ' crit';
    if (o.heal) cls += ' heal';
    if (typeof val === 'string') { cls = 'dn text'; color = color || '#ffe08a'; }
    else if (!toPlayer && color === '#b8a898') cls += ' other'; // damage between other combatants
    n.d.className = cls;
    n.d.textContent = o.heal ? `+${val}` : String(val);
    n.d.style.color = toPlayer ? '' : (color || '#fff1d0');
    n.d.style.zIndex = String(++seq % 1000);
    const side = (seq % 2 ? 1 : -1) * (0.4 + Math.random() * 0.6);
    n.p = pos.clone ? pos.clone() : new THREE.Vector3(pos.x, pos.y, pos.z);
    n.p.y += o.height ?? 1.9;
    n.t = 0;
    n.text = typeof val === 'string';
    n.life = n.text ? 1.8 : crit ? 1.25 : 0.95;
    n.vx = side * (crit ? 70 : 55);
    n.vy = -(crit ? 210 : 170) - Math.random() * 40;
    n.ox = (Math.random() - 0.5) * 18; n.oy = 0; n.push = 0;
    n.crit = crit; n.toPlayer = toPlayer;
    // size by magnitude: chip damage reads small, big hits read big
    const fpx = n.text ? 22 : crit ? 27 : toPlayer ? 17 : cls.includes('other') ? 13 : 19;
    n.base = n.text || crit ? 1 : typeof val === 'number' ? Math.max(0.62, Math.min(1, 0.6 + val / 55)) : 1;
    n.hw = String(n.d.textContent).length * fpx * 0.36 + 3; n.hh = fpx * 0.5 + 1;
    n.fpx = fpx; n.val = val; n.color = rawColor;
    if (typeof pos === 'object') recent.set(pos, n);
    n.d.style.display = '';
    live.push(n);
    if (live.length > 70) { const old = live.shift(); old.d.style.display = 'none'; numPool.push(old); }
  }

  const W = () => innerWidth, H = () => innerHeight;

  function update(dt) {
    const cam = ctx.engine?.camera;
    if (!cam) return;
    const w = W(), h = H();
    const obstacles = []; // screen rects of nameplates/bars that numbers must not cover
    // bars
    const units = ctx.game?.units || [];
    const player = ctx.game?.state?.player;
    let bi = 0;
    // the boss has its own top-centre bar: no overhead plate; its body is an obstacle for numbers,
    // and other units' names are suppressed within 3 m of it so nothing piles onto the boss.
    let boss = null, bossRect = null;
    // the hero's head/body area is sacred: plates stack above it and numbers slide sideways off it
    let heroRect = null;
    if (player && !player.dead) {
      const sc = player.actor?.root?.scale?.y || 1;
      v.set(player.pos.x, player.pos.y + 2.5 * sc, player.pos.z).project(cam);
      const top = (-v.y * 0.5 + 0.5) * h, cx = (v.x * 0.5 + 0.5) * w;
      v.set(player.pos.x, player.pos.y, player.pos.z).project(cam);
      const bot = (-v.y * 0.5 + 0.5) * h;
      if (v.z < 1) {
        const hh = Math.max(14, (bot - top) / 2 + 6);
        heroRect = { sx: cx, sy: (top + bot) / 2, hw: Math.max(22, hh * 0.8), hh, sc: 1, side: true };
        obstacles.push(heroRect);
      }
    }
    for (const u of units) if (!u.dead && (u.boss === true || u.kind === 'warlord')) { boss = u; break; }
    if (boss) {
      const sc = boss.actor?.root?.scale?.y || 1;
      v.set(boss.pos.x, boss.pos.y + 3.4 * sc, boss.pos.z).project(cam);
      const top = (-v.y * 0.5 + 0.5) * h, cx = (v.x * 0.5 + 0.5) * w;
      v.set(boss.pos.x, boss.pos.y, boss.pos.z).project(cam);
      const bot = (-v.y * 0.5 + 0.5) * h;
      if (v.z < 1) { bossRect = { sx: cx, sy: (top + bot) / 2, hw: Math.max(24, (bot - top) * 0.45), hh: Math.max(10, (bot - top) / 2), sc: 1, side: true }; obstacles.push(bossRect); }
    }
    for (const u of units) {
      if (u === player || u.dead || !u.pos || u === boss) continue;
      const elite = !!(u.elite || u.leader || u.champion || u.boss);
      const damaged = u.hp < u.maxHp - 0.01;
      if (!damaged && !u.rival && !elite) continue;
      v.set(u.pos.x, u.pos.y + (u.rival ? 2.75 : elite ? 2.7 : 2.45) * (u.actor?.root?.scale?.y || 1), u.pos.z).project(cam);
      if (v.z > 1 || v.x < -1.1 || v.x > 1.1 || v.y < -1.1 || v.y > 1.1) continue;
      const b = getBar(bi++);
      const kind = u.rival ? 'hb rival' : elite ? 'hb elite' : 'hb';
      if (b.kind !== kind) { b.kind = kind; b.d.className = kind; }
      const near = player ? Math.hypot(u.pos.x - player.pos.x, u.pos.z - player.pos.z) < 13 : true;
      const sx0 = (v.x * 0.5 + 0.5) * w, sy0 = (-v.y * 0.5 + 0.5) * h;
      const nearBoss = boss && (Math.hypot(u.pos.x - boss.pos.x, u.pos.z - boss.pos.z) < 3 + (boss.radius || 1) * 1.5
        || (bossRect && Math.abs(sx0 - bossRect.sx) < bossRect.hw + 60 && Math.abs(sy0 - 20 - bossRect.sy) < bossRect.hh + 30));
      const showName = !nearBoss && (u.rival || (elite && (damaged || near)));
      // rivals: class line + their hero name (and level); pack leaders: their name + "Pack Leader · <kind>"
      const lv = u.level > 1 ? ` · Lv ${u.level}` : '';
      const nm = !showName ? ''
        : u.rival ? `Rival — ${CLASSES[u.kind]?.name || 'Hero'}<small>${u.name || 'Champion'}${lv}</small>`
        : `${u.name || 'Pack Leader'}<small>Pack Leader · ${MOB_NAMES[u.kind] || 'Brute'}</small>`;
      if (b.nm !== nm) { b.nm = nm; b.name.innerHTML = nm; b.nw = 0; }
      const r = Math.max(0, Math.min(1, u.hp / (u.maxHp || 1)));
      let lg = lag.get(u) ?? r;
      lg = lg > r ? Math.max(r, lg - dt * 0.6) : r;
      lag.set(u, lg);
      if (b.r !== r) { b.r = r; b.fill.style.transform = `scaleX(${r})`; }
      if (b.lg !== lg) { b.lg = lg; b.lag.style.transform = `scaleX(${lg})`; }
      b.x = (v.x * 0.5 + 0.5) * w; b.y = (-v.y * 0.5 + 0.5) * h; b.depth = v.z;
      if (nm && !b.nw) b.nw = b.name.offsetWidth / 2 + 4; // measured once per name change
      b.hw = Math.max(nm ? b.nw : 0, u.rival ? 50 : elite ? 34 : 25); b.ht = nm ? 46 : 8; // half-width, height above anchor
      if (!b.vis) { b.vis = true; b.d.style.display = ''; }
    }
    // declutter: nearer plates keep their spot, farther ones stack upward
    const shown = barPool.slice(0, bi).sort((a, c) => c.depth - a.depth).reverse();
    // fixed pseudo-plate for the hero (bottom-anchored like plates) so nothing is placed over the head
    if (heroRect) shown.unshift({ hero: true, x: heroRect.sx, y: heroRect.sy + heroRect.hh, hw: heroRect.hw, ht: heroRect.hh * 2, lift: 0 });
    for (let i = 0; i < shown.length; i++) {
      if (shown[i].hero) continue;
      const a = shown[i];
      let lift = 0;
      for (let pass = 0; pass < 8; pass++) {
        let moved = false;
        for (let j = 0; j < i; j++) {
          const c = shown[j];
          if (Math.abs(a.x - c.x) >= a.hw + c.hw) continue;
          const aTop = a.y - lift - a.ht, aBot = a.y - lift + 2, cTop = c.y - (c.lift || 0) - c.ht, cBot = c.y - (c.lift || 0) + 2;
          if (aBot > cTop && aTop < cBot) { lift += aBot - cTop + 2; moved = true; }
        }
        if (!moved) break;
      }
      a.lift = (a.lift || 0) + (lift - (a.lift || 0)) * Math.min(1, dt * 12);
      a.d.style.transform = `translate3d(${a.x.toFixed(1)}px,${(a.y - a.lift).toFixed(1)}px,0) translate(-50%,-100%)`;
      obstacles.push({ sx: a.x, sy: a.y - a.lift - a.ht / 2 + 1, hw: a.hw, hh: a.ht / 2 + 3, sc: 1 });
    }
    for (let i = bi; i < barPool.length; i++) { const b = barPool[i]; if (b.vis) { b.vis = false; b.d.style.display = 'none'; } }
    // numbers: integrate motion, then resolve screen-space overlaps (newer numbers yield upward)
    let m = 0;
    for (let i = live.length - 1; i >= 0; i--) {
      const n = live[i];
      n.t += dt;
      if (n.t >= n.life) { n.d.style.display = 'none'; live.splice(i, 1); numPool.push(n); continue; }
      if (n.text) { n.vx = 0; n.vy = -40; } else n.vy += 520 * dt;
      n.vx *= Math.exp(-dt * 1.5);
      n.ox += n.vx * dt; n.oy += n.vy * dt;
      if (n.oy > 30) n.oy = 30;
      v.copy(n.p).project(cam);
      n.off = v.z > 1;
      n.sx = (v.x * 0.5 + 0.5) * w + n.ox; n.sy = (-v.y * 0.5 + 0.5) * h + n.oy;
      const k = n.t / n.life;
      let s = n.crit ? (n.t < 0.12 ? 2.1 - (n.t / 0.12) * 0.9 : 1.2) : (n.t < 0.08 ? 1.4 - (n.t / 0.08) * 0.4 : 1);
      s *= n.base * (1 - Math.max(0, k - 0.7) * 0.6);
      n.sc = s;
    }
    // live[] is in spawn order: older entries keep their place, newer ones are pushed up past them
    for (let i = 0; i < live.length; i++) {
      const a = live[i];
      if (a.off) continue;
      let need = 0;
      for (let pass = 0; pass < 8; pass++) {
        let moved = false;
        for (let j = 0; j < i + obstacles.length; j++) {
          const b = j < i ? live[j] : obstacles[j - i];
          if (b.off) continue;
          const ay = a.sy - need;
          const ox = a.hw * a.sc + b.hw * b.sc - Math.abs(a.sx - b.sx);
          const oy = a.hh * a.sc + b.hh * b.sc - Math.abs(ay - b.sy);
          if (ox > 0 && oy > 0) {
            if (b.side) { a.sx += (a.sx >= b.sx ? 1 : -1) * (ox + 2); moved = true; continue; } // slide off the boss sideways
            need += oy + 1; moved = true;
          }
        }
        if (!moved) break;
      }
      a.push = need > a.push ? a.push + (need - a.push) * Math.min(1, dt * 25) : a.push + (need - a.push) * Math.min(1, dt * 3);
      a.sy -= a.push;
      if (a.sy < 200) a.sy = 200; // never climb into the top HUD (plaque, boss bar)
      m++;
    }
    for (const n of live) {
      if (n.off) { n.d.style.opacity = '0'; continue; }
      const k = n.t / n.life;
      n.d.style.transform = `translate3d(${n.sx.toFixed(1)}px,${n.sy.toFixed(1)}px,0) translate(-50%,-50%) scale(${n.sc.toFixed(3)})`;
      n.d.style.opacity = (k < 0.65 ? 1 : 1 - (k - 0.65) / 0.35).toFixed(3);
    }
  }

  return { damageNumber, update, el: layer };
}
