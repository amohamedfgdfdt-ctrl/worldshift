import asyncio, json, sys
BASE=len(sys.argv)>1 and sys.argv[1]=='base'
from playwright.async_api import async_playwright
ARGS=['--no-sandbox','--use-angle=swiftshader','--use-gl=angle','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']
async def main():
    out={}
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=ARGS)
        pg = await b.new_page(viewport={'width':900,'height':560}); pg.set_default_timeout(400000)
        errs=[]; pg.on('pageerror', lambda e: errs.append('PAGEERR '+str(e))); pg.on('console', lambda m: errs.append(m.text[:200]) if m.type=='error' else None)
        if BASE: await pg.route('**/assets/manifest.json', lambda r: r.fulfill(status=404))
        await pg.goto('http://localhost:8123/index.html'); await pg.wait_for_function('window.__terraReady===true')
        ev=pg.evaluate
        await pg.wait_for_function('Object.keys(TERRA.world.assets.loaded).length>=8' if not BASE else 'true')
        await pg.wait_for_timeout(1500)
        await ev("TERRA.perf.dynamicRes=false; TERRA.ui.el.toasts.innerHTML=''; document.querySelectorAll('.banner').forEach(e=>e.remove())")
        rep=await ev("TERRA.world.assets.report()")
        out['loaded']={k:{'variants':[(v['name'],v['size']['h'],[l['tris'] for l in v['levels']]) for v in x['variants']],'warn':x['warnings']} for k,x in rep['loaded'].items()}
        out['failed']=rep['failed']; out['warnings']=rep['warnings']; out['decoders']=rep['decoders']
        # distribution: instances per set
        out['sets']=await ev("""(()=>{const v=TERRA.world.vegetation;const o={};for(const [k,s] of Object.entries(v.sets)){o[k]={n:s.count??s.mesh?.count, lod:!!s.meshes}};return o})()""")
        out['counts']=await ev("TERRA.world.vegetation.counts()")
        # growth stages are variants, not LOD: every stage is its own set, and each has its own single level
        out['stage_sets']=await ev("Object.keys(TERRA.world.vegetation.sets).filter(k=>k.includes('#'))")
        out['info']=await ev("(()=>{const r=TERRA.world.renderer.info;return {geo:r.memory.geometries,tex:r.memory.textures,calls:r.render.calls,tris:r.render.triangles}})()")
        await pg.screenshot(path='/tmp/a2_world.png')
        # memory cycling across presets
        mem=[]
        for pre in ['low','ultra','medium','high','low']:
            await ev(f"TERRA.gfx.setPreset('{pre}')"); await pg.wait_for_timeout(2500)
            mem.append(await ev("(()=>{const r=TERRA.world.renderer.info;return [r.memory.geometries,r.memory.textures]})()"))
        out['mem_cycle']=mem
        # relative performance per preset
        perf={}
        for pre in ['low','medium','high','ultra']:
            await ev(f"TERRA.gfx.setPreset('{pre}'); TERRA.gfx.set({{fpsLimit:120}})"); await pg.wait_for_timeout(2500)
            f=await ev("""new Promise(r=>{let n=0,t0=performance.now();const f=()=>{if(++n==40)r(1000/((performance.now()-t0)/40));else requestAnimationFrame(f)};requestAnimationFrame(f)})""")
            perf[pre]=round(f,1)
        out['fps_swiftshader']=perf
        # fallback: bad URL must keep procedural trees and report failure
        res=await ev("""(async()=>{const a=TERRA.world.assets;const before=TERRA.world.vegetation.counts();
          let err=null;try{await a.useModel('oak','/does/not/exist.glb',{category:'tree',dimensions:{height:9},fit:'height'})}catch(e){err=String(e.message||e)}
          return {err, after:TERRA.world.vegetation.counts(), same:JSON.stringify(before)===JSON.stringify(TERRA.world.vegetation.counts()), still: Object.keys(TERRA.world.vegetation.sets).filter(k=>k.startsWith('oak'))}})()""")
        out['fallback']=res
        # save/restore still works with assets
        out['save']=await ev("(()=>{try{TERRA.save.save(true);return TERRA.save.hasSave()}catch(e){return String(e)}})()")
        out['errs']=errs[:6]
        await b.close()
    print(json.dumps(out,indent=1))
asyncio.run(main())
