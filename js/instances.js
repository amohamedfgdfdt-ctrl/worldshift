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

  clear() {
    this.ids.length = 0;
    this.slotOf.clear();
    this.mesh.count = 0;
  }
}
