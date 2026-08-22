# flat-earth-sim — dev notes

A cozy pixel-art flat-earth simulation. Three.js + RenderPixelatedPass, vanilla ES modules, no bundler. Scale: 1 scene unit = 1,245 mi; disc radius = 10 units.

## Running & verifying

```
run.bat                    # Windows shortcut — runs python -m http.server 8000
python -m http.server 8000 # any platform
```

Open http://localhost:8000. ES modules are CORS-blocked from `file://` — always serve.

### Smoke test

`smoke-test.html` renders one composer frame, counts lit pixels via `gl.readPixels`, and beacons the result to the server log:

```
python -u -m http.server 8000
```

Watch stderr/log for:
- `/SMOKE_RESULT?msg=...` beacon (scene health)
- Any 404s (missing vendor files, importmap errors)

### Headless screenshots (Windows)

```
msedge --headless=new --enable-unsafe-swiftshader --use-angle=swiftshader --virtual-time-budget=15000 --screenshot=out.png http://localhost:8000/
```

Do NOT use `--dump-dom` (races module execution). Do NOT trust the static clock text in `index.html` (placeholder HTML, not live sim state).

## Critical gotchas

### three.js split build
Three.js >= r167 is a **split build**: `vendor/three.module.js` re-exports from `vendor/three.core.js`. If `three.core.js` is missing, the entire module graph silently fails — black canvas, no `window.onerror`. Pin ONE three.js version across core + all addons. Both files must be present.

### CanvasTexture settings
All CanvasTextures need:
```js
texture.minFilter = THREE.NearestFilter;
texture.magFilter = THREE.NearestFilter;
texture.generateMipmaps = false;
texture.colorSpace = THREE.SRGBColorSpace;
```
Omitting `colorSpace = SRGBColorSpace` causes OutputPass to desaturate the texture.

### ES modules + CORS
Always serve from HTTP. `file://` blocks ES module imports. The importmap in `index.html` maps `'three'` → `vendor/three.module.js` and `'three/addons/'` → `vendor/addons/`.

## Conventions

- No bundler, no framework, no npm. Plain ES modules.
- All textures are procedural Canvas 2D — no binary image assets except the font (`assets/PressStart2P.ttf`).
- **All lore values live in `CONSTANTS` in `js/sim.js`** with source comments. Change lore there, not in scene code.
- **Map projection is true azimuthal equidistant on the full disc**: `r = (90 − lat) / 180 × DISC_RADIUS` — north pole at the centre, south pole at the disc edge (Antarctica is the rim band, lat ≤ −70°), so 180° of latitude = 12,450 mi = the same mile scale as the sun-path constants (Cancer at 3.7 units under the June sun, Capricorn at 6.3 under the December sun). `latLonToDisc()` in `js/sim.js` is the only projection; `makeWorldMapTexture()` converts its units to canvas px (`256 / DISC_RADIUS` px per unit). Anything placed by lat/lon (map, routes, observers, cities, ships) goes through it. v1.1–1.2 squeezed 180° into 220 of 256 px and put the June sun over 12°N; `test/sim.test.js` pins the fix.
- Importmap in `index.html` wires the module specifiers to `vendor/`.
- `vendor/` is intentionally committed (pinned three.js 0.180.0, no CDN dependency).

## File map

| File | Purpose |
|---|---|
| `js/main.js` | Renderer setup, EffectComposer, OrbitControls, animation loop |
| `js/sim.js` | Wall clock, orbital math, CONSTANTS (all lore values); eclipse/full-moon/solstice finders, meteor-shower + frost math |
| `js/world.js` | Disc, ice wall, four edge variants; frost ring, drifting rain cells |
| `js/sky.js` | Sun, moon, stars, dome, planets, Shadow Object; constellations, shooting stars |
| `js/overlays.js` | Flight routes + observer pins on the AE map; distance/solar-time DOM boxes; traffic (planes + ships), city lights |
| `js/audio.js` | Procedural WebAudio: wind, firmament pad, waterfall crossfade, rain, crickets, dawn/dusk birds, ice-wall foghorn (no audio files) |
| `js/textures.js` | Procedural Canvas 2D textures |
| `js/ui.js` | Right-panel controls, almanac panel; reads/writes sim state |
| `smoke-test.html` | Headless render + framebuffer health check |
| `vendor/` | Pinned Three.js 0.180.0 + addons |
