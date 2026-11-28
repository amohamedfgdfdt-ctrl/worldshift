import asyncio, json, threading, functools, http.server, socketserver, time, base64, math
from playwright.async_api import async_playwright
from PIL import Image
OUT = '/tmp/shots'; PORT = 9000
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
  const ramps = [...bs.ramps.entries()].map(([idx, r]) => ({ at: [idx % 128, Math.floor(idx / 128)] }));
  const bl = [...bs.bridges];
  const mesh = bs.crossMesh.geometry;
  return { ok: true, at: [i, j], dir: [di, dj], bridges: bl.length, landings, approaches, placed: placed.length,
           ramps, deckY: bl.length ? +bs.roadY[bl[0]].toFixed(2) : 0, maxCars: T.world.traffic.maxCars,
           crossTris: mesh.index ? mesh.index.count / 3 : 0, crossVerts: mesh.attributes.position ? mesh.attributes.position.count : 0 };
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

# free camera: override the rig's apply so we can look up from below the deck
FREE = """(a) => { const T=window.TERRA, r=T.world.rig, cam=r.camera;
  if (!r.__origApply) r.__origApply = r.apply;
  r.apply = function () {
    cam.position.set(a.px, a.py, a.pz);
    const t = cam.position.clone().set(a.tx, a.ty, a.tz);
    cam.lookAt(t); cam.updateMatrixWorld();
  };
  r.apply(); return true; }"""

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
        print('BUILD', json.dumps(info), flush=True)
        if not info.get('ok'):
            await b.close(); print('RES', json.dumps(res)); return
        i, j = info['at']; di, dj = info['dir']
        # world helpers
        def wc(ci, cj):
            return {'x': (ci + 0.5) * 3 - 192, 'z': (cj + 0.5) * 3 - 192}
        deck = info['deckY']
        ramps = info['ramps']
        near = [r['at'] for r in ramps if r['at'][0] < i]
        mid = near[len(near) // 2] if near else [i, j]
        m = wc(*mid)
        bridgeMid = wc(i + di * (info['bridges'] // 2), j + dj * (info['bridges'] // 2))
        # warm-up frame so the first real capture is never a stale black canvas
        await pg.evaluate(CAM, {'x': m['x'], 'y': deck, 'z': m['z'], 'yaw': math.pi, 'pitch': 0.3, 'dist': 26})
        await pg.wait_for_timeout(2600)
        await shot(cdp, f'{OUT}/_warm.png')

        # 1) looking up the approach toward the deck
        await pg.evaluate(CAM, {'x': m['x'], 'y': deck, 'z': m['z'], 'yaw': -math.pi/2, 'pitch': 0.20, 'dist': 30})
        res['shots'].append({**await cap(pg, cdp, f'{OUT}/v5-ramp-up.png'), 'kind': 'ramp-up'})
        # 2) three-quarter from the low side
        await pg.evaluate(CAM, {'x': m['x'], 'y': deck, 'z': m['z'], 'yaw': -math.pi/2 - 0.45, 'pitch': 0.26, 'dist': 30})
        res['shots'].append({**await cap(pg, cdp, f'{OUT}/v5-ramp-3q.png'), 'kind': 'ramp-3q'})
        # 3) from above
        await pg.evaluate(CAM, {'x': bridgeMid['x'], 'y': deck, 'z': bridgeMid['z'], 'yaw': math.pi + 0.25, 'pitch': 0.95, 'dist': 40})
        res['shots'].append({**await cap(pg, cdp, f'{OUT}/v5-top.png'), 'kind': 'top'})
        # 4) looking up the approach (retry: the first frame after a big move is often blank)
        await pg.evaluate(CAM, {'x': m['x'], 'y': deck, 'z': m['z'], 'yaw': -math.pi/2, 'pitch': 0.20, 'dist': 30})
        await pg.wait_for_timeout(1800)
        await pg.evaluate(CAM, {'x': m['x'], 'y': deck, 'z': m['z'], 'yaw': -math.pi/2, 'pitch': 0.20, 'dist': 30})
        res['shots'].append({**await cap(pg, cdp, f'{OUT}/v5-ramp-up.png'), 'kind': 'ramp-up'})
        res['errs'] = errs[:4]
        print('ERR', errs[:4], flush=True)
        await b.close()
    print('RES', json.dumps(res), flush=True)

asyncio.run(main())
