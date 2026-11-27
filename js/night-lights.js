// Warm artificial lights (windows / lamps) that fade in at dusk and off at dawn.
// One THREE.Points draw call; positions come from placed buildings.
import * as THREE from '../vendor/three.module.min.js';
import { CELL } from './config.js';
import { clamp } from './utils.js';

const MAX = 4096;

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,224,170,0.85)');
  grad.addColorStop(0.6, 'rgba(255,180,90,0.22)');
  grad.addColorStop(1, 'rgba(255,160,60,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class NightLights {
  constructor(scene, buildings) {
    this.buildings = buildings;
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAX * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    this.mat = new THREE.PointsMaterial({
      map: glowTexture(),
      size: 1.9,
      sizeAttenuation: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      color: new THREE.Color(1.0, 0.72, 0.42),
      opacity: 0,
      fog: false,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.visible = false;
    this.points.renderOrder = 6;
    scene.add(this.points);
    this.count = 0;
    this.dirty = true;
    buildings.on('change', () => { this.dirty = true; });
  }

  _hash(n) { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); }

  rebuild() {
    let n = 0;
    for (const b of this.buildings.buildings.values()) {
      const hw = (b.w * CELL) * 0.42, hd = (b.d * CELL) * 0.42;
      const spots = 2 + Math.floor(this._hash(b.x * 0.37 + b.z * 0.91) * 3); // 2-4 per building
      for (let s = 0; s < spots && n < MAX; s++) {
        const r1 = this._hash(b.x * 0.73 + b.z * 0.31 + s * 13.1);
        const r2 = this._hash(b.x * 0.13 + b.z * 0.97 + s * 7.7);
        const r3 = this._hash(b.x * 0.55 + b.z * 0.21 + s * 3.9);
        this.pos[n * 3] = b.x + (r1 - 0.5) * 2 * hw;
        this.pos[n * 3 + 1] = b.y + 1.6 + r3 * 3.4;
        this.pos[n * 3 + 2] = b.z + (r2 - 0.5) * 2 * hd;
        n++;
      }
    }
    this.count = n;
    this.points.geometry.setDrawRange(0, n);
    this.points.geometry.attributes.position.needsUpdate = true;
    this.dirty = false;
  }

  /** nightAmt: 0 full day, 1 full night (env.state.nightAmt) */
  update(nightAmt) {
    if (this.dirty && nightAmt > 0.3) this.rebuild();
    // lights switch on through dusk, stay lit all night, fade at dawn
    const op = clamp((nightAmt - 0.3) / 0.45, 0, 1) * 0.85;
    this.mat.opacity = op;
    this.points.visible = op > 0.02 && this.count > 0;
  }
}
