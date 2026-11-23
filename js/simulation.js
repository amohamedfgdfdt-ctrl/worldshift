// Simulation clock: play / pause / speed, in-game time, water stepping and the
// (very small) population model that later phases will extend.
import { Emitter } from './utils.js';
import { STEPS_PER_SEC, MAX_STEPS_PER_FRAME, GAME_MIN_PER_SEC, START_MINUTES } from './config.js';
import { windUniforms } from './vegetation.js';
import { TYPES } from './buildings.js';

export class Simulation extends Emitter {
  constructor(world) {
    super();
    this.world = world;
    this.running = true;
    this.speed = 1;
    this.minutes = START_MINUTES;       // absolute in-game minutes since day 1 00:00
    this.dayCycle = true;
    this.animTime = 0;                  // simulated seconds driving water / wind animation
    this._acc = 0;
    this._popAcc = 0;
    this.stepsLastFrame = 0;
  }

  get hour() { return (this.minutes / 60) % 24; }
  get day() { return Math.floor(this.minutes / 1440) + 1; }

  setRunning(v) { this.running = !!v; this.emit('state'); }
  toggle() { this.setRunning(!this.running); }
  setSpeed(s) { this.speed = s; this.emit('state'); }
  setHour(h) { this.minutes = Math.floor(this.minutes / 1440) * 1440 + h * 60; this.emit('state'); }

  /** Reset water + clock (buildings are kept). */
  reset() {
    this.world.water.resetToInitial();
    this.minutes = START_MINUTES;
    this.animTime = 0;
    this._acc = 0;
    this.emit('state');
  }

  update(dt) {
    this.stepsLastFrame = 0;
    if (!this.running) return;
    const sdt = Math.min(dt, 0.1) * this.speed;
    this.animTime += sdt;
    windUniforms.uTime.value = this.animTime;
    if (this.dayCycle) this.minutes += sdt * GAME_MIN_PER_SEC;

    this._acc += sdt * STEPS_PER_SEC;
    let steps = Math.floor(this._acc);
    this._acc -= steps;
    if (steps > MAX_STEPS_PER_FRAME) { steps = MAX_STEPS_PER_FRAME; this._acc = 0; }
    const water = this.world.water;
    for (let s = 0; s < steps; s++) water.step(1, true);
    this.stepsLastFrame = steps;

    this._popAcc += sdt;
    if (this._popAcc >= 1.5) { this._popAcc = 0; this._populationTick(); }
  }

  _populationTick() {
    const bs = this.world.buildings;
    let changed = false;
    for (const b of bs.buildings.values()) {
      const t = TYPES[b.key];
      if (t.kind !== 'house') continue;
      const flood = bs.floodInfo(b).depth;
      if (flood > 0.5) { if (b.state.residents > 0) { b.state.residents--; changed = true; } }
      else if (b.state.residents < t.capacity) { b.state.residents++; changed = true; }
    }
    if (changed) this.emit('population');
  }

  serialize() {
    return { running: this.running, speed: this.speed, minutes: this.minutes, dayCycle: this.dayCycle };
  }
  load(d) {
    this.running = d.running ?? true;
    this.speed = [1, 2, 4].includes(d.speed) ? d.speed : 1;
    this.minutes = d.minutes ?? START_MINUTES;
    this.dayCycle = d.dayCycle ?? true;
    this.emit('state');
  }
}
