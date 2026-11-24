import asyncio, io
from playwright.async_api import async_playwright
from PIL import Image
import numpy as np
def stat(png):
    a=np.asarray(Image.open(io.BytesIO(png)).convert('RGB'),dtype=float)[150:250,60:260]
    return [round(x,1) for x in a.reshape(-1,3).mean(0)], round(float(a.std()),1)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox','--use-angle=swiftshader','--use-gl=angle','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
        pg = await b.new_page(viewport={'width':640,'height':400}); pg.set_default_timeout(300000)
        await pg.goto('http://localhost:8123/index.html'); await pg.wait_for_function('window.__terraReady===true')
        ev=pg.evaluate
        await pg.wait_for_timeout(4000)
        await ev("TERRA.perf.dynamicRes=false; TERRA.sim.setRunning(false); TERRA.ui.el.toasts.innerHTML=''; TERRA.gfx.setPreset('medium'); TERRA.gfx.set({aa:'off',volumetric:0})")
        await pg.wait_for_timeout(2500); print('direct', stat(await pg.screenshot()))
        await ev("TERRA.gfx.set({aa:'fxaa'})")
        for k in [1.0,0.6,0.45,0.35]:
            await ev(f"window.__FOGK={k}"); await pg.wait_for_timeout(2500); print('composer fogk',k, stat(await pg.screenshot()))
        await b.close()
asyncio.run(main())
