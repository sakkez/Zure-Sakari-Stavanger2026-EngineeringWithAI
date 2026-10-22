# Gauntlet — Godot 4 version

A small dark-fantasy battle royale: pick a champion at the shrine, then outlast five AI rivals,
endless skeleton packs and a shrinking storm. Same KayKit characters, Poly Haven textures, HDRI,
ability kits and camera framing as the browser version in `../src`, rebuilt on Godot 4.7
(Forward+): SDFGI, SSAO/SSIL, volumetric fog, GPU particles, decals.

## Run

Open this folder in Godot 4.7+ and press F5, or from a terminal:

```
godot --path godot
```

| Input | Action |
|---|---|
| Click a hero / 1-3 | choose Warrior, Sorceress or Ranger |
| WASD | move |
| Left mouse (hold) | primary (Cleave / Fireball / Bolt) |
| Q / right mouse | secondary (Whirlwind / Frost Nova / Multishot) |
| E | ultimate (Earthshatter / Meteor / Rain of Arrows) |
| Space | dodge (Charge / Blink / Roll) |
| Mouse wheel | zoom 26-100 m (default 58 m) |
| R | play again after victory or defeat |

## The match

- Five rival champions (random classes) roam, farm skeletons, fight each other and you, retreat to
  recover, and run from the storm.
- The storm waits, previews the next circle as a dashed line, then closes in over five stages;
  champions outside it take growing damage.
- Skeleton minions, shield warriors and ranged skeleton mages rise from the ground in packs.
- The slain drop health and mana flasks. Last champion standing wins.

## Screenshots and tests (deterministic)

```
godot --path godot --fixed-fps 60 --resolution 1600x900 -- --shot=shots/a.png --stage=battle [--class=warrior] [--frames=104] [--nohud] [--dist=30]
godot --headless --path godot --quit-after 21600 --fixed-fps 60 -- --class=warrior --log
```

Stages: `select`, `battle`, `melee`, `nova`, `royale` (add `--zone`), `explore`.
`--log` prints eliminations and storm events; `--bench` prints real-time FPS.

## Layout

- `scripts/main.gd` — environment, camera, class select, factions and damage, rivals, spawner, staging
- `scripts/world.gd`, `ruins.gd` — terrain, lake, trees, grass; shrine, chapel, tower, graveyard, camp
- `scripts/hero.gd` — the three classes and the rival AI; `skeleton.gd` — mob AI
- `scripts/zone.gd`, `pickups.gd` — storm and loot
- `scripts/fx.gd` — particles, decals, slashes, light flashes, damage numbers
- `scripts/hud.gd` — globes, skill bar, feed, select cards, end screens
- `shaders/` — terrain splat + storm overlay, water, ruins, foliage, grass, storm wall, particles, HUD
