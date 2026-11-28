import asyncio, base64, json, threading, functools, http.server, socketserver, time
from playwright.async_api import async_playwright
PORT = 9012
h = functools.partial(http.server.SimpleHTTPRequestHandler, directory='/tmp/v3')
class S(socketserver.TCPServer): allow_reuse_address = True
srv = S(("127.0.0.1", PORT), h)
threading.Thread(target=srv.serve_forever, daemon=True).start(); time.sleep(0.3)

BASE = f'http://127.0.0.1:{PORT}/index.html'

async def shot(ctx, pg, out, w, hh):
    await pg.set_viewport_size({'width': w, 'height': hh})
    await pg.wait_for_timeout(400)
    cdp = await ctx.new_cdp_session(pg)
    r = await cdp.send('Page.captureScreenshot', {'format': 'png'})
    open(out, 'wb').write(base64.b64decode(r['data']))
    print('shot', out, flush=True)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome',
            args=['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        # 1) sandbox HUD in play
        ctx = await b.new_context(viewport={'width': 1440, 'height': 900})
        pg = await ctx.new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
        await pg.goto(f'{BASE}?theme=b&sandbox=1&noassets=1&gfx=medium&hour=10&demo=buildings&panel=build', wait_until='load', timeout=45000)
        await pg.wait_for_timeout(6000)
        await shot(ctx, pg, '/downloads/themeB-desktop-sandbox.png', 1440, 900)
        # 2) campaign stage list (fresh page: the sandbox panel is still open here)
        await pg.goto(f'{BASE}?theme=b&noassets=1&gfx=medium&hour=10', wait_until='load', timeout=45000)
        await pg.wait_for_timeout(4500)
        await pg.evaluate("() => { window.TERRA.tutorial?.skip?.(); const gm = window.TERRA.ui.gameMode; gm.enterCampaign(); gm.showStages(); }")
        await pg.wait_for_timeout(1200)
        await shot(ctx, pg, '/downloads/themeB-campaign-stages.png', 1440, 900)
        # 3) briefing
        await pg.evaluate("() => window.TERRA.ui.gameMode.showBriefing('s6')")
        await pg.wait_for_timeout(800)
        await shot(ctx, pg, '/downloads/themeB-briefing-en.png', 1440, 900)
        # 3b) a stage in play: start stage 1, lay a road and a couple of houses, let it run
        await pg.evaluate("() => window.TERRA.ui.gameMode.closeBriefing()")
        await pg.evaluate("""() => {
            const T = window.TERRA, gm = T.ui.gameMode, c = gm.campaign, bs = T.world.buildings;
            gm.closeScreen(); c.start('s1');
            for (let i = 46; i < 70; i++) bs.placeRoad(i, 46, true, {});
            bs.place('house_small', 48, 43, 0, { force: true, silent: true });
            bs.place('house_small', 54, 43, 0, { force: true, silent: true });
            bs.place('water_tank', 60, 43, 0, { force: true, silent: true });
            T.sim.setSpeed(1);
        }""")
        await pg.wait_for_timeout(4000)
        await shot(ctx, pg, '/downloads/themeB-stage-in-play.png', 1440, 900)
        # 4) arabic briefing (RTL)
        await pg.evaluate("() => document.getElementById('btn-lang')?.click()")
        await pg.wait_for_timeout(700)
        await pg.evaluate("() => { const gm = window.TERRA.ui.gameMode; gm.showBriefing('s6'); }")
        await pg.wait_for_timeout(700)
        await shot(ctx, pg, '/downloads/themeB-briefing-ar.png', 1440, 900)
        print('errs', json.dumps(errs[:4]), flush=True)
        await ctx.close()
        # 5) mobile 390
        ctx2 = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        pg2 = await ctx2.new_page()
        await pg2.goto(f'{BASE}?theme=b&sandbox=1&noassets=1&gfx=low&hour=10&demo=buildings&panel=build', wait_until='load', timeout=45000)
        await pg2.wait_for_timeout(6000)
        await pg2.evaluate("() => window.TERRA.tutorial?.skip?.()")
        await pg2.wait_for_timeout(500)
        await shot(ctx2, pg2, '/downloads/themeB-mobile-sandbox.png', 390, 844)
        await pg2.evaluate("() => { const gm = window.TERRA.ui.gameMode; gm.enterCampaign(); gm.showStages(); gm.showBriefing('s9'); }")
        await pg2.wait_for_timeout(900)
        await shot(ctx2, pg2, '/downloads/themeB-mobile-briefing.png', 390, 844)
        await ctx2.close()
        await b.close()

asyncio.run(main())
