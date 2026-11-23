// Environmental detail: trees, bushes, rocks, grass and flowers.
// Everything is instanced (one draw call per kind) and trees/grass sway in the
// wind through a small vertex-shader injection.
import * as THREE from '../vendor/three.module.min.js';
import { HALF, CELL } from './config.js';
import { Noise2D, mulberry32, smoothstep, clamp } from './utils.js';
import { InstanceSet } from './instances.js';
import { buildOak, buildPine, buildBush, buildRock } from './buildings.js';
import { hex } from './geometry.js';

export const windUniforms = {
  uTime: { value: 0 },
  uWind: { value: 0.6 },
};

export function makeWindMaterial(extra = {}) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0, ...extra });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniforms.uTime;
    shader.uniforms.uWind = windUniforms.uWind;
    shader.vertexShader = 'uniform float uTime;\nuniform float uWind;\n' + shader.vertexShader.replace(
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
  transformed.z += cos(uTime * 1.3 + ip.z * 0.27 + ip.x * 0.11) * sway * 0.7;`);
  };
  m.customProgramCacheKey = () => 'terra-wind-v1';
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

    this.windMat = makeWindMaterial();
    this.solidMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
    this.grassMat = makeWindMaterial({ side: THREE.DoubleSide, roughness: 1 });

    this.sets = {
      oak: new InstanceSet(buildOak(), this.windMat, 900, { name: 'env-oak' }),
      pine: new InstanceSet(buildPine(), this.windMat, 900, { name: 'env-pine' }),
      bush: new InstanceSet(buildBush(), this.windMat, 500, { name: 'env-bush' }),
      rock: new InstanceSet(buildRock(), this.solidMat, 400, { name: 'env-rock' }),
      grass: new InstanceSet(grassGeometry(false), this.grassMat, 6000, { castShadow: false, name: 'env-grass' }),
      flower: new InstanceSet(grassGeometry(true), this.grassMat, 1200, { castShadow: false, name: 'env-flower' }),
    };
    for (const s of Object.values(this.sets)) this.group.add(s.mesh);
    this.items = [];     // {set,id,x,z}
    this._id = 1;
  }

  setShadows(on) {
    for (const k of ['oak', 'pine', 'bush', 'rock']) this.sets[k].mesh.castShadow = on;
  }

  setDensity(f) {
    for (const [k, s] of Object.entries(this.sets)) s.setFraction(k === 'grass' || k === 'flower' ? f * 0.85 : f);
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

    const put = (key, x, y, z, sc, tint, rotY = rng() * Math.PI * 2, tiltY = 0) => {
      dummy.position.set(x, y - 0.05, z);
      dummy.rotation.set(0, rotY, 0);
      dummy.scale.set(sc, sc * (1 + tiltY), sc);
      dummy.updateMatrix();
      const id = this._id++;
      this.sets[key].add(id, dummy.matrix, tint);
      this.items.push({ key, id, x, z });
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
      const key = rng() < pinePref ? 'pine' : 'oak';
      const s = 0.8 + rng() * 0.55;
      const t = 0.88 + rng() * 0.24;
      col.setRGB(t * (0.94 + rng() * 0.12), t, t * (0.9 + rng() * 0.15));
      put(key, x, h, z, s, col.clone());
      trees++;
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
      put('bush', x, h, z, 0.7 + rng() * 0.7, col.clone());
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
    return { trees, bushes, rocks, grass, flowers };
  }

  /** Remove environment items inside a world-space rectangle. */
  clearArea(x0, z0, x1, z1) {
    const keep = [];
    for (const it of this.items) {
      if (it.x >= x0 && it.x <= x1 && it.z >= z0 && it.z <= z1) this.sets[it.key].remove(it.id);
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
