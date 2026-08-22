# flat-earth-sim — dev notes

A cozy pixel-art flat-earth simulation. Three.js + RenderPixelatedPass, vanilla ES modules, no bundler. Scale: 1 scene unit = 1,245 mi; disc radius = 10 units.

## Running & verifying

```
run.bat                    # Windows shortcut — runs python -m http.server 8000
python -m http.server 8000 # any platform
node --test                # unit tests (sim.js math, state.js round-trip); no npm needed
```

Open http://localhost:8000. ES modules are CORS-blocked from `file://` — always serve.

Run `node --test` after touching `js/sim.js` or `js/state.js`; CI runs it on push. The scale test (`latLonToDisc` vs the sun-path constants) is the guard against the map and the lore drifting apart again.

### Smoke test

`smoke-test.html` renders one composer frame, counts lit pixels via `gl.readPixels`, and beacons the result to the server log:

```
python -u -m http.server 8000
```

Watch stderr/log for:
- `/SMOKE_RESULT?msg=...` beacon (scene health). Build RNG is seeded, so the number is stable: `lit=190336/480000 distinctColors=50 objectsInScene=34`. A different `lit` after a change to world/sky/textures is expected; a wildly different one (or 0) is a regression.
- Any 404s (missing vendor files, importmap errors)

### Headless screenshots (Windows)

```
msedge --headless=new --enable-unsafe-swiftshader --use-angle=swiftshader --window-size=1400,900 --virtual-time-budget=2500 --timeout=90000 --screenshot=out.png "http://localhost:8000/?speed=0&panel=open"
```

- Keep `--virtual-time-budget` small (≈2500). The scene renders at a few fps under SwiftShader, so 15 s of virtual time takes minutes; `--timeout` is the real-time cap.
- Drive the view with URL params (`?day=&time=&speed=0&cam=x,y,z&panel=open|closed`); all README screenshots are reproducible that way. `speed=0` freezes the clock so the frame is deterministic.
- Do NOT use `--dump-dom` (races module execution). Do NOT trust the static clock text in `index.html` (placeholder HTML, not live sim state).
- Port 8000 can be taken by another local server; any port works, the page has no absolute URLs.
- Quirk: a direct 390-px-wide headless shot omitted the fixed `#btn-collapse` although the DOM placed it at (323,8); rendering the page in a 390-px iframe inside a wider page shows it. Probe geometry through an iframe + `fetch('/PROBE?...')` beacon when a fixed element looks missing.

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
- **All lore values live in `CONSTANTS` in `js/sim.js`** with source comments. Change lore there, not in scene code. Sourced doctrine vs invented flavour is labelled in README / About / tooltips; keep new decoration labelled the same way.
- **Sim state has one schema**: `STATE_SCHEMA` in `js/state.js` drives apply / capture / serialize / URL parse. Adding a toggle = one schema entry + the `<input>` in `index.html` + its handler in `ui.js` + a README URL-table row. Entry order is apply order (`cam` last). URL params are one-shot (stripped after apply); sharing goes through COPY LINK.
- **Pure position helpers** (`sunPosAt(t)`, `moonPosAt(t)`, `shadowObjectPosAt(t)`, …) in `js/sim.js` are the single model; `SimClock` getters and the almanac finders both call them. Never re-inline the orbit math.
- **Build-time randomness goes through `buildRandom()`** (`js/rng.js`, seeded) so every load renders the same diorama; per-viewing randomness (meteor spawns, rain jitter, bird/foghorn timing) stays on `Math.random`.
- **Press Start 2P has no U+23E9/⏸-style glyphs** — button labels stay ASCII (`>>`, `PAUSE`); emoji (📷 🔗) fall back to the system emoji font and are fine.
- **Map projection is true azimuthal equidistant on the full disc**: `r = (90 − lat) / 180 × DISC_RADIUS` — north pole at the centre, south pole at the disc edge (Antarctica is the rim band, lat ≤ −70°), so 180° of latitude = 12,450 mi = the same mile scale as the sun-path constants (Cancer at 3.7 units under the June sun, Capricorn at 6.3 under the December sun). `latLonToDisc()` in `js/sim.js` is the only projection; `makeWorldMapTexture()` converts its units to canvas px (`256 / DISC_RADIUS` px per unit). Anything placed by lat/lon (map, routes, observers, cities, ships) goes through it. v1.1–1.2 squeezed 180° into 220 of 256 px and put the June sun over 12°N; `test/sim.test.js` pins the fix.
- Importmap in `index.html` wires the module specifiers to `vendor/`.
- `vendor/` is intentionally committed (pinned three.js 0.180.0, no CDN dependency).

## File map

| File | Purpose |
|---|---|
| `js/main.js` | Renderer setup, EffectComposer, OrbitControls, animation loop, localStorage persistence, one-shot URL params, `setEdgeMode` (world + fog + audio), `setViewMode` |
| `js/state.js` | `STATE_SCHEMA` + `applyState` / `captureState` / `serializeState` / `parseUrlState` |
| `js/sim.js` | Wall clock, pure `*At(t)` position helpers, CONSTANTS (all lore values); eclipse/full-moon/solstice finders, meteor-shower + frost math, `latLonToDisc` |
| `js/rng.js` | `makeRng(seed)` + `buildRandom` (seed 1337) for build-time randomness |
| `js/world.js` | Disc, ice wall, four edge variants; frost ring, drifting rain cells |
| `js/sky.js` | Sun, moon, stars, dome, planets, Shadow Object; constellations, shooting stars |
| `js/overlays.js` | Flight routes + observer pins on the AE map; distance/solar-time DOM boxes; traffic (planes + ships), city lights |
| `js/audio.js` | Procedural WebAudio: wind, firmament pad, waterfall crossfade, rain, crickets, dawn/dusk birds, ice-wall foghorn (no audio files) |
| `js/textures.js` | Procedural Canvas 2D textures |
| `js/ui.js` | Right-panel controls, almanac panel, postcards, tooltips, photo mode, COPY LINK; `initUI(ctx)` returns `{ toggles, jumpToEclipse }` |
| `test/` | `node --test` suites (`sim.test.js`, `state.test.js`) |
| `.github/workflows/test.yml` | CI: `node --test` on push / PR |
| `smoke-test.html` | Headless render + framebuffer health check |
| `vendor/` | Pinned Three.js 0.180.0 + addons |
