// DOM user interface: top bar, category rail, flyout panels, info panel,
// camera buttons, simulation bar, action bar, toasts and dialogs.
import { icon } from './icons.js';
import { CATEGORIES, TYPES, typesOf } from './buildings.js';
import { formatClock } from './utils.js';
import { DEFAULT_SEED, CELL, N, VERTS, isTouchDevice } from './config.js';
import { windUniforms } from './vegetation.js';

const $ = (s, r = document) => r.querySelector(s);
const isMobile = () => window.matchMedia('(max-width: 860px)').matches;

export class UI {
  constructor({ world, sim, tools, controls, save, perf, settings }) {
    Object.assign(this, { world, sim, tools, controls, save, perf, settings });
    this.cat = null;
    this._acc = 0;
    this._infoAcc = 0;
    this._slow = 0;
    this._dragging = false;
    this.el = {
      panel: $('#panel'), rail: $('#rail'), info: $('#info'), cam: $('#camtools'), sim: $('#simbar'),
      hint: $('#hint'), action: $('#actionbar'), toasts: $('#toasts'), modal: $('#modal-root'),
      pop: $('#stat-pop'), bld: $('#stat-bld'), state: $('#stat-state'), chip: $('#chip-status'),
    };
    this._build();
    this._wire();
  }

  // ------------------------------------------------------------ construction
  _build() {
    for (const n of document.querySelectorAll('[data-icon]')) n.innerHTML = icon(n.dataset.icon, 16);
    $('#btn-settings').innerHTML = icon('gear', 20);

    this.el.rail.innerHTML = CATEGORIES.map((c) =>
      `<button class="rail-btn" data-cat="${c.id}" title="${c.label}">${icon(c.icon, 22)}<span>${c.label.replace(' Tools', '').replace('World Settings', 'World')}</span></button>`).join('');

    const touch = isTouchDevice;
    this.el.cam.innerHTML = `
      <button class="cam-btn" data-cam="reset" title="Reset camera (Home)">${icon('target', 20)}</button>
      <button class="cam-btn" data-cam="rotL" title="Rotate left (Q)">${icon('rotL', 20)}</button>
      <button class="cam-btn" data-cam="rotR" title="Rotate right (E)">${icon('rotR', 20)}</button>
      <button class="cam-btn" data-cam="tilt" title="Change tilt">${icon('tilt', 20)}</button>
      <div class="cam-gap"></div>
      <button class="cam-btn" data-cam="in" title="Zoom in (+)">${icon('plus', 20)}</button>
      <button class="cam-btn" data-cam="out" title="Zoom out (−)">${icon('minus', 20)}</button>
      ${touch ? `<div class="cam-gap"></div><button class="cam-btn" data-cam="mode" title="One finger: rotate / move">${icon('orbit', 20)}</button>` : ''}`;

    this.el.sim.innerHTML = `
      <button class="play-btn" id="btn-play" aria-label="Play / Pause" title="Play / Pause (Space)"></button>
      <div class="speed" id="speed">
        <button data-speed="1">×1</button><button data-speed="2">×2</button><button data-speed="4">×4</button>
      </div>
      <div class="sep"></div>
      <div class="clock" id="clock"><span id="clock-ic"></span><div><b id="clock-t">09:00</b><small id="clock-d">Day 1</small></div></div>
      <div class="sep"></div>
      <button class="reset-btn" id="btn-reset" title="Reset the water and the clock (buildings are kept)">${icon('reset', 18)}<span>Reset</span></button>`;
  }

