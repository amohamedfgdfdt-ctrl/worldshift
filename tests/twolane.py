import asyncio, json, threading, functools, http.server, socketserver, time, base64
from playwright.async_api import async_playwright
OUT = '/tmp/shots'; PORT = 8991
h = functools.partial(http.server.SimpleHTTPRequestHandler, directory='/tmp/v3')
class S(socketserver.TCPServer): allow_reuse_address = True
srv = S(("127.0.0.1", PORT), h)
threading.Thread(target=srv.serve_forever, daemon=True).start(); time.sleep(0.4)

SETUP = r"""
(() => {
  const T = window.TERRA, bs = T.world.buildings;
  for (const [i, j] of [[40,44],[44,44],[48,44],[52,44],[42,50],[46,50],[50,50],[54,50],[44,38],[50,38]])
    bs.place('house_small', i, j, 0, { force: true, silent: true, residents: 6 });
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
  tap([44, 40], [52, 40]);
  for (let k = 0; k < 600; k++) T.world.traffic.update(0.1, T.sim);
  // find two cars driving towards each other on the same stretch
  const cars = T.world.traffic.cars;
  let best = null;
  for (const a of cars) for (const b of cars) {
    if (a === b) continue;
    const ax = a._px ?? 0, az = a._pz ?? 0, bx = b._px ?? 0, bz = b._pz ?? 0;
    const da = Math.hypot(ax - bx, az - bz);
    if (da > 16 || da < 2) continue;
    const ha = a.yaw || 0, hb = b.yaw || 0;
    const dot = Math.cos(ha) * Math.cos(hb) + Math.sin(ha) * Math.sin(hb);
    if (dot > -0.4) continue;
    if (!best || da < best.d) best = { d: +da.toFixed(2), x: (ax + bx) / 2, z: (az + bz) / 2, a: [+ax.toFixed(2), +az.toFixed(2)], b: [+bx.toFixed(2), +bz.toFixed(2)] };
  }
  return { cars: cars.length, trips: T.sim.economy.stats.trips || 0, roads: bs.roads.size,
           pair: best, sample: cars.slice(0, 3).map((c) => ({ x: +(c._px || 0).toFixed(2), z: +(c._pz || 0).toFixed(2), h: +(c.yaw || 0).toFixed(2) })) };
})()
"""

async def shot(cdp, path):
    r = await cdp.send('Page.captureScreenshot', {'format': 'png'})
    open(path, 'wb').write(base64.b64decode(r['data']))

CAM = """(a) => { const T=window.TERRA, g=T.world.rig.goal;
  g.target.set(a.x, T.world.field.heightAt(a.x,a.z) + (a.up||0), a.z); g.yaw=a.yaw; g.pitch=a.pitch; g.dist=a.dist;
  T.world.rig._snap(); T.world.rig.update(0.001, T.world.viewH); return true; }"""

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox','--use-angle=swiftshader','--use-gl=angle','--enable-unsafe-swiftshader','--enable-webgl'])
        ctx = await b.new_context(viewport={'width': 1100, 'height': 680})
        pg = await ctx.new_page(); cdp = await ctx.new_cdp_session(pg)
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)[:250]))
        await pg.goto(f'http://127.0.0.1:{PORT}/index.html?sandbox=1&noassets=1&gfx=medium&hour=10&cam=-49,-46,0.9,0.92,58', wait_until='load', timeout=45000)
        await pg.wait_for_timeout(4800)
        await pg.evaluate(SETUP)
        info = await pg.evaluate(TAP)
        print('INFO', json.dumps(info), flush=True)
        pair = info.get('pair')
        tgt = pair if pair else {'x': -49, 'z': -46}
        await pg.evaluate(CAM, {'x': tgt['x'], 'z': tgt['z'], 'yaw': 0.9, 'pitch': 0.42, 'dist': 20, 'up': 1.2})
        await pg.wait_for_timeout(4200)
        await shot(cdp, f'{OUT}/v3-twolane.png')
        await pg.evaluate(CAM, {'x': tgt['x'], 'z': tgt['z'], 'yaw': 2.4, 'pitch': 0.55, 'dist': 16, 'up': 1.2})
        await pg.wait_for_timeout(4200)
        await shot(cdp, f'{OUT}/v3-twolane2.png')
        print('ERR', errs[:5], flush=True)
        await b.close()
asyncio.run(main())
