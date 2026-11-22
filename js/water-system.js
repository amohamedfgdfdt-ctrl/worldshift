import * as THREE from 'three';
import {G,SIZE,LAKE} from './terrain.js';
export class Water{
constructor(H,envMap){this.H=H;this.W=new Float32Array(G*G);this.d=new Float32Array(G*G);
this.src=Math.round(.04*(G-1))*G+Math.round(.426*(G-1));this.srcOn=true;this.rate=.5;this.flow=1;
const geo=new THREE.PlaneGeometry(SIZE,SIZE,G-1,G-1);geo.rotateX(-Math.PI/2);
this.mesh=new THREE.Mesh(geo,new THREE.MeshPhysicalMaterial({color:0x1f78b4,roughness:.06,transparent:true,opacity:.8,envMap,envMapIntensity:1.2,clearcoat:1}));
this.pos=geo.attributes.position;this.reset()}
reset(){const {H,W}=this,c=LAKE,L=H[Math.round(c.y*(G-1))*G+Math.round(c.x*(G-1))]+c.depth;W.fill(0);
for(let j=0;j<G;j++)for(let i=0;i<G;i++){const a=j*G+i,dx=i/(G-1)-c.x,dy=j/(G-1)-c.y;if(dx*dx+dy*dy<c.r*c.r&&H[a]<L)W[a]=L-H[a]}
this.update(0)}
rain(){for(let k=0;k<300;k++)this.W[Math.random()*G*G|0]+=.5}
step(){const {H,W,d}=this,O=[1,-1,G,-G];d.fill(0);if(this.srcOn)W[this.src]+=this.rate*.4;
for(let j=0;j<G;j++)for(let i=0;i<G;i++){const a=j*G+i,w=W[a];if(w<.002)continue;const la=H[a]+w;
for(let k=0;k<4;k++){if(k==0&&i==G-1||k==1&&i==0||k==2&&j==G-1||k==3&&j==0)continue;
const b=a+O[k],df=la-H[b]-W[b];if(df>0){const f=Math.min(w/4,df/4);d[a]-=f;d[b]+=f}}}
for(let j=0;j<G;j++)for(let i=0;i<G;i++){const a=j*G+i;let v=W[a]+d[a];if(i==0||j==0||i==G-1||j==G-1)v*=.9;W[a]=v<0?0:v*.9998}}
update(t){const p=this.pos,{H,W}=this;
for(let j=0;j<G;j++)for(let i=0;i<G;i++){const a=j*G+i,w=W[a];p.setY(a,w>.04?H[a]+w+Math.sin(t*1.6+i*.5+j*.35)*.05*Math.min(1,w):H[a]-.15)}
p.needsUpdate=true;this.mesh.geometry.computeVertexNormals()}}
