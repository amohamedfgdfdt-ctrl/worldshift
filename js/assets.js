// External asset pipeline (GLB / glTF 2.0).
//
// assets/manifest.json (version 2) lists every external asset: what it replaces
// (a building type or a vegetation species), its category, its expected size,
// and one file per detail level (high / medium / low). Everything that fails
// to load or validate is skipped and the procedural model stays in place, so
// the game always works with zero, some or all assets present.
//
// Nothing here is loaded until the manifest actually lists an asset: the glTF
// loader, Draco / Meshopt / KTX2 decoders are imported dynamically on demand.
import * as THREE from '../vendor/three.module.min.js';
import { TYPES } from './buildings.js';
import { Vegetation, windify } from './vegetation.js';
import { LodInstanceSet } from './instances.js';

const VEG = Object.keys(Vegetation.SPECIES);
/** category -> targets it may replace */
export const CATEGORIES = {
  building: () => Object.keys(TYPES).filter((k) => !TYPES[k].special && k !== 'tree'),
  tree: () => ['oak', 'pine', 'birch', 'tree'],
  shrub: () => ['bush', 'reed'],
  rock: () => ['rock'],
  plant: () => ['grass', 'flower', 'reed'],
};
const DEFAULT_DISTANCES = {
  building: [0, 90, 220], tree: [0, 70, 170], shrub: [0, 45, 110], rock: [0, 60, 150], plant: [0, 30, 80],
};
const LEVEL_NAMES = ['high', 'medium', 'low'];
const VERTEX_ATTRS = ['position', 'normal', 'uv'];

const here = (rel) => new URL(rel, import.meta.url).href;

export class AssetManager {
  constructor(world) {
    this.world = world;
    this.loaded = {};        // target -> {id, category, levels:[{url, tris, materials, distance}], dimensions, warnings}
    this.failed = {};        // id -> reason
    this.warnings = [];
    this.decodersUsed = new Set();
    this._loader = null;
    this._lib = null;
    this.decoderBase = here('../vendor/decoders/');
  }

  // ------------------------------------------------------------------ manifest
  /** Validate a manifest object. Returns { entries:[normalised], errors:[string] }. */
  static validate(man) {
    const errors = [], entries = [];
    if (!man || typeof man !== 'object') return { entries, errors: ['manifest is not an object'] };
    const src = { ...(man.assets || {}) };
    // version 1 compatibility: { models: { house_small: { url } } }
    for (const [k, v] of Object.entries(man.models || {})) {
      src[k] = { category: TYPES[k] ? 'building' : 'tree', target: k, ...v };
    }
    for (const [id, a] of Object.entries(src)) {
      const bad = (m) => errors.push(`${id}: ${m}`);
      if (!a || typeof a !== 'object') { bad('entry is not an object'); continue; }
      const category = a.category;
      if (!CATEGORIES[category]) { bad(`unknown category "${category}" (use ${Object.keys(CATEGORIES).join(', ')})`); continue; }
      const target = a.target ?? id;
      if (!CATEGORIES[category]().includes(target)) { bad(`category "${category}" cannot replace "${target}" (allowed: ${CATEGORIES[category]().join(', ')})`); continue; }
      let lods = Array.isArray(a.lods) ? a.lods : (a.url ? [{ url: a.url }] : []);
      lods = lods.filter((l) => l && typeof l.url === 'string' && l.url);
      if (!lods.length) { bad('no model url (set "url" or "lods":[{level,url,distance}])'); continue; }
      if (lods.length > 3) { bad('at most 3 detail levels (high, medium, low)'); continue; }
      const def = DEFAULT_DISTANCES[category];
      lods = lods.map((l, i) => ({ level: l.level || LEVEL_NAMES[i], url: l.url, distance: i === 0 ? 0 : Number.isFinite(l.distance) ? l.distance : def[i] }));
      let ok = true;
      for (let i = 1; i < lods.length; i++) if (lods[i].distance <= lods[i - 1].distance) { bad('LOD distances must increase'); ok = false; }
      if (!ok) continue;
      const d = a.dimensions;
      if (d && !(d.height > 0 || d.width > 0 || d.depth > 0)) { bad('dimensions needs width/height/depth in metres'); continue; }
      const fit = a.fit ?? 'none';
      if (!['none', 'height', 'footprint'].includes(fit)) { bad('fit must be none, height or footprint'); continue; }
      entries.push({ id, category, target, lods, dimensions: d || null, fit, scale: a.scale ?? 1, yOffset: a.yOffset ?? 0 });
    }
    return { entries, errors };
  }

