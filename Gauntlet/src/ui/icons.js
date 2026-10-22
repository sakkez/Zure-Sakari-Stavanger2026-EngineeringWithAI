// Procedural ability icons (canvas 2D). Each icon is drawn once and cached as a data URL.
// Keyed by ability name (lower-case); unknown names fall back to a generic rune for the slot.

const SCHOOL = {
  fire: { a: '#4a1406', b: '#0d0302', glow: '#ff7a1a' },
  frost: { a: '#0d3352', b: '#020812', glow: '#8fdcff' },
  arcane: { a: '#341258', b: '#07030d', glow: '#c995ff' },
  steel: { a: '#46261a', b: '#0d0604', glow: '#ffcf8a' },
  hunt: { a: '#24341a', b: '#050803', glow: '#d6f08e' },
};

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

function bg(g, S, school, seed = 7) {
  const c = SCHOOL[school];
  const gr = g.createRadialGradient(S * 0.5, S * 0.45, S * 0.04, S * 0.5, S * 0.5, S * 0.78);
  gr.addColorStop(0, c.a); gr.addColorStop(1, c.b);
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  // grime / stone grain
  const r = rng(seed);
  for (let i = 0; i < 900; i++) {
    const v = r();
    g.fillStyle = v < 0.5 ? `rgba(0,0,0,${0.18 * r()})` : `rgba(255,235,200,${0.05 * r()})`;
    g.fillRect(r() * S, r() * S, 1 + r() * 2, 1 + r() * 2);
  }
}

function finish(g, S) {
  const v = g.createRadialGradient(S / 2, S / 2, S * 0.28, S / 2, S / 2, S * 0.74);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.8)');
  g.fillStyle = v; g.fillRect(0, 0, S, S);
  // top sheen
  const sh = g.createLinearGradient(0, 0, 0, S * 0.5);
  sh.addColorStop(0, 'rgba(255,240,210,0.10)'); sh.addColorStop(1, 'rgba(255,240,210,0)');
  g.fillStyle = sh; g.fillRect(0, 0, S, S * 0.5);
  g.lineWidth = 2; g.strokeStyle = 'rgba(0,0,0,0.9)'; g.strokeRect(1, 1, S - 2, S - 2);
  g.strokeStyle = 'rgba(255,225,170,0.14)'; g.strokeRect(4, 4, S - 8, S - 8);
}

function glow(g, color, blur) { g.shadowColor = color; g.shadowBlur = blur; }
function noGlow(g) { g.shadowBlur = 0; g.shadowColor = 'transparent'; }

// Flame teardrop: round head at (hx,hy) radius r, tail to (tx,ty)
function teardrop(g, hx, hy, r, tx, ty, bend = 0) {
  const a = Math.atan2(ty - hy, tx - hx);
  const px = -Math.sin(a), py = Math.cos(a);
  const mx = (hx + tx) / 2 + px * bend, my = (hy + ty) / 2 + py * bend;
  g.beginPath();
  g.moveTo(hx + px * r, hy + py * r);
  g.quadraticCurveTo(mx + px * r * 0.4, my + py * r * 0.4, tx, ty);
  g.quadraticCurveTo(mx - px * r * 0.4, my - py * r * 0.4, hx - px * r, hy - py * r);
  g.arc(hx, hy, r, a - Math.PI / 2, a + Math.PI / 2, true);
  g.closePath();
}

function radialBlob(g, x, y, r, stops) {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  stops.forEach(([o, c]) => gr.addColorStop(o, c));
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
}

function arrow(g, x1, y1, x2, y2, w = 3, head = 10, color = '#e8dcc0', fletch = '#b0e070') {
  const a = Math.atan2(y2 - y1, x2 - x1), ca = Math.cos(a), sa = Math.sin(a);
  g.strokeStyle = color; g.lineWidth = w; g.lineCap = 'round';
  g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2 - ca * head * 0.6, y2 - sa * head * 0.6); g.stroke();
  g.fillStyle = color;
  g.beginPath(); g.moveTo(x2 + ca * head * 0.3, y2 + sa * head * 0.3);
  g.lineTo(x2 - ca * head + -sa * head * 0.5, y2 - sa * head + ca * head * 0.5);
  g.lineTo(x2 - ca * head * 0.7, y2 - sa * head * 0.7);
  g.lineTo(x2 - ca * head - -sa * head * 0.5, y2 - sa * head - ca * head * 0.5);
  g.closePath(); g.fill();
  g.fillStyle = fletch;
  for (const s of [1, -1]) {
    g.beginPath();
    g.moveTo(x1 + ca * head * 1.1, y1 + sa * head * 1.1);
    g.lineTo(x1 + ca * head * 0.2 + -sa * head * 0.55 * s, y1 + sa * head * 0.2 + ca * head * 0.55 * s);
    g.lineTo(x1 - ca * head * 0.2 + -sa * head * 0.55 * s, y1 - sa * head * 0.2 + ca * head * 0.55 * s);
    g.lineTo(x1, y1);
    g.closePath(); g.fill();
  }
}

