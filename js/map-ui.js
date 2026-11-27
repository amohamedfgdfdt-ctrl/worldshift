// Full-screen interactive world map: real terrain + water + roads + buildings,
// pannable/zoomable, click to move the game camera. Data comes straight from the
// live simulation (field heights, water depth, building system), not a static image.
import { N, CELL, HALF, VERTS, toWorld } from './config.js';
import { t as tr } from './i18n.js';
import { TYPES } from './buildings.js';
import { icon } from './icons.js';

const KIND_COLOR = {
  house: '#e8b04b', factory: '#aab4bd', farm: '#d3cf6a', tank: '#4fb6e6',
  power: '#f2d354', tree: '#3f8f4f',
};

export class WorldMap {
  constructor({ world, sim }) {
    this.world = world;
    this.sim = sim;
    this.open = false;
    this._baseDirty = true;
    this._ptrs = new Map();
    this._pinch = 0;

    const root = document.createElement('div');
    root.id = 'map-overlay';
    root.innerHTML = `
      <div class="map-head glass">
        <button id="map-back" class="map-back" aria-label="${tr('map.close')}">${icon('rotL', 20)}<span>${tr('map.close')}</span></button>
        <b class="map-title">${tr('map.title')}</b>
        <span class="map-hint">${tr('map.hint')}</span>
      </div>
      <canvas id="map-canvas"></canvas>`;
    document.body.appendChild(root);
    this.root = root;
    this.cv = root.querySelector('#map-canvas');
    this.ctx = this.cv.getContext('2d');
    this.base = document.createElement('canvas');
    this.base.width = this.base.height = N;
    root.style.display = 'none';

    root.querySelector('#map-back').addEventListener('click', () => this.close());
    this._wireInput();
    world.on('built', () => { this._baseDirty = true; if (this.open) this.draw(); });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.open) this.close();
      else if ((e.key === 'm' || e.key === 'M') && !this.open && !e.target.closest('input,textarea')) this.toggle();
    });
  }

  toggle() { this.open ? this.close() : this.show(); }

  show() {
    this.open = true;
    this.root.style.display = 'flex';
    this._resize();
    const fit = this._fit();
    this.scale = fit * 0.96;
    this.cx = this.world.rig.goal.target.x;
    this.cy = this.world.rig.goal.target.z;
    this.draw();
    clearInterval(this._tick);
    this._tick = setInterval(() => this.open && this.draw(), 600);   // live water / camera marker
  }

  close() {
    this.open = false;
    this.root.style.display = 'none';
    clearInterval(this._tick);
    this._ptrs.clear();
  }

  // Move the game camera to a world position and return to the simulation.
  goto(wx, wz) {
    const L = HALF - 6;
    const rig = this.world.rig;
    rig.goal.target.x = Math.max(-L, Math.min(L, wx));
    rig.goal.target.z = Math.max(-L, Math.min(L, wz));
    this.close();
  }

  _fit() { return Math.min(this.cv.width, this.cv.height) / (HALF * 2); }

  _resize() {
    const r = this.cv.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.cv.width = Math.max(64, Math.round(r.width * dpr));
    this.cv.height = Math.max(64, Math.round(r.height * dpr));
    this._dpr = dpr;
  }

  // ---------------------------------------------------------------- input
  _wireInput() {
    const cv = this.cv;
    window.addEventListener('resize', () => { if (this.open) { this._resize(); this.draw(); } });

    cv.addEventListener('pointerdown', (e) => {
      cv.setPointerCapture(e.pointerId);
      this._ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this._ptrs.size === 2) {
        const [a, b] = [...this._ptrs.values()];
        this._pinch = Math.hypot(a.x - b.x, a.y - b.y);
      }
      this._downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
      this._moved = false;
    });
    cv.addEventListener('pointermove', (e) => {
      const p = this._ptrs.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      if (this._ptrs.size === 1) {
        this.cx -= dx / this.scale;
        this.cy -= dy / this.scale;
        if (Math.abs(e.clientX - this._downAt.x) + Math.abs(e.clientY - this._downAt.y) > 8) this._moved = true;
        this._clampView();
        this.draw();
      } else if (this._ptrs.size === 2) {
        p.x = e.clientX; p.y = e.clientY;
        const [a, b] = [...this._ptrs.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (this._pinch > 0 && d > 0) this._zoomBy(d / this._pinch, (a.x + b.x) / 2, (a.y + b.y) / 2);
        this._pinch = d;
        this._moved = true;
        return;
      }
      p.x = e.clientX; p.y = e.clientY;
    });
    const up = (e) => {
      const wasTap = this._ptrs.size === 1 && !this._moved && this._downAt &&
        performance.now() - this._downAt.t < 500;
      this._ptrs.delete(e.pointerId);
      this._pinch = 0;
      if (wasTap) {
        const w = this._toWorld(e.clientX, e.clientY);
        this.goto(w.x, w.z);
      }
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', (e) => { this._ptrs.delete(e.pointerId); this._pinch = 0; });

    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      this._zoomBy(e.deltaY < 0 ? 1.2 : 1 / 1.2, e.clientX, e.clientY);
    }, { passive: false });
  }

  _zoomBy(f, px, py) {
    const fit = this._fit();
    const before = this._toWorld(px, py);
    this.scale = Math.max(fit * 0.5, Math.min(fit * 16, this.scale * f));
    const after = this._toWorld(px, py);
    this.cx += before.x - after.x;
    this.cy += before.z - after.z;
    this._clampView();
    this.draw();
  }

  _clampView() {
    const L = HALF * 1.2;
    this.cx = Math.max(-L, Math.min(L, this.cx));
    this.cy = Math.max(-L, Math.min(L, this.cy));
  }

  _toWorld(px, py) {
    const r = this.cv.getBoundingClientRect();
    const x = (px - r.left) * this._dpr, y = (py - r.top) * this._dpr;
    return { x: this.cx + (x - this.cv.width / 2) / this.scale, z: this.cy + (y - this.cv.height / 2) / this.scale };
  }

  // ---------------------------------------------------------------- render
  _renderBase() {
    const { field, water } = this.world;
    const h = field.h, depth = water.depth;
    const ctx = this.base.getContext('2d');
    const img = ctx.createImageData(N, N);
    const d = img.data;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const k = j * VERTS + i;
        const ht = h[k], dep = depth[k];
        let r, g, b;
        if (dep > 0.04) {                                   // water: shallow → deep
          const f = Math.min(1, dep / 1.6);
          r = 127 - 82 * f; g = 180 - 100 * f; b = 199 - 78 * f;
        } else if (ht < 1.6) { r = 203; g = 185; b = 138; } // shore sand
        else {
          const f = Math.min(1, ht / 46);
          r = 122 - 55 * f; g = 168 - 90 * f; b = 90 - 22 * f;      // grass → rock
          if (ht > 44) { const s = Math.min(1, (ht - 44) / 10); r += (238 - r) * s; g += (242 - g) * s; b += (246 - b) * s; }
        }
        const p = (j * N + i) * 4;
        d[p] = r; d[p + 1] = g; d[p + 2] = b; d[p + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    this._baseDirty = false;
  }

  draw() {
    if (!this.open) return;
    if (this._baseDirty) this._renderBase();
    const { ctx, cv } = this, s = this.scale;
    const W = cv.width, H = cv.height;
    const X = (wx) => (wx - this.cx) * s + W / 2;
    const Y = (wz) => (wz - this.cy) * s + H / 2;

    ctx.fillStyle = '#101820';
    ctx.fillRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = s * CELL > 3;
    ctx.drawImage(this.base, X(-HALF), Y(-HALF), HALF * 2 * s, HALF * 2 * s);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = Math.max(1, this._dpr);
    ctx.strokeRect(X(-HALF), Y(-HALF), HALF * 2 * s, HALF * 2 * s);

    // roads
    const roads = this.world.buildings.roads;
    if (roads && roads.size) {
      ctx.fillStyle = 'rgba(226,220,203,0.9)';
      const rw = Math.max(CELL * s, this._dpr);
      for (const idx of roads) {
        const i = idx % N, j = Math.floor(idx / N);
        ctx.fillRect(X(toWorld(i) + CELL / 2) - rw / 2, Y(toWorld(j) + CELL / 2) - rw / 2, rw, rw);
      }
    }

    // buildings
    for (const b of this.world.buildings.buildings.values()) {
      const tp = TYPES[b.key];
      const col = KIND_COLOR[tp?.kind] || '#e8e2d2';
      const w = Math.max((b.w || 1) * CELL * s * 0.8, 3 * this._dpr);
      const d = Math.max((b.d || 1) * CELL * s * 0.8, 3 * this._dpr);
      ctx.fillStyle = col;
      ctx.fillRect(X(b.x) - w / 2, Y(b.z) - d / 2, w, d);
    }

    // water sources
    ctx.fillStyle = '#7fd4ff';
    for (const src of this.world.water.sources) {
      ctx.beginPath();
      ctx.arc(X(toWorld(src.i)), Y(toWorld(src.j)), 3 * this._dpr, 0, Math.PI * 2);
      ctx.fill();
    }

    // camera position + view direction
    const rig = this.world.rig, g = rig.goal;
    const mx = X(g.target.x), my = Y(g.target.z);
    const dirx = -Math.sin(g.yaw), diry = -Math.cos(g.yaw);
    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(Math.atan2(diry, dirx));
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.moveTo(16 * this._dpr, 0);
    ctx.lineTo(4 * this._dpr, -7 * this._dpr);
    ctx.lineTo(4 * this._dpr, 7 * this._dpr);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#ff5a4e';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2 * this._dpr;
    ctx.beginPath();
    ctx.arc(mx, my, 5 * this._dpr, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}