  /** Load the manifest and every asset in it. A missing manifest is not an error. */
  async loadManifest(url = here('../assets/manifest.json')) {
    url = new URL(url, location.href).href;
    let man;
    try {
      const r = await fetch(url, { cache: 'no-cache' });
      if (!r.ok) return this.report();
      man = await r.json();
    } catch { return this.report(); }
    if (man.decoders?.path) this.decoderBase = new URL(man.decoders.path, url).href;
    const { entries, errors } = AssetManager.validate(man);
    for (const e of errors) { this.failed[e.split(':')[0]] = e; console.warn('[assets]', e); }
    const base = url;
    for (const e of entries) {
      try { await this.loadAsset(e, base); } catch (err) { this.failed[e.id] = String(err.message || err); console.warn('[assets]', e.id, err); }
    }
    return this.report();
  }

  // ------------------------------------------------------------------ loaders
  async _ensure() {
    if (this._loader) return;
    const [{ GLTFLoader }, { DRACOLoader }, { KTX2Loader }, { MeshoptDecoder }, bg] = await Promise.all([
      import('../vendor/jsm/loaders/GLTFLoader.js'),
      import('../vendor/jsm/loaders/DRACOLoader.js'),
      import('../vendor/jsm/loaders/KTX2Loader.js'),
      import('../vendor/jsm/libs/meshopt_decoder.module.js'),
      import('../vendor/jsm/utils/BufferGeometryUtils.js'),
    ]);
    this._lib = bg;
    const loader = new GLTFLoader();
    this.draco = new DRACOLoader().setDecoderPath(this.decoderBase + 'draco/');
    this.ktx2 = new KTX2Loader().setTranscoderPath(this.decoderBase + 'basis/').detectSupport(this.world.renderer);
    loader.setDRACOLoader(this.draco).setKTX2Loader(this.ktx2).setMeshoptDecoder(MeshoptDecoder);
    this._loader = loader;
  }

  async _parse(url) {
    await this._ensure();
    const gltf = await this._loader.loadAsync(url);
    for (const x of gltf.parser.json.extensionsUsed || []) {
      if (x === 'KHR_draco_mesh_compression') this.decodersUsed.add('draco');
      else if (x === 'EXT_meshopt_compression') this.decodersUsed.add('meshopt');
      else if (x === 'KHR_texture_basisu') this.decodersUsed.add('ktx2');
    }
    return gltf;
  }

