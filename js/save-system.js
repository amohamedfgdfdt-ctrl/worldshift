// LocalStorage persistence: auto-save, Save / Load / New World.
import { SAVE_KEY, SAVE_VERSION, CAMPAIGN_SAVE_KEY } from './config.js';
import { Emitter } from './utils.js';

export class SaveSystem extends Emitter {
  constructor({ world, sim, tools, settings }) {
    super();
    this.world = world; this.sim = sim; this.tools = tools; this.settings = settings;
    this.dirty = false;
    this._debounce = null;
    this.slot = 'sandbox';          // 'sandbox' | 'campaign' (separate localStorage keys)
    this.hooks = null;              // Campaign adds {collect(), apply(d)}
    world.buildings.on('change', () => this.markDirty());
    sim.on('state', () => this.markDirty());
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') this.save(true); });
    window.addEventListener('pagehide', () => this.save(true));
    setInterval(() => this.save(true), 10000);
  }

  get key() { return this.slot === 'campaign' ? CAMPAIGN_SAVE_KEY : SAVE_KEY; }

  /** Switch slot. Pending writes are cancelled so they cannot land in the wrong slot. */
  useSlot(slot) { clearTimeout(this._debounce); this.dirty = false; this.slot = slot; }

  markDirty() {
    this.dirty = true;
    clearTimeout(this._debounce);
    this._debounce = setTimeout(() => this.save(true), 1500);
  }

  hasSave() {
    try { return !!localStorage.getItem(this.key); } catch { return false; }
  }

  collect() {
    const w = this.world, water = w.water;
    return {
      v: SAVE_VERSION,
      savedAt: Date.now(),
      seed: w.seed,
      sim: this.sim.serialize(),
      water: {
        rle: water.encode(),
        flowSpeed: water.params.flowSpeed,
        sourceRate: water.params.sourceRate,
        sourcesEnabled: water.params.sourcesEnabled,
      },
      world: this.buildingsData(),
      settings: this.settings.get(),
      ...(this.slot === 'campaign' && this.hooks ? this.hooks.collect() : {}),
    };
  }

  buildingsData() { return this.world.buildings.serialize(); }

  save(auto = false) {
    if (this.slot === 'campaign' && !(this.hooks && this.hooks.active())) return false;   // never write a run-less campaign slot
    try {
      localStorage.setItem(this.key, JSON.stringify(this.collect()));
      this.dirty = false;
      this.emit('saved', { auto });
      return true;
    } catch (err) {
      console.warn('Save failed', err);
      this.emit('error', 'save.failed.d');
      return false;
    }
  }

  readRaw() {
    try {
      const s = localStorage.getItem(this.key);
      if (!s) return null;
      const d = JSON.parse(s);
      return d && d.v === SAVE_VERSION ? d : null;
    } catch { return null; }
  }

  load() {
    const d = this.readRaw();
    if (!d) return false;
    try {
      const w = this.world;
      this.tools.setMode('select');
      w.build(d.seed);
      w.buildings.load(d.world || {});
      w.water.params.flowSpeed = d.water?.flowSpeed ?? 1;
      w.water.params.sourceRate = d.water?.sourceRate ?? 1;
      w.water.params.sourcesEnabled = d.water?.sourcesEnabled ?? true;
      if (d.water?.rle) w.water.decode(d.water.rle);
      this.sim.load(d.sim || {});
      this.settings.apply({ ...(d.settings || {}), save: false });
      if (this.slot === 'campaign' && this.hooks) this.hooks.apply(d);
      w.refreshWaterTexture(); w.refreshCellTexture(); w.waterMesh.update(true);
      this.emit('loaded', d);
      return true;
    } catch (err) {
      console.error('Load failed', err);
      this.emit('error', 'save.loadfailed.d');
      return false;
    }
  }

  newWorld(seed) {
    const w = this.world;
    this.tools.setMode('select');
    w.build(seed);
    this.sim.minutes = 9 * 60; this.sim.animTime = 0;
    this.sim.economy?.reset?.();
    w.water.params.flowSpeed = 1; w.water.params.sourceRate = 1; w.water.params.sourcesEnabled = true;
    this.sim.emit('state');
    this.save(true);
    this.emit('new');
  }
}
