import sys, os, asyncio, json
HERE = os.path.dirname(os.path.abspath(__file__))
URL = 'file://' + os.path.join(os.path.dirname(HERE), 'test.html')
OUT = os.environ.get('EVOLY_SHOTS', '/tmp')
from playwright.async_api import async_playwright
async def run(name, w, h, mobile, targets, dark=False):
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=1, is_mobile=mobile, has_touch=mobile, color_scheme='dark' if dark else 'light')
        pg = await ctx.new_page()
        errs = []
        pg.on('console', lambda m: errs.append(f'{m.type}: {m.text}') if m.type in ('error', 'warning') else None)
        pg.on('pageerror', lambda e: errs.append(f'pageerror: {e}'))
        await pg.goto(URL)
        await pg.wait_for_timeout(2600)
        for i, t in enumerate(targets):
            if isinstance(t, str) and t.startswith('js:'):
                await pg.evaluate(t[3:]); await pg.wait_for_timeout(1400)
            else:
                if isinstance(t, str):
                    y = await pg.evaluate(f"(() => {{ const el = document.querySelector({json.dumps(t)}); return el.getBoundingClientRect().top + scrollY; }})()")
                else:
                    y = t
                await pg.evaluate(f"window.scrollTo(0, {y})")
                await pg.wait_for_timeout(1300)
            await pg.screenshot(path=os.path.join(OUT, f's_{name}_{i}.png'))
        print(name, 'errors:', errs[:10])
        await b.close()
if __name__ == '__main__':
    cfg = json.loads(sys.argv[1])
    asyncio.run(run(**cfg))
