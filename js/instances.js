// A slot manager on top of THREE.InstancedMesh: add / update / remove by id
// with O(1) swap-removal, so thousands of repeated objects cost one draw call.
import * as THREE from '../vendor/three.module.min.js';

const _white = new THREE.Color(1, 1, 1);

export class InstanceSet {
  constructor(geometry, material, capacity, { castShadow = true, receiveShadow = true, name = '' } = {}) {
    this.capacity = capacity;
    this.mesh = new THREE.InstancedMesh(geometry, material, capacity);
    this.mesh.name = name;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, _white);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.fraction = 1;             // render only a fraction (quality scaling)
    this.mesh.castShadow = castShadow;
    this.mesh.receiveShadow = receiveShadow;
    this.mesh.frustumCulled = false;
    this.mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.mesh.boundingBox = new THREE.Box3(new THREE.Vector3(-1e5, -1e5, -1e5), new THREE.Vector3(1e5, 1e5, 1e5));
    this.ids = [];                 // slot -> id
    this.slotOf = new Map();       // id -> slot
    this._m = new THREE.Matrix4();
    this._c = new THREE.Color();
  }

  get count() { return this.ids.length; }
  _sync() { this.mesh.count = Math.ceil(this.ids.length * this.fraction); }
  setFraction(f) { this.fraction = f; this._sync(); }
  has(id) { return this.slotOf.has(id); }

  add(id, matrix, color = _white) {
    if (this.ids.length >= this.capacity) return -1;
    const slot = this.ids.length;
    this.ids.push(id);
    this.slotOf.set(id, slot);
    this.mesh.setMatrixAt(slot, matrix);
    this.mesh.setColorAt(slot, color);
    this._sync();
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
    return slot;
  }

  setMatrix(id, matrix) {
    const slot = this.slotOf.get(id);
    if (slot === undefined) return;
    this.mesh.setMatrixAt(slot, matrix);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  getMatrix(id, target) {
    const slot = this.slotOf.get(id);
    if (slot === undefined) return null;
    this.mesh.getMatrixAt(slot, target);
    return target;
  }

  remove(id) {
    const slot = this.slotOf.get(id);
    if (slot === undefined) return false;
    const last = this.ids.length - 1;
    if (slot !== last) {
      const lastId = this.ids[last];
      this.mesh.getMatrixAt(last, this._m);
      this.mesh.setMatrixAt(slot, this._m);
      this.mesh.getColorAt(last, this._c);
      this.mesh.setColorAt(slot, this._c);
      this.ids[slot] = lastId;
      this.slotOf.set(lastId, slot);
    }
    this.ids.pop();
    this.slotOf.delete(id);
    this._sync();
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
    return true;
  }

  idAt(instanceId) { return this.ids[instanceId]; }

  getColor(id, target) {
    const slot = this.slotOf.get(id);
    if (slot === undefined) return null;
    this.mesh.getColorAt(slot, target);
    return target;
  }


  clear() {
    this.ids.length = 0;
    this.slotOf.clear();
    this.mesh.count = 0;
  }
}

/**
 * Same interface as InstanceSet, but every instance can live in one of several
 * detail levels (High / Medium / Low), each its own InstancedMesh. Levels are
 * switched by camera distance with hysteresis, a quarter of the instances per
 * call (round-robin). An instance is also hidden (level -1) when its stable
 * random rank is above `fraction` (vegetation density).
 * levels: [{ geometry, material, distance }]  distance = metres at which that
 * level starts to be used (level 0 is always 0).
 */
export class LodInstanceSet {
  constructor(levels, capacity, { castShadow = true, receiveShadow = true, name = '', shadowLevels = 2, cull = null } = {}) {
    this.levels = levels.map((l, i) => ({ ...l, distance: i === 0 ? 0 : l.distance }));
    this.cull = cull;              // { value } metres: instances beyond it are not submitted at all
    this.lodScale = 1;             // multiplies every LOD switch distance (graphics preset)
    this.radius = 1;               // bounding radius of one instance at scale 1 (for frustum tests)
    for (const l of levels) { l.geometry.computeBoundingSphere?.(); this.radius = Math.max(this.radius, l.geometry.boundingSphere?.radius ?? 1); }
    this.stats = { culledDist: 0, culledView: 0 };
    this._sig = NaN;
    this.noCull = false;           // diagnostics: turn instance culling off to measure its effect
    this.capacity = capacity;
    this.shadowLevels = shadowLevels;
    this.sets = this.levels.map((l, i) => new InstanceSet(l.geometry, l.material, capacity, { castShadow: castShadow && i < shadowLevels, receiveShadow, name }));
    this.meshes = this.sets.map((s) => s.mesh);
    this.mesh = this.meshes[0];
    let want = castShadow;
    Object.defineProperty(this.mesh, 'castShadow', {
      configurable: true,
      get: () => want,
      set: (v) => { want = v; this._all = true; this.meshes.forEach((m, i) => { if (i > 0) m.castShadow = v && i < this.shadowLevels; }); },
    });
    // level 0 must still really cast: THREE reads .castShadow, which now returns `want`
    this.fraction = 1;
    this.rec = new Map();          // id -> { level, m, c, rank }
    this._keys = []; this._keysDirty = true; this._cursor = 0; this._all = true;
    this.lastSwaps = 0;
    this._m = new THREE.Matrix4(); this._c = new THREE.Color();
  }

