// In-game HUD: liquid health/resource globes, skill bar with cooldown sweeps, XP bar,
// top status plaque (rivals / stage+countdown / kills), minimap and announcements.
// All per-frame writes are transform/opacity/canvas or cached text (only written on change).
import { CLASSES } from '../game/classes.js';
import { abilityIcon } from './icons.js';
import { globeFrame, mapFrame, barPlate, ICON } from './ornaments.js';
import { SLOT_KEYS, RESOURCE, HEALTH } from './lore.js';

const SLOTS = ['primary', 'secondary', 'ultimate', 'dodge'];
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];

function setText(node, s) { if (node._t !== s) { node._t = s; node.textContent = s; } }
function setClass(node, c, on) { if (node._c?.[c] !== on) { (node._c ||= {})[c] = on; node.classList.toggle(c, on); } }

// ---------- liquid globe (canvas 2D) ----------
function makeGlobe(pal) {
  const S = 200; // backing pixels (displayed ~150 css px)
  const c = document.createElement('canvas'); c.width = c.height = S; c.className = 'globe-canvas';
  const g = c.getContext('2d');
  // pre-rendered static glass overlay
  const glass = document.createElement('canvas'); glass.width = glass.height = S;
  {
    const q = glass.getContext('2d'), r = S / 2;
    const edge = q.createRadialGradient(r, r, r * 0.55, r, r, r);
    edge.addColorStop(0, 'rgba(0,0,0,0)'); edge.addColorStop(0.8, 'rgba(0,0,0,.35)'); edge.addColorStop(1, 'rgba(0,0,0,.9)');
    q.fillStyle = edge; q.fillRect(0, 0, S, S);
    // restrained glass: thin crescent rim-light and a faint top sheen (no bubble blob)
    q.globalCompositeOperation = 'lighter';
    q.strokeStyle = 'rgba(255,240,220,.16)'; q.lineWidth = r * 0.05;
    q.beginPath(); q.arc(r, r, r * 0.86, Math.PI * 1.08, Math.PI * 1.55); q.stroke();
    q.strokeStyle = 'rgba(255,240,220,.08)'; q.lineWidth = r * 0.03;
    q.beginPath(); q.arc(r, r, r * 0.88, Math.PI * 0.1, Math.PI * 0.45); q.stroke();
    const sh = q.createRadialGradient(r * 0.72, r * 0.55, 0, r * 0.72, r * 0.55, r * 0.45);
    sh.addColorStop(0, 'rgba(255,245,230,.10)'); sh.addColorStop(1, 'rgba(255,245,230,0)');
    q.fillStyle = sh; q.fillRect(0, 0, S, S);
    q.globalCompositeOperation = 'source-over';
  }
  let shown = -1;
  function draw(ratio, t, flash) {
    ratio = Math.max(0, Math.min(1, ratio));
    shown = shown < 0 ? ratio : shown + (ratio - shown) * 0.25;
    const r = S / 2, cx = r, cy = r;
    g.clearRect(0, 0, S, S);
    g.save();
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.clip();
    // empty glass interior
    const e = g.createRadialGradient(cx, cy * 1.1, 0, cx, cy, r);
    e.addColorStop(0, '#120a0a'); e.addColorStop(1, '#020101');
    g.fillStyle = e; g.fillRect(0, 0, S, S);
    if (shown > 0.002) {
      const yL = cy + r - 2 * r * shown;
      const amp = S * 0.014 * Math.min(1, Math.min(shown, 1 - shown) * 8 + 0.15);
      const wave = (x, ph) => yL + Math.sin(x * 0.05 + t * 2.1 + ph) * amp + Math.sin(x * 0.11 - t * 3.3 + ph) * amp * 0.45;
      // back surface (lighter, offset phase)
      g.beginPath(); g.moveTo(0, S);
      for (let x = 0; x <= S; x += 5) g.lineTo(x, wave(x, 2.4) - amp * 0.6);
      g.lineTo(S, S); g.closePath();
      g.fillStyle = pal.mid; g.globalAlpha = 0.55; g.fill(); g.globalAlpha = 1;
      // main body
      g.beginPath(); g.moveTo(0, S);
      for (let x = 0; x <= S; x += 5) g.lineTo(x, wave(x, 0));
      g.lineTo(S, S); g.closePath();
      const lg = g.createLinearGradient(0, yL, 0, S);
      lg.addColorStop(0, pal.mid); lg.addColorStop(0.18, pal.mid); lg.addColorStop(0.6, pal.deep); lg.addColorStop(1, '#000');
      g.fillStyle = lg; g.fill();
      g.save(); g.clip();
      // swirling marbled blobs
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 5; i++) {
        const bx = cx + Math.sin(t * (0.25 + i * 0.07) + i * 1.7) * r * 0.55;
        const by = cy + r * 0.25 + Math.cos(t * (0.21 + i * 0.05) + i) * r * 0.5;
        const br = r * (0.35 + 0.12 * Math.sin(t * 0.5 + i));
        const bg = g.createRadialGradient(bx, by, 0, bx, by, br);
        bg.addColorStop(0, pal.light); bg.addColorStop(1, 'rgba(0,0,0,0)');
        g.globalAlpha = 0.09; g.fillStyle = bg; g.fillRect(bx - br, by - br, br * 2, br * 2);
      }
      g.globalCompositeOperation = 'multiply';
      for (let i = 0; i < 3; i++) {
        const bx = cx + Math.cos(t * (0.18 + i * 0.06) + i * 2.3) * r * 0.6;
        const by = cy + r * 0.35 + Math.sin(t * (0.23 + i * 0.04) + i * 3) * r * 0.45;
        const br = r * 0.45;
        const bg = g.createRadialGradient(bx, by, 0, bx, by, br);
        bg.addColorStop(0, 'rgba(0,0,0,.7)'); bg.addColorStop(1, 'rgba(255,255,255,0)');
        g.globalAlpha = 1; g.fillStyle = bg; g.fillRect(bx - br, by - br, br * 2, br * 2);
      }
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      g.restore();
      // meniscus highlight
      g.beginPath();
      for (let x = 0; x <= S; x += 5) { const y = wave(x, 0); x ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.strokeStyle = pal.light; g.globalAlpha = 0.55; g.lineWidth = S * 0.008; g.stroke();
      g.globalAlpha = 0.14; g.lineWidth = S * 0.035; g.stroke(); g.globalAlpha = 1;
    }
    if (flash > 0) { g.fillStyle = `rgba(255,255,255,${flash * 0.35})`; g.fillRect(0, 0, S, S); }
    g.drawImage(glass, 0, 0);
    g.restore();
  }
  return { canvas: c, draw };
}