  // ------------------------------------------------------------------ loading one asset
  async loadAsset(e, base = location.href) {
    const warnings = [];
    const levels = [];
    for (let i = 0; i < e.lods.length; i++) {
      const l = e.lods[i];
      try {
        const gltf = await this._parse(new URL(l.url, base).href);
        const f = this.flatten(gltf.scene);
        levels.push({ ...f, distance: l.distance, url: l.url, level: l.level });
      } catch (err) {
        if (i === 0) throw new Error(`high-detail model failed: ${err.message || err}`);
        warnings.push(`${l.level} LOD skipped: ${err.message || err}`);
      }
    }
    // uniform scale, decided on the high level and applied to every level
    const hi = levels[0].box.getSize(new THREE.Vector3());
    let s = e.scale;
    if (e.dimensions && e.fit !== 'none') {
      const d = e.dimensions;
      const ratios = e.fit === 'height' ? [d.height / hi.y] : [d.width / hi.x, d.depth / hi.z].filter(Number.isFinite);
      const r = ratios.find((x) => x > 0 && Number.isFinite(x));
      if (r) s *= r;
    }
    for (const lv of levels) {
      lv.geometry.scale(s, s, s); lv.geometry.translate(0, e.yOffset, 0);
      lv.geometry.computeBoundingBox(); lv.geometry.computeBoundingSphere();
      lv.box = lv.geometry.boundingBox.clone();
    }
    const size = levels[0].box.getSize(new THREE.Vector3());
    if (e.dimensions) {
      for (const [k, v] of [['width', size.x], ['height', size.y], ['depth', size.z]]) {
        const want = e.dimensions[k];
        if (want > 0 && Math.abs(v - want) / want > 0.35) warnings.push(`${k} is ${v.toFixed(2)} m, manifest says ${want} m`);
      }
    }
    for (let i = 1; i < levels.length; i++) if (levels[i].tris > levels[i - 1].tris) warnings.push(`${levels[i].level} LOD has more triangles than ${levels[i - 1].level}`);
    // wind + draw-distance culling for vegetation-like targets
    const isBuilding = !!TYPES[e.target] && !TYPES[e.target].special && e.target !== 'tree';
    const w = this.world;
    const cull = isBuilding ? null : e.target === 'tree' ? w.vegetation.cullTree : w.vegetation.cullFor(e.target);
    const windy = !isBuilding && e.target !== 'rock';
    const out = levels.map((lv) => {
      const mats = lv.materials.map((m) => (windy ? windify(m, cull) : m));
      return { geometry: lv.geometry, material: mats.length === 1 ? mats[0] : mats, distance: lv.distance };
    });
    // swap only after everything loaded fine
    const previous = this.loaded[e.target];
    if (TYPES[e.target] && !TYPES[e.target].special) w.buildings.replaceModel(e.target, out);
    else w.vegetation.replaceSpecies(e.target, out);
    if (previous) this._disposeLevels(previous._levels);
    this.applyTextureQuality(w.gfx.textureQuality);
    w.refreshAssetState();
    this.loaded[e.target] = {
      id: e.id, category: e.category, size: { w: +size.x.toFixed(2), h: +size.y.toFixed(2), d: +size.z.toFixed(2) }, scale: +s.toFixed(4), warnings,
      levels: levels.map((lv) => ({ level: lv.level, url: lv.url, tris: lv.tris, materials: lv.materials.length, distance: lv.distance })),
      _levels: out,
    };
    this.warnings.push(...warnings.map((x) => `${e.id}: ${x}`));
    return this.loaded[e.target];
  }

  /** Convenience for runtime / tests: load a single model URL as a one-level asset. */
  async useModel(target, url, opts = {}) {
    const category = opts.category || (TYPES[target] && target !== 'tree' ? 'building' : target === 'bush' || target === 'reed' ? 'shrub' : target === 'rock' ? 'rock' : 'tree');
    const { entries, errors } = AssetManager.validate({ assets: { [target]: { category, target, ...opts, url: opts.lods ? undefined : url } } });
    if (!entries.length) throw new Error(errors.join('; '));
    return this.loadAsset(entries[0], location.href);
  }

  _disposeLevels(levels) {
    for (const lv of levels || []) {
      lv.geometry.dispose();
      const mats = Array.isArray(lv.material) ? lv.material : [lv.material];
      for (const m of mats) {
        for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap']) m[k]?.dispose();
        m.dispose();
      }
    }
  }

