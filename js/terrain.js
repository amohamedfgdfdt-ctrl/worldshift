// Procedural terrain: heightfield generation (pure data, testable in Node) and
// the renderable terrain mesh with a custom shader layer (detail, wet ground,
// buildable-grid overlay).

import * as THREE from '../vendor/three.module.min.js';
import { injectAtmosphere } from './atmosphere.js';
import { CELL, N, VERTS, SIZE, HALF, DEFAULT_SEED } from './config.js';
import { Noise2D, mulberry32, clamp, lerp, smoothstep } from './utils.js';

const srgb = (r, g, b) => {
  const f = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return [f(r), f(g), f(b)];
};
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

const PAL = {
  grass1: srgb(0.30, 0.46, 0.17),
  grass2: srgb(0.45, 0.52, 0.22),
  forest: srgb(0.19, 0.32, 0.13),
  sand: srgb(0.74, 0.68, 0.50),
  dirt: srgb(0.40, 0.32, 0.22),
  rock: srgb(0.47, 0.45, 0.43),
  rockDark: srgb(0.38, 0.36, 0.35),
  snow: srgb(0.93, 0.95, 0.98),
};

export class HeightField {
  constructor(seed = DEFAULT_SEED) {
    this.h = new Float32Array(VERTS * VERTS);
    this.initialWater = new Float32Array(VERTS * VERTS);
    this.sandMask = new Float32Array(VERTS * VERTS);
    this.generate(seed);
  }

