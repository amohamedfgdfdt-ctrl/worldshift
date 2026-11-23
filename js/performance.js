// Frame-time monitor with automatic resolution scaling (Auto quality only).
export class PerformanceMonitor {
  constructor(world) {
    this.world = world;
    this.ema = 16;
    this.fps = 60;
    this.badTime = 0;
    this.goodTime = 0;
    this.scale = null;       // current pixel ratio when adapting
    this.minRatio = 0.65;
    this._fpsTimer = 0; this._fpsFrames = 0;
  }

  /** dt in seconds (raw frame time). */
  update(dt) {
    const ms = Math.min(dt * 1000, 200);
    this.ema += (ms - this.ema) * 0.05;
    this._fpsFrames++; this._fpsTimer += dt;
    if (this._fpsTimer >= 0.5) { this.fps = this._fpsFrames / this._fpsTimer; this._fpsFrames = 0; this._fpsTimer = 0; }
    const w = this.world;
    if (w.qualityMode !== 'auto') { this.scale = null; return; }
    const r = w.renderer;
    const cur = r.getPixelRatio();
    if (this.ema > 31) { this.badTime += dt; this.goodTime = 0; } else if (this.ema < 19) { this.goodTime += dt; this.badTime = 0; } else { this.badTime = 0; this.goodTime = 0; }
    if (this.badTime > 2.5) {
      this.badTime = 0;
      if (cur > this.minRatio + 0.01) {
        const next = Math.max(this.minRatio, cur - 0.2);
        w.setPixelRatio(next); this.scale = next;
        this.ema = 16;
      } else if (w.quality !== 'low') {
        w.applyQuality('low'); w.setPixelRatio(this.minRatio); this.ema = 16;
      }
    }
  }
}
