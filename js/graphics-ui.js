// Graphics Settings page (modal). Generated from the schema in graphics.js, so
// every control maps to a key that the render systems actually read.
import { SCHEMA, KEYS, PRESETS, PRESET_ORDER } from './graphics.js';
import { runBenchmark } from './performance.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const CAP_NOTE = { float: 'Needs float render targets (not available here).', tex4096: 'Needs 4096 px textures (not available here).' };

export class GraphicsUI {
  constructor({ ui, world, gfx, perf, caps, onApplied }) {
    Object.assign(this, { ui, world, gfx, perf, caps, onApplied });
    this.root = null;
    this._timer = 0;
  }

  get isOpen() { return !!this.root; }

  open({ firstRun = false, suggestion = null } = {}) {
    if (this.root) return;
    const gfx = this.gfx;
    this.snapshot = { values: { ...gfx.values }, preset: gfx.preset, auto: gfx.auto, dyn: this.perf.dynamicRes };
    const bg = document.createElement('div');
    bg.className = 'modal-bg gfx-bg';
    bg.innerHTML = `<div class="modal gfx" role="dialog" aria-modal="true" aria-label="Graphics settings">
      <div class="gfx-head"><div><h3>Graphics</h3><p class="gfx-sub" id="gfx-sub"></p></div>
        <button class="close" data-g="cancel" aria-label="Close">✕</button></div>
      <div class="gfx-scroll">
        <div class="gfx-top">
          <div class="seg" id="gfx-presets">${PRESET_ORDER.map((p) => `<button data-preset="${p}">${p[0].toUpperCase() + p.slice(1)}</button>`).join('')}<button data-preset="custom" disabled>Custom</button></div>
          <div class="gfx-row"><div><b>Auto Graphics Mode</b><span>Lowers quality when the frame rate drops and restores it when stable.</span></div><button class="switch" role="switch" id="gfx-auto" aria-checked="false"></button></div>
          <div class="gfx-row"><div><b>Dynamic resolution</b><span>Scales the render resolution to hold the target frame rate.</span></div><button class="switch" role="switch" id="gfx-dyn" aria-checked="true"></button></div>
          <div class="gfx-suggest" id="gfx-suggest" hidden></div>
        </div>
        <div class="gfx-live">
          <div class="gfx-stats" id="gfx-stats"></div>
          <canvas id="gfx-graph" width="360" height="56"></canvas>
          <div class="gfx-events" id="gfx-events"></div>
        </div>
        ${SCHEMA.map((g) => `<div class="section"><h4>${g.group}</h4>${g.items.map((it) => this._row(it)).join('')}</div>`).join('')}
        <div class="section"><h4>This device</h4><div class="gfx-caps" id="gfx-caps"></div>
          <p class="help">Capabilities come from the browser's WebGL API. The renderer string is shown only to detect software rendering; the device model is never used.</p></div>
      </div>
      <div class="gfx-foot">
        <button class="btn" data-g="defaults">Restore Defaults</button>
        <button class="btn" data-g="detect" id="gfx-detect">Auto Detect</button>
        <span style="flex:1"></span>
        <button class="btn" data-g="cancel">Cancel</button>
        <button class="btn primary" data-g="apply">Apply Settings</button>
      </div></div>`;
    this.root = bg;
    this.ui.el.modal.appendChild(bg);
    this._wire(bg);
    this.refresh();
    if (suggestion) this._showSuggestion(suggestion, firstRun);
    this._onEvt = this.perf.onEvent(() => this._renderEvents());
    this._timer = setInterval(() => this._tick(), 250);
    this._tick();
  }

