// Deterministic noise helpers shared by the world modules (no Math.random anywhere in world/).
export function hash(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
export function noise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, z, oct = 5) {
  let f = 0, amp = 0.5, freq = 1, norm = 0;
  for (let i = 0; i < oct; i++) { f += amp * noise(x * freq + i * 17.3, z * freq - i * 9.1); norm += amp; amp *= 0.5; freq *= 2.03; }
  return f / norm;
}
// Ridged noise in [0,1]: sharp crests, good for rocky ridges.
export function ridged(x, z, oct = 4) {
  let f = 0, amp = 0.5, freq = 1, norm = 0;
  for (let i = 0; i < oct; i++) { const n = 1 - Math.abs(noise(x * freq + i * 5.7, z * freq + i * 3.3) * 2 - 1); f += amp * n * n; norm += amp; amp *= 0.5; freq *= 2.1; }
  return f / norm;
}
export function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
export function mulberry(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
