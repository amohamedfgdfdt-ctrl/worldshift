// Orbit / pan / zoom camera rig with smooth damping, terrain-aware limits.
import * as THREE from '../vendor/three.module.min.js';
import { HALF } from './config.js';
import { clamp } from './utils.js';

const MIN_DIST = 16, MAX_DIST = 400;   // capped so the boundary mountains always fill the horizon
const MIN_PITCH = 0.14, MAX_PITCH = 1.5;

export class CameraRig {
  constructor(aspect, field) {
    this.field = field;
    this.camera = new THREE.PerspectiveCamera(45, aspect, 1, 4200);
    this.groundAt = null;   // optional world-space ground query (terrain + boundary ring), set by World
    this.goal = { target: new THREE.Vector3(), yaw: 0, pitch: 0.7, dist: 220 };
    this.cur = { target: new THREE.Vector3(), yaw: 0, pitch: 0.7, dist: 220 };
    this.raycaster = new THREE.Raycaster();
    this.moving = false;
    this.reset(true);
  }

  defaultView(portrait) {
    return { x: 0, z: 10, yaw: 0.55, pitch: 0.72, dist: portrait ? 330 : 255 };
  }

  reset(immediate = false) {
    const portrait = this.camera.aspect < 0.9;
    const d = this.defaultView(portrait);
    this.goal.target.set(d.x, this.field.heightAt(d.x, d.z), d.z);
    this.goal.yaw = d.yaw; this.goal.pitch = d.pitch; this.goal.dist = d.dist;
    // unwrap yaw so the reset takes the short way round
    const diff = ((this.goal.yaw - this.cur.yaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    this.goal.yaw = this.cur.yaw + diff;
    if (immediate) this._snap();
  }

  _snap() {
    this.cur.target.copy(this.goal.target);
    this.cur.yaw = this.goal.yaw; this.cur.pitch = this.goal.pitch; this.cur.dist = this.goal.dist;
    this.apply();
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 0.9 ? 52 : 45;
    this.camera.updateProjectionMatrix();
  }

  orbit(dx, dy) {
    this.goal.yaw -= dx * 0.0052;
    this.goal.pitch = clamp(this.goal.pitch + dy * 0.0046, MIN_PITCH, MAX_PITCH);
  }

  pan(dx, dy) {
    const g = this.goal;
    const k = (g.dist * 2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2)) / (this._h || 800);
    const sy = Math.sin(g.yaw), cy = Math.cos(g.yaw);
    const fwd = k / Math.max(Math.sin(g.pitch), 0.35);
    g.target.x += -(cy * dx) * k + (-sy * dy) * fwd;
    g.target.z += (sy * dx) * k + (-cy * dy) * fwd;
    this.clampTarget();
  }

  clampTarget() {
    const L = HALF - 4;
    this.goal.target.x = clamp(this.goal.target.x, -L, L);
    this.goal.target.z = clamp(this.goal.target.z, -L, L);
  }

  zoomBy(factor) { this.goal.dist = clamp(this.goal.dist * factor, MIN_DIST, MAX_DIST); }
  rotateBy(rad) { this.goal.yaw += rad; }
  tiltCycle() {
    const presets = [0.32, 0.72, 1.12, 1.45];
    const cur = this.goal.pitch;
    const next = presets.find((p) => p > cur + 0.05) ?? presets[0];
    this.goal.pitch = next;
  }
  moveLocal(rx, rz, amount) {
    // keyboard movement relative to the current heading
    const g = this.goal, sy = Math.sin(g.yaw), cy = Math.cos(g.yaw);
    g.target.x += (cy * rx - sy * rz) * amount;
    g.target.z += (-sy * rx - cy * rz) * amount;
    this.clampTarget();
  }

  update(dt, viewportH) {
    this._h = viewportH;
    const g = this.goal, c = this.cur;
    g.target.y = this.field.heightAt(g.target.x, g.target.z);
    const k = 1 - Math.exp(-dt * 11);
    const before = c.dist + c.yaw * 10 + c.pitch * 10 + c.target.x + c.target.z;
    c.target.lerp(g.target, k);
    c.yaw += (g.yaw - c.yaw) * k;
    c.pitch += (g.pitch - c.pitch) * k;
    c.dist += (g.dist - c.dist) * k;
    this.apply();
    const after = c.dist + c.yaw * 10 + c.pitch * 10 + c.target.x + c.target.z;
    this.moving = Math.abs(after - before) > 0.01;
  }

  apply() {
    const c = this.cur, cam = this.camera;
    const cp = Math.cos(c.pitch);
    cam.position.set(
      c.target.x + Math.sin(c.yaw) * cp * c.dist,
      c.target.y + Math.sin(c.pitch) * c.dist,
      c.target.z + Math.cos(c.yaw) * cp * c.dist,
    );
    const gx = clamp(cam.position.x, -HALF, HALF), gz = clamp(cam.position.z, -HALF, HALF);
    const ground = (this.groundAt ? this.groundAt(cam.position.x, cam.position.z)
      : this.field.heightAt(gx, gz)) + 3.5;
    if (cam.position.y < ground) cam.position.y = ground;
    cam.lookAt(c.target);
    cam.updateMatrixWorld();
  }

  ray(clientX, clientY, rect) {
    const x = ((clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera({ x, y }, this.camera);
    return this.raycaster.ray;
  }
}
