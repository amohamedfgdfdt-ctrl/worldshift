import asyncio, json, sys
from playwright.async_api import async_playwright
ARGS=['--no-sandbox','--use-angle=swiftshader','--use-gl=angle','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']
PLANS={
 's1': """BOT.place('house_small',3,{maxDist:8}); BOT.road(6); BOT.place('water_tank',1,{maxDist:5}); TERRA.world.water.addSource(30,30,8); out.push(BOT.state()); BOT.step(6); out.push(BOT.state());""",
 's3': """BOT.place('water_tank',3,{maxDist:4}); BOT.place('farm',4,{maxDist:3}); BOT.step(3); BOT.place('house_small',10,{maxDist:14,minDist:4}); out.push(BOT.state()); BOT.step(12); out.push(BOT.state()); BOT.step(12); out.push(BOT.state());""",
 's4': """BOT.place('water_tank',3,{maxDist:4,minSep:12}); BOT.place('farm',5,{maxDist:4,minDist:1.5,minSep:4}); BOT.place('wind_turbine',3,{maxDist:30,minDist:10}); BOT.place('solar_plant',1,{maxDist:30,minDist:10}); BOT.step(2); BOT.place('house_small',15,{maxDist:16,minDist:4}); out.push(BOT.state()); BOT.step(14); out.push(BOT.state()); BOT.place('wind_turbine',2,{maxDist:40,minDist:10}); BOT.step(14); out.push(BOT.state()); BOT.step(14); out.push(BOT.state());""",
 's5': """BOT.src(2); BOT.place('water_tank',3,{maxDist:4,minSep:12}); BOT.place('farm',4,{maxDist:4,minDist:1.5,minSep:4}); BOT.place('wind_turbine',3,{maxDist:40,minDist:10}); BOT.place('solar_plant',1,{maxDist:40,minDist:10}); BOT.place('house_small',10,{maxDist:16,minDist:4}); BOT.step(4); BOT.place('factory_small',2,{maxDist:30,minDist:4}); out.push(BOT.state()); BOT.step(8); BOT.place('house_small',12,{maxDist:16,minDist:4}); BOT.step(10); out.push(BOT.state()); BOT.step(16); out.push(BOT.state()); BOT.step(16); out.push(BOT.state());""",
 's2': """BOT.place('water_tank',3,{maxDist:4}); BOT.step(4); BOT.place('house_small',7,{maxDist:14,minDist:4}); out.push(BOT.state()); BOT.step(10); out.push(BOT.state()); BOT.step(10); out.push(BOT.state());""",
}
async def main(stage):
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=ARGS)
        pg=await b.new_page(viewport={'width':800,'height':500}); pg.set_default_timeout(280000)
        errs=[]; pg.on('pageerror',lambda e: errs.append('PE '+str(e))); pg.on('console',lambda m: errs.append(m.text[:200]) if m.type=='error' else None)
        await pg.add_init_script("localStorage.setItem('worldshift.terra.mode','sandbox')")
        await pg.goto('http://localhost:8123/index.html'); await pg.wait_for_function('window.__terraReady===true')
        await pg.add_script_tag(path='tests/bot.js')
        await pg.evaluate("TERRA.gameMode.enterCampaign(); TERRA.gameMode.closeScreen()")
        # unlock everything before the stage under test
        await pg.evaluate(f"""(()=>{{const c=TERRA.campaign;for(const s of c.stages){{if(s.id==='{stage}')break;c.progress.stages[s.id]={{stars:1,bestDays:1,bestStability:70}};}}}})()""")
        await pg.evaluate(f"TERRA.campaign.start('{stage}')")
        out=await pg.evaluate("(()=>{const out=[];"+PLANS[stage]+"return out})()")
        for o in out: print(json.dumps(o))
        print('errs',errs[:5]); await b.close()
asyncio.run(main(sys.argv[1]))
