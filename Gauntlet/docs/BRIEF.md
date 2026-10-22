# Gauntlet — team brief (read fully before working)

## The game
Browser battle-royale action RPG in Three.js (three@0.180, Vite). Player picks a class (Warrior / Sorceress / Ranger),
then fights mobs of orcs and skeletons plus 5 rival AI heroes inside a small arena whose safe zone shrinks.
Last hero standing wins. No server; everything ephemeral.

## Visual target
Diablo IV: dark gothic fantasy, grounded and moody, rich ground detail, dramatic lighting, strong contrast,
glowing magic against desaturated environments, cinematic color grading, heavy atmosphere (fog, dust, god-rays feel).
Camera is MORE zoomed out than Diablo IV: characters are small on screen (~50-70px tall at 1600x900).
Characters are KayKit CC0 rigged models (stylized). Make them sit convincingly in a grounded, moody world:
materials, lighting, rim light and grading should pull them toward the D4 look. Do not swap them for primitives.
The bar is "AAA". A harsh critic will compare screenshots blind against real Diablo IV screenshots.

## Hard rules
- Everything procedural or CC0. You may download CC0 assets (Poly Haven textures/HDRIs, ambientCG, KayKit, Quaternius)
  into public/assets/<area>/ and record the source + license in public/assets/CREDITS.md (append, don't overwrite).
  Keep total new downloads reasonable (< 40 MB per workstream); prefer 1k-2k textures.
- Stay inside your OWNED files. You may create new files under your own directory. If you need something from
  another module, use its public API or add a clearly-commented minimal hook, never a rewrite.
  Other agents are editing other files in the same working tree AT THE SAME TIME. Always re-read a file right before editing it.
- Do NOT git commit, git stash, git reset or git checkout. The orchestrator commits.
- Must stay playable at 60fps on a mid-range laptop GPU. Budget: < 400 draw calls, use InstancedMesh for vegetation.
- Gameplay timing must use game time: `api.after(seconds, fn)` (in game.js), never setTimeout/setInterval.
- No console errors.

## Module map and contracts (see src/main.js)
- src/core/engine.js  createEngine(canvas) -> { THREE, renderer, scene, camera, composer, sun, hemi, bloom, follow(obj), shake(amp,t), update(dt,t), render() }
- src/world/world.js  createWorld(engine) -> { heightAt(x,z), obstacles:[{x,z,r}], radius, waterLevel, update(dt,t) }
- src/fx/fx.js        createFX(engine) -> { spawn(type, pos, opts), update(dt,t), ... }
- src/actors/assets.js loadAssets() -> { createActor(kind) -> { root, mixer, clips, play(name,opts), update(dt) } }
- src/game/game.js    createGame(ctx) -> { start(cls), update(dt,t), state, units, api }  (api has after, damage, aoe, spawnProjectile, fx, engine, world)
- src/ui/ui.js        createUI(ctx)

## Seeing your work (mandatory — iterate visually)
Dev server: `npx vite --port 5173` (one may already be running on 127.0.0.1:5173; the harness starts one if not).
Screenshot: `node tools/shot.mjs --query "class=mage&shot=1" --step 2 --out shots/<you>/x.png`
  - `?shot=1` freezes real time; `--step N` advances N seconds of simulation; `--eval "<js>"` runs JS (window.__game is ctx).
  - e.g. aim + fire: `--eval "__game.input.mouse.x=0.3;__game.input.mouse.y=0.1;__game.input.mouse.left=true" --step 0.3`
  - `--size 1600x900` default. Rendering is SwiftShader (software) so screenshots are slow: be economical.
Then Read the PNG and judge it harshly. Put your screenshots in shots/<your-workstream>/.
Iterate (change -> screenshot -> critique) at least 4-6 times before reporting.

## Report back
Short: what you changed (files), what still looks weakest in your area, and 1-2 screenshot paths showing your best result.
