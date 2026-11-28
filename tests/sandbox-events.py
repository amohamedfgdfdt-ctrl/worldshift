import asyncio, threading, functools, http.server, socketserver, time, base64, sys
from playwright.async_api import async_playwright
ROOT='/tmp/v3'; PORT=8911
def serve():
    h=functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
    class S(socketserver.TCPServer): allow_reuse_address=True
    with S(("127.0.0.1",PORT),h) as s: s.serve_forever()
threading.Thread(target=serve,daemon=True).start(); time.sleep(0.4)
async def shot(cdp,name):
    r=await cdp.send('Page.captureScreenshot',{'format':'png'}); open(f'/tmp/shots/{name}.png','wb').write(base64.b64decode(r['data']))
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        ctx=await b.new_context(viewport={'width':390,'height':844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        pg=await ctx.new_page(); cdp=await ctx.new_cdp_session(pg)
        errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
        await pg.goto(f'http://127.0.0.1:{PORT}/index.html?sandbox=1&noassets=1&gfx=low&hour=10', wait_until='load', timeout=45000)
        await pg.wait_for_timeout(4000)
        okl=[True]
        def chk(n,c):
            print(('PASS ' if c else 'FAIL ')+n, flush=True); okl[0] = okl[0] and c
        # open world panel
        await pg.evaluate("document.querySelector('[data-cat=world]')?.click()")
        await pg.wait_for_timeout(500)
        print('panel buttons', await pg.evaluate("[...document.querySelectorAll('[data-act=seg],[data-act=ev-now]')].length"))
        await shot(cdp,'sbev-panel')
        r=await pg.evaluate("""(() => { const T=window.TERRA, e=T.sim.events, w=T.world.water.params; const base=w.sourceRate;
          T.settings.apply({evPower:'severe'}); e.start('storm',3); const sev=w.sourceRate/base; e.stop(false);
          T.settings.apply({evPower:'mild'}); e.start('storm',3); const mild=w.sourceRate/base; e.stop(false);
          T.settings.apply({evPower:'normal'}); e.start('storm',3); const nor=w.sourceRate/base; e.stop(false);
          T.settings.apply({evFreq:'rare'}); const rare=[e.auto.minGap,e.auto.maxGap]; T.settings.apply({evFreq:'frequent'}); const fr=[e.auto.minGap,e.auto.maxGap]; T.settings.apply({evFreq:'normal'});
          return {sev,mild,nor,restored:w.sourceRate/base,rare,fr}; })()""")
        print(r)
        chk('severe > normal > mild', r['sev']>r['nor']>r['mild'] and abs(r['nor']-2.0)<1e-6)
        chk('source rate restored after stop', abs(r['restored']-1)<1e-9)
        chk('frequency changes gaps', r['rare'][0]>r['fr'][1])
        await pg.evaluate("document.querySelector('[data-act=ev-now][data-ev=storm]').click()")
        await pg.wait_for_timeout(1200)
        t=await pg.evaluate("[window.TERRA.sim.events.active&&window.TERRA.sim.events.active.type, document.getElementById('sb-ev-chip').textContent, document.getElementById('sb-ev-chip').hidden]")
        print(t); chk('storm started + chip shown', t[0]=='storm' and not t[2])
        await pg.evaluate("document.querySelector('[data-act=close-panel]')?.click()")
        await pg.evaluate("window.TERRA.sim.setSpeed(1)")
        await pg.wait_for_timeout(1500); await shot(cdp,'sbev-storm')
        await pg.evaluate("document.querySelector('.sb-flash').classList.add('go')"); await pg.wait_for_timeout(120); await shot(cdp,'sbev-bolt')
        await pg.evaluate("window.TERRA.sim.events.start('drought',8)"); await pg.wait_for_timeout(3800); await shot(cdp,'sbev-drought')
        # AR
        await pg.evaluate("window.TERRA.sim.events.stop(false)")
        print('ERR',errs[:3]); chk('no page errors', not errs)
        print('ALL OK' if okl[0] else 'SOME FAILED')
        await b.close()
asyncio.run(main())
