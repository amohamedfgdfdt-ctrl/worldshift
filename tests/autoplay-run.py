import asyncio, json, threading, functools, http.server, socketserver, time, sys
from playwright.async_api import async_playwright
PORT = 9005
h = functools.partial(http.server.SimpleHTTPRequestHandler, directory='/tmp/v3')
class S(socketserver.TCPServer): allow_reuse_address = True
srv = S(("127.0.0.1", PORT), h)
threading.Thread(target=srv.serve_forever, daemon=True).start(); time.sleep(0.4)

STAGES = sys.argv[1].split(',') if len(sys.argv) > 1 else ['s1']
MAXSTEPS = int(sys.argv[2]) if len(sys.argv) > 2 else 2400

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        ctx = await b.new_context(viewport={'width': 900, 'height': 600})
        pg = await ctx.new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)[:300]))
        await pg.goto(f'http://127.0.0.1:{PORT}/index.html?sandbox=1&noassets=1&gfx=low&hour=9', wait_until='load', timeout=45000)
        await pg.wait_for_timeout(4200)
        await pg.add_script_tag(path='/tmp/v3/tests/autoplay.js')
        for sid in STAGES:
            try:
                r = await pg.evaluate('(a) => window.AUTOPLAY(a.sid, a.opts)', {'sid': sid, 'opts': {'maxSteps': MAXSTEPS}})
            except Exception as e:
                r = {'stage': sid, 'error': str(e)[:200]}
            print('STAGE ' + json.dumps(r, ensure_ascii=False), flush=True)
        print('ERR ' + json.dumps(errs[:5]), flush=True)
        await b.close()

asyncio.run(main())
