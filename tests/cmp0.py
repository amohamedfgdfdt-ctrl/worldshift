import asyncio, json, sys
from playwright.async_api import async_playwright
ARGS=['--no-sandbox','--use-angle=swiftshader','--use-gl=angle','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=ARGS)
        pg=await b.new_page(viewport={'width':1280,'height':760}); pg.set_default_timeout(120000)
        errs=[]; pg.on('pageerror',lambda e: errs.append('PE '+str(e))); pg.on('console',lambda m: errs.append(m.text[:200]) if m.type=='error' else None)
        await pg.goto('http://localhost:8123/index.html'); await pg.wait_for_function('window.__terraReady===true')
        await pg.wait_for_timeout(1500)
        await pg.screenshot(path='/tmp/c0_mode.png')
        await pg.click('[data-go=campaign]'); await pg.wait_for_timeout(600)
        await pg.screenshot(path='/tmp/c0_stages.png')
        print(errs[:8]); await b.close()
asyncio.run(main())
