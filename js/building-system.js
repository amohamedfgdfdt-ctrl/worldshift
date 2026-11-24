// Placement rules, instanced rendering of buildings, roads, water sources,
// picking, deletion and (de)serialisation.
import * as THREE from '../vendor/three.module.min.js';
import { CELL, N, VERTS, HALF } from './config.js';
import { Emitter, clamp } from './utils.js';
import { InstanceSet, LodInstanceSet } from './instances.js';
import { TYPES, getGeometry, footprintSize, tintFor, buildFoundation, buildSourceMarker } from './buildings.js';

const cellX = (c) => c * CELL - HALF;

/** Translucent quads that hug the terrain: footprints, selections, road previews. */
export class CellOverlay {
  constructor(field, { color = 0x66ff99, opacity = 0.45, max = 160, order = 8 } = {}) {
    this.field = field;
    this.max = max;
    this.pos = new Float32Array(max * 6 * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setDrawRange(0, 0);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.material = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity, depthWrite: false, fog: false,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.renderOrder = order;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.baseOpacity = opacity;
  }
  setColor(c) { this.material.color.set(c); }
  setCells(cells, lift = 0.12) {
    const h = this.field.h;
    let p = 0;
    const n = Math.min(cells.length, this.max);
    for (let k = 0; k < n; k++) {
      const [cx, cz] = cells[k];
      const x0 = cellX(cx), x1 = x0 + CELL, z0 = cellX(cz), z1 = z0 + CELL;
      const a = h[cz * VERTS + cx] + lift, b = h[cz * VERTS + cx + 1] + lift;
      const c = h[(cz + 1) * VERTS + cx] + lift, d = h[(cz + 1) * VERTS + cx + 1] + lift;
      const q = this.pos;
      // (a,c,d) (a,d,b) — same triangulation as the terrain
      q[p++] = x0; q[p++] = a; q[p++] = z0; q[p++] = x0; q[p++] = c; q[p++] = z1; q[p++] = x1; q[p++] = d; q[p++] = z1;
      q[p++] = x0; q[p++] = a; q[p++] = z0; q[p++] = x1; q[p++] = d; q[p++] = z1; q[p++] = x1; q[p++] = b; q[p++] = z0;
    }
    this.mesh.geometry.setDrawRange(0, n * 6);
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.visible = n > 0;
  }
  hide() { this.mesh.visible = false; }
}

// ---------------------------------------------------------------------------

export class BuildingSystem extends Emitter {
  constructor({ scene, field, water, vegetation, windMaterial }) {
    super();
    this.scene = scene; this.field = field; this.water = water; this.vegetation = vegetation;
    this.group = new THREE.Group();
    this.group.name = 'buildings';
    scene.add(this.group);

    this.mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.0 });
    this.sets = {};
    for (const t of Object.values(TYPES)) {
      if (t.special) continue;
      const mat = t.key === 'tree' ? windMaterial : this.mat;
      this.sets[t.key] = new InstanceSet(getGeometry(t.key), mat, t.cap || 100, { name: 'b-' + t.key });
      this.group.add(this.sets[t.key].mesh);
    }
    this.foundations = new InstanceSet(buildFoundation(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }), 900, { name: 'foundations' });
    this.group.add(this.foundations.mesh);
    this.markers = new InstanceSet(buildSourceMarker(), this.mat, 60, { name: 'sources' });
    this.group.add(this.markers.mesh);

    this.occ = new Int32Array(N * N);
    this.buildings = new Map();
    this.roads = new Set();
    this.nextId = 1;
    this.anims = [];
    this.fx = [];
    this.time = 0;

    this._roadDirty = false;
    this.roadMat = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.95, metalness: 0,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide,
    });
    this.roadMesh = new THREE.Mesh(new THREE.BufferGeometry(), this.roadMat);
    this.roadMesh.receiveShadow = true;
    this.roadMesh.frustumCulled = false;
    this.group.add(this.roadMesh);

    this.ringGeo = new THREE.RingGeometry(0.82, 1, 40).rotateX(-Math.PI / 2);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3(1, 1, 1);
    this._up = new THREE.Vector3(0, 1, 0);
  }

  /**
   * Swap the model of a building type (e.g. GLB) and re-add every existing
   * instance. `levels` = [{geometry, material, distance}] (one entry = no LOD).
   */
  replaceModel(key, levels, material) {
    if (!Array.isArray(levels)) levels = [{ geometry: levels, material }];
    const old = this.sets[key];
    const t = TYPES[key];
    const cap = t.cap || 100;
    const fresh = levels.length > 1
      ? new LodInstanceSet(levels, cap, { name: 'b-' + key })
      : new InstanceSet(levels[0].geometry, levels[0].material, cap, { name: 'b-' + key });
    fresh.mesh.castShadow = old.mesh.castShadow;
    const m = new THREE.Matrix4(), c = new THREE.Color();
    for (const id of old.ids) {
      old.getMatrix(id, m);
      old.getColor(id, c);
      fresh.add(id, m, c);
    }
    for (const mesh of old.meshes ?? [old.mesh]) { this.group.remove(mesh); mesh.dispose(); }
    for (const mesh of fresh.meshes ?? [fresh.mesh]) this.group.add(mesh);
    this.sets[key] = fresh;
    this.emit('modelchanged', key);
  }

  setShadows(on) {
    for (const s of Object.values(this.sets)) s.mesh.castShadow = on;
    this.foundations.mesh.castShadow = on;
    this.markers.mesh.castShadow = on;
  }

  // ------------------------------------------------------------ queries
  inBounds(cx, cz) { return cx >= 0 && cz >= 0 && cx < N && cz < N; }
  occAt(cx, cz) { return this.inBounds(cx, cz) ? this.occ[cz * N + cx] : 1; }

  /** Everything needed to know whether (and where exactly) a building fits. */
  evaluate(key, cx, cz, rot = 0) {
    const t = TYPES[key];
    const { w, d } = footprintSize(t, rot);
    const res = { ok: false, reason: '', w, d, cx, cz, rot, key };
    res.x = cellX(cx) + (w * CELL) / 2; res.z = cellX(cz) + (d * CELL) / 2;
    if (cx < 1 || cz < 1 || cx + w > N - 1 || cz + d > N - 1) { res.reason = 'Outside the buildable area'; return res; }
    const cells = [];
    let blocked = 0;
    for (let j = cz; j < cz + d; j++) for (let i = cx; i < cx + w; i++) {
      cells.push([i, j]);
      const o = this.occ[j * N + i];
      if (o !== 0) blocked = o;
    }
    res.cells = cells;
    let mn = 1e9, mx = -1e9, wet = 0, obst = 0;
    for (let j = cz; j <= cz + d; j++) for (let i = cx; i <= cx + w; i++) {
      const k = j * VERTS + i, h = this.field.h[k];
      mn = Math.min(mn, h); mx = Math.max(mx, h);
      if (this.water.depth[k] > 0.03) wet++;
      if (this.water.obst[k] > 0) obst++;
    }
    res.minH = mn; res.maxH = mx; res.diff = mx - mn;
    res.y = t.foundation === false ? this.field.heightAt(res.x, res.z) : mx;
    res.foundationDepth = t.foundation === false ? 0 : (mx - mn) + 0.5;
    if (blocked > 0) res.reason = 'Space is occupied';
    else if (blocked < 0) res.reason = 'A road is in the way';
    else if (wet > 0) res.reason = 'Cannot build on water';
    else if (obst > 0) res.reason = 'Space is occupied';
    else if (res.diff > t.maxDiff) res.reason = 'Ground is too steep';
    else if (mx > 47) res.reason = 'Too high (snow line)';
    else res.ok = true;
    return res;
  }

  evaluateRoad(cx, cz) {
    const res = { ok: false, reason: '', cx, cz };
    if (cx < 1 || cz < 1 || cx > N - 2 || cz > N - 2) { res.reason = 'Outside the buildable area'; return res; }
    const o = this.occ[cz * N + cx];
    if (o > 0) { res.reason = 'Space is occupied'; return res; }
    if (o < 0) { res.reason = 'Road already here'; res.exists = true; return res; }
    let mn = 1e9, mx = -1e9, wet = 0;
    for (const [i, j] of [[cx, cz], [cx + 1, cz], [cx, cz + 1], [cx + 1, cz + 1]]) {
      const k = j * VERTS + i, h = this.field.h[k];
      mn = Math.min(mn, h); mx = Math.max(mx, h);
      if (this.water.depth[k] > 0.03) wet++;
    }
    if (wet) res.reason = 'Cannot build on water';
    else if (mx - mn > 1.6) res.reason = 'Ground is too steep';
    else if (mx > 47) res.reason = 'Too high (snow line)';
    else res.ok = true;
    return res;
  }

  evaluateSource(i, j) {
    const res = { ok: false, reason: '', i, j };
    if (i < 1 || j < 1 || i > N - 1 || j > N - 1) { res.reason = 'Outside the world'; return res; }
    const k = j * VERTS + i;
    if (this.water.obst[k] > 0) { res.reason = 'Space is occupied'; return res; }
    for (const s of this.water.sources) if (Math.abs(s.i - i) < 2 && Math.abs(s.j - j) < 2) { res.reason = 'Another source is too close'; return res; }
    if (this.water.sources.length >= 40) { res.reason = 'Source limit reached'; return res; }
    res.ok = true;
    return res;
  }

  // ------------------------------------------------------------ buildings
  _compose(b, sy = 1, lift = 0) {
    this._q.setFromAxisAngle(this._up, (b.rot * Math.PI) / 2);
    this._v.set(b.x, b.y + lift, b.z);
    this._s.set(1, sy, 1);
    return this._m.compose(this._v, this._q, this._s);
  }

  place(key, cx, cz, rot = 0, opts = {}) {
    const t = TYPES[key];
    const ev = this.evaluate(key, cx, cz, rot);
    if (!ev.ok && !opts.force) return { ok: false, reason: ev.reason };
    if (opts.force && (ev.reason === 'Outside the buildable area' || ev.reason === 'Space is occupied' || ev.reason === 'A road is in the way')) {
      return { ok: false, reason: ev.reason };
    }
    const id = opts.id ?? this.nextId++;
    this.nextId = Math.max(this.nextId, id + 1);
    const seed = opts.seed ?? Math.floor(Math.random() * 100000);
    const b = {
      id, key, cx, cz, rot, w: ev.w, d: ev.d, x: ev.x, y: ev.y, z: ev.z,
      depth: ev.foundationDepth, seed,
      state: { residents: opts.residents || 0, stored: opts.stored || 0, moveTimer: 0 },
    };
    this.buildings.set(id, b);
    const set = this.sets[key];
    if (set.add(id, this._compose(b), tintFor(t, seed)) < 0) { this.buildings.delete(id); return { ok: false, reason: 'Limit reached for this building' }; }

    if (t.foundation !== false) {
      this._q.identity();
      this._v.set(b.x, b.y - b.depth, b.z);
      this._s.set(b.w * CELL - 0.5, b.depth, b.d * CELL - 0.5);
      this.foundations.add(id, new THREE.Matrix4().compose(this._v, this._q, this._s), new THREE.Color(0.55, 0.54, 0.51));
    }
    for (const [i, j] of ev.cells) this.occ[j * N + i] = id;
    if (t.solid !== false) this.water.setObstacle(cx, cz, cx + b.w, cz + b.d, 6);
    if (t.kind === 'tank') {
      const sink = this.water.addSink(cx + (b.w >> 1), cz + (b.d >> 1), 3, 14, t.capacity, b.state.stored);
      b.sinkId = sink.id;
    }
    this.vegetation.clearArea(cellX(cx) - 1.5, cellX(cz) - 1.5, cellX(cx) + b.w * CELL + 1.5, cellX(cz) + b.d * CELL + 1.5);

    if (!opts.silent) {
      this.anims.push({ id, t0: this.time, dur: 0.5, kind: 'place' });
      this.spawnFx(b.x, b.y, b.z, Math.max(b.w, b.d) * CELL * 0.62);
    }
    this.emit('change', { type: 'place', id });
    return { ok: true, building: b };
  }

  remove(id) {
    const b = this.buildings.get(id);
    if (!b) return false;
    const t = TYPES[b.key];
    this.sets[b.key].remove(id);
    this.foundations.remove(id);
    for (let j = b.cz; j < b.cz + b.d; j++) for (let i = b.cx; i < b.cx + b.w; i++) this.occ[j * N + i] = 0;
    this.buildings.delete(id);
    if (b.sinkId) this.water.removeSink(b.sinkId);
    if (t.solid !== false) this._recomputeObstacles(b.cx, b.cz, b.cx + b.w, b.cz + b.d);
    this.anims = this.anims.filter((a) => a.id !== id);
    this.spawnFx(b.x, b.y, b.z, Math.max(b.w, b.d) * CELL * 0.5);
    this.emit('change', { type: 'remove', id });
    return true;
  }

  _recomputeObstacles(i0, j0, i1, j1) {
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      let solid = false;
      for (const [ci, cj] of [[i - 1, j - 1], [i, j - 1], [i - 1, j], [i, j]]) {
        if (ci < 0 || cj < 0 || ci >= N || cj >= N) continue;
        const o = this.occ[cj * N + ci];
        if (o > 0 && TYPES[this.buildings.get(o).key].solid !== false) solid = true;
      }
      this.water.setObstacle(i, j, i, j, solid ? 6 : 0);
    }
  }

  // ------------------------------------------------------------ roads
  placeRoad(cx, cz, silent = false) {
    const ev = this.evaluateRoad(cx, cz);
    if (!ev.ok) return ev;
    this.occ[cz * N + cx] = -1;
    this.roads.add(cz * N + cx);
    this._roadDirty = true;
    this.vegetation.clearArea(cellX(cx), cellX(cz), cellX(cx) + CELL, cellX(cz) + CELL);
    if (!silent) this.emit('change', { type: 'road' });
    return ev;
  }
  removeRoad(cx, cz) {
    if (this.occ[cz * N + cx] !== -1) return false;
    this.occ[cz * N + cx] = 0;
    this.roads.delete(cz * N + cx);
    this._roadDirty = true;
    this.emit('change', { type: 'road' });
    return true;
  }

  _rebuildRoads() {
    this._roadDirty = false;
    const pos = [], col = [], nor = [];
    const f = this.field;
    const dark = [0.045, 0.047, 0.052], curb = [0.34, 0.34, 0.33], line = [0.62, 0.55, 0.22];
    const Y = (x, z, o) => f.heightAt(x, z) + o;
    const quad = (p, c) => {
      const tri = (a, b, d) => { for (const q of [a, b, d]) { pos.push(q[0], q[1], q[2]); nor.push(0, 1, 0); col.push(c[0], c[1], c[2]); } };
      tri(p[0], p[2], p[1]); tri(p[0], p[3], p[2]);
    };
    const has = (i, j) => i >= 0 && j >= 0 && i < N && j < N && this.occ[j * N + i] === -1;
    for (const idx of this.roads) {
      const cx = idx % N, cz = Math.floor(idx / N);
      const x0 = cellX(cx), z0 = cellX(cz), x1 = x0 + CELL, z1 = z0 + CELL;
      const hh = f.h;
      const a = hh[cz * VERTS + cx], b = hh[cz * VERTS + cx + 1], c = hh[(cz + 1) * VERTS + cx], d = hh[(cz + 1) * VERTS + cx + 1];
      const o = 0.05;
      // two triangles identical to the terrain triangulation
      const A = [x0, a + o, z0], B = [x1, b + o, z0], C = [x0, c + o, z1], D = [x1, d + o, z1];
      for (const q of [A, C, D, A, D, B]) { pos.push(...q); nor.push(0, 1, 0); col.push(...dark); }
      const w = 0.22;
      const edge = (ax, az, bx, bz, dx, dz) => {
        const p = [[ax, Y(ax, az, 0.075), az], [bx, Y(bx, bz, 0.075), bz], [bx + dx, Y(bx + dx, bz + dz, 0.075), bz + dz], [ax + dx, Y(ax + dx, az + dz, 0.075), az + dz]];
        quad(p, curb);
      };
      if (!has(cx, cz - 1)) edge(x0, z0, x1, z0, 0, w);
      if (!has(cx, cz + 1)) edge(x0, z1, x1, z1, 0, -w);
      if (!has(cx - 1, cz)) edge(x0, z0, x0, z1, w, 0);
      if (!has(cx + 1, cz)) edge(x1, z0, x1, z1, -w, 0);
      // centre markings toward connected neighbours
      const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, lw = 0.1;
      const seg = (ax, az, bx, bz) => {
        const horiz = az === bz;
        const p = horiz
          ? [[ax, Y(ax, az - lw, 0.09), az - lw], [bx, Y(bx, bz - lw, 0.09), bz - lw], [bx, Y(bx, bz + lw, 0.09), bz + lw], [ax, Y(ax, az + lw, 0.09), az + lw]]
          : [[ax - lw, Y(ax - lw, az, 0.09), az], [ax + lw, Y(ax + lw, az, 0.09), az], [bx + lw, Y(bx + lw, bz, 0.09), bz], [bx - lw, Y(bx - lw, bz, 0.09), bz]];
        quad(horiz ? p : [p[0], p[1], p[2], p[3]], line);
      };
      const n = has(cx, cz - 1), s = has(cx, cz + 1), wv = has(cx - 1, cz), e = has(cx + 1, cz);
      if (n) seg(mx, z0, mx, mz);
      if (s) seg(mx, mz, mx, z1);
      if (wv) seg(x0, mz, mx, mz);
      if (e) seg(mx, mz, x1, mz);
      if (!(n || s || wv || e)) seg(mx - 0.4, mz, mx + 0.4, mz);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.roadMesh.geometry.dispose();
    this.roadMesh.geometry = g;
  }

  // ------------------------------------------------------------ sources
  placeSource(i, j, rate = 8, id = null) {
    const ev = this.evaluateSource(i, j);
    if (!ev.ok && id == null) return ev;
    const s = this.water.addSource(i, j, rate, id);
    const k = j * VERTS + i;
    const m = new THREE.Matrix4().makeTranslation(i * CELL - HALF, this.field.h[k], j * CELL - HALF);
    this.markers.add(s.id, m, new THREE.Color(1, 1, 1));
    this.emit('change', { type: 'source' });
    return { ok: true, source: s };
  }
  removeSource(id) {
    this.water.removeSource(id);
    this.markers.remove(id);
    this.emit('change', { type: 'source' });
  }
  addInitialSource(i, j, rate) { return this.placeSource(i, j, rate, 1000 + this.markers.count); }

  // ------------------------------------------------------------ picking
  pick(raycaster) {
    const meshes = [...Object.values(this.sets).flatMap((s) => s.meshes ?? [s.mesh]), this.markers.mesh];
    const hits = raycaster.intersectObjects(meshes, false);
    if (!hits.length) return null;
    const h = hits[0];
    if (h.object === this.markers.mesh) return { kind: 'source', id: this.markers.idAt(h.instanceId), distance: h.distance };
    const key = h.object.name.slice(2);
    return { kind: 'building', id: this.sets[key].idAt(h.instanceId, h.object), distance: h.distance };
  }

  // ------------------------------------------------------------ info
  floodInfo(b) {
    const m = this.water.maxDepthIn(b.cx - 1, b.cz - 1, b.cx + b.w + 1, b.cz + b.d + 1);
    return { depth: m, label: m > 0.5 ? 'Flooding' : m > 0.03 ? 'Water nearby' : 'Dry' };
  }
  irrigation(b) {
    const ci = b.cx + (b.w >> 1), cj = b.cz + (b.d >> 1);
    let best = 99;
    for (let j = Math.max(0, cj - 8); j <= Math.min(N, cj + 8); j++) for (let i = Math.max(0, ci - 8); i <= Math.min(N, ci + 8); i++) {
      if (this.water.depth[j * VERTS + i] > 0.15) best = Math.min(best, Math.hypot(i - ci, j - cj));
    }
    if (best <= 4) return { label: 'Excellent', dist: best };
    if (best <= 8) return { label: 'Good', dist: best };
    return { label: 'None nearby', dist: best };
  }
  population() { let p = 0; for (const b of this.buildings.values()) p += b.state.residents; return p; }
  structureCount() { let c = 0; for (const b of this.buildings.values()) if (b.key !== 'tree') c++; return c; }
  countOf(key) { let c = 0; for (const b of this.buildings.values()) if (b.key === key) c++; return c; }

  // ------------------------------------------------------------ animation
  spawnFx(x, y, z, r) {
    const m = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: 0xcfd4ff, transparent: true, opacity: 0.7, depthWrite: false, fog: false }));
    m.position.set(x, y + 0.25, z);
    m.renderOrder = 9;
    this.group.add(m);
    this.fx.push({ m, t0: this.time, r });
  }
  pop(id) { this.anims.push({ id, t0: this.time, dur: 0.35, kind: 'pop' }); }

  update(dt) {
    this.time += dt;
    if (this._roadDirty) this._rebuildRoads();
    if (this.anims.length) {
      const keep = [];
      for (const a of this.anims) {
        const b = this.buildings.get(a.id);
        if (!b) continue;
        const t = clamp((this.time - a.t0) / a.dur, 0, 1);
        let sy = 1, lift = 0;
        if (a.kind === 'place') {
          const c1 = 1.7, c3 = c1 + 1, e = 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
          sy = 0.25 + 0.75 * e; lift = (1 - t) * 0.6;
          if (t < 1) lift = 0;
        } else sy = 1 + 0.07 * Math.sin(t * Math.PI);
        this.sets[b.key].setMatrix(a.id, this._compose(b, sy, lift));
        if (t < 1) keep.push(a);
      }
      this.anims = keep;
    }
    if (this.fx.length) {
      const keep = [];
      for (const f of this.fx) {
        const t = (this.time - f.t0) / 0.7;
        if (t >= 1) { this.group.remove(f.m); f.m.material.dispose(); continue; }
        const s = f.r * (0.6 + t * 1.2);
        f.m.scale.set(s, 1, s);
        f.m.material.opacity = 0.7 * (1 - t);
        keep.push(f);
      }
      this.fx = keep;
    }
  }

  // ------------------------------------------------------------ persistence
  clearAll() {
    for (const id of [...this.buildings.keys()]) this.remove(id);
    for (const idx of [...this.roads]) { this.occ[idx] = 0; }
    this.roads.clear(); this._roadDirty = true;
    for (const s of [...this.water.sources]) this.markers.remove(s.id);
    this.water.sources.length = 0;
    this.water.sinks.length = 0;
    this.water.obst.fill(0); this.water.syncGround();
    this.occ.fill(0);
    for (const f of this.fx) { this.group.remove(f.m); f.m.material.dispose(); }
    this.fx = []; this.anims = [];
  }

  serialize() {
    const buildings = [];
    for (const b of this.buildings.values()) {
      const sink = b.sinkId ? this.water.sinks.find((s) => s.id === b.sinkId) : null;
      buildings.push({ k: b.key, cx: b.cx, cz: b.cz, r: b.rot, s: b.seed, res: b.state.residents, st: sink ? Math.round(sink.stored) : 0 });
    }
    return {
      buildings,
      roads: [...this.roads],
      sources: this.water.sources.map((s) => ({ i: s.i, j: s.j, rate: s.rate })),
    };
  }

  load(data) {
    this.clearAll();
    for (const r of data.roads || []) this.placeRoad(r % N, Math.floor(r / N), true);
    for (const b of data.buildings || []) {
      if (!TYPES[b.k]) continue;
      this.place(b.k, b.cx, b.cz, b.r || 0, { silent: true, force: true, seed: b.s, residents: b.res || 0, stored: b.st || 0 });
    }
    for (const s of data.sources || []) this.placeSource(s.i, s.j, s.rate, 2000 + this.markers.count);
    this.emit('change', { type: 'load' });
  }
}
