import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import WebSocket from 'ws';
import { startServer, type RunningServer } from '../src/app.js';

const config = { countdownMs: 100, zoneIntervalMs: 60_000, resultMs: 100, reconnectMs: 300 };

interface Msg { t: string; id?: string; token?: string; snap?: { phase: string; players: { id: string; x: number; y: number; connected: boolean }[] }; me?: { name: string } }

class Client {
  readonly messages: Msg[] = [];
  private constructor(readonly ws: WebSocket) {
    ws.on('message', (raw) => this.messages.push(JSON.parse(String(raw)) as Msg));
  }

  static async open(port: number, token = ''): Promise<Client> {
    const ws = new WebSocket(`ws://localhost:${port}/ws`);
    await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
    const client = new Client(ws);
    ws.send(JSON.stringify({ t: 'hello', token }));
    return client;
  }

  async waitFor(pred: (m: Msg) => boolean, timeoutMs = 3000): Promise<Msg> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const found = [...this.messages].reverse().find(pred);
      if (found) return found;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error('timed out waiting for message');
  }
}

let server: RunningServer;
beforeEach(async () => { server = await startServer({ port: 0, config }); });
afterEach(async () => { await server.close(); });

describe('server', () => {
  test('serves the page and 404s unknown paths', async () => {
    const page = await fetch(`http://localhost:${server.port}/`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('data-testid="grid"');
    expect((await fetch(`http://localhost:${server.port}/nope`)).status).toBe(404);
  });

  test('welcomes a player with an id and token, then streams state', async () => {
    const c = await Client.open(server.port);
    const welcome = await c.waitFor((m) => m.t === 'welcome');
    expect(welcome.id).toBeTruthy();
    expect(welcome.token).toBeTruthy();
    const state = await c.waitFor((m) => m.t === 'state' && m.me !== null && m.me !== undefined);
    expect(state.me?.name).toMatch(/^\w+ \w+$/);
    c.ws.close();
  });

  test('two players see each other move, and see a disconnect', async () => {
    const a = await Client.open(server.port);
    const b = await Client.open(server.port);
    const aId = (await a.waitFor((m) => m.t === 'welcome')).id as string;
    const bId = (await b.waitFor((m) => m.t === 'welcome')).id as string;
    const playing = await b.waitFor((m) => m.snap?.phase === 'playing' && m.snap.players.length === 2);
    const start = playing.snap?.players.find((p) => p.id === aId) as { x: number; y: number };
    const dir = start.y > 0 ? 'up' : 'down';
    a.ws.send(JSON.stringify({ t: 'move', dir }));
    const expectedY = start.y + (dir === 'up' ? -1 : 1);
    await b.waitFor((m) => m.snap?.players.some((p) => p.id === aId && p.y === expectedY) === true);
    a.ws.close();
    await b.waitFor((m) => m.snap?.players.some((p) => p.id === aId && !p.connected) === true);
    await b.waitFor((m) => m.snap?.phase === 'over');
    expect(bId).not.toBe(aId);
    b.ws.close();
  });

  test('reconnecting with the token resumes the same player', async () => {
    const first = await Client.open(server.port);
    const welcome = await first.waitFor((m) => m.t === 'welcome');
    first.ws.close();
    const again = await Client.open(server.port, welcome.token);
    expect((await again.waitFor((m) => m.t === 'welcome')).id).toBe(welcome.id);
    again.ws.close();
  });

  test('ignores malformed and unknown messages without dropping the connection', async () => {
    const c = await Client.open(server.port);
    await c.waitFor((m) => m.t === 'welcome');
    c.ws.send('not json');
    c.ws.send(JSON.stringify({ t: 'move', dir: 'sideways' }));
    c.ws.send(JSON.stringify({ t: 'teleport', x: 1 }));
    c.ws.send('null');
    const before = c.messages.length;
    await c.waitFor(() => c.messages.length > before + 1);
    expect(c.ws.readyState).toBe(WebSocket.OPEN);
    c.ws.close();
  });
});
