import type { DamageEvent, PersonalView, PublicPlayer, Snapshot } from './game.js';

const GRID = 30;
const COOLDOWN_MS = 1000;
const DAMAGE_LIFETIME_MS = 1000;
const FEED_SIZE = 6;
const TOKEN_KEY = 'grid-royale-token';
const COLORS = ['#ff2bd6', '#22f0ff', '#ffe600', '#7cff4f', '#ff8a00', '#a66bff', '#ff4f7b', '#00ffa3'];
const KEYS: Record<string, string> = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right',
};

const $ = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;
const grid = $('grid');
const zoneEl = $('zone');
const cooldownEl = $('cooldown');
const cooldownFill = $('cooldown-fill');
const playerEls = new Map<string, HTMLElement>();
const knownConnected = new Map<string, boolean>();

let ws: WebSocket | null = null;
let myId: string | null = null;
let readyAt = 0;
let lastPhase = '';

function readToken(): string {
  try { return sessionStorage.getItem(TOKEN_KEY) ?? ''; } catch { return ''; }
}
function saveToken(token: string): void {
  try { sessionStorage.setItem(TOKEN_KEY, token); } catch { /* storage unavailable: no reconnect identity */ }
}

function colorFor(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
}

const pct = (cells: number): string => `${(cells / GRID) * 100}%`;