// ---------- minimap ----------
function makeMinimap(ctx) {
  const S = 220;
  const c = document.createElement('canvas'); c.width = c.height = S; c.className = 'map-canvas';
  const g = c.getContext('2d');
  const world = ctx.world;
  const AR = world?.radius || 60;
  const R = AR * 1.12; // world units shown from center to edge
  const toMap = (x, z) => [S / 2 + (x / R) * (S / 2), S / 2 + (z / R) * (S / 2)];
  // ---- pre-rendered sepia parchment map (once) ----
  const terr = document.createElement('canvas'); terr.width = terr.height = S;
  {
    const q = terr.getContext('2d'), img = q.createImageData(S, S), d = img.data;
    const wl = world?.waterLevel ?? -1;
    const H = new Float32Array(S * S);
    const hAt = (x, z) => { try { return world.heightAt(x, z); } catch { return 0; } };
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) H[j * S + i] = hAt(((i - S / 2) / (S / 2)) * R, ((j - S / 2) / (S / 2)) * R);
    let s = 9; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const k = j * S + i, y = H[k];
      const x = ((i - S / 2) / (S / 2)) * R, z = ((j - S / 2) / (S / 2)) * R, dist = Math.hypot(x, z);
      // hillshade from the NW
      const hx = H[k + (i < S - 1 ? 1 : 0)] - H[k - (i > 0 ? 1 : 0)];
      const hz = H[k + (j < S - 1 ? S : 0)] - H[k - (j > 0 ? S : 0)];
      const shade = Math.max(-1, Math.min(1, (-hx - hz) * 1.6));
      const grain = (rnd() - 0.5) * 10;
      // parchment base (warm sepia), slightly darker on high ground
      const t = Math.min(1, Math.max(0, (y + 1) / 7));
      let r = 168 - t * 40, gg = 142 - t * 38, b = 100 - t * 30;
      r += shade * 26 + grain; gg += shade * 22 + grain; b += shade * 16 + grain;
      if (y < wl) { // water: dark ink wash
        const depth = Math.min(1, (wl - y) / 1.2);
        r = 70 - depth * 25 + grain; gg = 70 - depth * 20 + grain; b = 64 - depth * 12 + grain;
      } else if (y < wl + 0.12) { r -= 50; gg -= 50; b -= 45; } // shore ink line
      // contour lines every 1.5 units of height
      const band = Math.floor((y + 10) / 1.5), bandR = Math.floor((H[k + (i < S - 1 ? 1 : 0)] + 10) / 1.5), bandD = Math.floor((H[k + (j < S - 1 ? S : 0)] + 10) / 1.5);
      if (y >= wl && (band !== bandR || band !== bandD)) { r -= 22; gg -= 22; b -= 20; }
      // outside the arena: burnt dark edge
      const edge = Math.min(1, Math.max(0, (dist - AR * 0.97) / (AR * 0.12)));
      r *= 1 - edge * 0.8; gg *= 1 - edge * 0.8; b *= 1 - edge * 0.8;
      d[k * 4] = r; d[k * 4 + 1] = gg; d[k * 4 + 2] = b; d[k * 4 + 3] = 255;
    }
    q.putImageData(img, 0, 0);
    // ruins / rocks / trees as dark ink silhouettes
    q.fillStyle = 'rgba(38,26,16,.85)';
    for (const o of world?.obstacles || []) {
      if (hAt(o.x, o.z) < wl) continue;
      const [ox, oy] = toMap(o.x, o.z);
      q.beginPath(); q.arc(ox, oy, Math.max(0.9, (o.r / R) * (S / 2)), 0, Math.PI * 2); q.fill();
    }
    // arena rim
    q.strokeStyle = 'rgba(40,24,12,.7)'; q.lineWidth = 1.2;
    q.beginPath(); q.arc(S / 2, S / 2, (AR / R) * (S / 2), 0, Math.PI * 2); q.stroke();
    // aged-paper vignette
    const v = q.createRadialGradient(S / 2, S / 2, S * 0.25, S / 2, S / 2, S / 2);
    v.addColorStop(0, 'rgba(60,30,10,0)'); v.addColorStop(1, 'rgba(40,20,6,.55)');
    q.fillStyle = v; q.fillRect(0, 0, S, S);
  }
  function draw(state, units, t) {
    g.clearRect(0, 0, S, S);
    g.save(); g.beginPath(); g.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2); g.clip();
    g.drawImage(terr, 0, 0);
    const z = state.zone;
    if (z) {
      const [zx, zy] = toMap(z.center?.x || 0, z.center?.z || 0);
      const zr = (z.radius / R) * (S / 2), tr = (z.target / R) * (S / 2);
      // outside the circle: soot wash (no colour smear)
      g.fillStyle = 'rgba(20,8,6,.42)';
      g.beginPath(); g.rect(0, 0, S, S); g.arc(zx, zy, zr, 0, Math.PI * 2, true); g.fill();
      g.strokeStyle = '#a3121a'; g.lineWidth = 1.6;
      g.beginPath(); g.arc(zx, zy, zr, 0, Math.PI * 2); g.stroke();
      if (tr < zr - 1) {
        g.setLineDash([3, 4]);
        g.strokeStyle = 'rgba(250,235,200,.45)'; g.lineWidth = 1;
        g.beginPath(); g.arc(zx, zy, tr, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
      }
    }
    const p = state.player;
    for (const u of units) {
      if (u.dead || u === p) continue;
      const [x, y] = toMap(u.pos.x, u.pos.z);
      if (u.rival || u.boss || u.kind === 'warlord') {
        const r = u.boss || u.kind === 'warlord' ? 6 : 4.5;
        g.fillStyle = '#c0141a'; g.strokeStyle = '#1a0a04'; g.lineWidth = 1.5;
        g.beginPath(); g.moveTo(x, y - r); g.lineTo(x + r, y); g.lineTo(x, y + r); g.lineTo(x - r, y); g.closePath(); g.stroke(); g.fill();
      } else {
        g.fillStyle = u.leader || u.elite ? '#7a1408' : 'rgba(90,20,10,.85)';
        g.beginPath(); g.arc(x, y, u.leader || u.elite ? 2 : 1.4, 0, Math.PI * 2); g.fill();
      }
    }
    if (p) {
      const [x, y] = toMap(p.pos.x, p.pos.z);
      // soft halo so the marker reads on parchment
      const hg = g.createRadialGradient(x, y, 0, x, y, 14);
      hg.addColorStop(0, 'rgba(255,236,180,.55)'); hg.addColorStop(1, 'rgba(255,236,180,0)');
      g.fillStyle = hg; g.beginPath(); g.arc(x, y, 14, 0, Math.PI * 2); g.fill();
      g.save(); g.translate(x, y); g.rotate(-(p.facing || 0));
      // facing cone
      const cg = g.createRadialGradient(0, 0, 4, 0, 0, 34);
      cg.addColorStop(0, 'rgba(255,240,200,.5)'); cg.addColorStop(1, 'rgba(255,240,200,0)');
      g.fillStyle = cg; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, 34, Math.PI / 2 - 0.5, Math.PI / 2 + 0.5); g.closePath(); g.fill();
      // arrow
      g.fillStyle = '#ffe9a8'; g.strokeStyle = '#140a02'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(0, 11); g.lineTo(7.5, -7); g.lineTo(0, -3); g.lineTo(-7.5, -7); g.closePath(); g.stroke(); g.fill();
      g.fillStyle = '#b8862e'; g.beginPath(); g.moveTo(0, 11); g.lineTo(0, -3); g.lineTo(-7.5, -7); g.closePath(); g.fill();
      g.restore();
    }
    g.restore();
  }
  return { canvas: c, draw };
}