  // ------------------------------------------------------------------ flatten: real multi-material support
  /**
   * Bake node transforms and merge every mesh into ONE geometry that has one
   * group per distinct material. Meshes that use several materials (geometry
   * groups + material array) are split by group, so no material is dropped.
   */
  flatten(root) {
    root.updateMatrixWorld(true);
    const buckets = new Map();   // material -> [geometry]
    const put = (m, g) => { if (!buckets.has(m)) buckets.set(m, []); buckets.get(m).push(g); };
    root.traverse((o) => {
      if (!o.isMesh || !o.geometry || !o.geometry.attributes.position) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      g.applyMatrix4(o.matrixWorld);
      const groups = o.geometry.groups;
      if (mats.length > 1 && groups.length) {
        for (const gr of groups) {
          const m = mats[gr.materialIndex];
          if (m) put(m, this._slice(g, gr.start, gr.count));
        }
      } else put(mats[0], g);
    });
    if (!buckets.size) throw new Error('model has no meshes');
    const parts = [], materials = [];
    let tris = 0;
    for (const [m, list] of buckets) {
      const wantColor = !!m.vertexColors;
      const wantUv1 = list.some((g) => g.attributes.uv1);
      const norm = list.map((g) => this._normalise(g, wantColor, wantUv1));
      const merged = this._lib.mergeGeometries(norm, false);
      if (!merged) throw new Error('could not merge geometries of one material');
      tris += merged.attributes.position.count / 3;
      parts.push(merged); materials.push(m);
    }
    const geometry = parts.length === 1 ? parts[0] : this._lib.mergeGeometries(parts, true);
    geometry.computeBoundingBox();
    return { geometry, materials, tris, box: geometry.boundingBox.clone() };
  }

  _slice(g, start, count) {
    const out = new THREE.BufferGeometry();
    for (const [name, a] of Object.entries(g.attributes)) {
      const n = a.itemSize, arr = new Float32Array(count * n);
      for (let i = 0; i < count; i++) for (let c = 0; c < n; c++) arr[i * n + c] = a.getComponent ? a.getComponent(start + i, c) : a.array[(start + i) * n + c];
      out.setAttribute(name, new THREE.BufferAttribute(arr, n));
    }
    return out;
  }

  /** Same attribute set, float arrays, 3-component colours: needed for mergeGeometries. */
  _normalise(g, wantColor, wantUv1) {
    const out = new THREE.BufferGeometry();
    const count = g.attributes.position.count;
    const f32 = (a, n) => {
      const arr = new Float32Array(count * n);
      for (let i = 0; i < count; i++) for (let c = 0; c < n; c++) arr[i * n + c] = c < a.itemSize ? a.getComponent(i, c) : 1;
      return new THREE.BufferAttribute(arr, n);
    };
    out.setAttribute('position', f32(g.attributes.position, 3));
    if (g.attributes.normal) out.setAttribute('normal', f32(g.attributes.normal, 3)); else { out.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(count * 3), 3)); out.computeVertexNormals(); }
    out.setAttribute('uv', g.attributes.uv ? f32(g.attributes.uv, 2) : new THREE.BufferAttribute(new Float32Array(count * 2), 2));
    if (wantUv1) out.setAttribute('uv1', g.attributes.uv1 ? f32(g.attributes.uv1, 2) : new THREE.BufferAttribute(new Float32Array(count * 2), 2));
    if (wantColor) out.setAttribute('color', g.attributes.color ? f32(g.attributes.color, 3) : new THREE.BufferAttribute(new Float32Array(count * 3).fill(1), 3));
    return out;
  }

  // ------------------------------------------------------------------ quality hooks / report
  applyTextureQuality(q) {
    const max = this.world.renderer.capabilities.getMaxAnisotropy();
    const aniso = [1, Math.min(4, max), Math.min(16, max)][q] ?? 1;
    const sets = [...Object.values(this.world.buildings.sets), ...Object.values(this.world.vegetation.sets)];
    for (const s of sets) for (const mesh of s.meshes ?? [s.mesh]) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap']) {
        const t = m[k]; if (t && t.anisotropy !== aniso) { t.anisotropy = aniso; t.needsUpdate = true; }
      }
    }
  }

  report() {
    const loaded = {};
    for (const [k, v] of Object.entries(this.loaded)) { const { _levels, ...rest } = v; loaded[k] = rest; }
    return { count: Object.keys(loaded).length, loaded, failed: { ...this.failed }, warnings: [...this.warnings], decoders: [...this.decodersUsed] };
  }
}

export { LodInstanceSet, VEG };