function send(msg: object): void {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function feed(text: string): void {
  const list = $('events');
  const li = document.createElement('li');
  li.textContent = text;
  list.prepend(li);
  while (list.children.length > FEED_SIZE) list.lastElementChild?.remove();
}

function createPlayerEl(p: PublicPlayer): HTMLElement {
  const el = document.createElement('div');
  el.className = 'player';
  el.setAttribute('data-testid', 'player');
  el.style.setProperty('--c', colorFor(p.name));
  const block = document.createElement('div');
  block.className = 'block';
  const label = document.createElement('div');
  label.className = 'label';
  label.textContent = p.name;
  const bar = document.createElement('div');
  bar.className = 'healthbar';
  bar.setAttribute('data-testid', 'healthbar');
  const fill = document.createElement('div');
  fill.className = 'healthbar-fill';
  fill.setAttribute('data-testid', 'healthbar-fill');
  bar.append(fill);
  el.append(block, label, bar);
  grid.append(el);
  return el;
}

function renderPlayers(players: PublicPlayer[]): void {
  const seen = new Set<string>();
  for (const p of players) {
    seen.add(p.id);
    const el = playerEls.get(p.id) ?? createPlayerEl(p);
    playerEls.set(p.id, el);
    const prevHp = Number(el.dataset.hp ?? p.hp);
    el.dataset.name = p.name;
    el.dataset.x = String(p.x);
    el.dataset.y = String(p.y);
    el.dataset.hp = String(p.hp);
    el.dataset.connected = String(p.connected);
    if (p.bot) el.dataset.bot = 'true';
    el.classList.toggle('me', p.id === myId);
    el.style.left = pct(p.x);
    el.style.top = pct(p.y);
    (el.querySelector('.healthbar-fill') as HTMLElement).style.width = `${p.hp}%`;
    if (p.hp < prevHp) {
      el.classList.remove('hit');
      void el.offsetWidth;
      el.classList.add('hit');
    }
    const wasConnected = knownConnected.get(p.id);
    if (wasConnected === true && !p.connected) feed(`${p.name} disconnected`);
    if (wasConnected === false && p.connected) feed(`${p.name} reconnected`);
    knownConnected.set(p.id, p.connected);
  }
  for (const [id, el] of playerEls) {
    if (seen.has(id)) continue;
    el.remove();
    playerEls.delete(id);
    knownConnected.delete(id);
  }
}

function renderDamage(events: DamageEvent[]): void {
  for (const e of events) {
    const kind = e.targetId === myId ? 'taken' : e.attackerId === myId ? 'dealt' : null;
    if (!kind) continue;
    const el = document.createElement('div');
    el.className = 'damage';
    el.setAttribute('data-testid', 'damage');
    el.dataset.target = e.target;
    el.dataset.amount = String(e.amount);
    el.dataset.kind = kind;
    el.textContent = `-${e.amount}`;
    el.style.left = pct(e.x + 0.3);
    el.style.top = pct(e.y);
    grid.append(el);
    setTimeout(() => el.remove(), DAMAGE_LIFETIME_MS);
    if (kind === 'taken') {
      grid.classList.remove('shake');
      void grid.offsetWidth;
      grid.classList.add('shake');
    }
  }
}

function renderHighscores(snap: Snapshot): void {
  const list = $('highscores');
  const items = snap.highscores.map((h) => {
    const li = document.createElement('li');
    li.setAttribute('data-testid', 'highscore');
    li.dataset.name = h.name;
    li.dataset.score = String(h.score);
    li.textContent = `${h.name} — ${h.score}`;
    return li;
  });
  list.replaceChildren(...items);
}

function bannerText(snap: Snapshot, me: PersonalView | null): string {
  const secs = Math.ceil(snap.phaseRemainingMs / 1000);
  if (snap.phase === 'lobby') return 'Waiting for players…';
  if (snap.phase === 'countdown') return `Round starts in ${secs}`;
  if (snap.phase === 'over') return snap.winner === 'none' ? 'No winner!' : `${snap.winner} wins!`;
  if (me && !me.inRound) return 'Spectating — you play next round';
  if (me && !me.alive) return 'You are out — spectating';
  return '';
}

function render(snap: Snapshot, me: PersonalView | null, damage: DamageEvent[]): void {
  $('phase').textContent = snap.phase;
  $('timer').textContent = snap.phase === 'countdown' ? `${Math.ceil(snap.phaseRemainingMs / 1000)}s` : '';
  $('winner-wrap').hidden = snap.phase !== 'over';
  $('winner').textContent = snap.phase === 'over' ? snap.winner ?? 'none' : '';
  if (me) {
    $('me').textContent = me.name;
    $('hp').textContent = String(me.hp);
    $('hp-max').textContent = String(me.maxHp);
    $('score').textContent = String(me.score);
    readyAt = performance.now() + me.cooldownRemainingMs;
    updateCooldown();
  }
  const z = snap.zone;
  Object.assign(zoneEl.dataset, { x0: String(z.x0), y0: String(z.y0), x1: String(z.x1), y1: String(z.y1) });
  zoneEl.style.left = pct(z.x0);
  zoneEl.style.top = pct(z.y0);
  zoneEl.style.width = pct(z.x1 - z.x0 + 1);
  zoneEl.style.height = pct(z.y1 - z.y0 + 1);
  renderPlayers(snap.players);
  renderDamage(damage);
  renderHighscores(snap);
  $('banner').textContent = bannerText(snap, me);
  if (snap.phase !== lastPhase && snap.phase === 'over') feed(snap.winner === 'none' ? 'Round over: no winner' : `${snap.winner} won the round`);
  lastPhase = snap.phase;
}

function updateCooldown(): void {
  const remaining = Math.max(0, readyAt - performance.now());
  const progress = 1 - remaining / COOLDOWN_MS;
  const ready = remaining <= 0;
  cooldownEl.dataset.ready = String(ready);
  cooldownEl.dataset.progress = ready ? '1' : progress.toFixed(3);
  cooldownFill.style.width = `${Math.max(0, Math.min(1, progress)) * 100}%`;
}

function frame(): void {
  updateCooldown();
  requestAnimationFrame(frame);
}

interface ServerMessage {
  t: string; id?: string; token?: string; snap?: Snapshot; me?: PersonalView | null; damage?: DamageEvent[];
}

function connect(): void {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.addEventListener('open', () => send({ t: 'hello', token: readToken() }));
  ws.addEventListener('message', (ev) => {
    let msg: ServerMessage;
    try { msg = JSON.parse(String(ev.data)) as ServerMessage; } catch { return; }
    if (msg.t === 'welcome' && msg.id && msg.token) {
      myId = msg.id;
      saveToken(msg.token);
    } else if (msg.t === 'state' && msg.snap) {
      render(msg.snap, msg.me ?? null, msg.damage ?? []);
    }
  });
  ws.addEventListener('close', () => {
    feed('Connection lost, reconnecting…');
    setTimeout(connect, 1000);
  });
}

document.addEventListener('keydown', (e) => {
  const dir = KEYS[e.key];
  if (dir) {
    e.preventDefault();
    send({ t: 'move', dir });
  } else if (e.key === ' ' || e.code === 'Space') {
    e.preventDefault();
    send({ t: 'attack' });
  }
});

for (const dir of ['up', 'down', 'left', 'right']) {
  document.querySelector(`[data-testid="${dir}"]`)?.addEventListener('click', () => send({ t: 'move', dir }));
}
document.querySelector('[data-testid="attack"]')?.addEventListener('click', () => send({ t: 'attack' }));
$('rules-button').addEventListener('click', () => { $('rules').hidden = !$('rules').hidden; });
// Buttons must not keep focus, or Space would re-click them as well as attack.
document.querySelectorAll('button').forEach((b) => b.addEventListener('mousedown', (e) => e.preventDefault()));

connect();
requestAnimationFrame(frame);
