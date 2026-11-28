import asyncio, json, threading, functools, http.server, socketserver, time, base64, math
from playwright.async_api import async_playwright
from PIL import Image
OUT = '/tmp/shots'; PORT = 8992
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
  for (let k = -12; k <= -1; k++) lay(k, false);
  for (let k = 0; k <= 2; k++) lay(k, true);
  const landings = bs.ensureBridgeEnds();
  bs.net.build();
  const approaches = bs.ensureRampApproaches();
  bs.net.build();
  bs._roadDirty = true; bs._rebuildRoads();
  // buildings only on the +perp side so the camera side stays clear
  const px = dj !== 0 ? 1 : 0, pz = di !== 0 ? 1 : 0;
  const placed = [];
  for (const k of [-12, -9, 7, 10, 13]) {
    for (const s of [1, 2]) {
      const ci = i + di*k + px*s, cj = j + dj*k + pz*s;
      const key = placed.length % 2 === 0 ? 'house_small' : 'factory_small';
      const r = bs.place(key, ci, cj, 0, { force: true, silent: true, residents: 24 });
      if (r && r.ok) { placed.push([ci, cj, key]); break; }
    }
  }
  bs.emit('change', { type: 'place' });
  const ramps = [...bs.ramps.entries()].map(([idx, r]) => ({ at: [idx % 128, Math.floor(idx / 128)], low: +r.yLow.toFixed(2), high: +r.yHigh.toFixed(2) }));
  const bl = [...bs.bridges];
  return { ok: true, at: [i, j], dir: [di, dj], perp: [px, pz], bridges: bl.length, landings, approaches,
           placed: placed.length, ramps, deckY: bl.length ? +bs.roadY[bl[0]].toFixed(2) : 0, roads: bs.roads.size,
           maxCars: T.world.traffic.maxCars };
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
  for (let step = 0; step < args.steps; step++) {
    T.sim.update(0.1); tr.update(0.1, T.sim);
    for (const c of tr.cars) {
      if (!inTile(c)) continue;
      T.sim.setSpeed(0);
      return { found: true, step, cars: tr.cars.length, x: +c._px.toFixed(2), z: +c._pz.toFixed(2),
               y: +c._py.toFixed(2), pitch: +(c.pitch || 0).toFixed(3), yaw: +c.yaw.toFixed(2),
               speed: +(c.speed || 0).toFixed(2), route: c.route ? c.route.length : -1 };
    }
  }
  T.sim.setSpeed(0);
  return { found: false, cars: tr.cars.length, sample: tr.cars.slice(0, 6).map((c) => ({ x: +c._px.toFixed(1), z: +c._pz.toFixed(1), y: +c._py.toFixed(2), yaw: +c.yaw.toFixed(2) })) };
}
"""

CAM = """(a) => { const T=window.TERRA, r=T.world.rig, g=r.goal;
  g.target.set(a.x, a.y, a.z); g.yaw=a.yaw; g.pitch=a.pitch; g.dist=a.dist;
  r._snap(); r.apply(); return true; }"""

PROJ = """(a) => { const T=window.TERRA, cam=T.world.rig.camera;
  const v = cam.position.clone().set(a.x, a.y, a.z).project(cam);
  return { x: +v.x.toFixed(2), y: +v.y.toFixed(2), z: +v.z.toFixed(2) }; }"""

CENTER = """(a) => { const T=window.TERRA; const c = T.world.rig.camera.position;
  return { x:+c.x.toFixed(1), y:+c.y.toFixed(1), z:+c.z.toFixed(1) }; }"""

async def shot(cdp, path):
    r = await cdp.send('Page.captureScreenshot', {'format': 'png'})
    open(path, 'wb').write(base64.b64decode(r['data']))

def notblack(path):
    im = Image.open(path).convert('RGB')
    w, h = im.size
    box = im.crop((int(w*0.2), int(h*0.15), int(w*0.8), int(h*0.8)))
    px = list(box.getdata())
    dark = sum(1 for p in px if p[0] < 22 and p[1] < 22 and p[2] < 22)
    return dark / len(px) < 0.55, dark / len(px)

async def frame(pg, cdp, target, cands, path):
    """try camera candidates, keep the first frame that is on-screen and not black"""
    best = None
    for (yaw, pitch, dist) in cands:
        await pg.evaluate(CAM, {'x': target['x'], 'y': target['y'], 'z': target['z'], 'yaw': yaw, 'pitch': pitch, 'dist': dist})
        pr = await pg.evaluate(PROJ, {'x': target['x'], 'y': target['y'] + 1.1, 'z': target['z']})
        ok = abs(pr['x']) < 0.6 and abs(pr['y']) < 0.6 and pr['z'] < 1
        score = abs(pr['x']) + abs(pr['y'])
        if best is None or (ok and score < best[0]):
            best = (score, yaw, pitch, dist, pr, ok)
        if ok:
            break
    _, yaw, pitch, dist, pr, ok = best
    await pg.evaluate(CAM, {'x': target['x'], 'y': target['y'], 'z': target['z'], 'yaw': yaw, 'pitch': pitch, 'dist': dist})
    await pg.wait_for_timeout(3600)
    await shot(cdp, path)
    clean, dark = notblack(path)
    return {'file': path, 'yaw': round(yaw, 2), 'pitch': pitch, 'dist': dist, 'proj': pr, 'onscreen': ok,
            'dark_frac': round(dark, 2), 'usable': clean}

async def main():
    res = {'build': None, 'shots': []}
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox','--use-angle=swiftshader','--use-gl=angle','--enable-unsafe-swiftshader','--enable-webgl'])
        ctx = await b.new_context(viewport={'width': 1100, 'height': 680})
        pg = await ctx.new_page(); cdp = await ctx.new_cdp_session(pg)
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)[:250]))
        await pg.goto(f'http://127.0.0.1:{PORT}/index.html?sandbox=1&noassets=1&gfx=medium&hour=10', wait_until='load', timeout=45000)
        await pg.wait_for_timeout(4800)
        info = await pg.evaluate(BUILD)
        res['build'] = info
        print('BUILD', json.dumps(info), flush=True)
        if not info.get('ok') or not info['ramps']:
            print('no build/ramps', flush=True); await b.close(); print('RES', json.dumps(res)); return
        i, j = info['at']; di, dj = info['dir']
        ramps = info['ramps']
        rampTiles = [r['at'] for r in ramps]
        deckTiles = [[i + di*k, j + dj*k] for k in range(0, info['bridges'])]
        # camera side is -perp; road runs along (di,dj)
        # yaw=pi puts the camera on the -Z side, yaw=0 on +Z; for a Z-running road use +-pi/2
        base = math.pi if dj == 0 else -math.pi/2
        cands = [(base, 0.30, 18), (base + 0.55, 0.34, 22), (base - 0.55, 0.34, 22), (base, 0.55, 28), (base + 1.0, 0.40, 30)]

        got = await pg.evaluate(STEP, {'tiles': rampTiles, 'steps': 2600})
        print('RAMP_CAR', json.dumps(got), flush=True)
        if got.get('found'):
            f = await frame(pg, cdp, {'x': got['x'], 'y': got['y'], 'z': got['z']}, cands, f'{OUT}/v3-car-ramp.png')
            f['kind'] = 'ramp'; f['car'] = got; res['shots'].append(f); print('SHOT', json.dumps(f), flush=True)

        got2 = await pg.evaluate(STEP, {'tiles': deckTiles, 'steps': 2600})
        print('DECK_CAR', json.dumps(got2), flush=True)
        if got2.get('found'):
            f = await frame(pg, cdp, {'x': got2['x'], 'y': got2['y'], 'z': got2['z']}, cands, f'{OUT}/v3-car-deck.png')
            f['kind'] = 'deck'; f['car'] = got2; res['shots'].append(f); print('SHOT', json.dumps(f), flush=True)

        # wide view of the whole slope: centre of ramp+deck run
        tiles = rampTiles + deckTiles
        ci = sum(t[0] for t in tiles) / len(tiles); cj = sum(t[1] for t in tiles) / len(tiles)
        cx = (ci + 0.5) * 3 - 192; cz = (cj + 0.5) * 3 - 192
        wide = [(base, 0.34, 46), (base + 0.6, 0.40, 52), (base - 0.6, 0.40, 52)]
        f = await frame(pg, cdp, {'x': cx, 'y': info['deckY'], 'z': cz}, wide, f'{OUT}/v3-ramp-wide.png')
        f['kind'] = 'wide'; res['shots'].append(f); print('SHOT', json.dumps(f), flush=True)
        res['errs'] = errs[:5]
        print('ERR', errs[:5], flush=True)
        await b.close()
    print('RES', json.dumps(res), flush=True)

asyncio.run(main())