  generate(seed) {
    this.seed = seed >>> 0;
    const rng = mulberry32(this.seed);
    const nA = new Noise2D(this.seed + 11);
    const nB = new Noise2D(this.seed * 3 + 101);
    const nC = new Noise2D(this.seed * 7 + 977);
    const nD = new Noise2D(this.seed * 13 + 37);   // river bank irregularity
    this.noiseColor = new Noise2D(this.seed + 4242);

    // ---- layout parameters (seeded variations of the same overall design)
    const lakeU = 0.5 + (rng() - 0.5) * 0.22;
    const lakeV = 0.57 + (rng() - 0.5) * 0.1;
    const lakeR = 0.078 + rng() * 0.016;
    const ph1 = rng() * 6.28, ph2 = rng() * 6.28, ph3 = rng() * 6.28;
    const amp = 0.09 + rng() * 0.05;

    const u0 = (v) => 0.5 + amp * Math.sin(v * 5.4 + ph1) + 0.04 * Math.sin(v * 12.7 + ph2) + 0.026 * Math.sin(v * 23.7 + ph3);
    const riverU = (v) => {
      const corr = (lakeU - u0(lakeV)) * Math.exp(-Math.pow((v - lakeV) / 0.2, 2));
      return clamp(u0(v) + corr, 0.22, 0.78);
    };

    // ---- base terrain T0(u,v)
    const base = (u, v) => {
      const e = Math.max(Math.abs(u - 0.5), Math.abs(v - 0.5)) * 2;
      const plains = 8.4 - 3.4 * v + nA.fbm(u * 2.6 + 7.3, v * 2.6 + 1.7, 4) * 2.2;
      const hillsAmt = smoothstep(0.1, 0.6, e) * 0.9 + 0.25;
      const hills = Math.max(0, nB.fbm(u * 3.2 + 31, v * 3.2 + 11, 5) + 0.12) * 15 * hillsAmt;
      let M = smoothstep(0.6, 1.0, e);
      M = Math.max(M, 0.95 * smoothstep(0.42, 0.04, v));
      const ru = riverU(v);
      const exitM = smoothstep(0.72, 0.97, v) * Math.exp(-Math.pow((u - ru) / 0.17, 2));
      M = clamp(M * (1 - exitM), 0, 1);
      const ridge = nC.ridged(u * 3.4 + 5, v * 3.4 + 9, 5);
      const mount = M * (16 + 48 * ridge);
      return plains + hills * (1 - M * 0.6) + mount;
    };

    const h = this.h;
    const T0 = new Float32Array(VERTS * VERTS);
    for (let j = 0; j < VERTS; j++) {
      const v = j / N;
      for (let i = 0; i < VERTS; i++) T0[j * VERTS + i] = base(i / N, v);
    }

    // ---- river bed profile (monotonic descent from north to south)
    const S = 384;
    const avg = new Float32Array(S);
    for (let k = 0; k < S; k++) {
      const v = k / (S - 1), u = riverU(v);
      avg[k] = (base(u - 0.015, v) + base(u, v) + base(u + 0.015, v)) / 3;
    }
    const sm = new Float32Array(S);
    for (let k = 0; k < S; k++) {
      let s = 0, c = 0;
      for (let d = -22; d <= 22; d++) {
        const kk = clamp(k + d, 0, S - 1);
        s += avg[kk]; c++;
      }
      sm[k] = s / c;
    }
    const bed = new Float32Array(S);
    for (let k = 0; k < S; k++) {
      const raw = Math.max(0.9, sm[k] - 2.0);
      bed[k] = k === 0 ? raw : Math.min(raw, bed[k - 1] - 0.004);
      bed[k] = Math.max(0.5, bed[k]);
    }
    // rapids reach: a short, steeper stepped descent where the river leaves the
    // mountains through the southern gorge, so whitewater forms where the terrain supports it
    const kR = Math.round(0.8 * (S - 1));
    for (let k = kR; k < Math.min(S, kR + 20); k++) bed[k] = Math.max(0.4, Math.min(bed[k], bed[kR - 1] - 0.085 * (k - kR + 1)));
    for (let k = kR + 20; k < S; k++) bed[k] = Math.max(0.5, Math.min(bed[k], bed[k - 1] - 0.004));
    const bedAt = (v) => {
      const f = clamp(v, 0, 1) * (S - 1);
      const k = Math.min(S - 2, Math.floor(f));
      return lerp(bed[k], bed[k + 1], f - k);
    };
    // channel width wanders along the course, like a real stream
    const halfW = (v) => (8.5 + 3.5 * v) * (0.86 + 0.30 * nD.noise(v * 5.3 + 2.1, 7.7));

    // ---- lake + river carving
    const lakeFloor = 0.9;
    const lakeShape = (u, v) => {
      const dx = (u - lakeU) * 1.12, dz = (v - lakeV);
      const ang = Math.atan2(dz, dx);
      const wob = 1 + 0.16 * nA.noise(Math.cos(ang) * 1.3 + 3, Math.sin(ang) * 1.3 + 7);
      return Math.hypot(dx, dz) / (lakeR * wob);
    };
    for (let j = 0; j < VERTS; j++) {
      const v = j / N;
      const ru = riverU(v), bd = bedAt(v), hw = halfW(v);
      for (let i = 0; i < VERTS; i++) {
        const u = i / N;
        let t = T0[j * VERTS + i];
        const d = lakeShape(u, v);
        if (d < 1.9) {
          const target = lakeFloor + 4.8 * d * d;
          if (target < t) t = target;
        }
        const lat = Math.abs(u - ru) * SIZE;
        // noisy bank line: irregular edges and varied bank steepness instead of a machined channel
        const latN = lat / hw + nD.noise(u * 6.3 + 13, v * 6.3 + 5) * 0.42 + nD.noise(u * 15.1 + 3, v * 15.1 + 21) * 0.16;
        if (latN < 4) {
          const steep = 3.3 + 1.9 * (nD.noise(u * 2.9 + 8, v * 2.9 + 16) * 0.5 + 0.5);
          const target = bd + steep * Math.pow(Math.max(latN, 0), 2.2);
          if (target < t) t = target;
        }
        h[j * VERTS + i] = Math.max(0.2, t);
      }
    }

    // ---- lake water level: below the lowest rim sample, near the river outlet
    let rimMin = 1e9;
    for (let a = 0; a < 64; a++) {
      const ang = (a / 64) * Math.PI * 2;
      // find the rim as the first point where the bowl meets the plains
      for (let r = 0.8; r < 2.2; r += 0.04) {
        const u = lakeU + Math.cos(ang) * lakeR * r / 1.12;
        const v = lakeV + Math.sin(ang) * lakeR * r;
        if (u < 0.05 || u > 0.95 || v < 0.05 || v > 0.95) break;
        if (lakeShape(u, v) >= 1.0) {
          rimMin = Math.min(rimMin, this.sampleRaw(u, v));
          break;
        }
      }
    }
    const outletBed = bedAt(lakeV + lakeR);
    const lakeLevel = Math.min(outletBed + 0.35, rimMin - 0.15);

    // ---- initial water
    const w = this.initialWater;
    w.fill(0);
    for (let j = 0; j < VERTS; j++) {
      const v = j / N;
      const ru = riverU(v), bd = bedAt(v), hw = halfW(v);
      for (let i = 0; i < VERTS; i++) {
        const u = i / N, idx = j * VERTS + i;
        const th = h[idx];
        let depth = 0;
        const d = lakeShape(u, v);
        if (d < 1.4) depth = Math.max(depth, lakeLevel - th);
        const lat = Math.abs(u - ru) * SIZE;
        const latN = lat / hw + nD.noise(u * 6.3 + 13, v * 6.3 + 5) * 0.42 + nD.noise(u * 15.1 + 3, v * 15.1 + 21) * 0.16;
        if (latN < 1.3) depth = Math.max(depth, bd + 0.75 - th);
        w[idx] = depth > 0.02 ? depth : 0;
      }
    }

    // ---- sand mask (dilated initial water) for colouring
    const sm0 = this.sandMask;
    for (let k = 0; k < sm0.length; k++) sm0[k] = w[k] > 0 ? 1 : 0;
    for (let pass = 0; pass < 2; pass++) {
      const tmp = new Float32Array(sm0);
      for (let j = 1; j < VERTS - 1; j++) for (let i = 1; i < VERTS - 1; i++) {
        const k = j * VERTS + i;
        sm0[k] = Math.max(tmp[k], 0.65 * Math.max(tmp[k - 1], tmp[k + 1], tmp[k - VERTS], tmp[k + VERTS]));
      }
    }

    this.lake = { u: lakeU, v: lakeV, r: lakeR, level: lakeLevel };
    this.river = { riverU, bedAt, halfW, S };
    const srcV = 0.04;
    this.riverSource = {
      i: Math.round(riverU(srcV) * N),
      j: Math.round(srcV * N),
    };
    this.computeNormals();
  }

