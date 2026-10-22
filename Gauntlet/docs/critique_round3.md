# Gauntlet: art direction critique, round 3

Shots reviewed: shots/round3/* and my HUD capture shots/critic/r3_hud.png (boss stage, ranger), compared against round 2 and shots/ref.

## 1. Verdict

**Overall: 6/10 against Diablo IV (round 1: 4, round 2: 5.5). Wowed: no.**

This is the first round where a single still frame (`explore.png`) could pass at a glance as an indie D4-like: the altar, the torches and the long raking pillar shadows work. Combat frames still fall apart for three reasons:

1. **The brightest things on screen are bloom blobs and loot "lightsabers", not heroes.**
2. **Characters near the player turn into white ghosts.**
3. **The ground is still matte felt.** d4_03 is about wet, specular, broken ground. Ours only has specular on the ponds.

Explore is about 7. Combat is about 5.5.

## 2. Workstreams

### WORLD: 6/10
1. **The ponds are cookie-cutter ovals with a foam rim.** In horde, boss, rivals and loot they read as holes punched in the terrain.
   - Break the shoreline with noise, and add mud and reed transitions in `layout.js` and `water.js:76-85`.
   - Kill the uniform white foam ring: drop it to `foam*0.4` and only where waves would reach.
2. **The water glint is glitter.** In battle_mage the lake is confetti sparkle. `water.js:107` uses `pow(sd,320)*2.5`, which is too sparse and too hot. Use `pow(sd,90)*0.9` and widen the second lobe to 0.25.
3. **Black square cards litter every combat frame** (horde, boss, rivals).
   - In `fx.js:107-111`, `debris()` uses `DIRT` with `add:0`. That makes flat dark quads that tumble and lie on the ground. Use a lit or alpha-cut chip frame, cut the counts at `fx.js:359` and `:448` by 50%, and fade them out within 0.6 s.
   - The rubble at `ruins.js:31-38` adds more dark cubes. Tint them toward the ground albedo.
4. **The ground has no material response.**
   - Add a wet or packed-mud roughness channel in `world/materials.js` (about 0.35 in hollows and paths), so the torch and hero light glints. This is the third round it has been asked for.
5. **The AO and cloud-shadow blobs read as black stains** (boss bottom, loot left, rivals top-left).
   - `post.js:149`: `cloud: 0.8` is too strong at this zoom. Use 0.45.
   - Keep `buildAODecals` (`props.js:258`) under 25% darkening.

### LIGHTING & POST: 6.5/10
1. **The hero light blows out pale units.** `engine.js:127` sets `PointLight(0xffb27a, 38, 12, 1.2)` at 3.6 m. Skeletons inside it go chalk-white (horde centre, zone_mage).
   - Drop the intensity to about 18 and raise it to 5 m.
   - Or exclude it from enemy materials with a per-material `uHeroFill` scale.
2. **Additive stacking defeats the cap.** `particles.js:76` caps each particle at 3, but the explosion (`fx.js:160`, 10×s flame cards at `FIRE.core`) stacks into a white disc in zone_mage.
   - Cap the accumulation by drawing additive FX into a half-res buffer and clamping it.
   - At minimum, halve the core alpha and make the core colour `FIRE.hot`.
3. **The haze still barely reads.** `post.js:73` has `haze: 0.2`. The top third of battle and rivals is as crisp as the foreground. Go to 0.35 and make it depth-based, not screen-Y.
4. **Combat lacks local VFX light.** Spells should throw coloured light on the ground (see d4_05). Add 2-3 pooled point lights driven by fx spawn.

### CHARACTERS: 5/10
1. **The boss is a black chess piece with a pale aluminium slab.**
   - `assets.js:37-38` gives the axe `propScale 1.35` at a 2.3x scale. It is the lightest surface on screen (r3_hud). Darken the axe to iron (val 0.5), add an emissive crack edge, and cut `propScale` to 1.1.
   - The helm (`orc.js:190-213`) is a featureless black dome from above. Lift the iron albedo to about 0.2 and add a red eye-slit emissive visible from the top.
2. **The player is still hard to find in the crowd** (battle_mage, horde).
   - The ring opacity is 0.9 (`assets.js:324`) but it is hidden under bodies. Add the planned dark outline pass for the player only (`outlineMaterial` already exists for the boss).
3. **Units still clump** (battle_mage centre, boss). `ai.js:226` uses a separation radius of 2.2. Raise it to 2.8 and increase the weight when more than 3 units are in contact.
4. **The warrior reads as a red-copper toy** in select. Pull `grade.metal` toward cool steel (sat 0.5).

### VFX: 6/10
1. **The meteor telegraph is the brightest element in battle_mage.** At `fx.js:320-322`, a rune at colour `[1.8,0.45,0.08]` plus a fill of `[1.4,...]` plus a ring of `[2.2,...]` dominates the frame. Halve all three and delete the rune layer. The player's own skills don't need a sigil.
2. **The whirlwind is still a white crescent** (horde). At `fx.js:423`, `hot: [1.6,0.95,0.45]` stacked by `spin` reads white-cream. Use hot `[1.1,0.55,0.2]` and alpha ×0.5.
3. **The meteor** is improved, with displacement and lava cracks. The spikes are now jagged. Both are wins.
4. **Impacts need ground lighting and chunk debris that reads as rock** (see WORLD 3), not soot quads.

### GAMEPLAY VISUALS: 5.5/10
1. **The loot beams are lightsabers.**
   - At `pickups.js:52`, the beam geometry is 0.22-0.32 m wide and 7 m tall, with `*1.6` additive (`:30`). Four of them in loot_warrior look like a laser fence, and the item itself is invisible.
   - Make the beam 0.5 m wide with a soft falloff, 3.5 m tall, and 0.6 intensity. Add a ground light pool and a label on hover.
   - Only relic and rare items get beams. Gold and potions should not.
2. **The zone wall (`zone.js:93-99`) is not sparse.** In zone_mage it is a continuous magenta neon ribbon.
   - Flash threshold `step(0.93…)` plus `ridge*0.1` gives a permanent glow. Drop the base ridge term to 0.03.
   - Shift `uColC` from violet `(0.75,0.28,1.0)` to a desaturated red.
   - The next-zone line (`:163-165`) still shows as a perfect white circle. Make it 0.04 alpha, and dashed only near the player.
3. **Occlusion QA failed again.** In r3_hud the round tower sits over the boss fight. Add the round tower as an occluder in `stage.js:23-38`, and fail a capture when `occluded > 0.1` (`stage.js:273`).
4. **The boss telegraph** (red fill-up) is correct in colour. It lacks a readable leading edge: add a 0.3 m bright rim on the fill front.

### UI: 7.5/10
1. **The nameplate bug.** "Vexra the Pale / Orc Brute" overlaps the boss, and a stray "24" floats above it. Rival name and enemy subtitle are crossing wires in `hud.js`, and the level badge is unanchored. Suppress nameplates within 3 m of the boss.
2. **The minimap is now sepia with a red zone, which is good.** The player arrow is a 4 px dot. Enlarge it and add a facing cone.
3. **The skill bar has no cooldown sweep** that shows when icons are not ready. The "12" in the E slot needs a dark radial fill.
4. **Select is the strongest screen in the game.** The glass domes reflect nicely. Add floor fog at the dais.

## 3. Cross-cutting issues

- **Luminance hierarchy is still wrong.** In shot after shot the order is: loot beams and telegraphs, then explosion cores, then hero. Make one central "max on-screen HDR" rule: player-owned FX at 2.0 or below, the hit core alone up to 3.0.
- **Matte world.** No specular outside water is the single biggest D4 gap.
- **The QA harness checks pass while the frames are bad** (an occluded boss, white blobs). Add a luminance histogram check: fail if more than 1.5% of pixels are above 0.95.

## 4. What improved since round 2

- **The zone edge** is now ragged and smoky, and the outside is lifted cold grey instead of a black void. That is a big win.
- **The water** has normals, fresnel, depth and foam, and it reads as liquid.
- **The meteor** (displaced, lava cracks) and the jagged spikes; the dark arrows with warm trails (rivals).
- **Explore and rivals staging:** distinct landmarks, a strong diagonal shadow composition, and props at better scale.
- **The boss stage exists,** with a red telegraph and a D4-style boss bar.
- **The HUD:** the minimap is sepia, the timer is sane, and there is a proper boss bar.

## 5. Ceiling and top 3

**The realistic ceiling** for Three.js, KayKit chibis at about 60 px and procedural ground is about **7-7.5/10.**

- The chibi proportions (big heads, stubby limbs) will always read "mobile" next to D4's realistic silhouettes. Integration can hide this; it can't remove it.
- Without baked GI, real volumetrics or authored ground material blends, the world tops out at "good indie" level.

**The 3 changes that move the score most:**

1. **Fix the luminance budget** (hero light, additive cap, loot beams, telegraphs). This gets +0.5 immediately and makes combat readable.
2. **Wet, specular, broken ground with local FX lights.** This is the defining D4 look, and its absence is the most visible gap in every frame.
3. **Hero readability:** a player outline, stronger separation, and an occlusion-gated staging pass. Without these, every combat shot is a pile.
