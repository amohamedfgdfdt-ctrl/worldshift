import asyncio,json,sys
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"])
        pg=await b.new_page(viewport={'width':1280,'height':800})
        errs=[]
        pg.on('console',lambda m: errs.append(m.text) if m.type in('error','warning') else None)
        pg.on('pageerror',lambda e: errs.append('PAGEERR '+str(e)))
        await pg.goto('http://localhost:8123/index.html?preview=1')
        await pg.wait_for_function('window.TERRA && window.TERRA.preview && window.TERRA.preview.results.length>=9 && !document.querySelector("#apv-status").textContent',timeout=180000)
        await pg.wait_for_timeout(1500)
        r=await pg.evaluate('''()=>window.TERRA.preview.results.map(r=>({id:r.id,v:r.variants.map(v=>v.error?{n:v.name,err:v.error}:{n:v.name,size:v.size,src:v.srcSize,tris:v.tris,mats:v.materials.length,bad:v.checks.filter(c=>!c.ok).map(c=>c.msg)})}))''')
        print(json.dumps(r))
        await pg.screenshot(path='/tmp/prev_overview.png')
        print('errs',errs[:10])
        await b.close()
asyncio.run(main())
