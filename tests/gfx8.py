import asyncio, json, sys
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox','--use-angle=swiftshader','--use-gl=angle','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
        pg = await b.new_page(viewport={'width':640,'height':400}); pg.set_default_timeout(300000)
        errs=[]; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text[:160]) if m.type=='error' else None)
        await pg.goto('http://localhost:8123/index.html'); await pg.wait_for_function('window.__terraReady===true')
        ev=pg.evaluate
        await pg.wait_for_timeout(3500)
        await ev("TERRA.perf.dynamicRes=false; TERRA.ui.el.toasts.innerHTML=''")
        res=[]
        def ok(c,m,e=''): res.append(bool(c)); print('  PASS' if c else '  FAIL', m, e)
        # find buildable cells once
        cells=await ev("""(()=>{const w=TERRA.world,out=[];for(let j=40;j<100&&out.length<14;j+=5)for(let i=20;i<110&&out.length<14;i+=6){const e=w.buildings.evaluate('house_small',i,j,0);if(e.ok)out.push([i,j])}return out})()""")
        print('cells', len(cells))
        for pr in ['low','medium','high','ultra']:
            print(pr)
            await ev(f"TERRA.gfx.setPreset('{pr}'); TERRA.gfx.set({{fpsLimit:120}}); TERRA.sim.setRunning(true)"); await pg.wait_for_timeout(3000)
            n0=await ev("TERRA.world.buildings.buildings.size")
            ids=await ev("(c)=>c.slice(0,5).map(([i,j],k)=>TERRA.world.buildings.place(['house_small','house_medium','factory_small','farm','tree'][k],i,j,0))",cells)
            okc=sum(1 for r in ids if r.get('ok'))
            await pg.wait_for_timeout(1500)
            n1=await ev("TERRA.world.buildings.buildings.size"); ok(n1-n0==okc and okc>=3,'build',f'{n0}->{n1}')
            # delete
            first=await ev("[...TERRA.world.buildings.buildings.keys()].pop()")
            await ev("(id)=>TERRA.world.buildings.remove(id)",first); await pg.wait_for_timeout(800)
            n2=await ev("TERRA.world.buildings.buildings.size"); ok(n2==n1-1,'delete',f'{n1}->{n2}')
            # water
            v0=await ev("TERRA.world.water.totalVolume()"); await ev("TERRA.world.water.addVolume(-60,-40,6,400)")
            v1=await ev("TERRA.world.water.totalVolume()"); await pg.wait_for_timeout(2500)
            nan=await ev("TERRA.world.water.depth.some(x=>!isFinite(x))"); ok(v1>v0+300 and not nan,'water add + finite',f'{v0:.0f}->{v1:.0f}')
            fl=await ev("(()=>{let m=0;const w=TERRA.world.water;for(let k=0;k<w.vx.length;k++)m=Math.max(m,Math.hypot(w.vx[k],w.vz[k]));return m})()"); ok(fl>0.05,'water flows',f'max v={fl:.2f}')
            # camera
            y0=await ev("TERRA.world.rig.goal.yaw"); await ev("TERRA.world.rig.rotateBy(0.8); TERRA.world.rig.zoomBy(0.8)"); await pg.wait_for_timeout(1200); y1=await ev("TERRA.world.rig.cur.yaw"); ok(abs(y1-y0)>0.3,'camera',f'{y0:.2f}->{y1:.2f}')
            # save / restore
            await ev("TERRA.save.save(false)"); cnt=await ev("TERRA.world.buildings.buildings.size")
            await ev("TERRA.world.buildings.clearAll()"); ok(await ev("TERRA.world.buildings.buildings.size")==0,'cleared')
            ld=await ev("TERRA.save.load()"); await pg.wait_for_timeout(800)
            for _ in range(8):
                if await ev("TERRA.world.buildings.buildings.size")==cnt: break
                await pg.wait_for_timeout(1000)
            got=await ev("TERRA.world.buildings.buildings.size"); ok(ld and got==cnt,'save/restore',f'{cnt} got {got} ld={ld}')
            # settings during play + resolution change
            for k,v in [('shadowRes',512),('waterQuality',3),('aa','smaa'),('vegDensity',0.2),('renderScale',0.6),('terrainDetail',0),('drawDistance',0.4),('post',1),('ao',0)]:
                await ev(f"TERRA.gfx.set({{{k}:{json.dumps(v)}}})"); await pg.wait_for_timeout(250)
            await pg.set_viewport_size({'width':520,'height':340}); await pg.wait_for_timeout(1200)
            sz=await ev("[TERRA.world.canvas.width,TERRA.world.canvas.height,TERRA.world.pixelRatio()]"); ok(sz[0]>0 and abs(sz[0]-520*sz[2])<=2,'resolution change',str(sz))
            await pg.set_viewport_size({'width':640,'height':400}); await pg.wait_for_timeout(600)
            await ev("TERRA.world.buildings.clearAll()")
            print('  errs', errs[-3:])
        print('TOTAL', sum(res),'/',len(res), 'errs', len(errs))
        await b.close()
asyncio.run(main())
