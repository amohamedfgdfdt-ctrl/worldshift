// Vehicles. Cars are generated from the simulation: they carry residents to work
// and goods from factories and farms, and they only exist where the road network
// actually connects two buildings. Everything is instanced (3 draw calls) and the
// number of cars follows the graphics preset.
import * as THREE from '../vendor/three.module.min.js';
import { CELL, N, HALF } from './config.js';
import { ModelBuilder, hex } from './geometry.js';
import { TYPES } from './buildings.js';

const LANE = 0.78;                 // metres right of the centre line (one lane per direction)
const PALETTE = [0xd8483f, 0x2f6fb5, 0xe6e2d8, 0x33363c, 0xc9a227, 0x4b8f6a, 0x8d5fb0, 0xdcdce0, 0x1f5f8b, 0x9b3d2e];
const CAR_BUDGET = [8, 18, 30];    // graphics presets: low, medium, high/ultra
const CAR_SCALE = 0.92;            // keeps a truck inside its lane between the parapets

function wheels(b, x, z, y, r, w) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    b.cyl(r, r, w, sx * x, y, sz * z, hex(0x1b1b1d), { seg: 10, rz: Math.PI / 2 });
  }
}

function sedanGeometry() {
  const b = new ModelBuilder();
  const body = hex(0xf2f2f2), glass = hex(0x2b3a44), light = hex(0xf6efc9), tail = hex(0xa32a22);
  wheels(b, 0.82, 1.25, 0.05, 0.31, 0.22);
  b.box(1.72, 0.52, 3.9, 0, 0.28, 0, body, { jitter: 0.02 });
  b.box(1.58, 0.44, 1.95, 0, 0.8, -0.1, body, { jitter: 0.02 });
  b.box(1.6, 0.3, 1.75, 0, 0.94, -0.1, glass);
  b.box(1.45, 0.06, 1.5, 0, 1.24, -0.12, body);
  b.box(1.62, 0.16, 0.3, 0, 0.36, 1.94, hex(0x3a3a3c));
  b.box(0.36, 0.16, 0.1, -0.55, 0.62, 1.96, light);
  b.box(0.36, 0.16, 0.1, 0.55, 0.62, 1.96, light);
  b.box(0.3, 0.12, 0.08, -0.6, 0.66, -1.95, tail);
  b.box(0.3, 0.12, 0.08, 0.6, 0.66, -1.95, tail);
  return b.build();
}

function vanGeometry() {
  const b = new ModelBuilder();
  const body = hex(0xf0f0ee), glass = hex(0x2b3a44), light = hex(0xf6efc9), tail = hex(0xa32a22);
  wheels(b, 0.86, 1.5, 0.05, 0.34, 0.24);
  b.box(1.86, 1.35, 4.5, 0, 0.3, 0, body, { jitter: 0.02 });
  b.box(1.9, 0.3, 1.0, 0, 1.6, 1.6, body);
  b.box(1.72, 0.5, 0.14, 0, 1.05, 2.2, glass);
  b.box(0.14, 0.5, 1.2, 0.9, 1.0, 1.5, glass);
  b.box(0.14, 0.5, 1.2, -0.9, 1.0, 1.5, glass);
  b.box(0.4, 0.18, 0.1, -0.6, 0.6, 2.26, light);
  b.box(0.4, 0.18, 0.1, 0.6, 0.6, 2.26, light);
  b.box(0.34, 0.16, 0.08, -0.66, 0.7, -2.26, tail);
  b.box(0.34, 0.16, 0.08, 0.66, 0.7, -2.26, tail);
  return b.build();
}

