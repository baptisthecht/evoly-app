import sys, os, asyncio, json
HERE = os.path.dirname(os.path.abspath(__file__))
URL = 'file://' + os.path.join(os.path.dirname(HERE), 'test.html')
OUT = os.environ.get('EVOLY_SHOTS', '/tmp')
from playwright.async_api import async_playwright
async def main(w, h, mobile, js):
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': w, 'height': h}, is_mobile=mobile, has_touch=mobile)
        pg = await ctx.new_page()
        await pg.goto(URL)
        await pg.wait_for_timeout(2600)
        print(json.dumps(await pg.evaluate(js), indent=1))
        await b.close()
asyncio.run(main(int(sys.argv[1]), int(sys.argv[2]), sys.argv[3]=='1', sys.argv[4]))
