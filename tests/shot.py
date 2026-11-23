import sys, asyncio, json
from playwright.async_api import async_playwright
url = sys.argv[1]; out = sys.argv[2]; w=int(sys.argv[3]) if len(sys.argv)>3 else 1280; h=int(sys.argv[4]) if len(sys.argv)>4 else 720
js = sys.argv[5] if len(sys.argv)>5 else ''
wait = float(sys.argv[6]) if len(sys.argv)>6 else 3
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox','--use-angle=swiftshader','--use-gl=angle','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--enable-webgl'])
        pg = await b.new_page(viewport={'width':w,'height':h})
        logs=[]
        pg.on('console', lambda m: logs.append(m.type+': '+m.text))
        pg.on('pageerror', lambda e: logs.append('PAGEERROR: '+str(e)))
        await pg.goto(url)
        await pg.wait_for_timeout(int(wait*1000))
        if js:
            r = await pg.evaluate(js)
            print('JS ->', json.dumps(r)[:1500])
            await pg.wait_for_timeout(1500)
        await pg.screenshot(path=out)
        for l in logs[:30]: print(l)
        await b.close()
asyncio.run(main())
