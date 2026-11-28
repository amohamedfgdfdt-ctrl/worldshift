import asyncio, json, threading, functools, http.server, socketserver, time, base64
from playwright.async_api import async_playwright
ROOT='/tmp/v3'; OUT='/tmp/shots'; PORT=8961
h=functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
class S(socketserver.TCPServer): allow_reuse_address=True
srv=S(("127.0.0.1",PORT),h); threading.Thread(target=srv.serve_forever,daemon=True).start(); time.sleep(0.4)

FIND = r"""
(() => {
  const T = window.TERRA, w = T.world.water, d = w.depth, N = 128, V = 129;
  const depth = (i, j) => d[j * V + i];
  // narrow crossing: dry cell, wet in the middle, dry 5 cells away, along X or Z
  for (let j = 20; j < 108; j++) for (let i = 20; i < 108; i++) {
    for (const [di, dj] of [[1,0],[0,1]]) {
      const mid = depth(i + di*2, j + dj*2), mid2 = depth(i + di*3, j + dj*3);
      const a = depth(i, j), b = depth(i + di*5, j + dj*5);
      if (a < 0.02 && b < 0.02 && mid > 0.55 && mid2 > 0.55 && depth(i+di, j+dj) < 0.3 && depth(i+di*4, j+dj*4) < 0.3)
        return { a: [i, j], b: [i + di*5, j + dj*5], depth: +mid.toFixed(2) };
    }
  }
  return null;
})()
"""

BUILD = r"""
(args) => {
  const T = window.TERRA, bs = T.world.buildings;
  const [ax, az] = args.a, [bx, bz] = args.b;
  bs.place('house_small', ax, az, 0, { force: true, silent: true, residents: 6 });
  bs.place('factory_small', bx, bz, 0, { force: true, silent: true });
  bs.emit('change', { type: 'place' });
  const r = bs.buildRoute([ax, az], [bx, bz]);
  T.sim.setSpeed(4);
  const bridges = [...bs.bridges];
  const maxDepth = bridges.length ? Math.max(...bridges.map((i) => T.world.water.depth[Math.floor(i/128)*129 + (i%128)])) : 0;
  return { ok: r.ok, cells: r.cells, bridges: bridges.length, maxDepth: +maxDepth.toFixed(2),
           deckY: bridges.length ? +bs.roadY[bridges[0]].toFixed(2) : 0 };
}
"""

CAM = r"""
(args) => {
  const T = window.TERRA, g = T.world.rig.goal;
  g.target.set(args.x, T.world.field.heightAt(args.x, args.z), args.z);
  g.yaw = args.yaw; g.pitch = args.pitch; g.dist = args.dist;
  T.world.rig._snap(); T.world.rig.update(0.001, T.world.viewH);
  return true;
}
"""

async def shot(cdp, path):
    r = await cdp.send('Page.captureScreenshot', {'format':'png'})
    open(path,'wb').write(base64.b64decode(r['data']))

async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox','--use-angle=swiftshader','--use-gl=angle','--enable-unsafe-swiftshader','--enable-webgl'])
        ctx=await b.new_context(viewport={'width':1100,'height':680})
        pg=await ctx.new_page(); cdp=await ctx.new_cdp_session(pg)
        errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)[:250]))
        await pg.goto(f'http://127.0.0.1:{PORT}/index.html?sandbox=1&noassets=1&gfx=low&hour=10', wait_until='load', timeout=45000)
        await pg.wait_for_timeout(5000)
        spot = await pg.evaluate(FIND)
        print('FIND', json.dumps(spot), flush=True)
        if not spot: print('no crossing found', flush=True); await b.close(); return
        res = await pg.evaluate(BUILD, spot)
        print('BUILD', json.dumps(res), flush=True)
        # camera on the bridge, low angle so piers/parapet read
        cx = (spot['a'][0] + spot['b'][0]) / 2, 
        mx = ((spot['a'][0] + spot['b'][0]) / 2 + 0.5) * 3 - 192
        mz = ((spot['a'][1] + spot['b'][1]) / 2 + 0.5) * 3 - 192
        for yaw, pitch, dist, name in [(1.15, 0.30, 20, 'v3-bridge-new.png'), (2.3, 0.22, 14, 'v3-bridge-side.png')]:
            await pg.evaluate(CAM, {'x': mx, 'z': mz, 'yaw': yaw, 'pitch': pitch, 'dist': dist})
            await pg.wait_for_timeout(1400)
            await shot(cdp, f'{OUT}/{name}')
        # two-way traffic on a straight stretch: run the sim, then shoot from above
        await pg.evaluate("(() => { const T=window.TERRA; for (let k=0;k<420;k++) T.world.traffic.update(0.1,T.sim); })()")
        st = await pg.evaluate("(() => { const T=window.TERRA; return {cars:T.world.traffic.count, trips:T.sim.economy.stats.trips||0, err:window.__err||null}; })()")
        print('TRAFFIC', json.dumps(st), flush=True)
        await pg.evaluate(CAM, {'x': mx, 'z': mz, 'yaw': 1.0, 'pitch': 0.85, 'dist': 46})
        await pg.wait_for_timeout(1600)
        await shot(cdp, f'{OUT}/v3-twolane.png')
        print('ERR', errs[:5], flush=True)
        await b.close()
asyncio.run(main())
