// Inline SVG ornaments (original procedural shapes: iron rings, gothic crests, filigree). No external art.

let uid = 0;

// Tileable grain texture (canvas, cached). SVG feTurbulence breaks SwiftShader compositing, so we bake it.
let _noise = null;
export function noiseURL() {
  if (_noise) return _noise;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), img = g.createImageData(128, 128);
  let s = 77; const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = r(), dark = v < 0.5;
    img.data[i] = dark ? 0 : 230; img.data[i + 1] = dark ? 0 : 210; img.data[i + 2] = dark ? 0 : 180;
    img.data[i + 3] = (dark ? 70 : 18) * r();
  }
  g.putImageData(img, 0, 0);
  return (_noise = c.toDataURL());
}

// Iron/bronze globe housing. viewBox 0 0 220 220, globe radius 80 at center (110,110).
export function globeFrame(gem = '#c0141a', side = 'left') {
  const id = `gf${uid++}`;
  const spikes = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    if (Math.sin(a) < -0.9) continue; // leave top for crest
    const x = 110 + Math.cos(a) * 92, y = 110 + Math.sin(a) * 92;
    spikes.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.6" fill="url(#${id}r)" stroke="#000" stroke-width=".8"/>`);
  }
  // thorn-like flanges around the housing (gothic crown), skipping the crest and the bottom claw
  const thorns = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
    if (i === 0 || i === 6) continue;
    const ca = Math.cos(a), sa = Math.sin(a), px = -sa, py = ca;
    const r0 = 97, r1 = 108, w = 5;
    const p = (r, o) => `${(110 + ca * r + px * o).toFixed(1)} ${(110 + sa * r + py * o).toFixed(1)}`;
    thorns.push(`<path d="M${p(r0, -w)} L${p(r1, 0)} L${p(r0, w)} Z" fill="url(#${id}m)" stroke="#000" stroke-width="1"/><path d="M${p(r0 + 1, -w * 0.4)} L${p(r1 - 2, 0)}" stroke="url(#${id}g)" stroke-width=".8"/>`);
  }
  return `<svg viewBox="0 0 220 220" class="globe-frame" aria-hidden="true">
  <defs>
    <linearGradient id="${id}m" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#5a4c38"/><stop offset=".35" stop-color="#2a2119"/>
      <stop offset=".6" stop-color="#110d0a"/><stop offset="1" stop-color="#3a2e1e"/>
    </linearGradient>
    <linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#bf9e62"/><stop offset=".5" stop-color="#6e5126"/><stop offset="1" stop-color="#2e1f0e"/>
    </linearGradient>
    <radialGradient id="${id}r" cx=".35" cy=".35" r=".8">
      <stop offset="0" stop-color="#e8cf96"/><stop offset="1" stop-color="#3a2a16"/>
    </radialGradient>
    <radialGradient id="${id}gem" cx=".35" cy=".3" r=".8">
      <stop offset="0" stop-color="#fff"/><stop offset=".25" stop-color="${gem}"/><stop offset="1" stop-color="#100204"/>
    </radialGradient>
  </defs>
  <!-- outer housing -->
  <circle cx="110" cy="110" r="99" fill="none" stroke="#000" stroke-width="4"/>
  <circle cx="110" cy="110" r="90" fill="none" stroke="url(#${id}m)" stroke-width="18"/>
  <circle cx="110" cy="110" r="97.5" fill="none" stroke="url(#${id}g)" stroke-width="1.4"/>
  <circle cx="110" cy="110" r="83.2" fill="none" stroke="url(#${id}g)" stroke-width="1.6"/>
  <circle cx="110" cy="110" r="81" fill="none" stroke="#000" stroke-width="2.4"/>
  <!-- carved stone blocks: radial grooves, inner shadow lip, worn top highlight -->
  <circle cx="110" cy="110" r="90" fill="none" stroke="rgba(0,0,0,.75)" stroke-width="18" stroke-dasharray="1.4 21.6"/>
  <circle cx="110" cy="110" r="84.5" fill="none" stroke="rgba(0,0,0,.65)" stroke-width="3"/>
  <path d="M30 96 A81 81 0 0 1 190 96" fill="none" stroke="rgba(255,230,180,.10)" stroke-width="2"/>
  <!-- engraved groove + rune ticks along the ring -->
  <circle cx="110" cy="110" r="88" fill="none" stroke="rgba(0,0,0,.6)" stroke-width="2.2"/>
  <circle cx="110" cy="110" r="88" fill="none" stroke="rgba(242,220,164,.25)" stroke-width=".6" stroke-dasharray="2 5 6 5"/>
  <circle cx="110" cy="110" r="93.5" fill="none" stroke="rgba(0,0,0,.45)" stroke-width="1" stroke-dasharray="1 7 3 7"/>
  ${thorns}
  ${spikes.join('')}
  <!-- gothic crest -->
  <path d="M86 26 Q98 22 104 6 L110 -2 L116 6 Q122 22 134 26 L126 30 Q116 24 110 30 Q104 24 94 30 Z" fill="url(#${id}m)" stroke="#000" stroke-width="1.5" transform="translate(0 6)"/>
  <path d="M96 24 Q105 18 110 6 Q115 18 124 24" fill="none" stroke="url(#${id}g)" stroke-width="1.2" transform="translate(0 6)"/>
  <path d="M110 14 l7 9 -7 9 -7 -9z" fill="url(#${id}gem)" stroke="#000" stroke-width="1" transform="translate(0 2)"/>
  <!-- bottom claw -->
  <path d="M90 196 Q110 214 130 196 L124 206 Q110 220 96 206 Z" fill="url(#${id}m)" stroke="#000" stroke-width="1.2"/>
  <circle cx="110" cy="206" r="3.4" fill="url(#${id}gem)" stroke="#000" stroke-width=".8"/>
</svg>`;
}

