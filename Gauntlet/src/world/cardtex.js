// Procedurally painted alpha-card textures (fir branches, grass tufts, fern fronds, leaf clusters).
import * as THREE from 'three';
import { mulberry } from './noise.js';

function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  // Re-pack into a DataTexture whose transparent texels carry the card's average color
  // (canvas zeroes them to black, which darkens alpha-tested edges once mipmapped).
  const src = g.getImageData(0, 0, w, h).data;
  const out = new Uint8Array(w * h * 4);
  let r = 0, gg = 0, b = 0, n = 0;
  for (let i = 0; i < w * h; i++) if (src[i * 4 + 3] > 128) { r += src[i * 4]; gg += src[i * 4 + 1]; b += src[i * 4 + 2]; n++; }
  r /= n || 1; gg /= n || 1; b /= n || 1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const si = ((h - 1 - y) * w + x) * 4, di = (y * w + x) * 4, a = src[si + 3];
    const k = Math.min(1, a / 200);
    out[di] = src[si] * k + r * (1 - k); out[di + 1] = src[si + 1] * k + gg * (1 - k); out[di + 2] = src[si + 2] * k + b * (1 - k); out[di + 3] = a;
  }
  const t = new THREE.DataTexture(out, w, h, THREE.RGBAFormat);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}
const hsl = (h, s, l, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;

// Fir branch, stem along +x from left edge to right.
export function firBranchTex() {
  const R = mulberry(11);
  return canvasTex(256, 128, (g, w, h) => {
    g.lineCap = 'round';
    // Solid tapered core so the card's coverage is robust (no stipple when minified).
    g.fillStyle = hsl(95, 22, 15);
    g.beginPath(); g.moveTo(0, h / 2 - 14); g.quadraticCurveTo(w * 0.55, h / 2 - 34, w * 0.97, h / 2); g.quadraticCurveTo(w * 0.55, h / 2 + 34, 0, h / 2 + 14); g.fill();
    for (let layer = 0; layer < 3; layer++) {
      for (let s = 0; s < 3 + layer * 2; s++) {
        // main stem + side twigs
        const sx = s === 0 ? 0 : R() * w * 0.6, sy = h / 2 + (s === 0 ? 0 : (R() - 0.5) * h * 0.5);
        const len = s === 0 ? w * 0.98 : w * (0.25 + R() * 0.35);
        const ang = s === 0 ? 0 : (sy < h / 2 ? -1 : 1) * (0.35 + R() * 0.4);
        const n = Math.floor(len / 2.2);
        for (let i = 0; i < n; i++) {
          const t = i / n, px = sx + Math.cos(ang) * len * t, py = sy + Math.sin(ang) * len * t;
          const nl = (s === 0 ? 30 : 18) * (1 - t * 0.65) * (0.7 + R() * 0.5) * (1 - Math.max(0, px / w - 0.85) * 4);
          for (const side of [-1, 1]) {
            const a = ang + side * (0.9 + R() * 0.35) - 0.25;
            const l = 30 + R() * 14 - layer * 7;
            g.strokeStyle = hsl(80 + R() * 35, 24 + R() * 20, l * 0.85 + (layer === 2 ? 10 : 0));
            g.lineWidth = 1.6 + R() * 1.4;
            g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(a) * nl, py + Math.sin(a) * nl); g.stroke();
          }
        }
        g.strokeStyle = hsl(25, 25, 14); g.lineWidth = s === 0 ? 3 : 1.5;
        g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + Math.cos(ang) * len, sy + Math.sin(ang) * len); g.stroke();
      }
    }
  });
}

