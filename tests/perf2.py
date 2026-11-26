import asyncio, json
from playwright.async_api import async_playwright
ARGS=['--no-sandbox','--use-angle=swiftshader','--use-gl=angle','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']
R=[]
def ok(c,n,x=''):
    R.append(bool(c)); print(('  PASS ' if c else '  FAIL ')+n, x if not c else '')
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=ARGS)
        pg=await b.new_page(viewport={'width':900,'height':560}); pg.set_default_timeout(300000)
        errs=[]; pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m:errs.append(m.text[:160]) if m.type=='error' and 'Failed to load' not in m.text else None)
        await pg.goto('http://localhost:8123/index.html'); await pg.wait_for_function('window.__terraReady===true')
        await pg.wait_for_function('Object.keys(TERRA.world.assets.loaded).length>=8'); await pg.click('[data-go=sandbox]'); await pg.wait_for_timeout(1500)
        ev=pg.evaluate
        await ev("TERRA.perf.dynamicRes=false;TERRA.gfx.auto=false")
        # 1 generated LODs
        lv=await ev("(()=>{const o={};for(const [k,s] of Object.entries(TERRA.world.vegetation.sets)) if(s.levels) o[k]=s.levels.map(l=>l.geometry.attributes.position.count/3|0);return o})()")
        multi=[k for k,v in lv.items() if len(v)>1]
        ok(len(multi)>=15,'generated LOD levels exist for GLB flora',f'{len(multi)} sets')
        ok(all(v[i]<v[i-1] for v in lv.values() for i in range(1,len(v))),'each LOD level has fewer triangles than the previous')
        ok(all(v[-1]<=v[0]*0.45 for v in lv.values() if len(v)>1),'lowest level <=45% of the full model (most are ~15%)')
        # 2 distance cull
        tot=await ev("(()=>{let t=0;for(const s of Object.values(TERRA.world.vegetation.sets)) if(s.levelCounts) t+=s.count;return t})()")
        sub="(()=>{let t=0;for(const s of Object.values(TERRA.world.vegetation.sets)) if(s.levelCounts) t+=s.levelCounts().reduce((a,b)=>a+b,0);return t})()"
        keep=await ev("TERRA.world.vegetation.counts()")
        far=await ev("(()=>{const v=TERRA.world.vegetation;for(let i=0;i<5;i++)v.updateLod({x:0,y:5000,z:0},null);let t=0;for(const s of Object.values(v.sets)) if(s.levelCounts) t+=s.levelCounts().reduce((a,b)=>a+b,0);return t})()")
        ok(far==0,'camera far beyond draw distance -> nothing submitted',str(far))
        ok(await ev("(()=>{let t=0;for(const s of Object.values(TERRA.world.vegetation.sets)) if(s.levelCounts) t+=s.count;return t})()")==tot,'culling never removes world data (instance records kept)')
        await pg.wait_for_timeout(1500)
        # 3 frustum: shadow casters never view-culled
        res=await ev("""(()=>{const v=TERRA.world.vegetation,out={};
          const cam=TERRA.world.rig.camera;cam.updateMatrixWorld();
          const pv=new (TERRA.world.renderer.constructor===0?Object:cam.projectionMatrix.constructor)().multiplyMatrices(cam.projectionMatrix,cam.matrixWorldInverse);
          return null})()""")
        st=await ev("(()=>{const v=TERRA.world.vegetation;const o={};for(const [k,s] of Object.entries(v.sets)) if(s.stats) o[k]=[s.mesh.castShadow,s.stats.culledView];return o})()")
        await ev("TERRA.gfx.setPreset('high')"); await pg.wait_for_timeout(2500)
        await ev("TERRA.world.rig.zoomBy(0.3)"); await pg.wait_for_timeout(5000)
        st=await ev("(()=>{const v=TERRA.world.vegetation;const o={};for(const [k,s] of Object.entries(v.sets)) if(s.stats) o[k]=[s.mesh.castShadow,s.stats.culledView];return o})()")
        shadowers=[k for k,x in st.items() if x[0]]
        ok(shadowers and all(st[k][1]==0 for k in shadowers),'shadow-casting sets are not frustum-culled',json.dumps({k:st[k] for k in shadowers}))
        ok(sum(x[1] for k,x in st.items() if not x[0])>0,'non-shadow sets are frustum-culled when zoomed in')
        # 4 presets really change what is submitted
        out={}
        for pre in ['low','medium','high','ultra']:
            await ev(f"TERRA.gfx.setPreset('{pre}')"); await pg.wait_for_timeout(2500)
            out[pre]=await ev("(()=>{let t=0,c=0;TERRA.world.scene.traverse(o=>{if(o.isInstancedMesh&&o.count){const g=o.geometry;t+=o.count*((g.index?g.index.count:g.attributes.position.count)/3);c+=o.count}});return [Math.round(t),c,TERRA.world.vegetation.lodScale,TERRA.world.vegetation.cullTree.value]})()")
        print('  presets',json.dumps(out))
        ok(out['low'][0]<out['medium'][0]<out['high'][0]<=out['ultra'][0],'instanced triangles grow low<medium<high<=ultra')
        ok(out['low'][2]<out['medium'][2]<out['high'][2],'LOD distance scale follows the preset')
        ok(out['low'][3]<out['medium'][3]<out['high'][3],'draw distance follows the preset')
        # 5 campaign + graphics
        await ev("TERRA.gameMode.enterCampaign()"); await pg.wait_for_timeout(500)
        errs0=len(errs)
        await ev("TERRA.campaign.start('s1')"); await pg.wait_for_timeout(1500)
        for pre in ['low','ultra','medium']:
            await ev(f"TERRA.gfx.setPreset('{pre}')"); await pg.wait_for_timeout(2000)
        ok(await ev("TERRA.campaign.run && TERRA.campaign.run.stageId==='s1'")  or await ev("!!TERRA.campaign.run"),'campaign run survives graphics preset changes')
        ok(len(errs)==errs0,'no errors while changing presets in a campaign stage',str(errs[errs0:]))
        # 6 dynamic resolution controller: steps of 5 %, floor respected
        await ev("TERRA.gfx.setPreset('ultra');TERRA.world.setDynamicScale(1);TERRA.perf.dynamicRes=true;TERRA.perf._cool=0")
        scales=[]
        for _ in range(14):
            await pg.wait_for_timeout(2500); scales.append(round(await ev("TERRA.world.drsScale"),3))
        print('  drs scales',scales)
        ok(all(abs((x*20)-round(x*20))<1e-6 for x in scales),'dynamic resolution moves in 5% steps')
        ok(min(scales)>=await ev("TERRA.perf.minScale")-1e-6,'dynamic resolution never below its floor')
        ok(sum(1 for i in range(1,len(scales)) if scales[i]!=scales[i-1])<=8,'dynamic resolution changes are infrequent',str(scales))
        ok(not errs,'no console errors',str(errs[:3]))
        print('TOTAL',sum(R),'/',len(R))
        await b.close()
asyncio.run(main())