  // bilinear on raw (u,v) in 0..1 — used only while generating
  sampleRaw(u, v) {
    return this.heightAt(u * SIZE - HALF, v * SIZE - HALF);
  }

  computeNormals() {
    // slope magnitude (rise / run) per node
    const h = this.h;
    if (!this.slope) this.slope = new Float32Array(VERTS * VERTS);
    for (let j = 0; j < VERTS; j++) {
      for (let i = 0; i < VERTS; i++) {
        const i0 = Math.max(0, i - 1), i1 = Math.min(N, i + 1);
        const j0 = Math.max(0, j - 1), j1 = Math.min(N, j + 1);
        const dx = (h[j * VERTS + i1] - h[j * VERTS + i0]) / ((i1 - i0) * CELL);
        const dz = (h[j1 * VERTS + i] - h[j0 * VERTS + i]) / ((j1 - j0) * CELL);
        this.slope[j * VERTS + i] = Math.hypot(dx, dz);
      }
    }
  }

  /** Height with the same triangulation as the render mesh. */
  heightAt(x, z) {
    let gx = (x + HALF) / CELL, gz = (z + HALF) / CELL;
    gx = clamp(gx, 0, N - 1e-6); gz = clamp(gz, 0, N - 1e-6);
    const i = Math.floor(gx), j = Math.floor(gz);
    const fx = gx - i, fz = gz - j;
    const h = this.h, k = j * VERTS + i;
    const a = h[k], b = h[k + 1], c = h[k + VERTS], d = h[k + VERTS + 1];
    return fx >= fz ? a + fx * (b - a) + fz * (d - b) : a + fx * (d - c) + fz * (c - a);
  }

  slopeAt(x, z) {
    const e = CELL * 0.5;
    const dx = (this.heightAt(x + e, z) - this.heightAt(x - e, z)) / (2 * e);
    const dz = (this.heightAt(x, z + e) - this.heightAt(x, z - e)) / (2 * e);
    return Math.hypot(dx, dz);
  }

  /** Ray / heightfield intersection. Returns [x,y,z] or null. */
  raycast(ox, oy, oz, dx, dy, dz, maxT = 3000) {
    // clip to world AABB
    let t0 = 0, t1 = maxT;
    const slab = (o, d, lo, hi) => {
      if (Math.abs(d) < 1e-9) return o >= lo && o <= hi;
      let a = (lo - o) / d, b = (hi - o) / d;
      if (a > b) { const t = a; a = b; b = t; }
      t0 = Math.max(t0, a); t1 = Math.min(t1, b);
      return t0 <= t1;
    };
    if (!slab(ox, dx, -HALF, HALF) || !slab(oz, dz, -HALF, HALF) || !slab(oy, dy, -12, 90)) return null;
    const step = 1.25;
    let tPrev = t0;
    let prevAbove = oy + dy * t0 > this.heightAt(ox + dx * t0, oz + dz * t0);
    if (!prevAbove) return [ox + dx * t0, oy + dy * t0, oz + dz * t0];
    for (let t = t0 + step; t <= t1 + step; t += step) {
      const tt = Math.min(t, t1);
      const x = ox + dx * tt, y = oy + dy * tt, z = oz + dz * tt;
      if (y <= this.heightAt(x, z)) {
        let lo = tPrev, hi = tt;
        for (let k = 0; k < 12; k++) {
          const m = (lo + hi) * 0.5;
          const above = oy + dy * m > this.heightAt(ox + dx * m, oz + dz * m);
          if (above) lo = m; else hi = m;
        }
        const m = (lo + hi) * 0.5;
        return [ox + dx * m, oy + dy * m, oz + dz * m];
      }
      tPrev = tt;
      if (tt >= t1) break;
    }
    return null;
  }
}

