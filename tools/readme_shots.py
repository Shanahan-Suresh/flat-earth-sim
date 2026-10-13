"""README screenshots for flat-earth-sim: one fresh browser context per shot, HUD hidden, saved as WebP q90.

    python readme_shots.py                         all SHOTS into the repo's screenshots/
    python readme_shots.py OUT_DIR none a=QUERY    only the extra name=query shots, into OUT_DIR
    python readme_shots.py OUT_DIR closeup,night   only those SHOTS, into OUT_DIR
"""
import functools, http.server, io, pathlib, sys, threading
from PIL import Image
from playwright.sync_api import sync_playwright

site = pathlib.Path(r'D:\Projects\personal\flat-earth-sim')
out = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else site / 'screenshots'
PORT = 8776
SHOTS = {
    'closeup':        'day=172&time=6&speed=0&cam=-5,1.6,2.5',
    'night':          'day=172&time=0&speed=0&cam=-1,2.5,5',
    'ground-view':    'view=ground&day=172&time=16&speed=0',
    'edge-waterfall': 'edge=waterfall&day=172&time=18&speed=0&cam=13,2.5,13',
    'overlays':       'routes=1&observers=1&day=80&time=12&speed=0',
    'bipolar':        'model=bipolar&day=80&time=12&speed=0',
    'underside':      'day=172&time=12&speed=0&cam=13,-2.2,13',
    'ground-night':   'view=ground&day=172&time=2&speed=0',
}
ONLY = sys.argv[2].split(',') if len(sys.argv) > 2 else None
EXTRA = dict(a.split('=', 1) for a in sys.argv[3:])
SHOTS = {**{k: v for k, v in SHOTS.items() if not ONLY or k in ONLY}, **EXTRA}
WAIT = {'blood-moon': 9000}
out.mkdir(parents=True, exist_ok=True)

handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(site))
handler.log_message = lambda *a: None
srv = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), handler)
threading.Thread(target=srv.serve_forever, daemon=True).start()
errors = []
with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome', headless=True, args=['--use-angle=d3d11', '--ignore-gpu-blocklist'])
    for name, q in SHOTS.items():
        ctx = b.new_context(viewport={'width': 1280, 'height': 800})
        page = ctx.new_page()
        page.on('console', lambda m: m.type == 'error' and errors.append(m.text[:200]))
        page.on('pageerror', lambda e: errors.append(str(e)[:200]))
        page.goto(f'http://127.0.0.1:{PORT}/?{q}')
        page.wait_for_timeout(WAIT.get(name, 2500))
        page.add_style_tag(content='#hud,#dial{display:none!important}')
        page.wait_for_timeout(200)
        Image.open(io.BytesIO(page.screenshot())).convert('RGB').save(out / f'{name}.webp', quality=90)
        ctx.close()
        print(name)
    b.close()
srv.shutdown()
print('errors:', errors or 'none')
