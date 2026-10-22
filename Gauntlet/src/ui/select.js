// Title / class-select screen with live 3D character previews.
// One transparent WebGL canvas sits above the cards (pointer-events: none) and renders each
// character into its card's portrait rect with scissor/viewport. Animated from ui.update(dt),
// so ?shot=1 stepping stays deterministic.
import * as THREE from 'three';
import { CLASSES } from '../game/classes.js';
import { abilityIcon } from './icons.js';
import { CLASS_LORE, ABILITY_LORE, SLOT_KEYS, SLOT_LABEL } from './lore.js';
import { divider, corner } from './ornaments.js';

const SLOTS = ['primary', 'secondary', 'ultimate', 'dodge'];

// Procedural cathedral-nave backdrop: receding gothic arches, god-rays, brazier glow, embers, grain.
function paintBackdrop(cv) {
  const W = cv.width = Math.max(2, Math.round(innerWidth)), H = cv.height = Math.max(2, Math.round(innerHeight));
  const g = cv.getContext('2d');
  let s = 1234; const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  let gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, '#060404'); gr.addColorStop(0.5, '#110b09'); gr.addColorStop(1, '#070504');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  // distant rose window glow
  gr = g.createRadialGradient(W / 2, H * 0.16, 0, W / 2, H * 0.16, H * 0.5);
  gr.addColorStop(0, 'rgba(150,90,60,.22)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  // god-rays
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 9; i++) {
    const x = W * (0.3 + r() * 0.4), w = W * (0.015 + r() * 0.04), sk = (r() - 0.5) * W * 0.35;
    const lg = g.createLinearGradient(0, 0, 0, H);
    lg.addColorStop(0, `rgba(255,190,130,${0.03 + r() * 0.04})`); lg.addColorStop(0.8, 'rgba(255,170,110,0)');
    g.fillStyle = lg;
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x + w, 0); g.lineTo(x + w * 3 + sk, H); g.lineTo(x + sk, H); g.closePath(); g.fill();
  }
  g.globalCompositeOperation = 'source-over';
  // receding arches on both sides
  const horizon = H * 0.62;
  for (let k = 7; k >= 0; k--) {
    const depth = k / 7; // 1 = far
    const sc = 1 - depth * 0.78;
    const colW = W * 0.03 * sc + 3, archH = H * 1.05 * sc, gap = W * 0.42 * sc;
    const shade = Math.round(4 + depth * 14);
    for (const side of [-1, 1]) {
      const cx = W / 2 + side * (W * 0.08 + gap);
      const top = horizon - archH * 0.85;
      g.fillStyle = `rgb(${shade + 2},${shade},${shade})`;
      g.fillRect(cx - colW / 2, top, colW, H - top);
      // pointed arch spanning toward the next column inward
      const inner = W / 2 + side * (W * 0.08 + gap * 0.62);
      const ax = (cx + inner) / 2, aw = Math.abs(cx - inner) / 2;
      g.strokeStyle = `rgb(${shade + 2},${shade},${shade})`; g.lineWidth = colW * 0.7;
      g.beginPath(); g.moveTo(cx, top + archH * 0.12); g.quadraticCurveTo(cx, top - archH * 0.12, ax, top - archH * 0.22);
      g.quadraticCurveTo(inner, top - archH * 0.12, inner, top + archH * 0.12); g.stroke();
      // rim light on column edge facing centre
      g.fillStyle = `rgba(255,150,90,${0.05 + (1 - depth) * 0.05})`;
      g.fillRect(side < 0 ? cx + colW / 2 - 2 : cx - colW / 2, top, 2, H - top);
    }
  }
  // fog bank and brazier glow at floor
  gr = g.createLinearGradient(0, horizon - H * 0.1, 0, H);
  gr.addColorStop(0, 'rgba(40,28,24,0)'); gr.addColorStop(0.5, 'rgba(40,28,24,.35)'); gr.addColorStop(1, 'rgba(10,6,5,.9)');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  gr = g.createRadialGradient(W / 2, H * 1.02, 0, W / 2, H * 1.02, H * 0.6);
  gr.addColorStop(0, 'rgba(200,70,20,.5)'); gr.addColorStop(0.5, 'rgba(120,30,10,.18)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  // embers
  for (let i = 0; i < 140; i++) {
    const x = r() * W, y = H * (0.35 + r() * 0.65), a = r() * 0.5 * (y / H);
    g.fillStyle = `rgba(255,${120 + r() * 80 | 0},60,${a})`; g.fillRect(x, y, 1 + r() * 1.5, 1 + r() * 1.5);
  }
  // grain
  const img = g.getImageData(0, 0, W, H), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (r() - 0.5) * 10; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  g.putImageData(img, 0, 0);
}

