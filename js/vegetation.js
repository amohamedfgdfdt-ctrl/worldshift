// Environmental detail: trees, bushes, rocks, grass and flowers.
// Everything is instanced (one draw call per kind) and trees/grass sway in the
// wind through a small vertex-shader injection.
import * as THREE from '../vendor/three.module.min.js';
import { HALF, CELL } from './config.js';
import { Noise2D, mulberry32, smoothstep, clamp } from './utils.js';
import { InstanceSet, LodInstanceSet } from './instances.js';
import { buildOak, buildPine, buildBirch, buildOakLow, buildPineLow, buildBirchLow, buildReed, buildBush, buildRock } from './buildings.js';
import { hex } from './geometry.js';
import { injectAtmosphere } from './atmosphere.js';

export const windUniforms = {
  uTime: { value: 0 },
  uWind: { value: 0.6 },
};

/** Per-material draw distance (metres from the camera); instances beyond it collapse on the GPU. */
export function makeWindMaterial(extra = {}, cull = { value: 1e5 }) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0, ...extra });
  return windify(m, cull);
}

/** Add wind sway + GPU draw-distance cull + atmosphere to ANY standard material (keeps its maps). */
export function windify(m, cull = { value: 1e5 }) {
  if (m.userData.windified) return m;
  m.userData.windified = true;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniforms.uTime;
    shader.uniforms.uWind = windUniforms.uWind;
    shader.uniforms.uCull = cull;
    injectAtmosphere(shader);
    shader.vertexShader = 'uniform float uTime;\nuniform float uWind;\nuniform float uCull;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
#ifdef USE_INSTANCING
  vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
#else
  vec3 ip = vec3(0.0);
#endif
  float hgt = max(position.y, 0.0);
  float sway = uWind * hgt * hgt * 0.011;
  transformed.x += (sin(uTime * 1.7 + ip.x * 0.31 + ip.z * 0.17) + 0.35 * sin(uTime * 3.3 + ip.z * 0.5)) * sway;
  transformed.z += cos(uTime * 1.3 + ip.z * 0.27 + ip.x * 0.11) * sway * 0.7;
  if (distance(ip, cameraPosition) > uCull) transformed = vec3(0.0);`);
  };
  m.customProgramCacheKey = () => 'terra-wind-v2';
  m.needsUpdate = true;
  return m;
}

function grassGeometry(flower = false) {
  const pos = [], col = [], nor = [];
  const rng = mulberry32(flower ? 91 : 17);
  const base = new THREE.Color(), tip = new THREE.Color();
  const blades = flower ? 5 : 7;
  for (let k = 0; k < blades; k++) {
    const a = rng() * Math.PI * 2, r = 0.04 + rng() * 0.18;
    const x0 = Math.cos(a) * r, z0 = Math.sin(a) * r;
    const h = (flower ? 0.55 : 0.4) + rng() * 0.5;
    const lean = 0.12 + rng() * 0.22;
    const lx = Math.cos(a) * lean, lz = Math.sin(a) * lean;
    const w = 0.045 + rng() * 0.03;
    const px = -Math.sin(a) * w, pz = Math.cos(a) * w;
    base.setHex(0x2f5a1c, THREE.SRGBColorSpace);
    tip.setHex(rng() > 0.5 ? 0x86b54a : 0xa6c45a, THREE.SRGBColorSpace);
    pos.push(x0 - px, 0, z0 - pz, x0 + px, 0, z0 + pz, x0 + lx, h, z0 + lz);
    col.push(base.r, base.g, base.b, base.r, base.g, base.b, tip.r, tip.g, tip.b);
    for (let q = 0; q < 3; q++) nor.push(0, 1, 0);
    // back face so blades are visible from both sides
    pos.push(x0 + px, 0, z0 + pz, x0 - px, 0, z0 - pz, x0 + lx, h, z0 + lz);
    col.push(base.r, base.g, base.b, base.r, base.g, base.b, tip.r, tip.g, tip.b);
    for (let q = 0; q < 3; q++) nor.push(0, 1, 0);
  }
  if (flower) {
    const white = [1, 1, 1];
    for (let k = 0; k < 3; k++) {
      const a = rng() * Math.PI * 2, r = 0.08 + rng() * 0.14, h = 0.7 + rng() * 0.35;
      const x = Math.cos(a) * r, z = Math.sin(a) * r, s = 0.09;
      pos.push(x - s, h, z, x + s, h, z, x, h + s * 1.6, z);
      pos.push(x + s, h, z, x - s, h, z, x, h + s * 1.6, z);
      for (let q = 0; q < 6; q++) { col.push(...white); nor.push(0, 1, 0); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

export class Vegetation {
  constructor(scene, field) {
    this.scene = scene;
    this.field = field;
    this.group = new THREE.Group();
    this.group.name = 'vegetation';
    scene.add(this.group);

    this.cullTree = { value: 1e5 };
    this.cullGrass = { value: 1e5 };
    this.windMat = makeWindMaterial({}, this.cullTree);
    this.solidMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
    this.grassMat = makeWindMaterial({ side: THREE.DoubleSide, roughness: 1 }, this.cullGrass);

    this.sets = {
      oak: new InstanceSet(buildOak(), this.windMat, 900, { name: 'env-oak' }),
      pine: new InstanceSet(buildPine(), this.windMat, 900, { name: 'env-pine' }),
      birch: new InstanceSet(buildBirch(), this.windMat, 600, { name: 'env-birch' }),
      oakL: new InstanceSet(buildOakLow(), this.windMat, 900, { castShadow: false, name: 'env-oak-lod' }),
      pineL: new InstanceSet(buildPineLow(), this.windMat, 900, { castShadow: false, name: 'env-pine-lod' }),
      birchL: new InstanceSet(buildBirchLow(), this.windMat, 600, { castShadow: false, name: 'env-birch-lod' }),
      reed: new InstanceSet(buildReed(), this.grassMat, 500, { castShadow: false, name: 'env-reed' }),
      bush: new InstanceSet(buildBush(), this.windMat, 500, { name: 'env-bush' }),
      rock: new InstanceSet(buildRock(), this.solidMat, 400, { name: 'env-rock' }),
      fern: new InstanceSet(grassGeometry(false), this.grassMat, 700, { castShadow: false, name: 'env-fern' }),
      tussock: new InstanceSet(grassGeometry(false), this.grassMat, 700, { castShadow: false, name: 'env-tussock' }),
      grass: new InstanceSet(grassGeometry(false), this.grassMat, 6000, { castShadow: false, name: 'env-grass' }),
      flower: new InstanceSet(grassGeometry(true), this.grassMat, 1200, { castShadow: false, name: 'env-flower' }),
    };
    for (const s of Object.values(this.sets)) this.group.add(s.mesh);
    this.items = [];     // {set,id,x,z}
    this._id = 1;
    this._lodCursor = 0;
    this.lodDist = 110;
    this.lodSwaps = 0;
    this.variants = {};   // species -> { names:[set names], cum:[cumulative weights] } (growth stages / model variants)
  }

  /** logical species of a set name: 'oak#mature' -> 'oak', 'oakL' -> 'oak' */
  static speciesOf(name) { const b = name.split('#')[0]; return b === 'oakL' || b === 'pineL' || b === 'birchL' ? b.slice(0, -1) : b; }

  /** stable weighted pick of a variant set for an instance id (independent of the LOD/density rank) */
  _route(key, id) {
    const v = this.variants[key];
    if (!v) return key;
    const x = Math.sin(id * 39.3468 + 11.135) * 43758.5453; const r = (x - Math.floor(x)) * v.cum[v.cum.length - 1];
    for (let i = 0; i < v.cum.length; i++) if (r < v.cum[i]) return v.names[i];
    return v.names[v.names.length - 1];
  }

  setShadows(on) {
    for (const [k, s] of Object.entries(this.sets)) if (['oak', 'pine', 'birch', 'bush', 'rock'].includes(Vegetation.speciesOf(k)) && !/L$/.test(k)) s.mesh.castShadow = on;
  }

  /** Preset-driven multiplier for every LOD switch distance of the external models. */
  setLodScale(f) {
    this.lodScale = f;
    for (const st of Object.values(this.sets)) if (st.updateLod) { st.lodScale = f; st._all = true; }
  }

  /** Diagnostics: switch instance distance/frustum culling on or off. */
  setCulling(on) { for (const st of Object.values(this.sets)) if (st.updateLod) { st.noCull = !on; st._all = true; } }

  /** Cull / LOD statistics for diagnostics: per set, instances per level and culled counts. */
  stats() {
    const out = {};
    for (const [k, st] of Object.entries(this.sets)) if (st.levelCounts) out[k] = { total: st.count, levels: st.levelCounts(), ...st.stats };
    return out;
  }

  setDensity(f) {
    for (const [k, s] of Object.entries(this.sets)) s.setFraction(['grass', 'flower', 'reed', 'fern', 'tussock'].includes(Vegetation.speciesOf(k)) ? f * 0.85 : f);
  }

  /**
   * Distance LOD for trees: swap between the full model and a few-triangle
   * model. A quarter of the trees is examined per call (round-robin), with
   * hysteresis so trees never flicker at the boundary.
   */
  updateLod(camPos, frustum = null) {
    for (const st of Object.values(this.sets)) if (st.updateLod) st.updateLod(camPos, frustum);
    const items = this.items;
    const n = items.length; if (!n) return;
    const per = Math.ceil(n / 4);
    const near = this.lodDist * 0.9, far = this.lodDist * 1.1;
    for (let k = 0; k < per; k++) {
      const it = items[this._lodCursor++ % n];
      if (!it.m) continue;
      const dx = it.x - camPos.x, dz = it.z - camPos.z;
      const d = Math.hypot(dx, dz, camPos.y * 0.6);
      const low = it.set !== it.key;
      let want = low;
      if (!low && d > far) want = true; else if (low && d < near) want = false;
      if (want === low) continue;
      const from = it.set, to = want ? it.key + 'L' : it.key;
      const src = this.sets[from], dst = this.sets[to];
      if (dst.add(it.id, it.m, it.tint) < 0) continue;
      src.remove(it.id);
      it.set = to;
      this.lodSwaps++;
    }
  }

  /** Species that can be replaced by external models, and which cull distance they use. */
  static get SPECIES() {
    return { oak: 'tree', pine: 'tree', birch: 'tree', bush: 'tree', rock: null, reed: 'grass', grass: 'grass', flower: 'grass', fern: 'grass', tussock: 'grass' };
  }

  /** Every InstancedMesh of the given species (variants and LOD levels included). */
  meshesOf(...species) {
    const out = [];
    for (const [k, s] of Object.entries(this.sets)) if (species.includes(Vegetation.speciesOf(k))) out.push(...(s.meshes ?? [s.mesh]));
    return out;
  }

  cullFor(key) { const k = Vegetation.SPECIES[key]; return k === 'tree' ? this.cullTree : k === 'grass' ? this.cullGrass : null; }

  /**
   * Replace one species with external models.
   * variants: [{ name, weight, levels:[{geometry, material, distance}] }]
   *  - variants are different MODELS of the species (e.g. young / mature / old),
   *    picked per instance by weight; they are never LOD levels.
   *  - levels are the LOD levels of ONE variant (High/Medium/Low).
   * Every existing instance keeps its transform and tint.
   */
  replaceSpecies(key, variants) {
    if (!(key in Vegetation.SPECIES)) throw new Error('unknown vegetation species: ' + key);
    const prevNames = (this.variants[key]?.names) ?? [key];
    const oldSets = [...new Set([...prevNames, key, key + 'L'])].filter((n) => this.sets[n]);
    const capacity = this.sets[oldSets[0]].capacity;
    const castShadow = this.sets[oldSets[0]].mesh.castShadow;
    const frac = this.sets[oldSets[0]].fraction ?? 1;
    // 1. read every instance of the species out of its current set
    const saved = [];
    const m = new THREE.Matrix4(), c = new THREE.Color();
    for (const it of this.items) {
      if (it.key !== key) continue;
      const src = this.sets[it.set];
      if (!src || !src.getMatrix(it.id, m)) continue;
      src.getColor(it.id, c);
      saved.push({ it, m: m.clone(), c: c.clone() });
    }
    // 2. build the new sets
    const single = variants.length === 1;
    const names = variants.map((v) => (single ? key : `${key}#${v.name}`));
    const fresh = variants.map((v, i) => {
      const st = new LodInstanceSet(v.levels, capacity, { castShadow, name: 'env-' + names[i], cull: this.cullFor(key) ?? this.cullTree });
      st.lodScale = this.lodScale ?? 1;
      st.setFraction(frac);
      return st;
    });
    let acc = 0;
    const cum = variants.map((v) => (acc += v.weight));
    // 3. retire the old sets
    for (const n of oldSets) {
      const st = this.sets[n];
      for (const mesh of st.meshes ?? [st.mesh]) this.group.remove(mesh);
      st.dispose?.(); st.mesh.dispose();
      delete this.sets[n];
    }
    names.forEach((n, i) => { this.sets[n] = fresh[i]; for (const mesh of fresh[i].meshes) this.group.add(mesh); });
    this.variants[key] = single ? null : { names, cum };
    if (single) delete this.variants[key];
    // 4. put every instance back, routed to its variant
    for (const { it, m: mm, c: cc } of saved) {
      const to = single ? names[0] : this._route(key, it.id);
      this.sets[to].add(it.id, mm, cc);
      it.set = to; it.m = null; it.tint = null;
    }
    return fresh;
  }

  clear() {
    for (const s of Object.values(this.sets)) s.clear();
    this.items.length = 0;
  }

  generate(seed, waterDepthAtNode) {
    this.clear();
    const f = this.field;
    const rng = mulberry32(seed * 31 + 5);
    const noise = new Noise2D(seed + 999);
    const dummy = new THREE.Object3D();
    const col = new THREE.Color();

    const wet = (x, z, margin = 4) => {
      for (const [dx, dz] of [[0, 0], [margin, 0], [-margin, 0], [0, margin], [0, -margin]]) {
        if (waterDepthAtNode(x + dx, z + dz) > 0) return true;
      }
      return false;
    };

    const put = (key, x, y, z, sc, tint, rotY = rng() * Math.PI * 2, tiltY = 0, lean = 0) => {
      dummy.position.set(x, y - 0.05, z);
      dummy.rotation.set(lean ? (rng() - 0.5) * 2 * lean : 0, rotY, lean ? (rng() - 0.5) * 2 * lean : 0);
      dummy.scale.set(sc, sc * (1 + tiltY), sc);
      dummy.updateMatrix();
      const id = this._id++;
      const sk = this._route(key, id);
      this.sets[sk].add(id, dummy.matrix, tint);
      const lodable = (key === 'oak' || key === 'pine' || key === 'birch') && !(this.sets[sk] instanceof LodInstanceSet);
      this.items.push({ key, set: sk, id, x, z, m: lodable ? dummy.matrix.clone() : null, tint: lodable ? tint : null });
    };

    // trees
    let trees = 0;
    for (let a = 0; a < 14000 && trees < 880; a++) {
      const x = (rng() * 2 - 1) * (HALF - 6), z = (rng() * 2 - 1) * (HALF - 6);
      const h = f.heightAt(x, z), sl = f.slopeAt(x, z);
      if (h > 46 || sl > 0.95 || wet(x, z, 5)) continue;
      const forest = noise.fbm(x * 0.011, z * 0.011, 3) * 0.9 + noise.fbm(x * 0.045, z * 0.045, 2) * 0.35;
      let dens = smoothstep(-0.12, 0.3, forest) * smoothstep(46, 34, h) * smoothstep(0.95, 0.45, sl);
      if (rng() > dens * 0.75 + 0.012) continue;
      const pinePref = smoothstep(9, 26, h) * 0.85 + 0.08;
      const key = rng() < pinePref ? 'pine' : (rng() < 0.3 && h < 24 ? 'birch' : 'oak');
      const s = 0.65 + rng() * 0.8;
      // per-instance HSL tint: hue / saturation / lightness all wander, so a stand
      // of the same species still reads as many individuals, not copies
      col.setHSL(0.24 + rng() * 0.12, 0.3 + rng() * 0.3, 0.78 + rng() * 0.22);
      put(key, x, h, z, s, col.clone(), rng() * Math.PI * 2, (rng() - 0.5) * 0.16, 0.045);
      trees++;
    }

    // reeds along the shoreline
    let reeds = 0;
    for (let a = 0; a < 20000 && reeds < 360; a++) {
      const x = (rng() * 2 - 1) * (HALF - 5), z = (rng() * 2 - 1) * (HALF - 5);
      if (waterDepthAtNode(x, z) > 0 || !wet(x, z, 3)) continue;
      const t = 0.85 + rng() * 0.3;
      col.setRGB(t, t, t * 0.9);
      put('reed', x, f.heightAt(x, z), z, 0.8 + rng() * 0.7, col.clone(), rng() * 6.28, 0, 0.09);
      reeds++;
    }

    // bushes
    let bushes = 0;
    for (let a = 0; a < 6000 && bushes < 380; a++) {
      const x = (rng() * 2 - 1) * (HALF - 5), z = (rng() * 2 - 1) * (HALF - 5);
      const h = f.heightAt(x, z), sl = f.slopeAt(x, z);
      if (h > 34 || sl > 0.8 || wet(x, z, 3)) continue;
      const d = noise.fbm(x * 0.02 + 70, z * 0.02 + 70, 2);
      if (rng() > smoothstep(-0.1, 0.5, d) * 0.5 + 0.02) continue;
      const t = 0.85 + rng() * 0.3;
      col.setRGB(t, t * (0.95 + rng() * 0.1), t * 0.95);
      put('bush', x, h, z, 0.7 + rng() * 0.7, col.clone(), rng() * 6.28, 0, 0.06);
      bushes++;
    }

    // rocks
    let rocks = 0;
    for (let a = 0; a < 9000 && rocks < 330; a++) {
      const x = (rng() * 2 - 1) * (HALF - 5), z = (rng() * 2 - 1) * (HALF - 5);
      const h = f.heightAt(x, z), sl = f.slopeAt(x, z);
      if (wet(x, z, 2)) continue;
      const p = smoothstep(0.35, 0.9, sl) * 0.8 + smoothstep(22, 45, h) * 0.5 + 0.015;
      if (rng() > p) continue;
      const t = 0.8 + rng() * 0.4;
      col.setRGB(t, t, t);
      put('rock', x, h, z, 0.5 + rng() * rng() * 2.4, col.clone(), rng() * 6.28, rng() * 0.3);
      rocks++;
    }

    // ferns: forest understory (moist, shaded, near trees)
    let ferns = 0;
    for (let a = 0; a < 20000 && ferns < 260; a++) {
      const x = (rng() * 2 - 1) * (HALF - 5), z = (rng() * 2 - 1) * (HALF - 5);
      const h = f.heightAt(x, z), sl = f.slopeAt(x, z);
      if (h > 40 || sl > 0.75 || wet(x, z, 2)) continue;
      const forest = noise.fbm(x * 0.011, z * 0.011, 3) * 0.9 + noise.fbm(x * 0.045, z * 0.045, 2) * 0.35;
      if (rng() > smoothstep(0.0, 0.35, forest) * 0.8) continue;
      const t = 0.85 + rng() * 0.3;
      col.setRGB(t * 0.95, t, t * 0.9);
      put('fern', x, h, z, 0.75 + rng() * 0.6, col.clone(), rng() * 6.28, 0, 0.07);
      ferns++;
    }
    // tussocks: open meadow
    let tussocks = 0;
    for (let a = 0; a < 20000 && tussocks < 420; a++) {
      const x = (rng() * 2 - 1) * (HALF - 5), z = (rng() * 2 - 1) * (HALF - 5);
      const h = f.heightAt(x, z), sl = f.slopeAt(x, z);
      if (h > 36 || sl > 0.6 || wet(x, z, 2)) continue;
      const d = noise.fbm(x * 0.03 - 40, z * 0.03 - 40, 3) * 0.5 + 0.5;
      const forest = noise.fbm(x * 0.011, z * 0.011, 3) * 0.9;
      if (rng() > smoothstep(0.3, 0.7, d) * (1 - smoothstep(0.1, 0.5, forest)) * 0.8 + 0.01) continue;
      const t = 0.85 + rng() * 0.3;
      col.setRGB(t, t * (0.97 + rng() * 0.06), t * 0.92);
      put('tussock', x, h, z, 0.8 + rng() * 0.6, col.clone(), rng() * 6.28, 0, 0.07);
      tussocks++;
    }

    // grass tufts + flowers
    let grass = 0, flowers = 0;
    for (let a = 0; a < 26000 && grass < 5600; a++) {
      const x = (rng() * 2 - 1) * (HALF - 3), z = (rng() * 2 - 1) * (HALF - 3);
      const h = f.heightAt(x, z), sl = f.slopeAt(x, z);
      if (h > 38 || sl > 0.7 || wet(x, z, 2)) continue;
      const d = noise.fbm(x * 0.03 - 40, z * 0.03 - 40, 3) * 0.5 + 0.5;
      if (rng() > smoothstep(0.25, 0.65, d) * 0.95 + 0.05) continue;
      const t = 0.8 + rng() * 0.4;
      col.setRGB(t, t * (0.95 + rng() * 0.1), t * 0.9);
      put('grass', x, h, z, 0.8 + rng() * 0.9, col.clone());
      grass++;
      if (flowers < 1100 && rng() < 0.2) {
        const pick = rng();
        if (pick < 0.4) col.setHex(0xfff3a8, THREE.SRGBColorSpace);
        else if (pick < 0.7) col.setHex(0xffffff, THREE.SRGBColorSpace);
        else if (pick < 0.88) col.setHex(0xe9a0d8, THREE.SRGBColorSpace);
        else col.setHex(0xa79bf2, THREE.SRGBColorSpace);
        put('flower', x + (rng() - 0.5) * 2, f.heightAt(x, z), z + (rng() - 0.5) * 2, 0.8 + rng() * 0.5, col.clone());
        flowers++;
      }
    }
    return { trees, bushes, rocks, grass, flowers, reeds, ferns, tussocks };
  }

  /** Remove environment items inside a world-space rectangle. */
  clearArea(x0, z0, x1, z1) {
    const keep = [];
    for (const it of this.items) {
      if (it.x >= x0 && it.x <= x1 && it.z >= z0 && it.z <= z1) this.sets[it.set].remove(it.id);
      else keep.push(it);
    }
    this.items = keep;
  }

  counts() {
    const o = {};
    for (const [k, s] of Object.entries(this.sets)) o[k] = s.count;
    return o;
  }
}
