import asyncio, json, threading, functools, http.server, socketserver, time, base64
from playwright.async_api import async_playwright
OUT = '/tmp/shots'; PORT = 8977
h = functools.partial(http.server.SimpleHTTPRequestHandler, directory='/tmp/v3')
class S(socketserver.TCPServer): allow_reuse_address = True
srv = S(("127.0.0.1", PORT), h)
threading.Thread(target=srv.serve_forever, daemon=True).start(); time.sleep(0.4)

SETUP = r"""
(() => {
  const T = window.TERRA, bs = T.world.buildings;
  for (const [i, j] of [[40,44],[44,44],[48,44],[52,44],[42,50],[46,50],[50,50],[54,50]])
    bs.place('house_small', i, j, 0, { force: true, silent: true, residents: 5 });
  for (const [i, j] of [[44,54],[52,54]]) bs.place('farm', i, j, 0, { force: true, silent: true });
  bs.emit('change', { type: 'place' });
  T.sim.setSpeed(4);
  return { buildings: bs.buildings.size };
})()
"""

TAP = r"""
(async () => {
  const T = window.TERRA, bs = T.world.buildings, f = T.world.field;
  const THREE = await import('/vendor/three.module.min.js');
  const CELL = 3, HALF = 192, rect = T.world.canvas.getBoundingClientRect();
  const screen = (i, j) => {
    const x = (i + 0.5) * CELL - HALF, z = (j + 0.5) * CELL - HALF;
    const v = new THREE.Vector3(x, f.heightAt(x, z), z).project(T.world.rig.camera);
    return { x: rect.left + (v.x * 0.5 + 0.5) * rect.width, y: rect.top + (-v.y * 0.5 + 0.5) * rect.height };
  };
  const tap = (a, b) => {
    T.tools.setMode('road');
    const p = screen(a[0], a[1]), q = screen(b[0], b[1]);
    T.tools.onTap({ x: p.x, y: p.y, type: 'mouse' });
    T.tools.onTap({ x: q.x, y: q.y, type: 'mouse' });
    T.tools.setMode('select');
  };
  tap([40, 42], [54, 52]);
  tap([44, 46], [44, 56]);
  const bl = [...bs.bridges];
  const b0 = bl[0];
  if (b0 === undefined) return { bridges: 0 };
  const i = b0 % 128, j = Math.floor(b0 / 128);
  // flood the dip under the deck with a spring a couple of tiles downhill
  const src = T.world.water.addSource(i + 1, j + 3, 90);
  for (let k = 0; k < 420; k++) T.world.water.step(1);
  T.world.water.update && T.world.water.update(true);
  bs.recalcBridges();
  bs._roadDirty = true; bs._rebuildRoads();
  T.world.refreshWaterTexture && T.world.refreshWaterTexture();
  const dep = T.world.water.depth;
  return { roads: bs.roads.size, bridges: bl.length, at: [i, j], src: src && src.id,
           depthHere: +dep[j * 129 + i].toFixed(2), deckY: +bs.roadY[b0].toFixed(2) };
})()
"""

async def shot(cdp, path):
    r = await cdp.send('Page.captureScreenshot', {'format': 'png'})
    open(path, 'wb').write(base64.b64decode(r['data']))

CAM = """(a) => { const T=window.TERRA, g=T.world.rig.goal;
  g.target.set(a.x, T.world.field.heightAt(a.x,a.z), a.z); g.yaw=a.yaw; g.pitch=a.pitch; g.dist=a.dist;
  T.world.rig._snap(); T.world.rig.update(0.001, T.world.viewH); return true; }"""

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox','--use-angle=swiftshader','--use-gl=angle','--enable-unsafe-swiftshader','--enable-webgl'])
        ctx = await b.new_context(viewport={'width': 1100, 'height': 680})
        pg = await ctx.new_page(); cdp = await ctx.new_cdp_session(pg)
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)[:250]))
        await pg.goto(f'http://127.0.0.1:{PORT}/index.html?sandbox=1&noassets=1&gfx=low&hour=10&cam=-49,-46,0.9,0.92,58', wait_until='load', timeout=45000)
        await pg.wait_for_timeout(4800)
        await pg.evaluate(SETUP)
        info = await pg.evaluate(TAP)
        print('TAP', json.dumps(info), flush=True)
        if not info.get('at'):
            await b.close(); return
        i, j = info['at']
        mx = (i + 0.5) * 3 - 192; mz = (j + 0.5) * 3 - 192
        for yaw, pitch, dist, name in [(0.75, 0.50, 24, 'v3-bridge-new.png'), (2.4, 0.35, 16, 'v3-bridge-side.png')]:
            await pg.evaluate(CAM, {'x': mx, 'z': mz, 'yaw': yaw, 'pitch': pitch, 'dist': dist})
            await pg.wait_for_timeout(4200)
            await shot(cdp, f'{OUT}/{name}')
        await pg.evaluate("(() => { const T=window.TERRA; for (let k=0;k<420;k++) T.world.traffic.update(0.1,T.sim); })()")
        st = await pg.evaluate("(() => { const T=window.TERRA; return {cars:T.world.traffic.count, trips:T.sim.economy.stats.trips||0}; })()")
        print('TRAFFIC', json.dumps(st), flush=True)
        await pg.evaluate(CAM, {'x': mx, 'z': mz, 'yaw': 0.9, 'pitch': 0.62, 'dist': 34})
        await pg.wait_for_timeout(4200)
        await shot(cdp, f'{OUT}/v3-twolane.png')
        print('ERR', errs[:5], flush=True)
        await b.close()
asyncio.run(main())
