import asyncio, json, sys
from playwright.async_api import async_playwright
ARGS=['--no-sandbox','--use-angle=swiftshader','--use-gl=angle','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']
OPTS={'s5':"{factories:3}",'s6':"{factories:0,roads:26,high:true,houseMin:6}",'s7':"{roads:0,houseMin:6,high:true}",'s8':"{high:true,houseMin:6}",'s9':"{factories:3,roads:10,high:true,houseMin:6}"}
GOAL={'s5':80,'s6':150,'s7':100,'s8':120,'s9':220}
async def main(stage,maxh):
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=ARGS)
        pg=await b.new_page(viewport={'width':800,'height':500}); pg.set_default_timeout(290000)
        errs=[]; pg.on('pageerror',lambda e: errs.append('PE '+str(e))); pg.on('console',lambda m: errs.append(m.text[:200]) if m.type=='error' else None)
        await pg.add_init_script("localStorage.setItem('worldshift.terra.mode','sandbox')")
        await pg.goto('http://localhost:8123/index.html'); await pg.wait_for_function('window.__terraReady===true')
        await pg.add_script_tag(path='tests/bot.js')
        await pg.evaluate("TERRA.gameMode.enterCampaign(); TERRA.gameMode.closeScreen(); import('/js/economy.js').then(m=>window.ECOCOST=Object.fromEntries(Object.entries(m.ECON).map(([k,v])=>[k,v.cost])))")
        await pg.evaluate(f"""(()=>{{const c=TERRA.campaign;for(const s of c.stages){{if(s.id==='{stage}')break;c.progress.stages[s.id]={{stars:1,bestDays:1,bestStability:70}};}}}})()""")
        await pg.evaluate(f"TERRA.campaign.start('{stage}')")
        r=await pg.evaluate(f"BOT.auto({maxh},{GOAL[stage]},{OPTS[stage]})")
        print(json.dumps(r)[:700]); print('errs',errs[:5]); await b.close()
asyncio.run(main(sys.argv[1], float(sys.argv[2]) if len(sys.argv)>2 else 120))