  _wire() {
    const { tools, sim, world } = this;
    // rail
    this.el.rail.addEventListener('click', (e) => {
      const b = e.target.closest('[data-cat]'); if (!b) return;
      this.toggleCategory(b.dataset.cat);
    });
    $('#btn-settings').addEventListener('click', () => this.toggleCategory('world'));

    // camera
    this.el.cam.addEventListener('click', (e) => {
      const b = e.target.closest('[data-cam]'); if (!b) return;
      const rig = world.rig;
      switch (b.dataset.cam) {
        case 'reset': rig.reset(); break;
        case 'rotL': rig.rotateBy(Math.PI / 4); break;
        case 'rotR': rig.rotateBy(-Math.PI / 4); break;
        case 'tilt': rig.tiltCycle(); break;
        case 'in': rig.zoomBy(0.75); break;
        case 'out': rig.zoomBy(1.33); break;
        case 'mode':
          this.controls.touchMode = this.controls.touchMode === 'rotate' ? 'pan' : 'rotate';
          b.innerHTML = icon(this.controls.touchMode === 'rotate' ? 'orbit' : 'move', 20);
          b.classList.toggle('on', this.controls.touchMode === 'pan');
          this.toast(this.controls.touchMode === 'rotate' ? 'One finger rotates the view' : 'One finger moves the view', 'ok');
          break;
      }
    });

    // sim bar
    $('#btn-play').addEventListener('click', () => sim.toggle());
    $('#speed').addEventListener('click', (e) => {
      const b = e.target.closest('[data-speed]'); if (!b) return;
      sim.setSpeed(Number(b.dataset.speed));
      if (!sim.running) sim.setRunning(true);
    });
    $('#btn-reset').addEventListener('click', async () => {
      if (await this.confirm({ title: 'Reset simulation?', text: 'The water returns to its starting state and the clock restarts. Your buildings and roads are kept.', ok: 'Reset' })) {
        sim.reset(); this.toast('Simulation reset', 'ok');
      }
    });
    sim.on('state', () => this.refreshSim());

    window.addEventListener('keydown', (e) => {
      if (/INPUT|SELECT|TEXTAREA|BUTTON/.test(document.activeElement?.tagName || '')) { if (e.code === 'Space') e.preventDefault(); }
      if (e.code === 'Space' && !e.repeat) { e.preventDefault(); sim.toggle(); }
      if (e.code === 'Home') world.rig.reset();
    });

    // action bar
    this.el.action.addEventListener('click', (e) => {
      const b = e.target.closest('[data-ab]'); if (!b) return;
      if (b.dataset.ab === 'ok') tools.confirm();
      else if (b.dataset.ab === 'rot') tools.rotate();
      else if (b.dataset.ab === 'no') tools.cancel();
    });

    // panel (event delegation)
    const P = this.el.panel;
    P.addEventListener('click', (e) => this._panelClick(e));
    P.addEventListener('input', (e) => this._panelInput(e));
    P.addEventListener('pointerdown', (e) => { if (e.target.matches('input[type=range]')) this._dragging = true; });
    window.addEventListener('pointerup', () => { this._dragging = false; });

    // info panel
    this.el.info.addEventListener('click', (e) => {
      if (e.target.closest('[data-info=close]')) tools.select(null);
      if (e.target.closest('[data-info=delete]')) tools.deleteSelected();
    });
    this.el.info.addEventListener('input', (e) => {
      if (e.target.dataset.srcRate && tools.selection?.kind === 'source') {
        const s = world.water.getSource(tools.selection.id);
        if (s) { s.rate = Number(e.target.value); e.target.style.setProperty('--fill', this._fill(e.target)); $('#src-rate-v').textContent = `${s.rate.toFixed(1)} m³/s`; this.save.markDirty(); }
      }
    });

    // events from tools
    tools.on('mode', () => { this.refreshSelectionState(); this.refreshAction(); if (tools.mode !== 'select' && isMobile()) this.closePanel(); });
    tools.on('selection', (s) => this.renderInfo(s));
    tools.on('hint', (h) => this.setHint(h));
    tools.on('toast', (t) => this.toast(t.text, t.kind));
    this.save.on('saved', ({ auto }) => { if (!auto) this.toast('World saved', 'ok'); this._lastSaved = new Date(); this._refreshSaveInfo(); });
    this.save.on('error', (m) => this.toast(m, 'warn'));
    this.save.on('loaded', () => { this.syncControls(); this.refreshSim(); this.toast('World loaded', 'ok'); });
    world.buildings.on('change', () => this.refreshStats());

    this.refreshSim(); this.refreshStats(); this.refreshAction();
  }

