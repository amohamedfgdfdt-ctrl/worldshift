import asyncio, threading, functools, http.server, socketserver, time, base64
from playwright.async_api import async_playwright
PORT=8931
def serve():
    h=functools.partial(http.server.SimpleHTTPRequestHandler, directory='/tmp/v3')
    class S(socketserver.TCPServer): allow_reuse_address=True
    with S(("127.0.0.1",PORT),h) as s: s.serve_forever()
threading.Thread(target=serve,daemon=True).start(); time.sleep(.4)
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        ctx=await b.new_context(viewport={'width':1000,'height':640}); pg=await ctx.new_page(); cdp=await ctx.new_cdp_session(pg)
        errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
        await pg.add_init_script("localStorage.setItem('worldshift.terra.tutorial','done')")
        async def shot(n):
            r=await cdp.send('Page.captureScreenshot',{'format':'png'}); open(f'/tmp/shots/{n}.png','wb').write(base64.b64decode(r['data']))
        PL="(()=>{const T=window.TERRA,bs=T.world.buildings;for(let j=30;j<100;j+=2)for(let i=30;i<100;i+=2){const ev=bs.evaluate('farm',i,j);if(ev.ok){const r=bs.place('farm',i,j,0,{force:true,silent:true});if(r&&r.ok)return [i,j]}}})()"
        for name,hour,cam in [('merge-farm-day',11,'-18,-36,0.6,0.6,24'),('merge-farm-night',23,'-18,-36,0.6,0.6,60')]:
            await pg.goto(f'http://127.0.0.1:{PORT}/index.html?sandbox=1&noassets=1&gfx=medium&hour={hour}&cam={cam}',wait_until='load'); await pg.wait_for_timeout(4000)
            print(name, await pg.evaluate(PL)); await pg.evaluate("document.querySelector('.toast,.banner')?.remove()")
            await pg.wait_for_timeout(2500); await shot(name)
        print('ERR',errs[:3]); await b.close()
asyncio.run(main())
