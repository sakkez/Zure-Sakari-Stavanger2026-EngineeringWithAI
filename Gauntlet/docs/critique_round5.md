# Gauntlet: art direction critique, round 5

Shots reviewed: shots/round5/* (all 8), compared with round4 and round3 and with shots/ref (mainly d4_05). I also took a HUD capture: shots/critic/r5_hud.png (battle stage, mage).

## 1. Verdict

**Overall: 6.5/10 against Diablo IV (rounds 1-4: 4, 5.5, 6, 6.5). Wowed: no.**

The regrade worked:
- There are warm light pools on cool ground.
- Orcs are green again.
- The boss frame finally has a fight in it.
- battle_mage is the best combat frame this project has produced.

The score still does not move, because the new VFX layer brought new artifacts that a blind comparison catches in under a second:
- **Black ink-blot smoke discs** (rivals, loot, zone, HUD).
- **A flat orange sticker disc** under the meteor.
- **Fields of black nails** (stuck arrows) in battle, loot and rivals.
- **A lake that is lighter than the land.**

Next to d4_05, this still reads as "polished indie top-down", not Sanctuary.

## 2. Workstreams

### WORLD: 6.5/10

**1. The lake is the brightest flat surface on screen and still reads as crumpled satin, not water** (zone_mage bottom, battle_mage bottom-left).
- The glitter is gone. But the sky reflection uses `uHorizon = fog*1.7` (`world/world.js:399-400`), so the water is lighter than the grass around it.
- D4 water is the darkest value in the frame.
- Fix:
  - Multiply uHorizon and uZenith by about 0.45.
  - Cap `sky*fr` in `water.js:118` at about 0.25.
  - Let the depth tint carry it toward near-black teal.

**2. The white dotted rim at the boulder bases is still there** (boss_warrior, at the left foot of the rock pile, around 870,540), along with a hot shoreline streak at bottom-left.
- `water.js:85` gates the foam by noise but not by "this is a puddle edge against geometry".
- Fix: sample the AO/obstacle mask and set foam and glint to 0 within 0.6 m of rocks.

**3. Ground cover is a camouflage print.**
- Large ochre/grey-green blotches at one frequency, plus uniform tuft cards (loot, battle, explore lower half).
- There is no mid-frequency detail (pebble scatter, root lines, path wear), and no transition band where the biomes meet.
- In `terrain.js`, add a second, smaller noise octave to the biome mask and a darker 0.5 m "wet edge" at the biome borders.
- Bonus: the cloud-shadow bands (`post.js:162-163`) still show as dark diagonal stripes in loot. Use a cloudScale of 0.012 and widen `smoothstep(0.2,0.85)` to `(0.1,0.95)`.

### LIGHTING & POST: 7/10 (up from 6)

**1. The value range is still compressed at the bottom.**
- Shadows are dark brown-grey, not black, and nothing in the environment is below about 8% luminance.
- `post.js:76` lift (0.024, 0.032, 0.042) still raises the blacks. Halve it, and add a toe (`c = c*c/(c+0.04)`-style) after contrast at `:136`.

**2. Warm pools are good, but there are too many of them, at the same intensity.**
- Explore has about 8 equal braziers and lamps.
- Pick one key pool per frame (the altar) and dim the rest by 40%, or the colour script turns into confetti.

**3. Light from spells hitting characters is still weak.**
- In battle_mage, the green bolt lights nothing around it.
- Give projectile lights (budget at `engine.js:294-305`) `noBudget` and distance ≥ 4 m.

### CHARACTERS: 6/10 (up from 5.5)

**1. The boss reads as a horned helmet on an axe, a beetle from above** (boss_warrior).
- The cape and body are hidden under the helmet silhouette.
- Fix:
  - Scale the helmet horns down by about 20%.
  - Give the cape a deep crimson albedo with a dim ember-rim emissive so the body reads.
  - Raise the rim at `assets.js:38` (`rim 0.35` → 0.7).

**2. The skeletons are still beige blobs at 60 px** (horde, bottom).
- `maxAlbedo: 0.62` and `sat 0.7` (`assets.js:39-41`).
- Drop the value to about 0.5 and push the cyan eye emissive by 2×, so they read by eyes, as in D4.

**3. Clumping is still present:** 9 units in a tight donut around the hero (horde).
- Separation is not the fix.
- Stagger the approach in `ai.js` (attack slots at 2 radii) so the silhouettes stop merging.

### VFX: 6/10

**1. The black smoke is the worst new artifact.**
- Smoke colour is `[[0.07,0.06,0.055],[0.035,…]]` at alpha 0.75 (`fx.js:172-173`, `:374`, `:390`, `SMOKE` at `:24`).
- Seen from above, the round puffs stack into opaque black discs: rivals right of the hero, loot centre, zone left.
- Fix:
  - Smoke albedo of about 0.18-0.22 (lit by the scene).
  - Alpha 0.35.
  - Stretched rising sprites that offset sideways with wind, never centred on the impact.

**2. The meteor scorch is a flat orange sticker** (r5_hud).
- `fx.js:378` is an additive `[1.2,0.35,0.06]` scorch at alpha 0.95 over `Rr*1.5`, with a hard circular edge.
- Fix:
  - Let the glow live only in the crack decal (`:377`).
  - Make the scorch subtractive dark with a noisy edge.
  - Fade the emissive to zero within 1.2 s.

**3. Stuck arrows read as black nails** (loot top-left: 20+; rivals right; battle centre).
- `fx.js:515-520` keeps every arrow for 3.5 s, with dark shafts that cast shadows.
- Fix:
  - Cap them at 6 live arrows.
  - Give them a warm wood or bone albedo and no shadow casting.
  - Set their life to 1.5 s.

Credit: the fire trail and the impact in battle_mage are genuinely good, and the warrior slash arc in horde is readable without being a UI ring.

### GAMEPLAY VISUALS: 7/10 (up from 6.5)

**1. The boss shot finally has action**, with a slam telegraph about 70% filled.
- But the telegraph is centred on the player as a perfect, saturated, flat donut that reads as a selection ring.
- In D4 the telegraph is darker red, with cracked fill and a bright leading edge only. Do this in the telegraph decal in `fx.js`, called from `boss.js`.

**2. The relic in loot is a tiny flame stub** (around 930,410), lost among potions.
- The beam at `pickups.js:29` (×2.6) is foreshortened to nothing.
- Fix: add a ground light pool plus a short vertical streak billboard so the legendary reads at 60 px.

**3. Horde has no VFX beyond one slash.**
- The stage capture should fire the whirlwind (`stage.js`, horde build) so the frame sells the class fantasy.

### UI: 7.5/10

**1. The damage numbers still collide with the plates.** In r5_hud, a "30" sits on top of "Grukk Skullsplitter" and a second "30" overlaps the orc.
- The obstacle pass (`overlays.js:102-185`) treats plates as obstacles only after they are placed.
- Fix: register the plates first, and give numbers a minimum 8 px gap.

**2. The skill bar and orbs are strong.**
- The XP bar segments are now visible.
- The cooldown "12" on the meteor slot has no dimmed sweep colour. Darken the icon underneath by 50%.

**3. The minimap and top timer are excellent.**
- The rival plate (red "Rival — Ranger") is good.
- Select is still the best screen. It still has no floor fog at the dais (`select.js`).

## 3. Since round 4

**Improved:**
- **Saturation is restored** and the faction hues read again (green orcs, purple mage hats).
- **Cool shadows with warm pools** give a real colour script.
- **The hero is distinct** via the amber outline and fill.
- **The tar puddle is gone**, and the boss axe is now dark and notched.
- **The boss stage shows a telegraphed attack.**
- **The lake glitter is gone.**
- **The meteor fire and fire trail have volume.**

**Regressed:**
- **Smoke reads as black ink discs.**
- **The meteor ground disc reads as a sticker.**
- **The stuck-arrow nail fields.**
- **The lake is now lighter than the ground.**
- **The boss telegraph reads as UI.**
- **More warm point lights,** which dilutes the focal hierarchy (explore).

## 4. Ceiling

**(a) Current constraints** (zoomed-out camera, chibi KayKit): **7-7.5**, unchanged.
- Fixing the four artifacts above gets to 7 next round.
- Getting past that needs value discipline: true blacks, one key light, and darker water.

**(b) Relaxed constraints:**
- **D4-like camera distance alone: about 7.5-8.** Characters at about 150 px would show the materials, rim and VFX layering that are invisible at 60 px, and the ground detail would scale up.
- **Realistic-proportioned rigged models alone: about 7.5.** The chibi head-to-body ratio is the single biggest "not D4" tell at any distance.
- **Both: about 8-8.5.** Beyond that, the limits are hand-authored ground textures and destruction, which a procedural pipeline will not reach.
