import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// Custom screen passes. All run after OutputPass, on display-referred colour.

// ── Grade: contrast, saturation, warm/cool tint, vignette ────────────────────
export function makeGradePass(opts) {
  return new ShaderPass({
    uniforms: {
      tDiffuse:  { value: null },
      uContrast: { value: opts.contrast },
      uSat:      { value: opts.saturation },
      uTint:     { value: new THREE.Color(1, 1, 1) },
      uVignette: { value: opts.vignette },
      uLift:     { value: new THREE.Color(opts.lift) },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform float uContrast, uSat, uVignette;
      uniform vec3 uTint, uLift;
      varying vec2 vUv;
      void main() {
        vec4 c = texture2D(tDiffuse, vUv);
        vec3 col = c.rgb;
        col = (col - 0.5) * uContrast + 0.5;
        float l = dot(col, vec3(0.299, 0.587, 0.114));
        col = mix(vec3(l), col, uSat);
        col *= uTint;
        col = uLift + col * (1.0 - uLift);
        vec2 d = vUv - 0.5;
        col *= 1.0 - uVignette * smoothstep(0.35, 0.85, length(d * vec2(1.0, 0.85)));
        gl_FragColor = vec4(clamp(col, 0.0, 1.0), c.a);
      }`,
  });
}

// ── Pixel snap: resample every screen pass onto the scene's pixel grid ──────
// Bloom and the vignette are smooth at full resolution; sampling at cell
// centres keeps them chunky, like hand-made pixel art.
export function makePixelSnapPass(pixelSize) {
  return new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      uRes:     { value: new THREE.Vector2(1, 1) },
      uPx:      { value: pixelSize },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform vec2 uRes;
      uniform float uPx;
      varying vec2 vUv;
      void main() {
        vec2 cell = floor(vUv * uRes / uPx);
        gl_FragColor = texture2D(tDiffuse, (cell + 0.5) * uPx / uRes);
      }`,
  });
}
