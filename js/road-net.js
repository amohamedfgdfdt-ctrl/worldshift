// Road routing and the road graph that traffic drives on.
//
// Pure logic on purpose: no THREE, no DOM. The world hands in a tiny adapter
// ({ n, cellInfo(i, j) }) so tests/road-test.mjs can exercise the router and the
// graph in Node with a plain grid.
//
// The player only picks a start and an end; the router finds the cheapest legal
// path over the real build grid: it follows the ground, avoids buildings and
// steep slopes, reuses existing roads, and only pays for a bridge where water
// really is the shorter way across.

export const ROUTE = {
  base: 1,           // cost of one new road tile
  reuse: 0.25,       // a tile that already has a road is cheap to route over
  slopeFree: 0.45,   // metres of height range a tile may have for free
  slopeCost: 3.2,    // cost per extra metre of height range
  bridge: 26,        // extra cost of a tile that needs a bridge
  maxDepth: 2.6,     // deeper water cannot be bridged
  maxBridgeRun: 5,   // longest continuous bridge, in tiles
  maxDiff: 1.6,      // steeper ground cannot carry a road (same rule as a single tile)
  snowLine: 47,
  turn: 0.55,        // cost of changing direction: keeps roads straight
  margin: 1,         // keep one cell away from the world edge
  // A* heuristic weight per tile. It matches the cost of a new tile, which keeps
  // the search narrow and fast. Tiles that already carry a road are cheaper than
  // the heuristic assumes, so a reuse-heavy route can come out a tile or two
  // longer than the theoretical optimum; it is still the cheapest route found.
  hWeight: 1,
};

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const RUNS = 6;      // bridge-run states: 0..maxBridgeRun

/** Minimal binary heap (f-score first, state key as payload). */
class Heap {
  constructor() { this.f = []; this.v = []; }
  get size() { return this.f.length; }
  push(f, v) {
    const F = this.f, V = this.v;
    let k = F.length; F.push(f); V.push(v);
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (F[p] <= F[k]) break;
      const tf = F[p], tv = V[p]; F[p] = F[k]; V[p] = V[k]; F[k] = tf; V[k] = tv;
      k = p;
    }
  }
  pop() {
    const F = this.f, V = this.v;
    const top = V[0];
    const lf = F.pop(), lv = V.pop();
    if (F.length) {
      F[0] = lf; V[0] = lv;
      let k = 0;
      for (;;) {
        const l = k * 2 + 1, r = l + 1;
        let m = k;
        if (l < F.length && F[l] < F[m]) m = l;
        if (r < F.length && F[r] < F[m]) m = r;
        if (m === k) break;
        const tf = F[m], tv = V[m]; F[m] = F[k]; V[m] = V[k]; F[k] = tf; V[k] = tv;
        k = m;
      }
    }
    return top;
  }
}

export class RoadRouter {
  constructor(grid, opts = {}) {
    this.g = grid;
    this.n = grid.n;
    this.o = { ...ROUTE, ...opts };
    const cells = this.n * this.n;
    this._flag = new Uint8Array(cells);      // 0 unknown, 1 passable, 2 impassable
    this._cost = new Float32Array(cells);
    this._brg = new Uint8Array(cells);
    this._cgen = new Uint32Array(cells);
    this._obj = new Array(cells);
    this._gen = 0;
    const states = cells * 5 * RUNS;
    this._g = new Float32Array(states);
    this._from = new Int32Array(states);
    this._sgen = new Uint32Array(states);
    this._stateGen = 0;
  }

  clearCache() {
    this._gen++;
    if (this._gen > 0xfffffffe) { this._cgen.fill(0); this._gen = 1; }
  }

  /** Evaluate one tile (cached per generation). Returns null when impassable. */
  _evalK(k) {
    if (this._cgen[k] === this._gen && this._gen !== 0) {
      return this._flag[k] === 1 ? k : null;
    }
    const n = this.n, m = this.o.margin;
    const i = k % n, j = (k - i) / n;
    let okFlag = 2;
    if (i >= m && j >= m && i <= n - 1 - m && j <= n - 1 - m) {
      const c = this.g.cellInfo(i, j);
      if (c && !c.blocked && !(c.maxH > this.o.snowLine) && !(c.diff > this.o.maxDiff)) {
        const bridge = !c.road && c.depth > 0.03;
        if (!bridge || c.depth <= this.o.maxDepth) {
          let cost = c.road ? this.o.reuse : this.o.base;
          if (bridge) cost += this.o.bridge;
          cost += Math.max(0, c.diff - this.o.slopeFree) * this.o.slopeCost;
          this._cost[k] = cost;
          this._brg[k] = bridge ? 1 : 0;
          okFlag = 1;
        }
      }
    }
    this._flag[k] = okFlag;
    this._cgen[k] = this._gen || 1;
    this._obj[k] = okFlag === 1
      ? { ok: true, cost: this._cost[k], bridge: !!this._brg[k], road: false }
      : null;
    return okFlag === 1 ? k : null;
  }

