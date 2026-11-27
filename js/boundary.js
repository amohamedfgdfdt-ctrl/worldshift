// World boundary scenery: a natural mountain ring that encloses the playable
// square world, plus a far steppe that stretches to the fog. It exists so that
// no permitted camera angle or zoom level ever shows empty space around the
// terrain — the horizon is always mountains, hills or hazy lowland.
//
// The ring is parametrised in the Chebyshev metric (max(|x|,|z|)), so its
// inner edge hugs the square world boundary instead of leaving gaps at the
// corners. It is visual-only: no water, no buildings, no gameplay data.

import * as THREE from '../vendor/three.module.min.js';
import { HALF } from './config.js';
import { Noise2D, clamp, lerp, smoothstep } from './utils.js';
import { injectAtmosphere } from './atmosphere.js';

const srgb = (r, g, b) => {
  const f = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return [f(r), f(g), f(b)];
};
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

const PAL = {
  grass1: srgb(0.30, 0.46, 0.17),
  grass2: srgb(0.45, 0.52, 0.22),
  dry: srgb(0.55, 0.52, 0.33),
  forest: srgb(0.19, 0.32, 0.13),
  dirt: srgb(0.40, 0.32, 0.22),
  rock: srgb(0.47, 0.45, 0.43),
  rockDark: srgb(0.38, 0.36, 0.35),
  snow: srgb(0.93, 0.95, 0.98),
};

const DIRS = 192;                 // angular resolution of the ring
// Ring 0 is a hidden lip that hangs BELOW the terrain edge: it seals the gap
// between the playable terrain and the ring so the earthwork skirt and the
// void behind it can never be seen at grazing angles.
const RINGS = [                   // Chebyshev radius of each ring (world edge = HALF)
  191.6, 193.8, 197, 205, 215, 228, 244, 264, 288, 316, 348, 384, 424, 468, 516,
  568, 624, 684, 748, 816, 888, 964, 1050, 1150, 1280, 1450, 1700, 2100, 2650,
];
const M = RINGS.length;

export class WorldBoundary {
  constructor(scene, field, textures) {
    this.scene = scene;
    this.field = field;
    this.textures = textures;
    this._dir = [];
    for (let d = 0; d < DIRS; d++) {
      const a = (d / DIRS) * Math.PI * 2;
      const c = Math.cos(a), s = Math.sin(a);
      this._dir.push({ a, c, s, k: Math.max(Math.abs(c), Math.abs(s)) });
    }
    this._buildMesh();
    this.refresh();
  }

  refresh() {
    const seed = this.field.seed >>> 0;
    this.nR = new Noise2D(seed * 13 + 701);    // ridged peaks
    this.nH = new Noise2D(seed * 17 + 307);    // foothills
    this.nS = new Noise2D(seed * 29 + 911);    // sector (massif vs pass)
    this.nC = new Noise2D(seed + 6242);        // colour variation
    // edge heights per direction, sampled from the playable terrain
    this.edge = new Float32Array(DIRS);
    for (let d = 0; d < DIRS; d++) {
      const dd = this._dir[d];
      this.edge[d] = this.field.heightAt((dd.c / dd.k) * (HALF - 1.5), (dd.s / dd.k) * (HALF - 1.5));
    }
    this._fill();
  }

  /** Pure height profile, shared by the mesh and the camera collision query. */
  _profile(R, ang, hEdge, x, z) {
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const ridge = this.nR.ridged(ca * 2.3 + R * 0.0016 + 11, sa * 2.3 - R * 0.0011 + 5, 4);
    const sector = 0.55 + 0.45 * this.nS.noise(ca * 1.7 + 3.1, sa * 1.7 + 7.7);
    const pass = smoothstep(10, 26, hEdge);            // keep the river-exit gorge low
    const foot = smoothstep(HALF + 2, HALF + 128, R);  // foothill band
    let y = hEdge + foot * (16 + this.nH.fbm(x * 0.012, z * 0.012, 3) * 14);
    const band = smoothstep(HALF + 108, HALF + 278, R) * (1 - smoothstep(HALF + 500, HALF + 860, R));
    y += band * (30 + 150 * Math.pow(ridge, 1.5)) * sector * (0.3 + 0.7 * pass);
    const far = smoothstep(HALF + 800, HALF + 1500, R);
    y = lerp(y, 13 + this.nH.fbm(x * 0.004 + 9, z * 0.004 + 4, 3) * 7, far);
    return Math.max(2, y);
  }

  /** Ground height anywhere, inside or outside the playable grid. */
  heightAt(x, z) {
    const R = Math.max(Math.abs(x), Math.abs(z));
    if (R <= HALF - 1.5) return this.field.heightAt(x, z);
    const ang = Math.atan2(z, x);
    // interpolate the sampled edge heights by angle
    const fd = ((ang / (Math.PI * 2)) + 1) % 1 * DIRS;
    const d0 = Math.floor(fd) % DIRS, d1 = (d0 + 1) % DIRS;
    const hEdge = lerp(this.edge[d0], this.edge[d1], fd - Math.floor(fd));
    if (R <= HALF) return Math.max(this.field.heightAt(x, z), hEdge);
    return this._profile(R, ang, hEdge, x, z);
  }

