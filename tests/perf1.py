import asyncio, json
from playwright.async_api import async_playwright
ARGS=['--no-sandbox','--use-angle=swiftshader','--use-gl=angle','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']
async def main():
    out={}
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=ARGS)
        pg=await b.new_page(viewport={'width':520,'height':560}); pg.set_default_timeout(300000)
        errs=[]; pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m:errs.append(m.text[:200]) if m.type=='error' else None)
        await pg.goto('http://localhost:8123/index.html'); await pg.wait_for_function('window.__terraReady===true')
        await pg.wait_for_function('Object.keys(TERRA.world.assets.loaded).length>=8'); await pg.wait_for_timeout(1500)
        ev=pg.evaluate
        await ev("TERRA.perf.dynamicRes=false;TERRA.gfx.auto=false")
        info="(()=>{const r=TERRA.world.renderer.info.render;return {calls:r.calls,tris:r.triangles}})()"
        async def snap():
            await pg.wait_for_timeout(1800)
            i=await ev("""(()=>{let tris=0,meshes=0;TERRA.world.scene.traverse(o=>{if(o.isInstancedMesh&&o.visible&&o.count){const g=o.geometry;tris+=o.count*((g.index?g.index.count:g.attributes.position.count)/3);meshes++}});return {instTris:Math.round(tris),instMeshes:meshes}})()""")
            st=await ev("(()=>{let a=0,b=0,vis=0,tot=0;for(const s of Object.values(TERRA.world.vegetation.sets)){if(!s.levelCounts)continue;tot+=s.count;vis+=s.levelCounts().reduce((x,y)=>x+y,0);a+=s.stats.culledDist;b+=s.stats.culledView}return {total:tot,submitted:vis,culledDist:a,culledView:b}})()")
            return {**i,**st}
        for pre in ['low','medium','high','ultra']:
            await ev(f"TERRA.gfx.setPreset('{pre}')")
            out[pre]=await snap()
        # camera zoom-in: far/frustum culling should kick in
        await ev("TERRA.gfx.setPreset('high')")
        for name,expr in [('overview',"TERRA.world.rig.goal.dist=520"),('close',"TERRA.world.rig.goal.dist=60")]:
            await ev(expr+";TERRA.world.rig.cur.dist=TERRA.world.rig.goal.dist")
            out['view_'+name]=await snap()
        out['nocull']={}
        await ev("TERRA.world.vegetation.setCulling(false)")
        for name,d in [('overview',520),('close',60),('mid',200)]:
            await ev(f"TERRA.world.rig.goal.dist={d};TERRA.world.rig.cur.dist={d}")
            out['nocull'][name]=await snap()
        await ev("TERRA.world.vegetation.setCulling(true)")
        out['cull']={}
        for name,d in [('overview',520),('close',60),('mid',200)]:
            await ev(f"TERRA.world.rig.goal.dist={d};TERRA.world.rig.cur.dist={d}")
            out['cull'][name]=await snap()
        out['errors']=errs
        await pg.screenshot(path='/tmp/perf1.png')
        await b.close()
    print(json.dumps(out,indent=1))
asyncio.run(main())
