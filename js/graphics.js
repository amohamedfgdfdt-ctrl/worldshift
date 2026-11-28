// Graphics settings: schema, presets, hardware assessment, benchmark, storage.
// The schema is the single source of truth: the UI is generated from it and
// every key is read by a real rendering system (see GraphicsManager.apply).
import { Emitter, clamp } from './utils.js';

export const GFX_KEY = 'worldshift.terra.graphics.v1';

/** Preset values. Every preset defines every key. */
export const PRESETS = {
  low: {
    fpsLimit: 30, shadowRes: 0, shadowQuality: 0, waterQuality: 0, reflectionQuality: 0,
    textureQuality: 0, aa: 'off', ao: 0, vegDensity: 0.4, foliageQuality: 0, renderScale: 0.75,
    drawDistance: 0.55, terrainDetail: 0, post: 0, volumetric: 0, particles: 0.25, traffic: 0,
  },
  medium: {
    fpsLimit: 60, shadowRes: 1024, shadowQuality: 1, waterQuality: 1, reflectionQuality: 0,
    textureQuality: 1, aa: 'fxaa', ao: 0, vegDensity: 0.7, foliageQuality: 1, renderScale: 1,
    drawDistance: 0.75, terrainDetail: 1, post: 0, volumetric: 1, particles: 0.5, traffic: 1,
  },
  high: {
    fpsLimit: 60, shadowRes: 2048, shadowQuality: 2, waterQuality: 2, reflectionQuality: 1,
    textureQuality: 2, aa: 'smaa', ao: 0, vegDensity: 0.9, foliageQuality: 2, renderScale: 1,
    drawDistance: 1, terrainDetail: 2, post: 1, volumetric: 1, particles: 0.8, traffic: 2,
  },
  ultra: {
    fpsLimit: 60, shadowRes: 4096, shadowQuality: 2, waterQuality: 3, reflectionQuality: 3,
    textureQuality: 2, aa: 'msaa', ao: 2, vegDensity: 1, foliageQuality: 2, renderScale: 1,
    drawDistance: 1, terrainDetail: 2, post: 1, volumetric: 2, particles: 1, traffic: 2,
  },
};
export const PRESET_ORDER = ['low', 'medium', 'high', 'ultra'];

/** UI/validation schema. `needs` names a capability that must be present. */
export const SCHEMA = [
  { group: 'Performance', items: [
    { key: 'fpsLimit', label: 'Frame rate limit', type: 'select', options: [[30, '30 FPS'], [45, '45 FPS'], [60, '60 FPS'], [90, '90 FPS'], [120, '120 FPS']],
      hint: 'A target, not a guarantee. Your display refresh rate is the real ceiling.' },
    { key: 'renderScale', label: 'Render resolution scale', type: 'range', min: 0.5, max: 1.25, step: 0.05, fmt: (v) => Math.round(v * 100) + '%',
      hint: 'Internal resolution relative to the screen. Above 100% supersamples.' },
    { key: 'drawDistance', label: 'Draw distance', type: 'range', min: 0.4, max: 1, step: 0.05, fmt: (v) => Math.round(v * 100) + '%',
      hint: 'Camera far plane, fog distance and vegetation culling range.' },
  ] },
  { group: 'Shadows & light', items: [
    { key: 'shadowRes', label: 'Shadow resolution', type: 'select', options: [[0, 'Off'], [512, '512'], [1024, '1024'], [2048, '2048'], [4096, '4096']], needs: 'tex4096' },
    { key: 'shadowQuality', label: 'Shadow quality', type: 'select', options: [[0, 'Hard'], [1, 'Soft (PCF)'], [2, 'Softest']] },
    { key: 'ao', label: 'Ambient occlusion', type: 'select', options: [[0, 'Off'], [1, 'GTAO · Medium'], [2, 'GTAO · High']], needs: 'float',
      hint: 'Screen-space GTAO. Needs float render targets and post-processing.' },
    { key: 'volumetric', label: 'Volumetric effects', type: 'select', options: [[0, 'Off'], [1, 'Height fog + sun scatter'], [2, '+ Light shafts']],
      hint: 'Light shafts are a screen-space radial blur, not true volumetrics.' },
  ] },
  { group: 'Image', items: [
    { key: 'aa', label: 'Anti-aliasing', type: 'select', options: [['off', 'Off'], ['fxaa', 'FXAA'], ['smaa', 'SMAA'], ['msaa', 'MSAA 4×']], needs: 'float' },
    { key: 'post', label: 'Post-processing', type: 'select', options: [[0, 'Off'], [1, 'Bloom + cinematic grade']], needs: 'float' },
    { key: 'textureQuality', label: 'Texture quality', type: 'select', options: [[0, 'Low'], [1, 'Medium'], [2, 'High']],
      hint: 'Anisotropic filtering and procedural texture resolution.' },
  ] },
  { group: 'World', items: [
    { key: 'terrainDetail', label: 'Terrain detail', type: 'select', options: [[0, 'Basic'], [1, 'Detailed'], [2, 'Rich (layers + micro relief)']] },
    { key: 'vegDensity', label: 'Vegetation density', type: 'range', min: 0.1, max: 1, step: 0.05, fmt: (v) => Math.round(v * 100) + '%' },
    { key: 'foliageQuality', label: 'Foliage quality', type: 'select', options: [[0, 'Static'], [1, 'Wind sway'], [2, 'Wind + tree shadows']] },
    { key: 'particles', label: 'Particle density', type: 'range', min: 0, max: 1, step: 0.05, fmt: (v) => Math.round(v * 100) + '%' },
    { key: 'traffic', label: 'Traffic', type: 'select', options: [[0, 'Light · 8 cars'], [1, 'Normal · 18 cars'], [2, 'Busy · 30 cars']],
      hint: 'How many vehicles drive at once. They are instanced, so the cost is small.' },
  ] },
  { group: 'Water', items: [
    { key: 'waterQuality', label: 'Water quality', type: 'select', options: [[0, 'Low · flat'], [1, 'Medium · ripples'], [2, 'High · waves + foam'], [3, 'Ultra · + caustics']],
      hint: 'Only changes how water looks. The flow simulation is identical at every level.' },
    { key: 'reflectionQuality', label: 'Reflection quality', type: 'select', options: [[0, 'Sky only'], [1, 'Sky + sun glint'], [2, 'Planar · half res'], [3, 'Planar · high res']], needs: 'float',
      hint: 'Planar reflections re-render the scene for the lake surface.' },
  ] },
];

