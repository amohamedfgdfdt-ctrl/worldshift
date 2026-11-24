import asyncio, io
from playwright.async_api import async_playwright
from PIL import Image
import numpy as np
def stat(png):
    a=np.asarray(Image.open(io.BytesIO(png)).convert('RGB'),dtype=float)[150:250,60:260]
    return [round(x) for x in a.reshape(-1,3).mean(0)], round(float(a.std()),1)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox','--use-angle=swiftshader','--use-gl=angle','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
        pg = await b.new_page(viewport={'width':640,'height':400}); pg.set_default_timeout(300000)
        await pg.goto('http://localhost:8123/index.html'); await pg.wait_for_function('window.__terraReady===true')
        ev=pg.evaluate
        await pg.wait_for_timeout(4000)
        await ev("TERRA.perf.dynamicRes=false; TERRA.sim.setRunning(false); TERRA.ui.el.toasts.innerHTML=''; TERRA.gfx.setPreset('medium'); TERRA.gfx.set({volumetric:0})")
        async def shot(tag):
            await pg.wait_for_timeout(2200); print(tag, stat(await pg.screenshot()))
        for mode in ['off','fxaa']:
            await ev(f"TERRA.gfx.set({{aa:'{mode}'}})")
            await ev("TERRA.world.env.fogDensityBase=0.0014/0.75")
            await shot(mode+' fog')
            await ev("TERRA.world.env.fogDensityBase=0.00001")
            await shot(mode+' nofog')
            await ev("TERRA.world.env.sun.castShadow=false")
            await shot(mode+' nofog noshadow(until next frame resets)')
        await b.close()
asyncio.run(main())
