// Loads the KayKit (CC0) rigged characters and builds animated actor instances.
// Actor API: { root, mixer, clips, kind, play(name,opts), update(dt), duration(name), animation,
//              crossfade(name,fade), setMoveSpeed(v), playUpper(name,opts), stopUpper(fade), flash(t,color),
//              setRim(color,strength), setTeam(team), setOutline(px,color), bones }
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { processAtlas, makeActorUniforms, patchMaterial, FLASH_MAX, blobTexture, ringTexture, glowTexture, outlineMaterial } from './materials.js';
import { orcRecolor, orcSurfaceFor, dressOrc, getAxeGeos, orcPropMaterials, ORC_BONE_SCALE } from './orc.js';

const FILES = ['Knight', 'Mage', 'Rogue_Hooded', 'Barbarian', 'Skeleton_Minion', 'Skeleton_Warrior', 'Skeleton_Rogue', 'Skeleton_Mage'];
const WEAPONS = ['Skeleton_Blade', 'Skeleton_Axe', 'Skeleton_Crossbow', 'Skeleton_Staff', 'Skeleton_Shield_Large_A', 'Skeleton_Shield_Large_B', 'Skeleton_Shield_Small_A', 'Skeleton_Shield_Small_B'];

// Which weapon/prop nodes stay visible for each actor kind. Everything else in PROPS is hidden.
const PROPS = ['1H_Sword', '1H_Sword_Offhand', '2H_Sword', 'Badge_Shield', 'Rectangle_Shield', 'Round_Shield', 'Spike_Shield',
  '1H_Crossbow', '2H_Crossbow', 'Knife', 'Knife_Offhand', 'Throwable', 'Spellbook', 'Spellbook_open', '1H_Wand', '2H_Staff',
  '1H_Axe', '1H_Axe_Offhand', '2H_Axe', 'Mug', 'Barbarian_Round_Shield',
  'Skeleton_Axe', 'Skeleton_Blade', 'Skeleton_Crossbow', 'Skeleton_Shield_Large_A', 'Skeleton_Shield_Large_B', 'Skeleton_Shield_Small_A', 'Skeleton_Shield_Small_B', 'Skeleton_Staff'];

// Ranger: hood/cape (cell 1,1) -> weathered umber leather, tunic (1,0) -> dark moss; keeps it distinct from green orcs.
function rangerRecolor(r, g, b, row, col, surf, fy) {
  if (row === 1 && col === 1) { const k = 1.1 - 0.5 * fy; return [0.42 * k, 0.29 * k, 0.2 * k]; }
  if (row === 1 && col === 0) { const k = 1.05 - 0.45 * fy; return [0.24 * k, 0.29 * k, 0.21 * k]; }
  return null;
}

