# Browser check for the auto-road tool + traffic (Stage J).
# Places a village, drives the real road tool with real taps (raycast -> snap ->
# route -> build), reads the live simulation back and captures screenshots over
# CDP (page.screenshot waits on font loading in this headless build).
import sys, json, asyncio, threading, functools, http.server, socketserver, time, base64
from playwright.async_api import async_playwright

ROOT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/v3'
OUT = sys.argv[2] if len(sys.argv) > 2 else '/tmp/shots'
PORT = 8903


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
  const houses = [];
  const spots = [[40,44],[44,44],[48,44],[52,44],[42,50],[46,50],[50,50],[54,50]];
  for (const [i, j] of spots) {
    const r = bs.place('house_small', i, j, 0, { force: true, silent: true, residents: 4 });
    if (r.ok) houses.push(r.building.id);
  }
  for (const [i, j] of [[44,54],[52,54]]) bs.place('farm', i, j, 0, { force: true, silent: true });
  bs.emit('change', { type: 'place' });
  T.sim.setSpeed(4);
  const id = houses[0];
  T.tools.select({ kind: 'building', id });
  return { houses: houses.length, buildings: bs.buildings.size, roads: bs.roads.size, pop: T.sim.economy.s.pop };
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
  const out = {};
  const tap = (a, b, key) => {
    T.tools.setMode('road');
    const p = screen(a[0], a[1]), q = screen(b[0], b[1]);
    T.tools.onTap({ x: p.x, y: p.y, type: 'mouse' });
    out[key + 'Started'] = !!T.tools.anchor;
    T.tools.onTap({ x: q.x, y: q.y, type: 'mouse' });
    out[key + 'Done'] = T.tools.anchor === null;
    T.tools.setMode('select');
  };
  tap([40, 42], [54, 52], 'main');       // through the village
  tap([44, 52], [44, 56], 'farmSpur');   // out to the farms
  out.roads = bs.roads.size; out.bridges = bs.bridges.size;
  out.access = [...bs.buildings.values()].filter((x) => !!bs.accessCell(x)).length;
  out.buildings = bs.buildings.size;
  out.components = bs.net.components;
  return out;
})()
"""

SIM = r"""
(() => {
  const T = window.TERRA;
  const before = T.world.traffic.trips;
  const d0 = T.world.traffic.cars.map((c) => c.dist);
  for (let k = 0; k < 500; k++) T.world.traffic.update(0.1, T.sim);
  const moved = T.world.traffic.cars.map((c, i) => +(c.dist - (d0[i] || 0)).toFixed(1));
  return { tripsBefore: before, tripsAfter: T.world.traffic.trips, cars: T.world.traffic.cars.length, movedMax: Math.max(0, ...moved), moved };
})()
"""

BRIDGE = r"""
(async () => {
  const T = window.TERRA, bs = T.world.buildings, f = T.world.field, w = T.world.water;
  const CELL = 3, HALF = 192, N = 128;
  // find a river tile in the south half and a dry tile on each bank
  let best = null;
  for (let j = 60; j < 110 && !best; j++) {
    for (let i = 30; i < 100; i++) {
      if (w.depth[j * 129 + i] < 0.25) continue;
      let left = -1, right = -1;
      for (let k = i; k > i - 12 && left < 0; k--) if (w.depth[j * 129 + k] < 0.03) left = k;
      for (let k = i; k < i + 12 && right < 0; k++) if (w.depth[j * 129 + k] < 0.03) right = k;
      if (left >= 0 && right >= 0 && right - left <= 5) { best = { j, left, right }; break; }
    }
  }
  if (!best) return { ok: false, reason: 'no river found' };
  const a = [best.left - 1, best.j], b = [best.right + 1, best.j];
  const r = bs.routeCells(a, b);
  const built = bs.buildRoute(a, b);
  T.tools.setMode('select');
  return {
    ok: built.ok, routeTiles: r.cells ? r.cells.length : 0, bridges: r.bridges,
    built: built.built, bridgeTiles: bs.bridges.size, cross: best,
  };
})()
"""

READ = r"""
(() => {
  const T = window.TERRA, bs = T.world.buildings, s = T.sim.economy.s;
  return {
    roads: bs.roads.size, bridges: bs.bridges.size, components: bs.net.components,
    cars: T.world.traffic.count, trips: T.sim.economy.stats.trips || 0,
    connected: s.connected, connectedHouses: s.connectedHouses, houseAccess: +(s.houseAccess || 0).toFixed(2),
    pop: s.pop, income: Math.round(s.income || 0), carBudget: T.world.traffic.maxCars,
    fps: Math.round(T.perf.fps || 0), lifeErr: window.__lifeErr || null, err: window.__err || null,
  };
})()
"""


async def shot(pg, cdp, path):
    res = await cdp.send('Page.captureScreenshot', {'format': 'png', 'captureBeyondViewport': False})
    with open(path, 'wb') as fh:
        fh.write(base64.b64decode(res['data']))


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=[
            '--no-sandbox', '--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader',
            '--ignore-gpu-blocklist', '--enable-webgl'])
        ctx = await b.new_context(viewport={'width': 1100, 'height': 680})
        pg = await ctx.new_page()
        cdp = await ctx.new_cdp_session(pg)
        logs = []
        pg.on('console', lambda m: logs.append(m.type + ': ' + m.text[:200]))
        pg.on('pageerror', lambda e: logs.append('PAGEERROR: ' + str(e)[:300]))
        url = f'http://127.0.0.1:{PORT}/index.html?sandbox=1&noassets=1&gfx=low&hour=10&cam=-49,-46,0.9,0.92,58'
        await pg.goto(url, wait_until='load', timeout=45000)
        await pg.wait_for_timeout(5000)
        print('SETUP', json.dumps(await pg.evaluate(SETUP)), flush=True)
        await pg.wait_for_timeout(1500)
        await shot(pg, cdp, f'{OUT}/v3-before.png')
        print('TAP', json.dumps(await pg.evaluate(TAP)), flush=True)
        await pg.wait_for_timeout(2500)
        await shot(pg, cdp, f'{OUT}/v3-roads.png')
        await pg.wait_for_timeout(9000)
        print('READ', json.dumps(await pg.evaluate(READ)), flush=True)
        await shot(pg, cdp, f'{OUT}/v3-traffic.png')
        print('BRIDGE', json.dumps(await pg.evaluate(BRIDGE)), flush=True)
        await pg.wait_for_timeout(2500)
        print('READ2', json.dumps(await pg.evaluate(READ)), flush=True)
        await shot(pg, cdp, f'{OUT}/v3-bridge.png')
        errs = [l for l in logs if l.startswith('error') or l.startswith('PAGEERROR')]
        print('ERRORS', json.dumps(errs[:8]), flush=True)
        await b.close()

asyncio.run(main())
