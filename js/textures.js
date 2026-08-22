import * as THREE from 'three';
import { CONSTANTS, latLonToDisc } from './sim.js';
import { buildRandom, makeRng } from './rng.js';

export function applyNearestFilter(texture) {
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace; // canvas colors are sRGB — keeps palette rich
  return texture;
}

export function makeWorldMapTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  // Fill ocean — clearly-blue teal, bright enough to read on the night side
  ctx.fillStyle = '#2e7ea0';
  ctx.fillRect(0, 0, 512, 512);

  function drawCircle(x, y, r, color) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  // Canvas px per scene unit: the 256 px half-width is the 10-unit disc radius.
  const PX_PER_UNIT = 256 / CONSTANTS.DISC_RADIUS;
  // Same projection as everything else on the disc (routes, observers, cities):
  // latLonToDisc in sim.js, converted to canvas pixels. South pole = canvas edge.
  function latLonToPixel(lat, lon) {
    const p = latLonToDisc(lat, lon);
    return { x: 256 + p.x * PX_PER_UNIT, y: 256 + p.z * PX_PER_UNIT };
  }
  const latRadiusPx = lat => (90 - lat) / 180 * 256;

  // Continent blobs (radii sized for the full-disc projection)
  // North America
  const na = latLonToPixel(55, -100);
  drawCircle(na.x, na.y, 38, '#6db35a');

  // Greenland
  const gl = latLonToPixel(72, -42);
  drawCircle(gl.x, gl.y, 13, '#7cc06a');

  // Europe
  const eu = latLonToPixel(52, 15);
  drawCircle(eu.x, eu.y, 21, '#66a85a');

  // Russia/Asia — multiple overlapping circles
  const ca = latLonToPixel(50, 80);
  drawCircle(ca.x, ca.y, 31, '#6db35a');
  const ea = latLonToPixel(40, 120);
  drawCircle(ea.x, ea.y, 27, '#63a856');
  const sb = latLonToPixel(65, 100);
  drawCircle(sb.x, sb.y, 28, '#74bc60');

  // Africa
  const af = latLonToPixel(5, 20);
  drawCircle(af.x, af.y, 31, '#5fae50');

  // South America
  const sa = latLonToPixel(-15, -60);
  drawCircle(sa.x, sa.y, 28, '#6cba58');

  // Australia
  const au = latLonToPixel(-25, 133);
  drawCircle(au.x, au.y, 20, '#70b25e');

  // Land texture speckles — slightly lighter/darker dots over land areas
  const speckleColors = ['#7cc468', '#58a04c', '#86ce72'];
  for (let i = 0; i < 300; i++) {
    const angle = buildRandom() * Math.PI * 2;
    const dist = buildRandom() * 198; // keep speckles inside the land zone (north of ~50°S)
    const sx = 256 + dist * Math.cos(angle);
    const sy = 256 + dist * Math.sin(angle);
    const sc = speckleColors[Math.floor(buildRandom() * speckleColors.length)];
    // Only draw speckles — they'll be invisible over ocean but add texture over land
    ctx.beginPath();
    ctx.arc(sx, sy, 1.5, 0, Math.PI * 2);
    ctx.fillStyle = sc;
    ctx.fill();
  }

  // Antarctica: the rim band from ~70°S out to the south pole at the disc edge.
  // Two tones — coast then ice sheet; the ice-wall meshes stand at 9.9 units,
  // i.e. inside the outer (brighter) band. Pushed cold/blue so it still reads
  // as ice under warm ambient light.
  ctx.beginPath();
  ctx.arc(256, 256, 244, 0, Math.PI * 2);
  ctx.arc(256, 256, latRadiusPx(-70), 0, Math.PI * 2, true);
  ctx.fillStyle = '#c8ecff';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(256, 256, 256, 0, Math.PI * 2);
  ctx.arc(256, 256, 244, 0, Math.PI * 2, true);
  ctx.fillStyle = '#e4f8ff';
  ctx.fill();

  // Latitude gridlines
  ctx.strokeStyle = 'rgba(0,80,120,0.25)';
  ctx.lineWidth = 1;
  for (const lat of [60, 30, 0, -30, -60]) {
    ctx.beginPath();
    ctx.arc(256, 256, latRadiusPx(lat), 0, Math.PI * 2);
    ctx.stroke();
  }

  // Tropics (dashed): the sun's turning circles — its June path rides the
  // Tropic of Cancer, its December path the Tropic of Capricorn.
  ctx.strokeStyle = 'rgba(255,200,80,0.35)';
  ctx.setLineDash([3, 3]);
  for (const lat of [CONSTANTS.SUN_DECLINATION_AMP, -CONSTANTS.SUN_DECLINATION_AMP]) {
    ctx.beginPath();
    ctx.arc(256, 256, latRadiusPx(lat), 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // North Pole white dot
  drawCircle(256, 256, 12, '#e8f4f8');

  const texture = new THREE.CanvasTexture(canvas);
  return applyNearestFilter(texture);
}

export function makeWaterfallTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const stripeColors = ['#1a6080', '#2a90b0', '#60c0d8', '#a0dde8', '#ffffff'];

  const imageData = ctx.createImageData(64, 256);
  const data = imageData.data;

  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 64; x++) {
      const stripeIndex = Math.floor(x / 4) % 5;
      const hex = stripeColors[stripeIndex];

      // Parse hex color
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);

      // Darken toward bottom
      const brightness = 1 - (y / 256) * 0.35;

      const idx = (y * 64 + x) * 4;
      data[idx]     = Math.round(r * brightness);
      data[idx + 1] = Math.round(g * brightness);
      data[idx + 2] = Math.round(b * brightness);
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  applyNearestFilter(texture);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

