import asyncio, json, sys
from playwright.async_api import async_playwright
ARGS=['--no-sandbox','--use-angle=swiftshader','--use-gl=angle','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']
async def main(seeds):
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=ARGS)
        pg=await b.new_page(viewport={'width':600,'height':400}); pg.set_default_timeout(290000)
        await pg.add_init_script("localStorage.setItem('worldshift.terra.mode','sandbox')")
        await pg.goto('http://localhost:8123/index.html'); await pg.wait_for_function('window.__terraReady===true')
        for sd in seeds:
            r=await pg.evaluate("""(seed)=>{const W=TERRA.world,bs=W.buildings,sim=TERRA.sim;W.build(seed);W.water.params.sourceRate=1;sim.setSpeed(4);sim.setRunning(true);
              const v0=W.water.totalVolume();const out=[];
              const flooded=()=>{let n=0,t=0;for(let j=4;j<124;j+=2)for(let i=4;i<124;i+=2){if(bs.evaluate('house_small',i,j,0).ok){t++;}}return t};
              const base=flooded();
              for(let h=0;h<=60;h+=20){ if(h>0){const t=TERRA.sim.minutes;let g=0;while(g<h*60-(out.length?out.length*0:0)&&g<20*60){sim.update(0.1);g+=0.8}} out.push([Math.round(W.water.totalVolume()),flooded()]); }
              return {v0:Math.round(v0),base,out}}""",sd)
            print(sd,json.dumps(r))
        await b.close()
asyncio.run(main([int(x) for x in sys.argv[1:]]))
