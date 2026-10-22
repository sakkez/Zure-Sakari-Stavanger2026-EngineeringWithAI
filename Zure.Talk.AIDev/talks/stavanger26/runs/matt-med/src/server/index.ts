import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { Game, configFromEnv } from './game.js';
import type { ClientMsg, ServerMsg } from '../shared/types.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public');
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

const game = new Game(configFromEnv(process.env));

const server = createServer(async (req, res) => {
  const url = (req.url || '/').split('?')[0];
  const file = url === '/' ? 'index.html' : url.slice(1);
  if (file.includes('..')) return void res.writeHead(400).end();
  try {
    const body = await readFile(join(root, file));
    const ext = file.slice(file.lastIndexOf('.'));
    res.writeHead(200, { 'content-type': TYPES[ext] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});

const wss = new WebSocketServer({ server, path: '/ws' });
const clients = new Map<WebSocket, string>();

const send = (ws: WebSocket, m: ServerMsg) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(m));

wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    let msg: ClientMsg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }
    const now = Date.now();
    const id = clients.get(ws);
    if (msg.t === 'hello' && !id) {
      const h = game.connect(typeof msg.token === 'string' ? msg.token : undefined, now);
      // A token can only drive one socket: close any older socket for the same player.
      for (const [other, oid] of clients) if (oid === h.id && other !== ws) { clients.delete(other); other.close(); }
      clients.set(ws, h.id);
      send(ws, { t: 'welcome', id: h.id, token: h.token, name: h.name });
      broadcast();
      return;
    }
    if (!id) return;
    if (msg.t === 'move' && ['up', 'down', 'left', 'right'].includes(msg.dir)) game.move(id, msg.dir, now);
    else if (msg.t === 'attack') game.attack(id, now);
    broadcast();
  });
  ws.on('close', () => {
    const id = clients.get(ws);
    clients.delete(ws);
    if (id) game.disconnect(id, Date.now());
    broadcast();
  });
});

function broadcast() {
  const now = Date.now();
  const s = game.snapshot(now);
  for (const [ws, id] of clients) send(ws, { t: 'state', s, me: game.meView(id, now) });
}

setInterval(() => {
  game.tick(Date.now());
  broadcast();
}, 50);

const port = Number(process.env.PORT) || 3000;
server.listen(port, () => console.log(`listening on http://localhost:${port}`));