function star4(g, x, y, r, color) {
  g.fillStyle = color; g.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4 - Math.PI / 2, rr = i % 2 ? r * 0.18 : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath(); g.fill();
}

function blade(g, x1, y1, x2, y2, w, guard = true) {
  // greatsword from pommel (x1,y1) to tip (x2,y2)
  const a = Math.atan2(y2 - y1, x2 - x1), ca = Math.cos(a), sa = Math.sin(a), px = -sa, py = ca;
  const L = Math.hypot(x2 - x1, y2 - y1);
  const gx = x1 + ca * L * 0.22, gy = y1 + sa * L * 0.22;
  const bl = g.createLinearGradient(gx + px * w, gy + py * w, gx - px * w, gy - py * w);
  bl.addColorStop(0, '#f4ecdc'); bl.addColorStop(0.5, '#9a958c'); bl.addColorStop(1, '#3a3632');
  g.fillStyle = bl;
  g.beginPath();
  g.moveTo(gx + px * w, gy + py * w); g.lineTo(x2 - ca * w * 2 + px * w * 0.8, y2 - sa * w * 2 + py * w * 0.8);
  g.lineTo(x2, y2);
  g.lineTo(x2 - ca * w * 2 - px * w * 0.8, y2 - sa * w * 2 - py * w * 0.8); g.lineTo(gx - px * w, gy - py * w);
  g.closePath(); g.fill();
  g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 1; g.stroke();
  // grip
  g.strokeStyle = '#3b2414'; g.lineWidth = w * 1.1; g.lineCap = 'round';
  g.beginPath(); g.moveTo(x1, y1); g.lineTo(gx, gy); g.stroke();
  if (guard) {
    g.strokeStyle = '#c99a4a'; g.lineWidth = w * 0.9;
    g.beginPath(); g.moveTo(gx + px * w * 3.2, gy + py * w * 3.2); g.lineTo(gx - px * w * 3.2, gy - py * w * 3.2); g.stroke();
    g.fillStyle = '#c99a4a'; g.beginPath(); g.arc(x1, y1, w * 0.9, 0, Math.PI * 2); g.fill();
  }
}

