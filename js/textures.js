// Procedural, tileable textures generated at start-up (no external assets).
import * as THREE from '../vendor/three.module.min.js';

function hash(ix, iy, seed) {
  let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

function pnoise(x, y, per, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const u = fade(x - xi), v = fade(y - yi);
  const m = (a) => ((a % per) + per) % per;
  const h = (a, b) => hash(m(a), m(b), seed);
  const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
  return (a + (b - a) * u) + ((c + (d - c) * u) - (a + (b - a) * u)) * v;
}

/** Tileable fBm height field in 0..1, size x size. */
function tileableFbm(size, basePeriod, octaves, seed, gain = 0.5) {
  const out = new Float32Array(size * size);
  let norm = 0, amp = 1;
  for (let o = 0; o < octaves; o++) { norm += amp; amp *= gain; }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let s = 0; amp = 1;
      for (let o = 0; o < octaves; o++) {
        const per = basePeriod << o;
        s += pnoise((x / size) * per, (y / size) * per, per, seed + o * 17) * amp;
        amp *= gain;
      }
      out[y * size + x] = s / norm;
    }
  }
  return out;
}

function toNormalMap(height, size, strength) {
  const data = new Uint8Array(size * size * 4);
  const at = (x, y) => height[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const l = Math.hypot(dx, dy, 1);
      const k = (y * size + x) * 4;
      data[k] = Math.round((-dx / l * 0.5 + 0.5) * 255);
      data[k + 1] = Math.round((-dy / l * 0.5 + 0.5) * 255);
      data[k + 2] = Math.round((1 / l * 0.5 + 0.5) * 255);
      data[k + 3] = 255;
    }
  }
  return data;
}

function makeTex(data, size, { mip = true } = {}) {
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = mip ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  t.generateMipmaps = mip;
  t.needsUpdate = true;
  return t;
}

export function createTextures(size = 256) {
  // grayscale detail multiplier used for terrain albedo variation
  const hd = tileableFbm(size, 6, 5, 31, 0.55);
  const gray = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const v = Math.round(Math.min(1, Math.max(0, 0.42 + hd[i] * 0.75)) * 255);
    gray[i * 4] = gray[i * 4 + 1] = gray[i * 4 + 2] = v; gray[i * 4 + 3] = 255;
  }
  const detail = makeTex(gray, size);

  // fine grain normal map for terrain
  const hn = tileableFbm(size, 16, 4, 77, 0.6);
  const normal = makeTex(toNormalMap(hn, size, 7.0), size);

  // water ripple normal map (softer, larger features)
  const hw = tileableFbm(size, 8, 4, 123, 0.55);
  const waterNormal = makeTex(toNormalMap(hw, size, 9.0), size);

  // foam / caustics noise (gray, in R)
  const hf = tileableFbm(size, 10, 4, 211, 0.6);
  const fd = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const v = Math.round(Math.min(1, Math.max(0, hf[i] * 1.3 - 0.15)) * 255);
    fd[i * 4] = fd[i * 4 + 1] = fd[i * 4 + 2] = v; fd[i * 4 + 3] = 255;
  }
  const foam = makeTex(fd, size);

  return { detail, normal, waterNormal, foam };
}
