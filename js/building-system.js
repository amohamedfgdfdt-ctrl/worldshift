// Placement rules, instanced rendering of buildings, roads, water sources,
// picking, deletion and (de)serialisation.
import * as THREE from '../vendor/three.module.min.js';
import { CELL, N, VERTS, HALF } from './config.js';
import { Emitter, clamp } from './utils.js';
import { InstanceSet, LodInstanceSet } from './instances.js';
import { TYPES, getGeometry, footprintSize, tintFor, buildFoundation, buildSourceMarker } from './buildings.js';
import { RoadRouter, RoadGraph, ROUTE, flattenBridgeRuns as flattenRuns, rampEnds } from './road-net.js';

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
    this.bridges = new Set();          // road tiles that carry a bridge deck
    this.ramps = new Map();            // bridge end tiles that slope down to the ground road
    this.roadY = new Float32Array(N * N);  // road surface height per road tile (cars read this)
    this.net = new RoadGraph(N);       // the drive graph (rebuilt lazily)
    this.router = new RoadRouter({
      n: N,
      cellInfo: (i, j) => {
        const o = this.occ[j * N + i];
        if (o > 0) return { blocked: true };
        const k = j * VERTS + i, h = this.field.h, d = this.water.depth;
        const h0 = h[k], h1 = h[k + 1], h2 = h[k + VERTS], h3 = h[k + VERTS + 1];
        const mx = Math.max(h0, h1, h2, h3), mn = Math.min(h0, h1, h2, h3);
        return {
          blocked: false, road: o === -1, diff: mx - mn, maxH: mx,
          depth: Math.max(d[k], d[k + 1], d[k + VERTS], d[k + VERTS + 1]),
        };
      },
    });
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
    this.crossMesh = new THREE.Mesh(new THREE.BufferGeometry(), this.roadMat);
    this.crossMesh.receiveShadow = true;
    this.crossMesh.frustumCulled = false;
    this.group.add(this.crossMesh);

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
  /**
   * One road tile. `opts.bridge` lifts a deck over water; `opts.silent` skips the
   * change event (used while a whole route is being built).
   */
  placeRoad(cx, cz, silent = false, opts = {}) {
    const idx = cz * N + cx;
    if (this.occ[idx] === -1) return { ok: false, exists: true, reason: 'Road already here', cx, cz };
    const ev = this.evaluateRoad(cx, cz);
    const bridging = !!opts.bridge && (ev.ok || ev.reason === 'Cannot build on water');
    if (!ev.ok && !bridging) return ev;
    this.occ[idx] = -1;
    this.roads.add(idx);
    if (bridging) this.bridges.add(idx);
    this.roadY[idx] = bridging ? this._bridgeY(cx, cz) : this.field.heightAt(cellX(cx) + CELL / 2, cellX(cz) + CELL / 2);
    this.net.add(cx, cz);
    this._roadDirty = true;
    this.vegetation.clearArea(cellX(cx), cellX(cz), cellX(cx) + CELL, cellX(cz) + CELL);
    if (!silent) this.emit('change', { type: 'road' });
    return bridging ? { ...ev, ok: true, bridge: true } : ev;
  }
  removeRoad(cx, cz) {
    const idx = cz * N + cx;
    if (this.occ[idx] !== -1) return false;
    this.occ[idx] = 0;
    this.roads.delete(idx);
    this.bridges.delete(idx);
    this.roadY[idx] = 0;
    this.net.remove(cx, cz);
    this._roadDirty = true;
    this.emit('change', { type: 'road' });
    return true;
  }

  /** Deck height for a bridge tile: above the water surface and the banks. */
  _bridgeY(cx, cz) {
    const d = this.water.depth, h = this.field.h;
    // water surface under this tile (a deck always clears the water it spans)
    let water = -1e9, bank = 1e9, bankN = 0;
    for (const [i, j] of [[cx, cz], [cx + 1, cz], [cx, cz + 1], [cx + 1, cz + 1]]) {
      const k = j * VERTS + i;
      water = Math.max(water, h[k] + d[k]);
    }
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const i = cx + di, j = cz + dj;
      if (!this.inBounds(i, j)) continue;
      const k = j * VERTS + i;
      const nidx = j * N + i;
      const onBridge = this.bridges.has(nidx) && nidx !== cz * N + cx;
      const ry = this.roads.has(nidx) && !this.bridges.has(nidx)
        ? this.field.heightAt(cellX(i) + CELL / 2, cellX(j) + CELL / 2)
        : h[k];
      if (onBridge) continue;
      // the deck lands as close as possible to the lowest bank it meets
      bank = Math.min(bank, ry);
      bankN++;
    }
    if (!bankN) bank = water;
    // over water the deck clears the surface enough for piers and a girder to show
    const wet = water - h[cz * VERTS + cx] > 0.08 || d[cz * VERTS + cx] > 0.08;
    return Math.max(water + (wet ? 0.85 : 0.22), bank + 0.22);
  }

  /** Re-derive every bridge deck from the current water (after a load or a world rebuild). */
  recalcBridges() {
    for (const idx of this.bridges) {
      const cx = idx % N, cz = Math.floor(idx / N);
      this.roadY[idx] = this._bridgeY(cx, cz);
    }
    if (this.bridges.size) { this.flattenBridgeRuns(); this.updateRamps(); }
    if (this.bridges.size) this._roadDirty = true;
  }

  /** One flat deck height per connected bridge run, so a span reads as a single deck. */
  flattenBridgeRuns() {
    if (this.bridges.size) flattenRuns(this.bridges, this.roadY, N);
  }

  /**
   * Approach ramps: for each bridge end, slope the first one or two ground road
   * tiles up (or down) to the deck, so the road climbs onto the bridge instead
   * of stopping at a wall. The profile is linear over the whole run.
   */
  updateRamps() {
    this.ramps.clear();
    const MAX_GRADE = 0.09;            // 9%: a car holds its speed on that
    const MAX_RUN = 6;                 // approach tiles at most
    for (const e of rampEnds(this.bridges, this.roads, N)) {
      const deckY = this.roadY[e.idx] || 0;
      const i = e.idx % N, j = Math.floor(e.idx / N);
      const di = e.di, dj = e.dj;
      if (e.hasRoad) {
        const tiles = [];
        for (let d = 1; d <= MAX_RUN; d++) {
          const ni = i + di * d, nj = j + dj * d;
          if (!this.inBounds(ni, nj)) break;
          const nidx = nj * N + ni;
          if (!this.roads.has(nidx) || this.bridges.has(nidx)) break;
          tiles.push({ idx: nidx, i: ni, j: nj });
        }
        if (!tiles.length) continue;
        const outer = tiles[tiles.length - 1];
        const ground = this.field.heightAt(cellX(outer.i) + CELL / 2, cellX(outer.j) + CELL / 2);
        const rise = deckY - ground;
        if (rise < 0.12) continue;
        const need = Math.max(1, Math.min(tiles.length, Math.ceil(rise / (MAX_GRADE * CELL))));
        const foot = this.field.heightAt(cellX(tiles[need - 1].i) + CELL / 2, cellX(tiles[need - 1].j) + CELL / 2);
        const drop = deckY - foot;
        for (let k = 0; k < need; k++) {
          this.ramps.set(tiles[k].idx, {
            axisX: di !== 0, di, dj,
            yHigh: deckY - (k * drop) / need,
            yLow: deckY - ((k + 1) * drop) / need,
            drop, landing: false,
          });
        }
      } else {
        let ground = null;
        for (let d = 1; d <= 3; d++) {
          const oi = i + di * d, oj = j + dj * d;
          if (!this.inBounds(oi, oj)) break;
          if (this.water.depth[(oj + 1) * VERTS + oi] > 0.15) continue;
          ground = this.field.heightAt(cellX(oi) + CELL / 2, cellX(oj) + CELL / 2);
          break;
        }
        if (ground == null) continue;
        const wetHere = this.field.h[(j + 1) * VERTS + (i + 1)] + this.water.depth[(j + 1) * VERTS + (i + 1)];
        ground = Math.max(ground, wetHere + 0.10);
        const rise = deckY - ground;
        if (rise < 0.12) continue;
        this.ramps.set(e.idx, {
          axisX: di !== 0, di, dj,
          yHigh: deckY, yLow: ground + 0.06,
          drop: rise, landing: true,
        });
      }
    }
  }

  /**
   * Pave enough approach road at each bridge end for a gentle ramp: the player
   * asked for a crossing, so the road that reaches it comes with the bridge.
   */
  ensureRampApproaches() {
    const MAX_GRADE = 0.09, MAX_RUN = 6;
    let added = 0;
    for (const e of rampEnds(this.bridges, this.roads, N)) {
      if (!e.hasRoad) continue;
      const i = e.idx % N, j = Math.floor(e.idx / N);
      const deckY = this.roadY[e.idx] || 0;
      let far = 0;
      for (let d = 1; d <= MAX_RUN; d++) {
        const ni = i + e.di * d, nj = j + e.dj * d;
        if (!this.inBounds(ni, nj)) break;
        const nidx = nj * N + ni;
        const isRoad = this.roads.has(nidx);
        if (!isRoad && (this.water.depth[(nj + 1) * VERTS + ni] > 0.15 || this.occ[nidx] !== 0)) break;
        far = d;
      }
      if (!far) continue;
      const fi = i + e.di * far, fj = j + e.dj * far;
      const g = this.field.heightAt(cellX(fi) + CELL / 2, cellX(fj) + CELL / 2);
      const need = Math.max(1, Math.min(far, Math.ceil((deckY - g) / (MAX_GRADE * CELL))));
      for (let d = 1; d <= need; d++) {
        const ni = i + e.di * d, nj = j + e.dj * d;
        const nidx = nj * N + ni;
        if (this.roads.has(nidx)) continue;
        const r = this.placeRoad(ni, nj, true, {});
        if (!r || r.ok === false) break;
        added++;
      }
    }
    if (added) this._roadDirty = true;
    return added;
  }

  /**
   * A bridge has to land on a road. Where a span ends with no road beyond it,
   * pave the first dry bank tile so the crossing connects instead of stopping.
   */
  ensureBridgeEnds() {
    let added = 0;
    for (let pass = 0; pass < 2; pass++) {
      for (const e of rampEnds(this.bridges, this.roads, N)) {
        if (e.hasRoad) continue;
        const i = e.idx % N, j = Math.floor(e.idx / N);
        let dry = 0;
        for (let d = 1; d <= 5; d++) {
          const ni = i + e.di * d, nj = j + e.dj * d;
          if (!this.inBounds(ni, nj)) break;
          const wet = this.water.depth[(nj + 1) * VERTS + ni] > 0.15;
          if (!wet && dry >= 3) break;   // three dry tiles give the ramp room to be gentle
          const r = this.placeRoad(ni, nj, true, { bridge: wet });
          if (!r || r.ok === false) break;
          added++;
          if (!wet) dry++;
        }
      }
    }
    if (added) this._roadDirty = true;
    return added;
  }

  /** Surface height a car should sit on for a road tile. */
  roadSurface(idx) {
    const r = this.ramps.get(idx);
    if (r) return (r.yLow + r.yHigh) / 2;      // middle of the sloped approach
    const y = this.roadY[idx];
    return y || this.field.heightAt(cellX(idx % N) + CELL / 2, cellX(Math.floor(idx / N)) + CELL / 2);
  }

  /** Slope profile of a ramp tile at t (0 = ground end, 1 = deck end). */
  rampHeight(idx, t) {
    const r = this.ramps.get(idx);
    if (!r) return this.roadSurface(idx);
    return r.yLow + (r.yHigh - r.yLow) * Math.max(0, Math.min(1, t));
  }

  // ------------------------------------------------------------ auto routes
  /**
   * Route between two tiles without touching the world (preview).
   * Returns { ok, cells, cost, bridges, length, reason }.
   */
  routeCells(a, b) {
    this.router.clearCache();
    return this.router.findPath(a, b);
  }

  /** Build a whole route in one go. Returns the route plus how many tiles landed. */
  buildRoute(a, b, { charge = null } = {}) {
    const r = this.routeCells(a, b);
    if (!r.ok) return { ...r, built: 0 };
    let built = 0, spent = 0, blocked = 0;
    const bridgeSet = new Set();
    for (const [i, j] of r.cells) {
      const idx = j * N + i;
      if (this.occ[idx] === -1) continue;
      const bridge = this.router._eval(i, j)?.bridge;
      if (bridge) bridgeSet.add(idx);
      const cost = charge ? charge(i, j, !!bridge) : 0;
      const res = this.placeRoad(i, j, true, { bridge });
      if (res.ok) { built++; spent += cost; } else blocked++;
    }
    this.net.build();
    this._roadDirty = true;
    const landings = bridgeSet.size ? this.ensureBridgeEnds() : 0;
    if (landings) this.net.build();
    const approaches = bridgeSet.size ? this.ensureRampApproaches() : 0;
    if (approaches) this.net.build();
    if (built || landings || approaches) this.emit('change', { type: 'road' });
    return { ...r, built, blocked, spent, bridgeSet, landings, approaches };
  }

  /** Is a building served by the road network? Returns the access tile or null. */
  accessCell(b) {
    for (let j = b.cz - 1; j <= b.cz + b.d; j++) {
      for (let i = b.cx - 1; i <= b.cx + b.w; i++) {
        const edge = i === b.cx - 1 || i === b.cx + b.w || j === b.cz - 1 || j === b.cz + b.d;
        if (!edge || !this.inBounds(i, j)) continue;
        if (this.occ[j * N + i] === -1) return [i, j];
      }
    }
    return null;
  }
  roadAccessOf(b) { return this.accessCell(b); }

  /** Nearest road tile to a building (for the “connect to road” spur). */
  nearestRoadTile(b, maxR = 10) {
    const ci = b.cx + (b.w >> 1), cj = b.cz + (b.d >> 1);
    return this.router.nearest(ci, cj, (i, j) => this.occ[j * N + i] === -1, maxR);
  }

  /** A building's own access tile: the free tile in front of it closest to `toward`. */
  accessTileFor(b, toward = null) {
    const ring = [];
    for (let j = b.cz - 1; j <= b.cz + b.d; j++) {
      for (let i = b.cx - 1; i <= b.cx + b.w; i++) {
        const edge = i === b.cx - 1 || i === b.cx + b.w || j === b.cz - 1 || j === b.cz + b.d;
        if (!edge || !this.inBounds(i, j)) continue;
        if (this.occ[j * N + i] !== 0) continue;
        ring.push([i, j]);
      }
    }
    if (!ring.length) return null;
    if (!toward) return ring[0];
    let best = ring[0], bd = Infinity;
    for (const c of ring) {
      const d = Math.abs(c[0] - toward[0]) + Math.abs(c[1] - toward[1]);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  /**
   * Ordered crossing runs: each contiguous bridge span plus the approach ramps
   * that hang off its ends. The crossing mesh sweeps one continuous ribbon along
   * these runs, so the road climbs to the deck as a single smooth surface.
   */
  _crossingRuns() {
    const runs = [];
    const seen = new Set();
    const hasB = (i, j) => i >= 0 && j >= 0 && i < N && j < N && this.bridges.has(j * N + i);
    const rowOf = (idx) => Math.floor(idx / N), colOf = (idx) => idx % N;
    for (const start of this.bridges) {
      if (seen.has(start)) continue;
      const group = [];
      const queue = [start];
      seen.add(start);
      while (queue.length) {
        const idx = queue.pop();
        group.push(idx);
        const i = colOf(idx), j = rowOf(idx);
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ni = i + di, nj = j + dj;
          if (!hasB(ni, nj)) continue;
          const k = nj * N + ni;
          if (!seen.has(k)) { seen.add(k); queue.push(k); }
        }
      }
      let axisX = true;
      if (group.length > 1) {
        const a = group[0], ai = colOf(a), aj = rowOf(a);
        axisX = hasB(ai + 1, aj) || hasB(ai - 1, aj);
      } else {
        const r = this.ramps.get(group[0]);
        axisX = r ? r.axisX : true;
      }
      const sorted = group.slice().sort((p, q) => (axisX ? colOf(p) - colOf(q) : rowOf(p) - rowOf(q)));
      const di = axisX ? 1 : 0, dj = axisX ? 0 : 1;
      const side = (fromIdx, step) => {
        const out = [];
        const i0 = colOf(fromIdx), j0 = rowOf(fromIdx);
        for (let d = 1; d <= 8; d++) {
          const i = i0 + di * step * d, j = j0 + dj * step * d;
          if (i < 0 || j < 0 || i >= N || j >= N) break;
          const idx = j * N + i;
          if (!this.ramps.has(idx) || this.bridges.has(idx)) break;
          out.push({ idx, ramp: true });
        }
        return out;
      };
      const chain = [];
      for (const t of side(sorted[0], -1).reverse()) chain.push(t);
      for (const idx of sorted) chain.push({ idx, ramp: false });
      for (const t of side(sorted[sorted.length - 1], 1)) chain.push(t);
      runs.push({ axisX, chain });
    }
    return runs;
  }

  /**
   * One continuous mesh for every crossing: a swept road ribbon whose height
   * follows the ramp profile (rounded at both joins), continuous parapet rails,
   * a box girder under the deck, rounded piers and a grass embankment that
   * blends into the terrain. Returns the tiles it covered.
   */
  _crossingGeometry() {
    const P = [], C = [], I = [];
    const f = this.field;
    const asph = [0.105, 0.108, 0.118], white = [0.80, 0.80, 0.76], line = [0.62, 0.55, 0.22];
    const conc = [0.47, 0.46, 0.44], concD = [0.33, 0.33, 0.32], steel = [0.17, 0.18, 0.20];
    const grass = [0.33, 0.44, 0.21];
    const handled = new Set();
    const push = (p, c) => { P.push(p[0], p[1], p[2]); C.push(c[0], c[1], c[2]); };
    // a grid patch: rows of equal-length point arrays, smooth normals inside the patch
    const patch = (rows, color) => {
      if (!rows.length) return;
      const cols = rows[0].length;
      const base = P.length / 3;
      for (const r of rows) for (const p of r) push(p, color);
      for (let k = 0; k < rows.length - 1; k++) {
        for (let m = 0; m < cols - 1; m++) {
          const a = base + k * cols + m, b = a + 1, c = a + cols, d = c + 1;
          I.push(a, c, b, b, c, d);
        }
      }
    };
    const cyl = (cx, cz, y0, y1, r0, r1, color, segs = 14, cap = true) => {
      const rows = [];
      for (let s = 0; s <= segs; s++) {
        const a = (s / segs) * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a);
        rows.push([[cx + dx * r0, y0, cz + dz * r0], [cx + dx * r1, y1, cz + dz * r1]]);
      }
      patch(rows, color);
      if (cap) {
        const rows2 = [];
        for (let s = 0; s <= segs; s++) {
          const a = (s / segs) * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a);
          rows2.push([[cx, y1, cz], [cx + dx * r1, y1, cz + dz * r1]]);
        }
        patch(rows2, color);
      }
    };

    const wSurf = 1.62, wEdge = 1.90;
    for (const run of this._crossingRuns()) {
      const { axisX, chain } = run;
      const rowOf = (idx) => Math.floor(idx / N), colOf = (idx) => idx % N;
      const j0 = rowOf(chain[0].idx), i0 = colOf(chain[0].idx);
      const zc = cellX(j0) + CELL / 2, xc = cellX(i0) + CELL / 2;
      const SUB = 6;
      const S = [];
      for (const t of chain) {
        handled.add(t.idx);
        const i = colOf(t.idx), j = rowOf(t.idx);
        const u0 = axisX ? cellX(i) : cellX(j);
        const r = this.ramps.get(t.idx);
        const deck = this.roadY[t.idx] || 0;
        for (let s = 0; s < SUB; s++) {
          const frac = s / SUB;
          let y;
          if (r) {
            const dir = axisX ? r.di : r.dj;
            const tt = dir > 0 ? frac : 1 - frac;
            y = r.yLow + (r.yHigh - r.yLow) * tt;
          } else y = deck;
          S.push({ u: u0 + CELL * frac, y, bridge: !r });
        }
      }
      {
        const t = chain[chain.length - 1];
        const i = colOf(t.idx), j = rowOf(t.idx);
        const r = this.ramps.get(t.idx);
        let y;
        if (r) { const dir = axisX ? r.di : r.dj; y = dir > 0 ? r.yHigh : r.yLow; }
        else y = this.roadY[t.idx] || 0;
        S.push({ u: (axisX ? cellX(i) : cellX(j)) + CELL, y, bridge: !r });
      }
      // round the joins at both ends of every ramp (the deck stays flat)
      for (let pass = 0; pass < 3; pass++) {
        const copy = S.map((s) => s.y);
        for (let k = 1; k < S.length - 1; k++) {
          if (S[k].bridge) continue;   // the deck itself stays dead flat
          S[k].y = (copy[k - 1] + 2 * copy[k] + copy[k + 1]) / 4;
        }
      }
      const at = (s, v, dy) => (axisX ? [s.u, s.y + dy, zc + v] : [xc + v, s.y + dy, s.u]);
      const px = (s) => (axisX ? s.u : xc), pz = (s) => (axisX ? zc : s.u);
      const groups = (pred, rowFn, color) => {
        let cur = [];
        for (const s of S) {
          if (pred(s)) { cur.push(rowFn(s)); continue; }
          if (cur.length > 1) patch(cur, color);
          cur = [];
        }
        if (cur.length > 1) patch(cur, color);
      };

      // running surface: asphalt between the shoulders, concrete kerbs outside
      patch(S.map((s) => [at(s, -wSurf, 0.02), at(s, wSurf, 0.02)]), asph);
      patch(S.map((s) => [at(s, -wEdge, 0.0), at(s, -wSurf, 0.02)]), conc);
      patch(S.map((s) => [at(s, wSurf, 0.02), at(s, wEdge, 0.0)]), conc);
      // markings: double yellow centre line and white edge lines, swept with the slope
      patch(S.map((s) => [at(s, -0.17, 0.055), at(s, -0.09, 0.055)]), line);
      patch(S.map((s) => [at(s, 0.09, 0.055), at(s, 0.17, 0.055)]), line);
      for (const sg of [-1, 1]) {
        const v = sg * (wSurf - 0.30);
        patch(S.map((s) => [at(s, v - 0.045, 0.055), at(s, v + 0.045, 0.055)]), white);
      }
      // continuous parapet: inner face, steel cap, outer face - one strip each
      for (const sg of [-1, 1]) {
        const vIn = sg * (wEdge - 0.10), vOut = sg * (wEdge + 0.22);
        patch(S.map((s) => [at(s, vIn, 0.02), at(s, vIn, 0.58)]), conc);
        patch(S.map((s) => [at(s, vIn, 0.58), at(s, vOut, 0.58)]), steel);
        patch(S.map((s) => [at(s, vOut, 0.58), at(s, vOut, -0.16)]), concD);
      }
      // box girder under the deck, only where the deck is clear of the ground
      const high = (s) => s.y - f.heightAt(px(s), pz(s)) > 0.55;
      groups(high, (s) => [at(s, -1.52, -0.14), at(s, -1.20, -0.76)], concD);
      groups(high, (s) => [at(s, 1.20, -0.76), at(s, 1.52, -0.14)], concD);
      groups(high, (s) => [at(s, -1.20, -0.76), at(s, 1.20, -0.76)], concD);
      // grass embankment where the crossing meets the ground, blended into the terrain
      for (const sg of [-1, 1]) {
        const rows = S.map((s) => {
          const ex = axisX ? s.u : xc + sg * (wEdge + 1.35);
          const ez = axisX ? zc + sg * (wEdge + 1.35) : s.u;
          const ty = f.heightAt(ex, ez);
          const top = at(s, sg * (wEdge + 0.02), -0.14);
          const out = axisX ? [s.u, ty - 0.08, ez] : [ex, ty - 0.08, s.u];
          const mid = [(top[0] + out[0]) / 2, (top[1] + out[1]) / 2 + 0.06, (top[2] + out[2]) / 2];
          return { top, mid, out, ty, bridge: s.bridge };
        });
        let cur = [];
        for (const r of rows) {
          if (!r.bridge && r.top[1] - r.ty < 1.9) { cur.push([r.top, r.mid, r.out]); continue; }
          if (cur.length > 1) patch(cur, grass);
          cur = [];
        }
        if (cur.length > 1) patch(cur, grass);
      }
      // rounded, tapered piers with a cap under the girder
      for (const t of chain) {
        if (t.ramp) continue;
        const i = colOf(t.idx), j = rowOf(t.idx);
        const cx = cellX(i) + CELL / 2, cz = cellX(j) + CELL / 2;
        const deck = this.roadY[t.idx] || 0;
        const g0 = f.heightAt(cx, cz);
        if (deck - g0 < 0.70) continue;
        cyl(cx, cz, g0 - 0.45, deck - 0.90, 0.52, 0.40, concD, 14, false);
        cyl(cx, cz, deck - 0.92, deck - 0.74, 0.74, 0.74, conc, 14, true);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    g.setIndex(I);
    g.computeVertexNormals();
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    return { geometry: g, handled };
  }

  _rebuildRoads() {
    this._roadDirty = false;
    if (this.bridges.size) { this.flattenBridgeRuns(); this.updateRamps(); }
    let handled = new Set();
    if (this.bridges.size) {
      const cross = this._crossingGeometry();
      this.crossMesh.geometry.dispose();
      this.crossMesh.geometry = cross.geometry;
      handled = cross.handled;
    } else if (this.crossMesh.geometry.attributes.position) {
      this.crossMesh.geometry.dispose();
      this.crossMesh.geometry = new THREE.BufferGeometry();
    }
    const pos = [], col = [], nor = [];
    const f = this.field;
    const dark = [0.045, 0.047, 0.052], curb = [0.34, 0.34, 0.33], line = [0.62, 0.55, 0.22];
    const Y = (x, z, o) => f.heightAt(x, z) + o;
    const quad = (p, c) => {
      const tri = (a, b, d) => { for (const q of [a, b, d]) { pos.push(q[0], q[1], q[2]); nor.push(0, 1, 0); col.push(c[0], c[1], c[2]); } };
      tri(p[0], p[2], p[1]); tri(p[0], p[3], p[2]);
    };
    const has = (i, j) => i >= 0 && j >= 0 && i < N && j < N && this.occ[j * N + i] === -1;
    // arbitrary-oriented triangle with a computed normal (bridge decks, rails, pillars)
    const triN = (p, c) => {
      const ux = p[1][0] - p[0][0], uy = p[1][1] - p[0][1], uz = p[1][2] - p[0][2];
      const vx = p[2][0] - p[0][0], vy = p[2][1] - p[0][1], vz = p[2][2] - p[0][2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      for (const q of p) { pos.push(q[0], q[1], q[2]); nor.push(nx, ny, nz); col.push(c[0], c[1], c[2]); }
    };
    const face = (p, c) => { triN([p[0], p[1], p[2]], c); triN([p[0], p[2], p[3]], c); };
    const box = (bx, by, bz, bw, bh, bd, c) => {
      const x0 = bx - bw / 2, x1 = bx + bw / 2, y0 = by, y1 = by + bh, z0 = bz - bd / 2, z1 = bz + bd / 2;
      face([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], c);   // top
      face([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], c);   // +z
      face([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], c);   // -z
      face([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], c);   // +x
      face([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], c);   // -x
    };
    const rail = [0.44, 0.42, 0.38], pier = [0.5, 0.48, 0.45];
    for (const idx of this.roads) {
      if (handled.has(idx)) continue;
      const cx = idx % N, cz = Math.floor(idx / N);
      const x0 = cellX(cx), z0 = cellX(cz), x1 = x0 + CELL, z1 = z0 + CELL;
      const hh = f.h;
      const a = hh[cz * VERTS + cx], b = hh[cz * VERTS + cx + 1], c = hh[(cz + 1) * VERTS + cx], d = hh[(cz + 1) * VERTS + cx + 1];
      this.roadY[idx] = f.heightAt((x0 + x1) / 2, (z0 + z1) / 2);
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
      const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, lw = 0.035;
      // double centre line: one lane each way
      const seg = (ax, az, bx, bz) => {
        const horiz = az === bz;
        for (const o of [-0.13, 0.13]) {
          const p = horiz
            ? [[ax, Y(ax, az + o - lw, 0.09), az + o - lw], [bx, Y(bx, bz + o - lw, 0.09), bz + o - lw], [bx, Y(bx, bz + o + lw, 0.09), bz + o + lw], [ax, Y(ax, az + o + lw, 0.09), az + o + lw]]
            : [[ax + o - lw, Y(ax + o - lw, az, 0.09), az], [ax + o + lw, Y(ax + o + lw, az, 0.09), az], [bx + o + lw, Y(bx + o + lw, bz, 0.09), bz], [bx + o - lw, Y(bx + o - lw, bz, 0.09), bz]];
          quad(p, line);
        }
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
    // only the building's own footprint counts: deep water next to it does not flood it
    const m = this.water.maxDepthIn(b.cx, b.cz, b.cx + b.w - 1, b.cz + b.d - 1);
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
    this.roads.clear(); this.bridges.clear(); this.ramps.clear(); this.roadY.fill(0); this.net.clear(); this._roadDirty = true;
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
      bridges: [...this.bridges],
      sources: this.water.sources.map((s) => ({ i: s.i, j: s.j, rate: s.rate })),
    };
  }

  load(data) {
    this.clearAll();
    const bridgeSet = new Set(data.bridges || []);
    for (const r of data.roads || []) {
      this.placeRoad(r % N, Math.floor(r / N), true, { bridge: bridgeSet.has(r) });
    }
    this.recalcBridges();
    this.net.build();
    for (const b of data.buildings || []) {
      if (!TYPES[b.k]) continue;
      this.place(b.k, b.cx, b.cz, b.r || 0, { silent: true, force: true, seed: b.s, residents: b.res || 0, stored: b.st || 0 });
    }
    for (const s of data.sources || []) this.placeSource(s.i, s.j, s.rate, 2000 + this.markers.count);
    this.emit('change', { type: 'load' });
  }
}
