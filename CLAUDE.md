# flat-earth-sim: dev notes

A cozy pixel-art flat-earth simulation in the spirit of A Short Hike. Three.js with a low-res pixel render, bloom and a colour grade; vanilla ES modules, no bundler. Scale: 1 scene unit = 1,245 mi; disc radius = 10 units.

## Running & verifying

```
python serve.py 8000       # dev server with caching off (reloads always get fresh modules)
run.bat                    # Windows shortcut: opens the browser and runs serve.py on 8000
node --test                # unit tests (sim.js math, state.js round-trip); no npm needed
```

Open http://localhost:8000. ES modules are CORS-blocked from `file://`, so always serve. Use `serve.py` rather than `python -m http.server` while editing: Chrome otherwise mixes cached old modules with new ones and the page fills with import errors.

Run `node --test` after touching `js/sim.js` or `js/state.js`; CI runs it on push. The scale test (`latLonToDisc` vs the sun-path constants) is the guard against the map and the lore drifting apart.

### Smoke test

`smoke-test.html` builds the world and sky, renders one frame through the real post chain (`setupLook`), reads it back with `gl.readPixels`, and shows the report in `#report` (also beaconed as `/SMOKE_RESULT?msg=...` to the server log).

- The sky backdrop covers every pixel, so `lit` counts the brighter scene pixels (channel sum > 240) and `distinctColors` counts 3-bit colour bins. Build RNG is seeded, so the numbers are stable: `lit=255360/480000 distinctColors=129 objectsInScene=51` (measured 2026-10-11, GPU Chrome). A change to world, sky or look moves `lit`; a wildly different value, or 0, is a regression.
- Watch for 404s (missing vendor files, importmap errors).

### Headless screenshots (Windows)

- Playwright with `channel='chrome'` and `--use-angle=d3d11` renders real GPU frames headless; `page.clock.install()` + `run_for(ms)` steps the animation deterministically for GIFs.
- Drive the view with URL params (`?day=&time=&speed=0&cam=x,y,z`); all README screenshots are reproducible that way. `speed=0` freezes the clock: any other speed moves the sun during the wait, so the frame shows a later hour than `time=`. Any URL param also skips the title card, the fade-in and the intro swoop.
- README images: each WebP in `screenshots/` is one fresh-context shot at 1280×800 with `#hud,#dial` hidden. `screenshots/demo.gif` is 48 frames at 12 fps of `?day=172&time=6&speed=3&cam=12.8,3.5,12.8` (one sim day, so it loops; a low camera keeps the painted sky in frame), rendered at 1600×1000 under Playwright's fake clock, a canvas click first to stop auto-rotate, nearest-downscaled to 800 px. `screenshots/og.jpg` (1200×630, JPG for link-preview scrapers) is cut from `closeup.webp`.
- One Playwright page keeps its localStorage between `goto`s, so a later shot inherits the earlier shot's state unless its URL sets it.
- Software fallback: `msedge --headless=new --enable-unsafe-swiftshader --use-angle=swiftshader --window-size=1400,900 --virtual-time-budget=2500 --timeout=90000 --screenshot=out.png "http://localhost:8000/?speed=0"`. Keep `--virtual-time-budget` small; SwiftShader renders a few fps.
- Do NOT use `--dump-dom` (races module execution).
- Port 8000 can be taken by another local server; any port works, the page has no absolute URLs.

## Critical gotchas

### three.js split build
Three.js >= r167 is a **split build**: `vendor/three.module.js` re-exports from `vendor/three.core.js`. If `three.core.js` is missing, the entire module graph silently fails: black canvas, no `window.onerror`. Pin ONE three.js version across core + all addons. Both files must be present.

### CanvasTexture settings
All CanvasTextures need:
```js
texture.minFilter = THREE.NearestFilter;
texture.magFilter = THREE.NearestFilter;
texture.generateMipmaps = false;
texture.colorSpace = THREE.SRGBColorSpace;
```
Omitting `colorSpace = SRGBColorSpace` causes OutputPass to desaturate the texture. `applyNearestFilter()` in `textures.js` sets all four.

### ES modules + CORS
Always serve from HTTP. `file://` blocks ES module imports. The importmap in `index.html` maps `'three'` to `vendor/three.module.js` and `'three/addons/'` to `vendor/addons/`.

## Conventions

