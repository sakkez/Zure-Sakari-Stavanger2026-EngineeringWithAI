// Small geometry builder used for procedural vegetation, logs and ruins (merged, vertex-colored).
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { noise } from './noise.js';

export class GeoBuilder {
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.col = []; this.idx = []; }
  get count() { return this.pos.length / 3; }
  vert(p, n, u, v, c = 1) {
    this.pos.push(p.x, p.y, p.z); this.nor.push(n.x, n.y, n.z); this.uv.push(u, v);
    if (typeof c === 'number') this.col.push(c, c, c); else this.col.push(c.r, c.g, c.b);
    return this.count - 1;
  }
  tri(a, b, c) { this.idx.push(a, b, c); }
  // Merge an existing BufferGeometry, transformed by matrix, tinted by color (number or Color or fn(pos)->number).
  addGeometry(geo, m, color = 1) {
    const g = geo.index ? geo : geo;
    const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
    const nm = new THREE.Matrix3().getNormalMatrix(m);
    const base = this.count, v = new THREE.Vector3(), nn = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const local = v.clone();
      v.applyMatrix4(m);
      if (n) nn.fromBufferAttribute(n, i).applyMatrix3(nm).normalize(); else nn.set(0, 1, 0);
      const c = typeof color === 'function' ? color(local, v) : color;
      this.vert(v, nn, uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0, c);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) this.idx.push(base + g.index.getX(i));
    else for (let i = 0; i < p.count; i++) this.idx.push(base + i);
  }
  // Tapered tube along a polyline; radii per point. uv: u around, v along length (meters / vScale).
  tube(points, radii, sides = 6, color = 1, vScale = 1.2, capEnd = false) {
    let along = 0;
    const rings = [];
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const t = new THREE.Vector3().subVectors(points[Math.min(i + 1, points.length - 1)], points[Math.max(i - 1, 0)]).normalize();
      const ref = Math.abs(t.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      const nA = new THREE.Vector3().crossVectors(t, ref).normalize(), nB = new THREE.Vector3().crossVectors(t, nA).normalize();
      if (i > 0) along += p.distanceTo(points[i - 1]);
      const ring = [];
      for (let s = 0; s <= sides; s++) {
        const a = (s / sides) * Math.PI * 2;
        const wob = 1 + (noise(p.x * 3 + s, p.z * 3 + p.y * 2) - 0.5) * 0.35;
        const d = nA.clone().multiplyScalar(Math.cos(a)).addScaledVector(nB, Math.sin(a));
        const c = typeof color === 'function' ? color(i / (points.length - 1), s) : color;
        ring.push(this.vert(p.clone().addScaledVector(d, radii[i] * wob), d, s / sides, along / vScale, c));
      }
      rings.push(ring);
    }
    for (let i = 0; i < rings.length - 1; i++) for (let s = 0; s < sides; s++) {
      const a = rings[i][s], b = rings[i][s + 1], c = rings[i + 1][s], d = rings[i + 1][s + 1];
      this.tri(a, c, b); this.tri(b, c, d);
    }
    if (capEnd) {
      const last = points[points.length - 1], prev = points[points.length - 2];
      const t = new THREE.Vector3().subVectors(last, prev).normalize();
      const center = this.vert(last, t, 0.5, 0.5, typeof capEnd === 'number' ? capEnd : 1.4);
      const ring = rings[rings.length - 1];
      for (let s = 0; s < sides; s++) {
        const pa = new THREE.Vector3().fromArray(this.pos, ring[s] * 3), pb = new THREE.Vector3().fromArray(this.pos, ring[s + 1] * 3);
        const a = this.vert(pa, t, 0.5 + 0.4 * Math.cos(s / sides * 6.283), 0.5 + 0.4 * Math.sin(s / sides * 6.283), typeof capEnd === 'number' ? capEnd : 1.4);
        const b = this.vert(pb, t, 0.5 + 0.4 * Math.cos((s + 1) / sides * 6.283), 0.5 + 0.4 * Math.sin((s + 1) / sides * 6.283), typeof capEnd === 'number' ? capEnd : 1.4);
        this.tri(center, a, b);
      }
    }
  }
  // A quad given 4 corners (counter-clockwise seen from the normal side).
  quad(p0, p1, p2, p3, n, uvs = [[0, 0], [1, 0], [1, 1], [0, 1]], cols = [1, 1, 1, 1], ns = null) {
    const a = this.vert(p0, ns ? ns[0] : n, ...uvs[0], cols[0]), b = this.vert(p1, ns ? ns[1] : n, ...uvs[1], cols[1]);
    const c = this.vert(p2, ns ? ns[2] : n, ...uvs[2], cols[2]), d = this.vert(p3, ns ? ns[3] : n, ...uvs[3], cols[3]);
    this.tri(a, b, c); this.tri(a, c, d);
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}

