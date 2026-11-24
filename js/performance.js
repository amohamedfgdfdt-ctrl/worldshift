// Performance engine: FPS / frame-time / render-time monitoring, a rolling
// graph, optional GPU timing (EXT_disjoint_timer_query_webgl2), dynamic
// resolution scaling, and Auto Graphics Mode (steps the preset down when the
// frame rate cannot be held and back up once it has been stable for a while).
import { PRESETS, PRESET_ORDER } from './graphics.js';

const HIST = 120;

export class PerformanceMonitor {
  constructor(world, gfx) {
    this.world = world;
    this.gfx = gfx;
    this.hist = new Float32Array(HIST);   // frame times, ms
    this.histRender = new Float32Array(HIST);
    this.n = 0;
    this.ema = 16.7;
    this.fps = 60;
    this.frameMs = 16.7;
    this.worstMs = 16.7;
    this.renderMs = 0;
    this.gpuMs = null;
    this.dynamicRes = true;
    this._fpsTimer = 0; this._fpsFrames = 0; this._worst = 0;
    this._slow = 0; this._fast = 0; this._cool = 0;
    this.autoLevel = null;                // preset index used by Auto mode
    this.autoCeiling = 3;
    this.events = [];                     // short log of adaptations
    this.listeners = [];
    this._initGpuTimer();
    world.perf = this;
  }

  // ---- optional GPU timer ----------------------------------------------
  _initGpuTimer() {
    const gl = this.world.renderer.getContext();
    this.gl = gl;
    this.ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    this.query = null; this.pending = null;
  }
  gpuBegin() {
    if (!this.ext || this.pending) return;
    const gl = this.gl;
    this.query = gl.createQuery();
    gl.beginQuery(this.ext.TIME_ELAPSED_EXT, this.query);
    this._open = true;
  }
  gpuEnd() {
    if (!this._open) return;
    this._open = false;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.pending = this.query;
  }
  _pollGpu() {
    if (!this.pending) return;
    const gl = this.gl;
    const ok = gl.getQueryParameter(this.pending, gl.QUERY_RESULT_AVAILABLE);
    const disjoint = gl.getParameter(this.ext.GPU_DISJOINT_EXT);
    if (ok || disjoint) {
      if (ok && !disjoint) {
        const ns = gl.getQueryParameter(this.pending, gl.QUERY_RESULT);
        const ms = ns / 1e6;
        this.gpuMs = this.gpuMs == null ? ms : this.gpuMs + (ms - this.gpuMs) * 0.2;
      }
      gl.deleteQuery(this.pending);
      this.pending = null;
    }
  }

  get targetFps() {
    const limit = this.gfx.values.fpsLimit;
    return Math.min(limit, Math.round(this.gfx.refreshHz));
  }

  onEvent(cb) { this.listeners.push(cb); return () => { this.listeners = this.listeners.filter((x) => x !== cb); }; }
  _log(msg) {
    this.events.unshift({ t: performance.now(), msg });
    this.events.length = Math.min(this.events.length, 8);
    for (const cb of this.listeners) cb(msg);
  }

  /** dt = seconds since the previous rendered frame. */
  update(dt) {
    const ms = Math.min(dt * 1000, 250);
    this.hist[this.n % HIST] = ms;
    this.histRender[this.n % HIST] = this.world.renderMs || 0;
    this.n++;
    this.ema += (ms - this.ema) * 0.08;
    this.renderMs += ((this.world.renderMs || 0) - this.renderMs) * 0.1;
    this._worst = Math.max(this._worst, ms);
    this._fpsFrames++; this._fpsTimer += dt;
    this._pollGpu();
    if (this._fpsTimer >= 0.5) {
      this.fps = this._fpsFrames / this._fpsTimer;
      this.frameMs = 1000 * this._fpsTimer / this._fpsFrames;
      this.worstMs = this._worst;
      this._fpsFrames = 0; this._fpsTimer = 0; this._worst = 0;
    }
    this._adapt(dt, ms);
  }