  // ------------------------------------------------------------ panels
  toggleCategory(id) {
    if (this.cat === id && !this.el.panel.classList.contains('closed')) return this.closePanel();
    this.openCategory(id);
  }

  openCategory(id) {
    this.cat = id;
    if (isMobile()) {
      this.tools.select(null);
      if (['build', 'road', 'source'].includes(this.tools.mode)) this.tools.setMode('select');
    }
    this.renderPanel();
    this.el.panel.classList.remove('closed');
    for (const b of this.el.rail.querySelectorAll('.rail-btn')) b.classList.toggle('active', b.dataset.cat === id);
    $('#btn-settings').classList.toggle('active', id === 'world');
    this.el.panel.scrollTop = 0;
  }

  closePanel() {
    this.el.panel.classList.add('closed');
    for (const b of this.el.rail.querySelectorAll('.rail-btn')) b.classList.remove('active');
    $('#btn-settings').classList.remove('active');
    this.cat = null;
  }

  _card(t) {
    const meta = t.special ? 'Roads' : `${t.w}×${t.d}${t.capacity && t.kind === 'house' ? ` · ${t.capacity} residents` : t.jobs ? ` · ${t.jobs} jobs` : ''}`;
    return `<button class="card" data-tool="${t.special || 'build'}" data-key="${t.key}">
      <div class="cicon">${icon(t.icon, 20)}</div><div class="cname">${t.name}</div><div class="cmeta">${meta}</div></button>`;
  }

  _slider(key, label, min, max, step, value, fmt) {
    return `<div class="stack"><div class="top"><label>${label}</label><span class="val" data-val="${key}">${fmt(value)}</span></div>
      <input type="range" data-key="${key}" min="${min}" max="${max}" step="${step}" value="${value}"></div>`;
  }
  _switch(key, label, on) {
    return `<div class="row"><label>${label}</label><button class="switch" role="switch" data-sw="${key}" aria-checked="${on}" aria-label="${label}"></button></div>`;
  }

