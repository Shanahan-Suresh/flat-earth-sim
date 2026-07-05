# Flat Earth Sim

*A cozy pixel-art simulation of the flat earth — exactly as its believers describe it. Not a debunk; a faithful render of the lore.*

![Default view](screenshots/default.png)

Built with **Three.js 0.180.0 + RenderPixelatedPass** for a chunky pixel-diorama aesthetic. This is an earnest simulation, not a parody.

---

## What is this?

A real-time 3D diorama of the flat-earth consensus model as described by [TFES (The Flat Earth Society)](https://wiki.tfes.org) and related communities. Every constant, mechanic, and doctrine is sourced — see [The Model](#the-model-being-simulated) and [Sources](#sources).

- The sun orbits in a spiral above the disc, spotlighting a fraction of the surface (day/night)
- The moon is self-luminous and phases relative to the sun
- Stars rotate on a sidereal wheel; Polaris is fixed at the apex
- Planets follow Tychonic epicycles around the sun
- A Shadow Object causes lunar eclipses
- Four edge theories are selectable: Ice Wall, Edge Waterfall, Infinite Plane, Lands Beyond

---

## Screenshots

| Default view | Edge Waterfall | December sun (large outer orbit) |
|---|---|---|
| ![Default](screenshots/default.png) | ![Edge Waterfall](screenshots/edge-waterfall.png) | ![December sun](screenshots/december-sun.png) |

---

## Run it

**Windows (quickest):**

```
run.bat
```

**Any platform:**

```
python -m http.server 8000
```

Then open **http://localhost:8000**

> ES modules are CORS-blocked when opened directly from `file://` — always serve via HTTP.

---

## Controls

| Input | Action |
|---|---|
| Left-drag | Orbit camera |
| Right-drag / two-finger | Pan |
| Scroll | Zoom |
| Idle 15 s | Auto-rotate resumes |

**Right panel:**

| Section | Controls |
|---|---|
| **THE HEAVENS** | Toggle dome, clouds, sun beam, shadow object |
| **THE EDGE** | Ice Wall / Edge Waterfall / Infinite Plane / Lands Beyond |
| **TIME** | Pause, speed multiplier (0–20×), day-of-year scrubber |
| **LOOK** | Pixel size (2–8 px), camera reset |
| **?** | About modal with lore constants |

---

## URL Parameters

Initial state can be set via query string — useful for sharing views and automated screenshots:

| Param | Values | Meaning |
|---|---|---|
| `edge` | `icewall` \| `waterfall` \| `infinite` \| `beyond` | Edge mode |
| `dome`, `clouds`, `beam`, `shadow` | `0` \| `1` | Toggle dome / clouds / sun beam / shadow object |
| `day` | 0–364 | Day of year |
| `time` | 0–24 | Time of day (hours) |
| `speed` | number | Time multiplier (`0` = paused) |
| `px` | 2–8 | Pixel size |
| `cam` | `X,Y,Z` | Initial camera position |

Example: `http://localhost:8000/?edge=waterfall&day=172&time=15&speed=0&cam=12,2,12`

---

## The Model Being Simulated

| Lore constant | Value |
|---|---|
| Disc radius | 12,450 mi (10 units; 1 unit = 1,245 mi) |
| Ice wall height | ~150 ft lore (exaggerated for visibility) |
| Sun diameter | 32 mi (lore); upscaled ~13× for visibility |
| Moon diameter | 32 mi (lore); self-luminous cold light |
| Sun altitude | ~3,000 mi |
| Sun path radius | 4,600 mi (Jun 21, Tropic of Cancer) → 7,840 mi (Dec 21, Capricorn) |
| Sun ground speed | 1,204 mph (Jun 21) → 2,052 mph (Dec 21) |
| Solar declination | 23.44° amplitude; path radius = 5.0 − 1.3 × sin(decl/max) |
| Moon angular rate | 347.81°/day → 29.53-day synodic month |
| Star wheel period | 23.93 h sidereal day |
| Dome apex | ~3,100–6,000 mi (flattened hemisphere, Y-scale 0.32) |
| Planets | Tychonic: epicycles around the sun's position |
| Shadow Object | Invisible satellite of the sun; causes lunar eclipses (period ~20 sim-days) |

### Celestial mechanics

The sun traces a shrinking/expanding circular path above the disc. In June (d=172) its orbit is smallest (over the "Tropic of Cancer" at r≈3.7 units); in December it is largest (r≈6.3 units). One revolution every 24 h. The spotlit circular day-patch sweeping the map is the core lore mechanic — the sun illuminates only a fraction of the disc at once, explaining day/night.

The moon follows a similar path but advances at 347.81°/day, gaining on the sun by 12.19°/day → one lap relative to the sun every 29.53 days (synodic month). Moon phase is rendered as 8 pre-drawn pixel-art frames on a billboard sprite, selected each frame from the sun–moon angular separation.

Stars are fixed to a rotating wheel (sidereal day 23.93 h). Polaris sits at the apex and does not rotate.

### What the consensus actually says

- **Water does NOT fall off.** The ice wall (lore: ~150 ft of Antarctic ice) contains the oceans. The "edge waterfall" is an outsider meme; the community explicitly disavows it (included here as a toggle, labeled as such).
- **Gravity is replaced** by density & buoyancy + Universal Electromagnetic Acceleration (9.8 m/s² upward disc acceleration).
- **The moon is self-luminous**, emitting its own cold light — not reflecting the sun. This is core TFES doctrine.
- **Lunar eclipses** are caused by a dark "Shadow Object" — an invisible body orbiting the sun — not by the Earth's shadow (which would require a spherical Earth for the umbra geometry).
- **Southern-hemisphere 24-hour daylight** is geometrically impossible in the flat-earth model. The community denies or disputes the data.
- **Star rotation** in the southern hemisphere appears to circle a southern celestial pole — the community disputes or ignores this observation.

---

## Architecture

```
js/main.js        — renderer setup, EffectComposer, OrbitControls, animation loop
js/sim.js         — wall clock, orbital math, CONSTANTS (all lore values live here)
js/world.js       — disc geometry, ice wall, and all four edge variants
js/sky.js         — sun, moon, stars, dome, planets, Shadow Object
js/textures.js    — all textures procedural via Canvas 2D (no binary image assets)
js/ui.js          — right-panel HTML controls; reads/writes sim state

vendor/           — pinned Three.js 0.180.0 (intentionally committed, no CDN)
  three.module.js — re-exports from three.core.js (both files required)
  three.core.js   — the actual build; missing = silent black canvas
  addons/         — OrbitControls, EffectComposer, RenderPixelatedPass, OutputPass
```

`index.html` contains an importmap wiring `'three'` → `vendor/three.module.js` and `'three/addons/'` → `vendor/addons/`.

---

## Dev Notes

### Smoke test

`smoke-test.html` renders one composer frame, reads back the framebuffer with `gl.readPixels`, counts lit pixels / distinct colors / scene object count, and beacons the result via `GET /SMOKE_RESULT?msg=...` (visible in the HTTP server log).

Run as:

```
python -u -m http.server 8000
```

Watch stderr/log for the `/SMOKE_RESULT` beacon **and** for 404s. Do not use `--dump-dom` (races module execution) or rely on the static clock text in `index.html` (placeholder HTML).

Headless screenshots on Windows:

```
msedge --headless=new --enable-unsafe-swiftshader --use-angle=swiftshader \
  --virtual-time-budget=15000 --screenshot=out.png http://localhost:8000/
```

### three.core.js gotcha

Three.js ≥ r167 is a **split build**: `three.module.js` re-exports from `three.core.js`. If `three.core.js` is missing, the entire module graph silently fails — black canvas, no `window.onerror`. Always commit both files together and pin one version across core and addons.

---

## Sources

- [wiki.tfes.org](https://wiki.tfes.org) — Sun, Equinox, Electromagnetic Acceleration, Universal Acceleration, Lunar Eclipse due to Shadow Object, Southern Celestial Rotation, Tides
- Wikipedia: "Modern flat Earth beliefs"
- NCSE: "The Rim at the End of the World"
- Blake Marnell: *Flat Earth Sun, Moon & Zodiac Clock* app
- Samuel Rowbotham: *Zetetic Astronomy: Earth Not a Globe* (1865)
