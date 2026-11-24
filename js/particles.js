// Particle systems (all pooled, fixed-size buffers, no per-frame allocation):
//  - factory smoke: rises from every Small Factory, drifts with the wind
//  - ambient motes: pollen/dust by day, fireflies at night (additive glow)
// Density comes from the "Particle density" graphics setting.
import * as THREE from '../vendor/three.module.min.js';

const VERT = `
attribute vec4 aData;   // x age01, y size, z seed, w alive
uniform float uScale;
varying float vAge; varying float vSeed; varying float vAlive;
void main(){
  vAge = aData.x; vSeed = aData.z; vAlive = aData.w;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aData.w > 0.5 ? aData.y * uScale / max(1.0, -mv.z) : 0.0;
}`;
const SMOKE_FRAG = `
uniform float uTone; varying float vAge; varying float vAlive;
void main(){
  if (vAlive < 0.5) discard;
  vec2 p = gl_PointCoord - 0.5; float r = length(p) * 2.0;
  float a = smoothstep(1.0, 0.25, r) * (1.0 - vAge) * smoothstep(0.0, 0.08, vAge) * 0.55;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vec3(uTone) * (0.8 + 0.2 * (1.0 - vAge)), a);
}`;
const MOTE_FRAG = `
uniform float uNight; uniform float uTime; varying float vSeed; varying float vAlive;
void main(){
  if (vAlive < 0.5) discard;
  vec2 p = gl_PointCoord - 0.5; float r = length(p) * 2.0;
  float tw = 0.55 + 0.45 * sin(uTime * (1.5 + vSeed * 2.0) + vSeed * 40.0);
  float core = smoothstep(1.0, 0.0, r);
  vec3 night = vec3(0.75, 1.0, 0.35) * core * core * tw * 1.6;
  vec3 day = vec3(1.0, 0.98, 0.9) * core * 0.5;
  float a = mix(core * 0.28, core * core * tw, uNight);
  gl_FragColor = vec4(mix(day, night, uNight), a);
}`;

