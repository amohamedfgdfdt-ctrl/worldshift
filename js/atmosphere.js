// Atmospheric fog: replaces three.js' fog shader chunks with a version that
// adds height-based density and sun in-scatter. All lit materials pick it up
// automatically. Importing this module installs the chunks, so it must be
// imported before any material is compiled.
import * as THREE from '../vendor/three.module.min.js';

export const atmUniforms = {
  uAtmA: { value: new THREE.Vector4(0.06, 0, 0, 0) },   // x height falloff, y scatter, z camera y, w height-fog on
  uAtmUp: { value: new THREE.Vector3(0, 1, 0) },        // world up in view space
  uAtmSun: { value: new THREE.Vector3(0, 1, 0) },       // sun direction in view space
  uAtmSunCol: { value: new THREE.Color(1, 0.9, 0.7) },
};

const C = THREE.ShaderChunk;
C.fog_pars_vertex = `#ifdef USE_FOG
varying float vFogDepth;
varying vec3 vFogView;
#endif`;
C.fog_vertex = `#ifdef USE_FOG
vFogDepth = - mvPosition.z;
vFogView = mvPosition.xyz;
#endif`;
C.fog_pars_fragment = `#ifdef USE_FOG
uniform vec3 fogColor;
varying float vFogDepth;
varying vec3 vFogView;
#ifdef FOG_EXP2
uniform float fogDensity;
#else
uniform float fogNear;
uniform float fogFar;
#endif
uniform vec4 uAtmA;
uniform vec3 uAtmUp;
uniform vec3 uAtmSun;
uniform vec3 uAtmSunCol;
#endif`;
C.fog_fragment = `#ifdef USE_FOG
#ifdef FOG_EXP2
float fogK = 1.0;
vec3 fogC = fogColor;
if (uAtmA.w > 0.5) {
  float wy = uAtmA.z + dot(vFogView, uAtmUp);
  float my = 0.5 * (uAtmA.z + wy);
  fogK = 0.3 + 1.7 * uAtmA.w * exp(-max(my - 3.0, 0.0) * uAtmA.x);
}
float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth * fogK );
if (uAtmA.y > 0.001) {
  float s = pow(max(dot(normalize(vFogView), uAtmSun), 0.0), 7.0);
  fogC = mix(fogC, uAtmSunCol, clamp(s * uAtmA.y * fogFactor * 1.3, 0.0, 0.85));
}
#else
float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
vec3 fogC = fogColor;
#endif
gl_FragColor.rgb = mix( gl_FragColor.rgb, fogC, fogFactor );
#endif`;

/** Add the atmosphere uniforms to a shader that is being compiled. */
export function injectAtmosphere(shader) {
  if (shader.fragmentShader.includes('uAtmA')) Object.assign(shader.uniforms, atmUniforms);
}
// default for every material that doesn't define its own hook
THREE.Material.prototype.onBeforeCompile = function (shader) { injectAtmosphere(shader); };

const _v = new THREE.Vector3();
/** level: 0 off, 1 height fog + scatter, 2 same (+ shafts handled by the pipeline) */
export function updateAtmosphere(camera, env, level) {
  const u = atmUniforms;
  // dawn / dusk ground mist: when the sun sits near the horizon, the height-fog
  // term strengthens and thins out more slowly with altitude, so valleys hold a
  // visible mist band in the early morning and around sunset
  const e = env.state.elevation ?? 1;
  const mist = level >= 1 ? Math.min(1, Math.max(0, 1 - Math.abs(e - 0.06) / 0.18)) : 0;
  u.uAtmA.value.set(0.07 - 0.03 * mist, level >= 1 ? 0.85 * env.state.dayAmt : 0, camera.position.y, level >= 1 ? 1 + mist * 1.8 : 0);
  _v.set(0, 1, 0).transformDirection(camera.matrixWorldInverse);
  u.uAtmUp.value.copy(_v);
  u.uAtmSun.value.copy(env.sunDir).transformDirection(camera.matrixWorldInverse);
  u.uAtmSunCol.value.copy(env.state.sunColor);
}