export const KEYS = SCHEMA.flatMap((g) => g.items.map((i) => i.key));
const ITEM = Object.fromEntries(SCHEMA.flatMap((g) => g.items).map((i) => [i.key, i]));

export function detectCaps(renderer, canvas) {
  const gl = renderer.getContext();
  const c = renderer.capabilities;
  let rendererName = '', vendor = '';
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  if (dbg) { rendererName = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || ''; vendor = gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) || ''; }
  const software = /swiftshader|llvmpipe|software|softpipe/i.test(rendererName);
  const floatRT = !!gl.getExtension('EXT_color_buffer_float') || !!gl.getExtension('EXT_color_buffer_half_float');
  const timer = !!gl.getExtension('EXT_disjoint_timer_query_webgl2');
  return {
    webgl2: c.isWebGL2,
    maxTexture: c.maxTextureSize,
    tex4096: c.maxTextureSize >= 4096,
    maxAniso: c.getMaxAnisotropy(),
    maxSamples: c.maxSamples || 0,
    float: floatRT,
    timer,
    software,
    rendererName,           // only used for software-renderer detection and display
    vendor,
    dpr: window.devicePixelRatio || 1,
    screenW: screen.width, screenH: screen.height,
    cores: navigator.hardwareConcurrency || 0,
    memoryGB: navigator.deviceMemory || 0,
    touch: matchMedia('(pointer:coarse)').matches,
  };
}

/** Measure the display refresh rate with a short rAF probe. */
export function measureRefresh(ms = 600) {
  return new Promise((resolve) => {
    const ts = [];
    let t0 = performance.now();
    function tick(t) {
      ts.push(t);
      if (t - t0 < ms) requestAnimationFrame(tick);
      else {
        const d = [];
        for (let i = 1; i < ts.length; i++) d.push(ts[i] - ts[i - 1]);
        d.sort((a, b) => a - b);
        const med = d[Math.floor(d.length / 2)] || 16.7;
        resolve(clamp(1000 / med, 20, 240));
      }
    }
    requestAnimationFrame(tick);
  });
}

export class GraphicsSettings extends Emitter {
  constructor(caps) {
    super();
    this.caps = caps;
    this.refreshHz = 60;
    this.values = { ...PRESETS.medium };
    this.preset = 'medium';
    this.auto = false;
    this.firstRun = true;
    this.suggestion = null;
  }

