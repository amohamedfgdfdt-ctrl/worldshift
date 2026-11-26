// Campaign engine: stage flow, objective evaluation against real world data, stars,
// unlocks and persistence. Sandbox is simply "no active campaign": nothing here runs.
import { Emitter, clamp } from './utils.js';
import { STEPS_PER_SEC, GAME_MIN_PER_SEC } from './config.js';
import { TYPES } from './buildings.js';
import { STAGES, BASE_KIT } from './campaign-data.js';
import { ECON } from './economy.js';
import { CAMPAIGN_SAVE_KEY as RUN_KEY } from './config.js';
export { RUN_KEY };
import { i18n, t } from './i18n.js';

export const PROGRESS_KEY = 'worldshift.terra.campaign.v1';
export const MODE_KEY = 'worldshift.terra.mode';
const EVAL_MIN = 3;       // evaluate every 3 game minutes

export class Campaign extends Emitter {
  constructor({ world, sim, save, tools }) {
    super();
    this.world = world; this.sim = sim; this.save = save; this.tools = tools;
    this.economy = sim.economy; this.events = sim.events;
    this.stages = STAGES;
    this.run = null;               // active run (null in Sandbox or in the stage list)
    this.progress = this._loadProgress();
    this.acc = 0;
    this.sourcesAtStart = 1;
  }

