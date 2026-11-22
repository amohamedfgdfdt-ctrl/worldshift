import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
export function setupCamera(camera,dom){const c=new OrbitControls(camera,dom);
c.enableDamping=true;c.dampingFactor=.08;c.maxPolarAngle=Math.PI*.48;c.minDistance=20;c.maxDistance=260;
c.touches={ONE:THREE.TOUCH.ROTATE,TWO:THREE.TOUCH.DOLLY_PAN};
const home={p:new THREE.Vector3(110,95,130),t:new THREE.Vector3(0,5,0)};let tw=null;
camera.position.copy(home.p);c.target.copy(home.t);
return{controls:c,reset(){tw={p0:camera.position.clone(),t0:c.target.clone(),k:0}},
update(dt){if(tw){tw.k=Math.min(1,tw.k+dt*1.6);const e=tw.k*tw.k*(3-2*tw.k);camera.position.lerpVectors(tw.p0,home.p,e);c.target.lerpVectors(tw.t0,home.t,e);if(tw.k>=1)tw=null}c.update()}}}