  /** Is this setting usable on this device? */
  supported(key) {
    const it = ITEM[key];
    if (!it || !it.needs) return true;
    return !!this.caps[it.needs];
  }

  optionSupported(key, v) {
    if (key === 'shadowRes' && v > this.caps.maxTexture) return false;
    if (key === 'fpsLimit' && v > Math.ceil(this.refreshHz * 1.15) + 1 && v > 60) return false;
    if (key === 'aa' && v === 'msaa' && this.caps.maxSamples < 4) return false;
    return true;
  }

  /** Clamp a values object to what this device can really do. */
  sanitize(v) {
    const o = { ...PRESETS.medium };
    for (const k of KEYS) {
      if (v[k] === undefined) continue;
      const it = ITEM[k];
      let x = v[k];
      if (it.type === 'range') x = clamp(+x, it.min, it.max);
      else if (!it.options.some(([ov]) => ov === x)) x = o[k];
      o[k] = x;
    }
    const c = this.caps;
    if (!c.float) { o.aa = o.aa === 'off' ? 'off' : 'fxaa'; o.ao = 0; o.post = 0; if (o.reflectionQuality > 1) o.reflectionQuality = 1; }
    if (o.aa === 'msaa' && c.maxSamples < 4) o.aa = 'smaa';
    if (o.shadowRes > c.maxTexture) o.shadowRes = c.maxTexture;
    if (o.ao > 0) o.post = o.post || 1;
    return o;
  }

  presetFor(values) {
    for (const p of PRESET_ORDER) if (KEYS.every((k) => values[k] === PRESETS[p][k])) return p;
    return 'custom';
  }

  setPreset(name) {
    if (!PRESETS[name]) return;
    this.values = this.sanitize(PRESETS[name]);
    // keep fps limit within what the display can show
    this.preset = this.presetFor(this.values) === name ? name : 'custom';
    this.emit('change', this.values);
  }

  set(patch) {
    this.values = this.sanitize({ ...this.values, ...patch });
    this.preset = this.presetFor(this.values);
    this.emit('change', this.values);
  }

  toJSON() { return { v: 1, preset: this.preset, auto: this.auto, values: this.values, firstRun: false }; }

  save() { try { localStorage.setItem(GFX_KEY, JSON.stringify(this.toJSON())); } catch { /* storage may be unavailable */ } }

  load() {
    try {
      const raw = localStorage.getItem(GFX_KEY);
      if (!raw) return false;
      const d = JSON.parse(raw);
      if (!d || d.v !== 1 || !d.values) return false;
      this.values = this.sanitize(d.values);
      this.preset = this.presetFor(this.values);
      this.auto = !!d.auto;
      this.firstRun = false;
      return true;
    } catch { return false; }
  }

  /** Pick a preset from caps + a measured render time (ms per frame at Medium). */
  recommend(benchMs) {
    const c = this.caps;
    const notes = [];
    let p;
    if (c.software) { p = 'low'; notes.push('Software rendering detected (no GPU acceleration).'); }
    else if (benchMs == null) p = c.touch ? 'medium' : 'high';
    else if (benchMs < 3) p = 'ultra';
    else if (benchMs < 6) p = 'high';
    else if (benchMs < 12) p = 'medium';
    else p = 'low';
    // Mobile profile: phones and tablets heat up and throttle, so Ultra is never suggested, High only
    // for a clearly strong device, and a weak one (little memory / few cores) starts on Low.
    if (c.touch) {
      const weak = (c.memoryGB && c.memoryGB <= 4) || (c.cores && c.cores <= 4);
      const strong = c.memoryGB >= 6 && c.cores >= 8;
      if (p === 'ultra') p = 'high';
      if (p === 'high' && !strong) p = 'medium';
      if (weak && p !== 'low') { p = 'low'; notes.push('Mobile device with limited memory or cores: lightest preset suggested to limit heat and stutter.'); }
    }
    if (!c.float && (p === 'ultra' || p === 'high')) { p = 'medium'; notes.push('Float render targets unavailable.'); }
    if (c.dpr >= 3 && p !== 'low') notes.push('High pixel density screen: render scale kept in check.');
    if (benchMs != null) notes.push(`Benchmark: about ${benchMs.toFixed(1)} ms per frame at Medium (upper bound when the display refresh caps the test).`);
    return { preset: p, notes };
  }
}
