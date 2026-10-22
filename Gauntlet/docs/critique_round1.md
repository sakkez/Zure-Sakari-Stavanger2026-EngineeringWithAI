# Gauntlet: art direction critique, round 1

Shots reviewed: shots/round1/*, shots/ui/hud6.png and my own shots/critic/rivals.png, compared against shots/ref.

## 1. Verdict

**Overall: 4/10 against Diablo IV. Wowed: no.**

Blind, this reads as a cosy mobile diorama on fire, not D4. The three worst problems:
- a magenta "planet" horizon fills half of every combat frame;
- VFX blow the centre of the screen out to white;
- the ground is flat ochre covered in palm tufts.

Explore is about 5.5. Combat shots are about 3.

The round1 `rivals_ranger.png` is a **fully black frame**. My retake rendered, but `class=ranger` silently fell back to Warrior, because `classes.js` has no `ranger` key. Fix the class id, and log an error on unknown classes in `main.js`.

## 2. Workstreams

### WORLD: 4/10
1. **The lakes read as black oil craters.** `water.js:71-72` sets shallowC `0.035,0.038,0.026` and deepC `0.004,...`, which is effectively black.
   - Raise shallow to `#2e3f3a` and deep to `#0d1a1c`.
   - Lift the fresnel floor to about 0.25 toward the fog colour.
   - Add a tight sun specular lobe.
   - Make the shore a dark wet band in the ground shader, not a bowl.
2. **The vegetation is the wrong biome.** Ferns read as tropical palms from above, bushes are green spheres, and grass is evenly spread, same-hue tufts. In `vegetation.js`:
   - Replace the ferns with drooping, desaturated bracken.
   - Cluster grass with noise: dense clumps and bare patches.
   - Shift hue toward `#5b5a3c`.
   - Break the sphere bushes up with cards.
3. **The ground has no micro-detail at this zoom.** It is soft ochre and olive blobs. In `terrain.js`:
   - Add a high-frequency detail and normal layer.
   - Use wet, darker dirt (roughness about 0.5 in hollows).
   - Scatter instanced pebbles, bones and leaf litter.
   - Drop the grass albedo by about 25%, because it is far too yellow and bright.
4. **The dead tree covers the player in 4 of 5 combat shots,** and the dithering misses it. Register dead trees as occluders (fade to about 20%), or keep them out of a 6 m radius of the stage spawn.
5. **The ruins are too clean.** There is no moss, edge wear or rubble, and the pillar bases float. Add ground AO and rubble decals at each footprint (`ruins.js`).

### LIGHTING & POST: 4.5/10
1. **The lighting is flat, with soft and directionless shadows.**
   - Lower the sun to about 25-30 deg so it is harder and rakes long shadows across the ground (d4_03).
   - Cut hemi/ambient by about 40% so the frame has real blacks.
2. **The bloom blows out.** Battle and zone shots have white discs about 400 px wide.
   - The settings in `engine.js:172` are sane; the inputs are not.
   - Clamp the bloom input HDR at about 8 and drop the radius to 0.3.
   - Then fix the VFX intensities.
3. **The grade is a single orange-olive wash, not teal-amber.**
   - Push the shadows toward `#1a2228` and keep warmth only in light pools (`post.js`).
   - The vignette is 0.55 and the HUD stacks a red corner tint on top. Pick one.
4. **There is no atmospheric depth** (compare d4_07). Add ground-hugging mist cards with depth-fade and distance desaturation toward the top of the frame.

### CHARACTERS: 4/10
1. **The hit flash whites out whole packs.** In horde_warrior the skeletons are pure white blobs.
   - `materials.js` adds `uFlash` at `0.55+0.45*fres`, and bloom amplifies it.
   - Cap it at about 0.35, tint it warm red-white, and keep it to 80 ms or less.
2. **Readability at 60 px is poor.** Wizard hats read as discs and skeleton hoods as red blobs.
   - Raise rimStrength from 0.55 to about 0.9, with a cool `#9fb8e0` rim.
   - Add per-team ground rings.
3. **The materials are toy plastic.**
   - Add a grime/AO gradient from the feet up (about 30% darker at the boots).
   - Desaturate the KayKit palette about 35% toward grey-brown, keeping only the accent colours.
4. **Contact grounding is weak.** Add a dark blob-shadow decal under each unit.

### VFX: 3.5/10
1. **The nova, fireball and meteor are structureless white-yellow discs.** D4 fire (d4_03) is saturated orange with a dark-red edge, visible turbulence and a small hot core.
   - Cap core emissive at about 4.
   - Use noise and erosion textures.
   - Make the edge colour `#ff5a10` fading to `#5a0a00` (`fx.js`, `particles.js`).
2. **The ground rune rings are oversized and opaque, and read as UI.** Halve their alpha, add distortion, and fade them out in 0.3 s.
3. **Combat leaves no history.** Add scorch, embers, frost crystals and blood splats (`decals.js`).
4. **The Rain of Arrows streaks look like white UI lines.** Make the shafts darker, add short trails, and add landing dust puffs.

### GAMEPLAY VISUALS: 3/10
1. **The zone wall is the worst element in the game.** `zone.js:47` sets `H = 18`. From this camera, the far-side curtain covers everything outside the circle and creates a "globe" horizon over 40-50% of the frame.
   - Cut the height to 4-5 and fade the alpha to 0 at the top.
   - Halve the lightning intensity.
   - Tint the outside ground darker, desaturated and faintly red instead of a lilac flood. It also wastes fill rate.
2. **Two concentric circles compete:** the wall and a thin white next-zone line. Make the next-zone line a dim, dashed ground decal.
3. **Loot is never shown.** Stage a loot shot with D4-style rarity beams.
4. **Player and enemy rings look identical.** Enemy telegraphs need a distinct red fill-up, as in d4_04.

### UI: 6.5/10 (the strongest area)
1. **Class select:** the previews are blurry and pixelated. Render them at DPR 2. Give the dais a stone plinth and a fog pool. The ranger card is misaligned and its LIFE/SPEED bars are empty.
2. **The globes are about 15% too big and too glossy.** The white blob highlight reads as a bubble. Use a subtle liquid swirl and darken the frame.
3. **Damage numbers and nameplates overlap illegibly** ("5778", stacked "1234"). Add stacking and jitter, and declutter the nameplates.
4. **"THE GAUNTLET BEGINS" covers the combat.** Move it higher, make it smaller, and show it for about 1.5 s.
5. **The rival pips show 5 skulls while the counter says 2.** This is a state bug.

## 3. Cross-cutting issues

- **Emissive budget:** VFX, hit flash and the zone wall are all unbounded. Enforce a max of 4 HDR in shared FX materials.
- **Value hierarchy:** bright ground, a bright magenta wall and white VFX all compete. D4 frames are about 70% near-black with lit pools.
- **Staging:** every shot puts the player under the same dead tree, at the zone edge. `stage.js` makes the game look worse than it is.
- **Density and scale:** the world reads sparse and miniature. Use about 3x the props (rubble, roots, bones) near paths and ruins.
- **Capture QA:** add harness checks that fail on an all-black frame or an unknown class.
- **Performance:** the full-screen 18 m translucent wall, GTAO at 12 samples and huge additive quads all cost fill rate on mid-range GPUs.