export function makeMoonPhaseTextures() {
  // 8 chunky pixel-art moon phase frames, 32x32 each.
  // Frame f covers phase angle delta = f/8 * 2PI (0 = new, 4 = full).
  const frames = [];
  for (let f = 0; f < 8; f++) {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(32, 32);
    const data = img.data;
    const delta = (f / 8) * Math.PI * 2;
    for (let py = 0; py < 32; py++) {
      for (let px = 0; px < 32; px++) {
        const nx = (px - 15.5) / 15.5;
        const ny = (py - 15.5) / 15.5;
        const idx = (py * 32 + px) * 4;
        if (nx * nx + ny * ny > 1) { data[idx + 3] = 0; continue; }
        // Terminator: lit if beyond the phase ellipse (waxing: right side lit)
        const w = Math.sqrt(1 - ny * ny);
        const lit = delta <= Math.PI ? nx > w * Math.cos(delta) : nx < -w * Math.cos(delta);
        if (lit) {
          // pale blue-white "cold light" with subtle dither speckle
          const v = 224 + ((px * 7 + py * 13) % 3) * 10;
          data[idx] = v - 14; data[idx + 1] = v; data[idx + 2] = 255; data[idx + 3] = 255;
        } else {
          // faint dark-indigo ghost disc so new moon is still barely visible
          data[idx] = 34; data[idx + 1] = 36; data[idx + 2] = 70; data[idx + 3] = 200;
        }
      }
    }
    ctx.putImageData(img, 0, 0);
    frames.push(applyNearestFilter(new THREE.CanvasTexture(canvas)));
  }
  return frames;
}

export function makeTwilightTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  // Radial gradient: transparent center → warm orange band → transparent edge
  const grad = ctx.createRadialGradient(64, 64, 30, 64, 64, 64);
  grad.addColorStop(0,    'rgba(255,154,74,0)');   // transparent inner
  grad.addColorStop(0.55, 'rgba(255,154,74,0)');   // still transparent
  grad.addColorStop(0.68, 'rgba(255,154,74,0.82)');// peak warm orange
  grad.addColorStop(0.78, 'rgba(255,110,40,0.45)');// trailing ember
  grad.addColorStop(1.0,  'rgba(255,80,20,0)');    // fade to transparent

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);

  const texture = new THREE.CanvasTexture(canvas);
  return applyNearestFilter(texture);
}

