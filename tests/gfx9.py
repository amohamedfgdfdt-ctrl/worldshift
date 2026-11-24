import asyncio, json
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox','--use-angle=swiftshader','--use-gl=angle','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
        pg = await b.new_page(viewport={'width':800,'height':500}); pg.set_default_timeout(300000)
        errs=[]; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text[:200]) if m.type=='error' else None)
        await pg.goto('http://localhost:8123/index.html'); await pg.wait_for_function('window.__terraReady===true')
        ev=pg.evaluate
        await pg.wait_for_timeout(3500)
        await ev("TERRA.perf.dynamicRes=false; TERRA.ui.el.toasts.innerHTML=''; TERRA.gfx.setPreset('ultra'); TERRA.gfx.set({fpsLimit:120})")
        print(await ev("JSON.stringify(TERRA.world.vegetation.counts())"))
        await ev("""(()=>{const w=TERRA.world;let n=0;for(let j=30;j<110&&n<3;j+=4)for(let i=30;i<110&&n<3;i+=5){if(w.buildings.place('factory_small',i,j,0).ok)n++}})()""")
        # look at lake from low angle
        await ev("TERRA.world.rig.goal.pitch=0.35; TERRA.world.rig.goal.dist=70")
        await pg.wait_for_timeout(9000)
        print('smoke', await ev("TERRA.world.particles.activeSmoke"), 'lodswaps', await ev("TERRA.world.vegetation.lodSwaps"), 'errs', errs[:4])
        await pg.screenshot(path='/tmp/u1.png')
        await b.close()
asyncio.run(main())
