// Sky dome (gradient, sun, moving procedural clouds, stars), sun/moon light,
// ambient light, fog and the day/night cycle.
import * as THREE from '../vendor/three.module.min.js';
import { clamp, lerp, smoothstep } from './utils.js';

const SKY_VERT = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const SKY_FRAG = (cloudOctaves) => /* glsl */`
precision highp float;
uniform vec3 uHorizon; uniform vec3 uZenith; uniform vec3 uSunDir; uniform vec3 uSunColor;
uniform vec3 uCloudCol; uniform float uTime; uniform float uNight; uniform float uCloud;
varying vec3 vDir;
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < ${cloudOctaves}; i++) { s += vnoise(p) * a; p = p * 2.03 + 11.7; a *= 0.5; }
  return s;
}
void main() {
  vec3 d = normalize(vDir);
  float t = pow(clamp(d.y, 0.0, 1.0), 0.5);
  vec3 col = mix(uHorizon, uZenith, t);
  if (d.y < 0.0) col = mix(uHorizon, uHorizon * 0.55, clamp(-d.y * 5.0, 0.0, 1.0));

  // stars
  if (uNight > 0.01 && d.y > 0.0) {
    vec2 sp = d.xz / (d.y + 0.35) * 140.0;
    float h = hash(floor(sp));
    float tw = 0.6 + 0.4 * sin(uTime * 2.0 + h * 40.0);
    col += vec3(0.9, 0.95, 1.0) * step(0.9965, h) * tw * uNight * smoothstep(0.0, 0.2, d.y);
  }

  float md = max(dot(d, -uSunDir), 0.0);
  col += vec3(0.85, 0.9, 1.0) * smoothstep(0.9993, 0.9997, md) * uNight * 2.5 + vec3(0.3, 0.38, 0.6) * pow(md, 80.0) * uNight * 0.35;
  float sd = max(dot(d, uSunDir), 0.0);
  col += uSunColor * (pow(sd, 2000.0) * 40.0 + pow(sd, 45.0) * 0.35 + pow(sd, 6.0) * 0.10);

  if (d.y > 0.01) {
    vec2 uv = d.xz / (d.y + 0.14) * 0.75 + vec2(uTime * 0.006, uTime * 0.0025);
    float c = fbm(uv * 1.5);
    float cov = smoothstep(0.50 - uCloud * 0.22, 0.88, c);
    float shade = fbm(uv * 1.5 + uSunDir.xz * 0.15);
    vec3 cc = uCloudCol * (0.72 + 0.5 * clamp(c - shade + 0.5, 0.0, 1.0));
    cov *= smoothstep(0.01, 0.2, d.y);
    col = mix(col, cc, cov * 0.92);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// keyframes in sRGB, keyed by sun elevation (sin of angle)
const KEYS = [
  { e: -0.35, hor: [0.07, 0.09, 0.18], zen: [0.015, 0.03, 0.09] },
  { e: -0.10, hor: [0.16, 0.15, 0.28], zen: [0.03, 0.05, 0.14] },
  { e: 0.00, hor: [0.96, 0.52, 0.30], zen: [0.20, 0.28, 0.55] },
  { e: 0.10, hor: [0.90, 0.74, 0.62], zen: [0.26, 0.42, 0.76] },
  { e: 0.35, hor: [0.70, 0.82, 0.95], zen: [0.22, 0.46, 0.88] },
  { e: 1.00, hor: [0.74, 0.85, 0.97], zen: [0.18, 0.42, 0.86] },
];

function sampleKeys(e) {
  if (e <= KEYS[0].e) return { hor: KEYS[0].hor, zen: KEYS[0].zen };
  for (let i = 1; i < KEYS.length; i++) {
    if (e <= KEYS[i].e) {
      const a = KEYS[i - 1], b = KEYS[i];
      const t = (e - a.e) / (b.e - a.e);
      return {
        hor: a.hor.map((v, k) => lerp(v, b.hor[k], t)),
        zen: a.zen.map((v, k) => lerp(v, b.zen[k], t)),
      };
    }
  }
  const l = KEYS[KEYS.length - 1];
  return { hor: l.hor, zen: l.zen };
}

export class Environment {
  constructor(scene, { cloudOctaves = 4, shadowSize = 2048 } = {}) {
    this.scene = scene;
    this.sunDir = new THREE.Vector3(0.3, 0.8, -0.3).normalize();
    this.shadowExtent = 130;
    this.timeSec = 0;

    this.uniforms = {
      uHorizon: { value: new THREE.Color() },
      uZenith: { value: new THREE.Color() },
      uSunDir: { value: this.sunDir.clone() },
      uSunColor: { value: new THREE.Color() },
      uCloudCol: { value: new THREE.Color() },
      uTime: { value: 0 },
      uNight: { value: 0 },
      uCloud: { value: 0.45 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG(cloudOctaves),
      side: THREE.BackSide,
      depthWrite: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), mat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    scene.add(this.sky);

    this.hemi = new THREE.HemisphereLight(0xbfd8ff, 0x57492f, 1);
    scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.setShadowSize(shadowSize);
    scene.add(this.sun, this.sun.target);

    scene.fog = new THREE.FogExp2(0xaec6e0, 0.0014);

    this.state = { dayAmt: 1, elevation: 1, horizon: new THREE.Color(), zenith: new THREE.Color(), sunColor: new THREE.Color(), lightAmt: 1 };
  }

  setShadowSize(size) {
    this.shadowMapSize = size;
    const s = this.sun.shadow;
    if (s.map) { s.map.dispose(); s.map = null; }
    s.mapSize.set(size, size);
    const e = this.shadowExtent;
    s.camera.left = -e; s.camera.right = e; s.camera.top = e; s.camera.bottom = -e;
    s.camera.near = 1; s.camera.far = 900;
    s.bias = -0.0004;
    s.normalBias = 0.35;
    s.radius = 2.5;
    s.camera.updateProjectionMatrix();
  }

  /** hour 0..24 */
  update(hour, focus, simTime, cloud = 0.45) {
    const a = ((hour - 6) / 24) * Math.PI * 2;
    this.sunDir.set(Math.cos(a) * 0.95, Math.sin(a) * 0.78, -0.42).normalize();
    const e = this.sunDir.y;
    const dayAmt = smoothstep(-0.12, 0.28, e);
    const { hor, zen } = sampleKeys(e);
    const horizon = new THREE.Color().setRGB(hor[0], hor[1], hor[2], THREE.SRGBColorSpace);
    const zenith = new THREE.Color().setRGB(zen[0], zen[1], zen[2], THREE.SRGBColorSpace);
    const warm = new THREE.Color().setRGB(1.0, 0.56, 0.28, THREE.SRGBColorSpace);
    const white = new THREE.Color().setRGB(1.0, 0.96, 0.88, THREE.SRGBColorSpace);
    const sunColor = warm.clone().lerp(white, smoothstep(0.0, 0.4, e));

    const u = this.uniforms;
    u.uHorizon.value.copy(horizon); u.uZenith.value.copy(zenith);
    u.uSunDir.value.copy(this.sunDir); u.uSunColor.value.copy(sunColor).multiplyScalar(dayAmt > 0.02 ? 1 : 0);
    u.uTime.value = simTime; u.uNight.value = 1 - smoothstep(-0.2, 0.05, e); u.uCloud.value = cloud;
    const cc = horizon.clone().multiplyScalar(0.55).add(sunColor.clone().multiplyScalar(0.55 * dayAmt));
    u.uCloudCol.value.copy(cc);

    // lights
    const moon = e < -0.03;
    const sunI = 3.6 * smoothstep(-0.04, 0.3, e);
    const moonI = 1.5 * smoothstep(0.0, -0.3, e);
    const L = this.sun;
    if (moon) {
      L.color.setRGB(0.55, 0.65, 0.95);
      L.intensity = moonI;
    } else {
      L.color.copy(sunColor);
      L.intensity = sunI;
    }
    const dir = moon ? this.sunDir.clone().negate() : this.sunDir;
    this.lightDir = dir;

    this.hemi.color.copy(zenith).lerp(new THREE.Color(1, 1, 1), 0.35);
    this.hemi.groundColor.setRGB(0.20, 0.17, 0.12).multiplyScalar(0.4 + 0.6 * dayAmt);
    this.hemi.intensity = lerp(0.55, 1.05, dayAmt);

    // fog follows horizon colour
    this.scene.fog.color.copy(horizon).lerp(new THREE.Color(0.5, 0.6, 0.75), 0.15 * dayAmt);

    // shadow frustum follows the camera focus, snapped to texels (no shimmering)
    const z = dir.clone().normalize();
    const xAx = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), z).normalize();
    const yAx = new THREE.Vector3().crossVectors(z, xAx);
    const texel = (2 * this.shadowExtent) / this.shadowMapSize;
    const px = Math.round(focus.dot(xAx) / texel) * texel;
    const py = Math.round(focus.dot(yAx) / texel) * texel;
    const pz = focus.dot(z);
    const snapped = xAx.multiplyScalar(px).add(yAx.multiplyScalar(py)).add(z.clone().multiplyScalar(pz));
    L.position.copy(snapped).addScaledVector(z, 380);
    L.target.position.copy(snapped);
    L.target.updateMatrixWorld();

    Object.assign(this.state, { dayAmt, elevation: e, lightAmt: lerp(0.12, 1, dayAmt) });
    this.state.horizon.copy(horizon); this.state.zenith.copy(zenith); this.state.sunColor.copy(sunColor);
    return this.state;
  }

  followCamera(camera) { this.sky.position.copy(camera.position); }

  applyToWater(wu) {
    const s = this.state;
    wu.uSunDir.value.copy(this.sunDir);
    wu.uSunColor.value.copy(s.sunColor).multiplyScalar(s.dayAmt);
    wu.uHorizon.value.copy(s.horizon);
    wu.uZenith.value.copy(s.zenith);
    wu.uFogColor.value.copy(this.scene.fog.color);
    wu.uFogDensity.value = this.scene.fog.density;
    wu.uLight.value = lerp(0.3, 1, s.dayAmt);
  }
}