- No bundler, no framework, no npm. Plain ES modules.
- **One look**, held in `LOOK` in `js/look.js`: pixel size, edge strengths, shadow map size, bloom, exposure, grade. Change the look there, not in scene code. The pixel slider sets the base size; past `pixelRefDistance` the effective size shrinks with zoom (never below `pixelMin`), so small things keep their shape instead of dissolving into noise. Keep colour fields crisp too: the water's depth tint is stepped bands, not a gradient, because smooth gradients read as blur at pixel scale. Materials are `MeshToonMaterial` with the shared 4-step `toonRamp()`; land and decoration that should take the twilight band and winter frost go through `patchSurface()` (`js/surface.js`).
- **Textures are procedural** (Canvas 2D or shader) except two data assets: `js/land-data.js` (Natural Earth 1:110m land outlines, public domain) and `assets/tex/nebula.webp` (the night sky, AI-generated with Gemini). Any new AI-made asset goes in `assets/tex/` as WebP and is credited as AI-made in the README. `tools/gen_nebula.py` regenerates the night-sky candidates (needs `GEMINI_API_KEY`).
- **All lore values live in `CONSTANTS` in `js/sim.js`** with source comments. Change lore there, not in scene code. Sourced doctrine vs invented flavour is labelled in the README; keep new decoration labelled the same way. Trees, towns, lighthouses, penguins, birds, fireflies, balloons, the rock underside and the ship loops are flavour.
- **Sim state has one schema**: `STATE_SCHEMA` in `js/state.js` drives apply / capture / serialize / URL parse, reading inputs by id. Adding a toggle = one schema entry + a `<label class="tool" data-tip="Name"><input type="checkbox" id="chk-x" class="vh"><i data-icon="x"></i></label>` inside `#hud` + a `bindToggle` line in `ui.js` + a README URL-table row. Radio groups stay as hidden radios driven by a cycle button (`bindCycle`). Every state input must sit inside `#hud`: autosave and the UI sounds listen there. Entry order is apply order (`cam` last). URL params are one-shot (stripped after apply); sharing goes through the copy-link button.
- **Pure position helpers** (`sunPosAt(t)`, `moonPosAt(t)`, `shadowObjectPosAt(t)`, ...) in `js/sim.js` are the single model; `SimClock` getters and the almanac finders both call them. Never re-inline the orbit math.
- **Build-time randomness is seeded** (`buildRandom()` or a module's own `makeRng(seed)`, `js/rng.js`) so every load renders the same diorama; per-viewing randomness (meteor spawns, rain jitter, music notes, bird/foghorn timing) stays on `Math.random`.
- **The HUD carries no prose.** Controls are 12×12 pixel icons from `js/icons.js` (`'#'` grid rows, rendered as crisp SVG in `currentColor`); a control's name lives only in its one- or two-word `data-tip` hover label. Lore, constants and sources belong in the README, which the info card links to. Keys: Space pause, H hide HUD, P photo, Esc close or exit.
- **Sound is opt-in.** Everything in `js/audio.js` is synthesized and silent until the sound toggle is on: ambience, the generative music (A minor pentatonic over the pad drone) and `uiSound(kind)` for HUD actions.
- **Map projection is true azimuthal equidistant on the full disc**: `r = (90 − lat) / 180 × DISC_RADIUS`. North pole at the centre, south pole at the disc edge (Antarctica is the rim band, lat ≤ −70°), so 180° of latitude = 12,450 mi = the same mile scale as the sun-path constants (Cancer at 3.7 units under the June sun, Capricorn at 6.3 under the December sun). `latLonToDisc()` in `js/sim.js` is the only projection: the land mask (`terrain.js`), routes, observers, cities, capes, ships and the ground-view spot all go through it. `test/sim.test.js` pins this projection.
- `vendor/` is intentionally committed (pinned three.js 0.180.0, no CDN dependency).

## File map

| File | Purpose |
|---|---|
| `js/main.js` | Renderer, lights, OrbitControls, animation loop, localStorage persistence, one-shot URL params, intro swoop + fade-in, day factor, `setEdgeMode` (world + fog + audio), `setViewMode` (ground view stands at `GROUND_SPOT`) |
| `js/look.js` | `LOOK` settings + `setupLook`: tone mapping, shadows, pixel pass, bloom, grade, pixel snap |
| `js/post.js` | Custom passes: `makeGradePass`, `makePixelSnapPass` |
| `js/state.js` | `STATE_SCHEMA` + `applyState` / `captureState` / `serializeState` / `parseUrlState` |
| `js/sim.js` | Wall clock, pure `*At(t)` position helpers, CONSTANTS (all lore values); eclipse/full-moon/solstice finders, meteor-shower + frost math, `latLonToDisc` |
| `js/rng.js` | `makeRng(seed)` + `buildRandom` (seed 1337) |
| `js/land-data.js` | Natural Earth 1:110m land rings |
| `js/terrain.js` | Land mask + signed distance field, heightfield mesh with biomes, `heightAt` / `surfaceAt` / `isLand`, monopole and bipolar models |
| `js/water.js` | Ocean disc shader: banded depth tint, shore foam, wave normals, latitude and tropic rings |
| `js/surface.js` | Shared uniforms + `patchSurface` (twilight band, frost) + `updateSurface` |
| `js/world.js` | Builds terrain, water, dressing, dome, clouds and edges; `GROUND_SPOT`; `setEdgeMode` / `setModel`; drifting rain cells |
| `js/decor.js` | Ice-wall shards, forests, towns, lighthouses, penguins, floating-rock underside |
| `js/edges.js` | Waterfall curtain, infinite sea, beyond-the-wall ice shelf and islands |
| `js/life.js` | Bird flocks (day patch), fireflies (forests at night), hot-air balloons |
| `js/sky.js` | Backdrop sky shader, sun + beam cone, moon, star lamps, dome, planets, Shadow Object, constellations, aurora, shooting stars |
| `js/overlays.js` | Flight routes + observer pins; traffic (low-poly planes with vapour trails, boats with wakes); city light glows |
| `js/audio.js` | Procedural WebAudio: wind, pad, waterfall, rain, crickets, birds, foghorn, generative music, UI sounds |
| `js/textures.js` | Moon phases, glow sprite, toon ramp, `applyNearestFilter` |
| `js/ui.js` | HUD: dock, popovers, cycle buttons, hover labels, idle fade, keys, title card, day/night dial, postcards, photo mode, copy link, UI sounds; `initUI(ctx)` returns `{ toggles, jumpToEclipse }` |
| `js/icons.js` | Pixel icon grids + `hydrateIcons` / `setIcon` |
| `assets/tex/` | `nebula.webp` (AI-generated night sky) |
| `tools/gen_nebula.py` | Gemini prompt + call that made the night sky |
| `serve.py` | No-cache dev server |
| `test/` | `node --test` suites (`sim.test.js`, `state.test.js`) |
| `.github/workflows/test.yml` | CI: `node --test` on push / PR |
| `smoke-test.html` | Headless render + framebuffer health check |
| `vendor/` | Pinned Three.js 0.180.0 + addons |
