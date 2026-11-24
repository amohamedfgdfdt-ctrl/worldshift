import asyncio, json, sys
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox','--use-angle=swiftshader','--use-gl=angle','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
        pg = await b.new_page(viewport={'width':640,'height':400}); pg.set_default_timeout(300000)
        errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('http://localhost:8123/index.html'); await pg.wait_for_function('window.__terraReady===true')
        ev=pg.evaluate
        await ev("TERRA.perf.dynamicRes=false; TERRA.gfx.values.fpsLimit=120; TERRA.sim.setRunning(false)")
        out={}
        for pr in ['low','medium','high','ultra']:
            await ev(f"TERRA.gfx.setPreset('{pr}'); TERRA.gfx.set({{fpsLimit:120}})"); await pg.wait_for_timeout(1500)
            ms=await ev("""new Promise(res=>{const p=TERRA.perf;let n=0,t0=0;const f=(t)=>{if(n===0)t0=t; n++; if(n>5){res((t-t0)/5)} else requestAnimationFrame(f)};requestAnimationFrame(f)})""")
            r=await ev("({calls:0,pr:TERRA.world.pixelRatio(),mode:TERRA.world.pipeline.mode})")
            out[pr]=ms; print(pr, round(ms), 'ms/frame', r)
            await pg.screenshot(path=f'/tmp/g_{pr}.png')
        print('errs', errs)
        await b.close()
asyncio.run(main())