  /** Public per-tile verdict: { ok, cost, bridge, road } or null. */
  _eval(i, j) { return this._evalK(j * this.n + i) === null ? null : this._obj[j * this.n + i]; }

  passable(i, j) { return this._evalK(j * this.n + i) !== null; }

  _h(k, gk) {
    const n = this.n;
    const i = k % n, j = (k - i) / n;
    const gi = gk % n, gj = (gk - gi) / n;
    return (Math.abs(i - gi) + Math.abs(j - gj)) * this.o.hWeight;
  }

  /**
   * Cheapest legal path between two tiles.
   * Returns { ok, cells:[[i,j]...], cost, bridges, length, reason }.
   */
  findPath(start, goal, { maxNodes = 200000 } = {}) {
    const n = this.n;
    const sk = start[1] * n + start[0];
    const gk = goal[1] * n + goal[0];
    if (this._evalK(sk) === null) return { ok: false, reason: 'start', cells: [], cost: 0, bridges: 0, length: 0 };
    if (this._evalK(gk) === null) return { ok: false, reason: 'goal', cells: [], cost: 0, bridges: 0, length: 0 };
    if (sk === gk) return { ok: true, cells: [[start[0], start[1]]], cost: 0, bridges: 0, length: 1 };

    const gen = ++this._stateGen;
    const G = this._g, FROM = this._from, SG = this._sgen;
    const key = (k, dir, run) => ((k * 5 + dir) * RUNS + run);
    const heap = new Heap();
    const startKey = key(sk, 4, 0);
    G[startKey] = 0; SG[startKey] = gen; FROM[startKey] = -1;
    heap.push(this._h(sk, gk), startKey);
    let nodes = 0;
    while (heap.size) {
      const st = heap.pop();
      const run = st % RUNS; const t = (st - run) / RUNS;
      const dir = t % 5; const cell = (t - dir) / 5;
      if (cell === gk) return this._rebuild(FROM, st, gen);
      if (++nodes > maxNodes) break;
      const base = G[st];
      const i = cell % n, j = (cell - i) / n;
      for (let d = 0; d < 4; d++) {
        const ni = i + DIRS[d][0], nj = j + DIRS[d][1];
        if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue;
        const nk = nj * n + ni;
        if (this._evalK(nk) === null) continue;
        const nrun = this._brg[nk] ? run + 1 : 0;
        if (nrun > this.o.maxBridgeRun) continue;
        let step = this._cost[nk];
        if (dir !== 4 && dir !== d) step += this.o.turn;
        const ng = base + step;
        const nst = key(nk, d, nrun);
        if (SG[nst] !== gen || ng < G[nst] - 1e-9) {
          SG[nst] = gen; G[nst] = ng; FROM[nst] = st;
          heap.push(ng + this._h(nk, gk), nst);
        }
      }
    }
    return { ok: false, reason: 'unreachable', cells: [], cost: 0, bridges: 0, length: 0 };
  }

  _rebuild(FROM, endState, gen) {
    const n = this.n;
    const cells = [];
    let st = endState;
    let cost = 0, bridges = 0;
    let guard = 0;
    while (st !== undefined && st >= 0 && guard++ < 40000) {
      const run = st % RUNS; const t = (st - run) / RUNS;
      const dir = t % 5; const cell = (t - dir) / 5;
      const i = cell % n, j = (cell - i) / n;
      if (this._brg[cell]) bridges++;
      cells.push([i, j]);
      const prev = FROM[st];
      st = prev;
    }
    cells.reverse();
    for (let q = 1; q < cells.length; q++) {
      const k = cells[q][1] * n + cells[q][0];
      cost += this._cost[k];
    }
    // a path never revisits a tile; dedupe defensively
    const out = [];
    let prev = null;
    for (const c of cells) {
      if (!prev || prev[0] !== c[0] || prev[1] !== c[1]) out.push(c);
      prev = c;
    }
    void gen;
    return { ok: true, cells: out, cost, bridges, length: out.length };
  }

  /** Nearest tile that satisfies `test(i,j)` within `maxR` rings, or null. */
  nearest(i0, j0, test, maxR = 8) {
    const n = this.n;
    for (let r = 0; r <= maxR; r++) {
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const i = i0 + di, j = j0 + dj;
        if (i < 0 || j < 0 || i >= n || j >= n) continue;
        if (test(i, j)) return [i, j];
      }
    }
    return null;
  }
}

/**
 * The road network as a graph: which tiles carry a road, which component each
 * belongs to, and the shortest drive between two tiles.
 */
