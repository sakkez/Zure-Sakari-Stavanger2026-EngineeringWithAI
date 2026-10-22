(() => {
  const $ = (id) => document.querySelector(`[data-testid="${id}"]`);
  const grid = $('grid');
  const zoneEl = $('zone');
  const cooldown = $('cooldown');
  const cdFill = cooldown.querySelector('.cd-fill');
  const timer = document.getElementById('timer');
  const bannerText = document.getElementById('banner-text');
  const winnerEl = $('winner');
  const els = new Map();
  let ws = null;
  let myName = '';
  let cd = { left: 0, at: performance.now(), total: 1000 };
  const pct = (n) => (n * 100) / 30 + '%';

  function getToken() { try { return localStorage.getItem('zr-token'); } catch { return null; } }
  function setToken(t) { try { localStorage.setItem('zr-token', t); } catch {} }

  function connect() {
    ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
    ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', token: getToken() }));
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.t === 'welcome') { setToken(m.token); myName = m.name; $('me').textContent = m.name; }
      else if (m.t === 'state') render(m);
    };
    ws.onclose = () => setTimeout(connect, 1000);
  }
  const send = (o) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); };

  function render(s) {
    $('phase').textContent = s.phase;
    $('score').textContent = String(s.me.score);
    $('hp').textContent = String(s.me.hp);
    $('hp-max').textContent = String(s.hpMax);
    $('me').textContent = s.me.name;
    myName = s.me.name;
    timer.textContent = s.timeLeft ? `(${Math.ceil(s.timeLeft / 1000)}s)` : '';
    if (s.phase === 'over') {
      winnerEl.hidden = false; winnerEl.textContent = s.winner;
      bannerText.textContent = 'Round over! Winner:';
    } else {
      winnerEl.hidden = true; winnerEl.textContent = '';
      bannerText.textContent = s.phase === 'lobby' ? 'Waiting for players…'
        : s.phase === 'countdown' ? (s.me.inRound ? '' : 'Round starting soon!')
        : !s.me.inRound ? 'Round in progress — you join the next one. Watching…'
        : !s.me.alive ? 'You were knocked out. Spectating…' : '';
    }
    const z = s.zone;
    zoneEl.dataset.x0 = z.x0; zoneEl.dataset.y0 = z.y0; zoneEl.dataset.x1 = z.x1; zoneEl.dataset.y1 = z.y1;
    zoneEl.style.left = pct(z.x0); zoneEl.style.top = pct(z.y0);
    zoneEl.style.width = pct(z.x1 - z.x0 + 1); zoneEl.style.height = pct(z.y1 - z.y0 + 1);

    const seen = new Set();
    for (const p of s.players) {
      seen.add(p.name);
      let el = els.get(p.name);
      if (!el) {
        el = document.createElement('div');
        el.className = 'player';
        el.dataset.testid = 'player';
        el.setAttribute('data-testid', 'player');
        el.innerHTML = '<div class="block"></div><div class="label"></div><div class="healthbar" data-testid="healthbar"><div class="healthbar-fill" data-testid="healthbar-fill"></div></div>';
        el.querySelector('.label').textContent = p.name;
        grid.appendChild(el);
        els.set(p.name, el);
      }
      el.dataset.name = p.name;
      el.dataset.x = p.x; el.dataset.y = p.y; el.dataset.hp = p.hp;
      if (p.bot) el.dataset.bot = 'true'; else delete el.dataset.bot;
      el.dataset.connected = p.connected ? 'true' : 'false';
      el.classList.toggle('me', p.name === myName);
      el.style.left = pct(p.x); el.style.top = pct(p.y);
      el.querySelector('.healthbar-fill').style.width = Math.max(0, Math.min(100, (p.hp / s.hpMax) * 100)) + '%';
    }
    for (const [name, el] of els) if (!seen.has(name)) { el.remove(); els.delete(name); }

    for (const ev of s.events) {
      let kind = null;
      if (ev.target === myName) kind = 'taken';
      else if (ev.attacker === myName) kind = 'dealt';
      if (!kind) continue;
      const tgt = els.get(ev.target);
      const d = document.createElement('div');
      d.className = 'damage';
      d.setAttribute('data-testid', 'damage');
      d.dataset.target = ev.target; d.dataset.amount = ev.amount; d.dataset.kind = kind;
      d.textContent = '-' + ev.amount;
      if (tgt) { d.style.left = tgt.style.left; d.style.top = tgt.style.top; tgt.classList.remove('hit'); void tgt.offsetWidth; tgt.classList.add('hit'); }
      grid.appendChild(d);
      setTimeout(() => d.remove(), 1000);
    }

    cd = { left: s.me.cooldownLeft, at: performance.now(), total: s.cooldownMs };
    updateCooldown();
  }

  function updateCooldown() {
    const left = Math.max(0, cd.left - (performance.now() - cd.at));
    const progress = left <= 0 ? 1 : Math.max(0, Math.min(1, 1 - left / cd.total));
    cooldown.dataset.ready = left <= 0 ? 'true' : 'false';
    cooldown.dataset.progress = progress.toFixed(3);
    cdFill.style.width = progress * 100 + '%';
  }
  (function loop() { updateCooldown(); requestAnimationFrame(loop); })();

  const keys = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right' };
  document.addEventListener('keydown', (e) => {
    if (keys[e.key]) { e.preventDefault(); send({ t: 'move', dir: keys[e.key] }); }
    else if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); send({ t: 'attack' }); }
  });
  for (const dir of ['up', 'down', 'left', 'right']) $(dir).addEventListener('click', (e) => { e.currentTarget.blur(); send({ t: 'move', dir }); });
  $('attack').addEventListener('click', (e) => { e.currentTarget.blur(); send({ t: 'attack' }); });
  $('rules-button').addEventListener('click', () => { const r = $('rules'); r.hidden = !r.hidden; });
  const hs = $('highscores');
  const origRender = render;
  render = function (s) {
    origRender(s);
    const key = JSON.stringify(s.highscores);
    if (hs.dataset.key !== key) {
      hs.dataset.key = key;
      hs.innerHTML = '';
      for (const h of s.highscores) {
        const li = document.createElement('li');
        li.setAttribute('data-testid', 'highscore');
        li.dataset.name = h.name; li.dataset.score = h.score;
        li.textContent = `${h.name} — ${h.score}`;
        hs.appendChild(li);
      }
    }
  };
  connect();
})();
