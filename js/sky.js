import * as THREE from 'three';
import { CONSTANTS, eclipseAlignmentFactor, activeShower } from './sim.js';
import { makeMoonPhaseTextures, makeGlowSprite } from './textures.js';
import { surfaceUniforms } from './surface.js';
import { buildRandom } from './rng.js';

// Point on the star shell given azimuth (deg) and polar angle from the dome
// apex (deg, 0 = apex where Polaris sits). Mirrors makeStarLayer's hemisphere
// math exactly (same STAR_RADIUS, same STAR_Y_SCALE flatten) so constellations
// and meteors sit on the same shell as the star field.
export function mapDomeCoord(azDeg, polarDeg) {
  const phi = polarDeg * Math.PI / 180;
  const theta = azDeg * Math.PI / 180;
  const r = CONSTANTS.STAR_RADIUS;
  return new THREE.Vector3(
    r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi) * CONSTANTS.STAR_Y_SCALE,
    r * Math.sin(phi) * Math.sin(theta)
  );
}

// Backdrop: a big inverted sphere whose gradient warms on the side facing the sun
const BACKDROP_VERT = `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const BACKDROP_FRAG = `
uniform float uDay;
uniform float uGround;
uniform vec2 uSunDir;
uniform sampler2D uNebula;
varying vec3 vDir;
void main() {
  float h = clamp(vDir.y * 0.5 + 0.5, 0.0, 1.0);
  // From the diorama the day side stays a deep navy; standing on the ground under the sun it is a blue sky
  vec3 dayTop = mix(vec3(0.03, 0.06, 0.16), vec3(0.08, 0.22, 0.58), uGround);
  vec3 dayLow = mix(vec3(0.09, 0.10, 0.20), vec3(0.32, 0.50, 0.78), uGround);
  vec3 top = mix(vec3(0.012, 0.012, 0.045), dayTop, uDay);
  vec3 low = mix(vec3(0.04, 0.03, 0.085), dayLow, uDay);
  vec3 flo = vec3(0.01, 0.02, 0.04);
  vec3 c = h > 0.5 ? mix(low, top, smoothstep(0.5, 0.95, h)) : mix(flo, low, smoothstep(0.15, 0.5, h));
  // Painted night sky (AI-generated, assets/tex/nebula.webp) above the horizon, on the night side
  vec2 nuv = vec2(atan(vDir.z, vDir.x) / 6.2832 + 0.5, clamp(asin(clamp(vDir.y, -1.0, 1.0)) / 1.5708, 0.0, 1.0) * 0.92 + 0.04);
  vec3 neb = texture2D(uNebula, nuv).rgb;
  float above = smoothstep(-0.05, 0.12, vDir.y);
  c = mix(c, neb * 1.35, above * (1.0 - uDay * 0.6) * 0.95);
  // Warm glow low on the horizon, on the side the sun is
  float toward = max(dot(normalize(vDir.xz + 1e-5), uSunDir), 0.0);
  float horizon = exp(-abs(vDir.y - 0.02) * 9.0);
  c += vec3(0.42, 0.20, 0.10) * pow(toward, 3.0) * horizon * (0.35 + 0.65 * uDay);
  gl_FragColor = vec4(c, 1.0);
}`;

// Star lamps hang on the dome's underside and shine down: full brightness from
// under the dome, dimmer from outside it. Each lamp twinkles on its own phase.
function lampify(mat) {
  mat.onBeforeCompile = shader => {
    shader.uniforms.uTime = surfaceUniforms.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aPhase;\nuniform float uTime;\nvarying float vLamp;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec3 wp = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vec3 down = -normalize(vec3(wp.x, wp.y / ${CONSTANTS.STAR_Y_SCALE.toFixed(2)}, wp.z));
        float facing = dot(down, normalize(cameraPosition - wp));
        vLamp = mix(0.3, 1.0, smoothstep(-0.2, 0.35, facing)) * (0.65 + 0.35 * sin(uTime * 2.3 + aPhase * 7.0));`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vLamp;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vLamp;');
  };
}

