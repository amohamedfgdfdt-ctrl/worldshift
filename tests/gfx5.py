import asyncio, io
from playwright.async_api import async_playwright
from PIL import Image
import numpy as np
def sharp(png):
    a=np.asarray(Image.open(io.BytesIO(png)).convert('L'),dtype=float)[60:260,150:600]
    return float(np.abs(a[1:-1,1:-1]*4-a[:-2,1:-1]-a[2:,1:-1]-a[1:-1,:-2]-a[1:-1,2:]).mean())
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox','--use-angle=swiftshader','--use-gl=angle','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
        pg = await b.new_page(viewport={'width':640,'height':400}); pg.set_default_timeout(300000)
        await pg.goto('http://localhost:8123/index.html'); await pg.wait_for_function('window.__terraReady===true')
        ev=pg.evaluate
        await pg.wait_for_timeout(4000)
        await ev("TERRA.perf.dynamicRes=false; TERRA.sim.setRunning(false); TERRA.ui.el.toasts.innerHTML=''; TERRA.gfx.setPreset('medium')")
        for aa,post,vol in [('off',0,0),('fxaa',0,0),('smaa',0,0),('msaa',0,0),('off',1,0),('fxaa',1,0),('off',0,1)]:
            await ev(f"TERRA.gfx.set({{aa:'{aa}',post:{post},volumetric:{vol}}})"); await pg.wait_for_timeout(2500)
            print(aa,post,vol, round(sharp(await pg.screenshot()),2), await ev("TERRA.world.pipeline.mode"))
        await b.close()
asyncio.run(main())
