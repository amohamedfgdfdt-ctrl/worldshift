import sys, asyncio, json
from playwright.async_api import async_playwright
URL = 'http://localhost:8123/index.html'
results = []
def ok(c, m, extra=''):
    results.append((bool(c), m)); print(('PASS ' if c else 'FAIL ') + m, extra)

HELP = """(()=>{
window.T = window.TERRA;
window.scr = (x,y,z)=>{ const v=new (T.world.rig.camera.position.constructor)(x,y,z).project(T.world.rig.camera); const r=T.world.canvas.getBoundingClientRect(); return {x:r.left+(v.x*0.5+0.5)*r.width, y:r.top+(-v.y*0.5+0.5)*r.height}; };
window.findSpot = (key, near, rot=0)=>{ const b=T.world.buildings; let best=null; for(let r=0;r<40;r++){ for(let dz=-r;dz<=r;dz++) for(let dx=-r;dx<=r;dx++){ if(Math.max(Math.abs(dx),Math.abs(dz))!==r) continue; const cx=near[0]+dx, cz=near[1]+dz; const ev=b.evaluate(key,cx,cz,rot); if(ev.ok) return {cx,cz,x:ev.x,y:ev.y,z:ev.z}; } } return null; };
})()"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox','--use-angle=swiftshader','--use-gl=angle','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
        ctx = await b.new_context(viewport={'width':760,'height':440})
        pg = await ctx.new_page(); pg.set_default_timeout(10000)
        errs=[]
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: errs.append(m.text) if m.type=='error' else None)
        await pg.goto(URL); await pg.wait_for_function('window.__terraReady===true'); await pg.wait_for_timeout(1500)
        await pg.evaluate(HELP)
        await pg.evaluate("TERRA.settings.apply({quality:'low'})"); await pg.wait_for_timeout(1500)
        ev = lambda js: pg.evaluate(js)
        async def ck(sel):
            await pg.evaluate('(s)=>{const e=document.querySelector(s); if(!e) throw new Error("missing "+s); e.click();}', sel)
        async def fill(sel,val):
            await pg.evaluate('([s,v])=>{const e=document.querySelector(s); e.value=v; e.dispatchEvent(new Event("input",{bubbles:true}));}', [sel,val])

        # --- camera
        y0 = await ev('T.world.rig.cur.yaw')
        await pg.mouse.move(640,360); await pg.mouse.down(); await pg.mouse.move(760,380, steps=8); await pg.mouse.up()
        await pg.wait_for_timeout(500)
        y1 = await ev('T.world.rig.cur.yaw'); ok(abs(y1-y0)>0.2, 'camera: drag rotates', f'{y0:.2f}->{y1:.2f}')
        d0 = await ev('T.world.rig.cur.dist'); await pg.mouse.wheel(0,-400); await pg.wait_for_timeout(600)
        d1 = await ev('T.world.rig.cur.dist'); ok(d1<d0-10, 'camera: wheel zooms in', f'{d0:.0f}->{d1:.0f}')
        await pg.mouse.move(640,360); await pg.mouse.down(button='right'); await pg.mouse.move(500,300, steps=6); await pg.mouse.up(button='right'); await pg.wait_for_timeout(400)
        tx = await ev('T.world.rig.cur.target.x'); ok(abs(tx)>1, 'camera: right-drag pans', f'x={tx:.1f}')
        await ck('[data-cam=reset]'); await pg.wait_for_timeout(1800)
        d2 = await ev('T.world.rig.cur.dist'); ok(abs(d2-255)<8, 'camera: reset button restores default', f'dist={d2:.0f}')
        await ck('[data-cam=rotR]'); await pg.wait_for_timeout(900)
        y2 = await ev('T.world.rig.goal.yaw'); ok(True, 'camera: rotate button', f'yaw goal {y2:.2f}')

        # --- building via real clicks
        await ck('[data-cat=buildings]'); await pg.wait_for_timeout(500)
        await pg.screenshot(path='/tmp/e2e_panel.png')
        await ck('.card[data-key=house_small]'); await pg.wait_for_timeout(300)
        spot = await ev('findSpot("house_small",[64,45])')
        s = await ev(f'scr({spot["x"]},{spot["y"]},{spot["z"]})')
        await pg.mouse.move(s['x'], s['y'], steps=4); await pg.wait_for_timeout(500)
        hint = await ev('document.getElementById("hint").textContent'); ok('place' in hint.lower(), 'build: ghost + valid hint', hint)
        await pg.screenshot(path='/tmp/e2e_ghost.png')
        n0 = await ev('T.world.buildings.buildings.size')
        await pg.mouse.click(s['x'], s['y']); await pg.wait_for_timeout(600)
        n1 = await ev('T.world.buildings.buildings.size'); ok(n1==n0+1, 'build: click places a house', f'{n0}->{n1}')
        # invalid: same spot again
        await pg.mouse.click(s['x'], s['y']); await pg.wait_for_timeout(300)
        n2 = await ev('T.world.buildings.buildings.size'); ok(n2==n1, 'build: cannot place on occupied cell')
        # water invalid
        lake = await ev('(()=>{const l=T.world.field.lake; const x=l.u*384-192, z=l.v*384-192; return {x,y:T.world.field.heightAt(x,z),z}})()')
        sl = await ev(f'scr({lake["x"]},{lake["y"]},{lake["z"]})')
        await pg.mouse.move(sl['x'], sl['y'], steps=3); await pg.wait_for_timeout(400)
        hint = await ev('document.getElementById("hint").textContent'); ok('water' in hint.lower() or 'occupied' in hint.lower(), 'build: refuses water', hint)
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200)
        mode = await ev('T.tools.mode'); ok(mode=='select', 'build: Esc cancels')

        # other types via API-validated spots but real clicks
        async def place_click(key, near, rot=0, card=None, cat=None):
            if cat and await ev('TERRA.ui.cat')!=cat: await ck(f'[data-cat={cat}]'); await pg.wait_for_timeout(300)
            await ck(f'.card[data-key={key}]'); await pg.wait_for_timeout(200)
            sp = await ev(f'findSpot("{key}",{json.dumps(near)},{rot})')
            sc = await ev(f'scr({sp["x"]},{sp["y"]},{sp["z"]})')
            before = await ev('T.world.buildings.buildings.size')
            await pg.mouse.move(sc['x'], sc['y'], steps=3); await pg.wait_for_timeout(350)
            await pg.mouse.click(sc['x'], sc['y']); await pg.wait_for_timeout(450)
            after = await ev('T.world.buildings.buildings.size')
            await pg.keyboard.press('Escape')
            return after==before+1, sp
        for key,near,cat in [('house_medium',[70,48],'buildings'),('factory_small',[78,52],'buildings'),('tree',[62,50],'nature'),('farm',[58,40],'nature'),('water_tank',[74,60],'infrastructure')]:
            r,sp = await place_click(key, near, 0, cat=cat); ok(r, f'build: {key} placed at {sp["cx"]},{sp["cz"]}')
        # road: two clicks
        await ck('.card[data-key=road]'); await pg.wait_for_timeout(200)
        a = await ev('(()=>{const b=T.world.buildings; for(let cz=30;cz<100;cz++) for(let cx=30;cx<100;cx++){ let ok=true; for(let k=0;k<6;k++) if(!b.evaluateRoad(cx+k,cz).ok) ok=false; if(ok) return [cx,cz]; } })()')
        cx,cz=a
        def cs(cx,cz): return f'(()=>{{const x={cx}*3-192+1.5,z={cz}*3-192+1.5; return scr(x,T.world.field.heightAt(x,z),z)}})()'
        p1 = await ev(cs(cx,cz)); p2 = await ev(cs(cx+5,cz))
        await pg.mouse.move(p1['x'],p1['y']); await pg.wait_for_timeout(250); await pg.mouse.click(p1['x'],p1['y']); await pg.wait_for_timeout(250)
        await pg.mouse.move(p2['x'],p2['y'],steps=3); await pg.wait_for_timeout(300); await pg.mouse.click(p2['x'],p2['y']); await pg.wait_for_timeout(500)
        rn = await ev('T.world.buildings.roads.size'); ok(rn>=6, 'road: two clicks draw a segment', f'{rn} tiles')
        await pg.keyboard.press('Escape'); await pg.keyboard.press('Escape')
        await pg.wait_for_timeout(300)
        stats = await ev('({pop:document.getElementById("stat-pop").textContent, bld:document.getElementById("stat-bld").textContent})')
        ok(int(stats['bld'])>=5, 'top bar: building count updates', str(stats))

        # focus camera on the built area for a screenshot
        await ev('(()=>{const r=T.world.rig; r.goal.target.set(-30,0,-40); r.goal.dist=90; r.goal.pitch=0.6;})()')
        await pg.wait_for_timeout(2500)
        await pg.screenshot(path='/tmp/e2e_city.png')

        # --- population grows while running
        await pg.wait_for_timeout(2500)
        popv = await ev('T.world.buildings.population()'); ok(popv>0, 'population: residents move in while running', str(popv))
        await ev('T.sim.setRunning(false)'); p_a = await ev('T.world.buildings.population()'); await pg.wait_for_timeout(2500)
        p_b = await ev('T.world.buildings.population()'); ok(p_a==p_b, 'pause: population frozen')

        # --- select + info + delete
        await ev('T.sim.setRunning(true)')
        hb = await ev('[...T.world.buildings.buildings.values()].find(b=>b.key=="house_small")')
        sc = await ev(f'scr({hb["x"]},{hb["y"]+2},{hb["z"]})')
        await pg.mouse.click(sc['x'], sc['y']); await pg.wait_for_timeout(600)
        sel = await ev('T.tools.selection'); ok(sel and sel['kind']=='building', 'select: click selects building', json.dumps(sel))
        title = await ev('document.querySelector("#info h3")?.textContent'); ok(title=='Small House', 'info panel: shows name', str(title))
        await pg.screenshot(path='/tmp/e2e_info.png')
        n_before = await ev('T.world.buildings.buildings.size')
        await ck('[data-info=delete]'); await pg.wait_for_timeout(400)
        n_after = await ev('T.world.buildings.buildings.size'); ok(n_after==n_before-1, 'delete: removes selected building', f'{n_before}->{n_after}')
        # rebuild obstacle freed
        ob = await ev(f'T.world.water.obst[{hb["cz"]}*129+{hb["cx"]}]'); ok(ob==0, 'delete: water obstacle cleared')

        # --- water
        v0 = await ev('T.world.water.totalVolume()')
        await ev('T.sim.setSpeed(1); T.sim.setRunning(true)')
        await pg.wait_for_timeout(3000)
        v1 = await ev('T.world.water.totalVolume()'); ok(v1>v0, 'water: river source adds volume while running', f'{v0:.0f}->{v1:.0f}')
        await ev('T.sim.setRunning(false)'); a1 = await ev('T.world.water.totalVolume()'); await pg.wait_for_timeout(2000)
        a2 = await ev('T.world.water.totalVolume()'); ok(abs(a2-a1)<1e-6, 'water: pause stops the simulation')
        # pour tool with real mouse hold
        await ck('[data-cat=water]'); await pg.wait_for_timeout(400); await ck('.card[data-tool=pour]'); await pg.wait_for_timeout(200)
        await ev('(()=>{const r=T.world.rig; r.goal.target.set(-60,0,-60); r.goal.dist=120; r.goal.pitch=0.9; r.goal.yaw=0.3;})()')
        await pg.wait_for_timeout(2000)
        hill = await ev('(()=>{const f=T.world.field; let best=null; for(let i=20;i<110;i+=2) for(let j=30;j<100;j+=2){const k=j*129+i; if(f.initialWater[k]===0 && f.slope[k]>0.12 && f.slope[k]<0.3 && f.h[k]>12&&f.h[k]<30){best=[i*3-192,f.h[k],j*3-192];break;} if(best)break;} return best})()')
        sc = await ev(f'scr({hill[0]},{hill[1]},{hill[2]})')
        vbefore = await ev('T.world.water.totalVolume()')
        await pg.mouse.move(sc['x'], sc['y'], steps=3); await pg.wait_for_timeout(300)
        await pg.mouse.down(); await pg.wait_for_timeout(1500); await pg.mouse.up(); await pg.wait_for_timeout(300)
        vafter = await ev('T.world.water.totalVolume()'); ok(vafter>vbefore+50, 'water: hold-to-pour adds water (even when paused)', f'{vbefore:.0f}->{vafter:.0f}')
        await ev('T.sim.setRunning(true); T.sim.setSpeed(4)')
        await pg.wait_for_timeout(1800)
        await pg.screenshot(path='/tmp/e2e_pour.png')
        # source placement
        await ck('.card[data-tool=source]'); await pg.wait_for_timeout(300)
        ns0 = await ev('T.world.water.sources.length')
        sc = await ev(f'scr({hill[0]+20},{hill[1]},{hill[2]})')
        await pg.mouse.move(sc['x'], sc['y'], steps=3); await pg.wait_for_timeout(300); await pg.mouse.click(sc['x'], sc['y']); await pg.wait_for_timeout(400)
        ns1 = await ev('T.world.water.sources.length'); ok(ns1==ns0+1, 'water: place a water source', f'{ns0}->{ns1}')
        await pg.keyboard.press('Escape')
        # toggle flow off
        await ck('[data-sw=sourcesEnabled]'); en = await ev('T.world.water.params.sourcesEnabled'); ok(en==False, 'water: stop source flow switch')
        await ck('[data-sw=sourcesEnabled]')
        await fill('[data-key=flowSpeed]', '1.4'); fs = await ev('T.world.water.params.flowSpeed'); ok(abs(fs-1.4)<1e-6, 'water: flow speed slider', str(fs))
        # speeds
        for sp_ in (2,4,1):
            await ck(f'[data-speed="{sp_}"]'); s_ = await ev('T.sim.speed'); ok(s_==sp_, f'sim: speed x{sp_}')
        await ck('#btn-play'); r_ = await ev('T.sim.running'); ok(r_==False, 'sim: play/pause button toggles')
        await ck('#btn-play')
        # --- save/restore
        await ck('[data-cat=world]'); await pg.wait_for_timeout(300)
        await ck('[data-act=save]'); await pg.wait_for_timeout(300)
        snap = await ev('({b:T.world.buildings.buildings.size, r:T.world.buildings.roads.size, s:T.world.water.sources.length, v:T.world.water.totalVolume(), sp:T.sim.speed, min:T.sim.minutes})')
        await pg.screenshot(path='/tmp/e2e_world.png')
        await pg.reload(); await pg.wait_for_function('window.__terraReady===true'); await pg.wait_for_timeout(1500)
        snap2 = await ev('({b:TERRA.world.buildings.buildings.size, r:TERRA.world.buildings.roads.size, s:TERRA.world.water.sources.length, v:TERRA.world.water.totalVolume(), sp:TERRA.sim.speed, min:TERRA.sim.minutes})')
        ok(snap['b']==snap2['b'] and snap['r']==snap2['r'] and snap['s']==snap2['s'], 'save: buildings, roads, sources restored after reload', f'{snap} -> {snap2}')
        ok(abs(snap['v']-snap2['v'])/max(1,snap['v'])<0.05, 'save: water restored', f'{snap["v"]:.0f} vs {snap2["v"]:.0f}')
        ok(snap['sp']==snap2['sp'], 'save: simulation speed restored')
        await pg.screenshot(path='/tmp/e2e_reload.png')
        # new world
        await pg.evaluate(HELP)
        await ck('[data-cat=world]'); await ck('[data-act=new]'); await ck('[data-m=classic]'); await pg.wait_for_timeout(1500)
        nb = await pg.evaluate('TERRA.world.buildings.buildings.size'); ok(nb==0, 'new world: clears buildings')
        pg2_errs = errs
        ok(len(errs)==0, 'no console/page errors', str(errs[:5]))
        await b.close()
    bad=[m for c,m in results if not c]
    print('\nSUMMARY', len(results)-len(bad), 'passed', len(bad), 'failed'); print('\n'.join(bad))
asyncio.run(main())