  renderPanel() {
    const cat = CATEGORIES.find((c) => c.id === this.cat);
    const w = this.world, wp = w.water.params;
    let body = '';
    if (['buildings', 'nature', 'infrastructure'].includes(cat.id)) {
      body = `<div class="cards">${typesOf(cat.id).map((t) => this._card(t)).join('')}</div>
        <p class="help">${cat.id === 'infrastructure' ? 'Roads follow the terrain. Water tanks drain the water around them.' : cat.id === 'nature' ? 'Trees and farms can be placed anywhere that is dry and flat enough.' : 'Pick a building, move it over the ground and place it. Green means the spot is valid.'}</p>`;
    } else if (cat.id === 'water') {
      body = `<div class="cards">
          <button class="card" data-tool="pour"><div class="cicon">${icon('pour', 20)}</div><div class="cname">Add Water</div><div class="cmeta">Hold to pour</div></button>
          <button class="card" data-tool="source"><div class="cicon">${icon('source', 20)}</div><div class="cname">Water Source</div><div class="cmeta">Endless spring</div></button>
          <button class="card" data-tool="drain"><div class="cicon">${icon('drain', 20)}</div><div class="cname">Drain</div><div class="cmeta">Hold to remove</div></button>
        </div>
        <div class="section"><h4>Flow</h4>
          ${this._switch('sourcesEnabled', 'Sources are flowing', wp.sourcesEnabled)}
          ${this._slider('flowSpeed', 'Flow speed', 0.25, 1.6, 0.05, wp.flowSpeed, (v) => `×${(+v).toFixed(2)}`)}
          ${this._slider('sourceRate', 'Source strength', 0.25, 3, 0.05, wp.sourceRate, (v) => `×${(+v).toFixed(2)}`)}
          ${this._slider('brush', 'Brush size', 3, 16, 1, this.tools.brushRadius, (v) => `${v} m`)}
        </div>
        <div class="section"><h4>Live</h4>
          <div class="kv"><span>Water volume</span><b id="ws-vol">–</b></div>
          <div class="kv"><span>Wet area</span><b id="ws-wet">–</b></div>
          <div class="kv"><span>Sources</span><b id="ws-src">–</b></div>
          <div class="btn-row" style="margin-top:10px"><button class="btn" data-act="reset-water">${icon('reset', 16)}Reset water</button><button class="btn" data-act="clear-water">${icon('drain', 16)}Dry up</button></div>
          <p class="help">Tap a source in Select mode to change its strength or delete it. Buildings block water; water tanks collect it.</p>
        </div>`;
    } else if (cat.id === 'world') {
      const s = this.settings.get();
      body = `
        <div class="section" style="margin-top:0"><h4>Time & atmosphere</h4>
          ${this._slider('hour', 'Time of day', 0, 24, 0.25, this.sim.hour, (v) => formatClock(v * 60))}
          ${this._switch('dayCycle', 'Day / night cycle', this.sim.dayCycle)}
          ${this._slider('wind', 'Wind', 0, 1.6, 0.05, s.wind, (v) => (+v).toFixed(2))}
          ${this._slider('cloud', 'Clouds', 0, 1, 0.05, s.cloud, (v) => `${Math.round(v * 100)}%`)}
          ${this._switch('grid', 'Always show build grid', s.grid)}
        </div>
        <div class="section"><h4>Graphics</h4>
          <div class="seg" id="seg-quality">${['auto', 'high', 'balanced', 'low'].map((q) => `<button data-q="${q}" class="${s.quality === q ? 'on' : ''}">${q[0].toUpperCase() + q.slice(1)}</button>`).join('')}</div>
          <p class="help" id="q-help">Auto lowers the resolution if the frame rate drops.</p>
          <div class="kv"><span>Frame rate</span><b id="ws-fps">–</b></div>
          <div class="kv"><span>Resolution scale</span><b id="ws-res">–</b></div>
        </div>
        <div class="section"><h4>World</h4>
          <div class="kv"><span>Seed</span><b>${this.world.seed}</b></div>
          <div class="kv"><span>Last saved</span><b id="ws-saved">–</b></div>
          <div class="btn-row" style="margin-top:10px">
            <button class="btn primary" data-act="save">${icon('save', 16)}Save World</button>
            <button class="btn" data-act="load" ${this.save.hasSave() ? '' : 'disabled'}>${icon('folder', 16)}Load World</button>
          </div>
          <div class="btn-row" style="margin-top:8px"><button class="btn danger" data-act="new">${icon('sparkle', 16)}New World</button></div>
          <p class="help">The world is saved automatically every few seconds in this browser.</p>
        </div>
        <div class="section"><h4>Controls</h4>
          <p class="help">Drag: rotate · Right-drag / Shift+drag: move · Wheel: zoom · WASD/arrows: move · Q/E: turn · R: rotate building · Esc: cancel · Space: play/pause. On touch: one finger rotates or moves (button on the right), two fingers pinch, move and twist.</p>
        </div>`;
    }
    this.el.panel.innerHTML = `<div class="panel-title"><span>${cat.label}</span><button class="close" data-act="close-panel" aria-label="Close">${icon('x', 16)}</button></div>${body}`;
    for (const r of this.el.panel.querySelectorAll('input[type=range]')) r.style.setProperty('--fill', this._fill(r));
    this.refreshSelectionState();
    this._refreshSaveInfo();
  }

  _fill(r) { return `${((r.value - r.min) / (r.max - r.min)) * 100}%`; }

