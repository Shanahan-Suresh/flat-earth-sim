"""Record a looping GIF of flat-earth-sim: one sim day, deterministic frames via Playwright's fake clock."""
import functools, http.server, io, pathlib, sys, threading
from PIL import Image
from playwright.sync_api import sync_playwright

here = pathlib.Path(r"D:/Projects/scratch/flat-earth-sim")  # check frames, throwaway
here.mkdir(parents=True, exist_ok=True)
site = pathlib.Path(r"D:/Projects/personal/flat-earth-sim")
out = site / "screenshots" / "demo.gif"
PORT = 8777
FPS = 12
SECONDS = 4.0          # speed=3 -> 1 sim day per 4 real seconds, so the loop closes
W, H = 2000, 1250
OUT_W = 1000
OH = int(H * OUT_W / W)

handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(site))
handler.log_message = lambda *a: None
srv = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), handler)
threading.Thread(target=srv.serve_forever, daemon=True).start()

frames = []
with sync_playwright() as p:
    browser = p.chromium.launch(channel="chrome", headless=True,
                                args=["--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-gpu"])
    page = browser.new_page(viewport={"width": W, "height": H})
    page.clock.install()
    page.goto(f"http://127.0.0.1:{PORT}/?day=172&time=6&speed=3&cam=12.8,3.5,12.8")
    page.add_style_tag(content="#hud,#dial{display:none!important}")
    page.clock.run_for(3000)
    page.wait_for_timeout(500)
    # A click on the canvas stops auto-rotate (it resumes after 15 s, past the recording), so the loop closes
    page.mouse.click(W // 2, H // 2)
    page.clock.run_for(500)
    n = int(FPS * SECONDS)
    for i in range(n):
        page.clock.run_for(int(1000 / FPS))
        img = Image.open(io.BytesIO(page.screenshot())).convert("RGB")
        frames.append(img.resize((OUT_W, OH), Image.NEAREST))
        print(f"\rframe {i + 1}/{n}", end="", file=sys.stderr)
    browser.close()
srv.shutdown()

sheet = Image.new("RGB", (OUT_W, OH * 6))
for k, f in enumerate(frames[:: max(1, len(frames) // 6)][:6]):
    sheet.paste(f, (0, OH * k))
pal = sheet.quantize(colors=256, method=Image.Quantize.MEDIANCUT)
q = [f.quantize(palette=pal, dither=Image.Dither.NONE) for f in frames]
q[0].save(out, save_all=True, append_images=q[1:], duration=int(1000 / FPS), loop=0, optimize=True)
q[0].convert("RGB").save(here / "gif-first.png")
q[len(q) // 2].convert("RGB").save(here / "gif-mid.png")
print(f"\n{out} {out.stat().st_size / 1e6:.2f} MB, {len(q)} frames", file=sys.stderr)
