// Reference build of template/talk/brief.md, written to prove the acceptance suite.
// One process, no dependencies: state goes out over server-sent events, intents come in as POSTs.
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const env = (k, d) => Number(process.env[k] ?? d);
const COUNTDOWN_MS = env("COUNTDOWN_MS", 5000);
const ZONE_INTERVAL_MS = env("ZONE_INTERVAL_MS", 15000);
const RESULT_MS = env("RESULT_MS", 5000);
const RECONNECT_MS = env("RECONNECT_MS", 10000);
const SIZE = 30, MIN_ZONE = 4, MAX_MOVES_PER_S = 5;
const HP = 100, HIT = 25, COOLDOWN_MS = 1000; // the wait after an attack, and after a move
const BOT_STEP_MS = 500;
const KILL = 100, SHRINK = 10, WIN = 250;

const ADJ = ["Brave", "Calm", "Swift", "Sly", "Bold", "Quiet", "Lucky", "Fierce", "Gentle", "Clever", "Wild", "Proud"];
const ANIMALS = ["Otter", "Fox", "Badger", "Heron", "Lynx", "Moose", "Raven", "Hare", "Wolf", "Seal", "Owl", "Bear"];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const dist = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

const humans = new Map(); // token -> player
let bots = [];
let phase = "lobby", phaseEnds = 0, winner = null;
let zone = { x0: 0, y0: 0, x1: SIZE - 1, y1: SIZE - 1 };
let nextShrink = 0, nextDamage = 0;
const highscores = [];
let entrySeq = 0;
let hits = []; // { from, to, amount } since the last broadcast, for the damage numbers

const everyone = () => [...humans.values(), ...bots];
const fighters = () => everyone().filter((p) => p.inRound && p.alive);
const connected = () => [...humans.values()].filter((p) => p.conns > 0);
const inZone = (p) => p.x >= zone.x0 && p.x <= zone.x1 && p.y >= zone.y0 && p.y <= zone.y1;
const taken = (x, y) => fighters().some((p) => p.x === x && p.y === y);

function newName() {
  const used = new Set(everyone().map((p) => p.name));
  for (let i = 0; i < 1000; i++) {
    const n = `${pick(ADJ)} ${pick(ANIMALS)}`;
    if (!used.has(n)) return n;
  }
  return `${pick(ADJ)} ${pick(ANIMALS)}${used.size}`;
}

function spawn(placed) {
  for (let i = 0; i < 2000; i++) {
    const c = { x: Math.floor(Math.random() * SIZE), y: Math.floor(Math.random() * SIZE) };
    if (placed.every((p) => dist(p, c) >= 3)) return c;
  }
  for (let i = 0; ; i++) {
    const c = { x: i % SIZE, y: Math.floor(i / SIZE) };
    if (placed.every((p) => p.x !== c.x || p.y !== c.y)) return c;
  }
}

function startRound(now) {
  const players = connected();
  bots = players.length === 1 ? [{ name: newName(), bot: true, conns: 0 }] : [];
  for (const p of humans.values()) p.inRound = false;
  const placed = [];
  for (const p of [...players, ...bots]) {
    Object.assign(p, spawn(placed), { inRound: true, alive: true, hp: HP, score: 0, moves: [], lastAttack: -Infinity, lastMove: -Infinity, nextStep: now + BOT_STEP_MS });
    placed.push(p);
  }
  zone = { x0: 0, y0: 0, x1: SIZE - 1, y1: SIZE - 1 };
  nextShrink = now + ZONE_INTERVAL_MS;
  nextDamage = now + 1000;
  winner = null;
  phase = "playing";
}

function hurt(target, amount, attacker) {
  if (attacker) hits.push({ from: attacker.name, to: target.name, amount });
  target.hp = Math.max(0, target.hp - amount);
  if (target.hp > 0) return;
  target.alive = false;
  if (attacker && !attacker.bot) attacker.score += KILL;
}

function checkEnd(now) {
  if (phase !== "playing") return;
  const alive = fighters();
  if (alive.length > 1) return;
  const w = alive[0];
  winner = w ? w.name : "none";
  if (w && !w.bot) w.score += WIN;
  for (const p of humans.values()) if (p.inRound) highscores.push({ name: p.name, score: p.score, seq: entrySeq++ });
  highscores.sort((a, b) => b.score - a.score || a.seq - b.seq);
  highscores.length = Math.min(highscores.length, 10);
  phase = "over";
  phaseEnds = now + RESULT_MS;
}

const readyAt = (p) => Math.max(p.lastAttack, p.lastMove) + COOLDOWN_MS;

// Players and bots attack by the same rule: everyone in the 8 cells around, once the wait is over.
function strike(p, now) {
  if (now < readyAt(p)) return;
  p.lastAttack = now;
  for (const q of fighters()) if (q !== p && dist(p, q) <= 1) hurt(q, HIT, p);
}

function step(p, tx, ty) {
  const dx = Math.sign(tx - p.x), dy = Math.sign(ty - p.y);
  const xFirst = Math.abs(tx - p.x) >= Math.abs(ty - p.y);
  const tries = xFirst ? [[dx, 0], [0, dy]] : [[0, dy], [dx, 0]];
  for (const [sx, sy] of tries) {
    if (!sx && !sy) continue;
    if (!taken(p.x + sx, p.y + sy)) { p.x += sx; p.y += sy; p.lastMove = Date.now(); return; }
  }
}

