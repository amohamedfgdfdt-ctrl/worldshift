import asyncio, json, threading, functools, http.server, socketserver, time, base64, math
from playwright.async_api import async_playwright
from PIL import Image
OUT = '/tmp/shots'; PORT = 8993
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
  const px = dj !== 0 ? 1 : 0, pz = di !== 0 ? 1 : 0;
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
  const ramps = [...bs.ramps.entries()].map(([idx, r]) => ({ at: [idx % 128, Math.floor(idx / 128)], low: +r.yLow.toFixed(2), high: +r.yHigh.toFixed(2) }));
  const bl = [...bs.bridges];
  return { ok: true, at: [i, j], dir: [di, dj], perp: [px, pz], bridges: bl.length, landings, approaches,
           placed: placed.map((p) => p[2]), ramps, deckY: bl.length ? +bs.roadY[bl[0]].toFixed(2) : 0,
           roads: bs.roads.size, maxCars: T.world.traffic.maxCars };
})()
"""

STEP = r"""
(args) => {
  const T = window.TERRA, tr = T.world.traffic;
  const CELL = 3, HALF = 192;
  const want = new Set(args.tiles.map(([i, j]) => j * 128 + i));
  const inTile = (c) => {
    const i = Math.floor((c._px + HALF) / CELL), j = Math.floor((c._pz + HALF) / CELL);
    return want.has(j * 128 + i);
  };
  T.sim.setSpeed(1);
  const seen = [];
  for (let step = 0; step < args.steps; step++) {
    T.sim.update(0.1); tr.update(0.1, T.sim);
    for (const c of tr.cars) {
      if (!inTile(c)) continue;
      seen.push({ yaw: +c.yaw.toFixed(2), x: +c._px.toFixed(1) });
      if (args.avoidYaw !== null && Math.abs(((c.yaw - args.avoidYaw + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI) < args.avoidRad) continue;
      T.sim.setSpeed(0);
      return { found: true, step, cars: tr.cars.length, x: +c._px.toFixed(2), z: +c._pz.toFixed(2),
               y: +c._py.toFixed(2), pitch: +(c.pitch || 0).toFixed(3), yaw: +c.yaw.toFixed(2), seen: seen.slice(0, 6) };
    }
  }
  T.sim.setSpeed(0);
  return { found: false, cars: tr.cars.length, seen: seen.slice(0, 8) };
}
"""

CAM = """(a) => { const T=window.TERRA, r=T.world.rig, g=r.goal;
  g.target.set(a.x, a.y, a.z); g.yaw=a.yaw; g.pitch=a.pitch; g.dist=a.dist;
  r._snap(); r.apply(); return true; }"""

PROJ = """(a) => { const T=window.TERRA, cam=T.world.rig.camera;
  const v = cam.position.clone().set(a.x, a.y, a.z).project(cam);
  return { x: +v.x.toFixed(2), y: +v.y.toFixed(2), z: +v.z.toFixed(2) }; }"""

SETUP = """(a) => { const T=window.TERRA; T.sim.setHour(a.hour); T.sim.setSpeed(0); return true; }"""

async def shot(cdp, path):
    r = await cdp.send('Page.captureScreenshot', {'format': 'png'})
    open(path, 'wb').write(base64.b64decode(r['data']))

def darkfrac(path):
    im = Image.open(path).convert('RGB'); w, h = im.size
    box = im.crop((int(w*0.2), int(h*0.15), int(w*0.8), int(h*0.8)))
    px = list(box.getdata())
    dark = sum(1 for p in px if p[0] < 22 and p[1] < 22 and p[2] < 22)
    return round(dark / len(px), 2)

async def cap(pg, cdp, car, yaw, pitch, dist, path, hour=10.0):
    await pg.evaluate(SETUP, {'hour': hour})
    await pg.evaluate(CAM, {'x': car['x'], 'y': car['y'], 'z': car['z'], 'yaw': yaw, 'pitch': pitch, 'dist': dist})
    pr = await pg.evaluate(PROJ, {'x': car['x'], 'y': car['y'] + 0.8, 'z': car['z']})
    await pg.wait_for_timeout(3200)
    await shot(cdp, path)
    return {'file': path, 'yaw': round(yaw, 2), 'pitch': pitch, 'dist': dist, 'proj': pr,
            'onscreen': abs(pr['x']) < 0.75 and abs(pr['y']) < 0.75 and pr['z'] < 1, 'dark': darkfrac(path)}

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
        res['build'] = info
        print('BUILD', json.dumps(info), flush=True)
        if not info.get('ok') or not info['ramps']:
            await b.close(); print('RES', json.dumps(res)); return
        i, j = info['at']; di, dj = info['dir']
        base = math.pi if dj == 0 else -math.pi/2
        rampTiles = [r['at'] for r in info['ramps']]
        deckTiles = [[i + di*k, j + dj*k] for k in range(0, info['bridges'])]

        # 1) car on a ramp tile
        got = await pg.evaluate(STEP, {'tiles': rampTiles, 'steps': 2600, 'avoidYaw': None, 'avoidRad': 0})
        print('RAMP_CAR', json.dumps(got), flush=True)
        if got.get('found'):
            res['ramp_car'] = got
            res['shots'].append({**await cap(pg, cdp, got, base, 0.40, 22, f'{OUT}/v3-car-ramp-a.png'), 'kind': 'ramp-a'})
            res['shots'].append({**await cap(pg, cdp, got, base + 0.75, 0.46, 26, f'{OUT}/v3-car-ramp-b.png'), 'kind': 'ramp-b'})

        # 2) car on the deck, ideally heading the other way
        avoid = got.get('yaw') if got.get('found') else None
        got2 = await pg.evaluate(STEP, {'tiles': deckTiles + rampTiles, 'steps': 2200,
                                       'avoidYaw': avoid, 'avoidRad': 0.9})
        print('OPP_CAR', json.dumps(got2), flush=True)
        if got2.get('found'):
            res['opp_car'] = got2
            res['shots'].append({**await cap(pg, cdp, got2, base, 0.40, 22, f'{OUT}/v3-car-deck-a.png'), 'kind': 'deck-a'})
            res['shots'].append({**await cap(pg, cdp, got2, base - 0.75, 0.46, 26, f'{OUT}/v3-car-deck-b.png'), 'kind': 'deck-b'})

        # 3) wide view of the whole slope
        tiles = rampTiles + deckTiles
        ci = sum(t[0] for t in tiles) / len(tiles); cj = sum(t[1] for t in tiles) / len(tiles)
        wide_car = {'x': (ci + 0.5) * 3 - 192, 'y': info['deckY'], 'z': (cj + 0.5) * 3 - 192}
        res['shots'].append({**await cap(pg, cdp, wide_car, base, 0.26, 38, f'{OUT}/v3-ramp-wide.png'), 'kind': 'wide'})
        res['errs'] = errs[:4]
        print('ERR', errs[:4], flush=True)
        await b.close()
    print('RES', json.dumps(res), flush=True)

asyncio.run(main())
