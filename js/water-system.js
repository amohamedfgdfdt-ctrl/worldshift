import * as THREE from 'three';
import {G,SIZE,LAKE} from './terrain.js';
function ripple(){const S=128,c=document.createElement('canvas');c.width=c.height=S;const x=c.getContext('2d'),d=x.createImageData(S,S),k=2*Math.PI/S;
const h=(i,j)=>Math.sin(k*3*i)*.5+Math.sin(k*5*j+1)*.5+Math.sin(k*(2*i+3*j))*.5+Math.sin(k*(7*i-4*j))*.25;
for(let j=0;j<S;j++)for(let i=0;i<S;i++){const dx=(h(i+1,j)-h(i-1,j))*3,dy=(h(i,j+1)-h(i,j-1))*3,l=Math.hypot(dx,dy,1);
d.data.set([(-dx/l*.5+.5)*255,(-dy/l*.5+.5)*255,(1/l*.5+.5)*255,255],(j*S+i)*4)}
x.putImageData(d,0,0);const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(30,30);return t}
export class Water{
constructor(H,envMap){this.H=H;this.W=new Float32Array(G*G);this.d=new Float32Array(G*G);
this.src=Math.round(.04*(G-1))*G+Math.round(.426*(G-1));this.srcOn=true;this.rate=.5;this.flow=1;
const geo=new THREE.PlaneGeometry(SIZE,SIZE,G-1,G-1);geo.rotateX(-Math.PI/2);
geo.setAttribute('color',new THREE.BufferAttribute(new Float32Array(G*G*3),3));this.col=geo.attributes.color;
this.nm=ripple();
this.mesh=new THREE.Mesh(geo,new THREE.MeshPhysicalMaterial({vertexColors:true,roughness:.04,transparent:true,opacity:.88,envMap,envMapIntensity:1.4,clearcoat:1,normalMap:this.nm,normalScale:new THREE.Vector2(.5,.5)}));
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
update(t){const p=this.pos,c=this.col.array,{H,W}=this;
for(let j=0;j<G;j++)for(let i=0;i<G;i++){const a=j*G+i,w=W[a];
if(w>.04){p.setY(a,H[a]+w+Math.sin(t*1.6+i*.5+j*.35)*.05*Math.min(1,w));
const f=Math.min(w/6,1),fm=(1-Math.min(w/.3,1))*.6;
c[a*3]=.35-.3*f+(.9-(.35-.3*f))*fm;c[a*3+1]=.75-.55*f+(.95-(.75-.55*f))*fm;c[a*3+2]=.78-.38*f+(.95-(.78-.38*f))*fm}
else p.setY(a,H[a]-.15)}
p.needsUpdate=true;this.col.needsUpdate=true;this.nm.offset.set(t*.015,t*.01);this.mesh.geometry.computeVertexNormals()}}