function truckGeometry() {
  const b = new ModelBuilder();
  const cab = hex(0xe8e4dc), box = hex(0xdfe3e6), glass = hex(0x2b3a44), light = hex(0xf6efc9), tail = hex(0xa32a22);
  wheels(b, 0.95, 2.0, 0.05, 0.42, 0.28);
  wheels(b, 0.95, -1.0, 0.05, 0.42, 0.28);
  b.box(2.0, 1.5, 1.9, 0, 0.34, 1.9, cab, { jitter: 0.02 });
  b.box(1.9, 0.6, 0.14, 0, 1.2, 2.84, glass);
  b.box(2.1, 2.0, 4.0, 0, 0.34, -1.1, box, { jitter: 0.03 });
  b.box(2.06, 0.12, 3.9, 0, 2.34, -1.1, hex(0xb9bec2));
  b.box(0.42, 0.2, 0.1, -0.66, 0.7, 2.86, light);
  b.box(0.42, 0.2, 0.1, 0.66, 0.7, 2.86, light);
  b.box(0.36, 0.16, 0.08, -0.72, 0.8, -3.12, tail);
  b.box(0.36, 0.16, 0.08, 0.72, 0.8, -3.12, tail);
  return b.build();
}

const KINDS = [
  { key: 'sedan', geometry: sedanGeometry, speed: 7.4, weight: 0.6 },
  { key: 'van', geometry: vanGeometry, speed: 6.2, weight: 0.25 },
  { key: 'truck', geometry: truckGeometry, speed: 5.2, weight: 0.15 },
];

