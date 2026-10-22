import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, WebSocket } from "ws";
import { Game, defaultConfig, type Dir } from "./game.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(here, "..", "public");
const PORT = Number(process.env.PORT) || 3000;

const game = new Game(defaultConfig(process.env));

const types: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  let p = url.pathname === "/" ? "/index.html" : url.pathname;
  const file = path.join(publicDir, path.normalize(p));
  if (!file.startsWith(publicDir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end("not found");
    return;
  }
  res.writeHead(200, { "content-type": types[path.extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
  fs.createReadStream(file).pipe(res);
});

const wss = new WebSocketServer({ server, path: "/ws" });
const clients = new Map<WebSocket, string>();
let lastVersion = -1;

function broadcast() {
  const now = Date.now();
  const events = game.takeEvents();
  if (game.version === lastVersion && events.length === 0) return;
  lastVersion = game.version;
  for (const [ws, token] of clients) {
    if (ws.readyState !== WebSocket.OPEN) continue;
    ws.send(JSON.stringify({ ...game.view(token, now), events }));
  }
}

wss.on("connection", (ws, req) => {
  const url = new URL(req.url ?? "/", "http://x");
  const token = url.searchParams.get("token") || undefined;
  // a token already in use by a live socket gets a fresh identity
  const inUse = token && [...clients.values()].includes(token);
  const s = game.connect(inUse ? undefined : token, Date.now());
  clients.set(ws, s.token);
  ws.send(JSON.stringify({ type: "hello", token: s.token, name: s.name }));
  lastVersion = -1;
  broadcast();

  ws.on("message", (raw) => {
    let msg: { type?: string; dir?: string };
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }
    const now = Date.now();
    if (msg.type === "move" && ["up", "down", "left", "right"].includes(msg.dir ?? "")) {
      game.move(s.token, msg.dir as Dir, now);
    } else if (msg.type === "attack") {
      game.attack(s.token, now);
    }
    broadcast();
  });
  ws.on("close", () => {
    clients.delete(ws);
    game.disconnect(s.token, Date.now());
    broadcast();
  });
});

setInterval(() => {
  game.tick(Date.now());
  broadcast();
}, 50);

server.listen(PORT, () => console.log(`listening on ${PORT}`));