export const noise3 = (x, y, z) => (noise(x, y) + noise(y + 31.7, z - 7.3) + noise(z + 17.1, x + 3.9)) / 3;

// Angular rock: welded icosphere, lumpy noise, then sliced by random planes into flat fractured
// facets (reads as broken stone rather than a smooth blob). shape: {sx,sy,sz, rough, cuts, strata, flatBottom}
export function rockGeometry(seed, { sx = 1, sy = 0.7, sz = 1, rough = 0.3, cuts = 11, strata = 0, detail = 5, flatBottom = -0.35 } = {}) {
  let g = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  g = mergeVertices(g);
  const p = g.attributes.position, v = new THREE.Vector3();
  const o = seed * 13.37;
  let a = seed * 7919 + 1; const R = () => { a = (a * 16807) % 2147483647; return a / 2147483647; };
  const planes = [];
  for (let k = 0; k < cuts; k++) {
    const th = R() * Math.PI * 2, y = strata && k % 2 ? (R() < 0.5 ? 1 : -1) * (0.85 + R() * 0.15) : (R() * 2 - 1) * 0.9;
    const r = Math.sqrt(1 - y * y);
    planes.push({ n: new THREE.Vector3(Math.cos(th) * r, y, Math.sin(th) * r), d: 0.6 + R() * 0.3 });
  }
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n1 = noise3(v.x * 1.3 + o, v.y * 1.3, v.z * 1.3 - o);
    const n3 = noise3(v.x * 7 + o, v.y * 7, v.z * 7);
    v.multiplyScalar(1 + (n1 - 0.5) * rough * 2);
    for (const pl of planes) { const s2 = v.dot(pl.n) - pl.d; if (s2 > 0) v.addScaledVector(pl.n, -s2 * 0.96); }
    v.multiplyScalar(1 + (n3 - 0.5) * 0.05);
    if (strata) v.y += Math.round(v.y * strata) / strata * 0.06;
    v.set(v.x * sx, Math.max(v.y, flatBottom) * sy, v.z * sz);
    p.setXYZ(i, v.x, v.y, v.z);
    // Vertex AO: darker underneath and in crevices.
    const ao = 0.6 + 0.4 * Math.min(1, Math.max(0, (v.y / sy - flatBottom) / 1.2));
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = ao * (0.88 + n1 * 0.24);
  }
  g.computeVertexNormals();
  // Curvature from the welded mesh: convex edges get lighter "edge wear", concave creases get cavity
  // darkening; this is baked into the vertex colour on top of the ground-contact AO.
  const idx = g.index, nrm = g.attributes.normal, cnt = new Float32Array(p.count), sum = new Float32Array(p.count * 3);
  for (let t = 0; t < idx.count; t += 3) {
    const tri = [idx.getX(t), idx.getX(t + 1), idx.getX(t + 2)];
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) if (a !== b) {
      const i = tri[a], j = tri[b];
      sum[i * 3] += p.getX(j); sum[i * 3 + 1] += p.getY(j); sum[i * 3 + 2] += p.getZ(j); cnt[i]++;
    }
  }
  const curv = new Float32Array(p.count);
  let cmax = 1e-6;
  for (let i = 0; i < p.count; i++) {
    const ax = sum[i * 3] / cnt[i] - p.getX(i), ay = sum[i * 3 + 1] / cnt[i] - p.getY(i), az = sum[i * 3 + 2] / cnt[i] - p.getZ(i);
    curv[i] = -(ax * nrm.getX(i) + ay * nrm.getY(i) + az * nrm.getZ(i)); // >0 convex
    cmax = Math.max(cmax, Math.abs(curv[i]));
  }
  for (let i = 0; i < p.count; i++) {
    const c = curv[i] / cmax;
    const k = c > 0 ? 1 + Math.min(1, c * 2.5) * 0.35 : 1 - Math.min(1, -c * 2.5) * 0.45;
    col[i * 3] *= k; col[i * 3 + 1] *= k; col[i * 3 + 2] *= k * (c > 0 ? 1 : 0.95);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
}
