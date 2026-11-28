// DOM user interface: top bar, category rail, flyout panels, info panel,
// camera buttons, simulation bar, action bar, toasts and dialogs.
import { icon } from './icons.js';
import { CATEGORIES, TYPES, typesOf } from './buildings.js';
import { t as tr, i18n, rsn } from './i18n.js';
import { formatClock } from './utils.js';
import { DEFAULT_SEED, CELL, N, VERTS, isTouchDevice } from './config.js';
import { windUniforms } from './vegetation.js';
import { WorldMap } from './map-ui.js';

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
    $('#btn-gfx').innerHTML = icon('sparkle', 20);
    $('#btn-map').innerHTML = icon('map', 20);
    this.mapUI = new WorldMap({ world: this.world, sim: this.sim });

    this._renderRail();

    const touch = isTouchDevice;
    this.el.cam.innerHTML = `
      <button class="cam-btn" data-cam="reset" title="${tr('ui.cam.reset')}">${icon('target', 20)}</button>
      <button class="cam-btn" data-cam="rotL" title="${tr('ui.cam.rotL')}">${icon('rotL', 20)}</button>
      <button class="cam-btn" data-cam="rotR" title="${tr('ui.cam.rotR')}">${icon('rotR', 20)}</button>
      <button class="cam-btn" data-cam="tilt" title="${tr('ui.cam.tilt')}">${icon('tilt', 20)}</button>
      <div class="cam-gap"></div>
      <button class="cam-btn" data-cam="in" title="${tr('ui.cam.in')}">${icon('plus', 20)}</button>
      <button class="cam-btn" data-cam="out" title="${tr('ui.cam.out')}">${icon('minus', 20)}</button>
      ${touch ? `<div class="cam-gap"></div><button class="cam-btn" data-cam="mode" title="${tr('ui.cam.mode')}">${icon('orbit', 20)}</button>` : ''}`;

    this.el.sim.innerHTML = `
      <button class="play-btn" id="btn-play" aria-label="${tr('ui.play')}" title="${tr('ui.play')}"></button>
      <div class="speed" id="speed">
        <button data-speed="1">×1</button><button data-speed="2">×2</button><button data-speed="4">×4</button>
      </div>
      <div class="sep"></div>
      <div class="clock" id="clock"><span id="clock-ic"></span><div><b id="clock-t">09:00</b><small id="clock-d">${tr('camp.day')} 1</small></div></div>
      <div class="sep"></div>
      <button class="reset-btn" id="btn-reset" title="${tr('ui.reset.title')}">${icon('reset', 18)}<span>${tr('ui.reset')}</span></button>`;
  }

  _wire() {
    const { tools, sim, world } = this;
    // rail
    this.el.rail.addEventListener('click', (e) => {
      const b = e.target.closest('[data-cat]'); if (!b) return;
      this.toggleCategory(b.dataset.cat);
    });
    $('#btn-settings').addEventListener('click', () => this.toggleCategory('world'));
    $('#btn-gfx').addEventListener('click', () => this.openGraphics?.());
    $('#btn-map').addEventListener('click', () => this.mapUI.toggle());

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
          this.toast(tr(this.controls.touchMode === 'rotate' ? 'ui.touch.rotate' : 'ui.touch.move'), 'ok');
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
      if (await this.confirm({ title: tr('ui.conf.sim.title'), text: tr('ui.conf.sim.text'), ok: tr('ui.reset') })) {
        sim.reset(); this.toast(tr('toast.simreset'), 'ok');
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
      if (e.target.closest('[data-info=connect]') && tools.selection?.kind === 'building') {
        const r = tools.connectBuilding(tools.selection.id);
        const msg = r.ok ? tr('tool.connected', { n: i18n.num(r.built) })
          : r.reason === 'already' ? tr('tool.alreadyconnected')
            : r.reason === 'noroad' ? tr('tool.noroadnear') : tr('tool.roadfail');
        this.toast(msg, r.ok ? 'ok' : 'warn');
        this.renderInfo(tools.selection);
        this.refreshStats();
      }
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
    this.save.on('saved', ({ auto }) => { if (!auto) this.toast(tr('toast.saved'), 'ok'); this._lastSaved = new Date(); this._refreshSaveInfo(); });
    this.save.on('error', (m) => this.toast(tr(m), 'warn'));
    this.save.on('loaded', () => { this.syncControls(); this.refreshSim(); this.toast(tr('toast.loaded'), 'ok'); });
    world.buildings.on('change', () => this.refreshStats());

    this.refreshSim(); this.refreshStats(); this.refreshAction();
  }

  _renderRail() {
    this.el.rail.innerHTML = CATEGORIES.map((c) => {
      const lab = tr('cat.' + c.id);
      return `<button class="rail-btn ${this.cat === c.id ? 'active' : ''}" data-cat="${c.id}" title="${lab}">${icon(c.icon, 22)}<span>${i18n.lang === 'en' ? lab.replace(' Tools', '').replace('World Settings', 'World') : lab.replace('أدوات ', '').replace('إعدادات ', '')}</span></button>`;
    }).join('');
  }
  /** Re-render the language-dependent parts (called when the language or mode changes). */
  rebuildLang() {
    this._renderRail(); if (this.cat) this.renderPanel(); if (this.tools.selection) this.renderInfo(this.tools.selection);
    for (const [k, key] of Object.entries({ reset: 'ui.cam.reset', rotL: 'ui.cam.rotL', rotR: 'ui.cam.rotR', tilt: 'ui.cam.tilt', in: 'ui.cam.in', out: 'ui.cam.out', mode: 'ui.cam.mode' })) {
      const b = this.el.cam.querySelector(`[data-cam="${k}"]`); if (b) b.title = tr(key);
    }
    const pb = $('#btn-play'); if (pb) { pb.title = tr('ui.play'); pb.setAttribute('aria-label', tr('ui.play')); }
    const rb = $('#btn-reset'); if (rb) { rb.title = tr('ui.reset.title'); const sp = rb.querySelector('span'); if (sp) sp.textContent = tr('ui.reset'); }
    const popChip = $('#stat-pop')?.closest('.chip'); if (popChip) { popChip.title = tr('hud.pop'); const l = popChip.querySelector('.lbl'); if (l) l.textContent = tr('hud.pop'); }
    const bldChip = $('#stat-bld')?.closest('.chip'); if (bldChip) { bldChip.title = tr('cat.buildings'); const l = bldChip.querySelector('.lbl'); if (l) l.textContent = tr('cat.buildings'); }
    const carChip = $('#stat-cars')?.closest('.chip'); if (carChip) { carChip.title = tr('hud.cars'); const l = carChip.querySelector('.lbl'); if (l) l.textContent = tr('hud.cars'); }
    const stChip = $('#chip-status'); if (stChip) stChip.title = tr('ui.state');
    const lt = $('#load-text'); if (lt) lt.textContent = tr('ui.loading');
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
    const nm = tr('b.' + t.key);
    const meta = t.special ? (i18n.lang === 'ar' ? 'طرق' : 'Roads') : `${t.w}×${t.d}${t.capacity && t.kind === 'house' ? ` · ${t.capacity} ${tr('unit.res')}` : t.jobs ? ` · ${t.jobs} ${tr('unit.jobs')}` : ''}`;
    const g = this.gameMode?.campaign.gate;               // Campaign: lock + cost badges
    const locked = !!g && g.isLocked(t.key) && t.key !== 'road';
    const cost = g ? this.sim.economy.costOf(t.key) : 0;
    const poor = g && !locked && cost > 0 && !this.sim.economy.canAfford(cost);
    return `<button class="card ${locked ? 'locked' : ''} ${poor ? 'noafford' : ''}" data-tool="${t.special || 'build'}" data-key="${t.key}">
      <div class="cicon">${icon(t.icon, 20)}</div><div class="cname">${nm}</div><div class="cmeta">${meta}</div>${locked ? `<span class="lock">${icon('lock', 14)}</span>` : cost ? `<span class="cost">${i18n.num(cost)}</span>` : ''}</button>`;
  }

  _slider(key, label, min, max, step, value, fmt) {
    return `<div class="stack"><div class="top"><label>${label}</label><span class="val" data-val="${key}">${fmt(value)}</span></div>
      <input type="range" data-key="${key}" min="${min}" max="${max}" step="${step}" value="${value}"></div>`;
  }
  _seg(key, label, opts, cur) {
    return `<div class="stack"><div class="top"><label>${label}</label></div><div class="btn-row">${opts.map(([v, l]) => `<button class="btn ${v === cur ? 'primary' : ''}" data-act="seg" data-key="${key}" data-v="${v}">${l}</button>`).join('')}</div></div>`;
  }
  _switch(key, label, on) {
    return `<div class="row"><label>${label}</label><button class="switch" role="switch" data-sw="${key}" aria-checked="${on}" aria-label="${label}"></button></div>`;
  }

  renderPanel() {
    const cat = CATEGORIES.find((c) => c.id === this.cat);
    if (!cat) { this.cat = null; this.el.panel.classList.add('closed'); return; }
    const w = this.world, wp = w.water.params;
    let body = '';
    if (['buildings', 'nature', 'infrastructure'].includes(cat.id)) {
      body = `<div class="cards">${typesOf(cat.id).map((t) => this._card(t)).join('')}</div>
        <p class="help">${tr(cat.id === 'infrastructure' ? 'help.infrastructure' : cat.id === 'nature' ? 'help.nature' : 'help.buildings')}</p>`;
    } else if (cat.id === 'water') {
      body = `<div class="cards">
          <button class="card" data-tool="pour"><div class="cicon">${icon('pour', 20)}</div><div class="cname">${tr('w.add')}</div><div class="cmeta">${tr('w.add.d')}</div></button>
          <button class="card" data-tool="source"><div class="cicon">${icon('source', 20)}</div><div class="cname">${tr('w.source')}</div><div class="cmeta">${tr('w.source.d')}</div></button>
          <button class="card" data-tool="drain"><div class="cicon">${icon('drain', 20)}</div><div class="cname">${tr('w.drain')}</div><div class="cmeta">${tr('w.drain.d')}</div></button>
        </div>
        <div class="section"><h4>${tr('w.flow')}</h4>
          ${this._switch('sourcesEnabled', tr('w.sources'), wp.sourcesEnabled)}
          ${this._slider('flowSpeed', tr('w.flowspeed'), 0.25, 1.6, 0.05, wp.flowSpeed, (v) => `×${(+v).toFixed(2)}`)}
          ${this._slider('sourceRate', tr('w.rate'), 0.25, 3, 0.05, wp.sourceRate, (v) => `×${(+v).toFixed(2)}`)}
          ${this._slider('brush', tr('w.brush'), 3, 16, 1, this.tools.brushRadius, (v) => `${v} m`)}
        </div>
        <div class="section"><h4>${tr('w.live')}</h4>
          <div class="kv"><span>${tr('w.vol')}</span><b id="ws-vol">–</b></div>
          <div class="kv"><span>${tr('w.wet')}</span><b id="ws-wet">–</b></div>
          <div class="kv"><span>${tr('w.srccount')}</span><b id="ws-src">–</b></div>
          <div class="btn-row" style="margin-top:10px"><button class="btn" data-act="reset-water">${icon('reset', 16)}${tr('w.reset')}</button><button class="btn" data-act="clear-water">${icon('drain', 16)}${tr('w.dry')}</button></div>
          <p class="help">${tr('help.water')}</p>
        </div>`;
    } else if (cat.id === 'world') {
      const s = this.settings.get();
      body = `
        <div class="section" style="margin-top:0"><h4>${tr('p.time')}</h4>
          ${this._slider('hour', tr('p.hour'), 0, 24, 0.25, this.sim.hour, (v) => formatClock(v * 60))}
          ${this._switch('dayCycle', tr('p.daycycle'), this.sim.dayCycle)}
          ${this._slider('wind', tr('p.wind'), 0, 1.6, 0.05, s.wind, (v) => (+v).toFixed(2))}
          ${this._slider('cloud', tr('p.cloud'), 0, 1, 0.05, s.cloud, (v) => `${Math.round(v * 100)}%`)}
          ${this._switch('grid', tr('p.grid'), s.grid)}
          ${this._switch('disasters', tr('p.disasters'), s.disasters !== false)}
          ${this._seg('evFreq', tr('p.evfreq'), [['rare', tr('p.rare')], ['normal', tr('p.normal')], ['frequent', tr('p.frequent')]], s.evFreq || 'normal')}
          ${this._seg('evPower', tr('p.evpower'), [['mild', tr('p.mild')], ['normal', tr('p.normal')], ['severe', tr('p.severe')]], s.evPower || 'normal')}
          <div class="btn-row" style="margin-top:8px">
            <button class="btn" data-act="ev-now" data-ev="rain">${tr('ev.rain')}</button><button class="btn" data-act="ev-now" data-ev="storm">${tr('ev.storm')}</button><button class="btn" data-act="ev-now" data-ev="drought">${tr('ev.drought')}</button>
          </div>
          <p class="help">${tr('help.evnow')}</p>
        </div>
        <div class="section"><h4>${tr('p.gfx')}</h4>
          <div class="kv"><span>${tr('p.preset')}</span><b id="ws-preset">–</b></div>
          <div class="kv"><span>${tr('p.fps')}</span><b id="ws-fps">–</b></div>
          <div class="kv"><span>${tr('p.res')}</span><b id="ws-res">–</b></div>
          <div class="btn-row" style="margin-top:10px"><button class="btn primary" data-act="gfx">${tr('p.gfxopen')}</button><button class="btn" data-act="preview">${tr('p.preview')}</button></div>
        </div>
        <div class="section"><h4>${tr('p.world')}</h4>
          <div class="kv"><span>${tr('p.seed')}</span><b>${this.world.seed}</b></div>
          <div class="kv"><span>${tr('p.lastsave')}</span><b id="ws-saved">–</b></div>
          <div class="btn-row" style="margin-top:10px">
            <button class="btn primary" data-act="save">${icon('save', 16)}${tr('p.save')}</button>
            <button class="btn" data-act="load" ${this.save.hasSave() ? '' : 'disabled'}>${icon('folder', 16)}${tr('p.load')}</button>
          </div>
          <div class="btn-row" style="margin-top:8px"><button class="btn danger" data-act="new">${icon('sparkle', 16)}${tr('p.new')}</button></div>
          <div class="btn-row" style="margin-top:8px"><button class="btn" data-act="tutorial">${icon('info', 16)}${tr('tut.replay')}</button></div>
          <p class="help">${tr('help.save')}</p>
        </div>
        <div class="section"><h4>${tr('p.controls')}</h4>
          <p class="help">${tr('help.controls')}</p>
        </div>`;
    }
    this.el.panel.innerHTML = `<div class="panel-title"><span>${tr('cat.' + cat.id)}</span><button class="close" data-act="close-panel" aria-label="${tr('ui.close')}">${icon('x', 16)}</button></div>${body}`;
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
        case 'disasters': this.settings.apply({ disasters: on }); break;
      }
      return;
    }
    const a = e.target.closest('[data-act]');
    if (!a) return;
    switch (a.dataset.act) {
      case 'close-panel': this.closePanel(); break;
      case 'seg': this.settings.apply({ [a.dataset.key]: a.dataset.v }); this.renderPanel(); break;
      case 'ev-now': {
        if (this.gameMode?.inCampaign) { this.toast(tr('cost.locked'), 'warn'); break; }
        const dur = { rain: 5, storm: 3, drought: 10 }[a.dataset.ev] || 5;
        this.sim.events.start(a.dataset.ev, dur, 'manual'); this.save.markDirty(); break;
      }
      case 'gfx': this.openGraphics?.(); break;
      case 'preview': this.closePanel(); this.openPreview?.(); break;
      case 'save': this.save.save(false); break;
      case 'load':
        this.confirm({ title: tr('ui.conf.load.title'), text: tr('ui.conf.load.text'), ok: tr('p.load') }).then((ok) => { if (ok) this.save.load(); });
        break;
      case 'new': if (this.gameMode?.inCampaign) { this.toast(tr('mode.campaign') + ': ' + tr('cost.locked'), 'warn'); break; } this.newWorldDialog(); break;
      case 'tutorial': this.closePanel(); this.onTutorial?.(); break;
      case 'reset-water':
        this.confirm({ title: tr('ui.conf.water.title'), text: tr('ui.conf.water.text'), ok: tr('ui.conf.water.ok') }).then((ok) => { if (ok) { world.water.resetToInitial(); this.toast(tr('toast.waterreset'), 'ok'); this.save.markDirty(); } });
        break;
      case 'clear-water': if (this.gameMode?.inCampaign) { this.toast(tr('cost.locked'), 'warn'); break; } world.water.clearAll(); this.toast(tr('toast.waterclear'), 'ok'); this.save.markDirty(); break;
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
      ic = t.icon; title = tr('b.' + t.key); sub = tr('cat.' + t.category); desc = tr('bd.' + t.key); del = true;
      if (t.kind !== 'tree' && !bs.accessCell(b)) extra = `<button class="btn" data-info="connect">${icon('road', 16)}${tr('tool.connect')}</button>`;
    } else if (sel.kind === 'road') { ic = 'road'; title = tr('i.road'); sub = tr('cat.infrastructure'); desc = tr('i.road.d'); del = true; }
    else if (sel.kind === 'source') {
      const s = this.world.water.getSource(sel.id); if (!s) return;
      ic = 'source'; title = tr('i.source'); sub = tr('cat.water'); desc = tr('i.source.d'); del = true;
      extra = `<div class="stack"><div class="top"><label>${tr('i.strength')}</label><span class="val" id="src-rate-v">${s.rate.toFixed(1)} m³/s</span></div>
        <input type="range" data-src-rate="1" min="1" max="${this.gameMode?.campaign.gate ? 10 : 30}" step="0.5" value="${s.rate}"></div>`;
    } else if (sel.kind === 'water') { ic = 'wave'; title = tr('i.water'); sub = tr('i.terrain'); desc = tr('i.water.d'); }
    else { ic = 'globe'; title = tr('i.terrain'); sub = tr('p.world'); desc = tr('i.terrain.d'); }
    el.innerHTML = `<div class="info-head"><div class="cicon">${icon(ic, 20)}</div><div><small>${sub}</small><h3>${title}</h3></div><button class="x" data-info="close" aria-label="${tr('ui.close')}">${icon('x', 16)}</button></div>
      <p class="info-desc">${desc}</p>${extra}<div id="info-dyn"></div>${del ? `<button class="btn danger" data-info="delete">${icon('trash', 16)}${tr('i.delete')}</button>` : ''}`;
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
      h += kv(tr('i.footprint'), `${b.w}×${b.d} cells · ${b.w * CELL}×${b.d * CELL} m`);
      h += kv(tr('i.elevation'), `${b.y.toFixed(1)} m`);
      if (t.kind !== 'tree') { const acc = bs.accessCell(b); h += kv(tr('i.roadaccess'), acc ? tr('i.connected') : tr('i.notconnected'), acc ? 'good' : 'warn'); }
      if (t.kind === 'house') h += kv(tr('i.residents'), `${b.state.residents} / ${t.capacity}`, b.state.residents ? 'good' : '');
      if (t.kind === 'factory') h += kv(tr('i.jobs'), t.jobs);
      if (t.kind === 'tank') {
        const s = w.water.sinks.find((q) => q.id === b.sinkId);
        const st = s ? s.stored : 0;
        h += kv(tr('i.stored'), `${Math.round(st).toLocaleString()} / ${t.capacity.toLocaleString()} m³`, st > 0 ? 'good' : '');
      }
      if (t.kind === 'power') { const o = this.sim.economy.s; h += kv(tr('hud.energy'), t.key === 'solar_plant' ? `${Math.round((o.solar || 0) / Math.max(1, o.counts.solar_plant || 1))} / 45` : `${Math.round((o.wind || 0) / Math.max(1, o.counts.wind_turbine || 1))} / 38`, 'good'); }
      if (t.kind === 'farm') { const ir = bs.irrigation(b); h += kv(tr('i.irrigation'), tr('irr.' + ir.label), ir.label === 'None nearby' ? 'warn' : 'good'); }
      if (t.solid !== false) { const fl = bs.floodInfo(b); h += kv(tr('i.flood'), tr('flood.' + fl.label), fl.depth > 0.5 ? 'bad' : fl.depth > 0.03 ? 'warn' : 'good'); }
      h += kv(tr('i.cell'), `${b.cx}, ${b.cz}`);
    } else if (sel.kind === 'road') {
      const ridx = sel.cz * N + sel.cx;
      h += kv(tr('i.bridge'), bs.bridges.has(ridx) ? tr('i.yes') : tr('i.no'));
      const lab = bs.net.label(sel.cx, sel.cz);
      let size = 0;
      if (lab >= 0) for (let k = 0; k < bs.net.labels.length; k++) if (bs.net.labels[k] === lab) size++;
      h += kv(tr('i.roadnet'), i18n.num(size));
      h += kv(tr('i.elevation'), `${bs.roadSurface(ridx).toFixed(1)} m`);
      h += kv(tr('i.cell'), `${sel.cx}, ${sel.cz}`);
    } else if (sel.kind === 'source') {
      const s = w.water.getSource(sel.id); if (!s) { this.tools.select(null); return; }
      h += kv(tr('i.state'), tr(w.water.params.sourcesEnabled ? 'i.flowing' : 'i.stopped'), w.water.params.sourcesEnabled ? 'good' : 'warn');
      h += kv(tr('i.effrate'), `${(s.rate * w.water.params.sourceRate).toFixed(1)} m³/s`);
      h += kv(tr('i.node'), `${s.i}, ${s.j}`);
    } else if (sel.kind === 'water') {
      const d = w.water.depthAt(sel.x, sel.z), v = w.water.velocityAt(sel.x, sel.z);
      h += kv(tr('i.depth'), `${d.toFixed(2)} m`);
      h += kv(tr('i.surface'), `${(f.heightAt(sel.x, sel.z) + d).toFixed(1)} m`);
      h += kv(tr('i.flowspeed'), `${v.toFixed(2)} m/s`, v > 0.4 ? 'good' : '');
    } else {
      const cx = Math.floor((sel.x + N * CELL / 2) / CELL), cz = Math.floor((sel.z + N * CELL / 2) / CELL);
      const ev = bs.evaluateRoad(cx, cz);
      h += kv(tr('i.elevation'), `${f.heightAt(sel.x, sel.z).toFixed(1)} m`);
      h += kv(tr('i.slope'), `${Math.round(f.slopeAt(sel.x, sel.z) * 100)}%`);
      h += kv(tr('i.buildable'), ev.ok ? tr('i.yes') : rsn(ev.reason), ev.ok ? 'good' : 'warn');
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
    const name = t.mode === 'build' ? tr('b.' + t.key) : t.mode === 'road' ? tr('ab.road') : tr('tool.watersource');
    const ic = t.mode === 'build' ? TYPES[t.key].icon : t.mode === 'road' ? 'road' : 'source';
    a.innerHTML = `<div class="ab-name">${icon(ic, 18)}<span>${name}</span></div>
      ${t.mode === 'build' && TYPES[t.key].w !== TYPES[t.key].d ? `<button class="ab-btn" data-ab="rot" title="${tr('ab.rotate')}">${icon('rot', 18)}</button>` : t.mode === 'build' && t.key !== 'tree' ? `<button class="ab-btn" data-ab="rot" title="${tr('ab.rotate')}">${icon('rot', 18)}</button>` : ''}
      <button class="ab-btn ok" data-ab="ok" title="${tr('ab.place')}">${icon('check', 20)}<span>${tr('ab.placelbl')}</span></button>
      <button class="ab-btn no" data-ab="no" title="${tr('ab.cancel')}">${icon('x', 18)}</button>`;
    a.classList.remove('closed');
  }

  /** Persistent, non-blocking notice with an action button. */
  banner(text, label, fn) {
    this.el.toasts.querySelector('.banner')?.remove();
    const d = document.createElement('div');
    d.className = 'toast banner';
    d.innerHTML = `<span></span><button class="btn small">${label}</button><button class="x" aria-label="${tr('ui.dismiss')}">✕</button>`;
    d.firstChild.textContent = text;
    d.querySelector('.btn').onclick = () => { d.remove(); fn(); };
    d.querySelector('.x').onclick = () => d.remove();
    this.el.toasts.appendChild(d);
    setTimeout(() => d.remove(), 14000);
  }

  toast(text, kind = '') {
    const d = document.createElement('div');
    d.className = `toast ${kind}`; d.textContent = text;
    this.el.toasts.appendChild(d);
    while (this.el.toasts.children.length > 3) this.el.toasts.firstChild.remove();
    setTimeout(() => { d.classList.add('out'); setTimeout(() => d.remove(), 320); }, 2200);
  }

  confirm({ title, text, ok = tr('ok'), danger = false }) {
    return new Promise((resolve) => {
      const bg = document.createElement('div');
      bg.className = 'modal-bg';
      bg.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><h3>${title}</h3><p>${text}</p>
        <div class="btn-row"><button class="btn" data-m="no">${tr('cancel')}</button><button class="btn ${danger ? 'danger' : 'primary'}" data-m="ok">${ok}</button></div></div>`;
      const done = (v) => { bg.remove(); resolve(v); };
      bg.addEventListener('click', (e) => { const b = e.target.closest('[data-m]'); if (b) done(b.dataset.m === 'ok'); else if (e.target === bg) done(false); });
      this.el.modal.appendChild(bg);
      bg.querySelector('[data-m=ok]').focus();
    });
  }

  newWorldDialog() {
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><h3>${tr('nw.title')}</h3>
      <p>${tr('nw.text')}</p>
      <div class="btn-row" style="flex-direction:column">
        <button class="btn primary" data-m="classic">${icon('globe', 16)}${tr('nw.classic')}</button>
        <button class="btn" data-m="random">${icon('sparkle', 16)}${tr('nw.random')}</button>
        <button class="btn" data-m="no">${tr('cancel')}</button></div></div>`;
    bg.addEventListener('click', (e) => {
      const b = e.target.closest('[data-m]');
      if (!b && e.target !== bg) return;
      const m = b?.dataset.m;
      bg.remove();
      if (m === 'classic') { this.save.newWorld(DEFAULT_SEED); this.syncControls(); this.toast(tr('toast.new'), 'ok'); }
      else if (m === 'random') { this.save.newWorld((Math.random() * 1e6) | 0); this.syncControls(); this.toast(tr('toast.newrand'), 'ok'); }
    });
    this.el.modal.appendChild(bg);
  }

  // ------------------------------------------------------------ periodic refresh
  refreshSim() {
    const s = this.sim;
    $('#btn-play').innerHTML = icon(s.running ? 'pause' : 'play', 22);
    for (const b of $('#speed').children) b.classList.toggle('on', Number(b.dataset.speed) === s.speed);
    this.el.state.textContent = s.running ? tr('sim.running', { s: s.speed }) : tr('sim.paused');
    this.el.chip.classList.toggle('paused', !s.running);
  }

  refreshStats() {
    this.el.pop.textContent = this.world.buildings.population();
    this.el.bld.textContent = this.world.buildings.structureCount();
    const cars = $('#stat-cars');
    if (cars) cars.textContent = i18n.num(this.world.traffic ? this.world.traffic.count : 0);
  }

  update(dt) {
    this._acc += dt; this._infoAcc += dt; this._slow += dt;
    if (this._acc > 0.25) {
      this._acc = 0;
      const s = this.sim, h = s.hour;
      $('#clock-t').textContent = formatClock(s.minutes);
      $('#clock-d').textContent = `${tr('camp.day')} ${i18n.num(s.day)}`;
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
        const r = $('#ws-res'); if (r) r.textContent = `${Math.round(this.world.pixelRatio() / Math.min(devicePixelRatio || 1, 2) * 100)}%`;
        const pr = $('#ws-preset'); if (pr) pr.textContent = this.world.gfxPresetLabel || '–';
      }
    }
  }
}
