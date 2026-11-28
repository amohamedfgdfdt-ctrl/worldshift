import asyncio, threading, functools, http.server, socketserver, time, base64
from playwright.async_api import async_playwright
ROOT='/tmp/v3'; PORT=8905
def serve():
    h=functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
    class S(socketserver.TCPServer): allow_reuse_address=True
    with S(("127.0.0.1",PORT),h) as s: s.serve_forever()
threading.Thread(target=serve,daemon=True).start(); time.sleep(0.4)
SETUP=r"""
(() => { const T=window.TERRA, bs=T.world.buildings;
  for (const [i,j] of [[40,44],[44,44],[48,44],[52,44],[42,50],[46,50],[50,50],[54,50]]) bs.place('house_small',i,j,0,{force:true,silent:true,residents:4});
  for (const [i,j] of [[44,54],[52,54]]) bs.place('farm',i,j,0,{force:true,silent:true});
  bs.emit('change',{type:'place'}); T.sim.setSpeed(4); return {b:bs.buildings.size};
})()"""
TAP=r"""
(async () => { const T=window.TERRA, f=T.world.field;
  const THREE=await import('/vendor/three.module.min.js');
  const CELL=3, HALF=192, r=T.world.canvas.getBoundingClientRect();
  const sc=(i,j)=>{const x=(i+0.5)*CELL-HALF,z=(j+0.5)*CELL-HALF;
    const v=new THREE.Vector3(x,f.heightAt(x,z),z).project(T.world.rig.camera);
    return {x:r.left+(v.x*.5+.5)*r.width, y:r.top+(-v.y*.5+.5)*r.height};};
  const tap=(a,b)=>{T.tools.setMode('road');const p=sc(...a),q=sc(...b);
    T.tools.onTap({x:p.x,y:p.y,type:'mouse'});T.tools.onTap({x:q.x,y:q.y,type:'mouse'});T.tools.setMode('select');};
  tap([40,42],[54,52]); tap([44,46],[44,56]);
  for (let k=0;k<300;k++) T.world.traffic.update(0.1,T.sim);
  return {roads:T.world.buildings.roads.size, cars:T.world.traffic.count, trips:T.sim.economy.stats.trips||0};
})()"""
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox','--use-angle=swiftshader','--use-gl=angle','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--enable-webgl'])
        ctx=await b.new_context(viewport={'width':390,'height':844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        pg=await ctx.new_page(); cdp=await ctx.new_cdp_session(pg)
        errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
        await pg.goto(f'http://127.0.0.1:{PORT}/index.html?sandbox=1&noassets=1&gfx=low&hour=10&cam=-49,-46,0.9,0.85,70', wait_until='load', timeout=45000)
        await pg.wait_for_timeout(4500)
        print('SETUP', await pg.evaluate(SETUP), flush=True)
        print('TAP', await pg.evaluate(TAP), flush=True)
        await pg.wait_for_timeout(2000)
        r=await cdp.send('Page.captureScreenshot',{'format':'png'})
        open('/tmp/shots/v3-mobile.png','wb').write(base64.b64decode(r['data']))
        print('MOBILE', await pg.evaluate("({w:innerWidth,h:innerHeight,errs:0})"), flush=True)
        print('ERRORS', errs[:5], flush=True)
        await b.close()
asyncio.run(main())
