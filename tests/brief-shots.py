import asyncio, json, threading, functools, http.server, socketserver, time, sys, base64
from playwright.async_api import async_playwright
PORT = 9007
h = functools.partial(http.server.SimpleHTTPRequestHandler, directory='/tmp/v3')
class S(socketserver.TCPServer): allow_reuse_address = True
srv = S(("127.0.0.1", PORT), h)
threading.Thread(target=srv.serve_forever, daemon=True).start(); time.sleep(0.3)

SHOTS = [
    ('s1', 'en', 1280, 800, '/downloads/brief-s1-en.png'),
    ('s6', 'en', 1280, 800, '/downloads/brief-s6-en.png'),
    ('s9', 'ar', 1280, 800, '/downloads/brief-s9-ar.png'),

    # (stage, lang, width, height, outfile)
    ('s6', 'en', 390, 844, '/downloads/brief-s6-mobile-en.png'),
    ('s9', 'ar', 390, 844, '/downloads/brief-s9-mobile-ar.png'),
]

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome',
            args=['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        for stage, lang, w, hh, out in SHOTS:
            ctx = await b.new_context(viewport={'width': w, 'height': hh}, device_scale_factor=1)
            pg = await ctx.new_page()
            errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
            await pg.goto(f'http://127.0.0.1:{PORT}/index.html?sandbox=1&noassets=1&gfx=low&hour=10', wait_until='load', timeout=45000)
            await pg.wait_for_timeout(3800)
            await pg.evaluate("() => { localStorage.setItem('ws_lang','en'); }")
            # switch to the requested language, then open the briefing
            await pg.evaluate("""(lang) => {
                const gm = window.TERRA.ui.gameMode;
                const cur = document.documentElement.lang || 'en';
                if (cur !== lang) document.getElementById('btn-lang')?.click();
            }""", lang)
            await pg.wait_for_timeout(400)
            await pg.evaluate("(id) => window.TERRA.ui.gameMode.showBriefing(id)", stage)
            await pg.wait_for_timeout(900)
            info = await pg.evaluate("""() => {
                const el = document.getElementById('cmp-brief');
                const wrap = el?.querySelector('.brief-wrap');
                return { hidden: el?.hidden, lang: document.documentElement.lang, dir: document.documentElement.dir,
                         cards: el?.querySelectorAll('.brief-card').length,
                         h: wrap?.getBoundingClientRect().height, w: wrap?.getBoundingClientRect().width,
                         title: el?.querySelector('h2')?.textContent };
            }""")
            cdp = await ctx.new_cdp_session(pg)
            r = await cdp.send('Page.captureScreenshot', {'format': 'png'})
            open(out, 'wb').write(base64.b64decode(r['data']))
            print(json.dumps({'out': out, 'info': info, 'errs': errs[:3]}, ensure_ascii=False), flush=True)
            await ctx.close()
        await b.close()

asyncio.run(main())
