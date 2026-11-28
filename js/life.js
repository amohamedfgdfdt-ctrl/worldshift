// Living world (Stage I): visible residents who commute along roads between real
// buildings, and farm animals grazing next to farms. All instanced; the per-frame
// cost is a few dozen matrix updates. Movement only advances with the simulation.
import * as THREE from '../vendor/three.module.min.js';
import { CELL, N, HALF } from './config.js';
import { ModelBuilder, hex } from './geometry.js';
import { TYPES } from './buildings.js';

const MAX_PEOPLE = 48, MAX_ANIMALS_PER_FARM = 3, MAX_FARMS = 18;
const DAY_START = 6.2, DAY_END = 20;
const TINTS = [0xcfd8ea, 0xe8b8b0, 0xb8d8b0, 0xe8ddb0, 0xd0c0e0, 0xf0e8da];

function personGeometry() {
  // ~1.4 m villager: same silhouette and budget class as the original box model,
  // but with tapered limbs, joints and a rounded head so close-ups read as a person
  const b = new ModelBuilder();
  const skin = hex(0xd9a680), shirt = hex(0xe8e2d8), pants = hex(0x4a5470), hair = hex(0x33241a), shoe = hex(0x2c2620);
  b.box(0.15, 0.07, 0.24, -0.1, 0, 0.03, shoe);                       // shoes
  b.box(0.15, 0.07, 0.24, 0.1, 0, 0.03, shoe);
  b.cyl(0.07, 0.088, 0.55, -0.1, 0.05, 0, pants, { seg: 8 });        // legs (tapered)
  b.cyl(0.07, 0.088, 0.55, 0.1, 0.05, 0, pants, { seg: 8 });
  b.cyl(0.165, 0.20, 0.52, 0, 0.55, 0, shirt, { seg: 10 });          // torso (tinted per instance)
  b.cyl(0.042, 0.05, 0.40, -0.235, 0.62, 0, shirt, { seg: 7, rz: 0.14 });   // arms, slightly out
  b.cyl(0.042, 0.05, 0.40, 0.235, 0.62, 0, shirt, { seg: 7, rz: -0.14 });
  b.blob(0.048, -0.27, 0.56, 0, skin, { detail: 0, lump: 0.02 });    // hands
  b.blob(0.048, 0.27, 0.56, 0, skin, { detail: 0, lump: 0.02 });
  b.cyl(0.05, 0.055, 0.09, 0, 1.04, 0, skin, { seg: 8 });            // neck
  b.blob(0.135, 0, 1.21, 0, skin, { detail: 1, lump: 0.02, jitter: 0 });  // head
  b.blob(0.14, 0, 1.27, -0.015, hair, { detail: 1, lump: 0.03, sy: 0.62, jitter: 0 });  // hair cap
  return b.build();
}
function cowGeometry() {
  const b = new ModelBuilder();
  const hide = hex(0xe6e0d6), dark = hex(0x40332a), patch = hex(0x6b4d33), muzzle = hex(0xc9a68c), horn = hex(0xd8cdb8);
  for (const [x, z] of [[-0.32, -0.18], [0.32, -0.18], [-0.32, 0.18], [0.32, 0.18]])
    b.cyl(0.045, 0.06, 0.46, x, 0, z, dark, { seg: 7 });             // legs
  b.box(0.95, 0.55, 0.5, 0, 0.42, 0, hide, { jitter: 0.04 });        // body
  b.box(0.4, 0.3, 0.51, -0.15, 0.55, 0, patch, { jitter: 0.05 });    // patch
  b.box(0.3, 0.3, 0.3, 0, 0.62, 0.42, hex(0x806147));                // head
  b.box(0.22, 0.14, 0.16, 0, 0.58, 0.58, muzzle);                    // muzzle
  b.box(0.1, 0.06, 0.16, -0.2, 0.82, 0.4, patch, { rz: 0.5 });       // ears
  b.box(0.1, 0.06, 0.16, 0.2, 0.82, 0.4, patch, { rz: -0.5 });
  b.cone(0.03, 0.14, -0.1, 0.9, 0.42, horn, { seg: 6 });             // horns
  b.cone(0.03, 0.14, 0.1, 0.9, 0.42, horn, { seg: 6 });
  b.cyl(0.02, 0.03, 0.4, 0, 0.5, -0.28, dark, { seg: 6, rx: 0.5 });  // tail
  b.blob(0.09, 0, 0.34, -0.12, hex(0xd9b8a8), { detail: 0, lump: 0.03 });  // udder
  return b.build();
}
function sheepGeometry() {
  const b = new ModelBuilder();
  const wool = hex(0xf0ebde), face = hex(0x38332e), leg = hex(0x332e29);
  for (const [x, z] of [[-0.2, -0.13], [0.2, -0.13], [-0.2, 0.13], [0.2, 0.13]])
    b.cyl(0.032, 0.042, 0.34, x, 0, z, leg, { seg: 6 });
  b.blob(0.36, 0, 0.56, 0, wool, { detail: 1, lump: 0.09 });         // fleece
  b.blob(0.13, 0, 0.5, 0.36, face, { detail: 1, lump: 0.03 });       // head
  b.box(0.05, 0.04, 0.12, -0.1, 0.56, 0.38, face, { rz: 0.6 });      // ears
  b.box(0.05, 0.04, 0.12, 0.1, 0.56, 0.38, face, { rz: -0.6 });
  b.blob(0.07, 0, 0.62, -0.32, wool, { detail: 0, lump: 0.05 });     // tail puff
  return b.build();
}
function chickenGeometry() {
  const b = new ModelBuilder();
  const feather = hex(0xeee6d9), legC = hex(0xcc9933), comb = hex(0xcc261a), beak = hex(0xe8963a);
  b.cyl(0.014, 0.018, 0.15, -0.05, 0, 0, legC, { seg: 5 });
  b.cyl(0.014, 0.018, 0.15, 0.05, 0, 0, legC, { seg: 5 });
  b.blob(0.14, 0, 0.26, 0, feather, { detail: 1, lump: 0.05, sy: 1.05, sz: 1.25 });  // body
  b.blob(0.075, 0, 0.42, 0.15, feather, { detail: 1, lump: 0.03 });  // head
  b.cone(0.028, 0.08, 0, 0.4, 0.24, beak, { seg: 6, rx: 1.35 });     // beak
  b.box(0.05, 0.07, 0.03, 0, 0.47, 0.13, comb);                      // comb
  b.box(0.03, 0.05, 0.04, 0, 0.35, 0.2, comb);                       // wattle
  b.box(0.1, 0.16, 0.05, 0, 0.3, -0.17, feather, { rx: -0.55 });     // tail
  return b.build();
}