function botTurn(b, now) {
  const players = fighters().filter((p) => !p.bot);
  const near = players.filter((p) => dist(p, b) <= 1);
  if (near.length) return strike(b, now);
  if (now < b.nextStep) return;
  b.nextStep = now + BOT_STEP_MS;
  if (!inZone(b)) return step(b, (zone.x0 + zone.x1) / 2, (zone.y0 + zone.y1) / 2);
  const target = players.sort((p, q) => dist(p, b) - dist(q, b))[0];
  if (target) step(b, target.x, target.y);
}

function tick() {
  const now = Date.now();
  for (const [token, p] of humans) {
    if (p.conns > 0 || now - p.goneAt < RECONNECT_MS) continue;
    humans.delete(token);
    if (p.inRound) p.alive = false;
  }
  if (phase === "lobby" && connected().length) { phase = "countdown"; phaseEnds = now + COUNTDOWN_MS; }
  if (phase === "countdown" && !connected().length) phase = "lobby";
  if (phase === "countdown" && now >= phaseEnds) startRound(now);
  if (phase === "playing") {
    while (now >= nextShrink && zone.x1 - zone.x0 + 1 > MIN_ZONE) {
      zone = { x0: zone.x0 + 1, y0: zone.y0 + 1, x1: zone.x1 - 1, y1: zone.y1 - 1 };
      nextShrink += ZONE_INTERVAL_MS;
      for (const p of fighters()) if (!p.bot) p.score += SHRINK;
    }
    if (now >= nextDamage) {
      nextDamage += 1000;
      for (const p of fighters()) if (!inZone(p)) hurt(p, 10, null);
    }
    for (const b of bots) if (b.alive) botTurn(b, now);
    checkEnd(now);
  }
  if (phase === "over" && now >= phaseEnds) { phase = "lobby"; bots = []; for (const p of humans.values()) p.inRound = false; }
  broadcast();
}

const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
function intent(p, msg) {
  if (phase !== "playing" || !p.inRound || !p.alive) return;
  const now = Date.now();
  if (msg.type === "move" && DIRS[msg.dir]) {
    p.moves = p.moves.filter((t) => now - t < 1000);
    if (p.moves.length >= MAX_MOVES_PER_S) return;
    const [dx, dy] = DIRS[msg.dir];
    const x = p.x + dx, y = p.y + dy;
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE || taken(x, y)) return;
    p.moves.push(now);
    p.x = x; p.y = y;
    p.lastMove = now;
  } else if (msg.type === "attack") {
    strike(p, now);
    checkEnd(now);
  }
}

const streams = new Set(); // { res, player }
// Live highscores: while a round runs, its players count as entries made now.
function liveHighscores() {
  const live = phase === "playing" ? [...humans.values()].filter((p) => p.inRound).map((p, i) => ({ name: p.name, score: p.score, seq: entrySeq + i })) : [];
  return [...highscores, ...live].sort((a, b) => b.score - a.score || a.seq - b.seq).slice(0, 10).map(({ name, score }) => ({ name, score }));
}

function broadcast() {
  const now = Date.now();
  const shared = {
    phase, winner, zone,
    countdown: phase === "countdown" ? Math.max(0, phaseEnds - now) : null,
    players: phase === "playing" || phase === "over" ? fighters().map(({ name, x, y, hp, bot }) => ({ name, x, y, hp, max: HP, bot: !!bot })) : [],
    highscores: liveHighscores(),
  };
  const sent = hits;
  hits = [];
  for (const s of streams) {
    const { name, hp, score, inRound, alive } = s.player;
    const playing = !!(inRound && alive && phase === "playing");
    const cooldown = playing ? Math.max(0, readyAt(s.player) - now) : 0;
    const mine = sent.filter((h) => h.from === name || h.to === name);
    s.res.write(`data: ${JSON.stringify({ ...shared, hits: mine, you: { name, hp: hp ?? HP, max: HP, score: score ?? 0, playing, cooldown } })}\n\n`);
  }
}

const page = readFileSync(new URL("./index.html", import.meta.url));
createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (req.method === "GET" && url.pathname === "/") return res.writeHead(200, { "content-type": "text/html" }).end(page);
  if (req.method === "GET" && url.pathname === "/events") {
    let token = url.searchParams.get("token");
    let p = token && humans.get(token);
    if (!p) {
      token = randomUUID();
      p = { token, name: newName(), conns: 0, inRound: false, alive: false, score: 0 };
      humans.set(token, p);
    }
    p.conns++;
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
    res.write(`event: hello\ndata: ${JSON.stringify({ token, name: p.name })}\n\n`);
    const s = { res, player: p };
    streams.add(s);
    req.on("close", () => { streams.delete(s); if (--p.conns === 0) p.goneAt = Date.now(); });
    return;
  }
  if (req.method === "POST" && url.pathname === "/intent") {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => {
      try {
        const msg = JSON.parse(body);
        const p = humans.get(msg.token);
        if (p) intent(p, msg);
      } catch {}
      res.writeHead(204).end();
    });
    return;
  }
  res.writeHead(404).end();
}).listen(env("PORT", 3000), () => console.log(`listening on ${env("PORT", 3000)}`));
setInterval(tick, 50);
