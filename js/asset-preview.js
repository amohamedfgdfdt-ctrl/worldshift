// In-game asset preview. Shows every model of assets/manifest.json on its own
// stage (true scale, a 1.8 m person and a 1 m grid as scale references) BEFORE
// it is approved for the world. Nothing here touches the world, the water or the
// save: models are loaded with the same AssetManager.loadVariant path the game
// uses (same flattening, multi-material handling, pivot and scale), rendered in a
// separate scene with its own lights. "Apply approved" is the only action that
// changes the world, and it uses the normal loader (with procedural fallback).
import * as THREE from '../vendor/three.module.min.js';

const LIGHTS = {
  noon:    { sun: 0xfff4e0, sunI: 3.0, el: 58, az: 40,  hemiSky: 0xbfd8ff, hemiGnd: 0x57492f, hemiI: 1.0, bg: 0x9db7d3 },
  golden:  { sun: 0xffb36b, sunI: 2.6, el: 14, az: 70,  hemiSky: 0xffd9b0, hemiGnd: 0x3c3226, hemiI: 0.7, bg: 0xd9a77a },
  overcast:{ sun: 0xdfe6ee, sunI: 0.9, el: 50, az: 20,  hemiSky: 0xd6dde6, hemiGnd: 0x6a6a64, hemiI: 1.5, bg: 0xaab3bd },
};

const CSS = `
body.previewing #topbar,body.previewing #rail,body.previewing #panel,body.previewing #info,body.previewing #camtools,
body.previewing #hint,body.previewing #actionbar,body.previewing #simbar{display:none!important}
#apv{position:fixed;inset:0;z-index:50;pointer-events:none;font:12px/1.35 system-ui,sans-serif;color:#e8edf5}
#apv *{box-sizing:border-box}
#apv .side{position:absolute;left:8px;top:8px;bottom:8px;width:290px;max-width:46vw;overflow:auto;pointer-events:auto;background:rgba(12,15,24,.88);border:1px solid #2a3350;border-radius:10px;padding:10px}
#apv h3{margin:0 0 6px;font-size:14px}
#apv .row{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin:4px 0}
#apv button{background:#222b45;color:#e8edf5;border:1px solid #38446b;border-radius:6px;padding:4px 8px;font:inherit;cursor:pointer}
#apv button.on{background:#3a5bd9;border-color:#6d8cff}
#apv button.go{background:#1f7a4a;border-color:#38b46f}
#apv .ent{border-top:1px solid #2a3350;padding:6px 0}
#apv .ent b{font-size:12.5px}
#apv .var{display:block;width:100%;text-align:left;margin:2px 0;padding:3px 6px}
#apv .ok{color:#6fe09b}#apv .warn{color:#ffcc66}#apv .bad{color:#ff7a7a}
#apv .info{white-space:pre-wrap;font:11px/1.4 ui-monospace,monospace;background:#0a0d16;border-radius:6px;padding:6px;margin-top:6px}
#apv .lab{position:absolute;transform:translate(-50%,-100%);background:rgba(8,10,18,.72);padding:1px 5px;border-radius:4px;font-size:10.5px;white-space:nowrap;pointer-events:none}
#apv .close{position:absolute;right:10px;top:10px;pointer-events:auto}
`;

