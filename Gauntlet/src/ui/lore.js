// UI-side flavour text for classes and abilities. Gameplay numbers stay in src/game/classes.js.
export const CLASS_LORE = {
  warrior: {
    title: 'Oathbreaker Knight', role: 'Melee', resource: 'Fury',
    flavour: 'He walked out of the burning chapel alone. The storm parts for him, or it breaks.',
    accent: '#d0402a', rim: 0xd8603a, key: 0xc8d6ec, // moonlit steel key
    signature: '2H_Melee_Attack_Spinning',
  },
  mage: {
    title: 'Ashen Sorceress', role: 'Ranged Caster', resource: 'Mana',
    flavour: 'The old fires were sealed beneath the cathedral. She remembers every word that opened them.',
    accent: '#4a8cff', rim: 0x5aa8ff, key: 0xd4d8e6,
    signature: 'Spellcast_Raise',
  },
  archer: {
    title: 'Hollow Ranger', role: 'Ranged', resource: 'Energy',
    flavour: 'Patient as the first frost. One bolt, one grave, and the forest keeps her secrets.',
    accent: '#9cc24a', rim: 0x9ccc6a, key: 0xd6dccc,
    signature: '2H_Ranged_Shoot',
  },
};

export const ABILITY_LORE = {
  cleave: 'Sweep your greatsword in a brutal arc, striking every foe before you.',
  whirlwind: 'Become a storm of steel, shredding everything around you.',
  earthshatter: 'Drive your blade into the earth and loose a shockwave that crushes all nearby.',
  charge: 'Hurl yourself forward, closing the distance in a heartbeat.',
  fireball: 'Hurl an orb of living flame that bursts on impact, scorching all nearby.',
  'frost nova': 'Unleash a ring of rime that damages and freezes nearby enemies.',
  meteor: 'Call a burning star down from the heavens upon your target.',
  blink: 'Fold space and step through, reappearing a short distance away.',
  bolt: 'Loose a heavy crossbow bolt with unerring aim.',
  multishot: 'Fire a fan of bolts that tears through the enemy line.',
  'rain of arrows': 'Blot out the sky with a volley that falls upon an area.',
  roll: 'Tumble out of harm\'s way.',
};

export const SLOT_KEYS = { primary: 'LMB', secondary: 'RMB', ultimate: 'E', dodge: 'Space' };
export const SLOT_LABEL = { primary: 'Basic', secondary: 'Core', ultimate: 'Ultimate', dodge: 'Mobility' };

// Resource globe palettes by class.
export const RESOURCE = {
  warrior: { name: 'Fury', deep: '#1c0701', mid: '#7a2c06', light: '#d8701c', surf: '#ffc080', gem: '#ff8a1a' },
  mage: { name: 'Mana', deep: '#02041c', mid: '#0e2380', light: '#3468d8', surf: '#a0c4ff', gem: '#3a7aff' },
  archer: { name: 'Energy', deep: '#0a1201', mid: '#3c5c0a', light: '#94b828', surf: '#e0f0a0', gem: '#a8e030' },
};
export const HEALTH = { name: 'Life', deep: '#1a0002', mid: '#6e0409', light: '#c8161a', surf: '#ff8070', gem: '#e0141a' };