// ---------------------------------------------------------------------------

export class TerrainMesh {
  constructor(field, textures) {
    this.field = field;
    this.textures = textures;
    this.group = new THREE.Group();
    this.uniforms = {
      uDetail: { value: textures.detail },
      uRock: { value: textures.rock || null },
      uCellTex: { value: null },
      uWaterTex: { value: null },
      uGrid: { value: 0 },
      uCursor: { value: new THREE.Vector2(0, 0) },
      uCursorR: { value: 60 },
      uTime: { value: 0 },
      uDetailLvl: { value: 2 },
      uWaterQ: { value: 2 },
    };

    this.geometry = this._buildGeometry();
    this.material = this._buildMaterial();
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = true;
    this.mesh.name = 'terrain';
    this.group.add(this.mesh);

    this.skirt = this._buildSkirt();
    this.group.add(this.skirt);
    this.refresh();
  }

  get indexAttr() { return this.geometry.index; }

  _buildGeometry() {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(VERTS * VERTS * 3);
    const nor = new Float32Array(VERTS * VERTS * 3);
    const col = new Float32Array(VERTS * VERTS * 3);
    const uv = new Float32Array(VERTS * VERTS * 2);
    for (let j = 0; j < VERTS; j++) {
      for (let i = 0; i < VERTS; i++) {
        const k = j * VERTS + i;
        pos[k * 3] = i * CELL - HALF;
        pos[k * 3 + 2] = j * CELL - HALF;
        uv[k * 2] = pos[k * 3] / 16;
        uv[k * 2 + 1] = pos[k * 3 + 2] / 16;
      }
    }
    const idx = new Uint16Array(N * N * 6);
    let p = 0;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const a = j * VERTS + i, b = a + 1, c = a + VERTS, d = c + 1;
        idx[p++] = a; idx[p++] = c; idx[p++] = d;
        idx[p++] = a; idx[p++] = d; idx[p++] = b;
      }
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 20, 0), SIZE);
    g.boundingBox = new THREE.Box3(new THREE.Vector3(-HALF, -10, -HALF), new THREE.Vector3(HALF, 80, HALF));
    return g;
  }

  _buildMaterial() {
    const m = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.93,
      metalness: 0,
      normalMap: this.textures.normal,
      normalScale: new THREE.Vector2(0.65, 0.65),
    });
    const u = this.uniforms;
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, u);
      injectAtmosphere(shader);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWorldP;\nvarying float vSlope;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWorldP = position;\nvSlope = 1.0 - normalize(normal).y;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
