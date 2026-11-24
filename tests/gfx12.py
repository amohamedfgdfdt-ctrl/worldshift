import asyncio, json
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox','--use-angle=swiftshader','--use-gl=angle','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
        ctx = await b.new_context(viewport={'width':900,'height':700}); pg = await ctx.new_page(); pg.set_default_timeout(600000)
        errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('http://localhost:8123/index.html'); await pg.wait_for_function('window.__terraReady===true')
        ev=pg.evaluate
        await pg.wait_for_timeout(3500); await ev("TERRA.ui.el.toasts.innerHTML=''")
        # UI: open modal via button, change a select, apply, reload and verify persistence
        await ev("document.querySelector('#btn-gfx').click()"); await pg.wait_for_timeout(600)
        await pg.select_option('select[data-key="waterQuality"]','3'); await pg.select_option('select[data-key="aa"]','smaa')
        await ev("document.querySelector('[data-preset=\"medium\"]').click()")
        await pg.select_option('select[data-key="shadowRes"]','512')
        await pg.wait_for_timeout(1500); await pg.screenshot(path='/tmp/ui_gfx.png')
        print('after UI', await ev("JSON.stringify([TERRA.gfx.preset,TERRA.gfx.values.shadowRes,TERRA.world.env.sun.shadow.mapSize.x])"))
        await ev("document.querySelector('[data-g=apply]').click()"); await pg.wait_for_timeout(300)
        await pg.reload(); await pg.wait_for_function('window.__terraReady===true'); await pg.wait_for_timeout(2500)
        print('after reload', await ev("JSON.stringify([TERRA.gfx.preset,TERRA.gfx.values.shadowRes,TERRA.gfx.values.waterQuality,TERRA.world.gfx.shadowRes])"))
        # Cancel reverts
        await ev("document.querySelector('#btn-gfx').click()"); await pg.wait_for_timeout(400)
        await pg.select_option('select[data-key="shadowRes"]','2048'); await pg.wait_for_timeout(300)
        await ev("document.querySelector('[data-g=cancel]').click()"); await pg.wait_for_timeout(300)
        print('after cancel', await ev("TERRA.gfx.values.shadowRes"), await ev("TERRA.world.gfx.shadowRes"))
        # Auto mode adaptation on slow software GL
        await ev("TERRA.gfx.setPreset('ultra'); TERRA.gfx.auto=true; TERRA.perf.startAuto('ultra'); TERRA.perf.dynamicRes=true")
        for i in range(8):
            await pg.wait_for_timeout(8000)
            print(' t',(i+1)*8,'s', await ev("JSON.stringify([TERRA.gfx.preset,TERRA.perf.autoLevel,TERRA.world.drsScale.toFixed(2),TERRA.perf.fps.toFixed(1)])"), await ev("TERRA.perf.events.slice(0,2).map(e=>e.msg).join(' | ')"))
        print('errs',errs[:3])
        await b.close()
asyncio.run(main())