// Clamp timer display: staged/huge timers read as an em dash instead of leaking e.g. "16:39".
function fmtTime(s) { if (!Number.isFinite(s) || s > 300) return '—'; s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }

export function createHUD(ctx, root, state) {
  const p = state.player;
  const kind = p.kind;
  const cls = CLASSES[kind] || CLASSES.warrior;
  const resPal = RESOURCE[kind] || RESOURCE.mage;
  const slots = SLOTS.filter((s) => cls.abilities[s]);

  const el = document.createElement('div');
  el.className = 'hud';
  el.innerHTML = `
    <div class="hud-top">
      <div class="plaque">
        <div class="pl-cell rivals">${ICON.skull}<div><b>5</b><span>Rivals</span></div></div>
        <div class="pl-sep"></div>
        <div class="pl-cell zone"><div class="zl"><span class="stage">Stage I</span></div><div class="zt">${ICON.hourglass}<b>0:30</b></div><div class="zs">Circle closes</div></div>
        <div class="pl-sep"></div>
        <div class="pl-cell kills">${ICON.swords}<div><b>0</b><span>Slain</span></div></div>
      </div>
      <div class="rival-pips"></div>
    </div>
    <div class="minimap"><div class="map-wrap"></div><div class="map-label"><span class="ml-zone">Arena of Ash</span><span class="ml-gold"></span></div></div>
    <div class="feed"></div>
    <div class="announce"><div class="an-main"></div><div class="an-sub"></div></div>
    <div class="boss-bar"><div class="bb-name"><span class="bb-title"></span><small class="bb-sub"></small></div>
      <div class="bb-frame"><i class="bb-lag"></i><i class="bb-fill"></i><b class="bb-hp"></b></div></div>
    <div class="zone-warn"><b>Outside the circle</b><span>Return to the safe zone</span></div>
    <div class="hud-bottom">
      <div class="bar-plate">${barPlate(556, 128)}</div>
      <div class="globe hp" title="Life"><div class="globe-in"></div><div class="globe-val"></div></div>
      <div class="center">
        <div class="xp"><div class="lvl"><b></b></div><div class="xp-track"><i></i><div class="xp-ticks"></div></div></div>
        <div class="skills">${slots.map((s) => `
          <div class="skill" data-s="${s}">
            <div class="sk-icon" style="background-image:url(${abilityIcon(cls.abilities[s].name)})"></div>
            <div class="sk-cd"></div><div class="sk-num"></div><div class="sk-flash"></div>
            <div class="sk-key">${s === 'primary' ? ICON.mouseL : s === 'secondary' ? ICON.mouseR + '<small>Q</small>' : `<small>${SLOT_KEYS[s]}</small>`}</div>
            <div class="sk-tip"><b>${cls.abilities[s].name}</b><span>${cls.abilities[s].mana ? `${cls.abilities[s].mana} ${resPal.name}` : 'No cost'} &middot; ${cls.abilities[s].cd}s</span></div>
          </div>`).join('')}</div>
      </div>
      <div class="globe mp" title="${resPal.name}"><div class="globe-in"></div><div class="globe-val"></div></div>
    </div>
    <div class="vignette low"></div>
    <div class="vignette storm"></div>
    <div class="vignette hit"></div>`;
  root.append(el);

  const hpG = makeGlobe(HEALTH), mpG = makeGlobe(resPal);
  el.querySelector('.globe.hp .globe-in').append(hpG.canvas);
  el.querySelector('.globe.mp .globe-in').append(mpG.canvas);
  el.querySelector('.globe.hp').insertAdjacentHTML('beforeend', globeFrame(HEALTH.gem, 'left'));
  el.querySelector('.globe.mp').insertAdjacentHTML('beforeend', globeFrame(resPal.gem, 'right'));
  const map = makeMinimap(ctx);
  el.querySelector('.map-wrap').append(map.canvas);
  el.querySelector('.map-wrap').insertAdjacentHTML('beforeend', mapFrame());
  el.querySelector('.xp-ticks').innerHTML = '<i></i>'.repeat(9);

  const q = (s) => el.querySelector(s);
  const N = {
    hpVal: q('.globe.hp .globe-val'), mpVal: q('.globe.mp .globe-val'),
    rivals: q('.rivals b'), kills: q('.kills b'), stage: q('.stage'), timer: q('.zt b'), zs: q('.zs'), zoneCell: q('.pl-cell.zone'),
    lvl: q('.lvl b'), lvlBox: q('.lvl'), xp: q('.xp-track > i'), pips: q('.rival-pips'), gold: q('.ml-gold'),
    an: q('.announce'), anMain: q('.an-main'), anSub: q('.an-sub'),
    warn: q('.zone-warn'), low: q('.vignette.low'), storm: q('.vignette.storm'), hit: q('.vignette.hit'),
  };
  const skillEls = [...el.querySelectorAll('.skill')].map((d) => ({
    d, s: d.dataset.s, cd: d.querySelector('.sk-cd'), num: d.querySelector('.sk-num'), flash: d.querySelector('.sk-flash'), last: 0, fl: 0,
  }));

  // rival pips
  let pipEls = [];
  function buildPips(n) {
    N.pips.innerHTML = Array.from({ length: n }, () => `<i>${ICON.skull}</i>`).join('');
    pipEls = [...N.pips.children];
  }
  buildPips(state.rivals?.length || 5);

  function scale() {
    const z = Math.max(0.6, Math.min(1.35, Math.min(innerWidth / 1600, innerHeight / 900)));
    el.style.setProperty('--z', z.toFixed(3));
  }
  scale();
  addEventListener('resize', scale);

  let lastHp = p.hp, hitFlash = 0, hpFlash = 0, mapT = 0, lastStage = state.zone?.stage ?? 0;
  const announceQ = [];
  let anT = 0, anDur = 0;
  const B = { el: q('.boss-bar'), title: q('.bb-title'), sub: q('.bb-sub'), fill: q('.bb-fill'), lag: q('.bb-lag'), hp: q('.bb-hp'), o: 0, r: -1, lagR: 1, u: null };
  const deadRivals = new Set();
  let elimSeen = 0;
  const feedEl = q('.feed');
  const feedItems = [];
  function feed(html) {
    const d = document.createElement('div'); d.className = 'feed-item'; d.innerHTML = `<i>${ICON.skull}</i><div>${html}</div>`;
    feedEl.prepend(d); feedItems.push({ d, t: 0 });
    if (feedItems.length > 5) feedItems.shift().d.remove();
  }

  function announce(main, sub = '', dur = 3.2, tone = '') {
    announceQ.push({ main, sub, dur, tone });
  }
  announce('The Gauntlet Begins', `${state.rivalsLeft ?? 5} rivals stand between you and glory`, 2.0);

  return {
    el, announce,
    rivalsSlain: () => deadRivals.size,
    update(dt, t) {
      const pl = state.player;
      if (!pl) return;
      // ---- globes
      const hpR = Math.max(0, pl.hp) / (pl.maxHp || 1);
      if (pl.hp < lastHp - 0.5) { hitFlash = Math.min(1, hitFlash + (lastHp - pl.hp) / (pl.maxHp || 1) * 6); }
      if (pl.hp > lastHp + 0.5) hpFlash = 0.6;
      lastHp = pl.hp;
      hitFlash = Math.max(0, hitFlash - dt * 2.2); hpFlash = Math.max(0, hpFlash - dt * 2);
      hpG.draw(hpR, t, hpFlash);
      const mr = (pl.mana ?? 0) / (pl.maxMana || 100);
      mpG.draw(mr, t + 3, 0);
      setText(N.hpVal, `${Math.max(0, Math.ceil(pl.hp))}`);
      setText(N.mpVal, `${Math.floor(pl.mana ?? 0)}`);

      // ---- skills
      for (const s of skillEls) {
        const ab = cls.abilities[s.s];
        const cd = (pl.cooldowns && pl.cooldowns[s.s]) || 0;
        const frac = ab.cd ? Math.min(1, cd / ab.cd) : 0;
        const q100 = Math.round(frac * 200) / 200;
        if (s.q !== q100) {
          s.q = q100;
          // clock sweep: the remaining arc is a near-black fill with a thin warm leading edge
          const ang = (1 - q100) * 360;
          s.cd.style.background = q100 > 0 ? `conic-gradient(rgba(0,0,0,0) ${ang}deg, rgba(255,214,150,.75) ${ang}deg ${Math.min(360, ang + 2.2)}deg, rgba(3,2,2,.84) 0)` : 'none';
        }
        setText(s.num, cd > 0.05 && ab.cd >= 1.5 ? (cd < 1 ? cd.toFixed(1) : String(Math.ceil(cd))) : '');
        setClass(s.d, 'nomana', (pl.mana ?? 999) < (ab.mana || 0));
        setClass(s.d, 'cooling', cd > 0.05);
        if (s.last > 0.05 && cd <= 0.05 && ab.cd >= 1.5) s.fl = 1;
        s.last = cd;
        if (s.fl > 0 || s.flVis) {
          s.fl = Math.max(0, s.fl - dt * 2.5);
          s.flash.style.opacity = s.fl.toFixed(3);
          s.flVis = s.fl > 0;
        }
      }

      // ---- xp / level (optional fields from progression)
      const lv = pl.level;
      setClass(N.lvlBox, 'hidden', lv == null);
      if (lv != null) setText(N.lvl, String(lv));
      const need = pl.xpNext ?? pl.xpToNext ?? pl.nextXp ?? pl.xpMax;
      const xr = pl.xp != null && need ? Math.max(0, Math.min(1, pl.xp / need)) : 0;
      if (N.xp._r !== xr) { N.xp._r = xr; N.xp.style.transform = `scaleX(${xr})`; }
      const gold = pl.gold ?? state.gold;
      setText(N.gold, gold != null ? `${gold} gold` : '');

      // ---- top plaque
      // Single source of truth for counter + pips: living rivals in state.rivals (fallback: rivalsLeft / unit scan).
      const rivalList = state.rivals?.length ? state.rivals : (ctx.game?.units || []).filter((u) => u.rival);
      const total = rivalList.length || 5;
      const rl = rivalList.length ? rivalList.filter((u) => !u.dead).length : (state.rivalsLeft ?? 5);
      if (pipEls.length !== total) buildPips(total);
      setText(N.rivals, String(rl));
      setText(N.kills, String(state.kills ?? 0));
      const z = state.zone;
      if (z) {
        setText(N.stage, `Stage ${ROMAN[z.stage] || z.stage + 1}`);
        setText(N.timer, fmtTime(z.timer));
        const shrinking = Math.abs(z.radius - z.target) > 0.5;
        setText(N.zs, z.stage >= 4 ? 'Final circle' : shrinking ? 'Circle closing' : 'Circle closes in');
        setClass(N.zoneCell, 'urgent', z.timer < 10 && z.stage < 4);
        if (z.stage !== lastStage) {
          lastStage = z.stage;
          announce(`Stage ${ROMAN[z.stage] || z.stage + 1}`, z.stage >= 4 ? 'The final circle. Only one may leave.' : 'The circle tightens', 2.2, 'storm');
        }
      }
      // rival pips + rival-slain announcements
      const units = ctx.game?.units || [];
      let idx = 0;
      const elim = state.eliminated;
      if (elim) {
        while (elimSeen < elim.length) {
          const e = elim[elimSeen++];
          const cn = CLASSES[e.kind]?.name || 'Rival';
          if (e.by === 'you') announce('Rival Slain', `${e.name || 'The ' + cn} falls by your hand`, 2.0, 'blood');
          feed(`<b>${e.name || cn}</b> <span>${cn}</span> ${e.by === 'you' ? 'slain by <b class="you">you</b>' : e.by === 'the storm' ? 'consumed by <b class="storm">the storm</b>' : `slain by <b>${e.by}</b>`}`);
        }
      } else {
        for (const u of units) {
          if (u.rival && u.dead && !deadRivals.has(u)) { deadRivals.add(u); feed(`<b>${u.name || CLASSES[u.kind]?.name || 'Rival'}</b> has fallen`); }
        }
      }
      for (const pip of pipEls) { const dead = idx++ >= rl; if (pip.classList.contains('dead') !== dead) pip.classList.toggle('dead', dead); }
      // kill feed fade (game time)
      for (let i = feedItems.length - 1; i >= 0; i--) {
        const f = feedItems[i]; f.t += dt;
        if (f.t > 7) { f.d.remove(); feedItems.splice(i, 1); } else if (f.t > 6) f.d.style.opacity = (7 - f.t).toFixed(3);
      }

      // ---- minimap (20 Hz)
      mapT -= dt;
      if (mapT <= 0) { mapT = 0.05; map.draw(state, units, t); }

      // ---- boss bar: wide top-centre bar while a boss is near (~25m) or engaged
      let boss = null;
      for (const u of units) if (!u.dead && (u.boss === true || u.kind === 'warlord')) { boss = u; break; }
      let bossOn = false;
      if (boss) {
        const d = Math.hypot(boss.pos.x - pl.pos.x, boss.pos.z - pl.pos.z);
        const engaged = boss.hp < boss.maxHp - 0.01 || boss.target === pl || boss.lastAttacker === pl;
        bossOn = d < 25 || (engaged && d < 45);
        if (bossOn) {
          setText(B.title, boss.name || 'The Orc Warlord');
          setText(B.sub, boss.title || (boss.name ? 'Warlord of the Pit' : 'Boss'));
          const r = Math.max(0, Math.min(1, boss.hp / (boss.maxHp || 1)));
          if (B.u !== boss) { B.u = boss; B.lagR = r; }
          B.lagR = B.lagR > r ? Math.max(r, B.lagR - dt * 0.35) : r;
          if (B.r !== r) { B.r = r; B.fill.style.transform = `scaleX(${r})`; }
          B.lag.style.transform = `scaleX(${B.lagR.toFixed(4)})`;
          setText(B.hp, `${Math.max(0, Math.ceil(boss.hp))} / ${Math.ceil(boss.maxHp)}`);
        }
      }
      B.o += ((bossOn ? 1 : 0) - B.o) * Math.min(1, dt * 6);
      if (Math.abs(B.o - (B.lastO ?? -1)) > 0.002) { B.lastO = B.o; B.el.style.opacity = B.o.toFixed(3); B.el.style.visibility = B.o > 0.01 ? 'visible' : 'hidden'; }

      // ---- zone warning & vignettes
      let outside = false;
      if (z) outside = Math.hypot(pl.pos.x - (z.center?.x || 0), pl.pos.z - (z.center?.z || 0)) > z.radius && !pl.dead;
      const pulse = 0.5 + 0.5 * Math.sin(t * 5);
      N.warn.style.opacity = outside ? (0.7 + 0.3 * pulse).toFixed(3) : '0';
      if (N.zoneCell._c?.urgent) N.timer.style.opacity = (0.65 + 0.35 * (0.5 + 0.5 * Math.sin(t * 7))).toFixed(3);
      else if (N.timer.style.opacity) N.timer.style.opacity = '';
      N.storm.style.opacity = outside ? (0.55 + 0.35 * pulse).toFixed(3) : '0';
      // subtle hint below 45%, real pulse only below 30% (the engine already has a vignette)
      let lowO = 0;
      if (!pl.dead && hpR < 0.45) {
        if (hpR >= 0.3) lowO = ((0.45 - hpR) / 0.15) * 0.18;
        else { const k = (0.3 - hpR) / 0.3, beat = 0.5 + 0.5 * Math.sin(t * (4 + k * 5)); lowO = 0.3 + k * 0.5 * (0.6 + 0.4 * beat); }
      }
      N.low.style.opacity = lowO.toFixed(3);
      N.hit.style.opacity = hitFlash.toFixed(3);

      // ---- announcements (game time)
      if (anDur <= 0 && announceQ.length) {
        const a = announceQ.shift();
        setText(N.anMain, a.main); setText(N.anSub, a.sub);
        N.an.className = `announce ${a.tone}`;
        anDur = a.dur; anT = 0;
      }
      if (anDur > 0) {
        anT += dt;
        const fi = Math.min(1, anT / 0.2), fo = Math.min(1, (anDur - anT) / 0.45);
        const o = Math.max(0, Math.min(fi, fo));
        N.an.style.opacity = o.toFixed(3);
        N.an.style.transform = `translate(-50%, 0) scale(${(1.05 - 0.05 * fi).toFixed(4)})`;
        if (anT >= anDur) { anDur = 0; N.an.style.opacity = '0'; }
      }
    },
    destroy() { removeEventListener('resize', scale); el.remove(); },
  };
}
