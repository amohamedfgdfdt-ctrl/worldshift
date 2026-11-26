// Entry point: wires every system together and runs the frame loop.
import { World } from './world.js';
import { Simulation } from './simulation.js';
import { Controls } from './controls.js';
import { Tools } from './tools.js';
import { SaveSystem } from './save-system.js';
import { UI } from './ui.js';
import { PerformanceMonitor, runBenchmark } from './performance.js';
import { GraphicsSettings, detectCaps, measureRefresh, PRESETS } from './graphics.js';
import { GraphicsUI } from './graphics-ui.js';
import { AssetManager } from './assets.js';
import { windUniforms } from './vegetation.js';
import { DEFAULT_SEED, isTouchDevice } from './config.js';
import { Economy, EventSystem } from './economy.js';
import { GameMode } from './campaign-ui.js';

function webglOk() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2'));
  } catch { return false; }
}

async function boot() {
  const loading = document.getElementById('loading');
  if (!webglOk()) {
    loading.classList.add('done');
    document.getElementById('nogl').hidden = false;
    return;
  }
  // let the loading screen paint before the (synchronous) world generation
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  const canvas = document.getElementById('gl');
  const world = new World(canvas);
  const caps = detectCaps(world.renderer, canvas);
  const gfx = new GraphicsSettings(caps);
  const hadSaved = gfx.load();
  if (!hadSaved) gfx.setPreset(caps.software ? 'low' : caps.touch ? 'medium' : 'high');
  gfx.on('change', (v) => { world.applyGraphics(v, caps); world.gfxPresetLabel = gfx.preset; });
  world.applyGraphics(gfx.values, caps);
  world.gfxPresetLabel = gfx.preset;
  const sim = new Simulation(world);
  sim.economy = new Economy(world, sim);
  sim.events = new EventSystem(world, sim.economy);
  const controls = new Controls(canvas, world.rig);
  const tools = new Tools(world, controls);
  const perf = new PerformanceMonitor(world, gfx);
  if (gfx.auto) perf.startAuto(gfx.preset === 'custom' ? 'medium' : gfx.preset);

  const settingsState = { wind: 0.6, cloud: 0.45, grid: false, quality: 'auto' };
  const settings = {
    get: () => ({ ...settingsState }),
    apply(o) {
      if (o.wind !== undefined) { settingsState.wind = o.wind; world.wind = o.wind; windUniforms.uWind.value = o.wind; }
      if (o.cloud !== undefined) { settingsState.cloud = o.cloud; world.cloud = o.cloud; }
      if (o.grid !== undefined) { settingsState.grid = !!o.grid; tools.setGridAlways(!!o.grid); }
      if (o.save !== false) save?.markDirty();
    },
  };
  windUniforms.uWind.value = settingsState.wind;
  const save = new SaveSystem({ world, sim, tools, settings });
  const ui = new UI({ world, sim, tools, controls, save, perf, settings });
  const gfxUI = new GraphicsUI({ ui, world, gfx, perf, caps });
  ui.openGraphics = () => gfxUI.open();
  const gameMode = new GameMode({ world, sim, tools, save, ui });
  let preview = null;
  ui.openPreview = async () => {
    if (!preview) { const { AssetPreview } = await import('./asset-preview.js'); preview = new AssetPreview(world, ui); window.TERRA.preview = preview; }
    await preview.open();
  };

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
  world.assets = new AssetManager(world);
  world.assets.loadManifest().catch(() => {});
  window.TERRA = { gameMode, campaign: gameMode.campaign, openPreview: () => ui.openPreview(), world, sim, tools, controls, ui, save, perf, settings, gfx, gfxUI, caps };

  // refresh-rate probe (enables 90/120 FPS targets only when the display can show them)
  measureRefresh().then((hz) => { gfx.refreshHz = hz; if (gfxUI.isOpen) gfxUI.refresh(); });
  // first run: benchmark once and suggest a preset (the user can change it)
  if (!hadSaved) {
    setTimeout(async () => {
      const before = JSON.stringify(gfx.values);
      const bench = await runBenchmark(world, caps);
      const rec = gfx.recommend(bench);
      if (JSON.stringify(gfx.values) === before) gfx.setPreset(rec.preset);
      perf.startAuto(rec.preset);
      ui.banner(`Graphics set to ${rec.preset[0].toUpperCase() + rec.preset.slice(1)} for this device.`, 'Review', () => gfxUI.open({ firstRun: true, suggestion: rec }));
    }, 1500);
  }

  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    // frame-rate limiter: a target, bounded by the display refresh rate
    const limit = gfx.values.fpsLimit;
    const minDt = 1000 / limit;
    if (now - last < minDt - 2.5) return;
    if (preview?.active) { last = now; preview.frame(); return; }
    const dt = Math.min(0.1, Math.max(0.0001, (now - last) / 1000));
    const raw = (now - last) / 1000;
    last = now;
    controls.update(dt);
    sim.update(dt);
    tools.update(dt);
    world.frame(dt, sim);
    ui.update(dt);
    perf.update(raw);
  }
  requestAnimationFrame(frame);
  setTimeout(() => loading.classList.add('done'), 350);
  if (new URLSearchParams(location.search).has('preview')) ui.openPreview();
  gameMode.boot();
  window.__terraReady = true;
}

boot().catch((e) => {
  console.error(e);
  const t = document.getElementById('load-text');
  if (t) t.textContent = 'Something went wrong: ' + e.message;
});