  _row(it) {
    const ok = this.gfx.supported(it.key);
    const note = !ok ? `<span class="gfx-na">${esc(CAP_NOTE[it.needs] || 'Not supported on this device.')}</span>` : '';
    const hint = it.hint ? `<span class="gfx-hint">${esc(it.hint)}</span>` : '';
    let ctl;
    if (it.type === 'select') {
      ctl = `<select data-key="${it.key}" ${ok ? '' : 'disabled'}>${it.options.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('')}</select>`;
    } else {
      ctl = `<div class="gfx-range"><input type="range" data-key="${it.key}" min="${it.min}" max="${it.max}" step="${it.step}" ${ok ? '' : 'disabled'}><b data-val="${it.key}"></b></div>`;
    }
    return `<div class="gfx-item ${ok ? '' : 'na'}" data-item="${it.key}"><div class="gfx-lab"><label>${esc(it.label)}</label>${hint}${note}</div>${ctl}</div>`;
  }

  _wire(bg) {
    bg.addEventListener('click', (e) => {
      const act = e.target.closest('[data-g]')?.dataset.g;
      if (act) { this._action(act); return; }
      const p = e.target.closest('[data-preset]');
      if (p && !p.disabled) { this.gfx.setPreset(p.dataset.preset); this.perf.autoLevel = PRESET_ORDER.indexOf(p.dataset.preset); this.perf.autoCeiling = this.perf.autoLevel; this.refresh(); return; }
      const sw = e.target.closest('.switch');
      if (sw) {
        const on = sw.getAttribute('aria-checked') !== 'true';
        sw.setAttribute('aria-checked', on);
        if (sw.id === 'gfx-auto') { this.gfx.auto = on; if (on) this.perf.startAuto(this.gfx.preset === 'custom' ? 'medium' : this.gfx.preset); this._sub(); }
        else this.perf.dynamicRes = on;
      }
    });
    bg.addEventListener('input', (e) => {
      const el = e.target, k = el.dataset?.key;
      if (!k) return;
      let v = el.type === 'range' ? Number(el.value) : el.value;
      if (el.tagName === 'SELECT') {
        const it = SCHEMA.flatMap((g) => g.items).find((i) => i.key === k);
        const opt = it.options.find(([ov]) => String(ov) === v);
        v = opt[0];
      }
      this.gfx.set({ [k]: v });
      this.refresh(k);
    });
    window.addEventListener('keydown', this._esc = (e) => { if (e.key === 'Escape' && this.root) this._action('cancel'); });
  }

  /** Re-sync controls with gfx.values. */
  refresh(except) {
    const root = this.root; if (!root) return;
    const v = this.gfx.values;
    for (const k of KEYS) {
      const el = root.querySelector(`[data-key="${k}"]`);
      if (!el || k === except) continue;
      if (el.type === 'range') el.value = v[k]; else el.value = String(v[k]);
    }
    for (const k of KEYS) {
      const el = root.querySelector(`[data-key="${k}"]`);
      if (!el) continue;
      const it = SCHEMA.flatMap((g) => g.items).find((i) => i.key === k);
      if (el.type === 'range') {
        el.style.setProperty('--fill', `${((el.value - el.min) / (el.max - el.min)) * 100}%`);
        root.querySelector(`[data-val="${k}"]`).textContent = it.fmt(+el.value);
      } else {
        for (const o of el.options) {
          const raw = it.options.find(([ov]) => String(ov) === o.value)[0];
          o.disabled = !this.gfx.optionSupported(k, raw);
        }
      }
    }
    for (const b of root.querySelectorAll('[data-preset]')) b.classList.toggle('on', b.dataset.preset === this.gfx.preset);
    root.querySelector('[data-preset="custom"]').style.display = this.gfx.preset === 'custom' ? '' : 'none';
    root.querySelector('#gfx-auto').setAttribute('aria-checked', this.gfx.auto);
    root.querySelector('#gfx-dyn').setAttribute('aria-checked', this.perf.dynamicRes);
    this._sub();
    const c = this.caps;
    root.querySelector('#gfx-caps').innerHTML = [
      ['WebGL', c.webgl2 ? '2' : '1'], ['Max texture', c.maxTexture + ' px'], ['Anisotropy', '×' + c.maxAniso], ['MSAA samples', c.maxSamples || 'none'],
      ['Float targets', c.float ? 'yes' : 'no'], ['GPU timer', c.timer ? 'yes' : 'no'], ['Screen', `${c.screenW}×${c.screenH} @${c.dpr.toFixed(2)}×`],
      ['Refresh rate', `≈${Math.round(this.gfx.refreshHz)} Hz (measured)`], ['Renderer', c.software ? 'software (no GPU)' : 'hardware'],
    ].map(([a, b]) => `<div class="kv"><span>${a}</span><b>${b}</b></div>`).join('');
  }

