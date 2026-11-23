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
      canvas, antialias: dpr < 2, powerPreference: 'high-performance', alpha: false,
    });
    const r = this.renderer;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.95;
    r.setClearColor(0x0b0d14);

    this.scene = new THREE.Scene();
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
    this.applyQuality(this.quality);
    this.resize();
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

  applyQuality(q) {
    this.quality = q;
    const P = QUALITY[q];
    this.pixelCap = P.dpr;
    const r = this.renderer;
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, P.dpr));
    const on = P.shadow > 0;
    this.env.sun.castShadow = on;
    if (on && this.env.shadowMapSize !== P.shadow) this.env.setShadowSize(P.shadow);
    this.vegetation.setShadows(on && q === 'high');
    this.vegetation.setDensity(q === 'high' ? 1 : q === 'balanced' ? 0.72 : 0.45);
    this.buildings.setShadows(on);
    this.resize();
  }

  setPixelRatio(v) {
    this.renderer.setPixelRatio(v);
    this.resize();
  }

  resize() {
    const c = this.canvas;
    const w = Math.max(1, c.clientWidth), h = Math.max(1, c.clientHeight);
    this.renderer.setSize(w, h, false);
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
    this.renderer.render(this.scene, this.rig.camera);
  }
}
