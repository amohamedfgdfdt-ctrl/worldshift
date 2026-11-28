import asyncio, threading, functools, http.server, socketserver, time, re, json
from playwright.async_api import async_playwright
PORT=8921
def serve():
    h=functools.partial(http.server.SimpleHTTPRequestHandler, directory='/tmp/v3')
    class S(socketserver.TCPServer): allow_reuse_address=True
    with S(("127.0.0.1",PORT),h) as s: s.serve_forever()
threading.Thread(target=serve,daemon=True).start(); time.sleep(.4)
HARV="""()=>{const out=new Set();const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let n;while(n=w.nextNode()){const s=n.data.trim();const p=n.parentElement;if(!s||!p||/SCRIPT|STYLE/.test(p.tagName))continue;if(p.closest('[hidden]'))continue;const r=p.getBoundingClientRect();if(r.width<1||r.height<1)continue;if(/[A-Za-z]{3,}/.test(s))out.add(s)}
for(const e of document.querySelectorAll('[title],[aria-label]')){for(const a of ['title','aria-label']){const s=e.getAttribute(a);if(s&&/[A-Za-z]{3,}/.test(s))out.add('@'+s)}}return [...out]}"""
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        ctx=await b.new_context(viewport={'width':1000,'height':700}); pg=await ctx.new_page()
        await pg.add_init_script("localStorage.setItem('worldshift.terra.lang','ar');localStorage.setItem('worldshift.terra.tutorial','done')")
        await pg.goto(f'http://127.0.0.1:{PORT}/index.html?sandbox=1&noassets=1&gfx=low',wait_until='load'); await pg.wait_for_timeout(4000)
        found={}
        async def grab(tag): 
            for s in await pg.evaluate(HARV): found.setdefault(s,tag)
        await grab('main')
        for cat in ['buildings','nature','infrastructure','water','world']:
            await pg.evaluate(f"document.querySelector('[data-cat={cat}]')?.click()"); await pg.wait_for_timeout(400); await grab(cat)
        # click a few buildings cards + toggles for info
        await pg.evaluate("document.querySelector('[data-cat=world]')?.click()")
        for act in ['gfx','preview','tutorial']:
            await pg.evaluate(f"document.querySelector('[data-act={act}]')?.click()"); await pg.wait_for_timeout(700); await grab(act)
            await pg.keyboard.press('Escape')
        print(json.dumps(found,ensure_ascii=False,indent=0))
        await b.close()
asyncio.run(main())
