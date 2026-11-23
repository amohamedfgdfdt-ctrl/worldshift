// Node test for the terrain generator and the water simulation (no browser needed).
import { HeightField } from '../js/terrain.js';
import { WaterSim } from '../js/water-system.js';
import { N, VERTS, CELL, HALF } from '../js/config.js';

let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };

const seeds = process.argv[2] ? [Number(process.argv[2])] : [7, 1234];
for (const seed of seeds) {
  console.log('--- seed', seed);
  const f = new HeightField(seed);
  let mn = 1e9, mx = -1e9;
  for (const v of f.h) { mn = Math.min(mn, v); mx = Math.max(mx, v); }
  console.log('height range', mn.toFixed(2), mx.toFixed(2), 'lake level', f.lake.level.toFixed(2), 'source', f.riverSource);
  ok(mx - mn > 25, 'terrain has relief (mountains and lowlands)');
  const sim = new WaterSim(f);
  sim.resetToInitial();
  sim.addSource(f.riverSource.i, f.riverSource.j, 8);
  const v0 = sim.totalVolume();
  console.log('initial volume', v0.toFixed(0), 'wet nodes', sim.wetNodeCount());
  ok(sim.wetNodeCount() > 100, 'initial lake + river exist');
  const t0 = performance.now();
  const S = 1200;
  for (let s = 0; s < S; s++) sim.step(1, true);
  const ms = (performance.now() - t0) / S;
  console.log('ms/step', ms.toFixed(2), 'volume', sim.totalVolume().toFixed(0), 'wet', sim.wetNodeCount());
  let bad = 0; for (const v of sim.depth) if (!(v >= 0) || !isFinite(v)) bad++;
  ok(bad === 0, 'no NaN / negative depths after 1200 steps');
  ok(ms < 4, 'step cost under 4 ms (' + ms.toFixed(2) + ')');
  // pour into a dry hill: water must run downhill and not stay at the pour point
  const sim2 = new WaterSim(f); sim2.clearAll();
  // find a dry node on a slope in the middle-left
  let bi = 30, bj = 40, bh = 0;
  for (let j = 20; j < 110; j++) for (let i = 10; i < 110; i++) {
    const k = j * VERTS + i;
    if (f.initialWater[k] === 0 && f.slope[k] > 0.15 && f.slope[k] < 0.4 && f.h[k] > bh && f.h[k] < 25) { bh = f.h[k]; bi = i; bj = j; }
  }
  const x = bi * CELL - HALF, z = bj * CELL - HALF;
  sim2.addVolume(x, z, 8, 400);
  const k0 = bj * VERTS + bi; const d0 = sim2.depth[k0];
  for (let s = 0; s < 400; s++) sim2.step(1, true);
  const d1 = sim2.depth[k0];
  console.log('pour node', bi, bj, 'h', bh.toFixed(1), 'depth', d0.toFixed(3), '->', d1.toFixed(3), 'vol left', sim2.totalVolume().toFixed(0));
  ok(d1 < d0 * 0.5, 'poured water flows away from a slope');
  // water gathers in a depression: find lowest node reached
  let wetNodes = sim2.wetNodeCount();
  console.log('wet after pour', wetNodes);
  // obstacle blocks water
  const sim3 = new WaterSim(f); sim3.clearAll();
  sim3.addVolume(x, z, 8, 400);
  sim3.setObstacle(bi - 2, bj - 2, bi + 2, bj + 2, 6);
  for (let s = 0; s < 50; s++) sim3.step(1, true);
  let inside = 0; for (let j = bj - 2; j <= bj + 2; j++) for (let i = bi - 2; i <= bi + 2; i++) inside += sim3.depth[j * VERTS + i];
  ok(inside < 0.05 * 25 + 5, 'obstacles keep water out of their footprint (sum depth ' + inside.toFixed(2) + ')');
  // encode/decode
  const enc = sim.encode(); const s4 = new WaterSim(f); s4.decode(enc);
  let maxd = 0; for (let k = 0; k < sim.depth.length; k++) maxd = Math.max(maxd, Math.abs(sim.depth[k] - s4.depth[k]));
  ok(maxd < 0.001, 'water save/restore round-trips (max err ' + maxd.toFixed(5) + ', rle len ' + enc.length + ')');
  // Does river water reach the south edge? check depth at river centre near south
  const v = 0.93, u = f.river.riverU(v); const ii = Math.round(u * N), jj = Math.round(v * N);
  let near = 0; for (let di = -3; di <= 3; di++) near = Math.max(near, sim.depth[jj * VERTS + ii + di]);
  console.log('river depth near south (v=.93):', near.toFixed(2));
  ok(near > 0.1, 'river carries water to the southern part of the map');
}
process.exit(fails ? 1 : 0);
