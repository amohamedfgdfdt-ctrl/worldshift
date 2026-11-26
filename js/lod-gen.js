// Automatic LOD generation for models that ship with a single detail level.
// Vertex clustering: vertices are snapped to a 3D grid, every cell becomes one
// vertex (attributes averaged), triangles that collapse are dropped. The cell
// size is searched so the result lands near a target fraction of triangles.
// It runs once at load time on the CPU (a few milliseconds for a 2k-triangle
// model) and never touches the original geometry. Material groups are kept.
import * as THREE from '../vendor/three.module.min.js';

const ATTRS = ['position', 'normal', 'uv', 'uv1', 'color'];

function clusterOnce(src, cell) {
  const pos = src.attributes.position;
  const n = pos.count;
  const groups = src.groups.length ? src.groups : [{ start: 0, count: n, materialIndex: 0 }];
  const names = ATTRS.filter((k) => src.attributes[k]);
  const sizes = names.map((k) => src.attributes[k].itemSize);
  const map = new Map();                // cell key -> cluster index
  const sums = names.map((k, i) => []); // per attribute: running sums per cluster
  const cnt = [];
  const out = [];                       // triangle list of cluster indices, per group
  const outGroups = [];
  const inv = 1 / cell;
  const remap = new Int32Array(n);
  for (let gi = 0; gi < groups.length; gi++) {
    const gr = groups[gi];
    const start = out.length;
    for (let i = gr.start; i < gr.start + gr.count; i++) {
      const key = gi + '|' + Math.round(pos.getX(i) * inv) + ',' + Math.round(pos.getY(i) * inv) + ',' + Math.round(pos.getZ(i) * inv);
      let c = map.get(key);
      if (c === undefined) {
        c = cnt.length; map.set(key, c); cnt.push(0);
        names.forEach((_, a) => { for (let q = 0; q < sizes[a]; q++) sums[a].push(0); });
      }
      remap[i] = c; cnt[c]++;
      names.forEach((k, a) => { const at = src.attributes[k]; for (let q = 0; q < sizes[a]; q++) sums[a][c * sizes[a] + q] += at.getComponent(i, q); });
    }
    for (let i = gr.start; i < gr.start + gr.count; i += 3) {
      const a = remap[i], b = remap[i + 1], c = remap[i + 2];
      if (a === b || b === c || a === c) continue;
      out.push(a, b, c);
    }
    outGroups.push({ start, count: out.length - start, materialIndex: gr.materialIndex });
  }
  return { names, sizes, sums, cnt, out, outGroups };
}

function build(res) {
  const { names, sizes, sums, cnt, out, outGroups } = res;
  const g = new THREE.BufferGeometry();
  names.forEach((k, a) => {
    const arr = new Float32Array(out.length * sizes[a]);
    for (let t = 0; t < out.length; t++) {
      const c = out[t], inv = 1 / cnt[c];
      for (let q = 0; q < sizes[a]; q++) arr[t * sizes[a] + q] = sums[a][c * sizes[a] + q] * inv;
    }
    if (k === 'normal') {
      for (let t = 0; t < out.length; t++) {
        const x = arr[t * 3], y = arr[t * 3 + 1], z = arr[t * 3 + 2], l = Math.hypot(x, y, z) || 1;
        arr[t * 3] = x / l; arr[t * 3 + 1] = y / l; arr[t * 3 + 2] = z / l;
      }
    }
    g.setAttribute(k, new THREE.BufferAttribute(arr, sizes[a]));
  });
  let off = 0;
  g.clearGroups();
  for (const gr of outGroups) { if (gr.count > 0) g.addGroup(gr.start, gr.count, gr.materialIndex); off += gr.count; }
  if (!g.groups.length) g.addGroup(0, out.length, 0);
  return g;
}

/**
 * Returns { geometry, tris } with roughly `ratio` of the source triangles, or
 * null when the model is already small (minTris) or cannot be reduced.
 */
export function simplifyGeometry(src, ratio, { minTris = 200 } = {}) {
  const srcTris = src.attributes.position.count / 3;
  if (srcTris < minTris) return null;
  src.computeBoundingBox();
  const size = src.boundingBox.getSize(new THREE.Vector3());
  const diag = Math.max(size.x, size.y, size.z, 1e-3);
  const target = srcTris * ratio;
  let lo = diag / 400, hi = diag / 2, best = null;
  for (let it = 0; it < 9; it++) {
    const mid = Math.sqrt(lo * hi);
    const r = clusterOnce(src, mid);
    const tris = r.out.length / 3;
    if (tris >= 4 && (!best || Math.abs(tris - target) < Math.abs(best.out.length / 3 - target))) best = r;
    if (tris > target) lo = mid; else hi = mid;
  }
  if (!best) return null;
  const tris = best.out.length / 3;
  if (tris >= srcTris * 0.9) return null;
  const geometry = build(best);
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return { geometry, tris };
}
