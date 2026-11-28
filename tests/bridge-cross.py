import asyncio, json, threading, functools, http.server, socketserver, time, base64
from playwright.async_api import async_playwright
OUT = '/tmp/shots'
h = functools.partial(http.server.SimpleHTTPRequestHandler, directory='/tmp/v3')
class S(socketserver.TCPServer): allow_reuse_address = True
srv = S(("127.0.0.1", 8973), h)
threading.Thread(target=srv.serve_forever, daemon=True).start(); time.sleep(0.4)

FIND = r"""
(() => {
  const T = window.TERRA, d = T.world.water.depth, V = 129;
  const dep = (i, j) => d[j * V + i];
  const out = [];
  for (let j = 24; j < 104; j++) for (let i = 24; i < 104; i++) {
    for (const [di, dj] of [[1,0],[0,1]]) {
      for (const w of [1, 2]) {
        if (dep(i, j) >= 0.05 || dep(i + di*(w+1), j + dj*(w+1)) >= 0.05) continue;
        let wet = 0;
        for (let k = 1; k <= w; k++) if (dep(i + di*k, j + dj*k) > 0.45) wet++;
        if (wet === w) out.push({ a: [i, j], b: [i + di*(w+1), j + dj*(w+1)], w, d: [di, dj], depth: +dep(i+di, j+dj).toFixed(2) });
      }
    }
  }
  out.sort((p, q) => q.depth - p.depth);
  return out.slice(0, 8);
})()
"""

TRY = r"""
(list) => {
  const T = window.TERRA, bs = T.world.buildings;
  const res = [];
  for (const c of list) {
    const [dx, dz] = c.d;
    const s = [c.a[0] - 2*dx, c.a[1] - 2*dz], e = [c.b[0] + 2*dx, c.b[1] + 2*dz];
    const r = bs.buildRoute(s, e);
    res.push({ at: c.a, depth: c.depth, ok: !!r.ok, reason: r.reason || '', cells: r.cells ? r.cells.length : 0, bridges: r.bridges || 0 });
    if (r.ok && r.bridges) {
      const bl = [...bs.bridges];
      const depths = bl.map((i) => T.world.water.depth[Math.floor(i/128)*129 + (i%128)]);
      return { ...res[res.length-1], start: s, end: e, bridgeDepths: depths.map((x) => +x.toFixed(2)), deckY: +bs.roadY[bl[0]].toFixed(2) };
    }
    for (const b of [...bs.roads]) bs.removeRoad(b % 128, Math.floor(b / 128));
  }
  return { tried: res };
}
"""

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox','--use-angle=swiftshader','--use-gl=angle','--enable-unsafe-swiftshader','--enable-webgl'])
        ctx = await b.new_context(viewport={'width':1100,'height':680})
        pg = await ctx.new_page(); cdp = await ctx.new_cdp_session(pg)
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
        await pg.goto('http://127.0.0.1:8973/index.html?sandbox=1&noassets=1&gfx=low&hour=10', wait_until='load', timeout=45000)
        await pg.wait_for_timeout(4500)
        cands = await pg.evaluate(FIND)
        print('CANDS', json.dumps(cands[:4]), flush=True)
        res = await pg.evaluate(TRY, cands)
        print('TRY', json.dumps(res), flush=True)
        print('ERR', errs[:4], flush=True)
        if res.get('bridges'):
            s, e = res['start'], res['end']
            mx = ((s[0] + e[0]) / 2 + 0.5) * 3 - 192
            mz = ((s[1] + e[1]) / 2 + 0.5) * 3 - 192
            for yaw, pitch, dist, name in [(0.7, 0.24, 20, 'v3-bridge-new.png'), (2.1, 0.18, 13, 'v3-bridge-side.png')]:
                await pg.evaluate("""(a) => { const T=window.TERRA, g=T.world.rig.goal;
                  g.target.set(a.x, T.world.field.heightAt(a.x,a.z), a.z); g.yaw=a.yaw; g.pitch=a.pitch; g.dist=a.dist;
                  T.world.rig._snap(); T.world.rig.update(0.001, T.world.viewH); }""", {'x': mx, 'z': mz, 'yaw': yaw, 'pitch': pitch, 'dist': dist})
                await pg.wait_for_timeout(1500)
                r = await cdp.send('Page.captureScreenshot', {'format':'png'})
                open(f'{OUT}/{name}', 'wb').write(base64.b64decode(r['data']))
            print('SHOTS ok', flush=True)
        await b.close()
asyncio.run(main())