  _sub() {
    const el = this.root?.querySelector('#gfx-sub'); if (!el) return;
    el.textContent = `Preset: ${this.gfx.preset}${this.gfx.auto ? ' · Auto mode on' : ''} — changes preview live; Apply keeps them.`;
  }

  _showSuggestion(s, firstRun) {
    const el = this.root.querySelector('#gfx-suggest');
    el.hidden = false;
    el.innerHTML = `<b>${firstRun ? 'Suggested for this device' : 'Detected'}: ${s.preset[0].toUpperCase() + s.preset.slice(1)}</b><span>${s.notes.map(esc).join(' ')}</span>`;
  }

  _tick() {
    const root = this.root; if (!root) return;
    const p = this.perf;
    root.querySelector('#gfx-stats').innerHTML = [
      ['FPS', p.fps.toFixed(0)], ['Frame', p.frameMs.toFixed(1) + ' ms'], ['Worst', p.worstMs.toFixed(0) + ' ms'],
      ['Render (CPU)', p.renderMs.toFixed(1) + ' ms'], ['GPU', p.gpuMs == null ? 'n/a' : p.gpuMs.toFixed(1) + ' ms'],
      ['Resolution', Math.round(this.world.pixelRatio() / Math.min(devicePixelRatio || 1, 2) * 100) + '%'], ['Target', p.targetFps + ' FPS'],
    ].map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('');
    p.drawGraph(root.querySelector('#gfx-graph'));
    this._renderEvents();
  }

  _renderEvents() {
    const el = this.root?.querySelector('#gfx-events'); if (!el) return;
    el.textContent = this.perf.events.slice(0, 3).map((e) => e.msg).join('  ·  ');
  }

  async _action(act) {
    const gfx = this.gfx;
    if (act === 'defaults') {
      gfx.auto = false; this.perf.dynamicRes = true;
      gfx.setPreset(this.caps.touch ? 'medium' : 'high');
      this.refresh();
    } else if (act === 'detect') {
      const btn = this.root.querySelector('#gfx-detect');
      btn.disabled = true; btn.textContent = 'Testing…';
      const rec = await this.detect();
      btn.disabled = false; btn.textContent = 'Auto Detect';
      if (!this.root) return;
      gfx.setPreset(rec.preset);
      this.perf.autoLevel = PRESET_ORDER.indexOf(rec.preset); this.perf.autoCeiling = this.perf.autoLevel;
      this._showSuggestion(rec, false);
      this.refresh();
    } else if (act === 'cancel') {
      const s = this.snapshot;
      gfx.values = s.values; gfx.preset = s.preset; gfx.auto = s.auto; this.perf.dynamicRes = s.dyn;
      gfx.emit('change', gfx.values);
      this.close();
    } else if (act === 'apply') {
      gfx.firstRun = false;
      gfx.save();
      this.onApplied?.();
      this.close();
    }
  }

  async detect() {
    const bench = await runBenchmark(this.world, this.caps);
    return this.gfx.recommend(bench);
  }

  close() {
    clearInterval(this._timer);
    window.removeEventListener('keydown', this._esc);
    this._onEvt?.();
    this.root?.remove();
    this.root = null;
  }
}
