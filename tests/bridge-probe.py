import asyncio, json, threading, functools, http.server, socketserver, time
from playwright.async_api import async_playwright
h=functools.partial(http.server.SimpleHTTPRequestHandler, directory='/tmp/v3')
class S(socketserver.TCPServer): allow_reuse_address=True
srv=S(("127.0.0.1",8971),h); threading.Thread(target=srv.serve_forever,daemon=True).start(); time.sleep(0.4)

FIND = r"""
(() => {
  const T = window.TERRA, d = T.world.water.depth, V = 129;
  const dep = (i, j) => d[j * V + i];
  const out = [];
  for (let j = 20; j < 108; j++) for (let i = 20; i < 108; i++) {
    for (const [di, dj] of [[1,0],[0,1]]) {
      for (const w of [1, 2]) {
        const dryA = dep(i, j) < 0.05, dryB = dep(i + di*(w+1), j + dj*(w+1)) < 0.05;
        let wet = 0;
        for (let k = 1; k <= w; k++) if (dep(i + di*k, j + dj*k) > 0.35) wet++;
        if (dryA && dryB && wet === w) out.push({ a: [i, j], b: [i + di*(w+1), j + dj*(w+1)], w, depth: +dep(i+di, j+dj).toFixed(2) });
      }
    }
    if (out.length > 60) break;
  }
  return out.slice(0, 40);
})()
"""

TRY = r"""
(list) => {
  const T = window.TERRA, bs = T.world.buildings;
  const res = [];
  for (const c of list.slice(0, 12)) {
    const [ax, az] = c.a, [bx, bz] = c.b;
    const h1 = bs.place('house_small', ax, az, 0, { force: true, silent: true, residents: 6 });
    const h2 = bs.place('factory_small', bx, bz, 0, { force: true, silent: true });
    const b1 = h1 && h1.ok ? bs.buildings.get(h1.id) : null, b2 = h2 && h2.ok ? bs.buildings.get(h2.id) : null;
    const c1 = b1 ? bs.accessCell(b1) : null, c2 = b2 ? bs.accessCell(b2) : null;
    if (!c1 || !c2) { res.push({ ...c, ok: false, reason: 'noaccess', cells: 0, bridges: 0 }); continue; }
    const r = bs.buildRoute(c1, c2);
    res.push({ ...c, ok: !!r.ok, reason: r.reason || '', cells: r.cells ? r.cells.length : 0, bridges: r.bridges || 0 });
    if (r.ok && r.bridges) break;
    for (const b of [...bs.buildings.values()]) if ((b.cx === ax && b.cz === az) || (b.cx === bx && b.cz === bz)) bs.remove(b.id);
  }
  bs.emit('change', { type: 'place' });
  return res;
}
"""

async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox','--use-angle=swiftshader','--use-gl=angle','--enable-unsafe-swiftshader','--enable-webgl'])
        ctx=await b.new_context(viewport={'width':900,'height':600})
        pg=await ctx.new_page()
        errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
        await pg.goto('http://127.0.0.1:8971/index.html?sandbox=1&noassets=1&gfx=low&hour=10', wait_until='load', timeout=45000)
        await pg.wait_for_timeout(4500)
        cands = await pg.evaluate(FIND)
        print('CANDS', len(cands), json.dumps(cands[:6]), flush=True)
        res = await pg.evaluate(TRY, cands)
        for r in res: print('TRY', json.dumps(r), flush=True)
        print('ERR', errs[:4], flush=True)
        await b.close()
asyncio.run(main())