// Minimap ring. viewBox 0 0 240 240, map radius 100 at (120,120).
export function mapFrame() {
  const id = `mf${uid++}`;
  const ticks = [];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2, r1 = 104, r2 = i % 6 === 0 ? 114 : 109;
    ticks.push(`<line x1="${(120 + Math.cos(a) * r1).toFixed(1)}" y1="${(120 + Math.sin(a) * r1).toFixed(1)}" x2="${(120 + Math.cos(a) * r2).toFixed(1)}" y2="${(120 + Math.sin(a) * r2).toFixed(1)}" stroke="url(#${id}g)" stroke-width="${i % 6 === 0 ? 2 : 1}"/>`);
  }
  return `<svg viewBox="0 0 240 240" class="map-frame" aria-hidden="true">
  <defs>
    <linearGradient id="${id}m" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#7d6848"/><stop offset=".4" stop-color="#2e251b"/><stop offset="1" stop-color="#4a3a26"/>
    </linearGradient>
    <linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ecd296"/><stop offset="1" stop-color="#6a4a1e"/>
    </linearGradient>
  </defs>
  <circle cx="120" cy="120" r="117" fill="none" stroke="#000" stroke-width="3"/>
  <circle cx="120" cy="120" r="109" fill="none" stroke="url(#${id}m)" stroke-width="15"/>
  <circle cx="120" cy="120" r="115.5" fill="none" stroke="url(#${id}g)" stroke-width="1.2"/>
  <circle cx="120" cy="120" r="102" fill="none" stroke="url(#${id}g)" stroke-width="1.4"/>
  <circle cx="120" cy="120" r="100" fill="none" stroke="#000" stroke-width="2"/>
  ${ticks.join('')}
  <path d="M120 0 L130 16 L120 24 L110 16 Z" fill="url(#${id}m)" stroke="url(#${id}g)" stroke-width="1.2"/>
  <text x="120" y="17" text-anchor="middle" font-family="Cinzel, serif" font-size="10" font-weight="700" fill="#f0d9a0">N</text>
</svg>`;
}

