// Economy + events. Everything here is computed from the real world:
//   water   = water stored in tanks (the simulated water the tank sinks collect)
//   food    = farms, scaled by real irrigation (nearby surface water) and flooding
//   energy  = solar (sun + clouds) and wind (the wind setting) against building demand
//   funds   = taxes + factory output - upkeep   (building costs only in Campaign)
//   stability = smoothed score of water / food / energy satisfaction and flooding
// `enforce` is false in Sandbox: the numbers are shown but nothing is consumed or
// charged, so Sandbox behaves exactly as before. In Campaign `enforce` is true.
import { Emitter, clamp } from './utils.js';
import { TYPES } from './buildings.js';
import { CELL, HALF, N } from './config.js';

export const ECON = {
  house_small:   { cost: 150, upkeep: 1, power: 4 },
  house_medium:  { cost: 320, upkeep: 2, power: 8 },
  factory_small: { cost: 900, upkeep: 8, power: 30, jobs: 12, output: 90 },
  farm:          { cost: 400, upkeep: 3, power: 5, food: 60 },
  water_tank:    { cost: 300, upkeep: 2, power: 3 },
  solar_plant:   { cost: 450, upkeep: 3, solar: 60 },
  wind_turbine:  { cost: 600, upkeep: 2, windBase: 8, windGain: 28 },
  tree:          { cost: 5, upkeep: 0 },
  road:          { cost: 8, upkeep: 0 },
  source:        { cost: 150, upkeep: 0 },   // water source (Campaign: costs funds, strength capped at 10)
};
export const RATES = {
  waterPerResident: 1,   // water units per resident per game hour
  foodPerResident: 2,    // food units per resident per game hour
  workShare: 0.65,       // share of residents that can work
  tickMinutes: 3,        // economy resolution in game minutes
};
const IRR = { Excellent: 1, Good: 0.65, 'None nearby': 0.12 };

export class Economy extends Emitter {
  constructor(world, sim) {
    super();
    this.world = world; this.sim = sim;
    this.enforce = false;           // Campaign switches this on
    this.needs = new Set();         // which needs gate growth / are consumed in Campaign: 'water', 'food'
    this.funds0 = 0;
    this.funds = 0; this.food = 0;
    this.stability = 75;
    this.acc = 0;
    this.s = this._empty();         // last computed snapshot (rates, satisfaction)
    this.stats = { minStability: 100, elapsedGh: 0, flooded: 0 };
  }

  _empty() {
    return {
      pop: 0, houses: 0, jobs: 0, workers: 0,
      waterStock: 0, waterCap: 0, waterDemand: 0, wsat: 1,
      foodStock: 0, foodCap: 0, foodProd: 0, foodDemand: 0, fsat: 1,
      energyProd: 0, energyDemand: 0, esat: 1, solar: 0, wind: 0,
      income: 0, upkeep: 0, tax: 0, net: 0,
      flooded: 0, floodFrac: 0, farmsGood: 0, poweredFactories: 0, counts: {},
    };
  }

  reset({ funds = 0, food = 0 } = {}) {
    this.funds = funds; this.food = food; this.stability = 75; this.acc = 0;
    this.stats = { minStability: 100, elapsedGh: 0, flooded: 0 };
    this.s = this._empty();
    this.refresh();
  }

  // ------------------------------------------------------------ costs (Campaign only)
  costOf(key, n = 1) { return Math.round((ECON[key]?.cost || 0) * n); }
  canAfford(amount) { return !this.enforce || this.funds >= amount; }
  charge(amount) { if (this.enforce && amount > 0) { this.funds -= amount; this.emit('funds'); } }
  refund(key) { if (this.enforce) { this.funds += Math.round((ECON[key]?.cost || 0) * 0.5); this.emit('funds'); } }

