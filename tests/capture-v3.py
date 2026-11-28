# Final capture pass: village + auto roads + traffic, a bridge close-up, and a
# mobile-viewport shot. Uses CDP screenshots (page.screenshot waits on fonts).
import sys, json, asyncio, threading, functools, http.server, socketserver, time, base64
from playwright.async_api import async_playwright

ROOT = '/tmp/v3'
OUT = '/tmp/shots'
PORT = 8904


def serve():
    h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)

    class S(socketserver.TCPServer):
        allow_reuse_address = True

    with S(("127.0.0.1", PORT), h) as httpd:
        httpd.serve_forever()


threading.Thread(target=serve, daemon=True).start()
time.sleep(0.5)

SETUP = r"""
(() => {
  const T = window.TERRA, bs = T.world.buildings;
  const spots = [[40,44],[44,44],[48,44],[52,44],[42,50],[46,50],[50,50],[54,50]];
  for (const [i, j] of spots) bs.place('house_small', i, j, 0, { force: true, silent: true, residents: 4 });
  for (const [i, j] of [[44,54],[52,54]]) bs.place('farm', i, j, 0, { force: true, silent: true });
  bs.emit('change', { type: 'place' });
  T.sim.setSpeed(4);
  return { buildings: bs.buildings.size, roads: bs.roads.size };
})()
"""

TAP = r"""
(async () => {
  const T = window.TERRA, bs = T.world.buildings, f = T.world.field;
  const THREE = await import('/vendor/three.module.min.js');
  const CELL = 3, HALF = 192;
  const rect = T.world.canvas.getBoundingClientRect();
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
  const out = {
    roads: bs.roads.size, bridges: bs.bridges.size, components: bs.net.components,
    access: [...bs.buildings.values()].filter((x) => !!bs.accessCell(x)).length,
  };
  // frame the first bridge tile
  const b0 = [...bs.bridges][0];
  if (b0 !== undefined) {
    const i = b0 % 128, j = Math.floor(b0 / 128);
    out.bridgeAt = [i, j];
    const g = T.world.rig.goal;
    const x = (i + 0.5) * CELL - HALF, z = (j + 0.5) * CELL - HALF;
    g.target.set(x, T.world.field.heightAt(x, z), z); g.yaw = 0.9; g.pitch = 0.42; g.dist = 22;
    T.world.rig._snap(); T.world.rig.update(0.001, T.world.viewH);
  }
  return out;
})()
"""

READ = r"""
(() => {
  const T = window.TERRA, bs = T.world.buildings, s = T.sim.economy.s;
  return {
    roads: bs.roads.size, bridges: bs.bridges.size, components: bs.net.components,
    cars: T.world.traffic.count, trips: T.sim.economy.stats.trips || 0,
    connected: s.connected, houseAccess: +(s.houseAccess || 0).toFixed(2), pop: s.pop,
    carsMoved: T.world.traffic.cars.map((c) => +c.dist.toFixed(1)).slice(0, 6),
    err: window.__err || null, lifeErr: window.__lifeErr || null,
  };
})()
"""


async def shot(cdp, path):
    res = await cdp.send('Page.captureScreenshot', {'format': 'png', 'captureBeyondViewport': False})
    open(path, 'wb').write(base64.b64decode(res['data']))


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=[
            '--no-sandbox', '--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader',
            '--ignore-gpu-blocklist', '--enable-webgl'])
        ctx = await b.new_context(viewport={'width': 1100, 'height': 680})
        pg = await ctx.new_page()
        cdp = await ctx.new_cdp_session(pg)
        logs = []
        pg.on('pageerror', lambda e: logs.append('PAGEERROR: ' + str(e)[:300]))
        url = f'http://127.0.0.1:{PORT}/index.html?sandbox=1&noassets=1&gfx=low&hour=10&cam=-49,-46,0.9,0.92,58'
        await pg.goto(url, wait_until='load', timeout=45000)
        await pg.wait_for_timeout(4500)
        print('SETUP', json.dumps(await pg.evaluate(SETUP)), flush=True)
        print('TAP', json.dumps(await pg.evaluate(TAP)), flush=True)
        await pg.wait_for_timeout(7000)
        print('READ', json.dumps(await pg.evaluate(READ)), flush=True)
        await shot(cdp, f'{OUT}/v3-bridge.png')
        # back to the village and let traffic run
        await pg.evaluate("""(() => { const T = window.TERRA, g = T.world.rig.goal;
          g.target.set(-49, T.world.field.heightAt(-49, -46), -46); g.yaw = 0.9; g.pitch = 0.92; g.dist = 58;
          T.world.rig._snap(); T.world.rig.update(0.001, T.world.viewH);
          for (let k = 0; k < 260; k++) T.world.traffic.update(0.1, T.sim);
        })()""")
        await pg.wait_for_timeout(2500)
        print('READ2', json.dumps(await pg.evaluate(READ)), flush=True)
        await shot(cdp, f'{OUT}/v3-traffic2.png')
        # mobile viewport
        await pg.set_viewport_size({'width': 390, 'height': 844})
        await pg.wait_for_timeout(3500)
        await pg.evaluate("""(() => { const T = window.TERRA, g = T.world.rig.goal;
          g.target.set(-49, T.world.field.heightAt(-49, -46), -46); g.yaw = 0.9; g.pitch = 0.85; g.dist = 70;
          T.world.rig._snap(); T.world.rig.update(0.001, T.world.viewH);
        })()""")
        await pg.wait_for_timeout(2500)
        print('MOBILE', json.dumps(await pg.evaluate("({w: innerWidth, h: innerHeight, px: T.world.pixelRatio ? 1 : 0, err: window.__err||null})")), flush=True)
        await shot(cdp, f'{OUT}/v3-mobile.png')
        print('ERRORS', json.dumps(logs[:6]), flush=True)
        await b.close()

asyncio.run(main())
