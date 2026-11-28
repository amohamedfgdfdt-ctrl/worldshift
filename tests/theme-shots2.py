import asyncio, base64, json, threading, functools, http.server, socketserver, time, sys
from playwright.async_api import async_playwright
PORT = 9015
h = functools.partial(http.server.SimpleHTTPRequestHandler, directory='/tmp/v3')
class S(socketserver.TCPServer): allow_reuse_address = True
srv = S(("127.0.0.1", PORT), h)
threading.Thread(target=srv.serve_forever, daemon=True).start(); time.sleep(0.3)
BASE = f'http://127.0.0.1:{PORT}/index.html'
async def shot(ctx, pg, out, w, hh):
    await pg.set_viewport_size({'width': w, 'height': hh}); await pg.wait_for_timeout(400)
    cdp = await ctx.new_cdp_session(pg); r = await cdp.send('Page.captureScreenshot', {'format': 'png'})
    open(out, 'wb').write(base64.b64decode(r['data'])); print('shot', out, flush=True)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        ctx = await b.new_context(viewport={'width': 1440, 'height': 900}); pg = await ctx.new_page()
        await pg.goto(f'{BASE}?noassets=1&gfx=medium&hour=10', wait_until='load', timeout=45000)
        await pg.wait_for_timeout(4500)
        await pg.evaluate("() => { window.TERRA.tutorial?.skip?.(); }")
        await pg.evaluate("""() => {
            const T = window.TERRA, gm = T.ui.gameMode, c = gm.campaign, bs = T.world.buildings;
            gm.enterCampaign(); gm.closeScreen(); c.start('s1');
            for (let i = 46; i < 70; i++) bs.placeRoad(i, 46, true, {});
            bs.place('house_small', 48, 43, 0, { force: true, silent: true });
            bs.place('house_small', 54, 43, 0, { force: true, silent: true });
            bs.place('water_tank', 60, 43, 0, { force: true, silent: true });
            T.sim.setSpeed(1);
        }""")
        await pg.wait_for_timeout(5000)
        await shot(ctx, pg, '/downloads/theme-stage-in-play.png', 1440, 900)
        await ctx.close()
        ctx2 = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        pg2 = await ctx2.new_page()
        await pg2.goto(f'{BASE}?sandbox=1&noassets=1&gfx=low&hour=10&demo=buildings&panel=buildings', wait_until='load', timeout=45000)
        await pg2.wait_for_timeout(6500)
        await pg2.evaluate("() => window.TERRA.tutorial?.skip?.()")
        await pg2.wait_for_timeout(600)
        await shot(ctx2, pg2, '/downloads/theme-mobile-sandbox.png', 390, 844)
        await pg2.evaluate("() => { const gm = window.TERRA.ui.gameMode; gm.enterCampaign(); gm.showStages(); gm.showBriefing('s9'); }")
        await pg2.wait_for_timeout(900)
        await shot(ctx2, pg2, '/downloads/theme-mobile-briefing.png', 390, 844)
        await ctx2.close(); await b.close()
asyncio.run(main())