  refreshSelectionState() {
    const t = this.tools;
    for (const c of this.el.panel.querySelectorAll('.card')) {
      const tool = c.dataset.tool, key = c.dataset.key;
      const on = (tool === 'build' && t.mode === 'build' && t.key === key) || (tool === 'road' && t.mode === 'road') || (tool === t.mode && ['pour', 'source', 'drain'].includes(tool));
      c.classList.toggle('selected', on);
    }
  }

  _panelClick(e) {
    const tools = this.tools, world = this.world;
    const card = e.target.closest('.card');
    if (card) {
      const tool = card.dataset.tool;
      if (tool === 'build') tools.setMode('build', card.dataset.key);
      else tools.setMode(tool);
      this.refreshSelectionState();
      return;
    }
    const sw = e.target.closest('[data-sw]');
    if (sw) {
      const on = sw.getAttribute('aria-checked') !== 'true';
      sw.setAttribute('aria-checked', on);
      switch (sw.dataset.sw) {
        case 'sourcesEnabled': world.water.params.sourcesEnabled = on; this.save.markDirty(); break;
        case 'dayCycle': this.sim.dayCycle = on; this.save.markDirty(); break;
        case 'grid': this.settings.apply({ grid: on }); break;
      }
      return;
    }
    const q = e.target.closest('[data-q]');
    if (q) {
      this.settings.apply({ quality: q.dataset.q });
      for (const b of $('#seg-quality').children) b.classList.toggle('on', b === q);
      return;
    }
    const a = e.target.closest('[data-act]');
    if (!a) return;
    switch (a.dataset.act) {
      case 'close-panel': this.closePanel(); break;
      case 'save': this.save.save(false); break;
      case 'load':
        this.confirm({ title: 'Load saved world?', text: 'Your current world will be replaced by the last saved one.', ok: 'Load' }).then((ok) => { if (ok) this.save.load(); });
        break;
      case 'new': this.newWorldDialog(); break;
      case 'reset-water':
        this.confirm({ title: 'Reset the water?', text: 'All water returns to the lake and river of the starting world. Buildings stay.', ok: 'Reset water' }).then((ok) => { if (ok) { world.water.resetToInitial(); this.toast('Water reset', 'ok'); this.save.markDirty(); } });
        break;
      case 'clear-water': world.water.clearAll(); this.toast('All water removed', 'ok'); this.save.markDirty(); break;
    }
  }

  _panelInput(e) {
    const r = e.target;
    if (!r.matches('input[type=range]')) return;
    const v = Number(r.value), k = r.dataset.key;
    r.style.setProperty('--fill', this._fill(r));
    const out = this.el.panel.querySelector(`[data-val="${k}"]`);
    const w = this.world;
    switch (k) {
      case 'flowSpeed': w.water.params.flowSpeed = v; out.textContent = `×${v.toFixed(2)}`; this.save.markDirty(); break;
      case 'sourceRate': w.water.params.sourceRate = v; out.textContent = `×${v.toFixed(2)}`; this.save.markDirty(); break;
      case 'brush': this.tools.brushRadius = v; out.textContent = `${v} m`; break;
      case 'hour': this.sim.setHour(v); out.textContent = formatClock(v * 60); break;
      case 'wind': this.settings.apply({ wind: v }); out.textContent = v.toFixed(2); break;
      case 'cloud': this.settings.apply({ cloud: v }); out.textContent = `${Math.round(v * 100)}%`; break;
    }
  }

  syncControls() { if (this.cat) this.renderPanel(); }

  _refreshSaveInfo() {
    const el = $('#ws-saved');
    if (!el) return;
    const d = this._lastSaved || (this.save.readRaw() ? new Date(this.save.readRaw().savedAt) : null);
    el.textContent = d ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'never';
  }

