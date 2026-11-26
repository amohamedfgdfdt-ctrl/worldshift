import asyncio, json
from playwright.async_api import async_playwright
ARGS=['--no-sandbox','--use-angle=swiftshader','--use-gl=angle','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=ARGS)
        ctx=await b.new_context(viewport={'width':390,'height':844},device_scale_factor=2,is_mobile=True,has_touch=True)
        pg=await ctx.new_page(); pg.set_default_timeout(300000)
        errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
        await pg.goto('http://localhost:8123/index.html'); await pg.wait_for_function('window.__terraReady===true')
        await pg.wait_for_timeout(1500); await pg.screenshot(path='/tmp/m_mode.png')
        await pg.click('[data-go=campaign]'); await pg.wait_for_timeout(1200); await pg.screenshot(path='/tmp/m_stages.png')
        await pg.click('.stage-card'); await pg.wait_for_timeout(500); await pg.screenshot(path='/tmp/m_detail.png')
        await pg.click('[data-a=play]'); await pg.wait_for_timeout(4000); await pg.screenshot(path='/tmp/m_hud.png')
        ov=await pg.evaluate("(()=>{const r=e=>{const b=document.querySelector(e)?.getBoundingClientRect();return b&&[Math.round(b.left),Math.round(b.top),Math.round(b.right),Math.round(b.bottom)]};return {hud:r('#cmp-hud'),rail:r('#rail')||r('.rail'),bar:r('.dock')||r('#dock'),w:innerWidth,scrollW:document.documentElement.scrollWidth}})()")
        print(json.dumps(ov)); await pg.screenshot(path='/tmp/m_top.png',clip={'x':0,'y':0,'width':390,'height':70}); 
        await pg.click('#btn-lang'); await pg.wait_for_timeout(800); await pg.screenshot(path='/tmp/m_hud_ar.png')
        print('errs',errs)
        await b.close()
asyncio.run(main())