export class AssetPreview {
  constructor(world, ui) {
    this.world = world; this.ui = ui; this.assets = world.assets;
    this.active = false; this.items = []; this.results = []; this.approved = new Set();
    this.light = 'noon'; this.wire = false; this.labels = true;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.05, 600);
    this.target = new THREE.Vector3(0, 2, 0); this.sph = { r: 22, th: 0.6, ph: 1.2 };
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true; this.sun.shadow.mapSize.set(2048, 2048);
    const c = this.sun.shadow.camera; c.left = c.bottom = -45; c.right = c.top = 45; c.near = 1; c.far = 200;
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.hemi, this.sun, this.sun.target);
    this.stage = new THREE.Group(); this.scene.add(this.stage);
    this._setLight('noon');
  }

  // ------------------------------------------------------------------ open / close
  async open() {
    if (this.active) return;
    const w = this.world;
    this.active = true;
    document.body.classList.add('previewing');
    this._ui();
    this._bind();
    this._status('Loading models…');
    if (!this.assets.entries.length) await this.assets.loadManifest();
    this.manifestUrl = new URL('../assets/manifest.json', import.meta.url).href;
    await this._build();
    this._status('');
    this.focusAll();
    this._render();
    w.pipeline && (this._savedClear = w.renderer.getClearColor(new THREE.Color()).getHex());
  }

  close() {
    if (!this.active) return;
    this.active = false;
    document.body.classList.remove('previewing');
    this._unbind();
    this._dispose();
    this.root?.remove(); this.root = null;
    this.world.renderer.setClearColor(this._savedClear ?? 0x0b0d14);
    this.world.refreshAssetState?.();
  }

  // ------------------------------------------------------------------ building the stage
  async _build() {
    this._dispose();
    const entries = this.assets.entries;
    const ZS = 16;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: 0x5b6b4a, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; this.stage.add(ground);
    const grid = new THREE.GridHelper(80, 80, 0x222222, 0x3a4a30); grid.position.y = 0.01; grid.material.transparent = true; grid.material.opacity = 0.35; this.stage.add(grid);
    this.results = [];
    let row = 0;
    for (const e of entries) {
      const z = row * ZS; row++;
      const res = { id: e.id, category: e.category, target: e.target, enabled: e.enabled, note: e.note, variants: [], z };
      this.results.push(res);
      this._person(-3.2, z);
      let x = 0;
      for (const v of e.variants) {
        let lv;
        try { lv = await this.assets.loadVariant(v, this.assets.manifestBase || this.manifestUrl); }
        catch (err) { res.variants.push({ name: v.name, error: String(err.message || err) }); continue; }
        const L = lv.levels[0];
        const mesh = new THREE.Mesh(L.geometry, L.materials.length === 1 ? L.materials[0] : L.materials);
        const half = Math.max(lv.size.x, lv.size.z) / 2;
        x += half + 0.6;
        mesh.position.set(x, 0, z);
        mesh.castShadow = true; mesh.receiveShadow = true;
        this.stage.add(mesh);
        const checks = this._check(v, lv, L);
        const rv = {
          name: v.name, weight: v.weight, size: lv.size.toArray().map((n) => +n.toFixed(2)), srcSize: lv.srcSize.toArray().map((n) => +n.toFixed(2)),
          scale: +lv.scale.toFixed(4), tris: L.tris, materials: L.materials.map((m) => ({
            color: '#' + (m.color?.getHexString?.() || '?'), map: !!m.map, transparent: m.transparent, side: m.side, alphaTest: m.alphaTest,
            rough: +(m.roughness ?? 0).toFixed(2), metal: +(m.metalness ?? 0).toFixed(2), type: m.type,
          })), levels: lv.levels.length, checks, warnings: lv.warnings, x, z, mesh, source: v.source,
        };
        res.variants.push(rv);
        rv.label = this._label(rv);
        x += half + 0.6;
      }
      for (const rv of res.variants) rv.rowCx = res.variants.filter((q) => !q.error).reduce((a, q) => a + q.x, 0) / Math.max(1, res.variants.filter((q) => !q.error).length);
    }
    this._renderList();
  }

  _check(v, lv, L) {
    const c = [];
    const bb = L.box;
    const push = (ok, msg) => c.push({ ok, msg });
    push(Math.abs(bb.min.y) < 0.02, `base on ground (min y = ${bb.min.y.toFixed(3)})`);
    const cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2;
    push(Math.hypot(cx, cz) < 0.05 * Math.max(1, lv.size.y), `footprint centred (${cx.toFixed(2)}, ${cz.toFixed(2)})`);
    push(lv.size.y > 0.05 && lv.size.y < 40, `height ${lv.size.y.toFixed(2)} m plausible`);
    if (v.dimensions?.height) push(Math.abs(lv.size.y - v.dimensions.height) / v.dimensions.height < 0.02, `height matches manifest (${v.dimensions.height} m)`);
    push(L.materials.every((m) => !m.transparent && !(m.alphaTest > 0)), 'opaque materials (no transparency sorting issues)');
    push(L.materials.every((m) => m.isMeshStandardMaterial), 'standard PBR materials (lit like the world)');
    const pos = L.geometry.getAttribute('position'), nor = L.geometry.getAttribute('normal');
    push(!!nor && nor.count === pos.count, 'normals present');
    push(L.tris <= (v.maxTris || 2500), `triangles ${L.tris}`);
    return c;
  }

  _person(x, z) {
    const g = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color: 0xc8c8d0, roughness: 0.8 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 1.05, 4, 10), m); body.position.y = 0.75;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), m); head.position.y = 1.68;
    body.castShadow = head.castShadow = true;
    g.add(body, head); g.position.set(x, 0, z); this.stage.add(g);
    const l = document.createElement('div'); l.className = 'lab'; l.textContent = '1.8 m'; this.labelBox.appendChild(l);
    this._extra = this._extra || []; this._extra.push({ el: l, pos: new THREE.Vector3(x, 1.95, z) });
  }

  _label(rv) {
    const el = document.createElement('div'); el.className = 'lab';
    el.textContent = `${rv.name} · ${rv.size[1]} m · ${rv.tris} tris`;
    this.labelBox.appendChild(el);
    return el;
  }

  _dispose() {
    for (const r of this.results) for (const v of r.variants) {
      if (v.mesh) {
        v.mesh.geometry.dispose();
        const ms = Array.isArray(v.mesh.material) ? v.mesh.material : [v.mesh.material];
        for (const m of ms) { for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap']) m[k]?.dispose(); m.dispose(); }
      }
    }
    for (const o of [...this.stage.children]) {
      this.stage.remove(o);
      o.traverse?.((q) => { if (q.isGroup) return; if (!this.results.some((r) => r.variants.some((v) => v.mesh === q))) { q.geometry?.dispose(); q.material?.dispose?.(); } });
    }
    this.labelBox && (this.labelBox.innerHTML = '');
    this._extra = [];
    this.results = [];
  }

  // ------------------------------------------------------------------ light
  _setLight(k) {
    const L = LIGHTS[k]; this.light = k;
    this.sun.color.setHex(L.sun); this.sun.intensity = L.sunI;
    const el = L.el * Math.PI / 180, az = L.az * Math.PI / 180;
    this.sunDir = new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
    this.hemi.color.setHex(L.hemiSky); this.hemi.groundColor.setHex(L.hemiGnd); this.hemi.intensity = L.hemiI;
    this.bg = L.bg;
    this.scene.background = new THREE.Color(L.bg);
  }
  useGameLight() {
    const e = this.world.env;
    this.sun.color.copy(e.sun.color); this.sun.intensity = e.sun.intensity;
    this.sunDir = e.sunDir.clone().normalize();
    this.hemi.color.copy(e.hemi.color); this.hemi.groundColor.copy(e.hemi.groundColor); this.hemi.intensity = e.hemi.intensity;
    this.light = 'game';
  }

  // ------------------------------------------------------------------ camera
  focus(x, z, size = 10) {
    this.target.set(x, Math.min(size * 0.4, 4), z);
    this.sph.r = Math.max(4, size * 2.4);
  }
  focusEntry(i) {
    const r = this.results[i]; if (!r) return;
    const ok = r.variants.filter((v) => !v.error);
    if (!ok.length) return;
    const minX = Math.min(...ok.map((v) => v.x - v.size[0] / 2)), maxX = Math.max(...ok.map((v) => v.x + v.size[0] / 2));
    const h = Math.max(...ok.map((v) => v.size[1]));
    this.target.set((minX + maxX) / 2 - 1, h * 0.4, r.z);
    this.sph.r = Math.max(5, Math.max(maxX - minX + 4, h * 1.6) * 1.15);
    this.sph.th = 0.5; this.sph.ph = 1.25;
  }
  focusVariant(i, j) {
    const v = this.results[i]?.variants[j]; if (!v || v.error) return;
    this.target.set(v.x, v.size[1] * 0.45, this.results[i].z);
    this.sph.r = Math.max(2.2, Math.max(v.size[1], v.size[0]) * 2.3);
    this.selected = [i, j]; this._showInfo(i, j);
  }
  focusAll() {
    const zs = this.results.map((r) => r.z);
    const zc = zs.length ? (Math.min(...zs) + Math.max(...zs)) / 2 : 0;
    this.target.set(14, 3, zc); this.sph.r = Math.max(40, (zs.length ? Math.max(...zs) : 0) * 1.3 + 30); this.sph.th = 0.2; this.sph.ph = 1.0;
  }

  _bind() {
    const cv = this.world.renderer.domElement;
    const pts = new Map(); let last = 0;
    const stop = (e) => { if (e.target === cv) e.stopImmediatePropagation(); };
    this._h = {
      down: (e) => { if (e.target !== cv) return; stop(e); cv.setPointerCapture?.(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); last = this._pd(pts); },
      move: (e) => {
        if (!pts.has(e.pointerId)) return; stop(e);
        const p = pts.get(e.pointerId), dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
        if (pts.size === 2) { const d = this._pd(pts); if (last) this.sph.r = THREE.MathUtils.clamp(this.sph.r * last / d, 0.8, 200); last = d; return; }
        if (e.shiftKey || e.buttons === 2 || e.buttons === 4) this._pan(dx, dy);
        else { this.sph.th -= dx * 0.006; this.sph.ph = THREE.MathUtils.clamp(this.sph.ph - dy * 0.006, 0.08, 1.52); }
      },
      up: (e) => { pts.delete(e.pointerId); last = 0; },
      wheel: (e) => { if (e.target !== cv) return; stop(e); e.preventDefault(); this.sph.r = THREE.MathUtils.clamp(this.sph.r * Math.exp(e.deltaY * 0.0012), 0.8, 200); },
      ctx: (e) => { if (e.target === cv) { e.preventDefault(); e.stopImmediatePropagation(); } },
    };
    const o = { capture: true };
    window.addEventListener('pointerdown', this._h.down, o); window.addEventListener('pointermove', this._h.move, o);
    window.addEventListener('pointerup', this._h.up, o); window.addEventListener('pointercancel', this._h.up, o);
    window.addEventListener('wheel', this._h.wheel, { capture: true, passive: false }); window.addEventListener('contextmenu', this._h.ctx, o);
  }
  _unbind() {
    const o = { capture: true }, h = this._h; if (!h) return;
    window.removeEventListener('pointerdown', h.down, o); window.removeEventListener('pointermove', h.move, o);
    window.removeEventListener('pointerup', h.up, o); window.removeEventListener('pointercancel', h.up, o);
    window.removeEventListener('wheel', h.wheel, o); window.removeEventListener('contextmenu', h.ctx, o);
  }
  _pd(pts) { const a = [...pts.values()]; return a.length < 2 ? 0 : Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); }
  _pan(dx, dy) {
    const k = this.sph.r * 0.0014, cam = this.camera;
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrix, 0), up = new THREE.Vector3(0, 1, 0);
    this.target.addScaledVector(right, -dx * k).addScaledVector(up, dy * k);
  }

  // ------------------------------------------------------------------ frame
  frame() { if (this.active) this._render(); }
  _render() {
    const r = this.world.renderer, cv = r.domElement;
    const W = cv.clientWidth, H = cv.clientHeight;
    this.camera.aspect = W / Math.max(1, H); this.camera.updateProjectionMatrix();
    const { r: R, th, ph } = this.sph;
    this.camera.position.set(this.target.x + R * Math.sin(ph) * Math.sin(th), this.target.y + R * Math.cos(ph), this.target.z + R * Math.sin(ph) * Math.cos(th));
    this.camera.lookAt(this.target);
    this.sun.target.position.copy(this.target); this.sun.target.updateMatrixWorld();
    this.sun.position.copy(this.target).addScaledVector(this.sunDir, 100);
    for (const o of this.stage.children) if (o.isGridHelper) o.visible = true;
    this.camera.updateMatrixWorld();
    r.setClearColor(this.bg ?? 0x9db7d3);
    r.render(this.scene, this.camera);
    this._placeLabels(W, H);
  }
  _placeLabels(W, H) {
    const v = new THREE.Vector3();
    const put = (el, p) => {
      v.copy(p).project(this.camera);
      const vis = this.labels && v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
      el.style.display = vis ? '' : 'none';
      if (vis) { el.style.left = ((v.x * 0.5 + 0.5) * W) + 'px'; el.style.top = ((-v.y * 0.5 + 0.5) * H) + 'px'; }
    };
    for (const r of this.results) for (const q of r.variants) if (q.label) put(q.label, new THREE.Vector3(q.x, q.size[1] + 0.3, r.z));
    for (const x of this._extra || []) put(x.el, x.pos);
  }

  // ------------------------------------------------------------------ UI
  _ui() {
    if (!document.getElementById('apv-css')) { const s = document.createElement('style'); s.id = 'apv-css'; s.textContent = CSS; document.head.appendChild(s); }
    this.root = document.createElement('div'); this.root.id = 'apv';
    this.root.innerHTML = `<div class="side">
      <h3>Asset preview</h3>
      <div class="ok" style="margin-bottom:4px">Preview only: the world is not changed until you press “Apply approved”.</div>
      <div class="row" id="apv-light"><span>Light</span>
        <button data-l="noon" class="on">Noon</button><button data-l="golden">Golden</button><button data-l="overcast">Overcast</button><button data-l="game">Game</button></div>
      <div class="row"><button id="apv-all">Overview</button><button id="apv-lab" class="on">Labels</button><button id="apv-wire">Wireframe</button></div>
      <div id="apv-status" class="warn"></div>
      <div id="apv-list"></div>
      <div class="row" style="margin-top:8px"><button id="apv-pass">Approve all passing</button><button id="apv-apply" class="go">Apply approved</button></div>
      <div id="apv-info" class="info" style="display:none"></div>
    </div><button class="close" id="apv-close">Close preview</button><div id="apv-labels"></div>`;
    document.getElementById('app').appendChild(this.root);
    this.labelBox = this.root.querySelector('#apv-labels');
    this.labelBox.style.cssText = 'position:absolute;inset:0;overflow:hidden;pointer-events:none';
    const $ = (s) => this.root.querySelector(s);
    $('#apv-close').onclick = () => this.close();
    $('#apv-all').onclick = () => this.focusAll();
    $('#apv-lab').onclick = (e) => { this.labels = !this.labels; e.target.classList.toggle('on', this.labels); };
    $('#apv-wire').onclick = (e) => {
      this.wire = !this.wire; e.target.classList.toggle('on', this.wire);
      for (const r of this.results) for (const v of r.variants) if (v.mesh) for (const m of [].concat(v.mesh.material)) m.wireframe = this.wire;
    };
    $('#apv-light').onclick = (e) => {
      const k = e.target.dataset?.l; if (!k) return;
      if (k === 'game') this.useGameLight(); else this._setLight(k);
      this.root.querySelectorAll('#apv-light button').forEach((b) => b.classList.toggle('on', b === e.target));
    };
    $('#apv-pass').onclick = () => { this.approveAllPassing(); };
    $('#apv-apply').onclick = () => this.applyApproved();
  }
  _status(t) { const s = this.root?.querySelector('#apv-status'); if (s) s.textContent = t; }

  _entryState(r) {
    const ok = r.variants.filter((v) => !v.error);
    if (!ok.length) return 'bad';
    const fails = ok.some((v) => v.checks.some((c) => !c.ok)) || r.variants.some((v) => v.error);
    return fails ? 'warn' : 'ok';
  }

  _renderList() {
    const box = this.root?.querySelector('#apv-list'); if (!box) return;
    box.innerHTML = '';
    this.results.forEach((r, i) => {
      const st = this._entryState(r);
      const d = document.createElement('div'); d.className = 'ent';
      d.innerHTML = `<div class="row"><input type="checkbox" ${this.approved.has(r.id) ? 'checked' : ''} ${st === 'bad' ? 'disabled' : ''}>
        <b>${r.id}</b> <span class="${st}">${st === 'ok' ? '✓ checks pass' : st === 'warn' ? '⚠ review' : '✗ failed'}</span>
        <span style="opacity:.6">${r.category}${r.enabled ? ' · enabled' : ' · off'}</span></div>`;
      d.querySelector('input').onchange = (e) => { e.target.checked ? this.approved.add(r.id) : this.approved.delete(r.id); };
      const f = document.createElement('button'); f.textContent = 'Focus row'; f.onclick = () => this.focusEntry(i); d.querySelector('.row').appendChild(f);
      r.variants.forEach((v, j) => {
        const b = document.createElement('button'); b.className = 'var';
        b.innerHTML = v.error ? `<span class="bad">✗ ${v.name}: ${v.error}</span>` : `${v.checks.every((c) => c.ok) ? '<span class="ok">✓</span>' : '<span class="warn">⚠</span>'} ${v.name} — ${v.size[1]} m, ${v.tris} tris, w ${v.weight}`;
        if (!v.error) b.onclick = () => this.focusVariant(i, j);
        d.appendChild(b);
      });
      box.appendChild(d);
    });
  }

  _showInfo(i, j) {
    const v = this.results[i].variants[j]; const el = this.root.querySelector('#apv-info');
    const s = v.source || {};
    el.style.display = '';
    el.textContent = [
      `${this.results[i].id} / ${v.name}`,
      `game size  ${v.size.join(' × ')} m  (W×H×D)`,
      `source size ${v.srcSize.join(' × ')} m  → scale ×${v.scale}`,
      `triangles ${v.tris}   materials ${v.materials.length}   weight ${v.weight}`,
      ...v.materials.map((m, k) => `  m${k}: ${m.color} rough ${m.rough} metal ${m.metal} map ${m.map ? 'yes' : 'no'} ${m.transparent ? 'TRANSPARENT' : 'opaque'}`),
      ...v.checks.map((c) => `${c.ok ? '✓' : '✗'} ${c.msg}`),
      ...v.warnings.map((w) => '⚠ ' + w),
      `license ${s.license || '?'} · ${s.author || '?'}`,
    ].join('\n');
  }

  approveAllPassing() {
    this.approved.clear();
    for (const r of this.results) if (this._entryState(r) === 'ok' && r.category !== 'ground') this.approved.add(r.id);
    this._renderList();
  }

  /** The only action that changes the world: load the approved entries through the normal loader. */
  async applyApproved() {
    const ids = [...this.approved];
    if (!ids.length) { this._status('Nothing approved yet.'); return []; }
    const out = [];
    for (const e of this.assets.entries) {
      if (!ids.includes(e.id) || e.category === 'ground') continue;
      this._status(`Applying ${e.id}…`);
      try { await this.assets.loadAsset(e, this.manifestUrl); out.push({ id: e.id, ok: true }); }
      catch (err) { out.push({ id: e.id, ok: false, error: String(err.message || err) }); }
    }
    this.applied = out;
    this._status(out.map((o) => `${o.id}: ${o.ok ? 'applied' : 'failed (procedural kept)'}`).join(' · '));
    return out;
  }
}
