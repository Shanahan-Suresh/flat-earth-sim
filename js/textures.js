import * as THREE from 'three';

export function applyNearestFilter(texture) {
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace; // canvas colors are sRGB — keeps palette rich
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

// Shared 4-step gradient map for every MeshToonMaterial
let _toonRamp = null;
export function toonRamp() {
  if (_toonRamp) return _toonRamp;
  const steps = [125, 175, 220, 255];
  const data = new Uint8Array(steps.length * 4);
  steps.forEach((v, i) => { data.set([v, v, v, 255], i * 4); });
  _toonRamp = new THREE.DataTexture(data, steps.length, 1, THREE.RGBAFormat);
  _toonRamp.magFilter = _toonRamp.minFilter = THREE.NearestFilter;
  _toonRamp.needsUpdate = true;
  return _toonRamp;
}
