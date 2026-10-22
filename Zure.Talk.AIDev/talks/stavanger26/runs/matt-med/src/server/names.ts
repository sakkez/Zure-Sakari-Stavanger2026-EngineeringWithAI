const ADJ = ['Swift', 'Brave', 'Neon', 'Crimson', 'Silent', 'Wild', 'Lucky', 'Frosty', 'Turbo', 'Shadow', 'Blazing', 'Cosmic'];
const NOUN = ['Fox', 'Tiger', 'Falcon', 'Viper', 'Wolf', 'Otter', 'Raven', 'Panda', 'Lynx', 'Comet', 'Badger', 'Shark'];

export function generateName(taken: Set<string>, rnd: () => number = Math.random): string {
  for (let i = 0; i < 200; i++) {
    const n = ADJ[Math.floor(rnd() * ADJ.length)] + NOUN[Math.floor(rnd() * NOUN.length)] + Math.floor(rnd() * 100);
    if (!taken.has(n)) return n;
  }
  return 'Player' + Date.now();
}
