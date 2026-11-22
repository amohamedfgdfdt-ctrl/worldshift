import * as THREE from 'three';
export const G=96,SIZE=200,CELL=SIZE/(G-1),HALF=SIZE/2;
export const LAKE={x:.72,y:.7,r:.2,depth:5};
const sm=(a,b,x)=>{x=Math.min(1,Math.max(0,(x-a)/(b-a)));return x*x*(3-2*x)};
const h2=(x,y)=>{const s=Math.sin(x*127.1+y*311.7)*43758.5453;return s-Math.floor(s)};
function vn(x,y){const xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi,u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf);
return h2(xi,yi)*(1-u)*(1-v)+h2(xi+1,yi)*u*(1-v)+h2(xi,yi+1)*(1-u)*v+h2(xi+1,yi+1)*u*v}
function fbm(x,y){let a=1,f=1,s=0,n=0;for(let i=0;i<5;i++){s+=vn(x*f,y*f)*a;n+=a;a*=.5;f*=2}return s/n}
export function makeHeights(){const H=new Float32Array(G*G);
for(let j=0;j<G;j++)for(let i=0;i<G;i++){const x=i/(G-1),y=j/(G-1);
let h=fbm(x*4,y*4)*22+(1-y)*14+Math.pow(1-y,2)*14;
const d=x-(.4+.1*Math.sin(y*6.5));h-=13*Math.exp(-d*d/.0025)*(.4+.6*(1-y));
const lx=x-LAKE.x,ly=y-LAKE.y;h-=13*Math.exp(-(lx*lx+ly*ly)/.012);
H[j*G+i]=Math.max(.5,h)}return H}
const slope=(H,i,j)=>Math.abs(H[j*G+Math.min(G-1,i+1)]-H[j*G+Math.max(0,i-1)])+Math.abs(H[Math.min(G-1,j+1)*G+i]-H[Math.max(0,j-1)*G+i]);
export function makeTerrain(H){const geo=new THREE.PlaneGeometry(SIZE,SIZE,G-1,G-1);geo.rotateX(-Math.PI/2);
const p=geo.attributes.position,col=new Float32Array(p.count*3),c=new THREE.Color();
const [sand,g1,g2,rock,snow]=[0xd9c38f,0x5f8f3a,0x4a7530,0x7d7468,0xf2f4f6].map(x=>new THREE.Color(x));
for(let n=0;n<p.count;n++){const i=n%G,j=n/G|0,h=H[n];p.setY(n,h);
c.copy(g1).lerp(g2,vn(i*.5,j*.5)).lerp(sand,1-sm(5,8,h)).lerp(rock,sm(5,9,slope(H,i,j))).lerp(rock,sm(24,30,h)).lerp(snow,sm(34,40,h));
col.set([c.r,c.g,c.b],n*3)}
geo.setAttribute('color',new THREE.BufferAttribute(col,3));geo.computeVertexNormals();
const m=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1}));m.receiveShadow=true;return m}
export function makeTrees(H,W){const MAX=420,geoT=new THREE.CylinderGeometry(.25,.35,2.4,5).translate(0,1.2,0),geoF=new THREE.ConeGeometry(1.7,5,6).translate(0,4.6,0);
const tr=new THREE.InstancedMesh(geoT,new THREE.MeshStandardMaterial({color:0x5a3d28}),MAX),fo=new THREE.InstancedMesh(geoF,new THREE.MeshStandardMaterial({roughness:.9}),MAX);
const m=new THREE.Matrix4(),col=new THREE.Color(),v=new THREE.Vector3();let n=0;
for(let t=0;t<5000&&n<MAX;t++){const i=1+Math.random()*(G-3)|0,j=1+Math.random()*(G-3)|0,a=j*G+i,h=H[a];
if(h<8||h>26||W[a]>0||slope(H,i,j)>3)continue;const s=.7+Math.random()*.7;
m.makeRotationY(Math.random()*6.28).scale(v.set(s,s,s)).setPosition(-HALF+i*CELL,h,-HALF+j*CELL);
tr.setMatrixAt(n,m);fo.setMatrixAt(n,m);fo.setColorAt(n,col.setHSL(.27+Math.random()*.06,.5,.2+Math.random()*.1));n++}
tr.count=fo.count=n;tr.castShadow=fo.castShadow=true;const g=new THREE.Group();g.add(tr,fo);return g}