  _adapt(dt) {
    const g = this.gfx, w = this.world;
    if (this._cool > 0) { this._cool -= dt; return; }
    const target = 1000 / Math.max(20, this.targetFps);
    const slow = this.ema > target * 1.28;
    const fast = this.ema < target * 1.12;
    if (slow) { this._slow += dt; this._fast = 0; } else if (fast) { this._fast += dt; this._slow = 0; } else { this._slow = 0; this._fast = 0; }
    const dynamic = this.dynamicRes || g.auto;
    if (!dynamic && !g.auto) return;

    if (this._slow > 1.6) {
      this._slow = 0;
      if (dynamic && w.drsScale > 0.58) {
        w.setDynamicScale(w.drsScale - 0.1);
        this._cool = 0.8; this.ema = target;
        this._log(`Resolution ${Math.round(w.pixelRatio() / Math.min(devicePixelRatio || 1, 2) * 100)}%`);
      } else if (g.auto) {
        const lvl = this.autoLevel ?? PRESET_ORDER.indexOf(g.preset === 'custom' ? 'medium' : g.preset);
        if (lvl > 0) {
          this._stepTo(lvl - 1, 'lowered');
          this._cool = 3; this.ema = target;
        }
      }
    } else if (this._fast > 5) {
      this._fast = 0;
      if (w.drsScale < 1) {
        w.setDynamicScale(w.drsScale + 0.05);
        this._cool = 0.8;
      } else if (g.auto && this.autoLevel != null && this.autoLevel < this.autoCeiling && this._upOk()) {
        this._stepTo(this.autoLevel + 1, 'restored');
        this._cool = 6;
      }
    }
  }

  _upOk() {
    // only try to climb after the frame time has stayed comfortably low
    return this.ema < (1000 / Math.max(20, this.targetFps)) * 0.7;
  }

  _stepTo(level, verb) {
    const g = this.gfx;
    this.autoLevel = level;
    const name = PRESET_ORDER[level];
    const v = { ...PRESETS[name], fpsLimit: g.values.fpsLimit, renderScale: Math.min(PRESETS[name].renderScale, g.values.renderScale) };
    g.set(v);
    this._log(`Auto: quality ${verb} → ${name}`);
  }

  startAuto(presetName) {
    this.autoLevel = PRESET_ORDER.indexOf(presetName);
    if (this.autoLevel < 0) this.autoLevel = 1;
    this.autoCeiling = this.autoLevel;
    this._slow = this._fast = 0; this._cool = 2;
  }

  /** Draw the frame-time graph. Bars are ms; the line marks the target. */
  drawGraph(canvas) {
    const c = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    c.clearRect(0, 0, W, H);
    const maxMs = 50;
    const bw = W / HIST;
    for (let i = 0; i < HIST; i++) {
      const idx = (this.n + i) % HIST;
      const v = this.n < HIST && i < HIST - this.n ? 0 : this.hist[idx];
      const h = Math.min(1, v / maxMs) * H;
      const target = 1000 / Math.max(20, this.targetFps);
      c.fillStyle = v > target * 1.5 ? '#ff6b7a' : v > target * 1.15 ? '#ffc857' : '#6bd6a0';
      c.fillRect(i * bw, H - h, Math.max(1, bw - 0.5), h);
    }
    c.strokeStyle = 'rgba(255,255,255,.45)'; c.setLineDash([3, 3]);
    const ty = H - Math.min(1, (1000 / Math.max(20, this.targetFps)) / maxMs) * H;
    c.beginPath(); c.moveTo(0, ty); c.lineTo(W, ty); c.stroke(); c.setLineDash([]);
  }
}

/**
 * Short render benchmark. gl.finish() is not a reliable fence in browsers, so
 * the benchmark measures throughput instead: each animation frame submits K
 * renders of the real scene (Medium preset) and the callback cadence tells how
 * long they took. Cadence is capped by the display refresh, so a result at the
 * cap means "cost per render is at most vsync/K". Returns ms per render (an
 * upper bound when the display cap was hit), or null on a software renderer.
 */
export async function runBenchmark(world, caps, frames = 10, K = 6) {
  if (caps.software) return null;
  const saved = { ...world.gfx };
  const wasDrs = world.drsScale;
  world.drsScale = 1;
  world.applyGraphics({ ...PRESETS.medium, aa: 'fxaa', fpsLimit: 60 });
  const next = () => new Promise((r) => requestAnimationFrame(r));
  await next(); await next();
  const gaps = [];
  let prev = await next();
  for (let i = 0; i < frames; i++) {
    for (let k = 0; k < K; k++) world.pipeline.render(0.016);
    const t = await next();
    gaps.push(t - prev); prev = t;
  }
  world.drsScale = wasDrs;
  world.applyGraphics(saved);
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)] / K;
}