// Horizontal filigree divider (for headings).
export function divider(w = 360, color = '#b8904f') {
  const m = w / 2;
  return `<svg class="divider" viewBox="0 0 ${w} 20" width="${w}" height="20" aria-hidden="true">
  <defs><linearGradient id="dv${uid}" x1="0" x2="1"><stop offset="0" stop-color="${color}" stop-opacity="0"/><stop offset=".5" stop-color="${color}"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
  <line x1="0" y1="10" x2="${w}" y2="10" stroke="url(#dv${uid++})" stroke-width="1"/>
  <path d="M${m - 9} 10 L${m} 2 L${m + 9} 10 L${m} 18 Z" fill="#120c08" stroke="${color}" stroke-width="1.2"/>
  <path d="M${m - 3.5} 10 L${m} 6.5 L${m + 3.5} 10 L${m} 13.5 Z" fill="#c0141a"/>
  <path d="M${m - 14} 10 l-6 -4 m6 4 l-6 4 M${m + 14} 10 l6 -4 m-6 4 l6 4" stroke="${color}" stroke-width="1" fill="none"/>
</svg>`;
}

// Corner flourish for panels (placed via CSS in each corner, mirrored with transforms).
export function corner(color = '#b8904f') {
  return `<svg class="corner" viewBox="0 0 40 40" aria-hidden="true">
  <path d="M2 38 L2 8 Q2 2 8 2 L38 2" fill="none" stroke="${color}" stroke-width="1.6"/>
  <path d="M7 38 L7 12 Q7 7 12 7 L38 7" fill="none" stroke="${color}" stroke-opacity=".45" stroke-width="1"/>
  <path d="M2 2 l9 0 l-9 9 z" fill="${color}"/>
  <circle cx="16" cy="16" r="2.2" fill="#c0141a" stroke="${color}" stroke-width=".8"/>
</svg>`;
}

export const ICON = {
  skull: `<svg viewBox="0 0 24 24" class="ico" aria-hidden="true"><path d="M12 2C6.9 2 3.5 5.6 3.5 10.2c0 2.8 1.3 4.6 2.8 5.6V19c0 .8.6 1.4 1.4 1.4h.9v-2h1.6v2h3.6v-2h1.6v2h.9c.8 0 1.4-.6 1.4-1.4v-3.2c1.5-1 2.8-2.8 2.8-5.6C20.5 5.6 17.1 2 12 2zM8.6 14.2a2.3 2.3 0 1 1 0-4.6 2.3 2.3 0 0 1 0 4.6zm6.8 0a2.3 2.3 0 1 1 0-4.6 2.3 2.3 0 0 1 0 4.6zM12 17l-1.2-2.4h2.4z" fill="currentColor"/></svg>`,
  swords: `<svg viewBox="0 0 24 24" class="ico" aria-hidden="true"><path d="M3 2l8.2 8.2-1.4 1.4L2 3.8V2zm18 0v1.8l-11.7 11.7 1.8 1.8-1.4 1.4-1.6-1.6-3.2 3.2a1.4 1.4 0 0 1-2-2l3.2-3.2-1.6-1.6 1.4-1.4 1.8 1.8L19.2 2zM14.6 14.6l1.4-1.4 1.8 1.8 0 0 1.6-1.6 1.4 1.4-1.6 1.6 1.6 1.6c.6.6.6 1.4 0 2s-1.4.6-2 0l-1.6-1.6-1.6 1.6-1.4-1.4 1.6-1.6z" fill="currentColor"/></svg>`,
  hourglass: `<svg viewBox="0 0 24 24" class="ico" aria-hidden="true"><path d="M6 2h12v2c0 3-2 5-4 6.5v3c2 1.5 4 3.5 4 6.5v2H6v-2c0-3 2-5 4-6.5v-3C8 9 6 7 6 4V2zm2 2c0 2 1.5 3.6 3.2 4.8h1.6C14.5 7.6 16 6 16 4H8zm3.2 11.2C9.5 16.4 8 18 8 20h8c0-2-1.5-3.6-3.2-4.8h-1.6z" fill="currentColor"/></svg>`,
  coin: `<svg viewBox="0 0 24 24" class="ico" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="currentColor"/></svg>`,
  mouseL: `<svg viewBox="0 0 16 22" class="mouse" aria-hidden="true"><rect x="1" y="1" width="14" height="20" rx="7" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M8 1v8H1.2A7 7 0 0 1 8 1z" fill="currentColor"/><line x1="8" y1="1" x2="8" y2="9" stroke="currentColor"/></svg>`,
  mouseR: `<svg viewBox="0 0 16 22" class="mouse" aria-hidden="true"><rect x="1" y="1" width="14" height="20" rx="7" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M8 1v8h6.8A7 7 0 0 0 8 1z" fill="currentColor"/><line x1="8" y1="1" x2="8" y2="9" stroke="currentColor"/></svg>`,
};

