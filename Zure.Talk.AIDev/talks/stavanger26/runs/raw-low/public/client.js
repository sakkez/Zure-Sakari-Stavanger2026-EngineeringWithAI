const $ = s => document.querySelector(`[data-testid="${s}"]`);
const grid = $('grid'), zoneEl = $('zone');
let ws, myId = sessionStorage.getItem('id'), me = '';
const seen = new Set();

function connect() {
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/?id=${myId ?? ''}`);
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.type === 'hello') { myId = m.id; sessionStorage.setItem('id', m.id); }
    else render(m);
  };
  ws.onclose = () => setTimeout(connect, 1000);
}
const send = m => ws?.readyState === 1 && ws.send(JSON.stringify(m));
const pct = v => `${(v / 30) * 100}%`;

function render(s) {
  if (s.me) {
    me = s.me.name;
    $('me').textContent = me; $('score').textContent = s.me.score; $('hp').textContent = s.me.hp;
    const cd = $('cooldown'), p = s.me.progress;
    cd.dataset.progress = p.toFixed(2); cd.dataset.ready = String(p >= 1);
    document.getElementById('cdf').style.width = p * 100 + '%';
  }
  $('hp-max').textContent = s.hpMax;
  $('phase').textContent = s.phase;
  document.getElementById('winwrap').hidden = s.phase !== 'over';
  $('winner').textContent = s.phase === 'over' ? s.winner : '';
  const ban = document.getElementById('banner');
  ban.textContent = s.phase === 'countdown' ? 'Get ready…' : s.phase === 'over' ? `🏆 ${s.winner}` : s.me && !s.me.alive && s.phase === 'playing' ? 'Spectating' : '';
  const z = s.zone;
  Object.assign(zoneEl.dataset, { x0: z.x0, y0: z.y0, x1: z.x1, y1: z.y1 });
  Object.assign(zoneEl.style, { left: pct(z.x0), top: pct(z.y0), width: pct(z.x1 - z.x0 + 1), height: pct(z.y1 - z.y0 + 1) });

  const shown = s.phase === 'playing' ? s.players : [];
  const els = new Map([...grid.querySelectorAll('[data-testid=player]')].map(e => [e.dataset.name, e]));
  for (const p of shown) {
    let el = els.get(p.name);
    if (!el) {
      el = document.createElement('div'); el.className = 'cell'; el.dataset.testid = 'player';
      el.innerHTML = '<span class="nm"></span><div data-testid="healthbar"><div data-testid="healthbar-fill"></div></div>';
      grid.appendChild(el);
    }
    els.delete(p.name);
    Object.assign(el.dataset, { name: p.name, x: p.x, y: p.y, hp: p.hp });
    if (p.bot) el.dataset.bot = 'true'; else delete el.dataset.bot;
    el.classList.toggle('me', p.name === me);
    el.style.opacity = p.connected ? '1' : '.4';
    el.querySelector('.nm').textContent = p.name + (p.connected ? '' : ' (offline)');
    el.style.left = pct(p.x); el.style.top = pct(p.y);
    el.querySelector('[data-testid=healthbar-fill]').style.width = (p.hp / s.hpMax) * 100 + '%';
  }
  for (const el of els.values()) el.remove();

  const pos = new Map(s.players.map(p => [p.name, p]));
  for (const h of s.hits) {
    if (seen.has(h.id)) continue;
    seen.add(h.id);
    const kind = h.target === me ? 'taken' : h.attacker === me ? 'dealt' : null;
    if (!kind) continue;
    const t = pos.get(h.target); const d = document.createElement('div');
    d.dataset.testid = 'damage'; Object.assign(d.dataset, { target: h.target, amount: h.amount, kind });
    d.textContent = '-' + h.amount;
    d.style.left = pct(t?.x ?? 15); d.style.top = pct(t?.y ?? 15);
    grid.appendChild(d); setTimeout(() => d.remove(), 1000);
    if (kind === 'taken') { grid.animate([{ transform: 'translate(4px,0)' }, { transform: 'translate(-4px,0)' }, { transform: 'none' }], 200); }
  }

  const hs = document.getElementById('hs');
  hs.innerHTML = '';
  for (const e of s.highscores) {
    const li = document.createElement('li'); li.dataset.testid = 'highscore';
    li.dataset.name = e.name; li.dataset.score = e.score; li.textContent = `${e.name} — ${e.score}`;
    hs.appendChild(li);
  }
  document.getElementById('online').innerHTML = s.online.map(n => `<li data-online="${n}">${n}</li>`).join('');
}

const keys = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right' };
addEventListener('keydown', e => {
  if (keys[e.key]) { e.preventDefault(); send({ type: 'move', dir: keys[e.key] }); }
  else if (e.code === 'Space') { e.preventDefault(); send({ type: 'attack' }); }
});
for (const d of ['up', 'down', 'left', 'right']) $(d).addEventListener('click', () => send({ type: 'move', dir: d }));
$('attack').addEventListener('click', () => send({ type: 'attack' }));
$('rules-button').addEventListener('click', () => { const r = $('rules'); r.hidden = !r.hidden; });
connect();
