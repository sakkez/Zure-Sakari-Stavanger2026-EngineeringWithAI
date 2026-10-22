import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { Game, MAX_HP, ATTACK_COOLDOWN_MS } from './game.ts';

const num = (v: string | undefined, d: number) => (v && !isNaN(Number(v)) ? Number(v) : d);
const cfg = {
  countdownMs: num(process.env.COUNTDOWN_MS, 5000),
  zoneIntervalMs: num(process.env.ZONE_INTERVAL_MS, 15000),
  resultMs: num(process.env.RESULT_MS, 5000),
  reconnectMs: num(process.env.RECONNECT_MS, 10000),
};
const PORT = num(process.env.PORT, 3000);
const game = new Game(cfg);

const pub = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

const server = http.createServer((req, res) => {
  const url = (req.url || '/').split('?')[0];
  const file = path.join(pub, url === '/' ? 'index.html' : path.normalize(url).replace(/^([\\/]\.\.)+/, ''));
  if (!file.startsWith(pub)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server });
const sockets = new Map<WebSocket, string>();

wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    let msg: any;
    try { msg = JSON.parse(String(raw)); } catch { return; }
    const now = Date.now();
    if (msg.t === 'hello') {
      const p = game.join(typeof msg.token === 'string' ? msg.token : undefined, now);
      // one socket per player: drop older sockets of the same player
      for (const [s, id] of sockets) if (id === p.id && s !== ws) { sockets.delete(s); s.close(); }
      sockets.set(ws, p.id);
      ws.send(JSON.stringify({ t: 'welcome', token: p.token, name: p.name }));
      return;
    }
    const id = sockets.get(ws);
    if (!id) return;
    if (msg.t === 'move') {
      const d: Record<string, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
      const v = d[msg.dir];
      if (v) game.move(id, v[0], v[1]);
    } else if (msg.t === 'attack') {
      game.attack(id, now);
    }
    broadcast(now);
  });
  ws.on('close', () => {
    const id = sockets.get(ws);
    sockets.delete(ws);
    if (id && ![...sockets.values()].includes(id)) game.disconnect(id, Date.now());
  });
});

let pendingEvents: ReturnType<Game['takeEvents']> = [];
function broadcast(now: number) {
  pendingEvents = pendingEvents.concat(game.takeEvents());
  const showPlayers = game.phase === 'playing' || game.phase === 'over';
  const players = showPlayers
    ? game.living().map((p) => ({ name: p.name, x: p.x, y: p.y, hp: p.hp, bot: p.bot, connected: p.connected }))
    : [];
  const base = {
    t: 'state',
    phase: game.phase,
    timeLeft: game.phase === 'countdown' || game.phase === 'over' ? Math.max(0, game.phaseEndsAt - now) : 0,
    winner: game.phase === 'over' ? game.winner ?? 'none' : null,
    zone: game.zone,
    players,
    highscores: game.highscores.map((h) => ({ name: h.name, score: h.score })),
    events: pendingEvents,
    hpMax: MAX_HP,
    cooldownMs: ATTACK_COOLDOWN_MS,
  };
  pendingEvents = [];
  for (const [ws, id] of sockets) {
    const p = game.players.get(id);
    if (!p || ws.readyState !== WebSocket.OPEN) continue;
    ws.send(JSON.stringify({
      ...base,
      me: {
        name: p.name, score: p.score, hp: p.hp, inRound: p.inRound, alive: p.alive,
        cooldownLeft: game.cooldownLeft(p, now),
      },
    }));
  }
}

setInterval(() => {
  const now = Date.now();
  game.tick(now);
  broadcast(now);
}, 50);

server.listen(PORT, () => console.log(`listening on ${PORT}`));
