import asyncio, json, threading, functools, http.server, socketserver, time, base64, math
from playwright.async_api import async_playwright
from PIL import Image
OUT = '/tmp/shots'; PORT = 9002
h = functools.partial(http.server.SimpleHTTPRequestHandler, directory='/tmp/v3')
class S(socketserver.TCPServer): allow_reuse_address = True
srv = S(("127.0.0.1", PORT), h)
threading.Thread(target=srv.serve_forever, daemon=True).start(); time.sleep(0.4)

BUILD = open('/tmp/v3/tests/cross-shots.py').read().split('BUILD = r"""')[1].split('"""')[0]

# run the sim and audit every car: is it on a road tile, how far off the centre line,
# and which way is it heading?
AUDIT = r"""
(args) => {
  const T = window.TERRA, bs = T.world.buildings, tr = T.world.traffic, N = 128, CELL = 3, HALF = 192;
  const [i0, j0] = args.at, [di, dj] = args.dir;
  const axisX = di !== 0;
  const zc = (j0 + 0.5) * CELL - HALF, xc = (i0 + 0.5) * CELL - HALF;
  const bridge = new Set(bs.bridges);
  const ramps = new Set(bs.ramps.keys());
  let samples = 0, offRoad = 0, worst = 0, worstCar = null, bridgeSamples = 0, rampSamples = 0;
  const dirs = { up: 0, down: 0 };
  let worstTile = null;
  T.sim.setSpeed(1);
  for (let step = 0; step < args.steps; step++) {
    T.sim.update(0.1); tr.update(0.1, T.sim);
    for (const c of tr.cars) {
      const i = Math.floor((c._px + HALF) / CELL), j = Math.floor((c._pz + HALF) / CELL);
      const idx = j * N + i;
      samples++;
      if (!bs.roads.has(idx)) { offRoad++; worstTile = [i, j]; }
      if (bridge.has(idx) || ramps.has(idx)) {
        const lat = axisX ? Math.abs(c._pz - zc) : Math.abs(c._px - xc);
        if (bridge.has(idx)) bridgeSamples++; else rampSamples++;
        if (lat > worst) { worst = +lat.toFixed(3); worstCar = { x: +c._px.toFixed(2), z: +c._pz.toFixed(2), y: +c._py.toFixed(2), yaw: +c.yaw.toFixed(2), pitch: +(c.pitch || 0).toFixed(3), onBridge: bridge.has(idx) }; }
        const fwd = axisX ? Math.sin(c.yaw) : Math.cos(c.yaw);
        if (fwd >= 0) dirs.up++; else dirs.down++;
      }
    }
  }
  T.sim.setSpeed(0);
  return { samples, offRoad, worstTile, worstLateral: worst, worstCar, bridgeSamples, rampSamples, dirs,
           cars: tr.cars.length, parapetInner: 1.80, lane: 0.78, carScale: 0.92 };
}
"""

STEP = r"""
(args) => {
  const T = window.TERRA, tr = T.world.traffic;
  if (tr.__origUpdate) { tr.update = tr.__origUpdate; tr.__origUpdate = null; }
  const CELL = 3, HALF = 192;
  const want = new Set(args.tiles.map(([i, j]) => j * 128 + i));
  const inTile = (c) => {
    const i = Math.floor((c._px + HALF) / CELL), j = Math.floor((c._pz + HALF) / CELL);
    return want.has(j * 128 + i);
  };
  T.sim.setSpeed(1);
  for (let step = 0; step < args.steps; step++) {
    T.sim.update(0.1); tr.update(0.1, T.sim);
    for (const c of tr.cars) {
      if (!inTile(c)) continue;
      if (args.yawMin !== undefined) {
        const f = Math.sin(c.yaw);
        if (args.yawMin > 0 && f < args.yawMin) continue;
        if (args.yawMin < 0 && f > args.yawMin) continue;
      }
      T.sim.setSpeed(0);
      return { found: true, step, cars: tr.cars.length, x: +c._px.toFixed(2), z: +c._pz.toFixed(2),
               y: +c._py.toFixed(2), pitch: +(c.pitch || 0).toFixed(3), yaw: +c.yaw.toFixed(2) };
    }
  }
  T.sim.setSpeed(0);
  return { found: false, cars: tr.cars.length };
}
"""

CAM = """(a) => { const T=window.TERRA, r=T.world.rig, g=r.goal;
  if (r.__origApply) { r.apply = r.__origApply; r.__origApply = null; }
  g.target.set(a.x, a.y, a.z); g.yaw=a.yaw; g.pitch=a.pitch; g.dist=a.dist;
  r._snap(); r.apply(); return true; }"""

SETUP = """(a) => { const T=window.TERRA; T.sim.setHour(a.hour); T.sim.setSpeed(0); return true; }"""

FREEZE = """() => { const tr = window.TERRA.world.traffic;
  if (!tr.__origUpdate) tr.__origUpdate = tr.update;
  tr.update = function () { this._sync(); };
  return true; }"""

