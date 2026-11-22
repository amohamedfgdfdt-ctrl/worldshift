import * as THREE from 'three';
export function makeSky(){return new THREE.Mesh(new THREE.SphereGeometry(900,24,16),new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,fog:false,
vertexShader:'varying vec3 p;void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
fragmentShader:'varying vec3 p;void main(){float h=normalize(p).y;vec3 z=vec3(.14,.38,.74),r=vec3(.82,.88,.94);vec3 c=mix(r,z,pow(clamp(h,0.,1.),.55));float s=max(dot(normalize(p),normalize(vec3(90.,120.,60.))),0.);c+=vec3(1.,.85,.6)*(pow(s,700.)*3.+pow(s,10.)*.3);gl_FragColor=vec4(c,1.);}'}))}
export function makeClouds(){const g=new THREE.Group(),geo=new THREE.SphereGeometry(1,10,8),mat=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.8,fog:false,depthWrite:false});
for(let c=0;c<12;c++){const cl=new THREE.Group();
for(let k=0;k<5;k++){const m=new THREE.Mesh(geo,mat);m.scale.set(10+Math.random()*10,4+Math.random()*3,8+Math.random()*6);m.position.set(k*9-18,Math.random()*3,Math.random()*8);cl.add(m)}
cl.position.set((Math.random()-.5)*600,95+Math.random()*30,(Math.random()-.5)*600);g.add(cl)}return g}
export function drift(g,dt){g.children.forEach(c=>{c.position.x+=dt*3;if(c.position.x>320)c.position.x=-320})}
