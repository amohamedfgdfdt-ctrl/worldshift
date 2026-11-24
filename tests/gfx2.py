import asyncio, json, sys
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox','--use-angle=swiftshader','--use-gl=angle','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
        pg = await b.new_page(viewport={'width':800,'height':500}); pg.set_default_timeout(120000)
        errs=[]; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append('C:'+m.text[:200]) if m.type=='error' or ('shader' in m.text.lower() or 'THREE' in m.text) else None)
        await pg.goto('http://localhost:8123/index.html'); await pg.wait_for_function('window.__terraReady===true')
        ev=pg.evaluate
        await ev("TERRA.perf.dynamicRes=false; TERRA.sim.setRunning(false)")
        for pr in sys.argv[1:] or ['low','medium','high','ultra']:
            await ev(f"TERRA.gfx.setPreset('{pr}')"); await pg.wait_for_timeout(2500)
            r=await ev("""(()=>{const w=TERRA.world,gl=w.renderer.getContext();const t=[];for(let i=0;i<5;i++){const a=performance.now();w.frame(0.016,TERRA.sim);gl.finish();t.push(performance.now()-a)}t.sort((a,b)=>a-b);return {mode:w.pipeline.mode,ms:t[2],info:w.renderer.info.render.calls,tris:w.renderer.info.render.triangles,cfg:w.pipeline.cfg,geo:w.renderer.info.memory.geometries,tex:w.renderer.info.memory.textures}})()""")
            print(pr, json.dumps(r))
            await pg.screenshot(path=f'/tmp/g_{pr}.png')
            print(' errs', errs[-4:])
        await b.close()
asyncio.run(main())