  _buildMesh() {
    const g = new THREE.BufferGeometry();
    const count = DIRS * M;
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    const idx = new Uint32Array(DIRS * (M - 1) * 6);
    let p = 0;
    for (let d = 0; d < DIRS; d++) {
      const d2 = (d + 1) % DIRS;
      for (let m = 0; m < M - 1; m++) {
        const a = d * M + m, b = d2 * M + m, c = a + 1, e = b + 1;
        idx[p++] = a; idx[p++] = b; idx[p++] = c;
        idx[p++] = b; idx[p++] = e; idx[p++] = c;
      }
    }
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 60, 0), 3000);
    this.geometry = g;
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, side: THREE.DoubleSide });
    const uDetail = { value: this.textures?.detail || null };
    mat.onBeforeCompile = (shader) => {
      injectAtmosphere(shader);
      if (uDetail.value) {
        shader.uniforms.uDetail = uDetail;
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vWorldP;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWorldP = (modelMatrix * vec4(position, 1.0)).xyz;');
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nvarying vec3 vWorldP;\nuniform sampler2D uDetail;')
          .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec2 wp = vWorldP.xz;
  float d1 = texture2D(uDetail, wp * 0.083).r;
  float d2 = texture2D(uDetail, wp * 0.0171 + 0.37).r;
  float fine = texture2D(uDetail, wp * 0.37 + 0.11).r;
  diffuseColor.rgb *= (0.62 + 0.62 * d1 * (0.6 + 0.8 * d2)) * (0.86 + 0.28 * fine);
}`);
      }
    };
    mat.customProgramCacheKey = () => 'terra-boundary-v1';
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.name = 'boundary';
    this.mesh.receiveShadow = false;
    this.mesh.castShadow = false;
    this.mesh.frustumCulled = false;   // always visible around the camera
    this.scene.add(this.mesh);
  }

  _fill() {
    const pos = this.geometry.attributes.position.array;
    const col = this.geometry.attributes.color.array;
    const nc = this.nC;
    for (let d = 0; d < DIRS; d++) {
      const dd = this._dir[d];
      for (let m = 0; m < M; m++) {
        const R = RINGS[m];
        const x = (dd.c / dd.k) * R, z = (dd.s / dd.k) * R;
        const k = d * M + m;
        let y;
        if (m === 0) y = this.edge[d] + 0.35;       // stitch onto the terrain edge
        else if (m === 1) y = this.edge[d] - 8;     // lip OUTSIDE the skirt: covers it from outside view
        else y = this._profile(R, dd.a, this.edge[d], x, z);
        pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;

        // ---- colour
        const n1 = nc.fbm(x * 0.018, z * 0.018, 3);
        const n2 = nc.noise(x * 0.11, z * 0.11);
        const n3 = nc.fbm(x * 0.03 + 50, z * 0.03 + 50, 2);
        // slope estimate combining the radial profile and angular variation, so
        // dirt/rock colouring forms broken patches instead of concentric bands
        const y2 = m < M - 1
          ? this._profile(RINGS[m + 1], dd.a, this.edge[d], (dd.c / dd.k) * RINGS[m + 1], (dd.s / dd.k) * RINGS[m + 1])
          : y;
        const dA = this._dir[(d + 1) % DIRS];
        const yA = this._profile(R, dA.a, this.edge[(d + 1) % DIRS], (dA.c / dA.k) * R, (dA.s / dA.k) * R);
        const arc = R * (Math.PI * 2 / DIRS) * dd.k;
        const slope = m < M - 1
          ? Math.hypot((y2 - y) / ((RINGS[m + 1] - R) / dd.k), (yA - y) / Math.max(4, arc))
          : 0.4;
        const breakup = 0.45 + 0.55 * (n2 * 0.5 + 0.5) + 0.35 * (n3 * 0.5 + 0.5);
        const far = smoothstep(HALF + 800, HALF + 1500, R);
        let c = mix3(PAL.grass1, PAL.grass2, smoothstep(-0.3, 0.55, n1));
        if (m <= 1) {
          // the seam lip keeps moderate rocky colouring — never the dark steep-slope tones
          c = mix3(mix3(PAL.dirt, PAL.rock, 0.55), PAL.grass1, 0.25 + 0.3 * (n2 * 0.5 + 0.5));
          const v0 = 0.93 + 0.14 * n2;
          col[k * 3] = c[0] * v0; col[k * 3 + 1] = c[1] * v0; col[k * 3 + 2] = c[2] * v0;
          continue;
        }
        c = mix3(c, PAL.dry, far * 0.7);
        c = mix3(c, PAL.forest, smoothstep(0.05, 0.55, n3) * smoothstep(60, 30, y) * 0.8);
        c = mix3(c, PAL.dirt, smoothstep(0.75, 1.35, slope) * 0.45 * breakup);
        const rockW = Math.max(smoothstep(1.1, 1.9, slope), smoothstep(55, 95, y + n1 * 12));
        c = mix3(c, mix3(PAL.rock, PAL.rockDark, n2 * 0.5 + 0.5), rockW * clamp(breakup + 0.25, 0, 1) * (1 - far * 0.5));
        const snowW = smoothstep(105, 130, y + n1 * 14) * (1 - smoothstep(1.1, 1.8, slope) * 0.6);
        c = mix3(c, PAL.snow, snowW);
        const v = 0.93 + 0.14 * n2;
        col[k * 3] = c[0] * v; col[k * 3 + 1] = c[1] * v; col[k * 3 + 2] = c[2] * v;
      }
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
    this.geometry.computeVertexNormals();
  }

  dispose() {
    this.geometry.dispose();
    this.mesh.material.dispose();
  }
}