// Grass tuft: blades rising from bottom center.
export function grassTex() {
  const R = mulberry(23);
  return canvasTex(128, 128, (g, w, h) => {
    g.lineCap = 'round';
    for (let i = 0; i < 46; i++) {
      const bx = w / 2 + (R() - 0.5) * w * 0.55, len = h * (0.45 + R() * 0.52);
      const lean = (R() - 0.5) * w * 0.7, dry = R();
      const grd = g.createLinearGradient(0, h, 0, h - len);
      const hue = dry < 0.35 ? 44 + R() * 10 : 58 + R() * 18, sat = dry < 0.35 ? 26 : 18 + R() * 12;
      grd.addColorStop(0, hsl(hue, sat, 12));
      grd.addColorStop(0.5, hsl(hue, sat, 26 + R() * 8));
      grd.addColorStop(1, hsl(hue - 6, sat + 6, 40 + R() * 12));
      g.strokeStyle = grd; g.lineWidth = 2.4 + R() * 2.4;
      g.beginPath(); g.moveTo(bx, h);
      g.quadraticCurveTo(bx + lean * 0.2, h - len * 0.6, bx + lean, h - len); g.stroke();
    }
  });
}

// Fern frond: rachis along +x, pinnae on both sides.
export function fernTex() {
  const R = mulberry(31);
  return canvasTex(256, 64, (g, w, h) => {
    const n = 26;
    for (let i = 0; i < n; i++) {
      const t = i / n, x = 8 + t * (w - 16), l = (h * 0.46) * Math.sin(Math.PI * (0.12 + t * 0.88)) * (0.8 + R() * 0.25);
      for (const side of [-1, 1]) {
        g.fillStyle = hsl(85 + R() * 20, 32 + R() * 15, 24 + R() * 16);
        g.beginPath();
        g.ellipse(x + l * 0.25, h / 2 + side * l * 0.5, 3.5, l * 0.52, side * 0.45, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.strokeStyle = hsl(80, 30, 14); g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
  });
}

// Dense cluster of small leaves (bushes, dead-tree twigs use a darker variant).
export function leafTex(hueBase = 80, light = 1) {
  const R = mulberry(41 + hueBase);
  return canvasTex(128, 128, (g, w, h) => {
    for (let i = 0; i < 140; i++) {
      const a = R() * Math.PI * 2, r = Math.sqrt(R()) * w * 0.44;
      const x = w / 2 + Math.cos(a) * r, y = h / 2 + Math.sin(a) * r;
      const l = (22 + R() * 20 + (1 - r / (w * 0.44)) * 10) * light;
      g.fillStyle = hsl(hueBase + (R() - 0.5) * 30, 25 + R() * 20, l);
      g.beginPath(); g.ellipse(x, y, 3 + R() * 3, 6 + R() * 5, R() * Math.PI, 0, Math.PI * 2); g.fill();
    }
  });
}

// ---------- Round 2: temperate/gothic ground flora ----------
// Tall wispy grass with seed heads (dry khaki).
export function wispTex() {
  const R = mulberry(57);
  return canvasTex(128, 128, (g, w, h) => {
    g.lineCap = 'round';
    for (let i = 0; i < 30; i++) {
      const bx = w / 2 + (R() - 0.5) * w * 0.3, len = h * (0.6 + R() * 0.38);
      const lean = (R() - 0.5) * w * 0.9;
      const grd = g.createLinearGradient(0, h, 0, h - len);
      grd.addColorStop(0, hsl(55, 20, 14)); grd.addColorStop(0.6, hsl(52, 22, 30 + R() * 8)); grd.addColorStop(1, hsl(45, 26, 46 + R() * 12));
      g.strokeStyle = grd; g.lineWidth = 1.2 + R() * 1.2;
      const ex = bx + lean, ey = h - len;
      g.beginPath(); g.moveTo(bx, h); g.quadraticCurveTo(bx + lean * 0.15, h - len * 0.6, ex, ey); g.stroke();
      if (R() < 0.45) { g.fillStyle = hsl(42, 28, 40 + R() * 12); g.beginPath(); g.ellipse(ex, ey + 5, 2, 7, lean * 0.01, 0, Math.PI * 2); g.fill(); }
    }
  });
}

// Bracken frond: triangular blade, rachis along +x (base at left), drooping lobed pinnae.
export function brackenTex() {
  const R = mulberry(63);
  return canvasTex(256, 128, (g, w, h) => {
    const n = 18;
    for (let i = 0; i < n; i++) {
      const t = i / n, x = 6 + t * (w - 14);
      const L = (h * 0.48) * (1 - t * 0.85) * (0.85 + R() * 0.2);
      for (const side of [-1, 1]) {
        const lobes = Math.max(3, Math.round(L / 5));
        for (let k = 0; k < lobes; k++) {
          const u = k / lobes, px = x + u * L * 0.45, py = h / 2 + side * u * L;
          const r = 3.4 * (1 - u * 0.6) + 1;
          const dry = R() < 0.25;
          g.fillStyle = dry ? hsl(28 + R() * 10, 38, 30 + R() * 10) : hsl(62 + R() * 20, 22 + R() * 12, 28 + R() * 12);
          g.beginPath(); g.ellipse(px, py, r * 1.3, r, 0.6 * side, 0, Math.PI * 2); g.fill();
        }
        g.strokeStyle = hsl(40, 25, 16); g.lineWidth = 1.2;
        g.beginPath(); g.moveTo(x, h / 2); g.lineTo(x + L * 0.45, h / 2 + side * L); g.stroke();
      }
    }
    g.strokeStyle = hsl(35, 30, 15); g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w - 8, h / 2); g.stroke();
  });
}

// Heather sprigs: twiggy verticals dotted with tiny dull flowers/needles.
export function heatherTex() {
  const R = mulberry(71);
  return canvasTex(128, 128, (g, w, h) => {
    g.lineCap = 'round';
    for (let i = 0; i < 22; i++) {
      const bx = w * (0.1 + R() * 0.8), top = h * (0.05 + R() * 0.45), lean = (R() - 0.5) * 30;
      g.strokeStyle = hsl(25, 20, 13); g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(bx, h); g.lineTo(bx + lean, top); g.stroke();
      const dots = 14 + Math.floor(R() * 10);
      for (let k = 0; k < dots; k++) {
        const t = R() * 0.8, px = bx + lean * (1 - t) + (R() - 0.5) * 9, py = top + (h - top) * t * 0.85;
        const purple = R() < 0.55;
        g.fillStyle = purple ? hsl(310 + R() * 30, 18 + R() * 12, 26 + R() * 12) : hsl(80 + R() * 20, 18, 18 + R() * 10);
        g.beginPath(); g.arc(px, py, 1.6 + R() * 1.6, 0, Math.PI * 2); g.fill();
      }
    }
  });
}

// Broken leafy cluster with gaps (for irregular bush cards).
export function leafClusterTex() {
  const R = mulberry(83);
  return canvasTex(128, 128, (g, w, h) => {
    g.strokeStyle = hsl(25, 20, 14); g.lineWidth = 2;
    const twigs = [];
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (R() - 0.5) * 2.2, l = w * (0.25 + R() * 0.25);
      const x0 = w / 2 + (R() - 0.5) * 20, y0 = h * 0.95;
      const x1 = x0 + Math.cos(a) * l * 1.4, y1 = y0 + Math.sin(a) * l * 1.4;
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      twigs.push([x0, y0, x1, y1]);
    }
    for (let i = 0; i < 120; i++) {
      const tw = twigs[Math.floor(R() * twigs.length)], t = 0.3 + R() * 0.75;
      const x = tw[0] + (tw[2] - tw[0]) * t + (R() - 0.5) * 22, y = tw[1] + (tw[3] - tw[1]) * t + (R() - 0.5) * 22;
      g.fillStyle = hsl(70 + (R() - 0.5) * 40, 18 + R() * 15, 16 + R() * 16);
      g.beginPath(); g.ellipse(x, y, 2.5 + R() * 2.5, 5 + R() * 4, R() * Math.PI, 0, Math.PI * 2); g.fill();
    }
  });
}
