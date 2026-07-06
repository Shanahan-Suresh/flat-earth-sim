import * as THREE from 'three';

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

  function latLonToPixel(lat, lon) {
    // Azimuthal equidistant: north pole (lat 90) at center, south pole (lat -90)
    // at the inner edge of the ice ring (r=220px). Full 180° of latitude spans 220px.
    const radius_px = (90 - lat) / 180 * 220;
    const angle = lon * Math.PI / 180;
    return {
      x: 256 + radius_px * Math.sin(angle),
      y: 256 - radius_px * Math.cos(angle),
    };
  }

  // Blob radii retuned (~×0.6) for the corrected /180 projection, which packs
  // the continents into a smaller central area than the old /90 formula did.
  // North America
  const na = latLonToPixel(55, -100);
  drawCircle(na.x, na.y, 33, '#6db35a');

  // Greenland
  const gl = latLonToPixel(72, -42);
  drawCircle(gl.x, gl.y, 11, '#7cc06a');

  // Europe
  const eu = latLonToPixel(52, 15);
  drawCircle(eu.x, eu.y, 18, '#66a85a');

  // Russia/Asia — multiple overlapping circles
  const ca = latLonToPixel(50, 80);
  drawCircle(ca.x, ca.y, 27, '#6db35a');
  const ea = latLonToPixel(40, 120);
  drawCircle(ea.x, ea.y, 23, '#63a856');
  const sb = latLonToPixel(65, 100);
  drawCircle(sb.x, sb.y, 24, '#74bc60');

  // Africa
  const af = latLonToPixel(5, 20);
  drawCircle(af.x, af.y, 27, '#5fae50');

  // South America
  const sa = latLonToPixel(-15, -60);
  drawCircle(sa.x, sa.y, 24, '#6cba58');

  // Australia
  const au = latLonToPixel(-25, 133);
  drawCircle(au.x, au.y, 17, '#70b25e');

  // Land texture speckles — slightly lighter/darker dots over land areas
  const speckleColors = ['#7cc468', '#58a04c', '#86ce72'];
  for (let i = 0; i < 300; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * 170; // keep speckles inside the (now smaller) land zone
    const sx = 256 + dist * Math.cos(angle);
    const sy = 256 + dist * Math.sin(angle);
    const sc = speckleColors[Math.floor(Math.random() * speckleColors.length)];
    // Only draw speckles — they'll be invisible over ocean but add texture over land
    ctx.beginPath();
    ctx.arc(sx, sy, 1.5, 0, Math.PI * 2);
    ctx.fillStyle = sc;
    ctx.fill();
  }

  // Ice ring (Antarctica edge band): annular ring from r=220 to r=230
  // Pushed cold/blue so it still reads as ice under warm ambient light
  ctx.beginPath();
  ctx.arc(256, 256, 230, 0, Math.PI * 2);
  ctx.arc(256, 256, 220, 0, Math.PI * 2, true);
  ctx.fillStyle = '#c8ecff';
  ctx.fill();

  // Slightly lighter outer edge
  ctx.beginPath();
  ctx.arc(256, 256, 240, 0, Math.PI * 2);
  ctx.arc(256, 256, 230, 0, Math.PI * 2, true);
  ctx.fillStyle = '#e4f8ff';
  ctx.fill();

  // Latitude gridlines
  ctx.strokeStyle = 'rgba(0,80,120,0.25)';
  ctx.lineWidth = 1;
  const latLines = [60, 30, 0, -30, -60];
  for (const lat of latLines) {
    const r = (90 - lat) / 180 * 220;
    ctx.beginPath();
    ctx.arc(256, 256, r, 0, Math.PI * 2);
    ctx.stroke();
  }

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

  // ~40 random 1–2px white/pale-cyan dots
  const rng = (() => { let s = 42; return () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; }; })();
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

  // Same ice ring as monopole — same px 220–240 radius from CANVAS CENTER
  ctx.beginPath();
  ctx.arc(256, 256, 230, 0, Math.PI * 2);
  ctx.arc(256, 256, 220, 0, Math.PI * 2, true);
  ctx.fillStyle = '#c8ecff';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(256, 256, 240, 0, Math.PI * 2);
  ctx.arc(256, 256, 230, 0, Math.PI * 2, true);
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
