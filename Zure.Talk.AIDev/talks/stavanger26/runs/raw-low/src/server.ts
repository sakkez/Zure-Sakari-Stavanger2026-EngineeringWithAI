import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { Game } from './game.ts';

const game = new Game();
const pub = path.join(import.meta.dirname, '..', 'public');
const server = http.createServer((req, res) => {
  const f = req.url === '/' || !req.url ? 'index.html' : path.basename(req.url.split('?')[0]);
  fs.readFile(path.join(pub, f), (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : 'text/html' });
    res.end(data);
  });
});

const socks = new Map<WebSocket, string>();
const wss = new WebSocketServer({ server });
wss.on('connection', (ws, req) => {
  const resume = new URL(req.url ?? '/', 'http://x').searchParams.get('id');
  const p = (resume && game.reconnect(resume)) || game.join();
  socks.set(ws, p.id);
  ws.send(JSON.stringify({ type: 'hello', id: p.id }));
  ws.on('message', raw => {
    try {
      const m = JSON.parse(String(raw));
      if (m.type === 'move') game.move(p.id, m.dir);
      else if (m.type === 'attack') game.attack(p.id);
    } catch { /* ignore bad input */ }
  });
  ws.on('close', () => { socks.delete(ws); game.disconnect(p.id); });
});

setInterval(() => {
  game.tick();
  for (const [ws, id] of socks) ws.send(JSON.stringify({ type: 'state', ...game.view(id) }));
}, 50);

const port = Number(process.env.PORT) || 3000;
server.listen(port, () => console.log('listening on', port));
