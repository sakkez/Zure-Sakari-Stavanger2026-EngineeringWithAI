// DOM overlay: loading, title/class select (live 3D previews), HUD (globes, skill bar, minimap, status),
// world-space overlays (health bars, damage numbers), announcements and end screens.
// Public API (used by main.js / game.js): showLoading, hideLoading, showClassSelect, showHUD, showEnd,
// damageNumber(pos, n, color, opts?), announce(main, sub?), update(dt, t).
import { CLASSES } from '../game/classes.js';
import { createClassSelect } from './select.js';
import { createHUD } from './hud.js';
import { createOverlays } from './overlays.js';
import { divider, corner } from './ornaments.js';

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];

export function createUI(ctx) {
  const root = document.getElementById('ui');
  let select = null, hud = null, end = null;
  const overlays = createOverlays(ctx, root);
  const rescale = () => root.style.setProperty('--z', Math.max(0.6, Math.min(1.35, innerWidth / 1600, innerHeight / 900)).toFixed(3));
  rescale();
  addEventListener('resize', rescale);

  function el(html) { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild; }

  function fmt(s) { s = Math.max(0, Math.floor(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }

  return {
    showLoading(p) {
      let l = root.querySelector('.loading');
      if (!l) {
        l = el(`<div class="loading"><div class="ld-inner"><div class="sel-sub">Six enter &middot; One leaves</div><h1>Gauntlet</h1>${divider(380)}
          <div class="ld-bar"><i></i></div><div class="ld-text">Summoning champions</div></div></div>`);
        root.append(l);
      }
      l.querySelector('.ld-bar i').style.transform = `scaleX(${Math.max(0.02, p)})`;
    },
    hideLoading() { root.querySelector('.loading')?.remove(); },

    showClassSelect(onPick) {
      select = createClassSelect(ctx, root, (k) => onPick(k));
    },

    showHUD(st) {
      hud?.destroy();
      end?.remove(); end = null;
      hud = createHUD(ctx, root, st);
    },

    announce(main, sub, dur, tone) { hud?.announce(main, sub, dur, tone); },

    showEnd(won, st) {
      if (end) return;
      const p = st.player || {};
      const total = (st.rivals?.length || 5) + 1;
      const place = won ? 1 : Math.max(2, (st.rivalsLeft ?? 0) + 1);
      const byYou = st.eliminated ? st.eliminated.filter((e) => e.by === 'you').length : hud?.rivalsSlain?.() ?? 0;
      const cls = CLASSES[p.kind]?.name || '';
      const killer = !won && p.lastAttacker ? (p.lastAttacker.rival ? `${p.lastAttacker.name || CLASSES[p.lastAttacker.kind]?.name}` : p.lastAttacker.name || null) : null;
      const outside = st.zone && p.pos && Math.hypot(p.pos.x - (st.zone.center?.x || 0), p.pos.z - (st.zone.center?.z || 0)) > st.zone.radius;
      const cause = won ? 'Last champion standing' : outside ? 'Consumed by the storm' : killer ? `Slain by ${killer}` : 'Your light has gone out';
      const stats = [
        ['Placement', `#${place}<small> of ${total}</small>`],
        ['Rivals slain', byYou],
        ['Monsters slain', Math.max(0, (st.kills || 0) - byYou)],
        ['Time survived', fmt(st.time)],
        ['Stage reached', ROMAN[st.zone?.stage ?? 0] || (st.zone?.stage ?? 0) + 1],
      ];
      if (p.level != null) stats.push(['Level', p.level]);
      if (p.gold != null) stats.push(['Gold', p.gold]);
      end = el(`<div class="end ${won ? 'won' : 'lost'}">
        <div class="end-panel">${corner()}${corner()}${corner()}${corner()}
          <div class="end-kicker">${cls ? `${cls} &middot; ` : ''}${won ? 'The Gauntlet is won' : 'The Gauntlet claims another'}</div>
          <h1>${won ? 'Victory' : 'You Have Fallen'}</h1>
          ${divider(440, won ? '#d8b060' : '#a8343a')}
          <div class="end-cause">${cause}</div>
          <div class="end-stats">${stats.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('')}</div>
          <div class="end-actions">
            <button class="btn primary" data-a="again"><span>Play Again</span></button>
            <button class="btn" data-a="class"><span>Choose Champion</span></button>
          </div>
        </div></div>`);
      end.querySelector('[data-a="again"]').onclick = () => location.reload();
      end.querySelector('[data-a="class"]').onclick = () => {
        const q = new URLSearchParams(location.search); q.delete('class');
        location.search = q.toString();
      };
      root.append(end);
      end._t = 0;
    },

    damageNumber(pos, n, color, opts) { overlays.damageNumber(pos, n, color, opts); },

    update(dt, t = 0) {
      select?.update(dt, t);
      hud?.update(dt, t);
      overlays.update(dt, t);
      if (end && end._t < 2) { end._t += dt; end.style.setProperty('--in', Math.min(1, end._t / 1.2).toFixed(3)); }
    },
  };
}