  // ------------------------------------------------------------ progress / unlocks
  _loadProgress() {
    try { const d = JSON.parse(localStorage.getItem(PROGRESS_KEY) || 'null'); if (d && d.stages) return d; } catch { /* ignore */ }
    return { v: 1, stages: {} };
  }
  _saveProgress() { try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(this.progress)); } catch { /* ignore */ } }
  resetProgress() { this.progress = { v: 1, stages: {} }; this._saveProgress(); this.emit('progress'); }

  stage(id) { return this.stages.find((s) => s.id === id); }
  indexOf(id) { return this.stages.findIndex((s) => s.id === id); }
  info(id) { return this.progress.stages[id] || null; }
  stars(id) { return this.info(id)?.stars || 0; }
  isCompleted(id) { return this.stars(id) > 0; }
  isUnlocked(id) { const i = this.indexOf(id); return i === 0 || this.isCompleted(this.stages[i - 1].id); }
  totalStars() { return this.stages.reduce((a, s) => a + this.stars(s.id), 0); }
  status(id) { return this.isCompleted(id) ? 'done' : this.isUnlocked(id) ? 'open' : 'locked'; }
  nextStage(id) { return this.stages[this.indexOf(id) + 1] || null; }

  /** Types and tools available in Campaign: base kit + rewards of completed stages. */
  available() {
    const types = new Set(BASE_KIT.types), tools = new Set(BASE_KIT.tools);
    for (const s of this.stages) if (this.isCompleted(s.id)) { s.rewards.types.forEach((k) => types.add(k)); s.rewards.tools.forEach((k) => tools.add(k)); }
    return { types, tools };
  }
  /** Stage whose completion unlocks `key`, for the lock label. */
  unlockedBy(key) { return this.stages.find((s) => s.rewards.types.includes(key) || s.rewards.tools.includes(key)) || null; }

  // gate used by Tools / UI (null gate = Sandbox)
  get gate() {
    if (!this.run || this.run.status !== 'playing') return null;
    const self = this;
    return {
      isLocked(key, tool = false) { const a = self.available(); return tool ? !a.tools.has(key) : !a.types.has(key); },
      lockText(key, tool = false) { const s = self.unlockedBy(key); return s ? t('locked.until', { stage: t(`st.${s.id}.name`) }) : t('cost.locked'); },
      canPlace(key, n = 1) {
        if (key !== 'road' && key !== 'source' && this.isLocked(key)) return { ok: false, reason: t('cost.locked') };
        const c = self.economy.costOf(key, n);
        if (!self.economy.canAfford(c)) return { ok: false, reason: t('cost.no', { cost: i18n.num(c) }) };
        return { ok: true, cost: c };
      },
      placed(key, n = 1) { self.economy.charge(self.economy.costOf(key, n)); },
      removed(key) { self.economy.refund(key); },
    };
  }

  // ------------------------------------------------------------ run lifecycle
  get active() { return !!this.run && this.run.status === 'playing'; }
  get stageDef() { return this.run ? this.stage(this.run.stageId) : null; }

  /** Begin a stage from scratch: new world from the stage seed, stage environment, fresh economy. */
  start(stageId) {
    const st = this.stage(stageId);
    if (!st || !this.isUnlocked(stageId)) return false;
    const w = this.world, sim = this.sim, e = st.env;
    this.tools.setMode('select');
    this.events.clear();
    w.build(st.seed);
    const wp = w.water.params;
    wp.flowSpeed = 1; wp.sourceRate = e.sourceRate; wp.sourcesEnabled = true;
    sim.minutes = e.hour * 60; sim.animTime = 0; sim.dayCycle = true;
    sim.setRunning(true); sim.setSpeed(1);
    this.save.settings.apply({ wind: e.wind, cloud: e.cloud, save: false });
    // let the river reach its resting level first, so the shore does not move under the player's first buildings
    for (let k = 0, n = Math.round(18 * 60 / GAME_MIN_PER_SEC * STEPS_PER_SEC); k < n; k++) w.water.step(1, true);
    this.economy.enforce = true;
    this.economy.needs = new Set(st.needs);
    this.economy.reset({ funds: e.funds, food: e.food });
    this.run = { stageId, status: 'playing', elapsedGh: 0, done: {}, timers: {}, fired: [], warned: [], evFlood: {}, evAtEnd: {}, failTimer: 0, everPop: false };
    this.sourcesAtStart = w.water.sources.length;
    this.acc = 0;
    this._setMode('campaign');
    this.save.markDirty();
    this.emit('start', st);
    this.emit('update');
    return true;
  }

  restart() { const id = this.run?.stageId; if (id) { this.run = null; this.start(id); } }

  /** Leave the run (kept in the campaign slot so the player can continue later). */
  leave() {
    if (this.run) this.save.save(true);
    this.economy.enforce = false;
    this.events.stop(false);
    this.run = null;
    this.emit('leave');
  }

  _setMode(m) { try { localStorage.setItem(MODE_KEY, m); } catch { /* ignore */ } }

  // ------------------------------------------------------------ measuring
  _count(o, bs, s) {
    if (o.key) return s.counts[o.key] || 0;
    return bs.structureCount();
  }

  /** Current value / target / fraction for one objective (pure read of the real world). */
  measure(o) {
    const eco = this.economy, s = eco.s, bs = this.world.buildings, run = this.run;
    const need = (what) => what.every((k) => (k === 'water' ? s.wsat >= 0.9 : s.fsat >= 0.9));
    let v = 0, target = o.n ?? 1, cond = false, sustain = false;
    switch (o.type) {
      case 'build': v = this._count(o, bs, s); cond = v >= target; break;
      case 'roads': v = bs.roads.size; cond = v >= target; break;
      case 'population': v = s.pop; cond = v >= target; break;
      case 'waterStored': v = Math.round(s.waterStock); cond = v >= target; break;
      case 'foodStock': v = Math.round(eco.food); cond = v >= target; break;
      case 'farmsIrrigated': v = s.farmsGood; cond = v >= target; break;
      case 'energySupply': v = Math.round(s.energyProd); cond = v >= target; break;
      case 'funds': v = Math.round(eco.funds); cond = v >= target; break;
      case 'jobs': v = s.workers; cond = v >= target; break;
      case 'income': v = Math.round(s.net); cond = v >= target; break;
      case 'poweredFactories': v = s.poweredFactories; cond = v >= target; break;
      case 'sources': v = Math.max(0, this.world.water.sources.length - this.sourcesAtStart); cond = v >= target; break;
      case 'energyBalance': sustain = true; target = o.h; cond = s.energyDemand > 0 && s.esat >= 0.995; break;
      case 'needs': sustain = true; target = o.h; cond = s.pop > 0 && need(o.what); break;
      case 'stability': sustain = true; target = o.h; cond = s.pop > 0 && eco.stability >= o.n; break;
      case 'survive': {
        const fin = this.events.done.includes(o.ev);
        v = run.evFlood[o.ev] ?? 0; target = o.n;
        cond = fin && v <= o.n; break;
      }
      case 'needsDuring': {
        const fin = this.events.done.includes(o.ev);
        cond = fin && run.evAtEnd[o.ev] === true; target = 1; v = cond ? 1 : 0; break;
      }
      default: break;
    }
    if (sustain) v = +(run.timers[o.id] || 0).toFixed(1);
    return { v, target, cond, sustain };
  }

  /** UI model of the objectives with live progress. */
  objectives() {
    if (!this.run) return [];
    const st = this.stageDef;
    return st.objectives.map((o) => {
      const m = this.measure(o);
      const done = !!this.run.done[o.id];
      const event = o.type === 'survive' || o.type === 'needsDuring';
      const frac = done ? 1 : event ? 0 : clamp(m.target > 0 ? m.v / m.target : 0, 0, 1);
      return { id: o.id, type: o.type, bonus: !!o.bonus, done, v: m.v, target: m.target, frac, label: this.label(o), sustain: m.sustain, event, hold: m.sustain && m.cond };
    });
  }

  label(o) {
    const n = i18n.num(o.n ?? 0), h = o.h ?? 0;
    switch (o.type) {
      case 'build': return o.key ? t('obj.build', { n, name: t('b.' + o.key) }) : t('obj.buildAny', { n });
      case 'roads': return t('obj.roads', { n });
      case 'population': return t('obj.population', { n });
      case 'waterStored': return t('obj.waterStored', { n });
      case 'foodStock': return t('obj.foodStock', { n });
      case 'farmsIrrigated': return t('obj.farmsIrrigated', { n });
      case 'energySupply': return t('obj.energySupply', { n });
      case 'energyBalance': return t('obj.energyBalance', { h });
      case 'needs': return t('obj.needs', { h });
      case 'stability': return t('obj.stability', { n, h });
      case 'funds': return t('obj.funds', { n });
      case 'jobs': return t('obj.jobs', { n });
      case 'income': return t('obj.income', { n });
      case 'poweredFactories': return t('obj.poweredFactories', { n });
      case 'sources': return t('obj.sources', { n });
      case 'survive': return t('obj.survive', { n, ev: t('ev.' + (this._evType(o.ev) || 'storm')) });
      case 'needsDuring': return t('obj.needsDuring', { ev: t('ev.' + (this._evType(o.ev) || 'drought')) });
      default: return o.type;
    }
  }
  _evType(id) { return this.stageDef?.events?.find((e) => e.id === id)?.type; }

  /** Progress of the required objectives, 0..1 */
  progressFraction() {
    const list = this.objectives().filter((o) => !o.bonus);
    return list.length ? list.reduce((a, o) => a + o.frac, 0) / list.length : 0;
  }
  /** Index of the first unfinished required objective (used for tutorial hints). */
  currentHintIndex() {
    const st = this.stageDef; if (!st) return 0;
    const i = st.objectives.findIndex((o) => !this.run.done[o.id]);
    return i < 0 ? st.objectives.length - 1 : i;
  }
  hintKey() {
    const st = this.stageDef; if (!st) return null;
    let n = 0; while (i18n.dict.en[`st.${st.id}.h${n}`]) n++;
    if (!n) return null;
    // tutorial: hint follows the objective; other stages: rotate with the objective index
    const idx = Math.min(this.currentHintIndex(), n - 1);
    return `st.${st.id}.h${idx}`;
  }

  // ------------------------------------------------------------ per-frame
  update(gm) {
    const run = this.run;
    if (!run || run.status !== 'playing') return;
    const st = this.stageDef, gh = gm / 60;
    run.elapsedGh += gh;
    // scheduled events with a warning
    for (const ev of st.events || []) {
      if (!run.warned.includes(ev.id) && run.elapsedGh >= ev.at - ev.warn && !run.fired.includes(ev.id)) {
        run.warned.push(ev.id); this.emit('warn', { ev, hours: Math.max(1, Math.round(ev.at - run.elapsedGh)) });
      }
      if (!run.fired.includes(ev.id) && run.elapsedGh >= ev.at) {
        run.fired.push(ev.id); this.events.start(ev.type, ev.dur, ev.id); this.emit('event', { ev, phase: 'start' });
      }
    }
    // track flooding while an event runs; record the needs state at the end of events
    const a = this.events.active;
    if (a) {
      run.evFlood[a.id] = Math.max(run.evFlood[a.id] ?? 0, this.economy.s.flooded);
      const s = this.economy.s;
      if (run.evAtEnd[a.id] === undefined) run.evAtEnd[a.id] = true;
      if (s.pop > 0 && !(s.wsat >= 0.9 && s.fsat >= 0.9)) run.evAtEnd[a.id] = false;
    }
    this.acc += gm;
    if (this.acc < EVAL_MIN) return;
    const dm = this.acc; this.acc = 0;
    this._evaluate(dm / 60);
  }

  _evaluate(gh) {
    const run = this.run, st = this.stageDef, eco = this.economy;
    if (eco.s.pop > 0) run.everPop = true;
    let allDone = true;
    for (const o of st.objectives) {
      if (run.done[o.id]) continue;
      const m = this.measure(o);
      if (m.sustain) {
        run.timers[o.id] = m.cond ? (run.timers[o.id] || 0) + gh : 0;
        if (run.timers[o.id] >= o.h) run.done[o.id] = true;
      } else if (m.cond) run.done[o.id] = true;
      // a survived event whose damage limit was exceeded cannot be completed any more
      if (o.type === 'survive' && !o.bonus && this.events.done.includes(o.ev) && !m.cond) return this._finish(false, 'res.fail.flood');
      if (!o.bonus && !run.done[o.id]) allDone = false;
    }
    if (allDone) return this._finish(true);
    // failure: everybody left, or total collapse
    if (run.everPop && eco.s.pop === 0) { run.failTimer += gh; if (run.failTimer > 3) return this._finish(false, 'res.fail.pop'); }
    else if (eco.stability < 6 && eco.s.pop > 0) { run.failTimer += gh; if (run.failTimer > 6) return this._finish(false, 'res.fail.stab'); }
    else run.failTimer = 0;
    this.emit('update');
  }

  _finish(win, reason) {
    const run = this.run, st = this.stageDef, eco = this.economy;
    run.status = win ? 'won' : 'failed';
    this.sim.setRunning(false);
    const days = run.elapsedGh / 24;
    const bonusOk = st.objectives.filter((o) => o.bonus).every((o) => run.done[o.id]);
    let stars = 0;
    if (win) {
      stars = 1;
      if (days <= st.par[0]) stars = 2;
      if (days <= st.par[1] && eco.stability >= st.stab && bonusOk) stars = 3;
    }
    const prev = this.info(st.id);
    const wasDone = this.isCompleted(st.id);
    const before = this.available();
    const result = {
      stageId: st.id, win, reason, stars, days, stability: eco.stability, minStability: eco.stats.minStability,
      pop: eco.s.pop, funds: Math.round(eco.funds), bonusOk, par: st.par, prevBest: prev?.stars || 0, newRewards: [],
    };
    if (win) {
      const rec = prev || { stars: 0, bestDays: null, plays: 0 };
      rec.plays = (rec.plays || 0) + 1;
      rec.stars = Math.max(rec.stars, stars);
      rec.bestDays = rec.bestDays == null ? days : Math.min(rec.bestDays, days);
      rec.bestStability = Math.max(rec.bestStability || 0, Math.round(eco.stability));
      this.progress.stages[st.id] = rec;
      this._saveProgress();
      if (!wasDone) {
        const after = this.available();
        result.newRewards = [...[...after.types].filter((k) => !before.types.has(k)).map((k) => ({ kind: 'type', key: k })), ...[...after.tools].filter((k) => !before.tools.has(k)).map((k) => ({ kind: 'tool', key: k }))];
      }
    }
    run.result = result;
    this.save.save(true);
    this.emit('finish', result);
    this.emit('progress');
  }

  // ------------------------------------------------------------ persistence of the run
  serializeRun() {
    if (!this.run) return null;
    const r = this.run;
    return { stageId: r.stageId, status: r.status, elapsedGh: r.elapsedGh, done: r.done, timers: r.timers, fired: r.fired, warned: r.warned, evFlood: r.evFlood, evAtEnd: r.evAtEnd, failTimer: r.failTimer, everPop: r.everPop, sources0: this.sourcesAtStart, result: r.result || null };
  }
  loadRun(d, ecoData, evData) {
    const st = d && this.stage(d.stageId);
    if (!st) return false;
    this.run = { stageId: d.stageId, status: d.status || 'playing', elapsedGh: d.elapsedGh || 0, done: d.done || {}, timers: d.timers || {}, fired: d.fired || [], warned: d.warned || [], evFlood: d.evFlood || {}, evAtEnd: d.evAtEnd || {}, failTimer: d.failTimer || 0, everPop: !!d.everPop, result: d.result || undefined };
    this.sourcesAtStart = d.sources0 || 1;
    this.economy.enforce = true;
    this.economy.needs = new Set(st.needs);
    if (ecoData) this.economy.load(ecoData);
    if (evData) this.events.load(evData);
    this._setMode('campaign');
    this.acc = 0;
    this.emit('start', st);
    if (this.run.status !== 'playing') this.emit('finish', this.run.result);
    return true;
  }
}

export { STAGES, BASE_KIT, ECON, TYPES };
