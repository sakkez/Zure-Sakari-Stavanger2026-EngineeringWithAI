# Gauntlet: art direction critique, round 4

Shots reviewed: all of shots/round4/* and my HUD capture shots/critic/r4_hud.png (boss stage, warrior). Compared against round 3 and shots/ref (mainly d4_03 and d4_05).

## 1. Verdict

**Overall: 6.5/10 against Diablo IV (rounds 1-3: 4, 5.5, 6). Wowed: no.**

Round 3's three headline failures are fixed:
- There are no white ghosts in the hero light.
- The loot lightsabers are gone.
- The black debris quads are gone.

Combat is now readable. But the team overcorrected. Every frame is now one dusty beige-grey value band:
- Orcs are grey-olive and grass is grey felt.
- Spells are timid, and nothing pops.

D4 is dark with saturated accents. This build is dim with no accents. horde_warrior has almost no VFX on screen. In boss_warrior the boss stands idle beside a tar puddle. I would not buy either frame as a trailer still.

Explore is 7. Combat is 6.

## 2. Workstreams

### WORLD: 6.5/10
1. **The lake is still crumpled tin foil.**
   - battle_mage (bottom-left) and zone_mage (bottom): high-frequency white speckle across the whole surface.
   - The cause is `water.js:111`: the `pow(sd2,90)` glint multiplied by small-scale detail normals.
   - Lower the detail-normal amplitude by about 50% on the far half of the lake, and gate the glint with a large-scale ripple mask so it forms a few sun streaks, not glitter.
2. **The bog foam reads as a white dotted outline around rock piles** (boss_warrior and r4_hud, at the base of the right-hand boulder cluster; also the shoreline glint at bottom-left).
   - `water.js:81-86`: kill the foam where the water depth is under about 5 cm next to geometry, or mask it with the AO decal.
3. **The glossy "wet mud" pool under the boss is a flat black tar stain**, not wet mud.
   - It has no albedo variation and no puddle-edge transition.
   - At `terrain.js:173-192`, `alb *= 0.62` plus roughness 0.2 gives a uniformly dark disc. Keep the albedo at about 0.8, break the wet mask with the e3 noise, and let the specular do the work.
4. **The ground cover is uniform grey tufts everywhere** (explore, loot, rivals).
   - There is no grass colour, and no break between areas of moss, mud and gravel.
   - The new sub-biomes exist in code but don't survive the grade (see LIGHTING 1).
5. **Cloud shadows are still giant black blobs.**
   - There is a hard-edged ellipse at rivals right and a dark band at loot left.
   - `post.js:159` sets `cloud: 0.45`, but the shapes are the problem: they are too round and too close. Raise `cloudScale` and add a softer threshold.

### LIGHTING & POST: 6/10 (down from 6.5)
1. **The grade has drained the game.**
   - `post.js:79-83` sets `saturation 0.66`, `yellowCut 0.65` and `contrast 1.06`. Together with the teal lift (`:76`), they produce a sepia-beige wash where every material has the same chroma.
   - Do this:
     - Raise `saturation` to 0.8 and `yellowCut` to 0.4.
     - Raise `contrast` to 1.15.
     - Lower `lift` by 30% so the blacks are truly black (d4_05).
   - The environment should be desaturated by *value structure*, not by greying everything.
2. **The haze went the wrong way.** I asked for 0.35 and depth-based. It is now `haze: 0.14` (`post.js:83`), and the grade haze is still screen-Y (`post.js:136`, `vUv.y`).
   - The top third of every frame is as crisp as the hero.
   - Feed the scene depth into the grade pass and use `far = smoothstep(near, far, viewDepth)`.
3. **The hero fill is now too weak.** `engine.js:133` is `PointLight(…, 9, 5, 1.0)`.
   - In explore and loot the player is a grey blob with a ring.
   - Raise the intensity to about 14 and add a cool rim (the existing `rim` uniform at 1.3 for the player only), so the hero separates by edge light, not by brightness.
4. **There is still no visible coloured ground light from spells.** The meteor in zone_mage and the fire in battle_mage barely tint the ground.
   - The engine light budget (`engine.js:288-300`) is probably clamping them. Exempt player-owned FX lights from the budget, or raise its cap by 2×.

### CHARACTERS: 5.5/10
1. **The boss axe is still a pale grey slab.** It is the largest single shape on screen in r4_hud.
   - `assets.js:38` has `surfaces.steel [0.52,0.6]`. Drop the steel albedo to about 0.3, and add an edge-wear rim and a dim ember emissive.
2. **The boss has no menace.** The red eye slit is good but it is 3 px.
   - Make the boss aura (the ground ring) pulse, and add a slow ember particle drip off the cape.
3. **The KayKit greens and whites are greyed into mush.**
   - Orcs now read khaki and skeletons read beige (horde).
   - Restore the orc `grade.sat` to about 1.0 so factions read by hue at 60 px (`assets.js:33`).
4. **Clumping is better but still present.** battle_mage centre has 6 units in one blob.
   - `ai.js:227` uses a default radius of 2.2 and `:241` uses 1.9. Unify both at 2.6.

### VFX: 6/10
1. **The VFX are now too timid.** The luminance hierarchy has inverted from "everything glows" to "nothing glows".
   - In horde, the warrior is mid-fight with zero readable skill VFX.
   - Raise the slash and whirlwind alpha back up: `fx.js:432` `alpha: al*0.35` → 0.6. Keep the hue warm, not cream.
2. **The whirlwind and nova are a cream fog donut** (battle_mage right, rivals centre).
   - The grey `color [0.3,0.31,0.34]` reads as dust, not steel.
   - Add a thin bright leading edge and motion streaks, and drop the grey body.
3. **The meteor explosion** (zone_mage) is the best fire this game has had: saturated, no white core.
   - It still lacks dark smoke volume and ground scorch persistence, and the scorch should last 4 s or more.
4. **Hit flashes are invisible at this zoom.** Add a 2-frame enemy-tint flash at higher amplitude.

### GAMEPLAY VISUALS: 6.5/10
1. **The boss stage is staged without the fight.** The boss is idle, off-centre and half off the action; there is no telegraph and no clash.
   - The stage QA checks occlusion only. In `stage.js:273-289`, require the boss to be within 6 m of the player and mid-attack before capture.
2. **The loot frame is now correct but boring.** It shows small gems in a corpse pile, with no relic beam in shot.
   - Stage one relic drop (beam `pickups.js:53`) so the loot money-shot actually shows loot.
3. **The storm wall is restrained and correct.** In zone_mage it shows as a faint red arc. It may now be too faint to read as danger. Raise the ridge base from 0.03 to 0.06 (`zone.js:101`).
4. **Player readability:** the ring works when it is visible. Hero-centred staging helped. Still no player outline (requested in round 3).

### UI: 7.5/10
1. **The pack-leader plate sits directly on the player** (r4_hud: "Vexra the Pale", plus a "26" damage number on the hero's head).
   - Offset the nameplates up by 0.6 m when within 2 m of the player, and push damage numbers outward (`overlays.js:118-122`).
2. **The skill bar is strong:** cooldown sweep and key labels. The resource orbs are good.
   - The XP bar segment markers are too thin to read.
3. **The minimap marker** is now bold. The minimap is the best HUD element.
4. **The boss bar** has the correct D4 shape. The "Warlord of the Pit" subtitle is unreadable grey-on-red; lift it to `#c9b79a`.
5. **Select is unchanged and still the best screen.** Floor fog at the dais is still missing.

## 3. Cross-cutting issues

- **There is no colour script.** Every shot is the same beige-grey. D4 frames have a dominant temperature, either cold-blue/teal (d4_01, d4_03) or warm candle-red (d4_06), with one saturated accent.
  - Pick a per-area temperature: cool-teal ground, warm firelight pools, and red only for danger.
- **The value range is too narrow.** Measure it: almost nothing is below 5% luminance or above 80%.
  - D4 uses true blacks in shadow and hot accents.
  - Add a histogram QA check for both ends, not just clipping.
- **The QA harness passes frames with nothing happening** (boss idle, horde without VFX). Add an "action present" check: at least one active FX of a minimum screen size during the capture.

## 4. What improved since round 3

- **The hero light no longer blows out units.** There are no white ghosts.
- **The loot beams are gone,** replaced by ground pools. The luminance budget is respected.
- **The black debris cards are gone.** The faceted rubble reads as stone.
- **The zone wall** is no longer magenta neon. The next-zone circle is no longer a white ring.
- **The boss** has a smaller axe, a red eye slit and an outline, and the nameplate no longer collides with it.
- **The meteor explosion** keeps its hue, with no white core.
- **The shorelines** are organic, not oval cookie-cutters.
- **The HUD** has a cooldown sweep and a bold minimap marker.
- **Explore** still holds up: the long pillar shadows and the brazier altar.

## 5. What regressed since round 3

- **Palette and grading drift.** The image went from blue-grey night with warm accents (r3 horde) to a flat sepia-beige daylight wash. It looks like an old photo filter, not gothic.
- **Saturation and contrast:** the faction colours (orc green, skeleton bone, rival hues) are lost.
- **Combat energy:** horde and boss r4 have less visible action than r3. The fixes removed the glare but not the cause, which is that there is no hierarchy.
- **The haze was reduced** instead of increased.
- **The hero is less distinct** in explore and loot. The weaker fill light was not replaced with a rim.

## 6. Ceiling

The realistic ceiling is still **7-7.5/10**. The chibi proportions and procedural ground cap it. The gap to 7 is now almost entirely grading and VFX energy, not geometry.

**Top 3 changes for next round:**
1. **Re-grade:** more saturation, deeper blacks, depth haze, and a cool-teal environment with warm light pools. This is worth +0.5 by itself.
2. **Restore VFX punch within the budget,** with spell ground lights exempt from the clamp.
3. **Stage real action:** a boss mid-attack with its telegraph, and a relic drop in the loot shot.
