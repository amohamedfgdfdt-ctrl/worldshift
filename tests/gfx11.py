import asyncio, json
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox','--use-angle=swiftshader','--use-gl=angle','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
        pg = await b.new_page(viewport={'width':640,'height':400}); pg.set_default_timeout(600000)
        errs=[]; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text[:200]) if m.type=='error' else None)
        await pg.goto('http://localhost:8123/index.html'); await pg.wait_for_function('window.__terraReady===true')
        ev=pg.evaluate
        await pg.wait_for_timeout(3500)
        await ev("TERRA.perf.dynamicRes=false; TERRA.ui.el.toasts.innerHTML=''; TERRA.sim.setRunning(false); TERRA.world.renderer.info.autoReset=false")
        # ---- water independence
        r=await ev("""(()=>{const w=TERRA.world, out={};for(const q of [0,3]){TERRA.gfx.set({waterQuality:q});w.water.resetToInitial();w.water.addVolume(-40,-30,5,300);for(let i=0;i<300;i++)w.water.step(0.08);let h=0;for(let k=0;k<w.water.depth.length;k++)h=(h*31+Math.round(w.water.depth[k]*1e4))|0;out[q]=h}return out})()""")
        print('water sim checksum by visual quality', r, 'IDENTICAL' if r['0']==r['3'] else 'DIFFERENT')
        # ---- memory across preset cycling
        mem=[]
        for cyc in range(4):
            for pr in ['low','medium','high','ultra']:
                await ev(f"TERRA.gfx.setPreset('{pr}')"); await pg.wait_for_timeout(700)
            m=await ev("({g:TERRA.world.renderer.info.memory.geometries,t:TERRA.world.renderer.info.memory.textures,p:TERRA.world.renderer.info.programs.length})")
            mem.append(m); print('cycle',cyc,m)
        # ---- stress
        await ev("TERRA.world.buildings.clearAll()")
        n=await ev("""(()=>{const w=TERRA.world;let n=0;const keys=['house_small','house_medium','factory_small','farm','tree'];
          for(let j=4;j<124;j+=3)for(let i=4;i<124;i+=3){const k=keys[(i+j)%5];if(w.buildings.place(k,i,j,0).ok)n++}return n})()""")
        print('stress buildings placed', n)
        rows=[]
        for pr in ['low','medium','high','ultra']:
            await ev(f"TERRA.gfx.setPreset('{pr}'); TERRA.gfx.set({{fpsLimit:120}})"); await pg.wait_for_timeout(2500)
            ms=await ev("""new Promise(res=>{let n=0,t0=0;const f=(t)=>{if(n===0)t0=t;n++;if(n>5)res((t-t0)/5);else requestAnimationFrame(f)};requestAnimationFrame(f)})""")
            st=await ev("(()=>{const w=TERRA.world,i=w.renderer.info;i.reset();w.frame(0.016,TERRA.sim);return {calls:i.render.calls,tris:i.render.triangles,geo:i.memory.geometries,tex:i.memory.textures,pr:w.pixelRatio(),mode:w.pipeline.mode}})()")
            rows.append((pr,round(ms),st)); print(pr, round(ms),'ms/frame', st)
        print('errs',errs[:4])
        await b.close()
asyncio.run(main())
