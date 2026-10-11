import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPixelatedPass } from 'three/addons/postprocessing/RenderPixelatedPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { makeGradePass, makePixelSnapPass } from './post.js';

// The look: a low-res pixel diorama in the spirit of A Short Hike. The scene
// renders at 1/PIXEL resolution with crisp nearest upscaling; bloom and the
// grade are snapped back onto the same pixel grid so glows stay chunky.
export const LOOK = {
  pixel: 4,
  // Zoomed out past this camera distance, pixels shrink in step so trees and
  // towns keep a few pixels each instead of dissolving into noise
  pixelRefDistance: 18,
  pixelMin: 2,
  edges: { normal: 0.12, depth: 0.45 },
  shadowSize: 1024,
  bloom: { strength: 0.4, radius: 0.3, threshold: 1.0 },
  exposure: 1.05,
  grade: { contrast: 1.06, saturation: 1.14, vignette: 0.26, lift: '#0b0920' },
};

export function setupLook(renderer, scene, camera) {
  const L = LOOK;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = L.exposure;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const w = window.innerWidth, h = window.innerHeight;
  const target = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType });
  const composer = new EffectComposer(renderer, target);

  const pixelPass = new RenderPixelatedPass(L.pixel, scene, camera);
  pixelPass.normalEdgeStrength = L.edges.normal;
  pixelPass.depthEdgeStrength = L.edges.depth;
  composer.addPass(pixelPass);

  composer.addPass(new UnrealBloomPass(new THREE.Vector2(w, h), L.bloom.strength, L.bloom.radius, L.bloom.threshold));
  composer.addPass(new OutputPass());

  const grade = makeGradePass(L.grade);
  composer.addPass(grade);

  const snap = makePixelSnapPass(L.pixel);
  composer.addPass(snap);

  // Effective pixel size = the slider's size scaled by zoom, never below
  // pixelMin; it only steps when the target is clearly past a whole number,
  // so a camera resting near a threshold does not flicker between two sizes
  let basePx = L.pixel, zoomK = 1, curPx = L.pixel;
  function applyPx(target) {
    const want = Math.max(Math.min(L.pixelMin, basePx), Math.min(basePx, target));
    if (Math.abs(want - curPx) < 0.65 && want < basePx) return;
    const px = Math.round(want);
    if (px === curPx) return;
    curPx = px;
    pixelPass.setPixelSize(px);
    snap.uniforms.uPx.value = px;
  }

  function setSize(width, height) {
    composer.setSize(width, height);
    snap.uniforms.uRes.value.set(width, height);
  }
  setSize(w, h);

  return {
    settings: L,
    composer,
    pixelPass,
    grade,
    setSize,
    setPixelSize(px) {
      basePx = px;
      applyPx(basePx * zoomK);
    },
    // Called every frame with the camera's distance to its orbit target
    setZoom(distance) {
      zoomK = Math.min(1, L.pixelRefDistance / distance);
      applyPx(basePx * zoomK);
    },
  };
}
