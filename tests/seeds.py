import asyncio, json, sys
from playwright.async_api import async_playwright
ARGS=['--no-sandbox','--use-angle=swiftshader','--use-gl=angle','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=ARGS)
        pg=await b.new_page(viewport={'width':600,'height':400}); pg.set_default_timeout(280000)
        await pg.add_init_script("localStorage.setItem('worldshift.terra.mode','sandbox')")
        await pg.goto('http://localhost:8123/index.html'); await pg.wait_for_function('window.__terraReady===true')
        seeds=[int(x) for x in sys.argv[1:]]
        r=await pg.evaluate("""(seeds)=>{const W=TERRA.world,bs=W.buildings,out={};
          for(const sd of seeds){W.build(sd);
            let farmE=0,farmG=0,tank=0,house=0,dry=0;
            for(let j=4;j<124;j+=2)for(let i=4;i<124;i+=2){
              const ir=bs.irrigation({cx:i,cz:j,w:2,d:2});
              if(bs.evaluate('farm',i,j,0).ok){ if(ir.dist<=4&&ir.dist>=1.5)farmE++; else if(ir.dist<=8)farmG++; }
              if(bs.evaluate('water_tank',i,j,0).ok&&ir.dist<=4)tank++;
              if(bs.evaluate('house_small',i,j,0).ok){house++; if(ir.dist>4&&ir.dist<=16)dry++}
            }
            out[sd]={farmE,farmG,tank,house,dry,srcs:W.water.sources.length,vol:Math.round(W.water.totalVolume())};}
          return out}""", seeds)
        for k,v in r.items(): print(k,json.dumps(v))
        await b.close()
asyncio.run(main())
