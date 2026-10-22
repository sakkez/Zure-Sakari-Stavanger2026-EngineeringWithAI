// Bootstrap: wires the modules together and runs the frame loop.
// Module contracts (each module is owned by one workstream):
//   engine  -> src/core/engine.js   createEngine(canvas)            renderer/scene/camera/post/lighting
//   world   -> src/world/world.js   createWorld(engine)             terrain, water, vegetation, rocks, heightAt()
//   fx      -> src/fx/fx.js         createFX(engine)                particles, projectiles visuals, decals, lights
//   assets  -> src/actors/assets.js loadAssets(onProgress)          GLB characters, createActor(kind)
//   game    -> src/game/game.js     createGame(ctx)                 player, classes, enemies, zone, combat
//   ui      -> src/ui/ui.js         createUI(ctx)                   class select, HUD, damage numbers, minimap
import { createEngine } from './core/engine.js';
import { createWorld } from './world/world.js';
import { createFX } from './fx/fx.js';
import { loadAssets } from './actors/assets.js';
import { createGame } from './game/game.js';
import { createUI } from './ui/ui.js';
import { createInput } from './core/input.js';

const params = new URLSearchParams(location.search);

async function boot() {
  const canvas = document.getElementById('game');
  const ctx = { params };
  ctx.engine = createEngine(canvas, ctx);
  ctx.input = createInput(canvas, ctx);
  ctx.ui = createUI(ctx);
  ctx.ui.showLoading(0);
  ctx.world = createWorld(ctx.engine, ctx);
  ctx.fx = createFX(ctx.engine, ctx);
  ctx.assets = await loadAssets((p) => ctx.ui.showLoading(p));
  ctx.game = createGame(ctx);
  ctx.ui.hideLoading();
  window.__game = ctx;

  // ?class=mage auto-starts (used by the screenshot harness); otherwise show class select.
  const preset = { ranger: 'archer', sorceress: 'mage', knight: 'warrior' }[params.get('class')] || params.get('class');
  if (preset) ctx.game.start(preset);
  else ctx.ui.showClassSelect((cls) => ctx.game.start(cls));

  // Deterministic stepping for screenshots: ?shot=1 freezes real time; harness calls __step(seconds).
  const fixed = params.has('shot');
  let last = performance.now();
  let elapsed = 0;
  const frame = (dt) => {
    elapsed += dt;
    ctx.game.update(dt, elapsed);
    ctx.world.update(dt, elapsed);
    ctx.fx.update(dt, elapsed);
    ctx.engine.update(dt, elapsed);
    ctx.ui.update(dt, elapsed);
    ctx.input.endFrame();
    ctx.engine.render();
  };
  window.__step = (seconds, hz = 60) => {
    const n = Math.max(1, Math.round(seconds * hz));
    for (let i = 0; i < n; i++) frame(1 / hz);
  };
  const loop = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!fixed) frame(dt);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  window.__ready = true;
}

boot().catch((e) => {
  console.error(e);
  document.body.insertAdjacentHTML('beforeend', `<pre style="color:#f66;position:fixed;top:0;left:0;z-index:99">${e.stack}</pre>`);
});
