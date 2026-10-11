"""Generate night-sky backdrop candidates with the Gemini image API.

    GEMINI_API_KEY=... python tools/gen_nebula.py [model] [count]

Writes nebula-0.jpg, nebula-1.jpg, ... to the current directory. The keeper is
resized to 1024 px wide and saved as assets/tex/nebula.webp (WebP q90).
"""
import base64, json, os, pathlib, sys, time, urllib.request

KEY = os.environ['GEMINI_API_KEY']
MODEL = sys.argv[1] if len(sys.argv) > 1 else 'gemini-3.1-flash-image'
N = int(sys.argv[2]) if len(sys.argv) > 2 else 3

PROMPT = (
    'A wide panoramic night sky backdrop for a cozy pixel-art video game, 2:1 aspect ratio. '
    'Deep indigo fading to violet near the bottom, with soft drifting nebula wisps in muted teal, lavender and dusty pink, '
    'and sparse tiny pale stars. Calm, dreamy, low contrast, dark overall so a bright scene in front of it stands out. '
    'Hand-painted pixel art style with soft clusters of pixels, no hard outlines. '
    'No moon, no planets, no landscape, no text, no frame. The left and right edges must match so it tiles horizontally.'
)

for i in range(N):
    body = {
        'contents': [{'parts': [{'text': PROMPT}]}],
        'generationConfig': {'responseModalities': ['IMAGE', 'TEXT']},
    }
    req = urllib.request.Request(
        f'https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent',
        data=json.dumps(body).encode(), headers={'Content-Type': 'application/json', 'x-goog-api-key': KEY})
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            res = json.load(r)
    except Exception as e:
        print(i, 'failed:', e)
        continue
    parts = res.get('candidates', [{}])[0].get('content', {}).get('parts', [])
    imgs = [p['inlineData'] for p in parts if 'inlineData' in p]
    if not imgs:
        print(i, 'no image', json.dumps(res)[:300])
        continue
    ext = 'png' if 'png' in imgs[0].get('mimeType', '') else 'jpg'
    path = pathlib.Path(f'nebula-{i}.{ext}')
    path.write_bytes(base64.b64decode(imgs[0]['data']))
    print(i, path.name, f'{time.time() - t0:.1f}s')
