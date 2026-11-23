// LocalStorage persistence: auto-save, Save / Load / New World.
import { SAVE_KEY, SAVE_VERSION } from './config.js';
import { Emitter } from './utils.js';

export class SaveSystem extends Emitter {
  constructor({ world, sim, tools, settings }) {
    super();
    this.world = world; this.sim = sim; this.tools = tools; this.settings = settings;
    this.dirty = false;
    this._debounce = null;
    world.buildings.on('change', () => this.markDirty());
    sim.on('state', () => this.markDirty());
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') this.save(true); });
    window.addEventListener('pagehide', () => this.save(true));
    setInterval(() => this.save(true), 10000);
  }

  markDirty() {
    this.dirty = true;
    clearTimeout(this._debounce);
    this._debounce = setTimeout(() => this.save(true), 1500);
  }

  hasSave() {
    try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; }
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
    };
  }

  buildingsData() { return this.world.buildings.serialize(); }

  save(auto = false) {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.collect()));
      this.dirty = false;
      this.emit('saved', { auto });
      return true;
    } catch (err) {
      console.warn('Save failed', err);
      this.emit('error', 'Could not save (storage unavailable or full).');
      return false;
    }
  }

  readRaw() {
    try {
      const s = localStorage.getItem(SAVE_KEY);
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
      this.settings.apply(d.settings || {});
      w.refreshWaterTexture(); w.refreshCellTexture(); w.waterMesh.update(true);
      this.emit('loaded', d);
      return true;
    } catch (err) {
      console.error('Load failed', err);
      this.emit('error', 'The save file could not be loaded.');
      return false;
    }
  }

  newWorld(seed) {
    const w = this.world;
    this.tools.setMode('select');
    w.build(seed);
    this.sim.minutes = 9 * 60; this.sim.animTime = 0;
    w.water.params.flowSpeed = 1; w.water.params.sourceRate = 1; w.water.params.sourcesEnabled = true;
    this.sim.emit('state');
    this.save(true);
    this.emit('new');
  }
}
