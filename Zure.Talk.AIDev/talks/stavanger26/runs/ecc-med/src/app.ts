import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AddressInfo } from 'node:net';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';
import type { GameConfig } from './config.js';
import { Game, type Dir } from './game.js';

const TICK_MS = 50;
const MAX_MESSAGE_BYTES = 512;
const MAX_TOKEN_LENGTH = 64;
const DIRS: ReadonlySet<string> = new Set(['up', 'down', 'left', 'right']);

export interface ServerOptions { port: number; config: GameConfig }
export interface RunningServer { port: number; close: () => Promise<void> }

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS: Record<string, { file: string; type: string }> = {
  '/': { file: join(ROOT, 'public', 'index.html'), type: 'text/html; charset=utf-8' },
  '/index.html': { file: join(ROOT, 'public', 'index.html'), type: 'text/html; charset=utf-8' },
  '/client.js': { file: join(ROOT, 'dist', 'client.js'), type: 'text/javascript; charset=utf-8' },
};

function serveAsset(req: IncomingMessage, res: ServerResponse): void {
  const asset = ASSETS[(req.url ?? '/').split('?')[0]];
  if (!asset) {
    res.writeHead(404).end('not found');
    return;
  }
  try {
    const body = readFileSync(asset.file);
    res.writeHead(200, { 'content-type': asset.type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
    res.end(body);
  } catch (err) {
    process.stderr.write(`asset ${asset.file} unavailable: ${String(err)}\n`);
    res.writeHead(503).end('asset unavailable, run npm run build');
  }
}

function parse(raw: RawData): Record<string, unknown> | null {
  try {
    const data: unknown = JSON.parse(String(raw));
    return data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function validToken(token: unknown): string | null {
  return typeof token === 'string' && token.length > 0 && token.length <= MAX_TOKEN_LENGTH ? token : null;
}

export function startServer({ port, config }: ServerOptions): Promise<RunningServer> {
  const game = new Game(config);
  const sockets = new Map<WebSocket, string>();
  const server = createServer(serveAsset);
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: MAX_MESSAGE_BYTES });

  const flush = (now: number): void => {
    const snap = game.snapshot(now);
    const damage = game.takeDamageEvents();
    for (const [ws, id] of sockets) {
      if (ws.readyState !== ws.OPEN) continue;
      ws.send(JSON.stringify({ t: 'state', snap, me: game.personal(id, now), damage }));
    }
  };

  const handle = (ws: WebSocket, msg: Record<string, unknown>, now: number): void => {
    const id = sockets.get(ws);
    if (msg.t === 'hello' && !id) {
      const token = validToken(msg.token) ?? randomUUID();
      const player = game.join(now, token);
      sockets.set(ws, player.id);
      ws.send(JSON.stringify({ t: 'welcome', id: player.id, token }));
    } else if (id && msg.t === 'move' && typeof msg.dir === 'string' && DIRS.has(msg.dir)) {
      game.move(now, id, msg.dir as Dir);
    } else if (id && msg.t === 'attack') {
      game.attack(now, id);
    }
  };

  wss.on('connection', (ws) => {
    ws.on('message', (raw) => {
      const msg = parse(raw);
      if (!msg) return;
      const now = Date.now();
      handle(ws, msg, now);
      flush(now);
    });
    ws.on('close', () => {
      const id = sockets.get(ws);
      sockets.delete(ws);
      if (id && ![...sockets.values()].includes(id)) game.disconnect(Date.now(), id);
    });
    ws.on('error', (err) => process.stderr.write(`ws error: ${err.message}\n`));
  });

  const timer = setInterval(() => {
    const now = Date.now();
    game.tick(now);
    flush(now);
  }, TICK_MS);

  const close = (): Promise<void> => new Promise((resolve) => {
    clearInterval(timer);
    for (const ws of wss.clients) ws.terminate();
    wss.close();
    server.close(() => resolve());
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, () => resolve({ port: (server.address() as AddressInfo).port, close }));
  });
}
