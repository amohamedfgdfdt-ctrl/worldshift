// Interactive water: a height-grid "virtual pipes" shallow-water model
// (flux between neighbouring nodes driven by water-surface differences),
// plus the renderable water surface.
//
// This is a visually plausible, stable approximation — NOT a scientifically
// accurate fluid solver.

import * as THREE from '../vendor/three.module.min.js';
import { CELL, N, VERTS, SIZE, HALF, GRAVITY, WATER_DT } from './config.js';

const CELL2 = CELL * CELL;

export class WaterSim {
  constructor(field) {
    this.field = field;                      // HeightField (terrain heights, read only)
    const n = VERTS * VERTS;
    this.depth = new Float32Array(n);        // water depth per node (m)
    this.ground = new Float32Array(n);       // terrain + obstacles (buildings)
    this.obst = new Float32Array(n);         // obstacle height per node
    this.fL = new Float32Array(n);           // outflow fluxes (m^3/s)
    this.fR = new Float32Array(n);
    this.fU = new Float32Array(n);
    this.fD = new Float32Array(n);
    this.vx = new Float32Array(n);           // velocity estimate for visuals
    this.vz = new Float32Array(n);
    this.sources = [];                       // {id,i,j,rate}
    this.sinks = [];                         // {id,i,j,r,rate,stored,capacity}
    this._nextId = 1;
    this.params = {
      flowSpeed: 1,        // multiplies the step length (stability-clamped)
      sourceRate: 1,       // global multiplier for sources
      sourcesEnabled: true,
      damping: 0.965,
      evaporation: 0.00002,
      openBorders: true,
    };
    this.dirty = true;
    this.syncGround();
  }

  syncGround() {
    const g = this.ground, h = this.field.h, o = this.obst;
    for (let k = 0; k < g.length; k++) g[k] = h[k] + o[k];
  }

  /** Restore the water that belongs to the freshly generated world. */
  resetToInitial() {
    this.depth.set(this.field.initialWater);
    for (const a of [this.fL, this.fR, this.fU, this.fD, this.vx, this.vz]) a.fill(0);
    this.dirty = true;
  }

  clearAll() {
    this.depth.fill(0);
    for (const a of [this.fL, this.fR, this.fU, this.fD, this.vx, this.vz]) a.fill(0);
    this.dirty = true;
  }

  // ---- sources & sinks ---------------------------------------------------
  addSource(i, j, rate = 8, id = null) {
    const s = { id: id ?? this._nextId++, i, j, rate };
    if (id != null) this._nextId = Math.max(this._nextId, id + 1);
    this.sources.push(s);
    return s;
  }
  removeSource(id) {
    const k = this.sources.findIndex((s) => s.id === id);
    if (k >= 0) this.sources.splice(k, 1);
  }
  getSource(id) { return this.sources.find((s) => s.id === id); }

  addSink(i, j, r, rate, capacity, stored = 0) {
    const s = { id: this._nextId++, i, j, r, rate, capacity, stored };
    this.sinks.push(s);
    return s;
  }
  removeSink(id) {
    const k = this.sinks.findIndex((s) => s.id === id);
    if (k >= 0) this.sinks.splice(k, 1);
  }

  setObstacle(i0, j0, i1, j1, height) {
    for (let j = Math.max(0, j0); j <= Math.min(N, j1); j++) {
      for (let i = Math.max(0, i0); i <= Math.min(N, i1); i++) {
        const k = j * VERTS + i;
        this.obst[k] = height;
        this.ground[k] = this.field.h[k] + height;
      }
    }
  }