// grade: atlas color grade toward desaturated D4 palette. weapons: [file, hand] attached to handslot bones.
// eyes: emissive color of Skeleton_*_Eyes. rim: fresnel rim color/strength.
export const KINDS = {
  warrior: { file: 'Knight', keep: ['2H_Sword'], scale: 1, grade: { sat: 0.7, val: 0.78, metal: 0.95, metalSat: 0.45, cloth: 0.78 }, surfaces: { steel: [0.6, 0.42] }, rim: [0x9fb8e0, 0.9] },
  mage: { file: 'Mage', keep: ['2H_Staff'], glowCells: ['2,6'], scale: 1, grade: { sat: 0.85, val: 0.84 }, rim: [0x9fb8e0, 0.9] },
  archer: { file: 'Rogue_Hooded', keep: ['2H_Crossbow'], scale: 1, recolor: rangerRecolor, grade: { sat: 0.8, val: 0.84 }, rim: [0x9fb8e0, 0.9] },
  orc: { file: 'Barbarian', keep: ['2H_Axe'], scale: 1.18, orc: 'orc', grade: { sat: 1.05, val: 0.86 }, hide: ['Barbarian_Hat'], rim: [0x9fb8e0, 0] },
  orcBrute: { file: 'Barbarian', keep: ['2H_Axe'], scale: 1.4, orc: 'orcBrute', glowCells: ['0,2'], glowColor: '#ff1800', glowIntensity: 2.6, noGlow: ['Barbarian_Hat'], grade: { sat: 0.95, val: 0.82 }, rim: [0x9fb8e0, 0] },
  // Boss: orc warlord on the Barbarian rig at 2.3x. Dark iron plate torso, spiked pauldrons, horned helm,
  // tattered crimson cape, oversized 2H axe, glowing red eyes, red ground aura and a permanent outline.
  warlord: { file: 'Barbarian', keep: [], bossAxe: true, scale: 2.3, orc: 'warlord', glowCells: ['0,2'], glowColor: '#ff1200', glowIntensity: 4.5, hide: ['Barbarian_Hat', 'Barbarian_Cape'],
    propScale: { '2H_Axe': 1.1 }, animMap: { Idle: '2H_Melee_Idle' }, boss: true, grade: { sat: 0.8, val: 0.82 }, surfaces: { steel: [0.52, 0.6] }, rim: [0xff4030, 0.35] },
  skeletonMinion: { file: 'Skeleton_Minion', keep: [], scale: 1, weapons: [['Skeleton_Blade', 'r']], eyes: 0x4dfff0, grade: { sat: 0.7, val: 0.63, maxAlbedo: 0.62 }, rim: [0x70d0ff, 0.7] },
  skeletonWarrior: { file: 'Skeleton_Warrior', keep: [], scale: 1.08, weapons: [['Skeleton_Axe', 'r'], ['Skeleton_Shield_Large_A', 'l']], eyes: 0x38c8ff, grade: { sat: 0.7, val: 0.63, maxAlbedo: 0.62 }, rim: [0x70d0ff, 0.7] },
  skeletonArcher: { file: 'Skeleton_Rogue', keep: [], scale: 1, weapons: [['Skeleton_Crossbow', 'r']], eyes: 0x6ae4ff, grade: { sat: 0.7, val: 0.63, maxAlbedo: 0.62 }, rim: [0x70d0ff, 0.7] },
  skeletonMage: { file: 'Skeleton_Mage', keep: [], scale: 1, weapons: [['Skeleton_Staff', 'r']], eyes: 0x40ffd0, grade: { sat: 0.7, val: 0.63, maxAlbedo: 0.62 }, rim: [0x70d0ff, 0.7] },
};

// Weapon mounting relative to the handslot bone, matching the conventions inside the KayKit character files.
const MOUNT = {
  r: { rot: new THREE.Euler(0, Math.PI, 0), pos: new THREE.Vector3(0, 0.03, 0) },
  l: { rot: new THREE.Euler(0, 0, 0), pos: new THREE.Vector3(0, 0.02, 0) },
  crossbow: { rot: new THREE.Euler(0, Math.PI / 2, 0), pos: new THREE.Vector3(-0.1, -0.01, 0) },
};

// Approximate ground speed (units/s at scale 1) at which each locomotion clip's feet don't slide.
// Measured from foot stance velocity, x1.25 so short chibi legs don't look frantic at game speeds.
const LOCO_REF = { Running_A: 3.4, Running_B: 2.25, Running_C: 3.3, Walking_A: 1.05, Walking_B: 1.18, Walking_C: 0.7, Walking_D_Skeletons: 0.92, Walking_Backwards: 0.95, Running_Strafe_Left: 3.2, Running_Strafe_Right: 3.2 };

// Bones that belong to the upper-body layer.
const UPPER = /^(spine|chest|head|upperarm|lowerarm|wrist|hand|handslot|elbowIK|handIK)/;

const tmpScale = new THREE.Vector3();

// Less chibi at the game camera: smaller head, slightly heavier torso and limbs (applied on top of animation).
const BODY_SCALE = { head: [0.87, 0.87, 0.87], chest: [1.06, 1.03, 1.06], upperarml: [1.05, 1.05, 1.05], upperarmr: [1.05, 1.05, 1.05], upperlegl: [1.06, 1.03, 1.06], upperlegr: [1.06, 1.03, 1.06] };

// Shared ground decals (blob contact shadow + team ring).
const decalGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
let blobMat = null;
const ringMats = {};
const TEAM_RING = { player: 0xffc457, rival: 0xff3b2a };