// Skill-bar housing: carved dark iron plate with gold trim, studs and a central crest. Sized in px.
export function barPlate(w = 556, h = 128) {
  const id = `bp${uid++}`;
  const t = 16; // top inset of the main edge
  const studs = [];
  for (let x = 60; x < w - 50; x += 44) if (Math.abs(x - w / 2) > 40) studs.push(`<circle cx="${x}" cy="${t + 7}" r="1.8" fill="url(#${id}g)" stroke="#000" stroke-width=".6"/>`);
  const m = w / 2;
  return `<svg class="bar-svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">
  <defs>
    <linearGradient id="${id}s" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2c241c"/><stop offset=".25" stop-color="#17120e"/><stop offset="1" stop-color="#070605"/>
    </linearGradient>
    <linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f1d79a"/><stop offset=".5" stop-color="#a27a38"/><stop offset="1" stop-color="#4a3216"/>
    </linearGradient>
    <linearGradient id="${id}e" x1="0" x2="1">
      <stop offset="0" stop-color="#6e5128" stop-opacity="0"/><stop offset=".12" stop-color="#c9a45c"/><stop offset=".5" stop-color="#f2dca4"/><stop offset=".88" stop-color="#c9a45c"/><stop offset="1" stop-color="#6e5128" stop-opacity="0"/>
    </linearGradient>
    <pattern id="${id}n" patternUnits="userSpaceOnUse" width="128" height="128"><image href="${noiseURL()}" width="128" height="128"/></pattern>
    <radialGradient id="${id}gem" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff"/><stop offset=".3" stop-color="#d0141a"/><stop offset="1" stop-color="#200204"/></radialGradient>
  </defs>
  <path d="M0 ${h} L0 ${t + 34} Q8 ${t} 44 ${t} L${m - 46} ${t} L${m - 30} ${t - 8} L${m + 30} ${t - 8} L${m + 46} ${t} L${w - 44} ${t} Q${w - 8} ${t} ${w} ${t + 34} L${w} ${h} Z" fill="url(#${id}s)" stroke="#000" stroke-width="2"/>
  <path d="M0 ${h} L0 ${t + 34} Q8 ${t} 44 ${t} L${w - 44} ${t} Q${w - 8} ${t} ${w} ${t + 34} L${w} ${h} Z" fill="url(#${id}n)"/>
  <path d="M6 ${t + 34} Q12 ${t + 2} 44 ${t + 2} L${m - 45} ${t + 2} L${m - 29} ${t - 6} L${m + 29} ${t - 6} L${m + 45} ${t + 2} L${w - 44} ${t + 2} Q${w - 12} ${t + 2} ${w - 6} ${t + 34}" fill="none" stroke="url(#${id}e)" stroke-width="1.6"/>
  <path d="M14 ${t + 38} Q18 ${t + 10} 46 ${t + 10} L${w - 46} ${t + 10} Q${w - 18} ${t + 10} ${w - 14} ${t + 38}" fill="none" stroke="rgba(0,0,0,.8)" stroke-width="1"/>
  <line x1="40" y1="${h - 8}" x2="${w - 40}" y2="${h - 8}" stroke="url(#${id}e)" stroke-width="1" opacity=".5"/>
  ${studs.join('')}
  <path d="M${m - 14} ${t - 4} L${m} ${t - 16} L${m + 14} ${t - 4} L${m} ${t + 8} Z" fill="#120c08" stroke="url(#${id}g)" stroke-width="1.4"/>
  <path d="M${m - 6} ${t - 4} L${m} ${t - 10} L${m + 6} ${t - 4} L${m} ${t + 2} Z" fill="url(#${id}gem)"/>
  <path d="M${m - 40} ${t - 2} q10 -10 20 -4 M${m + 40} ${t - 2} q-10 -10 -20 -4" fill="none" stroke="url(#${id}g)" stroke-width="1.2"/>
</svg>`;
}
