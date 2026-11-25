import asyncio, json, sys
from playwright.async_api import async_playwright
ARGS=['--no-sandbox','--use-angle=swiftshader','--use-gl=angle','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']
async def run(base):
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=ARGS)
        pg=await b.new_page(viewport={'width':700,'height':440}); pg.set_default_timeout(300000)
        if base: await pg.route('**/assets/manifest.json', lambda r: r.fulfill(status=404))
        await pg.goto('http://localhost:8123/index.html'); await pg.wait_for_function('window.__terraReady===true')
        if not base: await pg.wait_for_function('Object.keys(TERRA.world.assets.loaded).length>=8')
        await pg.evaluate("TERRA.perf.dynamicRes=false;TERRA.perf.stopAuto&&TERRA.perf.stopAuto()")
        out={}
        for pre in ['low','medium','high']:
            await pg.evaluate(f"TERRA.gfx.setPreset('{pre}')"); await pg.wait_for_timeout(2500)
            out[pre]=await pg.evaluate("(()=>{const r=TERRA.world.renderer.info;return {tris:r.render.triangles,calls:r.render.calls}})()")
        await b.close(); return out
async def main():
    print('assets',json.dumps(await run(False))); print('base  ',json.dumps(await run(True)))
asyncio.run(main())