  // ---- direct manipulation (tools) ----------------------------------------
  /** Add `volume` m^3 spread with a smooth falloff around world (x,z). */
  addVolume(x, z, radius, volume) {
    const cx = (x + HALF) / CELL, cz = (z + HALF) / CELL, r = radius / CELL;
    const i0 = Math.max(0, Math.floor(cx - r)), i1 = Math.min(N, Math.ceil(cx + r));
    const j0 = Math.max(0, Math.floor(cz - r)), j1 = Math.min(N, Math.ceil(cz + r));
    let wsum = 0;
    const ws = [];
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const d = Math.hypot(i - cx, j - cz) / r;
      const w = d < 1 ? (1 - d * d) : 0;
      ws.push(w); wsum += w;
    }
    if (wsum <= 0) return 0;
    let t = 0, moved = 0;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++, t++) {
      const w = ws[t]; if (w <= 0) continue;
      const k = j * VERTS + i;
      if (this.obst[k] > 0) continue;
      const dv = (volume * w / wsum) / CELL2;
      if (volume >= 0) { this.depth[k] += dv; moved += dv * CELL2; }
      else {
        const take = Math.min(this.depth[k], -dv);
        this.depth[k] -= take; moved -= take * CELL2;
      }
    }
    this.dirty = true;
    return moved;
  }

  depthAt(x, z) {
    let gx = (x + HALF) / CELL, gz = (z + HALF) / CELL;
    gx = Math.min(N - 1e-6, Math.max(0, gx)); gz = Math.min(N - 1e-6, Math.max(0, gz));
    const i = Math.floor(gx), j = Math.floor(gz), fx = gx - i, fz = gz - j;
    const d = this.depth, k = j * VERTS + i;
    return (d[k] * (1 - fx) + d[k + 1] * fx) * (1 - fz) + (d[k + VERTS] * (1 - fx) + d[k + VERTS + 1] * fx) * fz;
  }

  velocityAt(x, z) {
    const i = Math.min(N, Math.max(0, Math.round((x + HALF) / CELL)));
    const j = Math.min(N, Math.max(0, Math.round((z + HALF) / CELL)));
    const k = j * VERTS + i;
    return Math.hypot(this.vx[k], this.vz[k]);
  }

  /** Maximum depth over a node rectangle (inclusive). */
  maxDepthIn(i0, j0, i1, j1) {
    let m = 0;
    for (let j = Math.max(0, j0); j <= Math.min(N, j1); j++) {
      for (let i = Math.max(0, i0); i <= Math.min(N, i1); i++) m = Math.max(m, this.depth[j * VERTS + i]);
    }
    return m;
  }

  totalVolume() {
    let s = 0;
    const d = this.depth;
    for (let k = 0; k < d.length; k++) s += d[k];
    return s * CELL2;
  }

  wetNodeCount() {
    let c = 0;
    const d = this.depth;
    for (let k = 0; k < d.length; k++) if (d[k] > 0.02) c++;
    return c;
  }

  // ---- one simulation step -------------------------------------------------
  step(dtScale = 1, enableSources = true) {
    const n = VERTS;
    const dt = WATER_DT * Math.min(1.6, Math.max(0.2, this.params.flowSpeed * dtScale));
    const g = GRAVITY, damp = this.params.damping;
    const { depth: d, ground, fL, fR, fU, fD, vx, vz } = this;
    const open = this.params.openBorders;

    // sources / sinks
    if (enableSources && this.params.sourcesEnabled) {
      for (const s of this.sources) {
        const k = s.j * n + s.i;
        d[k] += (s.rate * this.params.sourceRate * dt) / CELL2;
      }
    }
    for (const s of this.sinks) {
      if (s.stored >= s.capacity) continue;
      const area = CELL2;
      for (let j = Math.max(0, s.j - s.r); j <= Math.min(N, s.j + s.r); j++) {
        for (let i = Math.max(0, s.i - s.r); i <= Math.min(N, s.i + s.r); i++) {
          const k = j * n + i;
          if (this.obst[k] > 0 || d[k] <= 0) continue;
          const take = Math.min(d[k], (s.rate * dt) / area);
          d[k] -= take; s.stored += take * area;
        }
      }
    }

    // pass A: fluxes
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const k = j * n + i;
        const di = d[k];
        if (di < 1e-5) { fL[k] = 0; fR[k] = 0; fU[k] = 0; fD[k] = 0; continue; }
        const hi = ground[k] + di;
        let a, dh, f;
        // left
        if (i > 0) {
          const kk = k - 1; dh = hi - (ground[kk] + d[kk]);
          f = fL[k] * damp + (dh > 0 ? dt * g * di * dh : 0);
        } else f = open ? fL[k] * damp + dt * g * di * 1.0 : 0;
        fL[k] = f > 0 ? f : 0;
        // right
        if (i < n - 1) {
          const kk = k + 1; dh = hi - (ground[kk] + d[kk]);
          f = fR[k] * damp + (dh > 0 ? dt * g * di * dh : 0);
        } else f = open ? fR[k] * damp + dt * g * di * 1.0 : 0;
        fR[k] = f > 0 ? f : 0;
        // up (j-1)
        if (j > 0) {
          const kk = k - n; dh = hi - (ground[kk] + d[kk]);
          f = fU[k] * damp + (dh > 0 ? dt * g * di * dh : 0);
        } else f = open ? fU[k] * damp + dt * g * di * 1.0 : 0;
        fU[k] = f > 0 ? f : 0;
        // down (j+1)
        if (j < n - 1) {
          const kk = k + n; dh = hi - (ground[kk] + d[kk]);
          f = fD[k] * damp + (dh > 0 ? dt * g * di * dh : 0);
        } else f = open ? fD[k] * damp + dt * g * di * 1.0 : 0;
        fD[k] = f > 0 ? f : 0;
        // limit so a node never gives away more than it holds
        const out = fL[k] + fR[k] + fU[k] + fD[k];
        const vol = di * CELL2;
        if (out * dt > vol) {
          const K = vol / (out * dt);
          fL[k] *= K; fR[k] *= K; fU[k] *= K; fD[k] *= K;
        }
      }
    }

    // pass B: depth update
    const evap = this.params.evaporation * dt;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const k = j * n + i;
        let inflow = 0;
        if (i > 0) inflow += fR[k - 1];
        if (i < n - 1) inflow += fL[k + 1];
        if (j > 0) inflow += fD[k - n];
        if (j < n - 1) inflow += fU[k + n];
        const outflow = fL[k] + fR[k] + fU[k] + fD[k];
        let nd = d[k] + (dt * (inflow - outflow)) / CELL2;
        if (nd > 0) { nd -= evap; if (nd < 0.0008) nd = 0; } else nd = 0;
        d[k] = nd;

        // visual velocity (m/s) from net fluxes through the node
        if (nd > 0.01) {
          const qx = (fR[k] - fL[k] + (i > 0 ? fR[k - 1] : 0) - (i < n - 1 ? fL[k + 1] : 0)) * 0.5;
          const qz = (fD[k] - fU[k] + (j > 0 ? fD[k - n] : 0) - (j < n - 1 ? fU[k + n] : 0)) * 0.5;
          const area = CELL * Math.max(nd, 0.15);
          const tx = qx / area, tz = qz / area;
          vx[k] += (tx - vx[k]) * 0.35; vz[k] += (tz - vz[k]) * 0.35;
        } else { vx[k] *= 0.5; vz[k] *= 0.5; }
      }
    }
    this.dirty = true;
  }

  // ---- persistence ---------------------------------------------------------
  /** Run-length encode quantised depths (mm) as pairs [value,count]. */
  encode() {
    const d = this.depth, out = [];
    let prev = -1, cnt = 0;
    for (let k = 0; k < d.length; k++) {
      const q = Math.min(65535, Math.round(d[k] * 1000));
      if (q === prev) cnt++;
      else { if (cnt) out.push(prev, cnt); prev = q; cnt = 1; }
    }
    if (cnt) out.push(prev, cnt);
    return out;
  }
  decode(rle) {
    let p = 0;
    const d = this.depth;
    for (let r = 0; r + 1 < rle.length; r += 2) {
      const v = rle[r] / 1000, c = rle[r + 1];
      for (let q = 0; q < c && p < d.length; q++) d[p++] = v;
    }
    while (p < d.length) d[p++] = 0;
    for (const a of [this.fL, this.fR, this.fU, this.fD, this.vx, this.vz]) a.fill(0);
    this.dirty = true;
  }
}

