import type { ClientMsg, Dir, MeView, ServerMsg, Snapshot } from '../shared/types.js';

const GRID = 30;
const $ = (id: string) => document.getElementById(id)!;
const q = (tid: string) => document.querySelector(`[data-testid="${tid}"]`) as HTMLElement;

const grid = $('grid');
const zoneEl = $('zone');
const cooldownEl = q('cooldown');
const cdFill = cooldownEl.querySelector('.cdfill') as HTMLElement;

let ws: WebSocket | null = null;
let myId: string | null = null;
let me: MeView | null = null;
let snap: Snapshot | null = null;
let clockOffset = 0; // serverNow - Date.now()
const playerEls = new Map<string, HTMLElement>();
const seenDamage = new Set<number>();
const lastHp = new Map<string, number>();
const lastConnected = new Map<string, boolean>();

const TOKEN_KEY = 'grid-royale-token';
function readToken(): string | undefined {
  try { return sessionStorage.getItem(TOKEN_KEY) || undefined; } catch { return undefined; }
}
function writeToken(t: string) {
  try { sessionStorage.setItem(TOKEN_KEY, t); } catch { /* ignore */ }
}

function send(m: ClientMsg) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m));
}

function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.onopen = () => send({ t: 'hello', token: readToken() });
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data) as ServerMsg;
    if (m.t === 'welcome') {
      myId = m.id;
      writeToken(m.token);
      q('me').textContent = m.name;
    } else if (m.t === 'state') {
      clockOffset = m.s.now - Date.now();
      snap = m.s;
      me = m.me;
      render();
    }
  };
  ws.onclose = () => setTimeout(connect, 1000);
}

const pct = (n: number) => `${(n * 100) / GRID}%`;

