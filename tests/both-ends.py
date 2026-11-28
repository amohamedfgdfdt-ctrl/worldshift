import asyncio, json, threading, functools, http.server, socketserver, time, base64
from playwright.async_api import async_playwright
OUT = '/tmp/shots'; PORT = 8987
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
  T.sim.setSpeed(0);            // freeze the water while we build, so the banks stay dry
  const lay = (k, bridge) => bs.placeRoad(i + di*k, j + dj*k, true, { bridge });
  for (let k = -8; k <= -1; k++) lay(k, false);
  for (let k = 0; k <= 2; k++) lay(k, true);
  // deliberately no road on the far bank: the span must still land properly
  const landings = bs.ensureBridgeEnds();
  bs.net.build();
  bs._roadDirty = true; bs._rebuildRoads();
  const ramps = [...bs.ramps.entries()].map(([idx, r]) => ({
    at: [idx % 128, Math.floor(idx / 128)], low: +r.yLow.toFixed(2), high: +r.yHigh.toFixed(2),
    landing: !!r.landing, onBridge: bs.bridges.has(idx),
  }));
  const bl = [...bs.bridges];
  return { ok: true, at: [i, j], dir: [di, dj], bridges: bl.length, landings, ramps,
           deckY: bl.length ? +bs.roadY[bl[0]].toFixed(2) : 0, depth: +dep(i, j).toFixed(2), roads: bs.roads.size };
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
        await pg.goto(f'http://127.0.0.1:{PORT}/index.html?sandbox=1&noassets=1&gfx=low&hour=10', wait_until='load', timeout=45000)
        await pg.wait_for_timeout(4800)
        info = await pg.evaluate(BUILD)
        print('BUILD', json.dumps(info), flush=True)
        if not info.get('ok'):
            await b.close(); return
        i, j = info['at']; di, dj = info['dir']; y = info['deckY']
        cx = (i + 0.5) * 3 - 192; cz = (j + 0.5) * 3 - 192
        plan = [(cx, cz, 2.2, 0.20, 30, 'v3-bridge-both.png')]
        # near end (ground ramp side) and far end (landing ramp side)
        near = info['ramps'][0]['at'] if info['ramps'] else [i - di, j - dj]
        far = info['ramps'][-1]['at'] if info['ramps'] else [i + di*3, j + dj*3]
        plan.append(((near[0] + 0.5) * 3 - 192, (near[1] + 0.5) * 3 - 192, 1.9, 0.48, 14, 'v3-bridge-end-near.png'))
        plan.append(((far[0] + 0.5) * 3 - 192, (far[1] + 0.5) * 3 - 192, 4.4, 0.48, 14, 'v3-bridge-end-far.png'))
        for tx, tz, yaw, pitch, dist, name in plan:
            await pg.evaluate(CAM, {'x': tx, 'y': y - 0.5, 'z': tz, 'yaw': yaw, 'pitch': pitch, 'dist': dist})
            await pg.wait_for_timeout(4200)
            await shot(cdp, f'{OUT}/{name}')
        print('ERR', errs[:5], flush=True)
        await b.close()
asyncio.run(main())