export class RoadGraph {
  constructor(n) {
    this.n = n;
    this.cells = new Set();
    this.labels = new Int32Array(n * n).fill(-1);
    this.components = 0;
    this._dirty = true;
  }

  get count() { return this.cells.size; }
  idx(i, j) { return j * this.n + i; }
  has(i, j) { return this.cells.has(j * this.n + i); }
  add(i, j) { this.cells.add(j * this.n + i); this._dirty = true; }
  remove(i, j) { this.cells.delete(j * this.n + i); this._dirty = true; }
  clear() { this.cells.clear(); this.labels.fill(-1); this.components = 0; this._dirty = true; }

  build() {
    const n = this.n, lab = this.labels;
    lab.fill(-1);
    let comp = 0;
    const queue = new Int32Array(n * n);
    for (const start of this.cells) {
      if (lab[start] !== -1) continue;
      let head = 0, tail = 0;
      queue[tail++] = start; lab[start] = comp;
      while (head < tail) {
        const c = queue[head++];
        const i = c % n, j = (c - i) / n;
        for (const [di, dj] of DIRS) {
          const ni = i + di, nj = j + dj;
          if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue;
          const nc = nj * n + ni;
          if (lab[nc] !== -1 || !this.cells.has(nc)) continue;
          lab[nc] = comp; queue[tail++] = nc;
        }
      }
      comp++;
    }
    this.components = comp;
    this._dirty = false;
    return this;
  }

  label(i, j) {
    if (this._dirty) this.build();
    return this.labels[j * this.n + i];
  }

  connected(a, b) {
    if (this._dirty) this.build();
    const la = this.label(a[0], a[1]);
    return la >= 0 && la === this.label(b[0], b[1]);
  }

  /** Shortest drive between two road tiles as a list of cell indices, or null. */
  path(a, b) {
    if (this._dirty) this.build();
    const n = this.n;
    const start = a[1] * n + a[0], goal = b[1] * n + b[0];
    if (!this.cells.has(start) || !this.cells.has(goal)) return null;
    if (start === goal) return [start];
    const prev = new Map([[start, -1]]);
    const queue = [start];
    for (let head = 0; head < queue.length; head++) {
      const c = queue[head];
      const i = c % n, j = (c - i) / n;
      for (const [di, dj] of DIRS) {
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue;
        const nc = nj * n + ni;
        if (prev.has(nc) || !this.cells.has(nc)) continue;
        prev.set(nc, c);
        if (nc === goal) {
          const out = [];
          let k = nc;
          while (k !== -1) { out.push(k); k = prev.get(k); }
          return out.reverse();
        }
        queue.push(nc);
      }
    }
    return null;
  }
}

/**
 * Give every connected run of bridge tiles one flat deck height, so a span reads
 * as a single deck instead of a staircase. `roadY` is a dense n*n array indexed
 * like the build grid; the change is applied in place and also returned.
 */
export function flattenBridgeRuns(bridges, roadY, n) {
  const seen = new Set();
  const inside = (i, j) => i >= 0 && j >= 0 && i < n && j < n;
  for (const start of bridges) {
    if (seen.has(start)) continue;
    const group = [];
    const queue = [start];
    seen.add(start);
    while (queue.length) {
      const idx = queue.pop();
      group.push(idx);
      const i = idx % n, j = (idx - i) / n;
      for (const [di, dj] of DIRS) {
        const ni = i + di, nj = j + dj;
        if (!inside(ni, nj)) continue;
        const nidx = nj * n + ni;
        if (bridges.has(nidx) && !seen.has(nidx)) { seen.add(nidx); queue.push(nidx); }
      }
    }
    let y = 0;
    for (const idx of group) y = Math.max(y, roadY[idx] || 0);
    for (const idx of group) roadY[idx] = y;
  }
  return roadY;
}

/**
 * Bridge-run end tiles that need a sloped approach. An end tile has exactly one
 * bridge neighbour; `di, dj` points out of the span. `hasRoad` says whether a
 * ground road tile sits there (a ground ramp) or the span simply stops (a
 * landing ramp down to the terrain).
 */
export function rampEnds(bridges, roads, n) {
  const out = [];
  const at = (i, j) => (i >= 0 && j >= 0 && i < n && j < n ? j * n + i : -1);
  for (const idx of bridges) {
    const i = idx % n, j = (idx - i) / n;
    let bridgeN = 0;
    const open = [];
    for (const [di, dj] of DIRS) {
      const k = at(i + di, j + dj);
      if (k < 0) continue;
      if (bridges.has(k)) bridgeN++;
      else open.push([di, dj]);
    }
    if (bridgeN !== 1 || !open.length) continue;
    const road = open.find(([di, dj]) => roads.has(at(i + di, j + dj)));
    const [di, dj] = road || open[0];
    out.push({ idx, axisX: di !== 0, di, dj, hasRoad: !!road });
  }
  return out;
}
