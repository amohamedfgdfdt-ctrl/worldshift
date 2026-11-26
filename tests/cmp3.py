import asyncio, json, sys
from playwright.async_api import async_playwright
ARGS=['--no-sandbox','--use-angle=swiftshader','--use-gl=angle','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']
R=[]
def ok(name,cond,extra=''):
    R.append((name,bool(cond))); print(('PASS ' if cond else 'FAIL ')+name,extra)
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=ARGS)
        ctx=await b.new_context(viewport={'width':1280,'height':760}); pg=await ctx.new_page(); pg.set_default_timeout(200000)
        errs=[]; pg.on('pageerror',lambda e: errs.append('PE '+str(e))); pg.on('console',lambda m: errs.append(m.text[:200]) if m.type=='error' else None)
        ev=pg.evaluate
        await pg.goto('http://localhost:8123/index.html'); await pg.wait_for_function('window.__terraReady===true')
        ok('mode screen on first launch', await ev("!!document.querySelector('.mode-wrap')"))
        await pg.click('[data-go=sandbox]'); await pg.wait_for_timeout(500)
        ok('sandbox: no HUD, no gate', await ev("document.getElementById('cmp-hud').hidden && !TERRA.tools.gate && !TERRA.sim.economy.enforce"))
        await ev("TERRA.world.buildings.place('house_small',60,60,0); TERRA.save.save(true)")
        sandboxData=await ev("localStorage.getItem('worldshift.terra.save.v1')||Object.keys(localStorage).join(',')")
        gfx0=await ev("JSON.stringify(TERRA.gfx.values)")
        sb_key=await ev("TERRA.save.key")
        n0=await ev("TERRA.world.buildings.buildings.size")
        # sandbox: all types placeable without costs
        ok('sandbox: no cost on place', await ev("(()=>{const f=TERRA.sim.economy.funds;TERRA.world.buildings.place('farm',70,70,0);return TERRA.sim.economy.funds===f})()"))
        n0=await ev("TERRA.world.buildings.buildings.size")
        # -> campaign
        await ev("TERRA.save.save(true)")
        await pg.click('#btn-mode'); await pg.click('[data-go=campaign]'); await pg.wait_for_timeout(600)
        ok('stage list shown', await ev("!!document.querySelector('#cmp-list') && document.querySelectorAll('.stage-card').length===9"))
        ok('only stage 1 open', await ev("[...document.querySelectorAll('.stage-card')].map(c=>c.classList.contains('locked')).join()==='false,true,true,true,true,true,true,true,true'"))
        ok('locked stage cannot start', await ev("TERRA.campaign.start('s3')===false"))
        await pg.click('[data-a=play]'); await pg.wait_for_timeout(1500)
        ok('run active, HUD visible', await ev("TERRA.campaign.active && !document.getElementById('cmp-hud').hidden"))
        ok('campaign slot key', await ev("TERRA.save.slot==='campaign' && TERRA.save.key.includes('campaign')"))
        ok('economy enforcing, costs on', await ev("TERRA.sim.economy.enforce && !!TERRA.tools.gate"))
        ok('farm locked in stage 1', await ev("TERRA.tools.gate.isLocked('farm')"))
        await ev("TERRA.tools.setMode('build','farm')")
        ok('locked tool refuses', await ev("TERRA.tools.mode!=='build'"))
        ok('hint visible', await ev("!document.getElementById('trk-hint').hidden"))
        f0=await ev("TERRA.sim.economy.funds")
        await ev("TERRA.world.buildings.place('house_small',60,60,0); TERRA.tools.gate.placed('house_small')")
        ok('cost charged', (f0-await ev("TERRA.sim.economy.funds"))==150)
        # drive to win with bot
        await pg.add_script_tag(path='tests/bot.js')
        await ev("BOT.place('house_small',4,{maxDist:12,minDist:3}); BOT.road(6); BOT.place('water_tank',1,{maxDist:5}); BOT.step(8)")
        print(await ev('BOT.state()'))
        await pg.wait_for_selector('#cmp-result',timeout=30000)
        ok('result modal on win', await ev("!!document.querySelector('#cmp-result .bigstars')"))
        ok('stars saved', await ev("TERRA.campaign.stars('s1')>=1 && JSON.parse(localStorage.getItem('worldshift.terra.campaign.v1')).stages.s1.stars>=1"))
        ok('stage 2 unlocked, farm reward', await ev("TERRA.campaign.isUnlocked('s2') && TERRA.campaign.available().types.has('farm')"))
        await pg.screenshot(path='/tmp/c3_result.png')
        await pg.click('[data-r=next]'); await pg.wait_for_timeout(1500)
        ok('stage 2 started via Next', await ev("TERRA.campaign.run.stageId==='s2' && TERRA.campaign.active"))
        await ev("BOT.place('water_tank',2,{maxDist:5}); BOT.place('house_small',3,{maxDist:12,minDist:4}); BOT.step(1)")
        snap=await ev("({h:TERRA.campaign.run.elapsedGh,funds:Math.round(TERRA.sim.economy.funds),pop:TERRA.sim.economy.s.pop,done:JSON.stringify(TERRA.campaign.run.done),b:TERRA.world.buildings.buildings.size})")
        await ev("TERRA.save.save(true)")
        gfxC=await ev("JSON.stringify(TERRA.gfx.values)")
        ok('graphics settings untouched by stages', gfxC==gfx0)
        await pg.screenshot(path='/tmp/c3_hud.png')
        # reload -> resume
        await pg.reload(); await pg.wait_for_function('window.__terraReady===true'); await pg.wait_for_timeout(2500)
        snap2=await ev("({h:TERRA.campaign.run&&TERRA.campaign.run.elapsedGh,funds:Math.round(TERRA.sim.economy.funds),done:TERRA.campaign.run&&JSON.stringify(TERRA.campaign.run.done),b:TERRA.world.buildings.buildings.size,stage:TERRA.campaign.run&&TERRA.campaign.run.stageId,mode:TERRA.gameMode.mode})")
        print(snap,snap2)
        ok('resume: same stage and mode', snap2['stage']=='s2' and snap2['mode']=='campaign')
        ok('resume: elapsed/funds/objectives/buildings restored', abs(snap2['h']-snap['h'])<1 and abs(snap2['funds']-snap['funds'])<80 and snap2['done']==snap['done'] and snap2['b']==snap['b'])
        # -> sandbox
        await pg.click('#btn-mode'); await pg.click('[data-go=sandbox]'); await pg.wait_for_timeout(1500)
        ok('sandbox restored untouched', await ev(f"TERRA.world.buildings.buildings.size=== {n0}") and await ev("!TERRA.sim.economy.enforce && !TERRA.tools.gate && TERRA.save.slot==='sandbox'"))
        ok('sandbox funds/cost free again', await ev("(()=>{const f=TERRA.sim.economy.funds;TERRA.world.buildings.place('farm',90,90,0);return TERRA.sim.economy.funds===f})()"))
        ok('graphics settings unchanged', await ev("JSON.stringify(TERRA.gfx.values)")==gfx0)
        # back to campaign continues stage 2
        await pg.click('#btn-mode'); await pg.click('[data-go=campaign]'); await pg.wait_for_timeout(1500)
        ok('campaign continue after sandbox', await ev("TERRA.campaign.run&&TERRA.campaign.run.stageId==='s2'"))
        # language / RTL
        await pg.click('#btn-lang'); await pg.wait_for_timeout(500)
        ok('RTL + Arabic', await ev("document.documentElement.dir==='rtl' && document.querySelector('#trk-title').textContent.includes('القرية')"))
        await pg.screenshot(path='/tmp/c3_ar.png')
        await ev("TERRA.gameMode.showStages()"); await pg.wait_for_timeout(500); await pg.screenshot(path='/tmp/c3_ar_stages.png')
        await pg.click('#btn-lang') if False else None
        print('errs',errs[:8])
        ok('no console errors', len([e for e in errs if 'favicon' not in e and '404' not in e])==0)
        await b.close()
    print(sum(1 for _,c in R if c),'/',len(R))
asyncio.run(main())