export class Particles {
  constructor(scene, world) {
    this.world = world;
    this.density = 1;
    this.maxSmoke = 300; this.maxMotes = 360;
    this._acc = 0;
    // ---- smoke
    this.sPos = new Float32Array(this.maxSmoke * 3);
    this.sData = new Float32Array(this.maxSmoke * 4);
    this.sVel = new Float32Array(this.maxSmoke * 3);
    this.sLife = new Float32Array(this.maxSmoke);
    this.sCursor = 0;
    const gs = new THREE.BufferGeometry();
    gs.setAttribute('position', new THREE.BufferAttribute(this.sPos, 3).setUsage(THREE.DynamicDrawUsage));
    gs.setAttribute('aData', new THREE.BufferAttribute(this.sData, 4).setUsage(THREE.DynamicDrawUsage));
    this.smokeMat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: SMOKE_FRAG, transparent: true, depthWrite: false, uniforms: { uScale: { value: 300 }, uTone: { value: 0.7 } } });
    this.smoke = new THREE.Points(gs, this.smokeMat);
    this.smoke.frustumCulled = false; this.smoke.renderOrder = 5;
    scene.add(this.smoke);
    // ---- motes
    this.mPos = new Float32Array(this.maxMotes * 3);
    this.mData = new Float32Array(this.maxMotes * 4);
    this.mSeed = new Float32Array(this.maxMotes * 3);
    for (let i = 0; i < this.maxMotes; i++) {
      this.mSeed.set([Math.random(), Math.random(), Math.random()], i * 3);
      this.mData.set([0, 0.5 + Math.random() * 0.5, Math.random(), 1], i * 4);
    }
    const gm = new THREE.BufferGeometry();
    gm.setAttribute('position', new THREE.BufferAttribute(this.mPos, 3).setUsage(THREE.DynamicDrawUsage));
    gm.setAttribute('aData', new THREE.BufferAttribute(this.mData, 4).setUsage(THREE.DynamicDrawUsage));
    this.moteMat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: MOTE_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uScale: { value: 300 }, uNight: { value: 0 }, uTime: { value: 0 } } });
    this.motes = new THREE.Points(gm, this.moteMat);
    this.motes.frustumCulled = false; this.motes.renderOrder = 6;
    scene.add(this.motes);
    this.time = 0;
    this.setDensity(1);
  }

  setDensity(d) {
    this.density = d;
    this.smoke.visible = d > 0;
    this.moteCount = Math.round(this.maxMotes * d);
    this.motes.visible = d > 0;
    this.motes.geometry.setDrawRange(0, this.moteCount);
  }

  get activeSmoke() { let n = 0; for (let i = 0; i < this.maxSmoke; i++) if (this.sData[i * 4 + 3] > 0.5) n++; return n; }

  update(dt, buildings, env, wind) {
    if (this.density <= 0) return;
    this.time += dt;
    const day = env.state.dayAmt;
    this.smokeMat.uniforms.uTone.value = 0.22 + 0.62 * day;
    const scale = this.world.pipeline.pr * this.world.viewH * 0.9;
    this.smokeMat.uniforms.uScale.value = scale; this.moteMat.uniforms.uScale.value = scale;
    this.moteMat.uniforms.uNight.value = 1 - day; this.moteMat.uniforms.uTime.value = this.time;

    // emission
    const cap = Math.round(this.maxSmoke * this.density);
    let active = 0;
    const sd = this.sData, sp = this.sPos, sv = this.sVel, sl = this.sLife;
    for (let i = 0; i < this.maxSmoke; i++) {
      const o = i * 4;
      if (sd[o + 3] < 0.5) continue;
      const age = sd[o] + dt / sl[i];
      if (age >= 1) { sd[o + 3] = 0; continue; }
      sd[o] = age; active++;
      sd[o + 1] = 5 + age * 20;
      sp[i * 3] += (sv[i * 3] + wind * 1.2 * age) * dt; sp[i * 3 + 1] += sv[i * 3 + 1] * dt; sp[i * 3 + 2] += (sv[i * 3 + 2] + wind * 0.5 * age) * dt;
    }
    if (buildings) {
      this._acc += dt;
      const every = 0.16 / Math.max(0.2, this.density);
      while (this._acc > every) {
        this._acc -= every;
        for (const b of buildings.buildings.values()) {
          if (b.key !== 'factory_small' || active >= cap) continue;
          let slot = -1;
          for (let t = 0; t < this.maxSmoke; t++) { const i = (this.sCursor + t) % this.maxSmoke; if (sd[i * 4 + 3] < 0.5) { slot = i; break; } }
          if (slot < 0) break;
          this.sCursor = slot + 1; active++;
          sp[slot * 3] = b.x + (Math.random() - 0.5) * 0.6; sp[slot * 3 + 1] = b.y + 7; sp[slot * 3 + 2] = b.z + (Math.random() - 0.5) * 0.6;
          sv[slot * 3] = (Math.random() - 0.5) * 0.5; sv[slot * 3 + 1] = 1.6 + Math.random() * 0.8; sv[slot * 3 + 2] = (Math.random() - 0.5) * 0.5;
          sl[slot] = 4.5 + Math.random() * 2;
          sd[slot * 4] = 0; sd[slot * 4 + 1] = 5; sd[slot * 4 + 2] = Math.random(); sd[slot * 4 + 3] = 1;
        }
      }
    }
    this.smoke.geometry.attributes.position.needsUpdate = true;
    this.smoke.geometry.attributes.aData.needsUpdate = true;

    // motes drift in a box around the camera focus
    const f = this.world.rig.cur?.target ?? this.world.rig.camera.position;
    const R = 70, mp = this.mPos, ms = this.mSeed, t = this.time;
    for (let i = 0; i < this.moteCount; i++) {
      const sx = ms[i * 3], sy = ms[i * 3 + 1], sz = ms[i * 3 + 2];
      const wx = ((sx * 2 * R + t * (1.2 + sy) + Math.sin(t * 0.3 + sz * 9) * 2 - f.x + R * 3) % (2 * R)) - R + f.x;
      const wz = ((sz * 2 * R + t * 0.6 + Math.cos(t * 0.27 + sx * 9) * 2 - f.z + R * 3) % (2 * R)) - R + f.z;
      const wy = this.world.field.heightAt(wx, wz) + 0.8 + sy * 3.5 + Math.sin(t * 0.8 + sx * 20) * 0.4;
      mp[i * 3] = wx; mp[i * 3 + 1] = wy; mp[i * 3 + 2] = wz;
    }
    this.motes.geometry.attributes.position.needsUpdate = true;
  }
}
