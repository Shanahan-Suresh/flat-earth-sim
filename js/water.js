import * as THREE from 'three';
import { CONSTANTS } from './sim.js';
import { patchSurface } from './surface.js';

// ── Ocean: one translucent disc at sea level over the terrain's seabed ───────
// Colour follows distance from the coast (the terrain's coast texture) in
// crisp bands, like a painted map: turquoise shallows, a mid shelf, deep blue
// offshore, and a breathing foam line at the shore.
// Gentle wave normals let the sun spotlight paint a moving glint.

const R = CONSTANTS.DISC_RADIUS;

// Latitude rings and the dashed tropics, drawn on the water (monopole map only)
const ringR = lat => (90 - lat) / 180 * R;

export function buildWater(scene, terrain) {
  const uniforms = {
    uCoast: { value: terrain.current.coastTex },
    uRings: { value: 1 },
  };

  const material = patchSurface(new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.4,
    metalness: 0.0,
    transparent: true,
    depthWrite: false,
  }), {
    uniforms,
    fragDecl: `
uniform sampler2D uCoast;
uniform float uRings;
float ringLine(float r, float rr, float w) { return 1.0 - smoothstep(0.0, w, abs(r - rr)); }
`,
    fragColor: `
{
  vec2 cuv = vWPos.xz / ${(2 * R).toFixed(1)} + 0.5;
  vec4 coast = texture2D(uCoast, cuv);
  float off = coast.r;                       // 0 at the shore → 1 far out
  vec3 shallow = vec3(0.38, 0.83, 0.82);
  vec3 mid     = vec3(0.16, 0.56, 0.72);
  vec3 deep    = vec3(0.08, 0.30, 0.52);
  vec3 c = off < 0.07 ? shallow : off < 0.2 ? mid : off < 0.42 ? mix(mid, deep, 0.5) : deep;
  float a = off < 0.07 ? 0.66 : off < 0.2 ? 0.82 : 0.94;

  // Foam: a bright lip at the shore plus a second line that breathes in and out
  float lip = 1.0 - smoothstep(0.0, 0.025, off);
  float swell = 0.035 + 0.02 * sin(uTime * 0.9 + vWPos.x * 1.7 + vWPos.z * 1.3);
  float line = (1.0 - smoothstep(0.0, 0.012, abs(off - swell))) * (1.0 - smoothstep(0.03, 0.08, off));
  float foam = clamp(lip + line * 0.7, 0.0, 1.0) * (1.0 - coast.g);
  c = mix(c, vec3(0.96, 0.99, 1.0), foam * 0.85);
  a = max(a, foam);

  // Map lines: latitude rings and the tropics
  float r = length(vWPos.xz);
  float lines = 0.0;
  lines += ringLine(r, ${ringR(60).toFixed(3)}, 0.018) + ringLine(r, ${ringR(30).toFixed(3)}, 0.018)
         + ringLine(r, ${ringR(0).toFixed(3)}, 0.022) + ringLine(r, ${ringR(-30).toFixed(3)}, 0.018)
         + ringLine(r, ${ringR(-60).toFixed(3)}, 0.018);
  float ang = atan(vWPos.z, vWPos.x);
  float dash = step(0.5, fract(ang * 40.0));
  float tropics = (ringLine(r, ${ringR(CONSTANTS.SUN_DECLINATION_AMP).toFixed(3)}, 0.02)
                 + ringLine(r, ${ringR(-CONSTANTS.SUN_DECLINATION_AMP).toFixed(3)}, 0.02)) * dash;
  c = mix(c, vec3(0.75, 0.92, 1.0), clamp(lines, 0.0, 1.0) * 0.18 * uRings);
  c = mix(c, vec3(1.0, 0.85, 0.45), clamp(tropics, 0.0, 1.0) * 0.35 * uRings);

  diffuseColor.rgb = c;
  diffuseColor.a = a;
}
`,
    fragNormal: `
{
  vec2 p = vWPos.xz;
  float t = uTime;
  float sx = 0.07 * sin(p.x * 7.0 + t * 1.3) + 0.05 * sin((p.x + p.y) * 11.0 - t * 1.9) + 0.03 * sin(p.y * 17.0 + t * 2.3);
  float sz = 0.07 * sin(p.y * 6.5 - t * 1.1) + 0.05 * sin((p.x - p.y) * 10.0 + t * 1.6) + 0.03 * sin(p.x * 19.0 - t * 2.1);
  normal = normalize((viewMatrix * vec4(normalize(vec3(sx, 1.0, sz)), 0.0)).xyz);
}
`,
  });

  const mesh = new THREE.Mesh(new THREE.CircleGeometry(R - 0.02, 160), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.0;
  mesh.receiveShadow = true;
  mesh.renderOrder = 2;
  scene.add(mesh);

  terrain.onModel = current => {
    uniforms.uCoast.value = current.coastTex;
    uniforms.uRings.value = terrain.model === 'bipolar' ? 0 : 1;
  };

  return { mesh, material, uniforms };
}
