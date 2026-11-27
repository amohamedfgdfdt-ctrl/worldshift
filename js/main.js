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
import { i18n, t as trI } from './i18n.js';
window.addEventListener('error', (e) => { if (!window.__err) window.__err = String(e.message || e.error && e.error.stack || e).slice(0, 200); });
import { Tutorial } from './tutorial.js';

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

  const settingsState = { wind: 0.6, cloud: 0.45, grid: false, quality: 'auto', disasters: true };
  const settings = {
    get: () => ({ ...settingsState }),
    apply(o) {
      if (o.wind !== undefined) { settingsState.wind = o.wind; world.wind = o.wind; windUniforms.uWind.value = o.wind; }
      if (o.cloud !== undefined) { settingsState.cloud = o.cloud; world.cloud = o.cloud; }
      if (o.grid !== undefined) { settingsState.grid = !!o.grid; tools.setGridAlways(!!o.grid); }
      if (o.disasters !== undefined) { settingsState.disasters = !!o.disasters; if (gameMode?.mode === 'sandbox') sim.events.setAutoEnabled(!!o.disasters); }
      if (o.save !== false) save?.markDirty();
    },
  };
  windUniforms.uWind.value = settingsState.wind;
  const save = new SaveSystem({ world, sim, tools, settings });
  const ui = new UI({ world, sim, tools, controls, save, perf, settings });
  const gfxUI = new GraphicsUI({ ui, world, gfx, perf, caps });
  ui.openGraphics = () => gfxUI.open();
  const gameMode = new GameMode({ world, sim, tools, save, ui });
  // sandbox disaster notifications (the campaign has its own event UI)
  sim.events.on('warn', (a) => ui.banner(trI('camp.event.soon', { ev: trI('ev.' + a.type), h: i18n.num(a.hours) }), trI('ok'), () => {}));
  sim.events.on('start', (a) => { if (gameMode.mode === 'sandbox') ui.toast(trI('camp.event.start', { ev: trI('ev.' + a.type) }), 'warn'); });
  sim.events.on('end', (a) => { if (gameMode.mode === 'sandbox') ui.toast(trI('camp.event.end', { ev: trI('ev.' + a.type) }), 'ok'); });
  let preview = null;
  ui.openPreview = async () => {
    if (!preview) { const { AssetPreview } = await import('./asset-preview.js'); preview = new AssetPreview(world, ui); window.TERRA.preview = preview; }
    await preview.open();
  };

  // restore the last world or start the default one
  let restored = false;
  if (save.hasSave()) {
    try { restored = save.load(); } catch (e) { console.error(e); restored = false; }
    if (restored) { document.getElementById('load-text').textContent = trI('load.back'); }
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
      ui.banner(trI('gfx.banner', { p: trI('gfx.p.' + rec.preset) }), trI('gfx.review'), () => gfxUI.open({ firstRun: true, suggestion: rec }));
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
  // headless capture / debug: ?sandbox=1&hour=22&cam=x,z,yaw,pitch,dist&demo=buildings&speed=0
  {
    const q = new URLSearchParams(location.search);
    if (q.has('lang')) { i18n.set(q.get('lang')); }
    if (q.has('sandbox')) {
      gameMode.closeScreen();
      gameMode.enterSandbox();
      if (q.get('speed') === '0') sim.setRunning(false);
      if (q.has('hour')) { const hh = parseFloat(q.get('hour')); if (!isNaN(hh)) sim.setHour(hh); }
      if (q.has('panel')) setTimeout(() => ui.openCategory(q.get('panel')), 1800);
      if (q.has('ev')) setTimeout(() => sim.events.start(q.get('ev'), 3, 'dbg'), 2000);
      if (q.has('evwarn')) setTimeout(() => sim.events.emit('warn', { type: q.get('evwarn') === '1' ? 'storm' : q.get('evwarn'), hours: 3 }), 2500);
      if (q.has('gfx')) {
        const pin = () => { gfx.auto = false; gfx.setPreset(q.get('gfx')); };
        pin();
        setTimeout(pin, 6000); // re-assert after the first-run benchmark suggestion (~1.5s)
      }
      if (q.has("dbg")) setTimeout(() => {
        const d = world.textures?.detail;
        document.title = ['DBG preset=' + gfx.preset,
        'life=' + (world.life ? world.life.people.length + '/' + world.life.animals.length : '-'),
        'hh=' + (world.life ? (world.life.homes ? world.life.homes.length : 'x') + ',' + (world.life.farms ? world.life.farms.length : 'x') : '-'),
        'sig=' + (world.life && world.life._sig !== undefined ? world.life._sig : 'x'),
        'frames=' + (world._frames ?? 'x') + ' blds=' + (world.buildings ? world.buildings.buildings.size : 'x'),
        'hour=' + (sim.hour != null ? sim.hour.toFixed(1) : 'x') + ' day=' + (world.env && world.env.state ? world.env.state.dayAmt.toFixed(2) : 'x'),
        'err=' + (window.__lifeErr || 'none'),
        'gerr=' + (window.__err || 'none'),
        world.life && world.life.people[0] ? 'p0=' + world.life.people[0].x.toFixed(0) + ',' + world.life.people[0].z.toFixed(0) + (world.life.people[0].path ? ' walk' : ' idle') : '',
        world.life && world.life.animals[0] ? 'a0=' + world.life.animals[0].x.toFixed(0) + ',' + world.life.animals[0].z.toFixed(0) : '',
      ].join(' ');
      }, 9000);
      if (q.get('demo') === 'buildings') {
        const bs = world.buildings;
        let placed = 0;
        window.__firstBuilding = null;
        outer: for (let j = 40; j < 90 && placed < 8; j += 2) for (let i = 40; i < 90; i += 2) {
          const r = bs.place(placed % 3 === 0 ? 'house_medium' : 'house_small', i, j, 0, { force: true, silent: true });
          if (r.ok) { if (!window.__firstBuilding) window.__firstBuilding = r.building; placed++; i += 4; }
          if (placed >= 8) break outer;
        }
        // demo life: a road through the village plus homes and farms (Stage I captures)
        for (let i = 44; i < 72; i++) bs.placeRoad(i, 44);
        for (const [hi, hj] of [[48, 41], [52, 41], [56, 41], [60, 41], [50, 47], [58, 47]]) bs.place('house_small', hi, hj, 0, { force: true, silent: true });
        bs.place('farm', 52, 50, 0, { force: true, silent: true });
        bs.place('farm', 60, 50, 0, { force: true, silent: true });
      }
      const cam = q.get('cam');
      if (q.has('march')) {
        const lf = world.life;
        const origMarch = lf._update.bind(lf);
        lf._update = (dt, sm) => { for (const p of lf.people) p.idle = 0; origMarch(dt, sm); };
      }
      if (cam === 'person') {
        // debug: lock the camera onto the first walking resident (Stage I captures)
        const origFrame = world.frame.bind(world);
        world.frame = (dt, sm) => {
          origFrame(dt, sm);
          const ppl = world.life && world.life.people.filter((pp) => {
            if (!pp.path || !pp.path[pp.seg]) return false;
            for (const b of world.buildings.buildings.values()) { const kd = b.key && b.key.indexOf('house') === 0 ? 9 : 12; if (Math.hypot(b.x - pp.x, b.z - pp.z) < kd) return false; }
            return true;
          });
          const p = ppl && ppl[0];
          if (!p) return;   // nobody walking right now: keep the last good framing
          const g = world.rig.goal;
          g.target.set(p.x, world.field.heightAt(p.x, p.z) + 1, p.z);
          g.yaw = p.yaw + 2.9; g.pitch = 0.42; g.dist = 11;
          world.rig._snap();
          world.rig.update(0.001, world.viewH);
        };
      } else if (cam === 'town' && window.__firstBuilding) {
        const b = window.__firstBuilding;
        const g = world.rig.goal;
        g.target.set(b.x, b.y, b.z); g.yaw = 0.8; g.pitch = 0.7; g.dist = 55;
        world.rig._snap();
      } else if (cam === 'lake') {
        const lk = world.field.lake;
        const x = lk.u * 384 - 192, z = lk.v * 384 - 192;
        const g = world.rig.goal;
        g.target.set(x, world.field.heightAt(x, z), z); g.yaw = 2.2; g.pitch = 0.5; g.dist = 90;
        world.rig._snap();
      } else if (cam) {
        const [x = 0, z = 0, yaw = 0.7, pitch = 0.9, dist = 170] = cam.split(',').map(Number);
        const g = world.rig.goal;
        g.target.set(x, world.field.heightAt(x, z), z);
        g.yaw = yaw; g.pitch = pitch; g.dist = dist;
        world.rig._snap();
      }
    }
  }
  // first-run interactive tutorial (sandbox only; the campaign stages teach too)
  const tutorial = new Tutorial({ ui, world, sim });
  ui.onTutorial = () => tutorial.start(true);
  window.TERRA.tutorial = tutorial;
  const isDebug = new URLSearchParams(location.search).has('sandbox');
  if (!isDebug) {
    const origEnterSandbox = gameMode.enterSandbox.bind(gameMode);
    gameMode.enterSandbox = () => { origEnterSandbox(); setTimeout(() => tutorial.maybeAutoStart(), 900); };
    gameMode.boot();
    if (gameMode.mode === 'sandbox') setTimeout(() => tutorial.maybeAutoStart(), 1200);
  } else {
    gameMode.boot();
    if (new URLSearchParams(location.search).has('tut')) {
      const step = parseInt(new URLSearchParams(location.search).get('tut') || '0', 10) || 0;
      setTimeout(() => { tutorial.start(true); for (let k = 0; k < step; k++) tutorial.next(); }, 2500);
    }
  }
  if (gameMode.mode === 'sandbox') sim.events.setAutoEnabled(settings.get().disasters !== false);
  window.__terraReady = true;
}

boot().catch((e) => {
  console.error(e);
  const t = document.getElementById('load-text');
  if (t) t.textContent = 'Something went wrong: ' + e.message;
});
