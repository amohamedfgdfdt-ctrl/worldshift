import asyncio, json, threading, functools, http.server, socketserver, time, base64
from playwright.async_api import async_playwright
OUT = '/tmp/shots'; PORT = 8991
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
  T.sim.setSpeed(0);
  const { i, j, di, dj } = spot;
  const lay = (k, bridge) => bs.placeRoad(i + di*k, j + dj*k, true, { bridge });
  for (let k = -10; k <= -1; k++) lay(k, false);
  for (let k = 0; k <= 2; k++) lay(k, true);
  const landings = bs.ensureBridgeEnds();
  bs.net.build();
  const approaches = bs.ensureRampApproaches();
  bs.net.build();
  bs._roadDirty = true; bs._rebuildRoads();
  // buildings beside the road on both banks so traffic has somewhere to go
  const px = dj !== 0 ? 1 : 0, pz = di !== 0 ? 1 : 0;   // perpendicular
  const placed = [];
  for (const k of [-9, -7, -5, 6, 8, 10]) {
    for (const s of [-1, 1]) {
      const ci = i + di*k + px*s, cj = j + dj*k + pz*s;
      const key = placed.length % 2 === 0 ? 'house_small' : 'factory_small';
      const r = bs.place(key, ci, cj, 0, { force: true, silent: true, residents: 20 });
      if (r && r.ok) placed.push([ci, cj, key]);
    }
  }
  bs.emit('change', { type: 'place' });
  const ramps = [...bs.ramps.entries()].map(([idx, r]) => ({
    at: [idx % 128, Math.floor(idx / 128)], low: +r.yLow.toFixed(2), high: +r.yHigh.toFixed(2),
    landing: !!r.landing, onBridge: bs.bridges.has(idx),
  }));
  const bl = [...bs.bridges];
  const diag = [...bs.buildings.values()].map((b) => {
    const c = bs.accessCell(b);
    return { key: b.key, at: [b.cx, b.cz], acc: c, accRoad: c ? bs.roads.has(c[1] * 128 + c[0]) : false };
  });
  return { diag, maxCars: T.world.traffic.maxCars, ok: true, at: [i, j], dir: [di, dj], bridges: bl.length, landings, approaches, placed: placed.length,
           ramps, deckY: bl.length ? +bs.roadY[bl[0]].toFixed(2) : 0, roads: bs.roads.size };
})()
"""

# step the traffic until a car sits on one of the given tiles; returns its pose
STEP = r"""
(args) => {
  const T = window.TERRA, bs = T.world.buildings, tr = T.world.traffic;
  const CELL = 3, HALF = 192;
  const want = new Set(args.tiles.map(([i, j]) => j * 128 + i));
  const inTile = (c) => {
    const i = Math.floor((c._px + HALF) / CELL), j = Math.floor((c._pz + HALF) / CELL);
    return want.has(j * 128 + i);
  };
  T.sim.setSpeed(1);
  for (let step = 0; step < args.steps; step++) {
    T.sim.update(0.1);
    tr.update(0.1, T.sim);
    for (const c of tr.cars) {
      if (!inTile(c)) continue;
      return { found: true, step, cars: tr.cars.length, x: +c._px.toFixed(2), z: +c._pz.toFixed(2),
               y: +c._py.toFixed(2), pitch: +(c.pitch || 0).toFixed(3), yaw: +c.yaw.toFixed(2) };
    }
  }
  return { found: false, cars: tr.cars.length, trips: T.sim.economy.stats.trips || 0,
           sample: tr.cars.slice(0, 4).map((c) => ({ x: +c._px.toFixed(1), z: +c._pz.toFixed(1), y: +c._py.toFixed(2) })) };
}
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
        ramps = info['ramps']
        if not ramps:
            print('no ramps', flush=True); await b.close(); return
        # 1) a car on a ramp tile
        rampTiles = [r['at'] for r in ramps]
        got = await pg.evaluate(STEP, {'tiles': rampTiles, 'steps': 2600})
        print('RAMP_CAR', json.dumps(got), flush=True)
        if got.get('found'):
            await pg.evaluate(CAM, {'x': got['x'], 'y': got['y'] + 1.2, 'z': got['z'], 'yaw': 0.35, 'pitch': 0.30, 'dist': 20})
            await pg.wait_for_timeout(4200)
            await shot(cdp, f'{OUT}/v3-car-ramp.png')
        # 2) a car on the deck
        i, j = info['at']; di, dj = info['dir']
        deckTiles = [[i + di*k, j + dj*k] for k in range(0, info['bridges'])]
        got2 = await pg.evaluate(STEP, {'tiles': deckTiles, 'steps': 2600})
        print('DECK_CAR', json.dumps(got2), flush=True)
        if got2.get('found'):
            await pg.evaluate(CAM, {'x': got2['x'], 'y': got2['y'] + 1.2, 'z': got2['z'], 'yaw': 0.55, 'pitch': 0.28, 'dist': 20})
            await pg.wait_for_timeout(4200)
            await shot(cdp, f'{OUT}/v3-car-deck.png')
        # 3) wide view of the approach
        cx = (i + 0.5) * 3 - 192; cz = (j + 0.5) * 3 - 192
        await pg.evaluate(CAM, {'x': cx, 'y': info['deckY'] - 0.5, 'z': cz, 'yaw': 2.2, 'pitch': 0.22, 'dist': 34})  # noqa
        await pg.wait_for_timeout(4200)
        await shot(cdp, f'{OUT}/v3-bridge-both.png')
        print('ERR', errs[:5], flush=True)
        await b.close()
asyncio.run(main())
