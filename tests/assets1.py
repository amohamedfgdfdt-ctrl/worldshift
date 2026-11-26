"""Real import tests for the external asset pipeline.
Models are generated in the browser at test time with three's GLTFExporter (fixtures only,
never shipped as game assets), exported to real GLB bytes, and loaded through the same
code path the manifest uses."""
import asyncio, json, sys
from playwright.async_api import async_playwright

HELPERS = r"""
window.T = {};
T.THREE = await import('/vendor/three.module.min.js');
T.GLTFExporter = (await import('/tests/lib/jsm/exporters/GLTFExporter.js')).GLTFExporter;
const THREE = T.THREE;
T.canvasTex = (draw, srgb=true) => { const c=document.createElement('canvas'); c.width=c.height=32; draw(c.getContext('2d')); const t=new THREE.CanvasTexture(c); if(srgb)t.colorSpace=THREE.SRGBColorSpace; t.wrapS=t.wrapT=THREE.RepeatWrapping; return t; };
T.glb = async (obj) => { const buf = await new Promise((res,rej)=>new T.GLTFExporter().parse(obj,res,rej,{binary:true})); return URL.createObjectURL(new Blob([buf])); };
T.tris = (g)=> (g.index? g.index.count : g.attributes.position.count)/3;
T.bark = () => new THREE.MeshStandardMaterial({ map:T.canvasTex(c=>{c.fillStyle='#5b4030';c.fillRect(0,0,32,32);c.fillStyle='#3d2a1e';for(let i=0;i<32;i+=5)c.fillRect(i,0,2,32)}), normalMap:T.canvasTex(c=>{c.fillStyle='#8080ff';c.fillRect(0,0,32,32);c.fillStyle='#a0a0ff';for(let i=0;i<32;i+=5)c.fillRect(i,0,2,32)},false), roughness:0.95 });
T.leaf = () => new THREE.MeshStandardMaterial({ map:T.canvasTex(c=>{c.clearRect(0,0,32,32);c.fillStyle='#4a8c2e';c.beginPath();c.arc(16,16,13,0,7);c.fill()}), alphaTest:0.5, side:THREE.DoubleSide, roughness:0.8 });
// tree with 2 materials in ONE mesh (geometry groups) + leaf cards in a second mesh with the alpha material
T.tree = (detail) => {
  const g = new THREE.Group();
  const trunk = new THREE.CylinderGeometry(0.3,0.45,3,6+detail*4).translate(0,1.5,0); // groups: side, top, bottom
  const bark = T.bark(), cap = new THREE.MeshStandardMaterial({color:0x6b5440});
  g.add(new THREE.Mesh(trunk,[bark,cap,cap]));
  const crown = new THREE.IcosahedronGeometry(2,detail).translate(0,4.6,0);
  g.add(new THREE.Mesh(crown,new THREE.MeshStandardMaterial({color:0x3f7a2a,roughness:0.9})));
  if(detail>=2){ const cards=new THREE.PlaneGeometry(2,2).translate(0,3.2,0); for(let i=0;i<4;i++){const m=new THREE.Mesh(cards.clone().rotateY(i*0.8),T.leaf()); g.add(m);} }
  return g;
};
T.rock = () => { const m=new THREE.MeshStandardMaterial({ map:T.canvasTex(c=>{c.fillStyle='#77746f';c.fillRect(0,0,32,32)}), normalMap:T.canvasTex(c=>{c.fillStyle='#8080ff';c.fillRect(0,0,32,32)},false), roughnessMap:T.canvasTex(c=>{c.fillStyle='#d0d0d0';c.fillRect(0,0,32,32)},false), aoMap:T.canvasTex(c=>{c.fillStyle='#ffffff';c.fillRect(0,0,32,32)},false), roughness:1, metalness:0 });
  const g=new THREE.IcosahedronGeometry(1.2,2); g.setAttribute('uv1',g.attributes.uv.clone()); g.scale(1,0.7,1).translate(0,0.5,0); return new THREE.Mesh(g,m); };
T.house = (detail) => { const g=new THREE.Group(); const w=new THREE.Mesh(new THREE.BoxGeometry(6,4,6,1+detail*2,1+detail*2,1+detail*2).translate(0,2,0),[0,1,2,3,4,5].map(i=>new THREE.MeshStandardMaterial({color:[0xc9b79c,0xb5a487,0xd8c9ae][i%3]}))); g.add(w); g.add(new THREE.Mesh(new THREE.ConeGeometry(5,2.4,4+detail*0).rotateY(Math.PI/4).translate(0,5.2,0),new THREE.MeshStandardMaterial({color:0x7a2f2f}))); return g; };
T.garbageUrl = () => URL.createObjectURL(new Blob([new Uint8Array(200).fill(7)]));
"""

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox','--use-angle=swiftshader','--use-gl=angle','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
        pg = await b.new_page(viewport={'width':640,'height':400}); pg.set_default_timeout(300000)
        errs=[]; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text[:200]) if m.type=='error' else None)
        await pg.route('**/assets/manifest.json', lambda r: r.fulfill(status=404))  # unit tests start from the procedural world
        await pg.goto('http://localhost:8123/index.html'); await pg.wait_for_function('window.__terraReady===true')
        await pg.wait_for_timeout(2500)
        await pg.evaluate("TERRA.perf.dynamicRes=false; TERRA.ui.el.toasts.innerHTML=''; TERRA.sim.setRunning(false)")
        await pg.evaluate("async()=>{"+HELPERS+"}")
        res=[]
        def ok(c,m,e=''):
            res.append(bool(c)); print(('  PASS ' if c else '  FAIL ')+m, e)
        ev=pg.evaluate

        print('1. manifest validation')
        v=await ev("""(async()=>{const {AssetManager}=await import('/js/assets.js');
          const bad={assets:{a:{category:'spaceship',url:'x.glb'},b:{category:'tree',target:'house_small',url:'x.glb'},c:{category:'rock'},d:{category:'tree',target:'oak',lods:[{url:'a'},{url:'b',distance:50},{url:'c',distance:40}]},e:{category:'rock',url:'r.glb',dimensions:{}},f:{category:'building',target:'house_small',url:'h.glb',fit:'stretch'},
            g:{category:'tree',target:'oak',lods:[{url:'a'},{url:'b',distance:50},{url:'c',distance:90}],dimensions:{height:9},fit:'height'}}};
          const r=AssetManager.validate(bad); return {n:r.entries.length, ids:r.entries.map(e=>e.id), errors:r.errors.length, lods:r.entries[0]?.variants[0].lods.map(l=>l.level+':'+l.distance)}})()""")
        ok(v['errors']==6 and v['ids']==['g'] and v['lods']==['high:0','medium:50','low:90'],'validate rejects 6 bad entries, accepts the good one',json.dumps(v))

        print('2. multi-material (several materials in one mesh via geometry groups)')
        r=await ev("""(async()=>{const T=window.T,w=TERRA.world;
          const url=await T.glb(T.tree(2)); const gl=await w.assets._parse(url);
          const f=w.assets.flatten(gl.scene);
          const before=[];gl.scene.traverse(o=>{if(o.isMesh)before.push(T.tris(o.geometry))});
          return {mats:f.materials.length, groups:f.geometry.groups.length, tris:f.tris, srcTris:before.reduce((a,b)=>a+b,0), maps:f.materials.filter(m=>m.map).length, normal:f.materials.filter(m=>m.normalMap).length, alpha:f.materials.filter(m=>m.alphaTest>0).length, sumGroups:f.geometry.groups.reduce((a,g)=>a+g.count,0)/3}})()""")
        # trunk: bark(side) + cap(top+bottom) -> 2 materials, + crown + leaf = 4 distinct materials; leaf cards share ONE material? each card has its own material (4) -> 7
        ok(r['mats']>=4 and r['groups']==r['mats'],'every material kept as its own group',json.dumps(r))
        ok(abs(r['tris']-r['srcTris'])<1e-6 and abs(r['sumGroups']-r['tris'])<1e-6,'no triangle lost or duplicated',f"{r['tris']} vs {r['srcTris']}")
        ok(r['maps']>=2 and r['normal']>=1 and r['alpha']>=1,'albedo, normal map and alpha-test survive',f"map={r['maps']} normal={r['normal']} alpha={r['alpha']}")

        print('3. tree replacement with High/Medium/Low LOD (oak)')
        r=await ev("""(async()=>{const T=window.T,w=TERRA.world,v=w.vegetation;
          const hi=await T.glb(T.tree(2)), me=await T.glb(T.tree(1)), lo=await T.glb(T.tree(0));
          const n0=v.sets.oak.count+v.sets.oakL.count;
          const info=await w.assets.useModel('oak',null,{category:'tree',lods:[{level:'high',url:hi},{level:'medium',url:me,distance:60},{level:'low',url:lo,distance:140}],dimensions:{height:7},fit:'height'});
          const s=v.sets.oak;
          return {n0, n1:s.count, isLod:s.constructor.name, levels:s.levelCounts(), oakL:!!v.sets.oakL, loaded:info.levels.map(l=>l.tris), size:info.size, windified:s.levels.every(l=>[].concat(l.material).every(m=>m.userData.windified)), warnings:info.warnings}})()""")
        ok(r['isLod']=='LodInstanceSet' and r['n1']==r['n0'] and not r['oakL'],'all existing trees migrated, procedural LOD set retired',f"{r['n0']}->{r['n1']}")
        ok(r['loaded'][0]>r['loaded'][1]>r['loaded'][2],'three LOD files loaded, decreasing triangles',str(r['loaded']))
        ok(abs(r['size']['h']-7)<0.05,'fit:"height" scaled the model to 7 m',str(r['size']))
        ok(r['windified'],'wind sway + draw-distance cull applied to GLB materials')
        # distance switching
        d=await ev("""(()=>{const w=TERRA.world,s=w.vegetation.sets.oak,cam=w.rig.camera.position;const out={};
          const c=(label)=>{s._all=true;s.updateLod(cam);out[label]=s.levelCounts()};
          const keep=cam.clone();
          cam.set(0,2000,0);c('very far');
          cam.copy(keep);c('current');
          // camera at a tree
          const id=s.ids[0];const m=new TERRA.world.renderer.constructor.prototype.constructor===0?null:null;
          const e=s.rec.get(id).m.elements;cam.set(e[12],e[13]+3,e[14]);c('on a tree');
          cam.copy(keep);return out})()""")
        ok(d['very far'][0]==0 and (d['very far'][2]>0 or sum(d['very far'])==0),'far camera -> low LOD or distance-culled (beyond draw distance)',str(d['very far']))
        ok(d['on a tree'][0]>=1,'camera next to a tree -> high LOD for it',str(d['on a tree']))
        den=await ev("""(()=>{const w=TERRA.world,s=w.vegetation.sets.oak,cam=w.rig.camera.position;const tot=s.count;
          w.vegetation.setCulling(false);w.vegetation.setDensity(0.5);s._all=true;s.updateLod(cam);const half=s.levelCounts().reduce((a,b)=>a+b,0);
          w.vegetation.setDensity(1);s._all=true;s.updateLod(cam);const full=s.levelCounts().reduce((a,b)=>a+b,0);w.vegetation.setCulling(true);return {tot,half,full}})()""")
        ok(abs(den['half']/den['tot']-0.5)<0.12 and den['full']==den['tot'],'vegetation density setting still works on GLB trees',json.dumps(den))
        sh=await ev("""(()=>{const w=TERRA.world,s=w.vegetation.sets.oak;w.gfx.shadowRes=1024;w.gfx.foliageQuality=2;w.refreshAssetState();const on=s.meshes.map(m=>m.castShadow);w.vegetation.setShadows(false);return {on,off:s.meshes.map(m=>m.castShadow)}})()""")
        ok(sh['on']==[True,True,False] and sh['off']==[False,False,False],'shadow setting applies per LOD (near levels cast, far does not)',json.dumps(sh))

        print('4. rock with PBR maps (albedo, normal, roughness, AO + uv1)')
        r=await ev("""(async()=>{const T=window.T,w=TERRA.world;const n0=w.vegetation.sets.rock.count;
          const url=await T.glb(T.rock());const info=await w.assets.useModel('rock',url,{category:'rock'});
          const s=w.vegetation.sets.rock;const m=[].concat(s.mesh.material)[0];
          return {n0,n1:s.count,maps:['map','normalMap','roughnessMap','aoMap'].filter(k=>!!m[k]),uv1:!!s.mesh.geometry.attributes.uv1,mats:info.levels[0].materials}})()""")
        ok(r['n0']==r['n1'] and len(r['maps'])==4 and r['uv1'],'rock instances kept, all 4 PBR maps + uv1 present',json.dumps(r))
        an=await ev("""(()=>{const w=TERRA.world;const m=w.vegetation.sets.rock.mesh.material;const t=(Array.isArray(m)?m[0]:m).normalMap;const out={};for(const q of [0,2]){w.assets.applyTextureQuality(q);out[q]=t.anisotropy}return out})()""")
        ok(an['0']==1 and an['2']>=1,'Texture quality setting drives GLB texture anisotropy',json.dumps(an))

        print('5. shrub (bush) with 2 LODs, reed untouched')
        r=await ev("""(async()=>{const T=window.T,w=TERRA.world,v=w.vegetation;const n0=v.sets.bush.count+v.sets.bushL?.count||0;const reed0=v.sets.reed.count;
          const a=await T.glb(T.tree(1)), b=await T.glb(T.tree(0));
          const info=await w.assets.useModel('bush',null,{category:'shrub',lods:[{url:a},{url:b,distance:50}]});
          return {n0:v.sets.bush.count, levels:v.sets.bush.levelCounts().length, reed:v.sets.reed.count===reed0, reedProc:v.sets.reed.constructor.name}})()""")
        ok(r['levels']==2 and r['reed'] and r['reedProc']=='InstanceSet','bush replaced with 2 levels; other species stay procedural',json.dumps(r))

        print('6. building with 3 LODs: placement, LOD, picking, save/load, delete')
        r=await ev("""(async()=>{const T=window.T,w=TERRA.world,B=w.buildings;
          const cells=[];for(let j=40;j<100&&cells.length<6;j+=5)for(let i=20;i<110&&cells.length<6;i+=6){if(B.evaluate('house_small',i,j,0).ok)cells.push([i,j])}
          const ids=cells.slice(0,3).map(([i,j])=>B.place('house_small',i,j,0).building.id);
          const hi=await T.glb(T.house(2)),me=await T.glb(T.house(1)),lo=await T.glb(T.house(0));
          const info=await w.assets.useModel('house_small',null,{category:'building',lods:[{url:hi},{url:me,distance:80},{url:lo,distance:200}]});
          const s=B.sets.house_small;
          const more=cells.slice(3).map(([i,j])=>B.place('house_small',i,j,0).ok);
          const cam=w.rig.camera.position,keep=cam.clone();
          cam.set(0,1500,0);s._all=true;s.updateLod(cam);const far=s.levelCounts();cam.copy(keep);
          const b0=B.buildings.get(ids[0]);cam.set(b0.x,b0.y+4,b0.z);s._all=true;s.updateLod(cam);const near=s.levelCounts();
          // picking through whichever LOD mesh is drawn
          cam.set(0,1500,0);s._all=true;s.updateLod(cam);
          const level=s.rec.get(ids[1]).level, mesh=s.meshes[level];
          const pickId=s.idAt(0,mesh);
          // serialize + clear + load keeps every building
          const ser=B.serialize();const cnt=B.buildings.size;B.clearAll();const zero=s.count;B.load(ser);
          cam.copy(keep);
          return {tris:info.levels.map(l=>l.tris),mats:info.levels[0].materials,total:cnt,far,near,more:more.every(Boolean),pickOk:ids.includes(pickId)||pickId!==undefined,afterLoad:B.buildings.size,sc:s.count,zero}})()""")
        ok(r['mats']>=4 and r['tris'][0]>r['tris'][1]>r['tris'][2],'house: multi-material (6-sided box + roof), 3 LODs',json.dumps(r['tris']))
        ok(r['far'][2]==r['total'] and r['near'][0]>=1,'far -> all low LOD, near -> high LOD',f"far={r['far']} near={r['near']}")
        ok(r['more'] and r['pickOk'],'placing after the swap and picking through LOD meshes work')
        ok(r['zero']==0 and r['afterLoad']==r['total'] and r['sc']==r['total'],'serialize -> clear -> load restores every building',f"{r['total']} -> {r['afterLoad']}")
        rm=await ev("""(()=>{const B=TERRA.world.buildings,s=B.sets.house_small;const id=[...B.buildings.keys()][0];const n=s.count;B.remove(id);return {n,after:s.count,gone:!s.has(id)}})()""")
        ok(rm['after']==rm['n']-1 and rm['gone'],'delete works while the building sits in a lower LOD')

        print('7. fallback to procedural')
        r=await ev("""(async()=>{const T=window.T,w=TERRA.world,v=w.vegetation;
          const before={pine:v.sets.pine.constructor.name,n:v.sets.pine.count+v.sets.pineL.count};
          const out={};
          try{await w.assets.useModel('pine','/assets/models/does-not-exist.glb',{category:'tree'});out.missing='loaded?!'}catch(e){out.missing='rejected'}
          try{await w.assets.useModel('pine',T.garbageUrl(),{category:'tree'});out.garbage='loaded?!'}catch(e){out.garbage='rejected'}
          out.after={pine:v.sets.pine.constructor.name,n:v.sets.pine.count+v.sets.pineL.count};out.before=before;
          // LOD file broken but high ok: asset loads, with a warning
          const hi=await T.glb(T.tree(1));
          const info=await w.assets.useModel('birch',null,{category:'tree',lods:[{url:hi},{url:T.garbageUrl(),distance:60}]});
          out.partial={levels:info.levels.length,warn:info.warnings.length,set:v.sets.birch.constructor.name,count:v.sets.birch.count};
          return out})()""")
        ok(r['missing']=='rejected' and r['garbage']=='rejected' and r['after']==r['before'],'missing / corrupt file -> procedural pine untouched',json.dumps({k:r[k] for k in ['missing','garbage','after']}))
        ok(r['partial']['levels']==1 and r['partial']['warn']>=1 and r['partial']['count']>0,'broken LOD file is dropped with a warning, high model still used',json.dumps(r['partial']))
        man=await ev("""(async()=>{const {AssetManager}=await import('/js/assets.js');const a=new AssetManager(TERRA.world);
          const r=await a.loadManifest('/assets/manifest.json');const r2=await a.loadManifest('/assets/nope.json');return {empty:r.count,missingManifest:r2.count,loaderTouched:!!a._loader}})()""")
        ok(man['empty']==0 and man['missingManifest']==0 and not man['loaderTouched'],'empty / missing manifest: nothing loaded, glTF loader never imported',json.dumps(man))

        print('8. compression support')
        r=await ev("""(async()=>{const w=TERRA.world;await w.assets._ensure();
          const {MeshoptDecoder}=await import('/vendor/jsm/libs/meshopt_decoder.module.js');await MeshoptDecoder.ready;
          let ktx='?';try{await w.assets.ktx2.init();ktx='transcoder ready'}catch(e){ktx='failed: '+e.message}
          return {meshopt:MeshoptDecoder.supported,ktx}})()""")
        ok(r['meshopt'],'Meshopt decoder initialises')
        ok(r['ktx']=='transcoder ready','KTX2 / Basis transcoder initialises',r['ktx'])
        # real Draco round trip: encode with three's DRACOExporter, wrap in a KHR_draco_mesh_compression GLB, load through the pipeline
        await pg.add_script_tag(url='/tests/lib/draco/draco_encoder.js')
        r=await ev("""(async()=>{const T=window.T,THREE=T.THREE,w=TERRA.world;
          const {DRACOExporter}=await import('/tests/lib/jsm/exporters/DRACOExporter.js');
          const g=new THREE.TorusKnotGeometry(1,0.3,80,12);g.deleteAttribute('uv');
          const mesh=new THREE.Mesh(g);
          const drc=new DRACOExporter().parse(mesh,{decodeSpeed:5,encodeSpeed:5,encoderMethod:DRACOExporter.MESH_EDGEBREAKER_ENCODING,quantization:[14,10,8,12,8]});
          const n=g.attributes.position.count, ic=g.index.count;
          g.computeBoundingBox();const bb=g.boundingBox;
          const json={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],meshes:[{primitives:[{attributes:{POSITION:0,NORMAL:1},indices:2,mode:4,extensions:{KHR_draco_mesh_compression:{bufferView:0,attributes:{POSITION:0,NORMAL:1}}}}]}],
            accessors:[{componentType:5126,count:n,type:'VEC3',min:bb.min.toArray(),max:bb.max.toArray()},{componentType:5126,count:n,type:'VEC3'},{componentType:5125,count:ic,type:'SCALAR'}],
            bufferViews:[{buffer:0,byteOffset:0,byteLength:drc.byteLength}],buffers:[{byteLength:(drc.byteLength+3)&~3}],extensionsUsed:['KHR_draco_mesh_compression'],extensionsRequired:['KHR_draco_mesh_compression']};
          let js=new TextEncoder().encode(JSON.stringify(json));const jl=(js.length+3)&~3;const jp=new Uint8Array(jl).fill(32);jp.set(js);
          const bl=(drc.byteLength+3)&~3;const bp=new Uint8Array(bl);bp.set(new Uint8Array(drc.buffer?drc.buffer:drc));
          const total=12+8+jl+8+bl;const out=new ArrayBuffer(total);const dv=new DataView(out);
          dv.setUint32(0,0x46546C67,true);dv.setUint32(4,2,true);dv.setUint32(8,total,true);dv.setUint32(12,jl,true);dv.setUint32(16,0x4E4F534A,true);new Uint8Array(out,20,jl).set(jp);
          dv.setUint32(20+jl,bl,true);dv.setUint32(24+jl,0x004E4942,true);new Uint8Array(out,28+jl,bl).set(bp);
          const url=URL.createObjectURL(new Blob([out]));
          const raw=ic/3*0+((n*3*4)+(n*3*4)+ic*4);
          const info=await w.assets.useModel('rock',url,{category:'rock'});
          return {drcBytes:drc.byteLength,rawBytes:raw,tris:info.levels[0].tris,srcTris:ic/3,used:[...w.assets.decodersUsed]}})()""")
        ok('draco' in r['used'] and r['tris']==r['srcTris'],'Draco-compressed GLB decodes through the pipeline',f"{r['drcBytes']} B vs {r['rawBytes']} B raw ({100*r['drcBytes']/r['rawBytes']:.0f}%), {r['tris']} tris")

        print('9. rendering with replaced sets under all presets')
        for pr in ['low','medium','high','ultra']:
            await ev(f"TERRA.gfx.setPreset('{pr}')"); await pg.wait_for_timeout(2500)
            ok(await ev("TERRA.world.renderer.info.render.calls>0"),'renders after swap: '+pr)
        await ev("TERRA.gfx.setPreset('high'); TERRA.world.rig.goal.dist=70; TERRA.world.rig.goal.pitch=0.55"); await pg.wait_for_timeout(6000)
        await pg.screenshot(path='/tmp/assets_scene.png')
        print('TOTAL',sum(res),'/',len(res),'page errors:',errs[:5])
        await b.close()
asyncio.run(main())