const DRAW = {
  fireball(g, S) {
    bg(g, S, 'fire', 11);
    g.globalCompositeOperation = 'lighter';
    glow(g, '#ff4a00', 24);
    const hx = 78, hy = 50;
    const layers = [[30, '#7a1004', 0.9, 14], [24, '#d23a08', 0.9, 8], [17, '#ff8a1a', 0.95, 4], [10, '#ffe08a', 1, 2]];
    for (const [r, c, al, bend] of layers) {
      const lg = g.createLinearGradient(14, 112, hx, hy);
      lg.addColorStop(0, 'rgba(0,0,0,0)'); lg.addColorStop(0.55, c); lg.addColorStop(1, c);
      g.globalAlpha = al; g.fillStyle = lg;
      teardrop(g, hx, hy, r * 0.62, 14 + r * 0.2, 114 - r * 0.2, bend); g.fill();
      teardrop(g, hx, hy, r * 0.42, 6 + r * 0.6, 92 - r * 0.1, -bend * 2); g.fill();
    }
    g.globalAlpha = 1; noGlow(g);
    radialBlob(g, hx, hy, 26, [[0, 'rgba(255,255,240,1)'], [0.3, 'rgba(255,220,120,.95)'], [0.65, 'rgba(255,120,20,.6)'], [1, 'rgba(255,60,0,0)']]);
    g.globalCompositeOperation = 'source-over';
  },
  'frost nova'(g, S) {
    bg(g, S, 'frost', 23);
    const c = S / 2;
    g.globalCompositeOperation = 'lighter';
    glow(g, '#5ac8ff', 18);
    g.strokeStyle = 'rgba(140,220,255,.85)'; g.lineWidth = 4;
    g.beginPath(); g.arc(c, c, 46, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = 'rgba(200,240,255,.5)'; g.lineWidth = 1.5;
    g.beginPath(); g.arc(c, c, 38, 0, Math.PI * 2); g.stroke();
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 6 + 0.13, L = i % 2 ? 34 : 54, w = i % 2 ? 5 : 8;
      const ca = Math.cos(a), sa = Math.sin(a);
      const lg = g.createLinearGradient(c, c, c + ca * L, c + sa * L);
      lg.addColorStop(0, '#ffffff'); lg.addColorStop(0.5, '#9fe2ff'); lg.addColorStop(1, 'rgba(60,150,255,.2)');
      g.fillStyle = lg;
      g.beginPath();
      g.moveTo(c + ca * 8 - sa * w * 0.4, c + sa * 8 + ca * w * 0.4);
      g.lineTo(c + ca * L * 0.45 - sa * w, c + sa * L * 0.45 + ca * w);
      g.lineTo(c + ca * L, c + sa * L);
      g.lineTo(c + ca * L * 0.45 + sa * w, c + sa * L * 0.45 - ca * w);
      g.lineTo(c + ca * 8 + sa * w * 0.4, c + sa * 8 - ca * w * 0.4);
      g.closePath(); g.fill();
    }
    noGlow(g);
    radialBlob(g, c, c, 22, [[0, 'rgba(255,255,255,1)'], [0.4, 'rgba(170,230,255,.8)'], [1, 'rgba(60,160,255,0)']]);
    g.globalCompositeOperation = 'source-over';
  },
  meteor(g, S) {
    bg(g, S, 'fire', 31);
    // impact glow on ground
    g.globalCompositeOperation = 'lighter';
    radialBlob(g, 44, 104, 40, [[0, 'rgba(255,150,40,.7)'], [1, 'rgba(255,60,0,0)']]);
    glow(g, '#ff5a00', 22);
    const hx = 50, hy = 78;
    for (const [r, c] of [[34, '#8a1404'], [26, '#e04a0a'], [16, '#ffb040']]) {
      const lg = g.createLinearGradient(124, 4, hx, hy);
      lg.addColorStop(0, 'rgba(0,0,0,0)'); lg.addColorStop(0.6, c); lg.addColorStop(1, c);
      g.fillStyle = lg; teardrop(g, hx, hy, r * 0.75, 126 - r * 0.3, 2 + r * 0.2, 6); g.fill();
    }
    noGlow(g);
    g.globalCompositeOperation = 'source-over';
    // rock
    const r = rng(5);
    g.beginPath();
    for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2, rr = 17 + r() * 6; g.lineTo(hx + Math.cos(a) * rr, hy + Math.sin(a) * rr); }
    g.closePath();
    const rg = g.createRadialGradient(hx - 4, hy + 4, 2, hx, hy, 24);
    rg.addColorStop(0, '#2a1a12'); rg.addColorStop(0.7, '#1a0e08'); rg.addColorStop(1, '#ff7a20');
    g.fillStyle = rg; g.fill();
    // molten cracks
    glow(g, '#ffa020', 8); g.strokeStyle = '#ffc060'; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(hx - 10, hy - 4); g.lineTo(hx - 2, hy + 2); g.lineTo(hx + 4, hy - 6); g.moveTo(hx - 2, hy + 2); g.lineTo(hx + 1, hy + 12); g.stroke();
    noGlow(g);
  },
  blink(g, S) {
    bg(g, S, 'arcane', 41);
    g.globalCompositeOperation = 'lighter';
    // swirl portal at destination
    glow(g, '#a860ff', 16);
    for (let i = 0; i < 3; i++) {
      g.strokeStyle = `rgba(${200 - i * 30},${140 + i * 30},255,${0.8 - i * 0.2})`; g.lineWidth = 3 - i * 0.6;
      g.beginPath(); g.ellipse(90, 40, 26 - i * 6, 12 - i * 3, -0.5, i, i + Math.PI * 1.5); g.stroke();
    }
    // trail of fading motes
    for (let i = 0; i < 9; i++) {
      const t = i / 8, x = 20 + t * 68, y = 104 - t * 62 - Math.sin(t * Math.PI) * 18;
      radialBlob(g, x, y, 4 + t * 7, [[0, `rgba(240,220,255,${0.25 + t * 0.7})`], [1, 'rgba(140,60,255,0)']]);
    }
    noGlow(g);
    glow(g, '#e0c0ff', 20);
    star4(g, 90, 40, 26, 'rgba(255,245,255,.95)');
    star4(g, 22, 104, 12, 'rgba(220,180,255,.6)');
    noGlow(g);
    g.globalCompositeOperation = 'source-over';
  },
  cleave(g, S) {
    bg(g, S, 'steel', 51);
    blade(g, 26, 108, 104, 26, 5);
    g.globalCompositeOperation = 'lighter';
    glow(g, '#ffb050', 20);
    const c = 64, cy = 70;
    const lg = g.createLinearGradient(10, 90, 118, 40);
    lg.addColorStop(0, 'rgba(255,120,40,0)'); lg.addColorStop(0.5, 'rgba(255,200,120,.9)'); lg.addColorStop(1, 'rgba(255,255,240,1)');
    g.fillStyle = lg;
    g.beginPath();
    g.arc(c, cy, 52, Math.PI * 0.95, Math.PI * 2.05, false);
    g.arc(c, cy + 8, 40, Math.PI * 2.0, Math.PI * 1.0, true);
    g.closePath(); g.fill();
    noGlow(g);
    g.globalCompositeOperation = 'source-over';
  },
  whirlwind(g, S) {
    bg(g, S, 'steel', 61);
    const c = S / 2;
    g.globalCompositeOperation = 'lighter';
    glow(g, '#ff9a40', 14);
    for (let k = 0; k < 3; k++) {
      const r0 = 18 + k * 15, off = k * 2.1;
      const lg = g.createRadialGradient(c, c, r0 - 6, c, c, r0 + 6);
      lg.addColorStop(0, 'rgba(255,170,80,0)'); lg.addColorStop(0.5, `rgba(255,${220 - k * 30},${170 - k * 40},.95)`); lg.addColorStop(1, 'rgba(255,120,40,0)');
      g.fillStyle = lg;
      for (let j = 0; j < 2; j++) {
        const a0 = off + j * Math.PI;
        g.beginPath(); g.arc(c, c, r0 + 5, a0, a0 + 2.2); g.arc(c, c, r0 - 3, a0 + 2.2, a0, true); g.closePath(); g.fill();
      }
    }
    noGlow(g);
    g.globalCompositeOperation = 'source-over';
    blade(g, 46, 82, 92, 36, 3.5);
    blade(g, 82, 86, 34, 40, 3.5);
  },
  earthshatter(g, S) {
    bg(g, S, 'steel', 71);
    // ground
    const gr = g.createLinearGradient(0, 78, 0, S);
    gr.addColorStop(0, '#2a1a10'); gr.addColorStop(1, '#0a0503');
    g.fillStyle = gr; g.fillRect(0, 80, S, S - 80);
    // cracks
    const r = rng(3);
    g.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 7; k++) {
      const a = Math.PI * (0.05 + k / 6 * 0.9);
      let x = 64, y = 92;
      g.beginPath(); g.moveTo(x, y);
      for (let s = 0; s < 5; s++) { x += Math.cos(a) * 11 + (r() - 0.5) * 8; y += Math.sin(a) * 6 + (r() - 0.3) * 4; g.lineTo(x, y); }
      glow(g, '#ff6a00', 10); g.strokeStyle = '#ff7a20'; g.lineWidth = 3; g.stroke();
      noGlow(g); g.strokeStyle = '#ffe0a0'; g.lineWidth = 1; g.stroke();
    }
    radialBlob(g, 64, 92, 30, [[0, 'rgba(255,190,90,.9)'], [1, 'rgba(255,80,0,0)']]);
    g.globalCompositeOperation = 'source-over';
    // flying rocks
    g.fillStyle = '#3a2a1e';
    for (let i = 0; i < 7; i++) {
      const x = 24 + r() * 80, y = 30 + r() * 44, s = 3 + r() * 5;
      g.beginPath(); g.moveTo(x, y - s); g.lineTo(x + s, y); g.lineTo(x + s * 0.3, y + s); g.lineTo(x - s, y + s * 0.2); g.closePath(); g.fill();
    }
    blade(g, 64, 10, 64, 96, 5.5);
  },
  charge(g, S) {
    bg(g, S, 'steel', 81);
    g.globalCompositeOperation = 'lighter';
    // speed lines
    const r = rng(9);
    for (let i = 0; i < 12; i++) {
      const y = 22 + r() * 84, x = 6 + r() * 30, L = 20 + r() * 30;
      const lg = g.createLinearGradient(x, 0, x + L, 0);
      lg.addColorStop(0, 'rgba(255,200,140,0)'); lg.addColorStop(1, 'rgba(255,200,140,.5)');
      g.strokeStyle = lg; g.lineWidth = 1 + r() * 2; g.beginPath(); g.moveTo(x, y); g.lineTo(x + L, y); g.stroke();
    }
    glow(g, '#ff9a30', 16);
    for (let i = 0; i < 3; i++) {
      const x = 38 + i * 22, al = 0.45 + i * 0.27;
      g.fillStyle = `rgba(255,${180 + i * 25},${90 + i * 50},${al})`;
      g.beginPath(); g.moveTo(x, 30); g.lineTo(x + 26, 64); g.lineTo(x, 98); g.lineTo(x + 10, 64); g.closePath(); g.fill();
    }
    noGlow(g);
    g.globalCompositeOperation = 'source-over';
  },
  bolt(g, S) {
    bg(g, S, 'hunt', 91);
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) {
      const o = (i - 2) * 6;
      const lg = g.createLinearGradient(8, 120, 70, 58);
      lg.addColorStop(0, 'rgba(200,255,140,0)'); lg.addColorStop(1, 'rgba(210,255,160,.35)');
      g.strokeStyle = lg; g.lineWidth = 2; g.beginPath(); g.moveTo(8 + o, 120 + o); g.lineTo(62 + o * 0.3, 66 + o * 0.3); g.stroke();
    }
    g.globalCompositeOperation = 'source-over';
    glow(g, '#b8ff60', 16);
    arrow(g, 30, 98, 108, 20, 4.5, 16, '#f0e6cc', '#8bc34a');
    noGlow(g);
  },
  multishot(g, S) {
    bg(g, S, 'hunt', 101);
    glow(g, '#b8ff60', 10);
    for (let i = -2; i <= 2; i++) {
      const a = -Math.PI / 4 + i * 0.26;
      const x1 = 22, y1 = 106, L = 92 - Math.abs(i) * 8;
      arrow(g, x1 + Math.cos(a) * 14, y1 + Math.sin(a) * 14, x1 + Math.cos(a) * L, y1 + Math.sin(a) * L, 3, 11, '#efe4c8', '#8bc34a');
    }
    noGlow(g);
  },
  'rain of arrows'(g, S) {
    bg(g, S, 'hunt', 111);
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, 100, S, S);
    const r = rng(17);
    glow(g, '#b8ff60', 8);
    for (let i = 0; i < 8; i++) {
      const x = 14 + i * 14 + r() * 6, y = 30 + r() * 64;
      arrow(g, x + 14, y - 34, x, y, 2.4, 9, '#efe4c8', '#8bc34a');
    }
    noGlow(g);
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) radialBlob(g, 18 + i * 24 + r() * 6, 106, 10, [[0, 'rgba(220,255,160,.5)'], [1, 'rgba(120,200,60,0)']]);
    g.globalCompositeOperation = 'source-over';
  },
  roll(g, S) {
    bg(g, S, 'hunt', 121);
    const c = S / 2;
    // dust
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) radialBlob(g, 26 + i * 10, 100 - i * 2, 16 - i * 2, [[0, 'rgba(200,180,140,.25)'], [1, 'rgba(120,100,60,0)']]);
    glow(g, '#c8ff70', 16);
    const lg = g.createLinearGradient(20, 100, 110, 30);
    lg.addColorStop(0, 'rgba(180,240,120,.2)'); lg.addColorStop(1, 'rgba(240,255,200,1)');
    g.strokeStyle = lg; g.lineWidth = 9; g.lineCap = 'round';
    g.beginPath(); g.arc(c + 6, c - 4, 34, Math.PI * 0.75, Math.PI * 2.3); g.stroke();
    // head
    const a = Math.PI * 2.3, hx = c + 6 + Math.cos(a) * 34, hy = c - 4 + Math.sin(a) * 34;
    g.fillStyle = '#f0ffd0'; g.beginPath();
    g.moveTo(hx + 14, hy - 8); g.lineTo(hx - 12, hy - 12); g.lineTo(hx + 2, hy + 14); g.closePath(); g.fill();
    noGlow(g);
    g.globalCompositeOperation = 'source-over';
  },
  _generic(g, S) {
    bg(g, S, 'arcane', 131);
    glow(g, '#c995ff', 16); star4(g, 64, 64, 40, '#e8d8ff'); noGlow(g);
  },
};

const cache = new Map();
export function abilityIcon(name) {
  const key = String(name || '').toLowerCase();
  if (cache.has(key)) return cache.get(key);
  const S = 128;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  (DRAW[key] || DRAW._generic)(g, S);
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; noGlow(g);
  finish(g, S);
  const url = c.toDataURL();
  cache.set(key, url);
  return url;
}
