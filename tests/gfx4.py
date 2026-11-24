import asyncio
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox','--use-angle=swiftshader','--use-gl=angle','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
        pg = await b.new_page(viewport={'width':640,'height':400}); pg.set_default_timeout(300000)
        await pg.goto('http://localhost:8123/index.html'); await pg.wait_for_function('window.__terraReady===true')
        ev=pg.evaluate
        await pg.wait_for_timeout(4000); await ev("TERRA.perf.dynamicRes=false; TERRA.sim.setRunning(false); TERRA.ui.el.toasts.innerHTML=''")
        for name,js in [('m_fxaa',"TERRA.gfx.setPreset('medium')"),('m_off',"TERRA.gfx.set({aa:'off'})"),('m_novol',"TERRA.gfx.set({aa:'fxaa',volumetric:0})")]:
            await ev(js); await pg.wait_for_timeout(2500); await pg.screenshot(path=f'/tmp/{name}.png')
            print(name, await ev("JSON.stringify([TERRA.world.pixelRatio(),TERRA.world.pipeline.pr,TERRA.world.pipeline.w,TERRA.world.pipeline.passes.fxaa?.material.uniforms.resolution.value])"))
        await b.close()
asyncio.run(main())
