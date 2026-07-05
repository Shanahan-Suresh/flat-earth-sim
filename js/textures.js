import * as THREE from 'three';

function applyNearestFilter(texture) {
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
    const radius_px = (90 - lat) / 90 * 240;
    const angle = lon * Math.PI / 180;
    return {
      x: 256 + radius_px * Math.sin(angle),
      y: 256 - radius_px * Math.cos(angle),
    };
  }

  // North America
  const na = latLonToPixel(55, -100);
  drawCircle(na.x, na.y, 55, '#6db35a');

  // Greenland
  const gl = latLonToPixel(72, -42);
  drawCircle(gl.x, gl.y, 18, '#7cc06a');

  // Europe
  const eu = latLonToPixel(52, 15);
  drawCircle(eu.x, eu.y, 30, '#66a85a');

  // Russia/Asia — multiple overlapping circles
  const ca = latLonToPixel(50, 80);
  drawCircle(ca.x, ca.y, 45, '#6db35a');
  const ea = latLonToPixel(40, 120);
  drawCircle(ea.x, ea.y, 38, '#63a856');
  const sb = latLonToPixel(65, 100);
  drawCircle(sb.x, sb.y, 40, '#74bc60');

  // Africa
  const af = latLonToPixel(5, 20);
  drawCircle(af.x, af.y, 45, '#5fae50');

  // South America
  const sa = latLonToPixel(-15, -60);
  drawCircle(sa.x, sa.y, 40, '#6cba58');

  // Australia
  const au = latLonToPixel(-25, 133);
  drawCircle(au.x, au.y, 28, '#70b25e');

  // Land texture speckles — slightly lighter/darker dots over land areas
  const speckleColors = ['#7cc468', '#58a04c', '#86ce72'];
  for (let i = 0; i < 300; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * 230;
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
    const r = (90 - lat) / 90 * 240;
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
