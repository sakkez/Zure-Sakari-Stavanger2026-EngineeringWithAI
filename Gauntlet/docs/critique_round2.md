# Gauntlet: art direction critique, round 2

Shots reviewed: shots/round2/* and my HUD capture shots/critic/r2_hud.png, compared against round 1 and shots/ref.

## 1. Verdict

**Overall: 5.5/10 against Diablo IV (round 1 was 4). Wowed: no.**

A real step change: the magenta planet, white-out VFX and palm field are gone, and the frame has blacks. Blind next to d4_03 or d4_07 it still loses instantly:

1. **The zone ring is still the composition.** A perfect glowing red ring over a black void appears in all 5 combat shots.
2. **Fights are one blob of units under a decal circle,** with no readable hero.
3. **There is no material response.** Ground, water and characters are all matte.

Explore is about 6.5. Combat is about 5.

## 2. Workstreams

### WORLD: 5.5/10
1. **The horde shot is occluded.** In `horde_warrior.png`, a dead tree sits dead centre over the fight and black pines cover 40% of the frame.
   - Extend the `stage.js` occlusion test (lines 35-58) to pines and dead trees, and reject any spawn above 0.1 blocked.
   - Dither all tall vegetation on the camera side.
2. **The water is grey concrete.** In zone_mage it is a flat slate slab with a hard shadow line across it.
   - In `water.js`, add two scrolling ripple normals, a specular lobe for the sun and point lights, and a fresnel tinted toward the fog.
   - Receive shadows at about 30%.
3. **The ground is brown felt.** Add roughness variation in `terrain.js`/`world/materials.js`: about 0.45 on paths and hollows, about 0.9 on grass. Torchlight must glint on wet mud, as in d4_03.
4. **The litter is confetti.** Thousands of small dark shard and leaf cards cover everything (battle_mage top right, rivals) and read as paper scraps. Halve the count, and cluster them along walls, roots and ruin bases.
5. **The foliage outside the zone turns to grey-white mould** (zone_mage, top). Clamp the foliage albedo to about 0.35 luma.
6. **The ruin walls look like stacked Jenga blocks** (rivals, left). Add chips, a few leaning blocks and base rubble.

### LIGHTING & POST: 6.5/10 (most improved)
1. **There is no atmospheric depth.** The top of the frame is as crisp as the bottom. The `haze` in `post.js` is not visible: raise it so the far third of the frame lifts 8-10% toward `#2a3036`.
2. **The outside of the zone is crushed to black.** The overlay's `dark` clamp is 0.88 in `zone.js`. Cap it at about 0.55 and push the outside toward cold, desaturated fog.
3. **Heroes get no local light.** Add a faint warm fill per hero (a real light or one faked in the shader) so the player pops, as in d4_08.
4. **The rim light is invisible at 60 px** (`materials.js:119`). Scale the rim with camera distance so it gives about 2 px of clean cool edge.

### CHARACTERS: 4.5/10
1. **I could not find the player** in battle, rivals or horde without the HUD.
   - Add a subtle persistent under-glow.
   - Raise the alpha of the player ring.
   - Draw the player after the crowd, with a thin dark outline.
2. **Packs merge into a single grey-green and red clump.**
   - Add stronger separation steering in `ai.js`.
   - Raise the blob-shadow alpha to about 0.6.
3. **The materials still look like vinyl.** The grime at `materials.js:160` (0.68) is too subtle. Go to 0.5 at the feet, and add a roughness breakup so the armour reads as metal.
4. **The scale is off.** Carts and banners are 2-3x hero height, so the heroes look like toys in a giant's yard. Scale the props down about 25%.

### VFX: 5.5/10
1. **The whirlwind is a white disc again** (rivals). In `fx.js:405`, hot is `[4.5,3.6,2.4]` and the arcs span r 1.3-3.0.
   - Cap hot at 2.0, tint it steel-orange, and narrow the arcs to r 2.2-2.8.
   - Shrink the 5.5 m scuff decal at `fx.js:420`.
2. **Enemy telegraphs are the same orange as the player's skills** (`fx.js:305-307`). Make enemy and rival AoE a red fill-up, as in d4_04. Halve the rune ring; it is still UI-like.
3. **The procedural meshes read as low-poly.**
   - The meteor is a faceted icosahedron (`meshes.js:344`). Bury it in flame sprites, or displace it and give it a lava-crack shader.
   - Rock spikes are 5-sided cones (`meshes.js:337`) that read as traffic cones. Make them jagged, with dark albedo and emissive only in the cracks.
4. **The arrows are still white needles** (`fx.js:199`, `[3,3.3,3.6]`). Use a dark shaft, a warm trail at intensity 1 or less, and landing dust. This was flagged in round 1.

### GAMEPLAY VISUALS: 4/10
1. **The zone wall:** the drop from 18 m to 5.2 m helped, but the edge is a perfect neon circle (`zone.js` foot glow `0.42`, wall base `0.55`).
   - Displace the radius with noise (±1.5 m).
   - Cut the foot glow by about 60% and spend that energy on sparse lightning flashes.
   - Stage fights with the edge off-screen or in one corner (`stage.js:124`).
2. **Loot appears in no shot, and the HUD says "0 GOLD".** Add and capture a loot stage with beams for each rarity tier.
3. **The staging is repetitive.** Battle and explore both centre on the same obelisk from the same angle. Give each stage its own landmark.
4. **The next-zone dashes read as a GPS route.** Replace them with a faint continuous line at about 0.08 alpha.

### UI: 7/10
1. **The timer leaks staging state.** It shows "16:39" under "Circle closing". Clamp the timer, or hide it while it is above 5 min.
2. **The minimap is a purple smear.** Draw the ruins and water silhouettes in sepia, with the zone as a thin red line.
3. **Nameplates use thin italic serif over busy ground and are illegible.** Add a dark backing plate and use weight 600.
4. **Class select is good, and the previews are crisp now.** Add fog at the dais base so the figures don't float on black.

## 3. Cross-cutting issues

- **Value hierarchy:** the brightest things on screen are the zone ring and the decal circles, not the hero or the hits. Rank luminance as hero and impacts > VFX > zone > world.
- **Flatness:** there is no specular anywhere. This is the biggest missing D4 ingredient.
- **The emissive cap is not enforced** in the arcs and arrows (`fx.js:199`, `fx.js:405`). Clamp it centrally in the particle and arc shaders.
- **Capture QA:** the timer leak and the occluded horde shot both shipped. Add automated checks that the player is visible and occlusion is under 10%.

## 4. What improved since round 1

- **Grade:** cool shadows with warm pools, real blacks, a lower sun and long raking shadows.
- **VFX:** no more white-out. Fire has dark-red edges and smoke, and scorch, blood and crack decals now leave combat history.
- **World:** bracken, heather and clumped grass replace the palms, the ground is darker, and there are about 3x the props. The obelisk altar is a strong landmark.
- **Characters:** the hit flash is capped (`FLASH_MAX 0.35`), and the grime gradient, team rings and blob shadows are in.
- **Ranger:** the class works, the select previews are sharp and its stats are filled.
- **HUD:** the globes are smaller and matte, and the start banner no longer covers combat.
