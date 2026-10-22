const ADJECTIVES = [
  'Brave', 'Swift', 'Fierce', 'Sly', 'Bold', 'Wild', 'Lucky', 'Mighty', 'Silent', 'Rapid',
  'Clever', 'Grim', 'Jolly', 'Neon', 'Royal', 'Shady', 'Stormy', 'Zesty', 'Cosmic', 'Frosty',
];
const ANIMALS = [
  'Otter', 'Falcon', 'Tiger', 'Badger', 'Wolf', 'Fox', 'Panda', 'Cobra', 'Lynx', 'Raven',
  'Shark', 'Moose', 'Gecko', 'Bison', 'Koala', 'Hawk', 'Yak', 'Puma', 'Heron', 'Orca',
];

const pick = <T>(list: readonly T[], rnd: () => number): T => list[Math.floor(rnd() * list.length)];

export function generateName(taken: ReadonlySet<string>, rnd: () => number = Math.random): string {
  for (let i = 0; i < 200; i++) {
    const name = `${pick(ADJECTIVES, rnd)} ${pick(ANIMALS, rnd)}`;
    if (!taken.has(name)) return name;
  }
  let n = 2;
  const base = `${pick(ADJECTIVES, rnd)} ${pick(ANIMALS, rnd)}`;
  while (taken.has(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}