varying vec3 vWorldP;
varying float vSlope;
uniform sampler2D uDetail; uniform sampler2D uRock; uniform sampler2D uCellTex; uniform sampler2D uWaterTex;
uniform float uDetailLvl; uniform float uWaterQ;
uniform float uGrid; uniform vec2 uCursor; uniform float uCursorR; uniform float uTime;
const float CELLW = ${CELL.toFixed(1)};
const float HALFW = ${HALF.toFixed(1)};
const float NC = ${N.toFixed(1)};`)
        .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec2 wp = vWorldP.xz;
  float d1 = texture2D(uDetail, wp * 0.083).r;
  float d2 = texture2D(uDetail, wp * 0.0171 + 0.37).r;
  float full = 0.62 + 0.62 * d1 * (0.6 + 0.8 * d2);
  float fine = texture2D(uDetail, wp * 0.37 + 0.11).r;
  float rich = full * (0.82 + 0.36 * fine);
  float basic = 0.85 + 0.15 * d2;
  diffuseColor.rgb *= uDetailLvl < 0.5 ? basic : (uDetailLvl < 1.5 ? full : rich);
  // Rock035 photo detail on steep slopes: real rock grain instead of flat grey
  {
    float rockW2 = smoothstep(0.40, 0.72, vSlope) * (uDetailLvl < 0.5 ? 0.55 : 1.0);
    if (rockW2 > 0.003) {
      float rt1 = texture2D(uRock, wp * 0.043).r;
      float rt2 = texture2D(uRock, wp * 0.0095 + 0.53).r;
      float rockM = 0.45 + 0.55 * rt1 * (0.6 + 0.55 * rt2);
      diffuseColor.rgb *= mix(1.0, rockM, rockW2 * 0.85);
    }
  }
  vec2 wtuv = (((wp + HALFW) / (CELLW * NC)) * NC + 0.5) / (NC + 1.0);
  float wd = texture2D(uWaterTex, wtuv).g * 6.0;
  float wet = smoothstep(0.0, 0.04, wd);
  diffuseColor.rgb *= mix(1.0, 0.66, wet);
  float sub = smoothstep(0.15, 1.8, wd);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.42, 0.62, 0.72), sub);
  if (uWaterQ > 2.5 && sub > 0.01) {
    vec2 cp = wp * 0.16;
    float c1 = texture2D(uDetail, cp + vec2(uTime * 0.021, uTime * 0.013)).r;
    float c2 = texture2D(uDetail, cp * 1.37 - vec2(uTime * 0.017, -uTime * 0.025)).r;
    float caus = pow(clamp(1.0 - abs(c1 - c2) * 3.2, 0.0, 1.0), 5.0);
    diffuseColor.rgb *= 1.0 + caus * 1.1 * sub * (1.0 - smoothstep(0.4, 2.6, wd));
  }
}`)
        .replace('#include <opaque_fragment>', `#include <opaque_fragment>
if (uGrid > 0.001) {
  vec2 gp = (vWorldP.xz + HALFW) / CELLW;
  vec2 cid = floor(gp);
  vec2 f = fract(gp);
  vec2 aa = max(fwidth(gp), vec2(0.0001));
  vec2 gl = smoothstep(vec2(0.0), aa * 1.4, min(f, 1.0 - f));
  float line = 1.0 - min(gl.x, gl.y);
  vec2 major = abs(fract(gp / 8.0 + 0.5) - 0.5) * 8.0;
  vec2 gm = smoothstep(vec2(0.0), aa * 1.6, major);
  float mline = 1.0 - min(gm.x, gm.y);
  vec4 ct = texture2D(uCellTex, (cid + 0.5) / NC);
  float dc = distance(vWorldP.xz, uCursor);
  float fade = (1.0 - smoothstep(uCursorR * 0.45, uCursorR, dc)) * uGrid;
  vec3 okC = vec3(0.35, 0.85, 0.55);
  vec3 noC = vec3(0.95, 0.35, 0.40);
  vec3 tint = mix(noC, okC, ct.r);
  float tintA = mix(0.07, 0.16, ct.r) * fade;
  vec3 lineC = vec3(0.62, 0.58, 1.0);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, tint, tintA);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, lineC, clamp(line * 0.42 + mline * 0.35, 0.0, 0.8) * fade);
}`);
    };
    m.customProgramCacheKey = () => 'terra-terrain-v1';
    return m;
  }

  _buildSkirt() {
    const rows = 7, bottom = -9;
    const verts = [], cols = [], nors = [], idx = [];
    // mountain-base rock tones (not near-black): wherever the skirt still peeks
    // past the boundary ring at grazing angles it reads as mountainside, not void
    const strata = [srgb(0.42, 0.38, 0.33), srgb(0.38, 0.34, 0.29), srgb(0.45, 0.40, 0.34), srgb(0.36, 0.32, 0.28),
      srgb(0.40, 0.36, 0.30), srgb(0.33, 0.30, 0.26), srgb(0.28, 0.26, 0.23)];
    this._skirtMeta = { rows, bottom, strata };
    const g = new THREE.BufferGeometry();
    const edges = [
      { n: [0, 0, -1], get: (t) => [t, 0] },
      { n: [0, 0, 1], get: (t) => [t, N] },
      { n: [-1, 0, 0], get: (t) => [0, t] },
      { n: [1, 0, 0], get: (t) => [N, t] },
    ];
    let base = 0;
    this._skirtEdges = edges;
    for (const e of edges) {
      for (let t = 0; t <= N; t++) {
        for (let r = 0; r < rows; r++) {
          verts.push(0, 0, 0); nors.push(...e.n); cols.push(0, 0, 0);
        }
      }
      for (let t = 0; t < N; t++) {
        for (let r = 0; r < rows - 1; r++) {
          const a = base + t * rows + r, b = base + (t + 1) * rows + r;
          const c = a + 1, d = b + 1;
          // flip winding for edges facing the other way
          if (e.n[2] < 0 || e.n[0] > 0) { idx.push(a, b, c, b, d, c); } else { idx.push(a, c, b, b, c, d); }
        }
      }
      base += (N + 1) * rows;
    }
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nors), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(cols), 3));
    g.setIndex(idx);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), SIZE);
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(g, mat);
    mesh.receiveShadow = true;
    return mesh;
  }

  /** Re-upload positions / normals / colours after the heightfield changed. */
  refresh() {
    const f = this.field, h = f.h;
    const pos = this.geometry.attributes.position.array;
    const nor = this.geometry.attributes.normal.array;
    const col = this.geometry.attributes.color.array;
    f.computeNormals();
    const nc = f.noiseColor;
    for (let j = 0; j < VERTS; j++) {
      for (let i = 0; i < VERTS; i++) {
        const k = j * VERTS + i;
        pos[k * 3 + 1] = h[k];
        const i0 = Math.max(0, i - 1), i1 = Math.min(N, i + 1);
        const j0 = Math.max(0, j - 1), j1 = Math.min(N, j + 1);
        const dx = (h[j * VERTS + i1] - h[j * VERTS + i0]) / ((i1 - i0) * CELL);
        const dz = (h[j1 * VERTS + i] - h[j0 * VERTS + i]) / ((j1 - j0) * CELL);
        const l = Math.hypot(dx, 1, dz);
        nor[k * 3] = -dx / l; nor[k * 3 + 1] = 1 / l; nor[k * 3 + 2] = -dz / l;

        // ---- colour
        const x = i * CELL - HALF, z = j * CELL - HALF, ht = h[k], g = f.slope[k];
        const n1 = nc.fbm(x * 0.018, z * 0.018, 3);
        const n2 = nc.noise(x * 0.17, z * 0.17);
        const n3 = nc.fbm(x * 0.03 + 50, z * 0.03 + 50, 2);
        let c = mix3(PAL.grass1, PAL.grass2, smoothstep(-0.25, 0.5, n1));
        c = mix3(c, PAL.forest, smoothstep(0.05, 0.55, n3) * smoothstep(34, 22, ht) * 0.85);
        c = mix3(c, PAL.dirt, smoothstep(0.3, 0.7, g) * 0.8);
        c = mix3(c, PAL.sand, f.sandMask[k] * smoothstep(8.5, 3.0, ht));
        const rockW = Math.max(smoothstep(0.55, 0.95, g), smoothstep(26, 40, ht + n1 * 6));
        c = mix3(c, mix3(PAL.rock, PAL.rockDark, n2 * 0.5 + 0.5), rockW);
        const snowW = smoothstep(46, 53, ht + n1 * 6) * (1 - smoothstep(0.9, 1.5, g) * 0.55);
        c = mix3(c, PAL.snow, snowW);
        const v = 0.93 + 0.14 * n2;
        col[k * 3] = c[0] * v; col[k * 3 + 1] = c[1] * v; col[k * 3 + 2] = c[2] * v;
      }
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.normal.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;

    // skirt
    const { rows, bottom, strata } = this._skirtMeta;
    const sp = this.skirt.geometry.attributes.position.array;
    const sc = this.skirt.geometry.attributes.color.array;
    let o = 0;
    for (const e of this._skirtEdges) {
      for (let t = 0; t <= N; t++) {
        const [i, j] = e.get(t);
        const top = h[j * VERTS + i];
        const x = i * CELL - HALF, z = j * CELL - HALF;
        for (let r = 0; r < rows; r++) {
          const fr = r / (rows - 1);
          const y = lerp(top, bottom, fr);
          sp[o * 3] = x; sp[o * 3 + 1] = y; sp[o * 3 + 2] = z;
          const s = strata[Math.min(strata.length - 1, r)];
          sc[o * 3] = s[0]; sc[o * 3 + 1] = s[1]; sc[o * 3 + 2] = s[2];
          o++;
        }
      }
    }
    this.skirt.geometry.attributes.position.needsUpdate = true;
    this.skirt.geometry.attributes.color.needsUpdate = true;
  }

  dispose() {
    this.geometry.dispose(); this.material.dispose();
    this.skirt.geometry.dispose(); this.skirt.material.dispose();
  }
}
