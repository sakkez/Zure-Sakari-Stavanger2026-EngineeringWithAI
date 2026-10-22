"use strict";
(() => {
  const GRID = 30;
  const $ = (id) => document.getElementById(id);
  const q = (t) => document.querySelector(`[data-testid="${t}"]`);
  const grid = $("grid");
  const pieces = $("pieces");
  const zoneEl = $("zone");
  const cdEl = q("cooldown");
  const cdFill = cdEl.querySelector(".cd-fill");
  const timerEl = $("timer");
  const banner = $("banner");
  let ws = null;
  let state = null;
  let myName = "";
  let cdStart = 0; // local time the current wait started
  let cdEnd = 0; // local time the wait ends
  let phaseEnd = 0;
  const els = new Map();
  const prevHp = new Map();
  const knownPlayers = new Map();

  function getToken() {
    try { return sessionStorage.getItem("royale-token") || ""; } catch { return ""; }
  }
  function setToken(t) {
    try { sessionStorage.setItem("royale-token", t); } catch {}
  }

  function connect() {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    ws = new WebSocket(`${proto}://${location.host}/ws?token=${encodeURIComponent(getToken())}`);
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === "hello") {
        setToken(msg.token);
        myName = msg.name;
        q("me").textContent = myName;
      } else if (msg.type === "state") {
        render(msg);
      }
    };
    ws.onclose = () => setTimeout(connect, 500);
  }

  function send(o) {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(o));
  }

  function hpColor(frac) {
    if (frac > 0.6) return "#3dff8b";
    if (frac > 0.3) return "#ffd23f";
    return "#ff3b5c";
  }

  function hashHue(name) {
    let h = 0;
    for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return h % 360;
  }

  function toast(text) {
    const t = document.createElement("div");
    t.className = "toast";
    t.textContent = text;
    banner.appendChild(t);
    setTimeout(() => t.remove(), 3000);
  }

  function render(s) {
    const prev = state;
    state = s;
    const now = performance.now();
    myName = s.me || myName;
    q("me").textContent = myName;
    q("hp").textContent = String(s.hp);
    q("hp-max").textContent = String(s.hpMax);
    q("score").textContent = String(s.score);
    q("phase").textContent = s.phase;
    document.body.dataset.phase = s.phase;
    phaseEnd = now + s.phaseRemaining;

    // cooldown
    if (s.cooldownRemaining > 0) {
      const end = now + s.cooldownRemaining;
      if (Math.abs(end - cdEnd) > 30 || now >= cdEnd) {
        cdEnd = end;
        cdStart = end - s.cooldownTotal;
      }
    } else {
      cdEnd = now;
    }

    // winner
    const overCard = $("over-card");
    const winnerEl = q("winner");
    if (s.phase === "over") {
      winnerEl.textContent = s.winner || "none";
      overCard.hidden = false;
    } else {
      overCard.hidden = true;
    }

    // zone
    const z = s.zone;
    zoneEl.dataset.x0 = z.x0; zoneEl.dataset.y0 = z.y0; zoneEl.dataset.x1 = z.x1; zoneEl.dataset.y1 = z.y1;
    zoneEl.style.left = `calc(${z.x0} * var(--cell))`;
    zoneEl.style.top = `calc(${z.y0} * var(--cell))`;
    zoneEl.style.width = `calc(${z.x1 - z.x0 + 1} * var(--cell))`;
    zoneEl.style.height = `calc(${z.y1 - z.y0 + 1} * var(--cell))`;
    if (prev && prev.zone.x0 !== z.x0) {
      grid.classList.remove("shrink");
      void grid.offsetWidth;
      grid.classList.add("shrink");
    }

    // players
    const seen = new Set();
    for (const p of s.players) {
      seen.add(p.name);
      let el = els.get(p.name);
      if (!el) {
        el = document.createElement("div");
        el.className = "player";
        el.dataset.testid = "player";
        el.setAttribute("data-testid", "player");
        el.innerHTML = `<div class="body"></div><div class="tag"></div><div data-testid="healthbar" class="healthbar"><div class="hb-lag"></div><div data-testid="healthbar-fill" class="healthbar-fill"></div></div>`;
        el.style.setProperty("--hue", String(hashHue(p.name)));
        pieces.appendChild(el);
        els.set(p.name, el);
      }
      el.dataset.name = p.name;
      el.dataset.x = String(p.x);
      el.dataset.y = String(p.y);
      el.dataset.hp = String(p.hp);
      if (p.bot) el.dataset.bot = "true"; else delete el.dataset.bot;
      el.dataset.connected = String(p.connected);
      el.classList.toggle("me", p.name === myName);
      el.classList.toggle("offline", !p.connected);
      el.style.left = `calc(${p.x} * var(--cell))`;
      el.style.top = `calc(${p.y} * var(--cell))`;
      el.querySelector(".tag").textContent = p.name + (p.bot ? " 🤖" : "") + (p.connected ? "" : " (offline)");
      const frac = Math.max(0, Math.min(1, p.hp / s.hpMax));
      const fill = el.querySelector(".healthbar-fill");
      fill.style.width = `${frac * 100}%`;
      fill.style.background = hpColor(frac);
      el.querySelector(".hb-lag").style.width = `${frac * 100}%`;
      const old = prevHp.get(p.name);
      if (old !== undefined && p.hp < old) {
        el.classList.remove("hit");
        void el.offsetWidth;
        el.classList.add("hit");
      }
      prevHp.set(p.name, p.hp);
    }
    for (const [name, el] of els) {
      if (!seen.has(name)) {
        el.remove();
        els.delete(name);
        prevHp.delete(name);
      }
    }

    // damage numbers
    for (const e of s.events || []) {
      let kind = null;
      if (e.target === myName) kind = "taken";
      else if (e.attacker === myName) kind = "dealt";
      if (!kind) continue;
      const pos = s.players.find((p) => p.name === e.target) || (prev && prev.players.find((p) => p.name === e.target));
      const d = document.createElement("div");
      d.className = `damage ${kind}`;
      d.setAttribute("data-testid", "damage");
      d.dataset.target = e.target;
      d.dataset.amount = String(e.amount);
      d.dataset.kind = kind;
      d.textContent = `-${e.amount}`;
      d.style.color = kind === "dealt" ? "#ffd23f" : "#ff3b3b";
      const x = pos ? pos.x : 15, y = pos ? pos.y : 15;
      d.style.left = `calc(${x + 0.5} * var(--cell))`;
      d.style.top = `calc(${y} * var(--cell))`;
      grid.appendChild(d);
      setTimeout(() => d.remove(), 1100);
      if (kind === "taken") {
        document.body.classList.remove("ouch");
        void document.body.offsetWidth;
        document.body.classList.add("ouch");
      }
    }

    // presence list + connect/disconnect toasts
    const online = $("online");
    online.innerHTML = "";
    const nowNames = new Set();
    for (const o of s.online) {
      nowNames.add(o.name);
      const li = document.createElement("li");
      li.textContent = o.name + (o.name === myName ? " (you)" : "");
      li.className = o.connected ? "on" : "off";
      li.dataset.name = o.name;
      li.dataset.connected = String(o.connected);
      online.appendChild(li);
      const was = knownPlayers.get(o.name);
      if (was === true && !o.connected) toast(`${o.name} disconnected`);
      if (was === false && o.connected) toast(`${o.name} is back`);
      if (was === undefined && prev && o.name !== myName) toast(`${o.name} joined`);
      knownPlayers.set(o.name, o.connected);
    }
    for (const name of [...knownPlayers.keys()]) {
      if (!nowNames.has(name)) {
        knownPlayers.delete(name);
        if (name !== myName) toast(`${name} left`);
      }
    }

    // highscores
    const hs = q("highscores");
    hs.innerHTML = "";
    for (const h of s.highscores) {
      const li = document.createElement("li");
      li.setAttribute("data-testid", "highscore");
      li.dataset.name = h.name;
      li.dataset.score = String(h.score);
      li.innerHTML = `<span></span><b></b>`;
      li.firstChild.textContent = h.name;
      li.lastChild.textContent = String(h.score);
      hs.appendChild(li);
    }

    // status line
    let status = "";
    if (s.phase === "playing" && !s.inRound) status = "Round in progress — you play the next one";
    else if (s.phase === "playing" && !s.alive) status = "You are out — spectating";
    $("over-card").classList.toggle("won", s.phase === "over" && s.winner === myName);
    document.body.dataset.status = status;
    banner.dataset.status = status;
    banner.setAttribute("data-msg", status);
  }

  function frame() {
    const now = performance.now();
    const ready = now >= cdEnd;
    const total = Math.max(1, cdEnd - cdStart);
    const progress = ready ? 1 : Math.max(0, Math.min(1, (now - cdStart) / total));
    cdEl.dataset.ready = String(ready);
    cdEl.dataset.progress = progress.toFixed(3);
    cdFill.style.width = `${progress * 100}%`;
    if (state && (state.phase === "countdown" || state.phase === "over")) {
      timerEl.textContent = `${Math.ceil(Math.max(0, phaseEnd - now) / 1000)}s`;
    } else timerEl.textContent = "";
    requestAnimationFrame(frame);
  }

  const keys = {
    ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
    w: "up", s: "down", a: "left", d: "right", W: "up", S: "down", A: "left", D: "right",
  };
  window.addEventListener("keydown", (e) => {
    if (e.target && e.target.tagName === "INPUT") return;
    if (keys[e.key]) {
      e.preventDefault();
      send({ type: "move", dir: keys[e.key] });
    } else if (e.key === " " || e.code === "Space") {
      e.preventDefault();
      send({ type: "attack" });
    }
  });
  for (const dir of ["up", "down", "left", "right"]) {
    q(dir).addEventListener("click", () => send({ type: "move", dir }));
  }
  q("attack").addEventListener("click", () => send({ type: "attack" }));
  // buttons should not keep focus, so Space never re-clicks them
  for (const b of document.querySelectorAll("button")) b.addEventListener("mousedown", (e) => e.preventDefault());
  $("rules-button").addEventListener("click", () => { $("rules").hidden = !$("rules").hidden; });

  connect();
  requestAnimationFrame(frame);
})();
