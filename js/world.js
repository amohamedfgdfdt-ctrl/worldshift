// The World owns the renderer, scene and every world-space system, and knows
// how to (re)generate a world from a seed.
import * as THREE from '../vendor/three.module.min.js';
import { N, VERTS, HALF, CELL, DEFAULT_SEED, isTouchDevice } from './config.js';
import { HeightField, TerrainMesh } from './terrain.js';
import { WaterSim, WaterMesh } from './water-system.js';
import { createTextures } from './textures.js';
import { Environment } from './sky.js';
import { CameraRig } from './camera.js';
import { Vegetation } from './vegetation.js';
import { BuildingSystem } from './building-system.js';
import { Emitter } from './utils.js';
import { updateAtmosphere } from './atmosphere.js';
import { RenderPipeline } from './pipeline.js';
import { Particles } from './particles.js';
import { windUniforms } from './vegetation.js';
import { PRESETS } from './graphics.js';

export const QUALITY = {
  high: { dpr: 2, shadow: 2048, label: 'High' },
  balanced: { dpr: 1.5, shadow: 1024, label: 'Balanced' },
  low: { dpr: 1, shadow: 0, label: 'Low' },
};

export class World extends Emitter {
  constructor(canvas, { quality = 'auto' } = {}) {
    super();
    this.canvas = canvas;
    const dpr = window.devicePixelRatio || 1;
    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: false, powerPreference: 'high-performance', alpha: false,
    });
    const r = this.renderer;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.95;
    r.setClearColor(0x0b0d14);

    this.scene = new THREE.Scene();
    this.gfx = { ...PRESETS.medium };
    this.drsScale = 1;
    this._pv = new THREE.Matrix4(); this._frustum = new THREE.Frustum();
    this.caps = null;
    this.pipeline = new RenderPipeline(this);
    this.textures = createTextures(256);
    const maxAniso = r.capabilities.getMaxAnisotropy();
    this.textures.normal.anisotropy = Math.min(4, maxAniso);
    this.textures.waterNormal.anisotropy = Math.min(4, maxAniso);

    this.qualityMode = quality;            // 'auto' | 'high' | 'balanced' | 'low'
    this.quality = quality === 'auto' ? (isTouchDevice ? 'balanced' : 'high') : quality;

    this.seed = DEFAULT_SEED;
    this.field = new HeightField(this.seed);
    this.terrain = new TerrainMesh(this.field, this.textures);
    this.scene.add(this.terrain.group);

    this.water = new WaterSim(this.field);
    this.waterMesh = new WaterMesh(this.water, this.terrain.geometry.index, this.textures);
    this.scene.add(this.waterMesh.mesh);

    this.env = new Environment(this.scene, { cloudOctaves: isTouchDevice ? 3 : 4, shadowSize: QUALITY[this.quality].shadow || 1024 });
    this.rig = new CameraRig(canvas.clientWidth / Math.max(1, canvas.clientHeight), this.field);

    this.vegetation = new Vegetation(this.scene, this.field);
    this.buildings = new BuildingSystem({
      scene: this.scene, field: this.field, water: this.water, vegetation: this.vegetation,
      windMaterial: this.vegetation.windMat,
    });

    // data textures read by the terrain shader
    this.cellData = new Uint8Array(N * N * 4);
    this.cellTex = new THREE.DataTexture(this.cellData, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.cellTex.magFilter = this.cellTex.minFilter = THREE.NearestFilter;
    this.waterData = new Uint8Array(VERTS * VERTS * 4);
    this.waterTex = new THREE.DataTexture(this.waterData, VERTS, VERTS, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.waterTex.magFilter = this.waterTex.minFilter = THREE.LinearFilter;
    this.waterTex.wrapS = this.waterTex.wrapT = THREE.ClampToEdgeWrapper ?? THREE.ClampToEdgeWrapping;
    this.terrain.uniforms.uCellTex.value = this.cellTex;
    this.terrain.uniforms.uWaterTex.value = this.waterTex;

    this.wind = 0.6;
    this.cloud = 0.45;
    this.particles = new Particles(this.scene, this);
    this.applyGraphics(this.gfx);
    this._frames = 0;
  }

  /** (Re)generate a whole world from a seed. Buildings are removed. */
  build(seed = this.seed) {
    this.seed = seed >>> 0;
    this.buildings.clearAll();
    this.field.generate(this.seed);
    this.terrain.refresh();
    this.water.syncGround();
    this.water.resetToInitial();
    const f = this.field;
    this.vegetation.generate(this.seed, (x, z) => {
      const i = Math.round((x + HALF) / CELL), j = Math.round((z + HALF) / CELL);
      if (i < 0 || j < 0 || i >= VERTS || j >= VERTS) return 0;
      return f.initialWater[j * VERTS + i];
    });
    this.buildings.placeSource(f.riverSource.i, f.riverSource.j, 8, 1);
    this.rig.reset(true);
    this.refreshWaterTexture();
    this.refreshCellTexture();
    this.waterMesh.update(true);
    this.emit('built');
  }

  /** Legacy hook kept for old callers: maps the three old names onto presets. */
  applyQuality(q) {
    const map = { high: 'high', balanced: 'medium', low: 'low' };
    this.applyGraphics(PRESETS[map[q] || 'medium']);
  }

  /** Total pixel ratio = native DPR (capped at 2) x render scale x dynamic scale. */
  pixelRatio() {
    const base = Math.min(window.devicePixelRatio || 1, 2);
    return Math.max(0.3, Math.min(2.5, base * this.gfx.renderScale * this.drsScale));
  }

  setDynamicScale(v) {
    v = Math.max(0.5, Math.min(1, v));
    if (Math.abs(v - this.drsScale) < 1e-3) return;
    this.drsScale = v;
    this.resize();
  }

  /** Push a (sanitised) settings object into every real rendering system. */
  applyGraphics(g, caps = this.caps) {
    const prev = this.gfx;
    this.gfx = { ...g };
    if (caps) this.caps = caps;
    const r = this.renderer;
    const shadowOn = g.shadowRes > 0;
    // --- shadows
    this.env.sun.castShadow = shadowOn;
    if (shadowOn && this.env.shadowMapSize !== g.shadowRes) this.env.setShadowSize(g.shadowRes);
    const types = [THREE.BasicShadowMap, THREE.PCFShadowMap, THREE.PCFSoftShadowMap];
    const type = types[g.shadowQuality] ?? THREE.PCFShadowMap;
    if (r.shadowMap.type !== type) {
      r.shadowMap.type = type;
      this.scene.traverse((o) => { const m = o.material; if (m) (Array.isArray(m) ? m : [m]).forEach((x) => { x.needsUpdate = true; }); });
    }
    this.env.sun.shadow.radius = [1, 2, 3][g.shadowQuality] ?? 2;
    this.buildings.setShadows(shadowOn);
    this.vegetation.setShadows(shadowOn && g.foliageQuality >= 2);
    // --- vegetation
    this.vegetation.setDensity(g.vegDensity);
    this.particles?.setDensity(g.particles);
    // --- terrain and textures
    this.terrain.uniforms.uDetailLvl.value = g.terrainDetail;
    const ns = [0.0, 0.5, 0.9][g.terrainDetail] ?? 0.5;
    this.terrain.material.normalScale.set(ns, ns);
    this.terrain.uniforms.uWaterQ.value = g.waterQuality;
    const maxA = this.renderer.capabilities.getMaxAnisotropy();
    const aniso = [1, Math.min(4, maxA), Math.min(16, maxA)][g.textureQuality] ?? 1;
    for (const t of [this.textures.normal, this.textures.waterNormal, this.textures.detail]) {
      if (t.anisotropy !== aniso) { t.anisotropy = aniso; t.needsUpdate = true; }
    }
    // --- water (visual only; the flow simulation is untouched)
    this.waterMesh.setQuality(g.waterQuality, g.reflectionQuality);
    // --- draw distance
    const dd = g.drawDistance;
    this.vegetation.cullTree.value = 620 * dd;
    this.vegetation.cullGrass.value = 175 * dd;
    this.vegetation.setLodScale([0.6, 0.85, 1][g.foliageQuality] * Math.sqrt(dd));
    this.vegetation.lodDist = (g.foliageQuality >= 2 ? 150 : g.foliageQuality === 1 ? 110 : 70) * dd;
    this.env.fogDensityBase = 0.0014 / dd;
    this.scene.fog.density = this.env.fogDensityBase;
    // --- pipeline + resolution
    this.pipeline.configure(g, this.caps || { float: true, maxSamples: 4 });
    this.resize();
    if (this.perf) this.perf._cool = Math.max(this.perf._cool || 0, 2.5);   // let the new settings settle before adapting
    this.emit('graphics', g, prev);
  }

  /** After external assets replaced instance sets: re-apply the shadow and density settings to the new sets. */
  refreshAssetState() {
    const g = this.gfx, on = g.shadowRes > 0;
    this.buildings.setShadows(on);
    this.vegetation.setShadows(on && g.foliageQuality >= 2);
    this.vegetation.setDensity(g.vegDensity);
  }

  setPixelRatio(v) { this.drsScale = v; this.resize(); }

  resize() {
    const c = this.canvas;
    const w = Math.max(1, c.clientWidth), h = Math.max(1, c.clientHeight);
    this.pipeline.setSize(w, h, this.pixelRatio());
    this.rig.resize(w, h);
    this.viewH = h;
  }

  refreshWaterTexture() {
    const d = this.water.depth, o = this.waterData;
    for (let k = 0, t = d.length; k < t; k++) {
      const v = d[k] / 6;
      o[k * 4 + 1] = v >= 1 ? 255 : (v * 255) | 0;
      o[k * 4 + 3] = 255;
    }
    this.waterTex.needsUpdate = true;
  }

  refreshCellTexture() {
    const b = this.buildings, w = this.water, f = this.field, o = this.cellData;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const k = j * VERTS + i;
        let ok = i >= 1 && j >= 1 && i < N - 1 && j < N - 1 && b.occ[j * N + i] === 0;
        if (ok) {
          const h0 = f.h[k], h1 = f.h[k + 1], h2 = f.h[k + VERTS], h3 = f.h[k + VERTS + 1];
          const mx = Math.max(h0, h1, h2, h3), mn = Math.min(h0, h1, h2, h3);
          if (mx - mn > 1.8 || mx > 47) ok = false;
          else if (w.depth[k] > 0.03 || w.depth[k + 1] > 0.03 || w.depth[k + VERTS] > 0.03 || w.depth[k + VERTS + 1] > 0.03) ok = false;
        }
        const p = (j * N + i) * 4;
        o[p] = ok ? 255 : 0;
        o[p + 3] = 255;
      }
    }
    this.cellTex.needsUpdate = true;
  }

  frame(dt, sim) {
    this.rig.update(dt, this.viewH);
    const hour = sim.hour;
    this.env.update(hour, this.rig.cur.target, sim.animTime, this.cloud);
    this.env.followCamera(this.rig.camera);
    this.env.applyToWater(this.waterMesh.uniforms);
    this.waterMesh.uniforms.uTime.value = sim.animTime;
    this.terrain.uniforms.uTime.value = sim.animTime;
    if (this.water.dirty) {
      this.waterMesh.update();
      if ((this._frames & 1) === 0) this.refreshWaterTexture();
    }
    this.buildings.update(dt);
    this._frames++;
    this.rig.camera.updateMatrixWorld();
    this._pv.multiplyMatrices(this.rig.camera.projectionMatrix, this.rig.camera.matrixWorldInverse);
    this._frustum.setFromProjectionMatrix(this._pv);
    this.vegetation.updateLod(this.rig.camera.position, this._frustum);
    for (const st of Object.values(this.buildings.sets)) st.updateLod?.(this.rig.camera.position);
    windUniforms.uWind.value = this.gfx.foliageQuality > 0 ? this.wind : 0;
    this.scene.fog.density = this.env.fogDensityBase ?? 0.0014;
    this.rig.camera.updateMatrixWorld();
    updateAtmosphere(this.rig.camera, this.env, this.gfx.volumetric);
    // linear-space fog (post-processing path) looks heavier than display-space fog (direct path); match them
    if (this.pipeline.mode === 'composer') this.scene.fog.density *= 0.6;
    this.particles.update(dt, this.buildings, this.env, this.wind);
    const t0 = performance.now();
    this.perf?.gpuBegin();
    this.pipeline.render(dt);
    this.perf?.gpuEnd();
    this.renderMs = performance.now() - t0;
  }
}