export async function loadAssets(onProgress) {
  const loader = new GLTFLoader();
  // Skeleton weapon .gltf files reference skeleton_texture.png, which is byte-identical to the atlas embedded in
  // every Skeleton_*.glb. Redirect it to a 1x1 placeholder (no request that can fail) and swap in the body
  // material after load, so weapons can never end up untextured/white.
  const PLACEHOLDER = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  const wManager = new THREE.LoadingManager();
  wManager.setURLModifier((url) => (/skeleton_texture\.png$/i.test(url) ? PLACEHOLDER : url));
  const wLoader = new GLTFLoader(wManager);
  const retry = async (fn, n = 3) => { for (let i = 0; ; i++) { try { return await fn(); } catch (e) { if (i >= n - 1) throw e; } } };
  const gltfs = {};
  const weapons = {};
  let done = 0;
  const total = FILES.length + WEAPONS.length;
  await Promise.all([
    ...FILES.map(async (f) => {
      gltfs[f] = await retry(() => loader.loadAsync(`/assets/characters/${f}.glb`));
      onProgress?.(++done / total);
    }),
    ...WEAPONS.map(async (f) => {
      try {
        weapons[f] = (await retry(() => wLoader.loadAsync(`/assets/characters/skeleton_weapons/${f}.gltf`))).scene;
      } catch (e) { console.warn('weapon load failed', f, e); }
      onProgress?.(++done / total);
    }),
  ]);


  // ---- shared base materials, built lazily per (file, variant) ----
  const baseMats = new Map();
  function baseMaterial(srcMat, key, def) {
    const k = (srcMat.userData.atlasId || srcMat.uuid) + '|' + key;
    if (baseMats.has(k)) return baseMats.get(k);
    let m;
    if (srcMat.map) {
      const opts = { grade: def.grade, recolor: def.recolor, glowCells: def.glowCells, glowColor: def.glowColor };
      if (def.orc) { opts.recolor = orcRecolor(def.orc); opts.surface = orcSurfaceFor(def.orc); opts.surfaces = { cloth: [0.92, 0], skin: [0.58, 0], ...(def.surfaces || {}) }; }
      else if (def.surfaces) opts.surfaces = def.surfaces;
      const { map, orm, emissive } = processAtlas(srcMat.map, opts);
      m = new THREE.MeshStandardMaterial({
        map, roughnessMap: orm, metalnessMap: orm, roughness: 1, metalness: 1,
        envMapIntensity: def.orc ? 0.6 : 0.8, // uses scene.environment (engine HDRI)
      });
      if (emissive) { m.emissiveMap = emissive; m.emissive.set(0xffffff); m.emissiveIntensity = def.glowIntensity ?? 2.5; }
      m.name = srcMat.name + '_graded';
    } else {
      m = srcMat.clone();
    }
    baseMats.set(k, m);
    return m;
  }
  const gradeKey = (def) => def.key || def.orc || (def.file.startsWith('Skeleton') ? 'skel' : 'hero');

  // Weapons share the skeleton body material (same atlas).
  let skelMat = null;
  gltfs.Skeleton_Minion.scene.traverse((o) => { if (!skelMat && o.isMesh && o.material?.map) skelMat = o.material; });
  for (const w of Object.values(weapons)) w.traverse((o) => { if (o.isMesh && skelMat) o.material = skelMat; });

  // Pre-build graded atlases/materials for every kind so the first spawn of a kind doesn't hitch.
  for (const def of Object.values(KINDS)) {
    const key = gradeKey(def);
    gltfs[def.file]?.scene.traverse((o) => { if (o.isMesh && o.material?.map && o.material.name !== 'Glow') baseMaterial(o.material, key, def); });
    for (const [wf] of def.weapons || []) weapons[wf]?.traverse((o) => { if (o.isMesh && o.material?.map) baseMaterial(o.material, key, def); });
  }

  function findBones(root) {
    const bones = {};
    root.traverse((o) => { if (o.isBone || o.type === 'Object3D' || o.isObject3D) { if (!bones[o.name]) bones[o.name] = o; } });
    // GLTFLoader sanitizes 'handslot.r' -> 'handslotr'; expose both spellings.
    for (const n of Object.keys(bones)) if (/^[a-zA-Z]+[lr]$/.test(n)) { const dotted = n.slice(0, -1) + '.' + n.slice(-1); if (!bones[dotted]) bones[dotted] = bones[n]; }
    return bones;
  }

  function createActor(kind) {
    const def = KINDS[kind] || KINDS.warrior;
    const src = gltfs[def.file];
    const root = SkeletonUtils.clone(src.scene);
    const bones = findBones(root);
    const uniforms = makeActorUniforms(def.rim?.[0], def.rim?.[1]);
    const matCache = new Map();
    const actorMat = (m, key, noGlow = false, grime = true) => {
      const ck = m.uuid + (noGlow ? ':ng' : '') + (grime ? ':g' : '');
      if (matCache.has(ck)) return matCache.get(ck);
      const c = baseMaterial(m, key, def).clone();
      if (noGlow) { c.emissiveMap = null; c.emissive.set(0); }
      patchMaterial(c, uniforms, { grime });
      matCache.set(ck, c);
      return c;
    };
    const eyeMats = [];

    // weapons for skeletons (separate CC0 gltf files)
    for (const [wf, hand] of def.weapons || []) {
      const w = weapons[wf];
      const slot = bones['handslot' + hand];
      if (!w || !slot) continue;
      const inst = w.clone(true);
      const mount = wf.includes('Crossbow') ? MOUNT.crossbow : MOUNT[hand];
      inst.rotation.copy(mount.rot);
      inst.position.copy(mount.pos);
      inst.name = wf;
      slot.add(inst);
    }

    if (def.bossAxe && bones.handslotr) {
      const g = getAxeGeos();
      const axe = new THREE.Group(); axe.name = 'Boss_Axe';
      axe.rotation.set(0, Math.PI, 0); axe.position.set(0, 0.03, 0); axe.scale.setScalar(0.85);
      const bladeMat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.2, roughness: 0.75, envMapIntensity: 0.15 });
      const haftMat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0, roughness: 0.9 });
      patchMaterial(bladeMat, uniforms, { grime: false, axe: true }); patchMaterial(haftMat, uniforms, { grime: false });
      const blade = new THREE.Mesh(g.blade, bladeMat); blade.name = 'Orc_AxeBlade'; blade.castShadow = true;
      const haft = new THREE.Mesh(g.haft, haftMat); haft.name = 'Orc_AxeHaft'; haft.castShadow = true;
      axe.add(blade, haft);
      bones.handslotr.add(axe);
    }
    // orc dressing must run before root scaling (placement uses bind-pose world matrices)
    if (def.orc) {
      const mats = orcPropMaterials();
      const extras = dressOrc(root, bones, def.orc, { bone: mats.boneMat, iron: mats.ironMat, cape: mats.capeMat });
      for (const e of extras) {
        e.material = e.material.clone();
        if (def.boss && /Pauldron/.test(e.name)) e.material.color.set(0x6a625a); // blackened iron on the boss
        if (/Helm/.test(e.name)) { e.material.metalness = 0.55; e.material.roughness = 0.5; } // grimy iron, not chrome
        patchMaterial(e.material, uniforms, { grime: false });
      }
    }

    root.scale.setScalar(def.scale);
    const key = gradeKey(def);
    root.traverse((o) => {
      if (PROPS.includes(o.name) && !(def.weapons || []).some((w) => w[0] === o.name)) o.visible = def.keep.includes(o.name);
      if (def.hide?.includes(o.name)) o.visible = false;
      if (def.propScale?.[o.name]) o.scale.multiplyScalar(def.propScale[o.name]);
      if (def.flip?.includes(o.name) && !o.userData.flipped) { o.rotateX(Math.PI); o.userData.flipped = true; }
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        if (o.name.startsWith('Orc_')) return;
        const isEye = /_Eyes$/.test(o.name) || o.material?.name === 'Glow';
        if (isEye) {
          const m = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: def.eyes ?? 0x66ffcc, emissiveIntensity: 3.5, roughness: 1, metalness: 0 });
          o.material = m; o.castShadow = false; eyeMats.push(m);
        } else {
          o.material = actorMat(o.material, key, def.noGlow?.includes(o.name), !!o.isSkinnedMesh);
        }
      }
    });

    // per-bone extra scale (applied on top of the animation each frame)
    const boneScale = [];
    for (const [name, s] of Object.entries(def.orc ? ORC_BONE_SCALE[def.orc] : BODY_SCALE)) {
      if (bones[name]) boneScale.push([bones[name], new THREE.Vector3(...s)]);
    }

    // contact shadow (always) + team ring (heroes, via setTeam); children of root so they follow the unit
    blobMat ||= new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, fog: false });
    const blob = new THREE.Mesh(decalGeo, blobMat);
    blob.name = 'Actor_Blob'; blob.position.y = 0.04; blob.scale.setScalar(1.7); blob.renderOrder = 1;
    root.add(blob);
    const ring = new THREE.Mesh(decalGeo, blobMat);
    ring.name = 'Actor_Ring'; ring.position.y = 0.05; ring.scale.setScalar(1.5); ring.renderOrder = 2; ring.visible = false;
    root.add(ring);
    const glow = new THREE.Mesh(decalGeo, blobMat);
    glow.name = 'Actor_Glow'; glow.position.y = 0.06; glow.scale.setScalar(3.4); glow.renderOrder = 3; glow.visible = false;
    root.add(glow);
    let outlines = null;
    function setOutline(px, color = 0x050403) {
      if (!px) { if (outlines) for (const o of outlines) o.visible = false; return; }
      const mat = outlineMaterial(color, px);
      if (outlines) { for (const o of outlines) { o.material = mat; o.visible = true; } return; }
      outlines = [];
      const src = [];
      root.traverse((o) => {
        if (!o.isMesh || /^Actor_/.test(o.name) || /_Eyes$/.test(o.name)) return;
        for (let p = o; p; p = p.parent) if (!p.visible) return;
        src.push(o);
      });
      for (const o of src) {
        const m = o.isSkinnedMesh ? new THREE.SkinnedMesh(o.geometry, mat) : new THREE.Mesh(o.geometry, mat);
        if (o.isSkinnedMesh) m.bind(o.skeleton, o.bindMatrix);
        m.position.copy(o.position); m.quaternion.copy(o.quaternion); m.scale.copy(o.scale);
        m.name = 'Actor_Outline'; m.castShadow = false; m.frustumCulled = o.frustumCulled;
        o.parent.add(m); outlines.push(m);
      }
    }

    const mixer = new THREE.AnimationMixer(root);
    const clips = Object.fromEntries(src.animations.map((a) => [a.name, a]));
    const upperClips = {};
    let current = null, currentName = '';
    let upper = null, upperName = '';
    let moveSpeed = -1, baseSpeed = 1;
    let autoSpeed = 0; const lastPos = new THREE.Vector3(NaN, 0, 0);
    let flashT = 0, flashDur = 0.08, flashCd = 0;
    const flashColor = new THREE.Color(1, 1, 1);

    function upperClip(name) {
      if (upperClips[name]) return upperClips[name];
      const c = clips[name];
      if (!c) return null;
      const tracks = c.tracks.filter((t) => UPPER.test(t.name.split('.')[0]));
      return (upperClips[name] = new THREE.AnimationClip(name + '_upper', c.duration, tracks));
    }

    function applyLocoSpeed() {
      if (!current) return;
      const ref = LOCO_REF[currentName];
      if (!ref) return;
      // explicit setMoveSpeed wins; otherwise use the root's measured horizontal speed
      const v = moveSpeed >= 0 ? moveSpeed : autoSpeed;
      if (v <= 0.05) return;
      const r = v / (ref * def.scale);
      current.timeScale = baseSpeed * THREE.MathUtils.clamp(r, 0.6, 1.8);
    }

    const actor = {
      root, mixer, kind, clips, bones, eyeMats, uniforms,
      play(name, { loop = true, fade = 0.15, speed = 1, force = false } = {}) {
        name = def.animMap?.[name] || name;
        if (!clips[name]) return null;
        if (name === currentName && !force) return current;
        const action = mixer.clipAction(clips[name]);
        action.reset();
        action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
        action.clampWhenFinished = !loop;
        action.timeScale = speed;
        action.setEffectiveWeight(1);
        if (current && current !== action) current.crossFadeTo(action, fade, false);
        action.play();
        current = action; currentName = name; baseSpeed = speed;
        applyLocoSpeed();
        if (/^(Hit_|Death_)/.test(name)) actor.flash();
        return action;
      },
      crossfade(name, fade = 0.25, opts = {}) { return actor.play(name, { ...opts, fade, force: opts.force ?? false }); },
      /** Locomotion speed matching: scales Running/Walking timeScale to match actual ground speed (units/s). */
      setMoveSpeed(v) { moveSpeed = v; applyLocoSpeed(); },
      /** Plays a clip on the upper body only (spine/arms/head), over whatever the legs are doing. */
      playUpper(name, { fade = 0.12, speed = 1, loop = false } = {}) {
        const clip = upperClip(name);
        if (!clip) return null;
        const a = mixer.clipAction(clip);
        if (upper && upper !== a) upper.fadeOut(fade);
        a.reset();
        a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
        a.clampWhenFinished = false;
        a.timeScale = speed;
        a.weight = 8; // dominates the base layer on shared bones (mixer normalizes weights)
        a.fadeIn(fade).play();
        upper = a; upperName = name;
        return a;
      },
      stopUpper(fade = 0.15) { if (upper) { upper.fadeOut(fade); upper = null; upperName = ''; } },
      get upperAnimation() { return upperName; },
      /** Brief emissive flash (white by default; pass 0xff3020 for a red damage flash). */
      // Capped (FLASH_MAX), short (<=80 ms) and non-stacking: repeated hits within 0.2 s don't retrigger,
      // so a pack under a channelled AoE pulses instead of turning into white blobs.
      flash(t = 0.08, color = 0xffd8c0) {
        if (flashT > 0 || flashCd > 0) return;
        flashDur = flashT = Math.min(t, 0.08); flashCd = 0.35; flashColor.set(color);
      },
      /** 'player' -> gold ground ring, 'rival*' -> red ring, anything else -> none. */
      setTeam(team) {
        const k = team === 'player' ? 'player' : /^rival/.test(team || '') ? 'rival' : null;
        ring.visible = !!k;
        ring.scale.setScalar(k === 'player' ? 2.5 : 2.1);
        if (k) ring.material = ringMats[k] ||= new THREE.MeshBasicMaterial({ map: ringTexture(), color: TEAM_RING[k], transparent: true, depthWrite: false, opacity: k === 'player' ? 0.9 : 0.6, polygonOffset: true, polygonOffsetFactor: -2, toneMapped: false, fog: false });
        // player: warm under-glow + dark silhouette outline; rivals: thinner outline
        glow.visible = k === 'player' || !!def.boss;
        if (k === 'player') glow.material = ringMats.glowP ||= new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0xffb066, transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, fog: false });
        // faction readability: warm-gold rim + warm dark 3px outline for the player, red for rivals
        if (k === 'player') { actor.setRim(0xffc070, 1.1); setOutline(3.0, 0xa86a24); }
        else if (k === 'rival') { actor.setRim(0xff5040, 0.9); setOutline(2.0, 0x4a0a06); }
        else setOutline(def.boss ? 2.4 : 0);
      },
      setOutline,
      setRim(color, strength = 0.6) { uniforms.uRimColor.value.set(color).multiplyScalar(strength); },
      get animation() { return currentName; },
      duration(name) { return clips[name]?.duration ?? 0; },
      update(dt) {
        // upper layer auto fade-out near the end of a one-shot
        if (upper && upper.loop === THREE.LoopOnce) {
          const d = upper.getClip().duration;
          if (upper.time >= d - 0.15 * upper.timeScale || !upper.isRunning()) { upper.fadeOut(0.15); upper = null; upperName = ''; }
        }
        // measured ground speed (used for locomotion speed matching when setMoveSpeed isn't called)
        if (dt > 0) {
          const p = root.position;
          if (lastPos.x === lastPos.x) {
            const sp = Math.hypot(p.x - lastPos.x, p.z - lastPos.z) / dt;
            autoSpeed += (Math.min(sp, 20) - autoSpeed) * (1 - Math.exp(-10 * dt));
          }
          lastPos.copy(p);
          if (moveSpeed < 0) applyLocoSpeed();
        }
        for (const [b, s] of boneScale) b.scale.divide(s);
        mixer.update(dt);
        for (const [b, s] of boneScale) b.scale.multiply(tmpScale.copy(s));
        flashCd = Math.max(0, flashCd - dt);
        if (flashT > 0) {
          flashT = Math.max(0, flashT - dt);
          uniforms.uFlash.value.copy(flashColor).multiplyScalar(FLASH_MAX * (flashT / flashDur));
        } else if (uniforms.uFlash.value.r !== 0) uniforms.uFlash.value.setRGB(0, 0, 0);
      },
    };
    for (const [b, s] of boneScale) b.scale.multiply(s);
    if (def.boss) {
      glow.material = ringMats.glowBoss ||= new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0xff2a0a, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, fog: false });
      glow.visible = true; glow.scale.setScalar(2.6);
      blob.scale.setScalar(2.0);
      setOutline(2.4);
    }
    return actor;
  }

  return { gltfs, weapons, createActor, KINDS, THREE };
}
