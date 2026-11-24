import asyncio, json, sys
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox','--use-angle=swiftshader','--use-gl=angle','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
        pg = await b.new_page(viewport={'width':900,'height':560}); pg.set_default_timeout(60000)
        errs=[]; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append('C:'+m.text) if m.type in ('error','warning') else None)
        await pg.goto('http://localhost:8123/index.html'); 
        try: await pg.wait_for_function('window.__terraReady===true')
        except Exception as e: print('NOT READY', e)
        print('errs', errs[:8])
        print(await pg.evaluate("JSON.stringify({caps:TERRA.caps, preset:TERRA.gfx.preset, mode:TERRA.world.pipeline.mode})"))
        await pg.wait_for_timeout(1500)
        await pg.screenshot(path='/tmp/g_low.png')
        print('errs', errs[:8])
        await b.close()
asyncio.run(main())