export function createClassSelect(ctx, root, onPick) {
  const keys = Object.keys(CLASSES);
  let selected = keys[0];
  let hovered = null;
  let leaving = -1;

  const el = document.createElement('div');
  el.className = 'select';
  el.innerHTML = `
    <canvas class="sel-bg"></canvas>
    <div class="sel-fog"></div>
    <div class="sel-vignette"></div>
    <header class="sel-title">
      <div class="sel-sub">Six enter &middot; One leaves</div>
      <h1>Gauntlet</h1>
      ${divider(420)}
      <div class="sel-prompt">Choose your champion</div>
    </header>
    <div class="cards">${keys.map((k, i) => {
      const c = CLASSES[k], L = CLASS_LORE[k] || { title: '', role: '', resource: '', flavour: '', accent: '#c0141a' };
      const hpPct = Math.min(100, (c.hp / 240) * 100), spPct = Math.min(100, (c.speed / 6) * 100);
      return `<div class="card" data-k="${k}" style="--accent:${L.accent}" tabindex="0">
        ${corner()}${corner()}${corner()}${corner()}
        <div class="crest">${['I', 'II', 'III', 'IV'][i] || i + 1}</div><div class="portrait"></div>
        <div class="info">
          <div class="role">${L.role}<span>&#9670;</span>${L.resource}</div>
          <h2>${c.name}</h2>
          <div class="cls-title">${L.title}</div>
          ${divider(300)}
          <p class="flavour">${L.flavour}</p>
          <ul class="abilities">${SLOTS.filter((s) => c.abilities[s]).map((s) => {
            const a = c.abilities[s];
            return `<li><img src="${abilityIcon(a.name)}" alt=""><div><div class="ab-head"><b>${a.name}</b><em>${SLOT_LABEL[s]}</em><kbd>${SLOT_KEYS[s]}</kbd></div>
              <p>${ABILITY_LORE[a.name.toLowerCase()] || ''}</p></div></li>`;
          }).join('')}</ul>
          <div class="stats">
            <div><span>Life</span><i><b style="width:${hpPct}%"></b></i><em>${c.hp}</em></div>
            <div><span>Speed</span><i><b style="width:${spPct}%"></b></i><em>${c.speed}</em></div>
          </div>
        </div>
      </div>`;
    }).join('')}</div>
    <div class="sel-actions">
      <button class="enter"><span>Enter the Gauntlet</span></button>
      <div class="sel-hint"><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd> choose &nbsp;&middot;&nbsp; <kbd>Enter</kbd> begin</div>
    </div>`;
  root.append(el);

  const cards = [...el.querySelectorAll('.card')];
  // Each portrait gets a 2D canvas; the 3D preview is rendered with the MAIN renderer into a corner of
  // its drawing buffer and blitted here (a second WebGL context breaks SwiftShader compositing).
  const pvs = cards.map((c) => {
    const cv = document.createElement('canvas'); cv.className = 'pv';
    c.querySelector('.portrait').prepend(cv);
    return { cv, g: cv.getContext('2d') };
  });

  // ---------- 3D previews ----------
  const renderer = ctx.engine.renderer;
  const size = new THREE.Vector2();
  const prevClear = new THREE.Color();

  function backdropTex(accent) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 320;
    const g = c.getContext('2d');
    const lg = g.createLinearGradient(0, 0, 0, 320);
    lg.addColorStop(0, '#030202'); lg.addColorStop(0.55, '#0a0707'); lg.addColorStop(1, '#050404');
    g.fillStyle = lg; g.fillRect(0, 0, 256, 320);
    const col = new THREE.Color(accent);
    const rgba = (a) => `rgba(${(col.r * 255) | 0},${(col.g * 255) | 0},${(col.b * 255) | 0},${a})`;
    let rg = g.createRadialGradient(128, 250, 4, 128, 250, 150);
    rg.addColorStop(0, rgba(0.2)); rg.addColorStop(1, rgba(0));
    g.fillStyle = rg; g.fillRect(0, 0, 256, 320);
    rg = g.createRadialGradient(128, 120, 4, 128, 120, 120);
    rg.addColorStop(0, 'rgba(120,110,100,.16)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg; g.fillRect(0, 0, 256, 320);
    // gothic arch window
    g.strokeStyle = 'rgba(201,164,92,.10)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(66, 300); g.lineTo(66, 120); g.quadraticCurveTo(66, 40, 128, 22); g.quadraticCurveTo(190, 40, 190, 120); g.lineTo(190, 300); g.stroke();
    g.strokeStyle = 'rgba(201,164,92,.05)';
    g.beginPath(); g.moveTo(80, 300); g.lineTo(80, 126); g.quadraticCurveTo(80, 58, 128, 40); g.quadraticCurveTo(176, 58, 176, 126); g.lineTo(176, 300); g.stroke();
    // mist bands
    let s = 3; const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < 26; i++) {
      const x = r() * 256, y = 190 + r() * 120, w = 60 + r() * 120;
      const m = g.createRadialGradient(x, y, 0, x, y, w);
      m.addColorStop(0, `rgba(150,130,120,${0.035 + r() * 0.035})`); m.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = m; g.fillRect(x - w, y - w, w * 2, w * 2);
    }
    const v = g.createRadialGradient(128, 170, 80, 128, 170, 220);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.75)');
    g.fillStyle = v; g.fillRect(0, 0, 256, 320);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }

  const runeTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    g.translate(128, 128);
    g.strokeStyle = '#fff'; g.lineWidth = 3;
    g.beginPath(); g.arc(0, 0, 120, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 1.5; g.beginPath(); g.arc(0, 0, 104, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(0, 0, 70, 0, Math.PI * 2); g.stroke();
    for (let i = 0; i < 5; i++) { // pentagram
      const a = -Math.PI / 2 + i * Math.PI * 4 / 5, b = -Math.PI / 2 + (i + 1) * Math.PI * 4 / 5;
      g.beginPath(); g.moveTo(Math.cos(a) * 104, Math.sin(a) * 104); g.lineTo(Math.cos(b) * 104, Math.sin(b) * 104); g.stroke();
    }
    g.font = '14px serif'; g.fillStyle = '#fff'; g.textAlign = 'center';
    const runes = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ';
    for (let i = 0; i < 24; i++) { g.save(); g.rotate(i / 24 * Math.PI * 2); g.fillText(runes[i], 0, -108); g.restore(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const stoneTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(128, 128, 10, 128, 128, 128);
    gr.addColorStop(0, '#4a443c'); gr.addColorStop(0.85, '#2a2622'); gr.addColorStop(1, '#141210');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    let s = 7; const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < 3000; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,240,220'},${r() * 0.12})`; g.fillRect(r() * 256, r() * 256, 2, 2); }
    g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 2;
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; g.beginPath(); g.moveTo(128 + Math.cos(a) * 40, 128 + Math.sin(a) * 40); g.lineTo(128 + Math.cos(a) * 128, 128 + Math.sin(a) * 128); g.stroke(); }
    g.beginPath(); g.arc(128, 128, 40, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.arc(128, 128, 88, 0, Math.PI * 2); g.stroke();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();

  const mistTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    let s = 11; const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < 40; i++) {
      const a = r() * Math.PI * 2, d = 40 + r() * 70, x = 128 + Math.cos(a) * d, y = 128 + Math.sin(a) * d, w = 30 + r() * 50;
      const rg = g.createRadialGradient(x, y, 0, x, y, w);
      rg.addColorStop(0, `rgba(255,255,255,${0.12 + r() * 0.12})`); rg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = rg; g.fillRect(x - w, y - w, w * 2, w * 2);
    }
    g.globalCompositeOperation = 'destination-in';
    const m = g.createRadialGradient(128, 128, 60, 128, 128, 128);
    m.addColorStop(0, 'rgba(0,0,0,1)'); m.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = m; g.fillRect(0, 0, 256, 256);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const emberTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const g = c.getContext('2d'); const rg = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.25, 'rgba(255,255,255,.6)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg; g.fillRect(0, 0, 32, 32);
    return new THREE.CanvasTexture(c);
  })();

  const views = keys.map((k) => {
    const L = CLASS_LORE[k] || { rim: 0xff4020, key: 0xffd8b0 };
    const scene = new THREE.Scene();
    scene.background = backdropTex(L.accent || '#c0141a');
    scene.fog = new THREE.Fog(0x0c0909, 7, 16);
    const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 60);
    // Neutral/cool lighting so materials read true (steel as steel): a moonlit key and a cool white back
    // rim do the modelling; the class colour is only a subtle side rim and a faint uplight on the dais.
    const hemi = new THREE.HemisphereLight(0x7a88a0, 0x14100c, 0.6);
    const keyL = new THREE.DirectionalLight(L.key, 3.6);
    keyL.position.set(-2.5, 4.2, 3.2);
    keyL.castShadow = true; keyL.shadow.mapSize.set(512, 512);
    Object.assign(keyL.shadow.camera, { left: -2, right: 2, top: 3, bottom: -1, near: 0.5, far: 12 });
    keyL.shadow.bias = -0.001;
    const rim = new THREE.DirectionalLight(0xb4c6e0, 3);
    rim.position.set(2.5, 3, -3.5);
    const rim2 = new THREE.DirectionalLight(L.rim, 1.2);
    rim2.position.set(-3, 1.5, -2.5);
    const under = new THREE.PointLight(L.rim, 0.8, 2.2, 2);
    under.position.set(0, -0.05, 0.9);
    // faint ember glow that only reaches the dais and boots, not the face
    const brazier = new THREE.PointLight(0xff5a20, 1.0, 2.4, 2);
    brazier.position.set(0.3, -0.3, 1.5);
    scene.add(brazier);
    scene.add(hemi, keyL, rim, rim2, under);

    const dais = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.5, 0.2, 48), new THREE.MeshStandardMaterial({ map: stoneTex, color: 0xb0a898, roughness: 0.92 }));
    dais.position.y = -0.1; dais.receiveShadow = true;
    const runeMat = new THREE.MeshBasicMaterial({ map: runeTex, color: new THREE.Color(L.rim), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });
    const rune = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 2.5), runeMat);
    rune.rotation.x = -Math.PI / 2; rune.position.y = 0.006;
    // stone plinth (two tiers) and a pool of low mist around its base
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.62, 1.8, 0.3, 48), new THREE.MeshStandardMaterial({ map: stoneTex, color: 0x807870, roughness: 0.95 }));
    plinth.position.y = -0.35; plinth.receiveShadow = true;
    const step = new THREE.Mesh(new THREE.CylinderGeometry(1.42, 1.42, 0.04, 48), new THREE.MeshStandardMaterial({ color: 0x3a2e22, roughness: 0.6, metalness: 0.6 }));
    step.position.y = -0.21;
    const fogMats = [];
    // dark floor the plinth stands on, then three mist layers hugging its base
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshBasicMaterial({ map: mistTex, color: 0x1e1712, transparent: true, opacity: 0.95, depthWrite: false }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -0.5; floor.renderOrder = 1;
    scene.add(floor);
    const FOG = [[9, -0.46, 0x8a7e76, 0.9], [6, -0.28, 0x9a8c82, 0.75], [3.9, 0.03, 0x8a7c72, 0.25]];
    const fogs = FOG.map(([size, y, col, op]) => {
      const m = new THREE.MeshBasicMaterial({ map: mistTex, color: col, transparent: true, opacity: op, depthWrite: false });
      fogMats.push(m);
      const f = new THREE.Mesh(new THREE.PlaneGeometry(size, size), m);
      f.rotation.x = -Math.PI / 2; f.position.y = y; f.renderOrder = 2;
      return f;
    });
    scene.add(dais, rune, plinth, step, ...fogs);

    // rising embers
    const N = 50, pos = new Float32Array(N * 3), seeds = [];
    for (let i = 0; i < N; i++) { seeds.push([Math.random() * Math.PI * 2, 0.4 + Math.random() * 1.2, Math.random() * 3, 0.2 + Math.random() * 0.4]); }
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(pg, new THREE.PointsMaterial({ map: emberTex, color: L.rim, size: 0.07, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
    scene.add(pts);

    const actor = ctx.assets.createActor(k);
    scene.add(actor.root);
    const idle = CLASSES[k].idle || 'Idle';
    actor.play(idle);
    // frame the character
    const box = new THREE.Box3().setFromObject(actor.root);
    const h = Math.max(1.2, box.max.y - box.min.y);
    return { fogs, k, L, scene, camera, actor, idle, h, rim, rim2, under, runeMat, pts, seeds, pos, sig: 0, t: Math.random() * 10, hl: 0 };
  });

  function play(v, name) {
    if (!v.actor.clips[name]) return;
    v.actor.play(name, { loop: false, force: true });
    v.sig = v.actor.duration(name) * 0.95;
  }

  function setSelected(k) {
    selected = k;
    cards.forEach((c) => c.classList.toggle('selected', c.dataset.k === k));
    const v = views.find((x) => x.k === k);
    if (v) play(v, v.L.signature);
  }

  function begin() {
    if (leaving >= 0) return;
    leaving = 0;
    el.classList.add('leaving');
    onPick(selected);
  }

  cards.forEach((c) => {
    c.addEventListener('pointerenter', () => {
      hovered = c.dataset.k;
      const v = views.find((x) => x.k === hovered);
      if (v && v.sig <= 0) play(v, v.L.signature);
    });
    c.addEventListener('pointerleave', () => { if (hovered === c.dataset.k) hovered = null; });
    c.addEventListener('click', () => { if (selected === c.dataset.k) begin(); else setSelected(c.dataset.k); });
    c.addEventListener('dblclick', () => { setSelected(c.dataset.k); begin(); });
  });
  el.querySelector('.enter').addEventListener('click', begin);
  const onKey = (e) => {
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= keys.length) setSelected(keys[n - 1]);
    else if (e.key === 'Enter') begin();
    else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const i = (keys.indexOf(selected) + (e.key === 'ArrowRight' ? 1 : keys.length - 1)) % keys.length;
      setSelected(keys[i]);
    }
  };
  addEventListener('keydown', onKey);
  cards.forEach((c) => c.classList.toggle('selected', c.dataset.k === selected));

  // Fit the whole screen (title + cards + button) to the viewport.
  let fitW = 0, fitH = 0;
  function fit() {
    if (fitW === innerWidth && fitH === innerHeight) return;
    fitW = innerWidth; fitH = innerHeight;
    paintBackdrop(el.querySelector('.sel-bg'));
    el.style.setProperty('--z', '1');
    const natural = el.querySelector('.sel-title').offsetHeight + el.querySelector('.cards').offsetHeight + el.querySelector('.sel-actions').offsetHeight + 70;
    const z = Math.max(0.5, Math.min(1.3, innerHeight / natural, innerWidth / 1400));
    el.style.setProperty('--z', z.toFixed(3));
    pvs.forEach((p, i) => {
      const r = cards[i].querySelector('.portrait').getBoundingClientRect();
      const pr = Math.max(2, devicePixelRatio || 1); // supersample previews (crisp at DPR 1, native at DPR 2+)
      p.w = Math.max(2, Math.round(r.width)); p.h = Math.max(2, Math.round(r.height));
      p.cv.width = Math.round(p.w * pr); p.cv.height = Math.round(p.h * pr);
    });
  }
  fit();
  addEventListener('resize', fit);

  return {
    update(dt) {
      if (leaving >= 0) {
        leaving += dt;
        if (leaving > 0.9) this.destroy();
        return;
      }
      fit();
      // save main-renderer state
      const prevTarget = renderer.getRenderTarget();
      const prevTM = renderer.toneMapping, prevExp = renderer.toneMappingExposure, prevAuto = renderer.autoClear;
      renderer.getClearColor(prevClear); const prevAlpha = renderer.getClearAlpha();
      renderer.getSize(size);
      const pr = renderer.getPixelRatio();
      const canvasH = renderer.domElement.height;
      renderer.setRenderTarget(null);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.3;
      renderer.autoClear = true;
      renderer.setScissorTest(true);
      for (let i = 0; i < views.length; i++) {
        const v = views[i], p = pvs[i];
        v.t += dt;
        const active = v.k === selected, hot = v.k === hovered;
        v.hl += ((active ? 1 : hot ? 0.6 : 0) - v.hl) * Math.min(1, dt * 5);
        // signature animation, then back to idle
        if (v.sig > 0) { v.sig -= dt; if (v.sig <= 0) v.actor.play(v.idle); }
        v.actor.update(dt);
        v.fogs[0].rotation.z += dt * 0.05; v.fogs[1].rotation.z -= dt * 0.08; v.fogs[2].rotation.z += dt * 0.11;
        v.actor.root.rotation.y = 0.35 + Math.sin(v.t * 0.35) * 0.35;
        v.rim.intensity = 2.6 + v.hl * 1.6;
        v.rim2.intensity = 0.8 + v.hl * 1.4;
        v.under.intensity = 0.6 + v.hl * 1.4 + Math.sin(v.t * 3) * 0.15;
        v.runeMat.opacity = 0.18 + v.hl * 0.5;
        // embers
        for (let j = 0; j < v.seeds.length; j++) {
          const [a, rad, off, sp] = v.seeds[j];
          const life = (v.t * sp + off) % 3;
          v.pos[j * 3] = Math.cos(a + life * 0.6) * rad;
          v.pos[j * 3 + 1] = life * 1.1;
          v.pos[j * 3 + 2] = Math.sin(a + life * 0.6) * rad * 0.6;
        }
        v.pts.geometry.attributes.position.needsUpdate = true;
        v.pts.material.opacity = 0.35 + v.hl * 0.6;
        // camera framing: full body, slightly low angle
        const w = Math.min(p.cv.width / pr, size.x), h = Math.min(p.cv.height / pr, size.y);
        const aspect = w / h;
        v.camera.aspect = aspect;
        const dist = (v.h * 0.84) / Math.tan(THREE.MathUtils.degToRad(v.camera.fov / 2)) * Math.max(1, 0.75 / aspect);
        const sway = Math.sin(v.t * 0.2) * 0.25;
        v.camera.position.set(Math.sin(sway) * dist, v.h * 0.34, Math.cos(sway) * dist);
        v.camera.lookAt(0, v.h * 0.36, 0);
        v.camera.updateProjectionMatrix();
        renderer.setViewport(0, 0, w, h);
        renderer.setScissor(0, 0, w, h);
        renderer.render(v.scene, v.camera);
        const sw = Math.round(w * pr), sh = Math.round(h * pr);
        p.g.drawImage(renderer.domElement, 0, canvasH - sh, sw, sh, 0, 0, p.cv.width, p.cv.height);
      }
      // restore
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, size.x, size.y);
      renderer.setScissor(0, 0, size.x, size.y);
      renderer.toneMapping = prevTM; renderer.toneMappingExposure = prevExp; renderer.autoClear = prevAuto;
      renderer.setClearColor(prevClear, prevAlpha);
      renderer.setRenderTarget(prevTarget);
    },
    destroy() {
      removeEventListener('keydown', onKey);
      removeEventListener('resize', fit);
      for (const v of views) {
        v.scene.background?.dispose?.();
        v.pts.geometry.dispose(); v.pts.material.dispose(); v.runeMat.dispose();
      }
      runeTex.dispose(); stoneTex.dispose(); emberTex.dispose(); mistTex.dispose();
      el.remove();
      this.update = () => {};
    },
  };
}