// ---------------------------------------------------------------------------
// Water surface mesh + shader
// ---------------------------------------------------------------------------

const WAVES_GLSL = /* glsl */`
// Sum of three travelling sine waves (visual only). Returns height, writes the gradient.
float waveSum(vec2 p, float t, out vec2 g) {
  const vec2 D0 = vec2(0.8, 0.6), D1 = vec2(-0.5, 0.85), D2 = vec2(0.2, -0.98);
  float h = 0.0; g = vec2(0.0); float f;
  f = dot(D0, p) * 0.42 + t * 1.3; h += 0.070 * sin(f); g += 0.070 * 0.42 * cos(f) * D0;
  f = dot(D1, p) * 0.77 + t * 1.7; h += 0.040 * sin(f); g += 0.040 * 0.77 * cos(f) * D1;
  f = dot(D2, p) * 1.30 + t * 2.2; h += 0.020 * sin(f); g += 0.020 * 1.30 * cos(f) * D2;
  return h;
}`;

const WATER_VERT = /* glsl */`
attribute float aDepth;
attribute vec2 aFlow;
attribute float aFoam;
uniform float uTime;
uniform float uQ;
uniform mat4 uReflMat;
varying float vDepth;
varying vec2 vFlow;
varying vec3 vWPos;
varying vec3 vNormalW;
varying float vFoam;
varying vec4 vRefl;
${WAVES_GLSL}
void main() {
  vDepth = aDepth;
  vFlow = aFlow;
  vFoam = aFoam;
  vNormalW = normal;
  vec3 p = position;
  if (uQ > 1.5) {
    vec2 g;
    float calm = smoothstep(0.08, 0.9, aDepth) * (1.0 - 0.6 * smoothstep(1.5, 4.0, length(aFlow)));
    p.y += waveSum(p.xz, uTime, g) * calm;
  }
  vWPos = p;
  vRefl = uReflMat * vec4(p, 1.0);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

const WATER_FRAG = /* glsl */`
precision highp float;
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uHorizon;
uniform vec3 uZenith;
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uLight;
uniform float uQ;
uniform float uRefl;
uniform float uHasRefl;
uniform float uLakeY;
uniform sampler2D uReflTex;
uniform sampler2D uNormalTex;
uniform sampler2D uFoamTex;
varying float vDepth;
varying vec2 vFlow;
varying vec3 vWPos;
varying vec3 vNormalW;
varying float vFoam;
varying vec4 vRefl;
${WAVES_GLSL}