  // ------------------------------------------------------------ measurement
  /** Recompute the snapshot from the world without changing any stock. */
  refresh(gh = 0) {
    const w = this.world, bs = w.buildings, s = this._empty();
    const hour = this.sim.hour;
    const sun = Math.max(0, Math.sin(Math.PI * (hour - 6) / 12)) * (1 - 0.45 * clamp(w.cloud ?? 0.45, 0, 1));
    const windF = clamp((w.wind ?? 0.6) / 1.6, 0, 1);
    const work = hour >= 7 && hour < 19, evening = hour >= 18 || hour < 6;
    let floodedHouses = 0;
    for (const b of bs.buildings.values()) {
      const e = ECON[b.key]; if (!e) continue;
      s.counts[b.key] = (s.counts[b.key] || 0) + 1;
      s.upkeep += e.upkeep || 0;
      const t0 = TYPES[b.key];
      const dem = (e.power || 0) * (t0.kind === 'factory' ? (work ? 1 : 0.2) : t0.kind === 'house' ? (evening ? 1.4 : 1) : 1);   // factories work by day, homes use more at night
      s.energyDemand += dem;
      if (e.solar) s.solar += e.solar * sun;
      if (e.windBase !== undefined) s.wind += e.windBase + e.windGain * windF;
      const t = TYPES[b.key];
      if (t.kind === 'house') {
        s.pop += b.state.residents; s.houses++;
        if (bs.floodInfo(b).depth > 0.5) floodedHouses++;
      } else if (t.kind === 'factory') s.jobs += e.jobs;
    }
    s.energyProd = s.solar + s.wind;
    s.esat = s.energyDemand <= 0 ? 1 : Math.min(1, s.energyProd / s.energyDemand);
    const eEff = !this.enforce || this.needs.has('energy') ? s.esat : 1;     // Campaign teaches power in stage 4
    // water: stock in tanks
    for (const k of w.water.sinks) { s.waterStock += k.stored; s.waterCap += k.capacity ?? 0; }
    s.waterDemand = s.pop * RATES.waterPerResident;
    // food
    let cap = 300;
    for (const b of bs.buildings.values()) {
      if (b.key !== 'farm') continue;
      cap += 500;
      const ir = bs.irrigation(b);
      if (ir.label !== 'None nearby') s.farmsGood++;
      const flooded = bs.floodInfo(b).depth > 0.5;
      s.foodProd += flooded ? 0 : ECON.farm.food * (IRR[ir.label] ?? 0.12) * (0.6 + 0.4 * eEff);
    }
    s.foodCap = cap; s.foodStock = this.food;
    s.foodDemand = s.pop * RATES.foodPerResident;
    // satisfaction (against what a full tick would need)
    const need = (d) => Math.max(1e-9, d * (gh || 1 / 20));
    s.wsat = s.waterDemand <= 0 ? 1 : clamp(s.waterStock / need(s.waterDemand), 0, 1);
    s.fsat = s.foodDemand <= 0 ? 1 : clamp((this.food + s.foodProd * (gh || 1 / 20)) / need(s.foodDemand), 0, 1);
    // economy
    s.workers = Math.min(s.jobs, Math.round(s.pop * RATES.workShare));
    const fill = s.jobs ? s.workers / s.jobs : 0;
    s.poweredFactories = (s.counts.factory_small || 0) * (fill > 0.5 && eEff > 0.5 ? 1 : 0);
    s.income = (s.counts.factory_small || 0) * ECON.factory_small.output * fill * eEff;
    s.tax = s.pop * 1.5 * (0.5 + 0.5 * this.stability / 100);
    s.net = s.income + s.tax - s.upkeep;
    s.flooded = floodedHouses;
    s.floodFrac = s.houses ? floodedHouses / s.houses : 0;
    s.stability = this.stability;
    s.funds = this.funds;
    this.s = s;
    return s;
  }

  update(gameMinutes) {
    this.acc += gameMinutes;
    if (this.acc < RATES.tickMinutes) return;
    const gm = this.acc; this.acc = 0;
    const gh = gm / 60;
    const s = this.refresh(gh);
    this.stats.elapsedGh += gh;
    if (this.enforce) {
      // water drawn from the tanks, proportionally
      const take = this.needs.has('water') ? Math.min(s.waterStock, s.waterDemand * gh) : 0;
      if (take > 0 && s.waterStock > 0) for (const k of this.world.water.sinks) k.stored = Math.max(0, k.stored - take * (k.stored / s.waterStock));
      // food
      this.food = clamp(this.food + (s.foodProd - (this.needs.has('food') ? s.foodDemand : 0)) * gh, 0, s.foodCap);
      this.funds += s.net * gh;
    }
    // stability: smoothed target
    const ws = !this.enforce || this.needs.has('water') ? s.wsat : 1, fs = !this.enforce || this.needs.has('food') ? s.fsat : 1;
    let target = s.pop <= 0 ? 75 : 100 * (0.30 * ws + 0.30 * fs + 0.20 * (this.enforce && !this.needs.has('energy') ? 1 : s.esat) + 0.20 * (1 - s.floodFrac));
    if (this.enforce && this.funds < 0) target -= 15;
    this.stability = clamp(this.stability + (target - this.stability) * Math.min(1, gh * 0.35), 0, 100);
    if (s.pop > 0) this.stats.minStability = Math.min(this.stats.minStability, this.stability);
    this.stats.flooded = Math.max(this.stats.flooded, s.flooded);
    this.s.stability = this.stability; this.s.funds = this.funds;
    this.emit('tick', this.s);
  }

  shock(points) { this.stability = clamp(this.stability - points, 0, 100); this.stats.minStability = Math.min(this.stats.minStability, this.stability); }

  /** Population rules used by the simulation in Campaign (houses fill only when needs are met). */
  canGrow() { const s = this.s, n = this.needs; return (!n.has('water') || s.wsat >= 0.5) && (!n.has('food') || s.fsat >= 0.5) && this.stability >= 30; }
  mustLeave() { const s = this.s, n = this.needs; return s.pop > 0 && ((n.has('water') && s.wsat < 0.1) || (n.has('food') && s.fsat < 0.1)); }

