// Interaction modes: select, build, road, water source, pour / drain brushes.
// Owns the placement ghost, footprint overlays, selection and deletion.
import * as THREE from '../vendor/three.module.min.js';
import { CELL, N, VERTS, HALF } from './config.js';
import { Emitter, clamp } from './utils.js';
import { TYPES, getGeometry, footprintSize, buildSourceMarker } from './buildings.js';
import { CellOverlay } from './building-system.js';

const GOOD = 0x6dffb0, BAD = 0xff6b78;

export class Tools extends Emitter {
  constructor(world, controls) {
    super();
    this.world = world; this.controls = controls;
    this.mode = 'select';
    this.gate = null;                // set by the Campaign (costs + locks); null in Sandbox
    this.key = null;               // building key in build mode
    this.rot = 0;
    this.anchor = null;            // road chain start [cx,cz]
    this.pointer = null;           // {x,y,type}
    this.hit = null;               // terrain hit [x,y,z]
    this.eval = null;
    this.selection = null;
    this.brushOn = false;
    this.pourRate = 140;           // m^3/s while the brush is held
    this.brushRadius = 7;
    this.sourceRate = 8;
    this.gridTarget = 0;
    this.gridAlways = false;
    this._cellTimer = 0;
    this.lastTouchCell = null;

    const scene = world.scene;
    this.footprint = new CellOverlay(world.field, { color: GOOD, opacity: 0.42 });
    this.selOverlay = new CellOverlay(world.field, { color: 0xa78bff, opacity: 0.5, order: 9 });
    scene.add(this.footprint.mesh, this.selOverlay.mesh);

    this.ghostMat = new THREE.MeshStandardMaterial({
      color: GOOD, transparent: true, opacity: 0.55, roughness: 0.6, depthWrite: false,
      emissive: new THREE.Color(GOOD), emissiveIntensity: 0.25,
    });
    this.ghost = new THREE.Mesh(new THREE.BufferGeometry(), this.ghostMat);
    this.ghost.visible = false; this.ghost.renderOrder = 10; this.ghost.frustumCulled = false;
    scene.add(this.ghost);
    this.sourceGeo = buildSourceMarker();

    // brush ring (follows the terrain)
    const seg = 56;
    this.ringPos = new Float32Array(seg * 3);
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(this.ringPos, 3));
    rg.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.ringMat = new THREE.LineBasicMaterial({ color: 0x59b6ff, transparent: true, opacity: 0.95, fog: false, depthTest: false });
    this.ring = new THREE.LineLoop(rg, this.ringMat);
    this.ring.visible = false; this.ring.renderOrder = 12; this.ring.frustumCulled = false;
    scene.add(this.ring);