  // ------------------------------------------------------------ info panel
  renderInfo(sel) {
    const el = this.el.info;
    if (!sel) { el.classList.add('closed'); return; }
    const bs = this.world.buildings;
    let ic = 'info', title = '', sub = '', desc = '', extra = '', del = false;
    if (sel.kind === 'building') {
      const b = bs.buildings.get(sel.id); if (!b) return;
      const t = TYPES[b.key];
      ic = t.icon; title = t.name; sub = CATEGORIES.find((c) => c.id === t.category).label; desc = t.desc; del = true;
    } else if (sel.kind === 'road') { ic = 'road'; title = 'Road segment'; sub = 'Infrastructure'; desc = 'A paved tile that follows the ground.'; del = true; }
    else if (sel.kind === 'source') {
      const s = this.world.water.getSource(sel.id); if (!s) return;
      ic = 'source'; title = 'Water source'; sub = 'Water tools'; desc = 'Adds water to the world at a steady rate while sources are flowing.'; del = true;
      extra = `<div class="stack"><div class="top"><label>Strength</label><span class="val" id="src-rate-v">${s.rate.toFixed(1)} m³/s</span></div>
        <input type="range" data-src-rate="1" min="1" max="30" step="0.5" value="${s.rate}"></div>`;
    } else if (sel.kind === 'water') { ic = 'wave'; title = 'Water'; sub = 'Terrain'; desc = 'Flows downhill and collects in low ground.'; }
    else { ic = 'globe'; title = 'Terrain'; sub = 'World'; desc = 'Natural ground.'; }
    el.innerHTML = `<div class="info-head"><div class="cicon">${icon(ic, 20)}</div><div><small>${sub}</small><h3>${title}</h3></div><button class="x" data-info="close" aria-label="Close">${icon('x', 16)}</button></div>
      <p class="info-desc">${desc}</p>${extra}<div id="info-dyn"></div>${del ? `<button class="btn danger" data-info="delete">${icon('trash', 16)}Delete</button>` : ''}`;
    const r = el.querySelector('input[type=range]'); if (r) r.style.setProperty('--fill', this._fill(r));
    this.refreshInfo();
    el.classList.remove('closed');
    if (isMobile()) this.closePanel();
  }

  refreshInfo() {
    const sel = this.tools.selection; if (!sel) return;
    const dyn = $('#info-dyn'); if (!dyn) return;
    const w = this.world, bs = w.buildings, f = w.field;
    const kv = (k, v, cls = '') => `<div class="kv"><span>${k}</span><b class="${cls}">${v}</b></div>`;
    let h = '';
    if (sel.kind === 'building') {
      const b = bs.buildings.get(sel.id);
      if (!b) { this.tools.select(null); return; }
      const t = TYPES[b.key];
      h += kv('Footprint', `${b.w}×${b.d} cells · ${b.w * CELL}×${b.d * CELL} m`);
      h += kv('Elevation', `${b.y.toFixed(1)} m`);
      if (t.kind === 'house') h += kv('Residents', `${b.state.residents} / ${t.capacity}`, b.state.residents ? 'good' : '');
      if (t.kind === 'factory') h += kv('Jobs offered', t.jobs);
      if (t.kind === 'tank') {
        const s = w.water.sinks.find((q) => q.id === b.sinkId);
        const st = s ? s.stored : 0;
        h += kv('Stored water', `${Math.round(st).toLocaleString()} / ${t.capacity.toLocaleString()} m³`, st > 0 ? 'good' : '');
      }
      if (t.kind === 'farm') { const ir = bs.irrigation(b); h += kv('Irrigation', ir.label, ir.label === 'None nearby' ? 'warn' : 'good'); }
      if (t.solid !== false) { const fl = bs.floodInfo(b); h += kv('Flood status', fl.label, fl.depth > 0.5 ? 'bad' : fl.depth > 0.03 ? 'warn' : 'good'); }
      h += kv('Cell', `${b.cx}, ${b.cz}`);
    } else if (sel.kind === 'road') {
      h += kv('Elevation', `${f.heightAt((sel.cx + 0.5) * CELL - N * CELL / 2, (sel.cz + 0.5) * CELL - N * CELL / 2).toFixed(1)} m`);
      h += kv('Cell', `${sel.cx}, ${sel.cz}`);
    } else if (sel.kind === 'source') {
      const s = w.water.getSource(sel.id); if (!s) { this.tools.select(null); return; }
      h += kv('State', w.water.params.sourcesEnabled ? 'Flowing' : 'Stopped', w.water.params.sourcesEnabled ? 'good' : 'warn');
      h += kv('Effective rate', `${(s.rate * w.water.params.sourceRate).toFixed(1)} m³/s`);
      h += kv('Node', `${s.i}, ${s.j}`);
    } else if (sel.kind === 'water') {
      const d = w.water.depthAt(sel.x, sel.z), v = w.water.velocityAt(sel.x, sel.z);
      h += kv('Depth', `${d.toFixed(2)} m`);
      h += kv('Surface level', `${(f.heightAt(sel.x, sel.z) + d).toFixed(1)} m`);
      h += kv('Flow speed', `${v.toFixed(2)} m/s`, v > 0.4 ? 'good' : '');
    } else {
      const cx = Math.floor((sel.x + N * CELL / 2) / CELL), cz = Math.floor((sel.z + N * CELL / 2) / CELL);
      const ev = bs.evaluateRoad(cx, cz);
      h += kv('Elevation', `${f.heightAt(sel.x, sel.z).toFixed(1)} m`);
      h += kv('Slope', `${Math.round(f.slopeAt(sel.x, sel.z) * 100)}%`);
      h += kv('Buildable', ev.ok ? 'Yes' : ev.reason, ev.ok ? 'good' : 'warn');
    }
    dyn.innerHTML = h;
  }

