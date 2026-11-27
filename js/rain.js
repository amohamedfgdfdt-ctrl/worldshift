// Rain / storm streak layer (Stage H): line segments that fall, wrap around and
// follow the camera focus. Intensity 0 hides it completely (no cost).
import * as THREE from '../vendor/three.module.min.js';

const COUNT = 1400, AREA = 120, TOP = 42;

export class Rain {
  constructor(scene) {
    const pos = new Float32Array(COUNT * 2 * 3);
    this._x = new Float32Array(COUNT);
    this._y = new Float32Array(COUNT);
    this._z = new Float32Array(COUNT);
    this._vy = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      this._x[i] = (Math.random() * 2 - 1) * AREA;
      this._y[i] = Math.random() * TOP;
      this._z[i] = (Math.random() * 2 - 1) * AREA;
      this._vy[i] = 30 + Math.random() * 16;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6); // skip recompute
    this.mat = new THREE.LineBasicMaterial({ color: 0xbdd5ec, transparent: true, opacity: 0, depthWrite: false });
    this.lines = new THREE.LineSegments(g, this.mat);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 5;
    this.lines.visible = false;
    scene.add(this.lines);
    this.intensity = 0;
  }

  /** intensity 0..1 (0 = hidden), focus = camera target (THREE.Vector3), wind = 0..~1.6 */
  update(dt, intensity, focus, wind = 0) {
    if (!this.lines.visible && intensity > 0) this.intensity = Math.max(this.intensity, 0.45);
    this.intensity += (intensity - this.intensity) * Math.min(1, dt * 4);
    if (this.intensity < 0.02) { this.lines.visible = false; return; }
    this.lines.visible = true;
    this.mat.opacity = 0.5 * this.intensity;
    this.lines.position.set(focus.x, 0, focus.z);
    const arr = this.lines.geometry.attributes.position.array;
    const drift = wind * 9, groundY = focus.y;
    const len = 1.1 + this.intensity * 0.7;
    for (let i = 0; i < COUNT; i++) {
      this._y[i] -= this._vy[i] * dt;
      this._x[i] += drift * dt;
      if (this._y[i] < groundY - 4) {
        this._y[i] = groundY + TOP * (0.55 + Math.random() * 0.45);
        this._x[i] = (Math.random() * 2 - 1) * AREA;
        this._z[i] = (Math.random() * 2 - 1) * AREA;
      }
      if (this._x[i] > AREA) this._x[i] -= AREA * 2;
      const k = i * 6;
      arr[k] = this._x[i]; arr[k + 1] = this._y[i]; arr[k + 2] = this._z[i];
      arr[k + 3] = this._x[i] - drift * 0.02; arr[k + 4] = this._y[i] + len; arr[k + 5] = this._z[i];
    }
    this.lines.geometry.attributes.position.needsUpdate = true;
  }
}
