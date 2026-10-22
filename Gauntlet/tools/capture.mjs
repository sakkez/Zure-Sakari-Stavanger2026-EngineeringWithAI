// Captures the standard critique set (HUD hidden, D4-reference framing) into a directory.
// Usage: node tools/capture.mjs shots/round1 [--hud]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] || 'shots/capture';
const hud = process.argv.includes('--hud');
mkdirSync(out, { recursive: true });
const url = process.env.SHOT_URL || 'http://127.0.0.1:5173/';

const SCENES = [
  { name: 'battle_mage', cls: 'mage', stage: 'battle', act: "m.x=0.25;m.y=0.12;m.left=true", step: 0.35 },
  { name: 'horde_warrior', cls: 'warrior', stage: 'horde', act: "__game.input.keys.add('q')", step: 0.5 },
  { name: 'rivals_ranger', cls: 'archer', stage: 'rivals', act: "m.x=0.2;m.y=0.1;m.left=true", step: 0.3 },
  { name: 'zone_mage', cls: 'mage', stage: 'zone', act: '', step: 0.5 },
  { name: 'loot_warrior', cls: 'warrior', stage: 'loot', act: '', step: 0.3 },
  { name: 'boss_warrior', cls: 'warrior', stage: 'boss', act: '', step: 0.5 },
  { name: 'explore', cls: 'warrior', stage: null, act: '', step: 1.5 },
];

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const s of SCENES) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.routeWebSocket(/.*/, () => {}); // block Vite HMR reloads mid-capture
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  try {
    await page.goto(`${url}?class=${s.cls}&shot=1`);
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
    await page.evaluate(() => window.__step(0.2));
    if (s.stage) await page.evaluate((st) => window.__game.game.api.stage(st), s.stage);
    await page.evaluate(() => window.__game.game.api.simulate?.(1.0));
    if (s.act) await page.evaluate(`(()=>{const m=__game.input.mouse;${s.act}})()`);
    await page.evaluate((t) => window.__step(t), s.step);
    // QA: the hero must be visible and <10% of the staged units hidden behind trees/ruins.
    if (s.stage) {
      const v = await page.evaluate(() => window.__game.game.api.visibility?.());
      // Fail the capture when the hero or boss is >10% hidden (or the staged units overall are).
      // ...and a combat frame must show something happening: hero ability, boss telegraph, projectiles in flight.
      if (s.stage !== 'loot') {
        const act = await page.evaluate(() => window.__game.game.api.actionCheck?.());
        if (act && !act.ok) { console.log('FAILED QA: NO ACTION', s.name, JSON.stringify(act)); process.exitCode = 1; }
      }
      if (v && (v.ok === false || !v.player || v.occluded > 0.1)) { console.log('FAILED QA: OCCLUSION', s.name, JSON.stringify(v)); process.exitCode = 1; }
    }
    if (!hud) await page.evaluate(() => { document.getElementById('ui').style.display = 'none'; });
    await page.waitForTimeout(2500);
    const buf = await page.screenshot({ path: `${out}/${s.name}.png` });
    const lum = await page.evaluate(async (b64) => { const im = new Image(); im.src = 'data:image/png;base64,' + b64; await im.decode(); const g = document.createElement('canvas'); g.width = 64; g.height = 36; const x = g.getContext('2d'); x.drawImage(im, 0, 0, 64, 36); const d = x.getImageData(0, 0, 64, 36).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2]; return s / (d.length / 4) / 3; }, buf.toString('base64'));
    if (lum < 4) console.log('WARNING: BLACK FRAME', s.name, 'mean luminance', lum.toFixed(1));
    console.log('saved', s.name, errors.length ? 'ERR: ' + errors.slice(0, 3).join(' | ') : '');
  } catch (e) { console.log('FAILED', s.name, e.message.split('\n')[0]); }
  await page.close();
}
// Class select (always with UI)
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.routeWebSocket(/.*/, () => {}); // block Vite HMR reloads mid-capture
await page.goto(`${url}?shot=1`);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 180000 });
await page.evaluate(() => window.__step(1));
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/select.png` });
console.log('saved select');
await browser.close();