    controls.on('hover', (e) => { this.pointer = e; });
    controls.on('tap', (e) => this.onTap(e));
    controls.on('leave', () => { if (this.pointer?.type === 'mouse') this.pointer = null; });
    controls.on('brushstart', (e) => { this.pointer = { ...e, type: this.pointer?.type || 'touch' }; this.brushOn = true; });
    controls.on('brushmove', (e) => { this.pointer = { ...e, type: this.pointer?.type || 'touch' }; });
    controls.on('brushend', () => { this.brushOn = false; });
    window.addEventListener('keydown', (e) => this._key(e));
    world.buildings.on('change', () => { this._cellTimer = 0; });
  }

  // ---------------------------------------------------------------- modes
  setMode(mode, key = null) {
    const g = this.gate;                                   // Campaign: locked buildings / tools
    if (g && mode !== 'select') {
      const locked = mode === 'build' ? g.isLocked(key) : (mode === 'drain' || mode === 'pour' || mode === 'source') ? g.isLocked(mode, true) : false;
      if (locked) { this.emit('toast', { text: g.lockText(mode === 'build' ? key : mode, mode !== 'build'), kind: 'warn' }); return; }
    }
    if (mode === this.mode && key === this.key) { if (mode !== 'select') return this.cancel(); return; }
    this.mode = mode; this.key = key; this.anchor = null; this.eval = null; this.lastTouchCell = null;
    this.rot = 0;
    this.brushOn = false;
    this.controls.brushMode = mode === 'pour' || mode === 'drain';
    if (mode !== 'select') this.select(null);
    this.footprint.hide(); this.ghost.visible = false; this.ring.visible = false;
    if (mode === 'build') {
      this.ghost.geometry = getGeometry(key);
    } else if (mode === 'source') {
      this.ghost.geometry = this.sourceGeo;
    }
    this.ringMat.color.set(mode === 'drain' ? 0xff9a5a : 0x59b6ff);
    this.gridTarget = (mode === 'build' || mode === 'road' || mode === 'source') ? 1 : (this.gridAlways ? 0.65 : 0);
    // touch: place the ghost in the middle of the screen so it is visible straight away
    if (mode === 'build' || mode === 'road' || mode === 'source') {
      if (!this.pointer || this.pointer.type !== 'mouse') {
        const r = this.world.canvas.getBoundingClientRect();
        this.pointer = { x: r.left + r.width / 2, y: r.top + r.height * 0.45, type: this.pointer?.type || 'touch' };
      }
    }
    this.emit('mode', { mode, key });
  }

  cancel() {
    if (this.mode === 'road' && this.anchor) { this.anchor = null; this.emit('hint', null); return; }
    this.setMode('select');
  }

  rotate() {
    if (this.mode !== 'build') return;
    this.rot = (this.rot + 1) % 4;
  }

  setGridAlways(v) {
    this.gridAlways = v;
    if (this.mode === 'select') this.gridTarget = v ? 0.65 : 0;
  }

  _key(e) {
    if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName || '')) return;
    if (e.code === 'Escape') this.cancel();
    else if (e.code === 'KeyR') this.rotate();
    else if (e.code === 'Delete' || e.code === 'Backspace') this.deleteSelected();
    else if (e.code === 'Enter' && this.mode !== 'select') this.confirm();
  }

  // ---------------------------------------------------------------- picking
  _updateHit() {
    this.hit = null;
    if (!this.pointer) return;
    const rect = this.world.canvas.getBoundingClientRect();
    const ray = this.world.rig.ray(this.pointer.x, this.pointer.y, rect);
    this.hit = this.world.field.raycast(ray.origin.x, ray.origin.y, ray.origin.z, ray.direction.x, ray.direction.y, ray.direction.z);
  }

  _footprintCell() {
    const gx = (this.hit[0] + HALF) / CELL, gz = (this.hit[2] + HALF) / CELL;
    const t = TYPES[this.key];
    const { w, d } = footprintSize(t, this.rot);
    return [Math.round(gx - w / 2), Math.round(gz - d / 2)];
  }

  _linePath(a, b) {
    const path = [];
    const horizFirst = Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]);
    const sx = Math.sign(b[0] - a[0]), sz = Math.sign(b[1] - a[1]);
    let x = a[0], z = a[1];
    path.push([x, z]);
    const stepX = () => { while (x !== b[0]) { x += sx; path.push([x, z]); } };
    const stepZ = () => { while (z !== b[1]) { z += sz; path.push([x, z]); } };
    if (horizFirst) { stepX(); stepZ(); } else { stepZ(); stepX(); }
    return path.slice(0, 150);
  }

  // ---------------------------------------------------------------- per frame
  update(dt) {
    const w = this.world, bs = w.buildings, tu = w.terrain.uniforms;
    // grid fade
    tu.uGrid.value += (this.gridTarget - tu.uGrid.value) * Math.min(1, dt * 9);
    if (tu.uGrid.value < 0.003 && this.gridTarget === 0) tu.uGrid.value = 0;
    if (tu.uGrid.value > 0.01) {
      this._cellTimer -= dt;
      if (this._cellTimer <= 0) { w.refreshCellTexture(); this._cellTimer = 0.35; }
    }

    // selection pulse
    if (this.selOverlay.mesh.visible) this.selOverlay.material.opacity = 0.32 + 0.22 * (0.5 + 0.5 * Math.sin(performance.now() * 0.006));

    const active = this.mode !== 'select';
    if (active) this._updateHit();
    if (!active) { this.ring.visible = false; return; }
    if (!this.hit) { this.footprint.hide(); this.ghost.visible = false; this.ring.visible = false; this.emit('hint', null); return; }
    const hx = this.hit[0], hz = this.hit[2];
    tu.uCursor.value.set(hx, hz);

    if (this.mode === 'build') {
      const [cx, cz] = this._footprintCell();
      const ev = bs.evaluate(this.key, cx, cz, this.rot);
      this.eval = ev;
      this.footprint.setColor(ev.ok ? GOOD : BAD);
      this.footprint.setCells(ev.cells || []);
      this.ghostMat.color.set(ev.ok ? GOOD : BAD);
      this.ghostMat.emissive.set(ev.ok ? GOOD : BAD);
      const g = this.ghost;
      const target = new THREE.Vector3(ev.x, ev.y, ev.z);
      if (!g.visible) g.position.copy(target); else g.position.lerp(target, Math.min(1, dt * 22));
      g.rotation.y = (this.rot * Math.PI) / 2;
      g.visible = true;
      this.emit('hint', { ok: ev.ok, text: ev.ok ? (this.pointer?.type === 'mouse' ? 'Click to place' : 'Tap ✓ to place') : ev.reason });
      tu.uCursor.value.set(ev.x, ev.z);
    } else if (this.mode === 'road') {
      const cell = [Math.floor((hx + HALF) / CELL), Math.floor((hz + HALF) / CELL)];
      const ev = bs.evaluateRoad(cell[0], cell[1]);
      this.eval = { ...ev, cell };
      const path = this.anchor ? this._linePath(this.anchor, cell) : [cell];
      let valid = 0;
      for (const [i, j] of path) if (bs.evaluateRoad(i, j).ok) valid++;
      this.footprint.setColor(valid > 0 && (ev.ok || ev.exists) ? GOOD : BAD);
      this.footprint.setCells(path);
      this.pathValid = valid; this.pathLen = path.length;
      let text;
      if (!this.anchor) text = ev.ok ? 'Click to start a road' : ev.reason;
      else text = valid ? `Click to build ${valid} road tile${valid > 1 ? 's' : ''} (Esc to stop)` : ev.reason || 'Nothing can be built here';
      if (this.pointer?.type !== 'mouse') text = ev.ok || this.anchor ? (this.anchor ? `Tap ✓ to build ${valid} tile${valid > 1 ? 's' : ''}` : 'Tap ✓ to start the road') : ev.reason;
      this.emit('hint', { ok: valid > 0, text });
    } else if (this.mode === 'source') {
      const i = clamp(Math.round((hx + HALF) / CELL), 0, N), j = clamp(Math.round((hz + HALF) / CELL), 0, N);
      const ev = bs.evaluateSource(i, j);
      this.eval = ev;
      this.ghostMat.color.set(ev.ok ? 0x59b6ff : BAD);
      this.ghostMat.emissive.set(ev.ok ? 0x59b6ff : BAD);
      this.ghost.position.set(i * CELL - HALF, w.field.h[j * VERTS + i], j * CELL - HALF);
      this.ghost.rotation.y = 0;
      this.ghost.visible = true;
      this.footprint.hide();
      this.emit('hint', { ok: ev.ok, text: ev.ok ? (this.pointer?.type === 'mouse' ? 'Click to place a water source' : 'Tap ✓ to place a water source') : ev.reason });
    } else if (this.mode === 'pour' || this.mode === 'drain') {
      this._updateRing(hx, hz);
      if (this.brushOn) {
        const v = this.pourRate * dt * (this.mode === 'pour' ? 1 : -1.3);
        w.water.addVolume(hx, hz, this.brushRadius, v);
      }
      this.emit('hint', { ok: true, text: this.pointer?.type === 'mouse' ? (this.mode === 'pour' ? 'Hold left mouse to pour water' : 'Hold left mouse to drain water') : (this.mode === 'pour' ? 'Press and hold to pour water' : 'Press and hold to drain water') });
    }
  }

  _updateRing(x, z) {
    const f = this.world.field, w = this.world.water, r = this.brushRadius;
    const seg = this.ringPos.length / 3;
    for (let k = 0; k < seg; k++) {
      const a = (k / seg) * Math.PI * 2;
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      this.ringPos[k * 3] = px;
      this.ringPos[k * 3 + 1] = f.heightAt(px, pz) + w.depthAt(px, pz) + 0.35;
      this.ringPos[k * 3 + 2] = pz;
    }
    this.ring.geometry.attributes.position.needsUpdate = true;
    this.ring.visible = true;
  }

  // ---------------------------------------------------------------- actions
  onTap(e) {
    const w = this.world;
    this.pointer = { x: e.x, y: e.y, type: e.type };
    if (e.button === 2) return;
    this._updateHit();
    if (this.mode === 'select') return this._selectAt(e);
    if (!this.hit) return;
    if (this.mode === 'pour' || this.mode === 'drain') {
      w.water.addVolume(this.hit[0], this.hit[2], this.brushRadius, this.mode === 'pour' ? 260 : -260);
      return;
    }
    // placement modes
    if (e.type === 'mouse') { this.update(0); this.confirm(); return; }
    // touch: first tap moves the ghost, tapping the same spot again places it
    this.update(0.2);
    const key = this._cellKey();
    if (this.lastTouchCell === key) { this.confirm(); this.lastTouchCell = null; }
    else this.lastTouchCell = key;
  }

  _cellKey() {
    if (this.mode === 'build' && this.eval) return `${this.eval.cx},${this.eval.cz},${this.rot}`;
    if (this.mode === 'road' && this.eval?.cell) return this.eval.cell.join(',');
    if (this.mode === 'source' && this.eval) return `${this.eval.i},${this.eval.j}`;
    return '';
  }

  /** Place whatever the ghost currently shows. */
  confirm() {
    const w = this.world, bs = w.buildings;
    if (this.mode === 'build' && this.eval) {
      const ev = this.eval;
      const g = this.gate?.canPlace(this.key);
      if (g && !g.ok) { this.emit('toast', { text: g.reason, kind: 'warn' }); return; }
      const res = bs.place(this.key, ev.cx, ev.cz, this.rot);
      if (res.ok) { this.gate?.placed(this.key); this.emit('toast', { text: `${TYPES[this.key].name} placed`, kind: 'ok' }); }
      else this.emit('toast', { text: res.reason, kind: 'warn' });
    } else if (this.mode === 'road' && this.eval?.cell) {
      const cell = this.eval.cell;
      const path = this.anchor ? this._linePath(this.anchor, cell) : [cell];
      let n = 0, reason = '';
      for (const [i, j] of path) {
        const g = this.gate?.canPlace('road'); if (g && !g.ok) { reason = g.reason; break; }
        const r = bs.placeRoad(i, j); if (r.ok) { n++; this.gate?.placed('road'); } else if (!r.exists) reason = r.reason;
      }
      if (n) { this.emit('toast', { text: `${n} road tile${n > 1 ? 's' : ''} built`, kind: 'ok' }); this.anchor = cell; }
      else if (this.anchor === null && this.eval.exists) this.anchor = cell;
      else this.emit('toast', { text: reason || this.eval.reason || 'Cannot build here', kind: 'warn' });
    } else if (this.mode === 'source' && this.eval) {
      const g = this.gate?.canPlace('source');
      if (g && !g.ok) { this.emit('toast', { text: g.reason, kind: 'warn' }); return; }
      const r = bs.placeSource(this.eval.i, this.eval.j, this.gate ? Math.min(10, this.sourceRate) : this.sourceRate);
      if (r.ok) { this.gate?.placed('source'); this.emit('toast', { text: 'Water source placed', kind: 'ok' }); }
      else this.emit('toast', { text: r.reason, kind: 'warn' });
    }
  }

  _selectAt(e) {
    const w = this.world, bs = w.buildings;
    const hit = bs.pick(w.rig.raycaster);
    const terrainDist = this.hit ? Math.hypot(this.hit[0] - w.rig.camera.position.x, this.hit[1] - w.rig.camera.position.y, this.hit[2] - w.rig.camera.position.z) : Infinity;
    if (hit && hit.distance < terrainDist + 2) {
      this.select({ kind: hit.kind, id: hit.id });
      if (hit.kind === 'building') bs.pop(hit.id);
      return;
    }
    if (!this.hit) { this.select(null); return; }
    const [x, y, z] = this.hit;
    const cx = Math.floor((x + HALF) / CELL), cz = Math.floor((z + HALF) / CELL);
    if (bs.occAt(cx, cz) === -1) { this.select({ kind: 'road', cx, cz }); return; }
    const o = bs.occAt(cx, cz);
    if (o > 0 && bs.buildings.has(o)) { this.select({ kind: 'building', id: o }); bs.pop(o); return; }
    if (w.water.depthAt(x, z) > 0.05) this.select({ kind: 'water', x, z });
    else this.select({ kind: 'terrain', x, z });
  }

  select(sel) {
    this.selection = sel;
    const bs = this.world.buildings;
    if (!sel) this.selOverlay.hide();
    else if (sel.kind === 'building') {
      const b = bs.buildings.get(sel.id);
      if (b) { const cells = []; for (let j = b.cz; j < b.cz + b.d; j++) for (let i = b.cx; i < b.cx + b.w; i++) cells.push([i, j]); this.selOverlay.setCells(cells); }
    } else if (sel.kind === 'road') this.selOverlay.setCells([[sel.cx, sel.cz]]);
    else if (sel.kind === 'source') {
      const s = this.world.water.getSource(sel.id);
      if (s) this.selOverlay.setCells([[s.i - 1, s.j - 1], [s.i, s.j - 1], [s.i - 1, s.j], [s.i, s.j]].filter(([i, j]) => i >= 0 && j >= 0 && i < N && j < N));
    } else this.selOverlay.hide();
    this.emit('selection', sel);
  }

  deleteSelected() {
    const s = this.selection;
    if (!s) return false;
    const bs = this.world.buildings;
    let ok = false, name = '';
    if (s.kind === 'building') { const k = bs.buildings.get(s.id)?.key; name = TYPES[k]?.name || 'Building'; ok = bs.remove(s.id); if (ok && k) this.gate?.removed(k); }
    else if (s.kind === 'road') { name = 'Road'; ok = bs.removeRoad(s.cx, s.cz); if (ok) this.gate?.removed('road'); }
    else if (s.kind === 'source') { name = 'Water source'; bs.removeSource(s.id); ok = true; this.gate?.removed('source'); }
    if (ok) { this.emit('toast', { text: `${name} removed`, kind: 'ok' }); this.select(null); }
    return ok;
  }
}