export function makeAuroraTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  // Vertical gradient: transparent bottom → green mid → purple top → transparent
  const grad = ctx.createLinearGradient(0, 64, 0, 0);
  grad.addColorStop(0,    'rgba(74,255,154,0)');   // transparent bottom
  grad.addColorStop(0.15, 'rgba(74,255,154,0.08)');
  grad.addColorStop(0.32, 'rgba(74,255,154,0.7)'); // luminous green
  grad.addColorStop(0.55, 'rgba(120,74,255,0.65)');// purple mid
  grad.addColorStop(0.72, 'rgba(154,74,255,0.25)');
  grad.addColorStop(1.0,  'rgba(180,74,255,0)');   // transparent top

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);

  // 4 vertical brighter streaks
  const streakXs = [8, 22, 40, 56];
  for (const sx of streakXs) {
    const sg = ctx.createLinearGradient(0, 60, 0, 4);
    sg.addColorStop(0,    'rgba(74,255,154,0)');
    sg.addColorStop(0.25, 'rgba(74,255,200,0.35)');
    sg.addColorStop(0.55, 'rgba(180,120,255,0.3)');
    sg.addColorStop(1,    'rgba(180,74,255,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(sx - 1, 4, 3, 56);
  }

  const texture = new THREE.CanvasTexture(canvas);
  applyNearestFilter(texture);
  texture.wrapS = THREE.RepeatWrapping;
  return texture;
}

export function makeSparkleTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  // Transparent background
  ctx.clearRect(0, 0, 64, 64);

  // ~40 seeded 1–2px white/pale-cyan dots (own seed: tiling must not depend on build order)
  const rng = makeRng(42);
  for (let i = 0; i < 40; i++) {
    const x = Math.floor(rng() * 63);
    const y = Math.floor(rng() * 63);
    const size = rng() < 0.4 ? 2 : 1;
    const cyan = rng() < 0.35;
    ctx.fillStyle = cyan ? 'rgba(180,255,255,0.9)' : 'rgba(255,255,255,0.95)';
    ctx.fillRect(x, y, size, size);
  }

  const texture = new THREE.CanvasTexture(canvas);
  applyNearestFilter(texture);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

export function makeGlowSprite() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');

  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.3, 'rgba(255,255,255,0.6)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);

  const texture = new THREE.CanvasTexture(canvas);
  return applyNearestFilter(texture);
}

export function makePlaneTexture() {
  // 16x16 chunky plane silhouette pointing +X, 1px dark outline, transparent bg.
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, 16, 16);

  const outline = '#2c313d';
  const body = '#e6ecf5';

  const px = (x, y, w, h, color) => { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); };

  // Outline silhouette first (fuselage + wing/tail cross + nose taper)
  px(1, 7, 14, 2, outline);
  px(6, 3, 5, 10, outline);
  px(12, 6, 3, 4, outline);

  // Body fill inset ~1px where it reads clean
  px(2, 7, 12, 1, body);
  px(7, 4, 3, 8, body);
  px(12, 7, 3, 1, body);

  return canvas;
}

export function makeShipTexture() {
  // 16x12 dark hull, small white superstructure, one orange stack pixel, transparent bg.
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 12;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, 16, 12);

  const hullOutline = '#14181f';
  const hull = '#3a4250';
  const deck = '#e8ecf2';
  const stack = '#d9772f';

  ctx.fillStyle = hullOutline;
  ctx.fillRect(1, 7, 14, 4);
  ctx.fillStyle = hull;
  ctx.fillRect(2, 7, 12, 3);

  ctx.fillStyle = hullOutline;
  ctx.fillRect(5, 4, 6, 4);
  ctx.fillStyle = deck;
  ctx.fillRect(6, 5, 4, 2);

  ctx.fillStyle = stack;
  ctx.fillRect(8, 3, 1, 2);

  return canvas;
}

// ── Winter creep frost ring ────────────────────────────────────────────────────
// Module-scoped 256x256 canvas reused across redraws (one frostMesh in the scene).
let _frostCanvas = null;
let _frostCtx = null;

