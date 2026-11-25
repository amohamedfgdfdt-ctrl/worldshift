import asyncio,sys
from playwright.async_api import async_playwright
# usage: prev2.py light entryIndex[,variantIndex] ... -> /tmp/pv_<n>.png
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"])
        pg=await b.new_page(viewport={'width':1100,'height':700})
        await pg.goto('http://localhost:8123/index.html?preview=1')
        await pg.wait_for_function('window.TERRA && window.TERRA.preview && window.TERRA.preview.results.length>=9 && !document.querySelector("#apv-status").textContent',timeout=180000)
        await pg.evaluate('document.querySelectorAll(".banner,#toasts,.side").forEach(e=>e.style.display="none")')
        for a in sys.argv[1:]:
            light,ent=a.split(':')
            await pg.evaluate(f'(()=>{{const P=window.TERRA.preview;P._setLight("{light}");P.focusEntry({ent});}})()')
            await pg.wait_for_timeout(700)
            await pg.screenshot(path=f'/tmp/pv_{light}_{ent}.png')
        await b.close()
asyncio.run(main())
