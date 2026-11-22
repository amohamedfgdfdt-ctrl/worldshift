import * as THREE from 'three';
import {G,CELL,HALF,makeHeights,makeTerrain,makeTrees,refreshTerrain,uTime} from './terrain.js';
import {Water} from './water-system.js';
import {makeSky,makeClouds,drift} from './world.js';
import {setupCamera} from './camera.js';
import {Sim} from './simulation.js';
import {initUI} from './ui.js';
const canvas=document.getElementById('gl');
const renderer=new THREE.WebGLRenderer({canvas,antialias:devicePixelRatio<2});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;
const scene=new THREE.Scene();scene.fog=new THREE.Fog(0xc9dbe8,220,560);
const camera=new THREE.PerspectiveCamera(55,1,.5,1500);
scene.add(makeSky());
const envScene=new THREE.Scene();envScene.add(makeSky());
const env=new THREE.PMREMGenerator(renderer).fromScene(envScene).texture;
scene.add(new THREE.HemisphereLight(0xbcd6f0,0x4a4030,.9));
const sun=new THREE.DirectionalLight(0xfff1d6,2.4);sun.position.set(90,120,60);sun.castShadow=true;
sun.shadow.mapSize.set(innerWidth>800?2048:1024,innerWidth>800?2048:1024);Object.assign(sun.shadow.camera,{left:-120,right:120,top:120,bottom:-120,near:10,far:400});sun.shadow.bias=-.0005;sun.shadow.normalBias=.5;scene.add(sun);
const H=makeHeights(),water=new Water(H,env);
const ter=makeTerrain(H);scene.add(ter,water.mesh,makeTrees(H,water.W));
const clouds=makeClouds();scene.add(clouds);
const cam=setupCamera(camera,canvas),sim=new Sim(water);initUI({sim,water,cam});
function resize(){renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix()}
addEventListener('resize',resize);resize();
const clock=new THREE.Clock();
renderer.setAnimationLoop(()=>{const dt=Math.min(clock.getDelta(),.1);sim.update(dt);uTime.value=sim.time;water.update(sim.time);if(sim.running)drift(clouds,dt*sim.speed);cam.update(dt);renderer.render(scene,camera)});

const ray=new THREE.Raycaster(),mv=new THREE.Vector2();let down=null;
canvas.addEventListener('pointerdown',e=>down={x:e.clientX,y:e.clientY,t:performance.now()});
canvas.addEventListener('pointerup',e=>{if(!down||!sim.tool)return;const mvd=Math.hypot(e.clientX-down.x,e.clientY-down.y),el=performance.now()-down.t;down=null;if(mvd>8||el>350)return;
mv.set(e.clientX/innerWidth*2-1,-(e.clientY/innerHeight)*2+1);ray.setFromCamera(mv,camera);const hit=ray.intersectObject(ter)[0];if(!hit)return;
const ci=(hit.point.x+HALF)/CELL,cj=(hit.point.z+HALF)/CELL;let edit=false;
for(let j=Math.max(0,Math.floor(cj)-4);j<=Math.min(G-1,Math.ceil(cj)+4);j++)for(let i=Math.max(0,Math.floor(ci)-4);i<=Math.min(G-1,Math.ceil(ci)+4);i++){
const f=Math.exp(-((i-ci)**2+(j-cj)**2)/6),a=j*G+i;
if(sim.tool=='pour')water.W[a]+=3*f;else if(sim.tool=='dig'){H[a]=Math.max(.5,H[a]-1.2*f);edit=true}else{H[a]=Math.min(45,H[a]+1.2*f);edit=true}}
if(edit)refreshTerrain(ter,H)});