  serialize() { return { funds: Math.round(this.funds), food: Math.round(this.food), stability: +this.stability.toFixed(2), stats: this.stats }; }
  load(d = {}) {
    this.funds = d.funds ?? 0; this.food = d.food ?? 0; this.stability = d.stability ?? 75;
    this.stats = { minStability: 100, elapsedGh: 0, flooded: 0, ...(d.stats || {}) };
    this.acc = 0; this.refresh();
  }
}

// ---------------------------------------------------------------------------
// Natural events. They act on the real water simulation only.
export const EVENT_TYPES = {
  rain:    { rate: 1.9, volume: 2600, spots: 14, shock: 4 },     // sources x1.9 + rain on the whole map
  storm:   { rate: 2.0, volume: 3500, spots: 18, shock: 8 },     // heavy rain: flash floods
  drought: { rate: 0.3, volume: -90, spots: 20, shock: 3 },      // sources x0.3 and evaporation
};

export class EventSystem extends Emitter {
  constructor(world, economy) {
    super();
    this.world = world; this.economy = economy;
    this.active = null;           // { type, remaining, total, mult, id }
    this.done = [];               // ids of finished events
    this._rng = 1;
    this._t = 0;                  // game hours since boot (drives the auto scheduler)
    // Automatic disasters (sandbox): random gaps, weighted by current weather, warned ahead.
    this.auto = { enabled: false, minGap: 10, maxGap: 28, warn: 3, nextAt: Infinity, warned: false, nextType: 'rain', nextDur: 5, seq: 0 };
  }

  _scheduleNext() {
    const a = this.auto, span = a.maxGap - a.minGap;
    a.nextAt = this._t + a.minGap + this._rand() * span;
    a.warned = false;
    // pick the type now so the warning can name it; weight by the current sky
    const cloud = this.world.cloud ?? 0.45;
    const w = [
      ['rain', 0.25 + cloud * 0.9],
      ['storm', 0.05 + cloud * cloud * 0.7],
      ['drought', 0.08 + (1 - cloud) * (1 - cloud) * 0.8],
    ];
    let r = this._rand() * w.reduce((s, x) => s + x[1], 0), pick = 'rain';
    for (const [k, v] of w) { r -= v; if (r <= 0) { pick = k; break; } }
    a.nextType = pick;
    a.nextDur = pick === 'drought' ? 8 + this._rand() * 7 : pick === 'storm' ? 2 + this._rand() * 2.5 : 4 + this._rand() * 4;
  }

  _autoUpdate(gh) {
    const a = this.auto;
    this._t += gh;
    if (!a.enabled) return;
    if (this.active) return;
    if (!isFinite(a.nextAt)) this._scheduleNext();
    if (!a.warned && this._t >= a.nextAt - a.warn) {
      a.warned = true;
      this.emit('warn', { type: a.nextType, hours: Math.max(1, Math.round(a.nextAt - this._t)) });
    }
    if (this._t >= a.nextAt) {
      this.start(a.nextType, a.nextDur, 'auto-' + (++a.seq));
      this._scheduleNext();
    }
  }

  _rand() { this._rng = (this._rng * 1664525 + 1013904223) >>> 0; return this._rng / 4294967296; }

  start(type, hours, id = type) {
    if (this.active) this.stop(false);
    const d = EVENT_TYPES[type]; if (!d) return false;
    const wp = this.world.water.params;
    wp.sourceRate *= d.rate;
    this.active = { type, id, remaining: hours, total: hours, mult: d.rate };
    this.economy.shock(d.shock);
    this.emit('start', this.active);
    return true;
  }

  stop(finished = true) {
    const a = this.active; if (!a) return;
    this.world.water.params.sourceRate /= a.mult;
    this.active = null;
    if (finished) this.done.push(a.id);
    this.emit('end', a);
  }

  /** Hard-stop an active event and silence the scheduler (campaign takes over). */
  setAutoEnabled(on) {
    this.auto.enabled = !!on;
    if (on && !isFinite(this.auto.nextAt)) this._scheduleNext();
  }

  update(gameMinutes) {
    this._autoUpdate(gameMinutes / 60);
    const a = this.active; if (!a) return;
    const gh = gameMinutes / 60, d = EVENT_TYPES[a.type];
    const w = this.world.water;
    const per = d.volume * gh / d.spots;
    for (let i = 0; i < d.spots; i++) {
      const x = (this._rand() * 2 - 1) * (HALF - 12), z = (this._rand() * 2 - 1) * (HALF - 12);
      w.addVolume(x, z, 18, per);
    }
    a.remaining -= gh;
    if (a.remaining <= 0) this.stop(true);
  }

  serialize() { return { active: this.active, done: this.done, rng: this._rng, t: this._t, auto: { ...this.auto } }; }
  load(d = {}) {
    // sourceRate is saved already multiplied by an active event, so just restore the record
    this.active = d.active || null; this.done = d.done || []; this._rng = d.rng || 1; this._t = d.t || 0;
    if (d.auto) Object.assign(this.auto, d.auto);
  }
  /** Forget any event without touching the water parameters (used when a world is rebuilt). */
  clear() { this.active = null; this.done = []; }
}
