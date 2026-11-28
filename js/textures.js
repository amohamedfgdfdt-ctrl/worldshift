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

// Procedural fallback baked into a canvas, then swapped for a real photo texture
// (ambientCG, CC0) once it loads. The swap renormalises brightness so the shader's
// detail multiplier keeps its original average level; on any error the fallback stays.
function makePhotoTex(fallback, size, url, { normalizeMean = false } = {}) {
  const cnv = document.createElement('canvas');
  cnv.width = cnv.height = size;
  const ctx = cnv.getContext('2d');
  const im = ctx.createImageData(size, size);
  im.data.set(fallback);
  ctx.putImageData(im, 0, 0);
  const t = new THREE.CanvasTexture(cnv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  new THREE.ImageLoader().load(url, (img) => {
    if (normalizeMean) {
      const c2 = document.createElement('canvas');
      c2.width = c2.height = img.width;
      const x2 = c2.getContext('2d');
      x2.drawImage(img, 0, 0);
      const d = x2.getImageData(0, 0, c2.width, c2.height);
      const px = d.data;
      let mean = 0;
      for (let i = 0; i < px.length; i += 4) mean += px[i];
      mean /= (px.length / 4) * 255;
      // target: the procedural fallback's mean (keeps terrain brightness unchanged)
      let fb = 0;
      for (let i = 0; i < fallback.length; i += 4) fb += fallback[i];
      fb /= (fallback.length / 4) * 255;
      const k = Math.min(2.2, Math.max(0.45, fb / Math.max(mean, 1e-3)));
      if (Math.abs(k - 1) > 0.03) {
        for (let i = 0; i < px.length; i++) {
          const v = px[i] * k;
          px[i] = v > 255 ? 255 : v;
        }
        x2.putImageData(d, 0, 0);
      }
      t.image = c2;
    } else {
      t.image = img;
    }
    t.needsUpdate = true;
  }, undefined, () => { /* keep the procedural fallback */ });
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
  const detail = makePhotoTex(gray, size, 'assets/textures/ground054/Ground054_1K-JPG_Color.jpg', { normalizeMean: true });

  // fine grain normal map for terrain (real ground normal, procedural fallback)
  const hn = tileableFbm(size, 16, 4, 77, 0.6);
  const normal = makePhotoTex(toNormalMap(hn, size, 7.0), size, 'assets/textures/ground054/Ground054_1K-JPG_NormalGL.jpg');

  // rock face detail (Rock035 photo, brightness-normalized grey multiplier)
  const hrk = tileableFbm(size, 9, 5, 301, 0.6);
  const rgray = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const v = Math.round(Math.min(1, Math.max(0, 0.45 + hrk[i] * 0.7)) * 255);
    rgray[i * 4] = rgray[i * 4 + 1] = rgray[i * 4 + 2] = v; rgray[i * 4 + 3] = 255;
  }
  const rock = makePhotoTex(rgray, size, 'assets/textures/rock035/Rock035_1K-JPG_Color.jpg', { normalizeMean: true });

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

  return { detail, normal, waterNormal, foam, rock };
}
