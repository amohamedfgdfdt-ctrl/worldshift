// Procedural modelling helpers. Every model is merged into ONE BufferGeometry
// with per-vertex colours so each building type costs a single draw call
// (rendered through InstancedMesh).
import * as THREE from '../vendor/three.module.min.js';

export function hex(c) {
  const col = new THREE.Color();
  col.setHex(c, THREE.SRGBColorSpace);
  return [col.r, col.g, col.b];
}

function hash3(x, y, z) {
  let h = Math.imul(Math.round(x * 997), 374761393) ^ Math.imul(Math.round(y * 991), 668265263) ^ Math.imul(Math.round(z * 983), 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();

export class ModelBuilder {
  constructor() { this.pos = []; this.nor = []; this.col = []; }

  add(geometry, matrix, color, jitter = 0) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    g.applyMatrix4(matrix);
    const p = g.attributes.position.array, n = g.attributes.normal.array;
    for (let i = 0; i < p.length; i += 3) {
      this.pos.push(p[i], p[i + 1], p[i + 2]);
      this.nor.push(n[i], n[i + 1], n[i + 2]);
      const j = jitter ? 1 + (hash3(p[i], p[i + 1], p[i + 2]) - 0.5) * jitter : 1;
      this.col.push(color[0] * j, color[1] * j, color[2] * j);
    }
    g.dispose();
    return this;
  }

  _mat(x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    _e.set(rx, ry, rz);
    _q.setFromEuler(_e);
    return _m.compose(new THREE.Vector3(x, y, z), _q, new THREE.Vector3(sx, sy, sz)).clone();
  }

  /** Box with its BOTTOM at y. */
  box(w, h, d, x, y, z, color, o = {}) {
    return this.add(new THREE.BoxGeometry(w, h, d), this._mat(x, y + h / 2, z, o.rx || 0, o.ry || 0, o.rz || 0), color, o.jitter || 0);
  }
  /** Cylinder / truncated cone with its bottom at y. */
  cyl(rTop, rBot, h, x, y, z, color, o = {}) {
    return this.add(new THREE.CylinderGeometry(rTop, rBot, h, o.seg || 12, 1, o.open || false),
      this._mat(x, y + h / 2, z, o.rx || 0, o.ry || 0, o.rz || 0, o.sx || 1, 1, o.sz || 1), color, o.jitter || 0);
  }
  cone(r, h, x, y, z, color, o = {}) {
    return this.add(new THREE.ConeGeometry(r, h, o.seg || 10, 1),
      this._mat(x, y + h / 2, z, 0, o.ry || 0, 0, o.sx || 1, 1, o.sz || 1), color, o.jitter || 0);
  }
  /** Lumpy sphere (foliage, bushes, rocks). */
  blob(r, x, y, z, color, o = {}) {
    const g = new THREE.IcosahedronGeometry(r, o.detail ?? 1);
    const p = g.attributes.position;
    const amt = o.lump ?? 0.2;
    for (let i = 0; i < p.count; i++) {
      const vx = p.getX(i), vy = p.getY(i), vz = p.getZ(i);
      const l = Math.hypot(vx, vy, vz) || 1;
      const k = 1 + (hash3(vx / r, vy / r, vz / r) - 0.5) * 2 * amt;
      p.setXYZ(i, vx * k, vy * k, vz * k);
      void l;
    }
    g.computeVertexNormals();
    return this.add(g, this._mat(x, y, z, 0, o.ry || 0, 0, o.sx || 1, o.sy || 1, o.sz || 1), color, o.jitter ?? 0.25);
  }
  /** Gable roof prism: span w (x), ridge height h, length d (z); bottom at y. */
  gable(w, h, d, x, y, z, color, o = {}) {
    const g = new THREE.BufferGeometry();
    const a = [-w / 2, 0, -d / 2], b = [w / 2, 0, -d / 2], c = [0, h, -d / 2];
    const a2 = [-w / 2, 0, d / 2], b2 = [w / 2, 0, d / 2], c2 = [0, h, d / 2];
    const v = [];
    const tri = (p, q, r) => v.push(...p, ...q, ...r);
    tri(a2, b2, c2); tri(b, a, c);                       // gables
    tri(a, a2, c2); tri(a, c2, c);                       // left slope
    tri(b2, b, c); tri(b2, c, c2);                       // right slope
    tri(a, b, b2); tri(a, b2, a2);                       // underside
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    g.computeVertexNormals();
    return this.add(g, this._mat(x, y, z, 0, o.ry || 0, 0), color, o.jitter || 0);
  }
  /** Right-angled wedge: low edge at -x, tall edge (h) at +x? -> sawtooth teeth. */
  wedge(w, h, d, x, y, z, color, o = {}) {
    const g = new THREE.BufferGeometry();
    const a = [-w / 2, 0, -d / 2], b = [w / 2, 0, -d / 2], c = [w / 2, h, -d / 2];
    const a2 = [-w / 2, 0, d / 2], b2 = [w / 2, 0, d / 2], c2 = [w / 2, h, d / 2];
    const v = [];
    const tri = (p, q, r) => v.push(...p, ...q, ...r);
    tri(a2, b2, c2); tri(b, a, c);
    tri(a, a2, c2); tri(a, c2, c);          // slope
    tri(b, c, c2); tri(b, c2, b2);          // tall vertical face
    tri(a, b, b2); tri(a, b2, a2);
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    g.computeVertexNormals();
    return this.add(g, this._mat(x, y, z, 0, o.ry || 0, 0), color, o.jitter || 0);
  }
  /** Pyramid (4-sided) roof with footprint w x d. */
  pyramid(w, h, d, x, y, z, color, o = {}) {
    return this.add(new THREE.ConeGeometry(1, 1, 4, 1),
      this._mat(x, y + h / 2, z, 0, Math.PI / 4 + (o.ry || 0), 0, w / Math.SQRT2, h, d / Math.SQRT2), color, o.jitter || 0);
  }
  ring(rOuter, rInner, h, x, y, z, color, seg = 24) {
    // simple tube built from two cylinders is overkill; use a thick flat torus-like disc
    const g = new THREE.CylinderGeometry(rOuter, rOuter, h, seg, 1, true);
    this.add(g, this._mat(x, y + h / 2, z), color);
    const g2 = new THREE.CylinderGeometry(rInner, rInner, h, seg, 1, true);
    g2.scale(-1, 1, 1);
    this.add(g2, this._mat(x, y + h / 2, z), color);
    return this;
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
  }
}
