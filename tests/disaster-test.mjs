// Node test for Stage H: the disaster scheduler and its simulation effects.
import { HeightField } from '../js/terrain.js';
import { WaterSim } from '../js/water-system.js';
import { EventSystem, EVENT_TYPES } from '../js/economy.js';

let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };

const f = new HeightField(7);
const water = new WaterSim(f);
water.resetToInitial();
water.addSource(f.riverSource.i, f.riverSource.j, 8);
const world = { water, cloud: 0.6 };
const economy = { shock() {}, s: {} };
const ev = new EventSystem(world, economy);

// storm adds water, drought removes it, rates multiply and restore
const v0 = water.totalVolume();
const r0 = water.params.sourceRate;
ok(ev.start('storm', 2, 't1'), 'storm starts');
ok(Math.abs(water.params.sourceRate - r0 * EVENT_TYPES.storm.rate) < 1e-9, 'storm multiplies source rate');
for (let i = 0; i < 60; i++) ev.update(2);        // 2 game-hours
const vStorm = water.totalVolume();
ok(vStorm > v0 + 1000, `storm added water (${(vStorm - v0).toFixed(0)} m3)`);
ev.stop(false);
ok(Math.abs(water.params.sourceRate - r0) < 1e-9, 'source rate restored after storm');

ok(ev.start('drought', 2, 't2'), 'drought starts');
const v1 = water.totalVolume();
for (let i = 0; i < 60; i++) ev.update(2);
const vDrought = water.totalVolume();
ok(vDrought < v1, `drought removed water (${(vDrought - v1).toFixed(0)} m3)`);
ev.stop(false);

// auto scheduler: fires within maxGap, warns first, then stops scheduling while active
ev.auto.minGap = 1; ev.auto.maxGap = 2; ev.auto.warn = 0.5;
ev.setAutoEnabled(true);
let warned = 0, started = 0;
ev.on('warn', () => warned++);
ev.on('start', () => started++);
for (let i = 0; i < 240 && !started; i++) ev.update(0.5);   // up to 2 game hours
ok(warned === 1, 'warning fired before the event');
ok(started === 1, 'auto event started inside the gap window');
const t0 = ev._t;
for (let i = 0; i < 100; i++) ev.update(0.5);
ok(ev._t > t0, 'scheduler clock advances');
ev.setAutoEnabled(false);

// serialize round-trip keeps scheduler state
const s = ev.serialize();
const ev2 = new EventSystem(world, economy);
ev2.load(s);
ok(Math.abs(ev2._t - ev._t) < 1e-9 && isFinite(ev2.auto.nextAt), 'serialize/load keeps scheduler state');

console.log(fails ? `${fails} FAILURES` : 'ALL DISASTER TESTS PASS');
process.exit(fails ? 1 : 0);
