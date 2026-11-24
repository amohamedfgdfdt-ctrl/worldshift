import asyncio, json
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox','--use-angle=swiftshader','--use-gl=angle','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
        pg = await b.new_page(viewport={'width':800,'height':500}); pg.set_default_timeout(300000)
        errs=[]; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text[:200]) if m.type=='error' else None)
        await pg.goto('http://localhost:8123/index.html'); await pg.wait_for_function('window.__terraReady===true')
        ev=pg.evaluate
        await pg.wait_for_timeout(2500)
        r=await pg.evaluate("""async()=>{
          const THREE=await import('/vendor/three.module.min.js');
          const {GLTFExporter}=await import('/tests/lib/jsm/exporters/GLTFExporter.js');
          const cv=document.createElement('canvas');cv.width=cv.height=32;const c=cv.getContext('2d');c.fillStyle='#c97b4a';c.fillRect(0,0,32,32);c.fillStyle='#8a4a2a';for(let i=0;i<32;i+=8)c.fillRect(0,i,32,3);
          const tex=new THREE.CanvasTexture(cv);tex.colorSpace=THREE.SRGBColorSpace;
          const g=new THREE.Group();
          const wall=new THREE.Mesh(new THREE.BoxGeometry(6,4,6).translate(0,2,0),new THREE.MeshStandardMaterial({map:tex,roughness:0.8}));
          const roof=new THREE.Mesh(new THREE.ConeGeometry(5,2.5,4).rotateY(Math.PI/4).translate(0,5.25,0),new THREE.MeshStandardMaterial({color:0x7a2f2f,roughness:0.5,metalness:0.1}));
          g.add(wall,roof);
          const buf=await new Promise(res=>new GLTFExporter().parse(g,res,(e)=>{throw e},{binary:true}));
          const url=URL.createObjectURL(new Blob([buf]));
          const w=TERRA.world;
          const cells=[];for(let j=40;j<100&&cells.length<2;j+=5)for(let i=20;i<110&&cells.length<2;i+=6){if(w.buildings.evaluate('house_small',i,j,0).ok)cells.push([i,j])}
          for(const [i,j] of cells) w.buildings.place('house_small',i,j,0);
          const before=w.buildings.sets.house_small.count;
          const info=await w.assets.useModel('house_small',url);
          const s=w.buildings.sets.house_small;
          return {bytes:buf.byteLength,before,after:s.count,info,matIsArray:Array.isArray(s.mesh.material),groups:s.mesh.geometry.groups.length};
        }""")
        print(json.dumps(r))
        await ev("TERRA.world.rig.goal.dist=60; TERRA.world.rig.goal.pitch=0.7")
        await pg.wait_for_timeout(3000); await pg.screenshot(path='/tmp/glb.png')
        print('errs',errs[:5])
        await b.close()
asyncio.run(main())