  get count() { return this.rec.size; }
  get ids() { return [...this.rec.keys()]; }
  has(id) { return this.rec.has(id); }
  setFraction(f) { this.fraction = f; this._all = true; }

  static rank(id) { const x = Math.sin(id * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); }

  add(id, matrix, color = _white) {
    if (this.rec.size >= this.capacity) return -1;
    const r = { level: 0, m: matrix.clone(), c: color.clone(), rank: LodInstanceSet.rank(id), why: 0, rad: 1 };
    { const e = r.m.elements; r.rad = this.radius * Math.max(Math.hypot(e[0], e[1], e[2]), Math.hypot(e[4], e[5], e[6]), Math.hypot(e[8], e[9], e[10])); }
    this.rec.set(id, r);
    this._keysDirty = true; this._all = true;
    if (r.rank >= this.fraction) { r.level = -1; return 0; }
    return this.sets[0].add(id, r.m, r.c);
  }

  setMatrix(id, matrix) {
    const r = this.rec.get(id); if (!r) return;
    r.m.copy(matrix);
    if (r.level >= 0) this.sets[r.level].setMatrix(id, r.m);
  }

  getMatrix(id, target) { const r = this.rec.get(id); if (!r) return null; return target.copy(r.m); }
  getColor(id, target) { const r = this.rec.get(id); if (!r) return null; return target.copy(r.c); }

  remove(id) {
    const r = this.rec.get(id); if (!r) return false;
    if (r.level >= 0) this.sets[r.level].remove(id);
    this.rec.delete(id);
    this._keysDirty = true;
    return true;
  }

  idAt(instanceId, mesh) {
    const lvl = mesh ? this.meshes.indexOf(mesh) : 0;
    return this.sets[Math.max(0, lvl)].idAt(instanceId);
  }

  clear() { for (const s of this.sets) s.clear(); this.rec.clear(); this._keysDirty = true; }

  levelCounts() { return this.sets.map((s) => s.count); }

  /**
   * cam: camera position. frustum (optional): THREE.Frustum of the camera.
   * An instance is submitted to the GPU only if it is inside the draw distance
   * and (for sets that cast no shadows) inside the view frustum. Shadow casters
   * are never frustum-culled, because a tree just outside the view still casts
   * its shadow into it. why: 0 visible, 1 distance, 2 outside view, 3 density.
   */
  updateLod(cam, frustum = null) {
    if (!this.rec.size) return;
    if (this._keysDirty) { this._keys = [...this.rec.keys()]; this._keysDirty = false; }
    const n = this._keys.length;
    const useView = !!frustum && !this.mesh.castShadow && !this.noCull;
    // a moved or turned camera changes what is visible: re-examine everything this frame
    let sig = cam.x * 3.1 + cam.y * 5.3 + cam.z * 7.7;
    if (useView) for (const pl of frustum.planes) sig += pl.constant + pl.normal.x * 11 + pl.normal.y * 13 + pl.normal.z * 17;
    if (Math.abs(sig - this._sig) > 0.02 || !(sig === sig)) this._all = true;
    this._sig = sig;
    const per = this._all ? n : Math.ceil(n / 4);
    this._all = false;
    const L = this.levels, last = L.length - 1, sc = this.lodScale;
    const pls = useView ? frustum.planes : null;
    const cullV = this.cull && !this.noCull ? this.cull.value : 1e9;
    this.lastSwaps = 0;
    for (let k = 0; k < per; k++) {
      const id = this._keys[this._cursor++ % n];
      const r = this.rec.get(id); if (!r) continue;
      let want = 0, why = 0;
      if (r.rank >= this.fraction) { want = -1; why = 3; }
      else {
        const e = r.m.elements;
        const d = Math.hypot(e[12] - cam.x, e[13] - cam.y, e[14] - cam.z);
        if (d > cullV * (r.why === 1 ? 0.97 : 1.0)) { want = -1; why = 1; }
        else {
          if (pls) {
            const rad = r.rad * 1.3 + 1.5;   // wind sway + margin
            for (let i = 0; i < 6; i++) {
              const pl = pls[i];
              if (pl.normal.x * e[12] + pl.normal.y * e[13] + pl.normal.z * e[14] + pl.constant < -rad) { want = -1; why = 2; break; }
            }
          }
          if (want === 0) {
            for (let i = 1; i <= last; i++) {
              // hysteresis: leaving a level needs a 10 % margin
              const edge = L[i].distance * sc * (r.level >= i ? 0.9 : 1.1);
              if (d >= edge) want = i;
            }
          }
        }
      }
      r.why = why;
      if (want === r.level) continue;
      if (r.level >= 0) this.sets[r.level].remove(id);
      if (want >= 0 && this.sets[want].add(id, r.m, r.c) < 0) want = -1;
      r.level = want; this.lastSwaps++;
    }
    if (this.lastSwaps) { let a = 0, b = 0; for (const r of this.rec.values()) { if (r.why === 1) a++; else if (r.why === 2) b++; } this.stats.culledDist = a; this.stats.culledView = b; }
  }

  dispose() { for (const m of this.meshes) m.dispose(); }
}