export class Traffic {
  constructor(world) {
    this.world = world;
    this.group = new THREE.Group();
    this.group.name = 'traffic';
    world.scene.add(this.group);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.15 });
    this.meshes = KINDS.map((k) => {
      const m = new THREE.InstancedMesh(k.geometry(), mat, 32);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.setColorAt(0, new THREE.Color(1, 1, 1));
      m.instanceColor.setUsage(THREE.DynamicDrawUsage);
      m.count = 0;
      m.frustumCulled = false;
      m.castShadow = true;
      m.receiveShadow = false;
      this.group.add(m);
      return m;
    });
    this.cars = [];
    this.maxCars = CAR_BUDGET[1];
    this.trips = 0;
    this.tripRate = 0;             // trips per game hour, smoothed
    this._acc = 0;
    this._rateAcc = 0;
    this._rateTrips = 0;
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._s = new THREE.Vector3(1, 1, 1);
    this._p = new THREE.Vector3();
    this._col = new THREE.Color();
    world.buildings.on('change', (ev) => {
      if (ev && (ev.type === 'road' || ev.type === 'load' || ev.type === 'place' || ev.type === 'remove')) this._stale = true;
    });
  }

  setDensity(level) { this.maxCars = CAR_BUDGET[Math.max(0, Math.min(2, level | 0))] ?? CAR_BUDGET[1]; }
  setShadows(on) { for (const m of this.meshes) m.castShadow = on; }
  get count() { return this.cars.length; }

  clear() { this.cars.length = 0; for (const m of this.meshes) m.count = 0; }

  /** Buildings that a car can actually reach from the road network. */
  _stops() {
    const bs = this.world.buildings, out = [];
    for (const b of bs.buildings.values()) {
      const t = TYPES[b.key];
      if (!t || t.kind === 'tree') continue;
      const cell = bs.accessCell(b);
      if (!cell) continue;
      out.push({ b, cell, kind: t.kind });
    }
    return out;
  }

  /** Build the drive polyline from one building to another, or null. */
  _plan(from, to) {
    const bs = this.world.buildings;
    const path = bs.net.path(from.cell, to.cell);
    if (!path || path.length < 2) return null;
    const raw = [];
    for (const idx of path) {
      const i = idx % N, j = (idx - i) / N;
      raw.push({ x: (i + 0.5) * CELL - HALF, z: (j + 0.5) * CELL - HALF, y: bs.roadSurface(idx) });
    }
    if (raw.length < 2) return null;
    // right-hand lane offset at every point, both ends included: a car starts,
    // drives and stops inside its own lane and never cuts across the parapet
    // towards the building it is serving.
    const pts = raw.map((p, k) => {
      const a = raw[Math.max(0, k - 1)], b = raw[Math.min(raw.length - 1, k + 1)];
      const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz) || 1;
      return { x: p.x + (dz / d) * LANE, z: p.z - (dx / d) * LANE, y: p.y };
    });
    return pts;
  }

  _spawn(stops, rnd) {
    if (stops.length < 2) return null;
    for (let tries = 0; tries < 6; tries++) {
      const a = stops[(rnd() * stops.length) | 0];
      const b = stops[(rnd() * stops.length) | 0];
      if (a === b) continue;
      const pts = this._plan(a, b);
      if (!pts || pts.length < 3) continue;
      const r = rnd();
      let kind = 0, acc = 0;
      for (let i = 0; i < KINDS.length; i++) { acc += KINDS[i].weight; if (r <= acc) { kind = i; break; } }
      return {
        id: (this._nextId = (this._nextId || 0) + 1),
        kind, pts, seg: 0, t: 0, speed: KINDS[kind].speed * (0.85 + rnd() * 0.3),
        slow: 1, wait: 0, color: PALETTE[(rnd() * PALETTE.length) | 0],
        from: a, to: b, dist: 0,
      };
    }
    return null;
  }

  _replan(car, stops, rnd) {
    const here = car.to;
    if (!here) return false;
    for (let tries = 0; tries < 4; tries++) {
      const to = stops[(rnd() * stops.length) | 0];
      if (to === here) continue;
      const pts = this._plan(here, to);
      if (!pts) continue;
      car.pts = pts; car.seg = 0; car.t = 0; car.from = here; car.to = to; car.wait = 0;
      return true;
    }
    return false;
  }

  update(dt, sim) {
    const bs = this.world.buildings;
    if (this._stale) { this._stale = false; this.clear(); }
    if (!bs.roads.size) { if (this.cars.length) this.clear(); this._sync(); return; }
    const sdt = sim.running ? Math.min(0.25, dt * sim.speed) : 0;
    this._acc += dt;
    if (this._acc > 0.8) {
      this._acc = 0;
      this._manage(sim);
    }
    // move
    for (const c of this.cars) {
      if (c.wait > 0) { c.wait -= sdt; continue; }
      if (sdt <= 0) continue;
      const step = c.speed * c.slow * sdt;
      this._advance(c, step);
    }
    this._separate();
    this._sync();
    // trips per game hour (smoothed, shown in the HUD)
    this._rateAcc += dt;
    if (this._rateAcc > 4) {
      const gh = this._rateAcc * 2 / 60;   // GAME_MIN_PER_SEC = 2 in-game minutes per real second
      this.tripRate = this._rateTrips / Math.max(1e-6, gh);
      this._rateTrips = 0;
      this._rateAcc = 0;
    }
  }

  _advance(c, step) {
    let left = step;
    while (left > 0 && c.seg < c.pts.length - 1) {
      const a = c.pts[c.seg], b = c.pts[c.seg + 1];
      const dx = b.x - a.x, dz = b.z - a.z;
      const len = Math.hypot(dx, dz) || 1e-6;
      const remaining = (1 - c.t) * len;
      if (left < remaining) {
        c.t += left / len;
        c.dist += left;
        left = 0;
      } else {
        left -= remaining;
        c.dist += remaining;
        c.seg++; c.t = 0;
      }
    }
    if (c.seg >= c.pts.length - 1) {
      // arrived
      this.trips++;
      this._rateTrips++;
      const eco = this.world.sim?.economy;
      if (eco) { eco.stats.trips = (eco.stats.trips || 0) + 1; }
      const n = c.pts.length;
      const hx = c.pts[n - 1].x - c.pts[n - 2].x, hz = c.pts[n - 1].z - c.pts[n - 2].z;
      const stops = this._stops();
      if (!this._replan(c, stops, Math.random)) { c.dead = true; return; }
      // if the new trip means turning back on itself, the road ends here: the car
      // finishes and leaves instead of pivoting at the edge of the deck
      const ax = c.pts[1].x - c.pts[0].x, az = c.pts[1].z - c.pts[0].z;
      const d1 = Math.hypot(hx, hz) || 1, d2 = Math.hypot(ax, az) || 1;
      if ((hx * ax + hz * az) / (d1 * d2) < 0.2) c.dead = true;
    }
  }

  /** Simple car-following: slow down behind the car ahead. */
  _separate() {
    const n = this.cars.length;
    if (n < 2) return;
    for (const c of this.cars) c.slow = 1;
    for (let i = 0; i < n; i++) {
      const a = this.cars[i];
      const p = this._pos(a);
      const hx = Math.sin(a.yaw), hz = Math.cos(a.yaw);
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const q = this._pos(this.cars[j]);
        const dx = q.x - p.x, dz = q.z - p.z;
        const ahead = dx * hx + dz * hz;
        if (ahead <= 0.2 || ahead > 6.5) continue;
        const side = Math.abs(dx * hz - dz * hx);
        if (side > 1.5) continue;
        a.slow = Math.min(a.slow, ahead < 3 ? 0.12 : 0.45);
      }
    }
  }

  _pos(c) {
    const p = c.pts[Math.min(c.seg, c.pts.length - 1)];
    const q = c.pts[Math.min(c.seg + 1, c.pts.length - 1)];
    c._px = p.x + (q.x - p.x) * c.t; c._pz = p.z + (q.z - p.z) * c.t; c._py = p.y + (q.y - p.y) * c.t;
    c.yaw = Math.atan2(q.x - p.x, q.z - p.z);
    // nose up or down with the slope (ramps, bridge decks, hills)
    const run = Math.hypot(q.x - p.x, q.z - p.z) || 1e-6;
    const target = -Math.atan2(q.y - p.y, run);
    c.pitch = c.pitch === undefined ? target : c.pitch + (target - c.pitch) * 0.35;
    return { x: c._px, z: c._pz, y: c._py };
  }

  _manage(sim) {
    const eco = sim.economy;
    const s = eco ? eco.s : null;
    const stops = this._stops();
    if (stops.length < 2) { if (this.cars.length) this.clear(); return; }
    const demand = Math.max(0, Math.min(this.maxCars, Math.round((s?.pop || 0) / 9) + (s?.connectedFactories || 0) * 2 + (s?.connectedFarms || 0)));
    while (this.cars.length < demand) {
      const car = this._spawn(stops, Math.random);
      if (!car) break;
      this.cars.push(car);
    }
    if (this.cars.length > demand) {
      // retire the oldest arrivals first
      let over = this.cars.length - demand;
      this.cars = this.cars.filter((c) => (over > 0 && (c.wait > 0 || c.dead) ? (over--, false) : true));
      while (this.cars.length > demand) { this.cars.pop(); }
    }
    this.cars = this.cars.filter((c) => !c.dead);
  }

  _sync() {
    const counts = [0, 0, 0];
    for (const c of this.cars) {
      const p = this._pos(c);
      const m = this.meshes[c.kind], k = counts[c.kind]++;
      if (k >= 32) continue;
      this._e.set(c.pitch || 0, c.yaw, 0, 'YXZ');
      this._q.setFromEuler(this._e);
      this._m.compose(this._p.set(p.x, p.y + 0.02, p.z), this._q, this._s.set(CAR_SCALE, CAR_SCALE, CAR_SCALE));
      m.setMatrixAt(k, this._m);
      this._col.setHex(c.color);
      m.setColorAt(k, this._col);
    }
    this.meshes.forEach((m, i) => {
      m.count = Math.min(32, counts[i]);
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    });
  }

  serialize() { return { trips: this.trips }; }
  load(d = {}) { this.trips = d.trips || 0; this.clear(); }
}
