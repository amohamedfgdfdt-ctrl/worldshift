import asyncio, json, sys
from playwright.async_api import async_playwright
ARGS=['--no-sandbox','--use-angle=swiftshader','--use-gl=angle','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']
async def main(seed,ev,dur):
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=ARGS)
        pg=await b.new_page(viewport={'width':600,'height':400}); pg.set_default_timeout(280000)
        await pg.add_init_script("localStorage.setItem('worldshift.terra.mode','sandbox')")
        await pg.goto('http://localhost:8123/index.html'); await pg.wait_for_function('window.__terraReady===true')
        r=await pg.evaluate("""([seed,ev,dur])=>{const W=TERRA.world,bs=W.buildings,sim=TERRA.sim;W.build(seed);W.water.params.sourceRate=1.1;sim.setSpeed(4);sim.setRunning(true);
          const bands=[[0,4],[4,8],[8,12],[12,16],[16,99]];
          const cells=[];for(let j=4;j<124;j+=2)for(let i=4;i<124;i+=2){if(bs.evaluate('house_small',i,j,0).ok){const ir=bs.irrigation({cx:i,cz:j,w:2,d:2});cells.push([i,j,ir.dist])}}
          const res={n:bands.map(()=>0),fl0:bands.map(()=>0),fl1:bands.map(()=>0),fl2:bands.map(()=>0)};
          const cnt=(k)=>{for(const [i,j,d] of cells){const b=bands.findIndex(([a,c])=>d>=a&&d<c);const dep=W.water.depth[(j+1)*129+(i+1)];if(k==0)res.n[b]++;if(dep>0.5)res['fl'+k][b]++;}};
          for(let k=0;k<400;k++)sim.update(0.1); cnt(0); res.fl0=res.fl1; res.fl1=bands.map(()=>0);
          TERRA.sim.events.start(ev,dur); let mx=bands.map(()=>0);
          for(let k=0;k<Math.ceil(dur*24/0.8)+300;k++){sim.update(0.1); if(k%20==0){const t=bands.map(()=>0);for(const [i,j,d] of cells){const b=bands.findIndex(([a,c])=>d>=a&&d<c);if(W.water.depth[(j+1)*129+(i+1)]>0.5)t[b]++}mx=mx.map((m,x)=>Math.max(m,t[x]))}}
          return {n:res.n,before:res.fl0,peakFlooded:mx}}""",[seed,ev,dur])
        print(seed,ev,json.dumps(r)); await b.close()
asyncio.run(main(int(sys.argv[1]),sys.argv[2],float(sys.argv[3])))