  // ------------------------------------------------------------ small widgets
  setHint(h) {
    const el = this.el.hint;
    if (!h) { el.classList.remove('show'); return; }
    el.textContent = h.text;
    el.classList.add('show');
    el.classList.toggle('ok', !!h.ok); el.classList.toggle('bad', !h.ok);
  }

  refreshAction() {
    const t = this.tools, a = this.el.action;
    if (t.mode === 'select' || t.mode === 'pour' || t.mode === 'drain') { a.classList.add('closed'); this.setHint(null); return; }
    const name = t.mode === 'build' ? TYPES[t.key].name : t.mode === 'road' ? 'Road' : 'Water Source';
    const ic = t.mode === 'build' ? TYPES[t.key].icon : t.mode === 'road' ? 'road' : 'source';
    a.innerHTML = `<div class="ab-name">${icon(ic, 18)}<span>${name}</span></div>
      ${t.mode === 'build' && TYPES[t.key].w !== TYPES[t.key].d ? `<button class="ab-btn" data-ab="rot" title="Rotate (R)">${icon('rot', 18)}</button>` : t.mode === 'build' && t.key !== 'tree' ? `<button class="ab-btn" data-ab="rot" title="Rotate (R)">${icon('rot', 18)}</button>` : ''}
      <button class="ab-btn ok" data-ab="ok" title="Place (Enter)">${icon('check', 20)}<span>Place</span></button>
      <button class="ab-btn no" data-ab="no" title="Cancel (Esc)">${icon('x', 18)}</button>`;
    a.classList.remove('closed');
  }

  toast(text, kind = '') {
    const d = document.createElement('div');
    d.className = `toast ${kind}`; d.textContent = text;
    this.el.toasts.appendChild(d);
    while (this.el.toasts.children.length > 3) this.el.toasts.firstChild.remove();
    setTimeout(() => { d.classList.add('out'); setTimeout(() => d.remove(), 320); }, 2200);
  }