function loadNebula() {
  const tex = new THREE.TextureLoader().load('assets/tex/nebula.webp');
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

export function buildSky(scene) {
  const backdrop = new THREE.Mesh(
    new THREE.SphereGeometry(120, 32, 16),
    new THREE.ShaderMaterial({
      uniforms: { uDay: { value: 0 }, uGround: { value: 0 }, uSunDir: { value: new THREE.Vector2(1, 0) }, uNebula: { value: loadNebula() } },
      vertexShader: BACKDROP_VERT,
      fragmentShader: BACKDROP_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
    })
  );
  backdrop.renderOrder = -10;
  scene.add(backdrop);

  // ── Star Wheel ──────────────────────────────────────────────────────────────
  // Two layers: ~400 faint white + ~100 brighter pale-gold — a delicate dome
  // of fireflies, not confetti.
  const starGroup = new THREE.Group();

  function makeStarLayer(count, color, size, opacity) {
    const positions = [];
    for (let i = 0; i < count; i++) {
      const phi = Math.acos(buildRandom()); // hemisphere
      const theta = buildRandom() * Math.PI * 2;
      const r = CONSTANTS.STAR_RADIUS;
      positions.push(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.cos(phi) * CONSTANTS.STAR_Y_SCALE, // flatten to dome shape
        r * Math.sin(phi) * Math.sin(theta)
      );
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const phases = new Float32Array(count);
    for (let i = 0; i < count; i++) phases[i] = buildRandom() * 6.283;
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    const mat = new THREE.PointsMaterial({
      color, size, opacity,
      sizeAttenuation: false,
      transparent: true,
      depthWrite: false,
    });
    lampify(mat);
    return new THREE.Points(geo, mat);
  }

  starGroup.add(makeStarLayer(400, 0xf0ead8, 1, 0.45));  // faint field (1 pixel)
  starGroup.add(makeStarLayer(100, 0xffeec0, 1, 0.95));  // brighter pale-gold

  // ── Constellations ──────────────────────────────────────────────────────────
  // Lamps hung on the dome's underside — fixed figures in the star wheel, so
  // they're built as one merged LineSegments + one merged Points and added as
  // children of starGroup: sidereal co-rotation comes for free.
  const constellationLinePositions = [];
  const constellationStarPositions = [];
  for (const figure of CONSTANTS.CONSTELLATIONS) {
    for (const [az, polar] of figure.stars) {
      const p = mapDomeCoord(az, polar);
      constellationStarPositions.push(p.x, p.y, p.z);
    }
    for (const [i, j] of figure.segs) {
      const a = mapDomeCoord(figure.stars[i][0], figure.stars[i][1]);
      const b = mapDomeCoord(figure.stars[j][0], figure.stars[j][1]);
      constellationLinePositions.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
  }

  const constellationLineGeo = new THREE.BufferGeometry();
  constellationLineGeo.setAttribute('position', new THREE.Float32BufferAttribute(constellationLinePositions, 3));
  const constellationLineMat = new THREE.LineBasicMaterial({
    color: 0x9fb8ff, transparent: true, opacity: 0.4, depthWrite: false,
  });
  const constellationLines = new THREE.LineSegments(constellationLineGeo, constellationLineMat);

  const constellationStarGeo = new THREE.BufferGeometry();
  constellationStarGeo.setAttribute('position', new THREE.Float32BufferAttribute(constellationStarPositions, 3));
  constellationStarGeo.setAttribute('aPhase', new THREE.BufferAttribute(
    Float32Array.from({ length: constellationStarPositions.length / 3 }, (_, i) => (i * 2.399) % 6.283), 1));
  const constellationStarMat = new THREE.PointsMaterial({
    color: 0xcfe0ff, size: 2, sizeAttenuation: false, transparent: true,
  });
  lampify(constellationStarMat);
  const constellationStars = new THREE.Points(constellationStarGeo, constellationStarMat);

  starGroup.add(constellationLines);
  starGroup.add(constellationStars);

  const constellationLinesBaseOpacity = constellationLineMat.opacity;
  const constellationStarsBaseOpacity = constellationStarMat.opacity;

  scene.add(starGroup);

  // ── Shooting stars / meteors ─────────────────────────────────────────────────
  // Pool of 3 reusable streaks, added to the SCENE (not starGroup) — meteors
  // don't ride the sidereal wheel.
  const meteors = [];
  for (let i = 0; i < 3; i++) {
    const meteorGeo = new THREE.BufferGeometry();
    const meteorPosAttr = new THREE.Float32BufferAttribute(new Float32Array(6), 3);
    meteorPosAttr.setUsage(THREE.DynamicDrawUsage);
    meteorGeo.setAttribute('position', meteorPosAttr);
    const meteorMat = new THREE.LineBasicMaterial({
      color: 0xfff2c8, transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const meteorLine = new THREE.Line(meteorGeo, meteorMat);
    meteorLine.visible = false;
    meteorLine.userData = { active: false, t: 0, from: new THREE.Vector3(), dir: new THREE.Vector3(), len: 0 };
    scene.add(meteorLine);
    meteors.push(meteorLine);
  }

  // Polaris: fixed at apex, not in starGroup (it sits on the rotation axis)
  const polarisGeo = new THREE.SphereGeometry(0.04, 4, 4);
  const polarisMat = new THREE.MeshBasicMaterial({ color: 0xffffee });
  const polarisStarMesh = new THREE.Mesh(polarisGeo, polarisMat);
  polarisStarMesh.position.set(0, CONSTANTS.STAR_RADIUS * CONSTANTS.STAR_Y_SCALE, 0);
  scene.add(polarisStarMesh);

  // ── Sun ─────────────────────────────────────────────────────────────────────
  const sunGeo = new THREE.SphereGeometry(CONSTANTS.SUN_RADIUS, 8, 6);
  // Brighter than white so only the sun (not the lit ground) crosses the bloom threshold
  const sunMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(5.0, 3.9, 1.6) });
  const sunMesh = new THREE.Mesh(sunGeo, sunMat);

  const sunGlowGeo = new THREE.SphereGeometry(CONSTANTS.SUN_RADIUS * 1.6, 8, 6);
  const sunGlowMat = new THREE.MeshBasicMaterial({
    color: 0xffaa22,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const sunGlowMesh = new THREE.Mesh(sunGlowGeo, sunGlowMat);

  const glowTex = makeGlowSprite();
  const sunHalo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: new THREE.Color(1.6, 1.15, 0.55), transparent: true, opacity: 0.55,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  sunHalo.scale.set(2.2, 2.2, 1);

  const sunGroup = new THREE.Group();
  sunGroup.add(sunMesh);
  sunGroup.add(sunGlowMesh);
  sunGroup.add(sunHalo);
  scene.add(sunGroup);

  // Warm-tinted, tuned so map colors show warmly inside the day patch
  // rather than blowing out to white at the center. Angle widened so the
  // lit circle reads as roughly a quarter-to-third of the disc radius.
  const sunLight = new THREE.SpotLight(0xffe6bc, 24);
  sunLight.angle = 0.66;
  sunLight.penumbra = 0.6;
  sunLight.decay = 1.2;
  sunLight.target.position.set(0, 0, 0);
  // The sun is the key light and the only shadow caster: its spotlight is the day patch
  sunLight.castShadow = true;
  // shadow map size comes from the look (main.js)
  sunLight.shadow.camera.near = 0.5;
  sunLight.shadow.camera.far = 8;
  sunLight.shadow.bias = -0.0004;
  sunLight.shadow.normalBias = 0.02;
  scene.add(sunLight);
  scene.add(sunLight.target);

  // Truncated cone: 0.1 at the sun flaring to ~2.6 (day-patch radius) at the disc
  const sunBeamGeo = new THREE.CylinderGeometry(0.1, 2.6, 2.4, 16, 1, true);
  // Soft light cone: fades toward the ground and at its silhouette edges
  const sunBeamMat = new THREE.ShaderMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      varying vec2 vUv;
      varying float vEdge;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vec3 n = normalize(mat3(modelMatrix) * normal);
        vEdge = abs(dot(n, normalize(cameraPosition - wp.xyz)));
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      varying vec2 vUv;
      varying float vEdge;
      void main() {
        float a = 0.16 * pow(vEdge, 1.6) * (0.35 + 0.65 * vUv.y);
        gl_FragColor = vec4(vec3(1.0, 0.86, 0.5) * a, a);
      }`,
  });
  const sunBeamMesh = new THREE.Mesh(sunBeamGeo, sunBeamMat);
  const sunBeamGroup = new THREE.Group();
  sunBeamGroup.add(sunBeamMesh);
  sunBeamMesh.position.y = -1.2; // top edge at the sun, base on the disc
  scene.add(sunBeamGroup);

  // ── Moon ────────────────────────────────────────────────────────────────────
  // Billboard sprite with 8 pre-drawn pixel-art phase frames — chunky pixel
  // moon phases; frame chosen from sun-moon angular separation each frame.
  const moonFrames = makeMoonPhaseTextures();
  const moonMat = new THREE.SpriteMaterial({
    map: moonFrames[4], // start at full
    transparent: true,
    depthWrite: false,
  });
  const moonSprite = new THREE.Sprite(moonMat);
  moonSprite.scale.set(CONSTANTS.MOON_RADIUS * 2.2, CONSTANTS.MOON_RADIUS * 2.2, 1);

  const moonHalo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0x8fa8e8, transparent: true, opacity: 0.35,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  moonHalo.scale.set(1.3, 1.3, 1);

  const moonGroup = new THREE.Group();
  moonGroup.add(moonHalo);
  moonGroup.add(moonSprite);
  scene.add(moonGroup);

  const moonLight = new THREE.SpotLight(0x8899cc, 7);
  moonLight.angle = 0.5;
  moonLight.penumbra = 0.8;
  moonLight.decay = 1.5;
  scene.add(moonLight);
  scene.add(moonLight.target);

  // ── Shadow Object ────────────────────────────────────────────────────────────
  const shadowObjGeo = new THREE.SphereGeometry(CONSTANTS.SHADOW_OBJECT_RADIUS, 8, 6);
  const shadowObjMat = new THREE.MeshBasicMaterial({
    color: 0x330011,
    transparent: true,
    opacity: 0.8,
  });
  const shadowRimGeo = new THREE.SphereGeometry(CONSTANTS.SHADOW_OBJECT_RADIUS * 1.3, 8, 6);
  const shadowRimMat = new THREE.MeshBasicMaterial({
    color: 0x880022,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const shadowObjGroup = new THREE.Group();
  shadowObjGroup.add(new THREE.Mesh(shadowObjGeo, shadowObjMat));
  shadowObjGroup.add(new THREE.Mesh(shadowRimGeo, shadowRimMat));
  shadowObjGroup.visible = false;
  scene.add(shadowObjGroup);

  // ── Aurora ──────────────────────────────────────────────────────────────────
  // One curtain ring just inside the rim: folds of green fading to violet,
  // drifting slowly; dimmer on the side the sun is on.
  const auroraMat = new THREE.ShaderMaterial({
    uniforms: { uTime: surfaceUniforms.uTime, uSunAng: { value: 0 } },
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform float uTime, uSunAng;
      varying vec2 vUv;
      void main() {
        float ang = vUv.x * 6.2832;
        float fold = 0.5 + 0.5 * sin(ang * 23.0 + sin(ang * 5.0 + uTime * 0.35) * 3.0 + uTime * 0.25);
        float bands = 0.55 + 0.45 * sin(ang * 61.0 - uTime * 0.9 + fold * 4.0);
        float curtain = smoothstep(0.25, 0.9, fold) * bands;
        float h = vUv.y;
        float body = smoothstep(0.0, 0.18, h) * (1.0 - smoothstep(0.45, 1.0, h));
        vec3 col = mix(vec3(0.25, 1.0, 0.55), vec3(0.65, 0.35, 1.0), smoothstep(0.35, 0.95, h));
        float awaySun = 0.35 + 0.65 * smoothstep(-0.2, 0.8, -cos(ang - uSunAng));
        float a = curtain * body * awaySun * 0.6;
        gl_FragColor = vec4(col * a, a);
      }`,
  });
  const auroraMesh = new THREE.Mesh(new THREE.CylinderGeometry(9.7, 9.95, 1.1, 128, 1, true), auroraMat);
  auroraMesh.position.y = 0.95;
  const auroraGroup = new THREE.Group();
  auroraGroup.add(auroraMesh);
  scene.add(auroraGroup);

  // ── Planets (Tychonic epicycles) ─────────────────────────────────────────────
  const planetGroups = CONSTANTS.PLANETS.map(p => {
    const geo = new THREE.SphereGeometry(p.size, 6, 4);
    const mat = new THREE.MeshBasicMaterial({ color: p.color });
    const mesh = new THREE.Mesh(geo, mat);
    const group = new THREE.Group();
    group.add(mesh);
    scene.add(group);
    return { group, mesh, config: p };
  });

  // Store star layer base opacities for day/night dimming (read once at build)
  const starLayers = starGroup.children; // Points objects
  const starBaseOpacities = starLayers.map(p => p.material.opacity);

  return {
    backdrop,
    sunGroup,
    sunLight,
    sunBeamGroup,
    moonGroup,
    moonLight,
    moonSprite,
    moonMat,
    moonFrames,
    shadowObjGroup,
    starGroup,
    starLayers,
    starBaseOpacities,
    planetGroups,
    auroraGroup,
    auroraMat,
    constellationLines,
    constellationStars,
    constellationLinesBaseOpacity,
    constellationStarsBaseOpacity,
    meteors,
  };
}

export function updateSky(sky, clock, toggles) {
  const { sunGroup, sunLight, sunBeamGroup, moonGroup, moonLight,
          starGroup, starLayers, starBaseOpacities,
          shadowObjGroup, planetGroups, moonMat, moonFrames,
          auroraGroup, auroraMat } = sky;

  // Sun position
  const sx = clock.sunX, sz = clock.sunZ, sy = CONSTANTS.SUN_ALTITUDE;
  sky.backdrop.material.uniforms.uSunDir.value.set(sx, sz).normalize();
  sunGroup.position.set(sx, sy, sz);
  sunLight.position.set(sx, sy, sz);
  sunLight.target.position.set(sx, 0, sz);
  sunLight.target.updateMatrixWorld();

  // Sun beam
  sunBeamGroup.position.set(sx, sy, sz);
  sunBeamGroup.visible = toggles.sunBeam;

  // Moon position
  const mx = clock.moonX, mz = clock.moonZ, my = CONSTANTS.MOON_ALTITUDE;
  moonGroup.position.set(mx, my, mz);
  moonLight.position.set(mx, my, mz);
  moonLight.target.position.set(mx, 0, mz);
  moonLight.target.updateMatrixWorld();

  // Moon phase: pick pixel-art frame from sun-moon angular separation
  const TWO_PI = Math.PI * 2;
  const phaseNorm = ((clock.moonPhase % TWO_PI) + TWO_PI) % TWO_PI;
  const frameIdx = Math.round(phaseNorm / (TWO_PI / 8)) % 8;
  if (moonMat.map !== moonFrames[frameIdx]) {
    moonMat.map = moonFrames[frameIdx];
    moonMat.needsUpdate = true;
  }

  // ── Blood-moon eclipse tint ────────────────────────────────────────────────
  // eclipseAlignmentFactor returns 0..1; tint is always computed (visible regardless
  // of shadowObject toggle — the moon reddens "mysteriously" unless you show the Shadow
  // Object to see why). moonLight dims to ~15% at full eclipse.
  {
    const ef = eclipseAlignmentFactor(clock);
    // Lerp moon material color: white (0xffffff) → blood red (0xcc4433)
    const r = 1.0;
    const g = 1.0 - ef * (1.0 - 0x44 / 0xff); // 1 → 0x44/0xff
    const b = 1.0 - ef * (1.0 - 0x33 / 0xff); // 1 → 0x33/0xff
    moonMat.color.setRGB(r, g, b);
    // Moonlight dims to 15% at peak eclipse
    moonLight.intensity = 7 * (1 - ef * 0.85);
  }

  // Stars rotate sidereal
  starGroup.rotation.y = -clock.starAngle;

  // Constellations co-rotate with starGroup for free; just gate visibility
  if (sky.constellationLines) sky.constellationLines.visible = (toggles.constellations !== false);
  if (sky.constellationStars) sky.constellationStars.visible = (toggles.constellations !== false);

  // Shadow object — always position it (eclipseAlignmentFactor uses it); only render when toggled
  {
    const sp = clock.shadowObjectPosition();
    shadowObjGroup.position.set(sp.x, sp.y, sp.z);
  }
  shadowObjGroup.visible = toggles.shadowObject;

  // ── Aurora ─────────────────────────────────────────────────────────────────
  auroraGroup.visible = (toggles.aurora !== false);
  // Cylinder uv.x runs from +z toward +x; match it to the sun's azimuth
  auroraMat.uniforms.uSunAng.value = Math.atan2(sx, sz);

  // Planets (Tychonic epicycles)
  planetGroups.forEach(({ group, config }) => {
    const t = clock.simTime;
    const epicycleAngle = (t / 24 / config.period) * Math.PI * 2;
    group.position.set(
      sx + config.orbitRadius * Math.cos(epicycleAngle),
      CONSTANTS.SUN_ALTITUDE * 0.9,
      sz + config.orbitRadius * Math.sin(epicycleAngle)
    );
  });
}

// ── Shooting stars / meteors ───────────────────────────────────────────────────
// dtReal-driven (a meteor is a viewer moment, like cloud drift). dayFactor is
// camera-relative: meteors only spawn when the camera is looking away from the
// sun, consistent with the existing star-dimming convention.
export function updateMeteors(sky, sim, dtReal, dayFactor) {
  const { meteors } = sky;
  const canSpawn = dayFactor < CONSTANTS.METEOR_NIGHT_THRESHOLD;
  const shower = activeShower(sim.day);
  const mult = shower ? shower.mult : 1;

  for (const m of meteors) {
    const ud = m.userData;

    if (!ud.active) {
      if (canSpawn) {
        const rate = CONSTANTS.METEOR_BASE_RATE * mult * dtReal;
        if (Math.random() < rate) {
          const az = Math.random() * 360;
          const polar = 15 + Math.random() * 40; // high dome, 15-55 deg from apex
          ud.from.copy(mapDomeCoord(az, polar));
          const headingRad = Math.random() * Math.PI * 2;
          ud.dir.set(Math.cos(headingRad), -0.6 - Math.random() * 0.4, Math.sin(headingRad)).normalize();
          ud.len = 1.2;
          ud.t = 0;
          ud.active = true;
          m.visible = true;
        }
      }
      if (!ud.active) continue;
    }

    ud.t += dtReal / CONSTANTS.METEOR_DURATION;
    if (ud.t >= 1) {
      ud.active = false;
      m.visible = false;
      m.material.opacity = 0;
      continue;
    }

    const head = ud.from.clone().addScaledVector(ud.dir, ud.t * ud.len);
    const tail = head.clone().addScaledVector(ud.dir, -0.25 * ud.len);
    const posAttr = m.geometry.attributes.position;
    posAttr.setXYZ(0, tail.x, tail.y, tail.z);
    posAttr.setXYZ(1, head.x, head.y, head.z);
    posAttr.needsUpdate = true;
    m.material.opacity = Math.sin(Math.PI * ud.t);
  }
}
