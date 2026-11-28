import asyncio, json, threading, functools, http.server, socketserver, time, base64
from playwright.async_api import async_playwright
OUT = '/tmp/shots'; PORT = 8985
h = functools.partial(http.server.SimpleHTTPRequestHandler, directory='/tmp/v3')
class S(socketserver.TCPServer): allow_reuse_address = True
srv = S(("127.0.0.1", PORT), h)
threading.Thread(target=srv.serve_forever, daemon=True).start(); time.sleep(0.4)

BUILD = r"""
(() => {
  const T = window.TERRA, bs = T.world.buildings, d = T.world.water.depth, V = 129;
  const dep = (i, j) => d[j * V + i];
  let spot = null;
  for (let j = 30; j < 100 && !spot; j++) for (let i = 30; i < 100 && !spot; i++) {
    for (const [di, dj] of [[1,0],[0,1]]) {
      const w1 = dep(i + di, j + dj), w2 = dep(i + di*2, j + dj*2);
      if (w1 > 0.55 && w2 > 0.55 && dep(i, j) < 0.05 && dep(i + di*3, j + dj*3) < 0.05
          && dep(i - di, j - dj) < 0.05 && dep(i + di*4, j + dj*4) < 0.05) { spot = { i, j, di, dj }; break; }
    }
  }
  if (!spot) return { ok: false };
  const { i, j, di, dj } = spot;
  const lay = (k, bridge) => bs.placeRoad(i + di*k, j + dj*k, true, { bridge });
  for (let k = -9; k <= -1; k++) lay(k, false);
  for (let k = 0; k <= 2; k++) lay(k, true);
  for (let k = 3; k <= 9; k++) lay(k, false);
  bs._roadDirty = true; bs._rebuildRoads();
  // buildings beside each bank so trips actually cross the bridge
  const px = dj !== 0 ? 1 : 0, pz = di !== 0 ? 1 : 0;   // perpendicular offset
  const spots = [];
  for (const k of [-8, -7, -6, 4, 5, 6]) for (const side of [-1, 1]) spots.push({ k, s: side });
  const placed = [];
  for (const sp of spots) {
    const ci = i + di*sp.k + px*sp.s, cj = j + dj*sp.k + pz*sp.s;
    const key = placed.length % 3 === 0 ? 'house_small' : placed.length % 3 === 1 ? 'factory_small' : 'farm';
    const r = bs.place(key, ci, cj, 0, { force: true, silent: true, residents: 8 });
    if (r && r.ok) placed.push({ key, ci, cj });
  }
  bs.emit('change', { type: 'place' });
  T.sim.setSpeed(4);
  for (let k = 0; k < 900; k++) T.world.traffic.update(0.1, T.sim);
  const rampIdx = [...bs.ramps.keys()];
  const ramp = bs.ramps.get(rampIdx[0]);
  const cars = T.world.traffic.cars.map((c) => ({ x: +c._px.toFixed(2), z: +c._pz.toFixed(2), y: +c._py.toFixed(2) }));
  const onSlope = cars.filter((c) => c.y > ramp.yLow + 0.02 && c.y < ramp.yHigh - 0.02).length;
  return { ok: true, at: [i, j], dir: [di, dj], deckY: +bs.roadY[[...bs.bridges][0]].toFixed(2),
           ramps: rampIdx.map((k) => { const r = bs.ramps.get(k); return { at: [k % 128, Math.floor(k / 128)], low: +r.yLow.toFixed(2), high: +r.yHigh.toFixed(2) }; }),
           rampProfile: [+bs.rampHeight(rampIdx[0], 0).toFixed(2), +bs.rampHeight(rampIdx[0], 0.5).toFixed(2), +bs.rampHeight(rampIdx[0], 1).toFixed(2)],
           placed: placed.length, cars: cars.length, trips: T.sim.economy.stats.trips || 0, onSlope, sample: cars.slice(0, 6) };
})()
"""

async def shot(cdp, path):
    r = await cdp.send('Page.captureScreenshot', {'format': 'png'})
    open(path, 'wb').write(base64.b64decode(r['data']))

CAM = """(a) => { const T=window.TERRA, g=T.world.rig.goal;
  g.target.set(a.x, a.y, a.z); g.yaw=a.yaw; g.pitch=a.pitch; g.dist=a.dist;
  T.world.rig._snap(); T.world.rig.update(0.001, T.world.viewH); return true; }"""

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox','--use-angle=swiftshader','--use-gl=angle','--enable-unsafe-swiftshader','--enable-webgl'])
        ctx = await b.new_context(viewport={'width': 1100, 'height': 680})
        pg = await ctx.new_page(); cdp = await ctx.new_cdp_session(pg)
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)[:250]))
        await pg.goto(f'http://127.0.0.1:{PORT}/index.html?sandbox=1&noassets=1&gfx=medium&hour=10', wait_until='load', timeout=45000)
        await pg.wait_for_timeout(4800)
        info = await pg.evaluate(BUILD)
        print('BUILD', json.dumps(info), flush=True)
        if not info.get('ok'):
            await b.close(); return
        i, j = info['at']; y = info['deckY']
        cx = (i + 0.5) * 3 - 192; cz = (j + 0.5) * 3 - 192
        plan = [(cx, cz, 2.2, 0.16, 22, 'v3-bridge-side.png'), (cx, cz, 0.85, 0.42, 30, 'v3-bridge-new.png')]
        if info.get('ramps'):
            ri, rj = info['ramps'][0]['at']
            plan.append(((ri + 0.5) * 3 - 192, (rj + 0.5) * 3 - 192, 1.9, 0.52, 13, 'v3-ramp.png'))
        for tx, tz, yaw, pitch, dist, name in plan:
            await pg.evaluate(CAM, {'x': tx, 'y': y - 0.5, 'z': tz, 'yaw': yaw, 'pitch': pitch, 'dist': dist})
            await pg.wait_for_timeout(4200)
            await shot(cdp, f'{OUT}/{name}')
        print('ERR', errs[:5], flush=True)
        await b.close()
asyncio.run(main())
