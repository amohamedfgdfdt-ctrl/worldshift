// Render pipeline. Two real paths:
//  - direct:   scene -> canvas (used when AA, AO and post-processing are all off)
//  - composer: scene -> HDR render target (optional MSAA) -> [GTAO] -> [bloom]
//              -> [grade + light shafts] -> tone-map/sRGB -> [FXAA | SMAA] -> canvas
import * as THREE from '../vendor/three.module.min.js';
import { EffectComposer } from '../vendor/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from '../vendor/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from '../vendor/jsm/postprocessing/OutputPass.js';
import { UnrealBloomPass } from '../vendor/jsm/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from '../vendor/jsm/postprocessing/GTAOPass.js';
import { SMAAPass } from '../vendor/jsm/postprocessing/SMAAPass.js';
import { FXAAShader } from '../vendor/jsm/shaders/FXAAShader.js';

const GradeShader = {
  name: 'TerraGrade',
  uniforms: {
    tDiffuse: { value: null },
    uSun: { value: new THREE.Vector2(0.5, 0.5) },
    uSunVis: { value: 0 },
    uShafts: { value: 0 },
    uVignette: { value: 0.28 },
    uSat: { value: 1.06 },
    uContrast: { value: 1.04 },
    uWarm: { value: new THREE.Vector3(1.0, 0.99, 0.97) },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform vec2 uSun; uniform float uSunVis, uShafts, uVignette, uSat, uContrast;
    uniform vec3 uWarm; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb;
      if (uShafts > 0.001 && uSunVis > 0.001) {
        vec2 dir = (uSun - vUv); float len = length(dir);
        vec2 stepv = dir / 20.0 * 0.85;
        vec2 p = vUv; float w = 1.0; vec3 acc = vec3(0.0);
        for (int i = 0; i < 20; i++) {
          p += stepv;
          vec3 s = texture2D(tDiffuse, clamp(p, 0.001, 0.999)).rgb;
          float l = max(dot(s, vec3(0.3, 0.55, 0.15)) - 1.1, 0.0);
          acc += s * l * w; w *= 0.93;
        }
        float fall = smoothstep(1.4, 0.0, len);
        col += acc * (uShafts * uSunVis * fall * 0.055);
      }
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSat);
      col = (col - 0.5) * uContrast + 0.5;
      col *= uWarm;
      vec2 q = vUv - 0.5; float v = dot(q, q);
      col *= 1.0 - uVignette * smoothstep(0.08, 0.5, v);
      gl_FragColor = vec4(max(col, 0.0), c.a);
    }`,
};

export class RenderPipeline {
  constructor(world) {
    this.world = world;
    this.renderer = world.renderer;
    this.scene = world.scene;
    this.mode = 'direct';
    this.cfg = { aa: 'off', ao: 0, post: 0, volumetric: 0 };
    this.composer = null;
    this.passes = {};
    this.pr = 1;
    this.w = 1; this.h = 1;
    this.lastRenderMs = 0;
    this._tmp = new THREE.Vector3();
  }

  get camera() { return this.world.rig.camera; }

  needsComposer(c) { return c.aa !== 'off' || c.ao > 0 || c.post > 0 || c.volumetric >= 2; }

  configure(c, caps) {
    const next = { aa: c.aa, ao: c.ao, post: c.post, volumetric: c.volumetric };
    const same = JSON.stringify(next) === JSON.stringify(this.cfg) && (this.composer || !this.needsComposer(next));
    if (same) return;
    this.cfg = next;
    this.dispose();
    if (!this.needsComposer(next) || !caps.float) { this.mode = 'direct'; return; }
    this.mode = 'composer';
    const r = this.renderer;
    const samples = next.aa === 'msaa' ? Math.min(4, caps.maxSamples) : 0;
    const rt = new THREE.WebGLRenderTarget(this.w * this.pr, this.h * this.pr, {
      type: THREE.HalfFloatType, samples, depthBuffer: true,
    });
    const composer = new EffectComposer(r, rt);
    composer.setPixelRatio(1);
    this.composer = composer;
    const P = this.passes = {};
    P.render = new RenderPass(this.scene, this.camera);
    composer.addPass(P.render);
    if (next.ao > 0) {
      const g = new GTAOPass(this.scene, this.camera, this.w * this.pr, this.h * this.pr);
      g.output = GTAOPass.OUTPUT.Default;
      g.updateGtaoMaterial({ radius: next.ao === 2 ? 4 : 3, distanceExponent: 1.5, thickness: 2, scale: 1.1, samples: next.ao === 2 ? 16 : 8, distanceFallOff: 1, screenSpaceRadius: false });
      g.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: next.ao === 2 ? 6 : 4, rings: 2, samples: next.ao === 2 ? 16 : 8 });
      g.blendIntensity = 0.85;
      // sky, water and grass must not take part in the AO depth/normal pass
      const orig = g.render.bind(g);
      g.render = (...a) => {
        const w = this.world, hide = [w.env.sky, w.waterMesh.mesh, w.vegetation.sets.grass.mesh, w.vegetation.sets.flower.mesh, w.vegetation.sets.reed.mesh, w.particles.smoke, w.particles.motes];
        const vis = hide.map((m) => m.visible);
        hide.forEach((m) => { m.visible = false; });
        const fog = this.scene.fog; this.scene.fog = null;
        orig(...a);
        this.scene.fog = fog;
        hide.forEach((m, i) => { m.visible = vis[i]; });
      };
      P.ao = g; composer.addPass(g);
    }
    if (next.post > 0) {
      P.bloom = new UnrealBloomPass(new THREE.Vector2(this.w * this.pr, this.h * this.pr), 0.22, 0.65, 0.92);
      composer.addPass(P.bloom);
    }
    if (next.post > 0 || next.volumetric >= 2) {
      P.grade = new ShaderPass(GradeShader);
      if (!next.post) { P.grade.uniforms.uVignette.value = 0; P.grade.uniforms.uSat.value = 1; P.grade.uniforms.uContrast.value = 1; }
      composer.addPass(P.grade);
    }
    P.out = new OutputPass();
    composer.addPass(P.out);
    if (next.aa === 'fxaa') {
      P.fxaa = new ShaderPass(FXAAShader);
      composer.addPass(P.fxaa);
    } else if (next.aa === 'smaa') {
      P.smaa = new SMAAPass(this.w * this.pr, this.h * this.pr);
      composer.addPass(P.smaa);
    }
    this._resizeInternal();
  }

  /** css size + total pixel ratio */
  setSize(w, h, pr) {
    this.w = w; this.h = h; this.pr = pr;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this._resizeInternal();
  }

  _resizeInternal() {
    if (!this.composer) return;
    const W = Math.max(1, Math.floor(this.w * this.pr)), H = Math.max(1, Math.floor(this.h * this.pr));
    this.composer.setPixelRatio(1);
    this.composer.setSize(W, H);
    const P = this.passes;
    if (P.fxaa) P.fxaa.material.uniforms.resolution.value.set(1 / W, 1 / H);
    if (P.ao) P.ao.setSize(W, H);
    if (P.smaa) P.smaa.setSize(W, H);
    if (P.bloom) P.bloom.setSize(W, H);
  }

  render(dt) {
    const cam = this.camera;
    const wm = this.world.waterMesh;
    if (wm.reflQ >= 2) {
      // the reflection only needs the big shapes: skip grass, flowers, reeds, bushes, rocks and particles
      const v = this.world.vegetation.sets, p = this.world.particles;
      const hide = [v.grass.mesh, v.flower.mesh, v.reed.mesh, v.bush.mesh, v.rock.mesh, p.smoke, p.motes];
      const vis = hide.map((m) => m.visible);
      hide.forEach((m) => { m.visible = false; });
      wm.renderReflection(this.renderer, this.scene, cam, this.pr);
      hide.forEach((m, i) => { m.visible = vis[i]; });
    }
    if (this.mode === 'direct') {
      this.renderer.render(this.scene, cam);
      return;
    }
    const P = this.passes;
    P.render.camera = cam;
    if (P.ao) P.ao.camera = cam;
    if (P.grade) {
      const env = this.world.env;
      const v = this._tmp.copy(cam.position).addScaledVector(env.sunDir, 500).project(cam);
      const u = P.grade.uniforms;
      u.uSun.value.set(v.x * 0.5 + 0.5, v.y * 0.5 + 0.5);
      const front = v.z < 1 && Math.abs(v.x) < 1.6 && Math.abs(v.y) < 1.6 ? 1 : 0;
      u.uSunVis.value = front * Math.max(0, Math.min(1, (env.state.elevation + 0.02) * 4));
      u.uShafts.value = this.cfg.volumetric >= 2 ? 1 : 0;
    }
    this.composer.render(dt);
  }

  dispose() {
    if (this.composer) {
      for (const p of this.composer.passes) p.dispose?.();
      this.composer.renderTarget1?.dispose();
      this.composer.renderTarget2?.dispose();
      this.composer = null;
    }
    this.passes = {};
  }
}