export function makeFrostTexture() {
  if (!_frostCanvas) {
    _frostCanvas = document.createElement('canvas');
    _frostCanvas.width = 256;
    _frostCanvas.height = 256;
    _frostCtx = _frostCanvas.getContext('2d');
    _frostCtx.imageSmoothingEnabled = false;
  }
  const texture = applyNearestFilter(new THREE.CanvasTexture(_frostCanvas));

  // innerFrac: 0..1 fraction of the 128px texture radius that stays clear;
  // beyond it ramps to pale blue-white frost toward the edge.
  function redraw(innerFrac) {
    const ctx = _frostCtx;
    const cx = 128, cy = 128;
    const innerR = Math.max(0, Math.min(1, innerFrac)) * 128;
    ctx.clearRect(0, 0, 256, 256);

    const grad = ctx.createRadialGradient(cx, cy, innerR, cx, cy, 128);
    grad.addColorStop(0, 'rgba(216,240,250,0)');
    grad.addColorStop(1, 'rgba(216,240,250,0.9)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, 128, 0, Math.PI * 2);
    ctx.fill();

    // Sparse 1-2px frost speckle grain in the frosted band (same grain every redraw)
    const rng = makeRng(7);
    for (let i = 0; i < 60; i++) {
      const a = rng() * Math.PI * 2;
      const rr = innerR + rng() * (128 - innerR);
      const sx = cx + rr * Math.cos(a);
      const sy = cy + rr * Math.sin(a);
      const size = rng() < 0.5 ? 1 : 2;
      ctx.fillStyle = 'rgba(240,250,255,0.85)';
      ctx.fillRect(sx, sy, size, size);
    }

    texture.needsUpdate = true;
  }

  redraw(1.0);
  return { texture, redraw };
}

export function makeBipolarMapTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  // Ocean fill — same teal as monopole
  ctx.fillStyle = '#2e7ea0';
  ctx.fillRect(0, 0, 512, 512);

  function drawCircle(x, y, r, color) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  // Left pole cluster (North America / Europe / Asia around left pole at ~px 156,256)
  const LP = { x: 156, y: 256 }; // left pole
  const RP = { x: 356, y: 256 }; // right pole

  // Left hemisphere continents (radiate from left pole)
  drawCircle(LP.x - 30, LP.y - 40, 32, '#6db35a'); // North America
  drawCircle(LP.x + 20, LP.y - 50, 22, '#66a85a'); // Europe
  drawCircle(LP.x + 50, LP.y - 20, 35, '#6db35a'); // Asia
  drawCircle(LP.x + 45, LP.y + 30, 28, '#5fae50'); // Africa (upper)
  drawCircle(LP.x - 50, LP.y + 20, 18, '#74bc60'); // Greenland area

  // Right hemisphere continents (radiate from right pole)
  drawCircle(RP.x - 30, RP.y + 40, 30, '#6cba58'); // South America
  drawCircle(RP.x + 20, RP.y + 50, 24, '#5fae50'); // Africa (lower)
  drawCircle(RP.x + 40, RP.y - 20, 26, '#70b25e'); // Australia
  drawCircle(RP.x - 20, RP.y - 40, 20, '#6db35a'); // SE Asia / Pacific
  drawCircle(RP.x + 60, RP.y + 10, 18, '#66a85a'); // Madagascar/India area

  // Same rim ice band as the monopole map (227–256 px from the canvas centre)
  ctx.beginPath();
  ctx.arc(256, 256, 244, 0, Math.PI * 2);
  ctx.arc(256, 256, 227, 0, Math.PI * 2, true);
  ctx.fillStyle = '#c8ecff';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(256, 256, 256, 0, Math.PI * 2);
  ctx.arc(256, 256, 244, 0, Math.PI * 2, true);
  ctx.fillStyle = '#e4f8ff';
  ctx.fill();

  // Horizontal dividing line between hemispheres
  ctx.strokeStyle = 'rgba(0,80,120,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(156, 100); ctx.lineTo(156, 412);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(356, 100); ctx.lineTo(356, 412);
  ctx.stroke();

  // Concentric circles around each pole (gridlines)
  for (const pole of [LP, RP]) {
    for (const r of [30, 60, 90]) {
      ctx.beginPath();
      ctx.arc(pole.x, pole.y, r, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(0,80,120,0.2)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    // Pole dot
    drawCircle(pole.x, pole.y, 8, '#e8f4f8');
  }

  const texture = new THREE.CanvasTexture(canvas);
  return applyNearestFilter(texture);
}