export class Life {
  constructor(world) {
    this.world = world;
    this.group = new THREE.Group();
    this.group.name = 'life';
    world.scene.add(this.group);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
    this.peopleMesh = new THREE.InstancedMesh(personGeometry(), mat, MAX_PEOPLE);
    this.peopleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.peopleMesh);
    this.animalMeshes = ['cow', 'sheep', 'chicken'].map((k) => {
      const m = new THREE.InstancedMesh([cowGeometry, sheepGeometry, chickenGeometry][['cow', 'sheep', 'chicken'].indexOf(k)](), mat, MAX_FARMS * MAX_ANIMALS_PER_FARM);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.group.add(m);
      return m;
    });
    this.people = [];
    this.animals = [];
    this._dirty = true;
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._s = new THREE.Vector3(1, 1, 1);
    this._p = new THREE.Vector3();
    this._t = 0;
    world.buildings.on('change', () => { this._dirty = true; });
  }

  // ------------------------------------------------------------ world relations
  _refresh() {
    this._dirty = false;
    const bs = this.world.buildings;
    this.homes = []; this.workplaces = []; this.farms = [];
    for (const b of bs.buildings.values()) {
      const t = TYPES[b.key];
      if (t?.kind === 'house') this.homes.push(b);
      else if (t?.kind === 'factory' || t?.kind === 'tank' || t?.kind === 'power') this.workplaces.push(b);
      if (t?.kind === 'farm') this.farms.push(b);
    }
    // people: one agent per ~2 residents, capped
    const pop = Math.floor(this.world.sim?.economy?.s?.pop ?? 0);
    const want = Math.min(MAX_PEOPLE, Math.max(this.homes.length ? 6 : 0, Math.ceil(pop / 2)));
    while (this.people.length < want) this.people.push(this._newPerson(this.people.length));
    this.people.length = Math.min(this.people.length, want);
    // animals: a small herd per farm, species rotating per farm
    this.animals = [];
    const species = ['cow', 'sheep', 'chicken'];
    this.farms.slice(0, MAX_FARMS).forEach((f, fi) => {
      for (let k = 0; k < MAX_ANIMALS_PER_FARM; k++) {
        this.animals.push({
          sp: species[(fi + k) % 3], farm: f,
          x: f.x + Math.cos((fi * 3 + k) * 2.1) * (7.5 + k), z: f.z + Math.sin((fi * 3 + k) * 2.1) * (7.5 + k),
          tx: 0, tz: 0, pause: Math.random() * 3, yaw: Math.random() * 6.28, phase: Math.random() * 6.28,
        });
      }
    });
    for (const a of this.animals) { a.tx = a.x; a.tz = a.z; }
  }

  _newPerson(i) {
    const home = this.homes.length ? this.homes[i % this.homes.length] : null;
    const rx = (3.2 + Math.random() * 2) * (Math.random() < 0.5 ? -1 : 1), rz = (3.2 + Math.random() * 2) * (Math.random() < 0.5 ? -1 : 1);
    const x = home ? home.x + rx : 0, z = home ? home.z + rz : 0;
    return { home, x, z, path: null, seg: 0, idle: Math.random() * 4, speed: 1.1 + Math.random() * 0.5, yaw: 0, phase: Math.random() * 6.28, tint: new THREE.Color(TINTS[i % TINTS.length]) };
  }

  // road helpers: walk the road network when it connects the endpoints
  _nearestRoad(x, z, maxR = 7) {
    const bs = this.world.buildings;
    const ci = Math.round((x + HALF) / CELL - 0.5), cj = Math.round((z + HALF) / CELL - 0.5);
    for (let r = 0; r <= maxR; r++) {
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const i = ci + di, j = cj + dj;
        if (i >= 0 && j >= 0 && i < N && j < N && bs.roads.has(j * N + i)) return [i, j];
      }
    }
    return null;
  }
  _roadPath(a, b) {
    if (!a || !b) return null;
    const bs = this.world.buildings;
    const key = (i, j) => j * N + i;
    const open = [[0, a]];
    const g = new Map([[key(...a), 0]]);
    const from = new Map();
    const h = (c) => Math.abs(c[0] - b[0]) + Math.abs(c[1] - b[1]);
    let iter = 0;
    while (open.length && iter++ < 6000) {
      let bi = 0;
      for (let k = 1; k < open.length; k++) if (open[k][0] < open[bi][0]) bi = k;
      const [, cur] = open.splice(bi, 1)[0];
      if (cur[0] === b[0] && cur[1] === b[1]) {
        const cells = [cur];
        let c = cur;
        while (from.has(key(...c))) { c = from.get(key(...c)); cells.push(c); }
        cells.reverse();
        return cells.map(([i, j]) => [(i + 0.5) * CELL - HALF, (j + 0.5) * CELL - HALF]);
      }
      const gc = g.get(key(...cur));
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = [cur[0] + di, cur[1] + dj];
        if (n[0] < 0 || n[1] < 0 || n[0] >= N || n[1] >= N || !bs.roads.has(key(...n))) continue;
        const ng = gc + 1;
        if (ng < (g.get(key(...n)) ?? Infinity)) {
          g.set(key(...n), ng);
          from.set(key(...n), cur);
          open.push([ng + h(n), n]);
        }
      }
    }
    return null;
  }

  _planTrip(p) {
    const spots = this.workplaces.length ? this.workplaces.concat(this.homes) : this.homes;
    if (!spots.length || !p.home) { p.path = null; return; }
    const dst = spots[(Math.random() * spots.length) | 0];
    if (dst === p.home && Math.random() < 0.5) { p.idle = 2 + Math.random() * 4; return; }
    const a = this._nearestRoad(p.x, p.z), b = this._nearestRoad(dst.x, dst.z);
    const road = this._roadPath(a, b);
    p.path = [];
    if (road) {
      p.path.push(...road);
      p.path.push([dst.x, dst.z]);
    } else {
      p.path.push([dst.x, dst.z]);   // no roads: straight stroll
    }
    p.seg = 0;
  }

  // ------------------------------------------------------------ per-frame
  update(dt, sim) {
    try { this._update(dt, sim); } catch (e) { window.__lifeErr = String(e && e.stack || e).slice(0, 120); }
  }
  _update(dt, sim) {
    this.world.sim = sim;
    this._sigT = (this._sigT ?? 0) - dt;
    if (this._sigT <= 0) {
      this._sigT = 1;
      let h = 0, w = 0, fa = 0;
      for (const b of this.world.buildings.buildings.values()) {
        const k = TYPES[b.key]?.kind;
        if (k === 'house') h++; else if (k === 'factory' || k === 'tank' || k === 'power') w++; else if (k === 'farm') fa++;
      }
      const sig = h + ',' + w + ',' + fa;
      if (sig !== this._sig) { this._sig = sig; this._dirty = true; }
    }
    if (this._dirty) this._refresh();
    this._t += dt;
    const running = sim.running ? sim.speed : 0;
    const sdt = Math.min(0.25, dt * running);
    const day = sim.hour >= DAY_START && sim.hour <= DAY_END;
    const f = this.world.field;

    // people
    let n = 0;
    for (const p of this.people) {
      const visible = day && p.home;
      if (visible && sdt > 0) {
        if (p.idle > 0) p.idle -= sdt;
        else if (!p.path) this._planTrip(p);
        else {
          const t = p.path[p.seg];
          if (!t) { p.path = null; p.idle = 1.5 + Math.random() * 5; }
          else {
            const dx = t[0] - p.x, dz = t[1] - p.z, d = Math.hypot(dx, dz);
            if (d < 0.4) { p.seg++; }
            else {
              p.yaw = Math.atan2(dx, dz);
              p.x += (dx / d) * p.speed * sdt;
              p.z += (dz / d) * p.speed * sdt;
            }
          }
        }
      }
      const y = f.heightAt(p.x, p.z);
      const bob = visible && p.path ? Math.abs(Math.sin(this._t * 9 + p.phase)) * 0.05 : 0;
      this._e.set(0, p.yaw, 0);
      this._q.setFromEuler(this._e);
      const s = visible ? 1 : 0.0001;
      this._m.compose(this._p.set(p.x, y + bob, p.z), this._q, this._s.set(s, s, s));
      this.peopleMesh.setMatrixAt(n, this._m);
      this.peopleMesh.setColorAt(n, p.tint);
      n++;
    }
    this.peopleMesh.count = n;
    this.peopleMesh.instanceMatrix.needsUpdate = true;
    if (this.peopleMesh.instanceColor) this.peopleMesh.instanceColor.needsUpdate = true;

    // animals: graze around their farm, avoid water
    const counts = [0, 0, 0];
    const spIdx = { cow: 0, sheep: 1, chicken: 2 };
    for (const a of this.animals) {
      if (sdt > 0) {
        if (a.pause > 0) a.pause -= sdt;
        else {
          const dx = a.tx - a.x, dz = a.tz - a.z, d = Math.hypot(dx, dz);
          if (d < 0.3) {
            a.pause = 1 + Math.random() * 4;
            for (let tries = 0; tries < 6; tries++) {
              const ang = Math.random() * 6.28, r = 6.8 + Math.random() * 4;
              const nx = a.farm.x + Math.cos(ang) * r, nz = a.farm.z + Math.sin(ang) * r;
              if (this.world.water.depthAt(nx, nz) < 0.05) { a.tx = nx; a.tz = nz; break; }
            }
          } else {
            a.yaw = Math.atan2(dx, dz);
            const sp = a.sp === 'chicken' ? 0.8 : 0.45;
            a.x += (dx / d) * sp * sdt;
            a.z += (dz / d) * sp * sdt;
          }
        }
      }
      const mi = spIdx[a.sp], mesh = this.animalMeshes[mi], k = counts[mi]++;
      const y = f.heightAt(a.x, a.z);
      this._e.set(0, a.yaw, 0);
      this._q.setFromEuler(this._e);
      this._m.compose(this._p.set(a.x, y, a.z), this._q, this._s.set(1, 1, 1));
      mesh.setMatrixAt(k, this._m);
    }
    this.animalMeshes.forEach((m, i) => { m.count = counts[i]; m.instanceMatrix.needsUpdate = true; });
  }
}