  confirm({ title, text, ok = 'OK', danger = false }) {
    return new Promise((resolve) => {
      const bg = document.createElement('div');
      bg.className = 'modal-bg';
      bg.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><h3>${title}</h3><p>${text}</p>
        <div class="btn-row"><button class="btn" data-m="no">Cancel</button><button class="btn ${danger ? 'danger' : 'primary'}" data-m="ok">${ok}</button></div></div>`;
      const done = (v) => { bg.remove(); resolve(v); };
      bg.addEventListener('click', (e) => { const b = e.target.closest('[data-m]'); if (b) done(b.dataset.m === 'ok'); else if (e.target === bg) done(false); });
      this.el.modal.appendChild(bg);
      bg.querySelector('[data-m=ok]').focus();
    });
  }

  newWorldDialog() {
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><h3>New world</h3>
      <p>This replaces your current world (the current save is overwritten as soon as you start playing).</p>
      <div class="btn-row" style="flex-direction:column">
        <button class="btn primary" data-m="classic">${icon('globe', 16)}Classic valley (default map)</button>
        <button class="btn" data-m="random">${icon('sparkle', 16)}Random world</button>
        <button class="btn" data-m="no">Cancel</button></div></div>`;
    bg.addEventListener('click', (e) => {
      const b = e.target.closest('[data-m]');
      if (!b && e.target !== bg) return;
      const m = b?.dataset.m;
      bg.remove();
      if (m === 'classic') { this.save.newWorld(DEFAULT_SEED); this.syncControls(); this.toast('New world created', 'ok'); }
      else if (m === 'random') { this.save.newWorld((Math.random() * 1e6) | 0); this.syncControls(); this.toast('New random world created', 'ok'); }
    });
    this.el.modal.appendChild(bg);
  }

  // ------------------------------------------------------------ periodic refresh
  refreshSim() {
    const s = this.sim;
    $('#btn-play').innerHTML = icon(s.running ? 'pause' : 'play', 22);
    for (const b of $('#speed').children) b.classList.toggle('on', Number(b.dataset.speed) === s.speed);
    this.el.state.textContent = s.running ? `Running ×${s.speed}` : 'Paused';
    this.el.chip.classList.toggle('paused', !s.running);
  }

  refreshStats() {
    this.el.pop.textContent = this.world.buildings.population();
    this.el.bld.textContent = this.world.buildings.structureCount();
  }

  update(dt) {
    this._acc += dt; this._infoAcc += dt; this._slow += dt;
    if (this._acc > 0.25) {
      this._acc = 0;
      const s = this.sim, h = s.hour;
      $('#clock-t').textContent = formatClock(s.minutes);
      $('#clock-d').textContent = `Day ${s.day}`;
      const night = h < 6 || h >= 18;
      $('#clock').classList.toggle('night', night);
      const ic = $('#clock-ic'); const want = night ? 'moon' : 'sun';
      if (ic.dataset.i !== want) { ic.dataset.i = want; ic.innerHTML = icon(want, 18); }
      this.refreshStats();
      if (this.cat === 'world' && !this._dragging) {
        const r = this.el.panel.querySelector('[data-key=hour]');
        if (r && document.activeElement !== r) { r.value = h; r.style.setProperty('--fill', this._fill(r)); this.el.panel.querySelector('[data-val=hour]').textContent = formatClock(h * 60); }
      }
    }
    if (this._infoAcc > 0.4) { this._infoAcc = 0; this.refreshInfo(); }
    if (this._slow > 0.8) {
      this._slow = 0;
      if (this.cat === 'water') {
        const w = this.world.water;
        const vol = $('#ws-vol'); if (vol) vol.textContent = `${Math.round(w.totalVolume()).toLocaleString()} m³`;
        const wet = $('#ws-wet'); if (wet) wet.textContent = `${((w.wetNodeCount() / (VERTS * VERTS)) * 100).toFixed(1)} %`;
        const src = $('#ws-src'); if (src) src.textContent = `${w.sources.length}${w.params.sourcesEnabled ? '' : ' (stopped)'}`;
      }
      if (this.cat === 'world') {
        const f = $('#ws-fps'); if (f) f.textContent = `${Math.round(this.perf.fps)} fps`;
        const r = $('#ws-res'); if (r) r.textContent = `${this.world.renderer.getPixelRatio().toFixed(2)}×`;
      }
    }
  }
}
