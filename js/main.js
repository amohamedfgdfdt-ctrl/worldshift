// Entry point: wires every system together and runs the frame loop.
import { World } from './world.js';
import { Simulation } from './simulation.js';
import { Controls } from './controls.js';
import { Tools } from './tools.js';
import { SaveSystem } from './save-system.js';
import { UI } from './ui.js';
import { initI18n } from './i18n.js';
import { PerformanceMonitor } from './performance.js';
import { windUniforms } from './vegetation.js';
import { DEFAULT_SEED, isTouchDevice } from './config.js';

function webglOk() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2'));
  } catch { return false; }
}

async function boot() {
  const loading = document.getElementById('loading');
  initI18n();
  if (!webglOk()) {
    loading.classList.add('done');
    document.getElementById('nogl').hidden = false;
    return;
  }
  // let the loading screen paint before the (synchronous) world generation
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  const canvas = document.getElementById('gl');
  const world = new World(canvas, { quality: 'auto' });
  const sim = new Simulation(world);
  const controls = new Controls(canvas, world.rig);
  const tools = new Tools(world, controls);
  const perf = new PerformanceMonitor(world);

  const settingsState = { wind: 0.6, cloud: 0.45, grid: false, quality: 'auto', fps: 60 };
  const settings = {
    get: () => ({ ...settingsState }),
    apply(o) {
      if (o.wind !== undefined) { settingsState.wind = o.wind; world.wind = o.wind; windUniforms.uWind.value = o.wind; }
      if (o.cloud !== undefined) { settingsState.cloud = o.cloud; world.cloud = o.cloud; }
      if (o.fps !== undefined) { settingsState.fps = o.fps; perf.capMs = o.fps ? 1000 / o.fps : 0; }
      if (o.grid !== undefined) { settingsState.grid = !!o.grid; tools.setGridAlways(!!o.grid); }
      if (o.quality !== undefined && o.quality !== settingsState.quality) {
        settingsState.quality = o.quality;
        world.qualityMode = o.quality;
        world.applyQuality(o.quality === 'auto' ? (isTouchDevice ? 'balanced' : 'high') : o.quality);
      }
      if (o.save !== false) save?.markDirty();
    },
  };
  windUniforms.uWind.value = settingsState.wind;
  perf.capMs = 1000 / settingsState.fps;
  const save = new SaveSystem({ world, sim, tools, settings });
  const ui = new UI({ world, sim, tools, controls, save, perf, settings });

  // restore the last world or start the default one
  let restored = false;
  if (save.hasSave()) {
    try { restored = save.load(); } catch (e) { console.error(e); restored = false; }
    if (restored) { document.getElementById('load-text').textContent = 'Welcome back'; }
  }
  if (!restored) world.build(DEFAULT_SEED);

  window.addEventListener('resize', () => world.resize());
  window.addEventListener('orientationchange', () => setTimeout(() => world.resize(), 200));
  new ResizeObserver(() => world.resize()).observe(canvas);

  // debug / test hook (harmless in production)
  window.TERRA = { world, sim, tools, controls, ui, save, perf, settings };

  let last = performance.now();
  function frame(now) {
    const cap = settingsState.fps;
    if (cap && now - last < 1000 / cap - 2) { requestAnimationFrame(frame); return; }
    const dt = Math.min(0.1, Math.max(0.0001, (now - last) / 1000));
    last = now;
    controls.update(dt);
    sim.update(dt);
    tools.update(dt);
    world.frame(dt, sim);
    ui.update(dt);
    perf.update(dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  setTimeout(() => loading.classList.add('done'), 350);
  window.__terraReady = true;
}

boot().catch((e) => {
  console.error(e);
  const t = document.getElementById('load-text');
  if (t) t.textContent = 'Something went wrong: ' + e.message;
});
