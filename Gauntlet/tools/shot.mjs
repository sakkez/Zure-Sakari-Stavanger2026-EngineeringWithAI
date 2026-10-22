// Headless screenshot harness used by build agents and visual critics.
// Usage:
//   node tools/shot.mjs --query "class=mage&shot=1" --step 2 --eval "js run before stepping" --out shots/mage.png [--size 1600x900] [--url http://127.0.0.1:5173/]
// Multiple --eval/--step pairs run in order. Starts its own Vite server if --url is not reachable.
// With ?shot=1 real time is frozen; window.__step(seconds) advances the simulation deterministically.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const args = process.argv.slice(2);
const ops = [];
let out = 'shots/shot.png', query = 'class=warrior&shot=1', size = '1600x900', url = 'http://127.0.0.1:5173/';
for (let i = 0; i < args.length; i++) {
  const a = args[i], v = args[i + 1];
  if (a === '--out') { out = v; i++; } else if (a === '--query') { query = v; i++; }
  else if (a === '--size') { size = v; i++; } else if (a === '--url') { url = v; i++; }
  else if (a === '--step') { ops.push(['step', parseFloat(v)]); i++; }
  else if (a === '--eval') { ops.push(['eval', v]); i++; }
  else if (a === '--snap') { ops.push(['snap', v]); i++; }
}

async function reachable(u) { try { await fetch(u); return true; } catch { return false; } }
let server = null;
if (!(await reachable(url))) {
  server = spawn('npx', ['vite', '--port', new URL(url).port, '--strictPort'], { shell: true, stdio: 'ignore' });
  for (let i = 0; i < 60 && !(await reachable(url)); i++) await new Promise((r) => setTimeout(r, 500));
}

const [w, h] = size.split('x').map(Number);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: w, height: h } });
await page.routeWebSocket(/.*/, () => {}); // block Vite HMR reloads mid-capture
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`${url}?${query}`);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
if (!ops.some((o) => o[0] === 'step')) ops.unshift(['step', 0.5]);
for (const [k, v] of ops) {
  if (k === 'step') await page.evaluate((s) => window.__step(s), v);
  else if (k === 'eval') await page.evaluate(v);
  else if (k === 'snap') { mkdirSync(dirname(v), { recursive: true }); await page.screenshot({ path: v }); console.log('saved', v); }
}
mkdirSync(dirname(out), { recursive: true });
await page.screenshot({ path: out });
console.log('saved', out);
if (errors.length) console.log('PAGE ERRORS:\n' + errors.slice(0, 10).join('\n'));
await browser.close();
server?.kill();
process.exit(0);