function toast(text: string) {
  const t = document.createElement('div');
  t.textContent = text;
  $('toasts').appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

function render() {
  if (!snap) return;
  const s = snap;
  q('phase').textContent = s.phase;
  if (me) {
    q('me').textContent = me.name;
    q('score').textContent = String(me.score);
    q('hp').textContent = String(me.hp);
    q('hp-max').textContent = String(me.hpMax);
    ($('my-hp-fill')).style.width = `${(100 * me.hp) / me.hpMax}%`;
  }
  // Zone
  const z = s.zone;
  zoneEl.dataset.x0 = String(z.x0);
  zoneEl.dataset.y0 = String(z.y0);
  zoneEl.dataset.x1 = String(z.x1);
  zoneEl.dataset.y1 = String(z.y1);
  zoneEl.style.left = pct(z.x0);
  zoneEl.style.top = pct(z.y0);
  zoneEl.style.width = pct(z.x1 - z.x0 + 1);
  zoneEl.style.height = pct(z.y1 - z.y0 + 1);

  // Players: only living ones, only while playing.
  const living = s.phase === 'playing' ? s.players.filter((p) => p.alive) : [];
  const keep = new Set(living.map((p) => p.id));
  for (const [id, el] of playerEls) if (!keep.has(id)) { el.remove(); playerEls.delete(id); }
  for (const p of living) {
    let el = playerEls.get(p.id);
    if (!el) {
      el = document.createElement('div');
      el.className = 'player';
      el.dataset.testid = 'player';
      el.setAttribute('data-testid', 'player');
      el.innerHTML = '<div class="healthbar" data-testid="healthbar"><div class="healthbar-fill" data-testid="healthbar-fill"></div></div><div class="body"></div><div class="tag"></div>';
      const hue = [...p.name].reduce((a, c) => a + c.charCodeAt(0) * 37, 0) % 360;
      el.style.setProperty('--c', `hsl(${hue} 100% 60%)`);
      el.style.left = '0';
      el.style.top = '0';
      grid.appendChild(el);
      playerEls.set(p.id, el);
    }
    el.dataset.name = p.name;
    el.dataset.x = String(p.x);
    el.dataset.y = String(p.y);
    el.dataset.hp = String(p.hp);
    el.dataset.connected = String(p.connected);
    if (p.bot) el.dataset.bot = 'true'; else delete el.dataset.bot;
    el.classList.toggle('bot', p.bot);
    el.classList.toggle('me', p.id === myId);
    el.classList.toggle('offline', !p.connected);
    el.style.transform = `translate(${p.x * 100}%, ${p.y * 100}%)`;
    (el.querySelector('.healthbar-fill') as HTMLElement).style.width = `${p.hp}%`;
    (el.querySelector('.tag') as HTMLElement).textContent = (p.bot ? '🤖 ' : '') + p.name + (p.connected ? '' : ' (offline)');
    const prev = lastHp.get(p.id);
    if (prev !== undefined && p.hp < prev) {
      el.classList.remove('hit');
      void el.offsetWidth;
      el.classList.add('hit');
    }
    lastHp.set(p.id, p.hp);
    const wasConn = lastConnected.get(p.id);
    if (wasConn !== undefined && wasConn !== p.connected && p.id !== myId) toast(`${p.name} ${p.connected ? 'reconnected' : 'disconnected'}`);
    lastConnected.set(p.id, p.connected);
  }

  // Damage numbers that involve me.
  const myName = me?.name;
  for (const d of s.damage) {
    if (seenDamage.has(d.id)) continue;
    seenDamage.add(d.id);
    let kind: 'dealt' | 'taken' | null = null;
    if (d.target === myName) kind = 'taken';
    else if (d.attacker && d.attacker === myName) kind = 'dealt';
    if (!kind) continue;
    const el = document.createElement('div');
    el.className = `damage ${kind}`;
    el.setAttribute('data-testid', 'damage');
    el.dataset.target = d.target;
    el.dataset.amount = String(d.amount);
    el.dataset.kind = kind;
    el.textContent = `-${d.amount}`;
    el.style.left = pct(d.x);
    el.style.top = pct(d.y);
    grid.appendChild(el);
    setTimeout(() => el.remove(), 1100);
    if (kind === 'taken') {
      grid.classList.remove('shake');
      void grid.offsetWidth;
      grid.classList.add('shake');
    }
  }

  // Winner overlay
  const over = $('over');
  over.hidden = s.phase !== 'over';
  q('winner').textContent = s.winner ?? 'none';

  // Highscores
  const hs = $('highscores');
  hs.replaceChildren(...s.highscores.map((h) => {
    const li = document.createElement('li');
    li.setAttribute('data-testid', 'highscore');
    li.dataset.name = h.name;
    li.dataset.score = String(h.score);
    li.textContent = `${h.name} — ${h.score}`;
    return li;
  }));

  // Banner
  let banner = '';
  if (s.phase === 'lobby') banner = 'Waiting for players…';
  else if (s.phase === 'countdown') banner = 'Get ready!';
  else if (s.phase === 'playing' && me && !me.inRound) banner = 'Spectating — you join next round';
  else if (s.phase === 'playing' && me && !me.alive) banner = 'You died — spectating';
  $('banner').textContent = banner;
  renderTimers();
}

function renderTimers() {
  const now = Date.now() + clockOffset;
  if (me) {
    const span = me.cooldownEnd - me.cooldownStart;
    const prog = now >= me.cooldownEnd || span <= 0 ? 1 : Math.max(0, Math.min(1, (now - me.cooldownStart) / span));
    const ready = prog >= 1;
    cooldownEl.dataset.ready = String(ready);
    cooldownEl.dataset.progress = prog.toFixed(3);
    cdFill.style.width = `${prog * 100}%`;
  }
  const t = $('timer');
  if (snap?.phaseEndsAt) t.textContent = `${Math.max(0, Math.ceil((snap.phaseEndsAt - now) / 1000))}s`;
  else t.textContent = '';
}

function loop() {
  renderTimers();
  requestAnimationFrame(loop);
}

const KEYS: Record<string, Dir> = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right',
};

window.addEventListener('keydown', (e) => {
  const dir = KEYS[e.key];
  if (dir) { e.preventDefault(); send({ t: 'move', dir }); return; }
  if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); send({ t: 'attack' }); }
});

for (const dir of ['up', 'down', 'left', 'right'] as Dir[]) {
  q(dir).addEventListener('click', () => send({ t: 'move', dir }));
}
q('attack').addEventListener('click', () => send({ t: 'attack' }));
q('rules-button').addEventListener('click', () => { const r = q('rules'); r.hidden = !r.hidden; });

connect();
loop();
