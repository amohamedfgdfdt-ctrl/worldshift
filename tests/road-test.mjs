// Node test for the road router and the road graph (Stage J).
// Pure logic: no browser, no THREE. The grid adapter here mirrors the one
// building-system.js hands to RoadRouter in the game.
import { RoadRouter, RoadGraph, ROUTE, flattenBridgeRuns, rampEnds } from '../js/road-net.js';

let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const eq = (a, b, m) => ok(a === b, `${m} (${a} === ${b})`);

/** A flat, dry grid with optional blocked / water / steep tiles. */
function makeGrid(n, { blocked = [], water = [], steep = [], roads = [], height = 5 } = {}) {
  const B = new Set(blocked.map(([i, j]) => j * n + i));
  const W = new Set(water.map(([i, j]) => j * n + i));
  const S = new Set(steep.map(([i, j]) => j * n + i));
  const R = new Set(roads.map(([i, j]) => j * n + i));
  return {
    n,
    cellInfo(i, j) {
      const k = j * n + i;
      return {
        blocked: B.has(k), road: R.has(k),
        diff: S.has(k) ? 1.9 : 0.2, maxH: height,
        depth: W.has(k) ? 0.9 : 0,
      };
    },
  };
}

// ------------------------------------------------------------------ 1. straight line
{
  const g = makeGrid(64);
  const r = new RoadRouter(g);
  const p = r.findPath([10, 10], [30, 10]);
  ok(p.ok, 'route on open ground is found');
  eq(p.cells.length, 21, 'straight route has one tile per step');
  eq(p.bridges, 0, 'no bridges on dry ground');
  const flat = p.cells.every(([, j]) => j === 10);
  ok(flat, 'route stays in a straight line across flat ground');
  ok(p.cost > 0 && p.cost < 21 * 2, 'cost is roughly one unit per tile');
}

// ------------------------------------------------------------------ 2. around a building
{
  const n = 64;
  const wall = [];
  for (let j = 8; j <= 24; j++) if (j !== 16) wall.push([20, j]);   // wall with one gap
  const g = makeGrid(n, { blocked: wall });
  const r = new RoadRouter(g);
  const p = r.findPath([10, 16], [30, 16]);
  ok(p.ok, 'route found around a wall of buildings');
  const through = p.cells.filter(([i, j]) => i === 20);
  eq(through.length, 1, 'the route uses the single gap in the wall');
  ok(through[0][1] === 16, 'the gap it uses is the open tile');
  const hitsBuilding = p.cells.some(([i, j]) => wall.some(([wi, wj]) => wi === i && wj === j));
  ok(!hitsBuilding, 'no route tile sits on a building');
}

// ------------------------------------------------------------------ 3. bridge over water
{
  const n = 64;
  const water = [];
  for (let j = 0; j < n; j++) for (let i = 20; i <= 22; i++) water.push([i, j]);   // river, 3 wide
  const g = makeGrid(n, { water });
  const r = new RoadRouter(g);
  const p = r.findPath([10, 20], [30, 20]);
  ok(p.ok, 'route across a river is found');
  eq(p.bridges, 3, 'exactly the river width is bridged');
  ok(p.cost > 3 * ROUTE.bridge * 0.5, 'bridges cost more than plain tiles');
}

// ------------------------------------------------------------------ 4. limits
{
  const n = 64;
  const deep = [];
  for (let j = 0; j < n; j++) for (let i = 20; i <= 22; i++) deep.push([i, j]);
  const gd = makeGrid(n, { water: deep });
  const rd = new RoadRouter(gd, { maxDepth: 0.5 });
  ok(!rd.findPath([10, 20], [30, 20]).ok, 'deep water cannot be bridged');

  const wide = [];
  for (let j = 0; j < n; j++) for (let i = 18; i <= 28; i++) wide.push([i, j]);   // 11 tiles wide
  const gw = makeGrid(n, { water: wide });
  const rw = new RoadRouter(gw);
  ok(!rw.findPath([10, 20], [30, 20]).ok, 'a bridge longer than the limit is refused');

  const steep = [];
  for (let j = 0; j < n; j++) steep.push([20, j]);
  const gs = makeGrid(n, { steep });
  ok(!new RoadRouter(gs).findPath([10, 20], [30, 20]).ok, 'a wall of steep ground blocks the route');
  // ...but a short cliff is walked around
  const gs2 = makeGrid(n, { steep: steep.filter(([, j]) => j > 14) });
  const p2 = new RoadRouter(gs2).findPath([10, 20], [30, 20]);
  ok(p2.ok, 'a route detours around a cliff');
  ok(p2.cells.length > 21, 'the detour is longer than the straight line');
}

// ------------------------------------------------------------------ 5. reuse existing roads
{
  const n = 64;
  const fresh = new RoadRouter(makeGrid(n)).findPath([10, 30], [40, 30]);
  const road = [];
  for (let i = 10; i <= 40; i++) road.push([i, 30]);
  const reuse = new RoadRouter(makeGrid(n, { roads: road })).findPath([10, 30], [40, 30]);
  ok(reuse.cost < fresh.cost * 0.5, 'routing over an existing road is cheaper than building a new one');
  eq(reuse.cells.length, fresh.cells.length, 'same shape when the road is already there');
}