vec3 skyCol(vec3 r) {
  float t = pow(clamp(r.y, 0.0, 1.0), 0.45);
  return mix(uHorizon, uZenith, t);
}

vec2 rippleNormal(vec2 p, vec2 flow, float t) {
  float sp = length(flow);
  vec2 f = flow * 0.55 + vec2(0.35, 0.12) * (1.0 - smoothstep(0.0, 0.8, sp));
  float ph0 = fract(t * 0.35), ph1 = fract(t * 0.35 + 0.5);
  float w = abs(2.0 * ph0 - 1.0);
  vec2 n0 = texture2D(uNormalTex, p * 0.115 - f * ph0 * 0.9).xy * 2.0 - 1.0;
  vec2 n1 = texture2D(uNormalTex, p * 0.115 - f * ph1 * 0.9 + 0.5).xy * 2.0 - 1.0;
  vec2 a = mix(n0, n1, w);
  vec2 b = texture2D(uNormalTex, p * 0.31 + vec2(t * 0.03, -t * 0.02)).xy * 2.0 - 1.0;
  return a * 0.55 + b * 0.35;
}

void main() {
  float dep = vDepth;
  if (dep < 0.006) discard;
  vec3 V = normalize(cameraPosition - vWPos);
  vec3 Nb = normalize(vNormalW);
  float calm = smoothstep(0.0, 0.6, dep);
  vec3 N = Nb;
  vec2 rn = vec2(0.0);
  if (uQ > 0.5) {
    rn = rippleNormal(vWPos.xz, vFlow, uTime);
    N = normalize(vec3(Nb.x + rn.x * 0.32 * calm, Nb.y, Nb.z + rn.y * 0.32 * calm));
  }
  if (uQ > 1.5) {
    vec2 g; waveSum(vWPos.xz, uTime, g);
    float wc = smoothstep(0.08, 0.9, dep) * (1.0 - 0.6 * smoothstep(1.5, 4.0, length(vFlow)));
    N = normalize(vec3(N.x - g.x * wc, N.y, N.z - g.y * wc));
  }

  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
  vec3 R = reflect(-V, N);
  R.y = abs(R.y);
  vec3 sky = skyCol(R);

  // planar reflection of the scene (lake level only)
  if (uRefl > 1.5 && uHasRefl > 0.5) {
    float onLake = 1.0 - smoothstep(0.12, 0.5, abs(vWPos.y - uLakeY));
    vec2 ruv = vRefl.xy / vRefl.w + (N.xz - Nb.xz) * 0.06;
    vec3 rc = texture2D(uReflTex, clamp(ruv, 0.002, 0.998)).rgb;
    sky = mix(sky, rc, onLake * (uRefl > 2.5 ? 1.0 : 0.85));
  }

  vec3 spec = vec3(0.0);
  if (uRefl > 0.5) {
    float sunAmt = max(dot(R, uSunDir), 0.0);
    spec = uSunColor * (pow(sunAmt, 900.0) * 6.0 + pow(sunAmt, 60.0) * 0.35) * smoothstep(-0.02, 0.15, uSunDir.y);
  }

  float k = exp(-dep * 0.5);
  vec3 body = mix(uDeep, uShallow, k) * uLight;
  float diff = 0.55 + 0.45 * max(dot(N, uSunDir), 0.0);
  body *= diff;
  // depth colouring: shallow water picks up a sandy tint, deep water gets darker
  if (uQ > 1.5) body = mix(body, body * vec3(1.15, 1.1, 0.9), (1.0 - smoothstep(0.0, 0.6, dep)) * 0.5);

  vec3 col = mix(body, sky, clamp(fres * 0.9 + 0.04, 0.0, 1.0));
  col += spec;

  // foam
  float speed = length(vFlow);
  float shore, rapid = 0.0, fn = 0.5;
  if (uQ > 0.5) {
    fn = texture2D(uFoamTex, vWPos.xz * 0.09 + vFlow * uTime * -0.05).r;
    float fn2 = texture2D(uFoamTex, vWPos.xz * 0.23 - vec2(uTime * 0.02)).r;
    shore = smoothstep(0.16, 0.012, dep) * (0.25 + 0.55 * fn);
    rapid = smoothstep(2.0, 5.0, speed) * fn * fn2 * 1.6;
    if (uQ > 1.5) rapid += vFoam * (0.35 + 0.9 * fn * fn2) * smoothstep(0.02, 0.3, dep);
  } else {
    shore = smoothstep(0.1, 0.01, dep) * 0.5;
  }
  float foam = clamp(shore * 0.9 + rapid, 0.0, 1.0);
  col = mix(col, vec3(0.9, 0.95, 1.0) * uLight, foam * 0.7);

  float alpha = 0.30 + 0.68 * (1.0 - exp(-dep * 1.05));
  alpha = max(alpha, fres);
  alpha = max(alpha, foam * 0.9);
  alpha *= smoothstep(0.006, 0.14, dep);

  float dist = length(cameraPosition - vWPos);
  float fog = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
  col = mix(col, uFogColor, fog);

  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class WaterMesh {
  constructor(sim, terrainIndex, textures) {
    this.sim = sim;
    const g = new THREE.BufferGeometry();
    const n = VERTS * VERTS;
    this.pos = new Float32Array(n * 3);
    this.nor = new Float32Array(n * 3);
    this.dep = new Float32Array(n);
    this.flow = new Float32Array(n * 2);
    this.foam = new Float32Array(n);
    this._skip = 0;
    this.quality = 2; this.reflQ = 0;
    this.reflRT = null;
    for (let j = 0; j < VERTS; j++) for (let i = 0; i < VERTS; i++) {
      const k = j * VERTS + i;
      this.pos[k * 3] = i * CELL - HALF;
      this.pos[k * 3 + 2] = j * CELL - HALF;
      this.nor[k * 3 + 1] = 1;
    }
    const mk = (arr, size) => {
      const a = new THREE.BufferAttribute(arr, size);
      a.setUsage(THREE.DynamicDrawUsage);
      return a;
    };
    g.setAttribute('position', mk(this.pos, 3));
    g.setAttribute('normal', mk(this.nor, 3));
    g.setAttribute('aDepth', mk(this.dep, 1));
    g.setAttribute('aFlow', mk(this.flow, 2));
    g.setAttribute('aFoam', mk(this.foam, 1));
    g.setIndex(terrainIndex);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 20, 0), SIZE);
    g.boundingBox = new THREE.Box3(new THREE.Vector3(-HALF, -10, -HALF), new THREE.Vector3(HALF, 80, HALF));
    this.geometry = g;

    this.uniforms = {
      uTime: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0.3, 0.8, 0.3) },
      uSunColor: { value: new THREE.Color(1, 0.95, 0.85) },
      uHorizon: { value: new THREE.Color(0.5, 0.65, 0.85) },
      uZenith: { value: new THREE.Color(0.1, 0.25, 0.6) },
      uShallow: { value: new THREE.Color().setRGB(0.10, 0.52, 0.55, THREE.SRGBColorSpace) },
      uDeep: { value: new THREE.Color().setRGB(0.02, 0.17, 0.36, THREE.SRGBColorSpace) },
      uFogColor: { value: new THREE.Color(0.6, 0.7, 0.85) },
      uFogDensity: { value: 0.0016 },
      uLight: { value: 1 },
      uNormalTex: { value: textures.waterNormal },
      uFoamTex: { value: textures.foam },
      uQ: { value: 2 },
      uRefl: { value: 0 },
      uHasRefl: { value: 0 },
      uLakeY: { value: sim.field?.lake?.level ?? 0 },
      uReflTex: { value: null },
      uReflMat: { value: new THREE.Matrix4() },
    };
    this.vcam = new THREE.PerspectiveCamera();
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: WATER_VERT,
      fragmentShader: WATER_FRAG,
      transparent: true,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.mesh.name = 'water';
  }

  /** Visual quality 0..3 and reflection quality 0..3. Never touches the simulation. */
  setQuality(q, refl) {
    this.quality = q; this.reflQ = refl;
    this.uniforms.uQ.value = q;
    this.uniforms.uRefl.value = refl;
    if (refl < 2) this.disposeReflection();
    if (q < 2) this.foam.fill(0);
  }

  disposeReflection() {
    if (this.reflRT) { this.reflRT.dispose(); this.reflRT = null; }
    this.uniforms.uHasRefl.value = 0;
    this.uniforms.uReflTex.value = null;
  }

  /** Render the scene mirrored about the lake plane (planar reflection). */
  renderReflection(renderer, scene, camera, pr) {
    if (this.reflQ < 2) return;
    const res = this.reflQ >= 3 ? 0.75 : 0.45;
    const canvas = renderer.domElement;
    const W = Math.max(64, Math.round(canvas.clientWidth * pr * res)), H = Math.max(64, Math.round(canvas.clientHeight * pr * res));
    if (!this.reflRT || this.reflRT.width !== W || this.reflRT.height !== H) {
      this.disposeReflection();
      this.reflRT = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, depthBuffer: true });
      this.reflRT.texture.generateMipmaps = false;
    }
    const y = this.uniforms.uLakeY.value;
    if (camera.position.y <= y + 0.5) { this.uniforms.uHasRefl.value = 0; return; }
    const vc = this.vcam;
    camera.updateMatrixWorld();
    const pos = camera.position.clone();
    const fwd = new THREE.Vector3(0, 0, -1).transformDirection(camera.matrixWorld);
    const tgt = pos.clone().addScaledVector(fwd, 10);
    const mirror = (v) => v.set(v.x, 2 * y - v.y, v.z);
    vc.position.copy(mirror(pos.clone()));
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    vc.up.set(up.x, -up.y, up.z);
    vc.lookAt(mirror(tgt));
    vc.fov = camera.fov; vc.aspect = camera.aspect; vc.near = camera.near; vc.far = Math.min(camera.far, 1500);
    vc.updateProjectionMatrix();
    vc.updateMatrixWorld();
    vc.matrixWorldInverse.copy(vc.matrixWorld).invert();
    const m = this.uniforms.uReflMat.value;
    m.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    m.multiply(vc.projectionMatrix).multiply(vc.matrixWorldInverse);

    const wasVis = this.mesh.visible;
    this.mesh.visible = false;
    const sh = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -y + 0.02);
    const oldClip = renderer.clippingPlanes;
    renderer.clippingPlanes = [plane];
    const oldRT = renderer.getRenderTarget();
    renderer.setRenderTarget(this.reflRT);
    renderer.clear();
    renderer.render(scene, vc);
    renderer.setRenderTarget(oldRT);
    renderer.clippingPlanes = oldClip;
    renderer.shadowMap.autoUpdate = sh;
    this.mesh.visible = wasVis;
    this.uniforms.uReflTex.value = this.reflRT.texture;
    this.uniforms.uHasRefl.value = 1;
  }

  /** Copy simulation state into the vertex buffers (only when dirty). */
  update(force = false) {
    const sim = this.sim;
    if (!sim.dirty && !force) return false;
    // visual refresh rate is decoupled from the simulation (lower tiers refresh less often)
    if (!force && ++this._skip < [3, 2, 1, 1][this.quality]) return false;
    this._skip = 0;
    sim.dirty = false;
    const n = VERTS, d = sim.depth, h = sim.ground, pos = this.pos, nor = this.nor, dep = this.dep, flow = this.flow;
    const vx = sim.vx, vz = sim.vz;
    const lift = 0.02;
    for (let k = 0, t = n * n; k < t; k++) {
      const di = d[k];
      pos[k * 3 + 1] = h[k] + di + (di > 0 ? lift : -0.05);
      dep[k] = di;
      flow[k * 2] = vx[k]; flow[k * 2 + 1] = vz[k];
    }
    if (this.quality >= 2) {
      // visual-only foam: turbulence (speed x depth gradient) that decays over time
      const fo = this.foam;
      for (let j = 1; j < n - 1; j++) for (let i = 1; i < n - 1; i++) {
        const k = j * n + i, di = d[k];
        let t = 0;
        if (di > 0.01) {
          const sp = Math.hypot(vx[k], vz[k]);
          const gr = Math.abs(d[k + 1] - d[k - 1]) + Math.abs(d[k + n] - d[k - n]) + Math.abs(h[k + 1] - h[k - 1]) * 0.25 + Math.abs(h[k + n] - h[k - n]) * 0.25;
          t = Math.min(1, sp * gr * 0.45) * (sp > 0.5 ? 1 : 0);
        }
        const v = fo[k] * 0.93;
        fo[k] = t > v ? t : v;
      }
    }
    // surface normals from central differences of the surface
    for (let j = 0; j < n; j++) {
      const j0 = j > 0 ? j - 1 : j, j1 = j < n - 1 ? j + 1 : j;
      for (let i = 0; i < n; i++) {
        const i0 = i > 0 ? i - 1 : i, i1 = i < n - 1 ? i + 1 : i;
        const k = j * n + i;
        if (d[k] <= 0) { nor[k * 3] = 0; nor[k * 3 + 1] = 1; nor[k * 3 + 2] = 0; continue; }
        const dx = (pos[(j * n + i1) * 3 + 1] - pos[(j * n + i0) * 3 + 1]) / ((i1 - i0) * CELL);
        const dz = (pos[(j1 * n + i) * 3 + 1] - pos[(j0 * n + i) * 3 + 1]) / ((j1 - j0) * CELL);
        const inv = 1 / Math.hypot(dx, 1, dz);
        nor[k * 3] = -dx * inv; nor[k * 3 + 1] = inv; nor[k * 3 + 2] = -dz * inv;
      }
    }
    const a = this.geometry.attributes;
    a.position.needsUpdate = true; a.normal.needsUpdate = true;
    a.aDepth.needsUpdate = true; a.aFlow.needsUpdate = true; a.aFoam.needsUpdate = this.quality >= 2;
    return true;
  }
}