THAW = """() => { const tr = window.TERRA.world.traffic;
  if (tr.__origUpdate) { tr.update = tr.__origUpdate; tr.__origUpdate = null; }
  return true; }"""

async def shot(cdp, path):
    r = await cdp.send('Page.captureScreenshot', {'format': 'png'})
    open(path, 'wb').write(base64.b64decode(r['data']))

def darkfrac(path):
    im = Image.open(path).convert('RGB'); w, h = im.size
    box = im.crop((int(w*0.2), int(h*0.15), int(w*0.8), int(h*0.8)))
    px = list(box.getdata())
    dark = sum(1 for p in px if p[0] < 22 and p[1] < 22 and p[2] < 22)
    return round(dark / len(px), 2)

async def cap(pg, cdp, path, hour=10.0):
    await pg.evaluate(SETUP, {'hour': hour})
    await pg.wait_for_timeout(2400)
    await shot(cdp, path)
    d = darkfrac(path)
    if d > 0.6:
        await pg.wait_for_timeout(2000)
        await shot(cdp, path)
        d = darkfrac(path)
    return {'file': path, 'dark': d}

async def main():
    res = {'shots': []}
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox','--use-angle=swiftshader','--use-gl=angle','--enable-unsafe-swiftshader','--enable-webgl'])
        ctx = await b.new_context(viewport={'width': 1100, 'height': 680})
        pg = await ctx.new_page(); cdp = await ctx.new_cdp_session(pg)
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)[:250]))
        await pg.goto(f'http://127.0.0.1:{PORT}/index.html?sandbox=1&noassets=1&gfx=medium&hour=10', wait_until='load', timeout=45000)
        await pg.wait_for_timeout(4600)
        info = await pg.evaluate(BUILD)
        print('BUILD', json.dumps({k: info[k] for k in ('ok', 'at', 'dir', 'bridges', 'ramps', 'deckY') if k in info}), flush=True)
        if not info.get('ok'):
            await b.close(); print('RES', json.dumps(res)); return
        i, j = info['at']; di, dj = info['dir']
        deck = info['deckY']
        # warm-up frame
        await pg.evaluate(CAM, {'x': (i + 0.5) * 3 - 192, 'y': deck, 'z': (j + 0.5) * 3 - 192, 'yaw': math.pi, 'pitch': 0.3, 'dist': 26})
        await pg.wait_for_timeout(2400)
        await shot(cdp, f'{OUT}/_warm.png')
        deckTiles = [[i + di*k, j + dj*k] for k in range(0, info['bridges'])]
        rampTiles = [r['at'] for r in info['ramps']]
        dmid = ((i + info['bridges'] / 2 + 0.5) * 3 - 192, (j + 0.5) * 3 - 192)
        got = await pg.evaluate(STEP, {'tiles': deckTiles, 'steps': 1500, 'yawMin': 0.5})
        print('DECK_A', json.dumps(got), flush=True)
        res['deck_a'] = got
        if got.get('found'):
            await pg.evaluate(FREEZE, {})
            await pg.evaluate(CAM, {'x': got['x'], 'y': got['y'], 'z': got['z'], 'yaw': math.pi - 0.55, 'pitch': 0.24, 'dist': 22})
            res['shots'].append({**await cap(pg, cdp, f'{OUT}/v6-deck-a.png'), 'kind': 'deck-a'})
        got2 = await pg.evaluate(STEP, {'tiles': deckTiles, 'steps': 1500, 'yawMin': -0.5})
        print('DECK_B', json.dumps(got2), flush=True)
        res['deck_b'] = got2
        if got2.get('found'):
            await pg.evaluate(FREEZE, {})
            await pg.evaluate(CAM, {'x': got2['x'], 'y': got2['y'], 'z': got2['z'], 'yaw': math.pi + 0.55, 'pitch': 0.24, 'dist': 22})
            res['shots'].append({**await cap(pg, cdp, f'{OUT}/v6-deck-b.png'), 'kind': 'deck-b'})
        got3 = await pg.evaluate(STEP, {'tiles': rampTiles, 'steps': 1500})
        print('RAMP', json.dumps(got3), flush=True)
        res['ramp'] = got3
        if got3.get('found'):
            await pg.evaluate(FREEZE, {})
            await pg.evaluate(CAM, {'x': got3['x'], 'y': got3['y'], 'z': got3['z'], 'yaw': -math.pi/2, 'pitch': 0.20, 'dist': 26})
            res['shots'].append({**await cap(pg, cdp, f'{OUT}/v6-ramp-cars.png'), 'kind': 'ramp'})
        await pg.evaluate(THAW, {})
        await pg.evaluate(CAM, {'x': dmid[0], 'y': deck, 'z': dmid[1], 'yaw': math.pi + 0.2, 'pitch': 0.20, 'dist': 34})
        res['shots'].append({**await cap(pg, cdp, f'{OUT}/v6-bridge-side.png'), 'kind': 'side'})
        res['errs'] = errs[:4]
        print('ERR', errs[:4], flush=True)
        await b.close()
    print('RES', json.dumps(res), flush=True)

asyncio.run(main())
