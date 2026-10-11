import * as THREE from 'three';
import { CONSTANTS, frostFactor } from './sim.js';

// Shared ground effects for the terrain and water materials, injected into
// MeshStandardMaterial so lights and shadows keep working:
//   - twilight band: a warm ring just outside the sun's day patch
//   - winter frost: white creeping in from the rim, peaking at the Dec solstice
// One uniform set drives every patched material.

export const surfaceUniforms = {
  uSunXZ:  { value: new THREE.Vector2() },
  uFrostR: { value: 99 },          // inner frost radius (units); 99 = none
  uFrostK: { value: 0 },           // frost strength 0..1
  uTime:   { value: 0 },
};

const VERT_DECL = `
varying vec3 vWPos;
`;
const VERT_BODY = `
vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
`;

const FRAG_DECL = `
varying vec3 vWPos;
uniform vec2 uSunXZ;
uniform float uFrostR;
uniform float uFrostK;
uniform float uTime;
float sfHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
`;

// Runs after the material's base colour is known (diffuseColor)
const FRAG_BODY = `
{
  float dSun = length(vWPos.xz - uSunXZ);
  float band = smoothstep(${(CONSTANTS.DAY_PATCH_RADIUS - 0.7).toFixed(2)}, ${(CONSTANTS.DAY_PATCH_RADIUS - 0.1).toFixed(2)}, dSun)
             * (1.0 - smoothstep(${(CONSTANTS.DAY_PATCH_RADIUS + 0.1).toFixed(2)}, ${(CONSTANTS.DAY_PATCH_RADIUS + 0.9).toFixed(2)}, dSun));
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.35, 0.95, 0.75) + vec3(0.10, 0.04, 0.0), band * 0.55);

  float r = length(vWPos.xz);
  float grain = sfHash(floor(vWPos.xz * 18.0));
  float frost = smoothstep(uFrostR - 0.35, uFrostR + 0.15, r + (grain - 0.5) * 0.5) * uFrostK;
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.97, 1.0), frost * 0.85);
}
`;

export function patchSurface(material, extra = {}) {
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    Object.assign(shader.uniforms, surfaceUniforms, extra.uniforms || {});
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_DECL + (extra.vertDecl || ''))
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VERT_BODY + (extra.vertBody || ''));
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_DECL + (extra.fragDecl || ''))
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + (extra.fragColor || '') + FRAG_BODY)
      .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n' + (extra.fragNormal || ''))
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + (extra.fragEmissive || ''));
    if (prev) prev(shader, renderer);
  };
  return material;
}

let _lastFrostDay = null;
export function updateSurface(sim, t) {
  surfaceUniforms.uSunXZ.value.set(sim.sunX, sim.sunZ);
  surfaceUniforms.uTime.value = t;
  if (sim.day !== _lastFrostDay) {
    _lastFrostDay = sim.day;
    const s = frostFactor(sim.day);
    surfaceUniforms.uFrostR.value = CONSTANTS.FROST_INNER_MAX - s * (CONSTANTS.FROST_INNER_MAX - CONSTANTS.FROST_INNER_MIN);
    surfaceUniforms.uFrostK.value = (CONSTANTS.FROST_MAX_OPACITY / 0.5) * (0.25 + 0.75 * s);
  }
}