// ------------------------------------------------------------------ 6. determinism + shape
{
  const n = 64;
  const r = new RoadRouter(makeGrid(n, { blocked: [[25, 25], [25, 26], [26, 25]] }));
  const a = r.findPath([10, 10], [40, 40]);
  r.clearCache();
  const b = r.findPath([10, 10], [40, 40]);
  ok(JSON.stringify(a.cells) === JSON.stringify(b.cells), 'the same request gives the same path');
  // a shortest path on a grid turns at most once when nothing is in the way
  let turns = 0;
  for (let k = 2; k < a.cells.length; k++) {
    const [i0, j0] = a.cells[k - 2], [i1, j1] = a.cells[k - 1], [i2, j2] = a.cells[k];
    if ((i1 - i0) !== (i2 - i1) || (j1 - j0) !== (j2 - j1)) turns++;
  }
  ok(turns <= 2, `a clear route is nearly straight (${turns} turns)`);
}

// ------------------------------------------------------------------ 7. graph
{
  const g = new RoadGraph(32);
  for (let i = 2; i <= 10; i++) g.add(i, 5);
  for (let j = 5; j <= 12; j++) g.add(10, j);
  for (let i = 20; i <= 24; i++) g.add(i, 20);       // a separate island
  g.build();
  eq(g.count, 9 + 8 - 1 + 5, 'graph counts every road tile once');
  eq(g.components, 2, 'two separate networks are detected');
  ok(g.connected([2, 5], [10, 12]), 'cells joined by roads are connected');
  ok(!g.connected([2, 5], [22, 20]), 'cells on different networks are not connected');
  const path = g.path([2, 5], [10, 12]);
  ok(path && path.length === 16, `drive path follows the network (${path ? path.length : 'null'} tiles)`);
  ok(!g.path([2, 5], [22, 20]), 'no drive path between disconnected networks');
  g.remove(10, 8);
  ok(!g.connected([2, 5], [10, 12]), 'cutting the road disconnects the network');
}

// ------------------------------------------------------------------ 8. speed
{
  const n = 128;
  const r = new RoadRouter(makeGrid(n));
  const t0 = performance.now();
  const p = r.findPath([2, 2], [125, 125]);
  const ms = performance.now() - t0;
  ok(p.ok, 'long cross-map route is found');
  ok(ms < 80, `cross-map route is fast (${ms.toFixed(1)} ms)`);
}

// ------------------------------------------------------------------ bridge runs
{
  const n = 32;
  const roadY = new Float32Array(n * n);
  const bridges = new Set([10 * n + 10, 10 * n + 11, 10 * n + 12, 20 * n + 20]);
  roadY[10 * n + 10] = 5;
  roadY[10 * n + 11] = 6;
  roadY[10 * n + 12] = 5;
  roadY[20 * n + 20] = 9;
  flattenBridgeRuns(bridges, roadY, n);
  eq(roadY[10 * n + 10], 6, 'a bridge run shares one flat deck height');
  eq(roadY[10 * n + 11], 6, 'the middle of the run keeps that height');
  eq(roadY[10 * n + 12], 6, 'the far end of the run keeps that height');
  eq(roadY[20 * n + 20], 9, 'a separate bridge keeps its own height');
  const flat = [10 * n + 10, 10 * n + 11, 10 * n + 12].every((k) => roadY[k] === roadY[10 * n + 10]);
  ok(flat, 'no step inside a single span');
}

// ------------------------------------------------------------------ bridge ramps
{
  const n = 32;
  const bridges = new Set([10 * n + 10, 10 * n + 11, 10 * n + 12]);
  const roads = new Set([...bridges, 10 * n + 9, 10 * n + 13]);
  const ends = rampEnds(bridges, roads, n);
  eq(ends.length, 2, 'both ends of a three-tile span get an approach ramp');
  ok(ends.every((e) => e.axisX), 'ramps know the span runs along x');
  const lowSides = ends.map((e) => e.di).sort((a, b) => a - b);
  eq(lowSides.join(','), '-1,1', 'each ramp slopes down towards its own ground road');
  const single = rampEnds(new Set([5 * n + 5]), new Set([5 * n + 5, 5 * n + 4]), n);
  eq(single.length, 0, 'a one-tile bridge gets no ramp (no room to slope)');
  const middle = rampEnds(new Set([10 * n + 11]), new Set([10 * n + 11]), n);
  eq(middle.length, 0, 'an isolated bridge tile with no ground road gets no ramp');
  // only one bank has a road: the far end still gets a landing ramp
  const oneSide = rampEnds(bridges, new Set([...bridges, 10 * n + 9]), n);
  eq(oneSide.length, 2, 'a span with a road on one bank still ramps at both ends');
  eq(oneSide.filter((e) => e.hasRoad).length, 1, 'only the bank with a road is a ground ramp');
  const landing = oneSide.find((e) => !e.hasRoad);
  eq(landing.di, 1, 'the open end points away from the span');
}

console.log(fails ? `${fails} FAILURES` : 'ALL ROAD TESTS PASS');
process.exit(fails ? 1 : 0);
