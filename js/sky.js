import * as THREE from 'three';
import { CONSTANTS } from './sim.js';
import { makeMoonPhaseTextures } from './textures.js';

export function buildSky(scene) {
  // ── Star Wheel ──────────────────────────────────────────────────────────────
  // Two layers: ~400 faint white + ~100 brighter pale-gold — a delicate dome
  // of fireflies, not confetti.
  const starGroup = new THREE.Group();

  function makeStarLayer(count, color, size, opacity) {
    const positions = [];
    for (let i = 0; i < count; i++) {
      const phi = Math.acos(Math.random()); // hemisphere
      const theta = Math.random() * Math.PI * 2;
      const r = CONSTANTS.STAR_RADIUS;
      positions.push(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.cos(phi) * CONSTANTS.STAR_Y_SCALE, // flatten to dome shape
        r * Math.sin(phi) * Math.sin(theta)
      );
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color, size, opacity,
      sizeAttenuation: false,
      transparent: true,
      depthWrite: false,
    });
    return new THREE.Points(geo, mat);
  }

  starGroup.add(makeStarLayer(400, 0xf0ead8, 1.5, 0.35)); // faint field
  starGroup.add(makeStarLayer(100, 0xffeec0, 2, 0.7));    // brighter pale-gold
  scene.add(starGroup);

  // Polaris: fixed at apex, not in starGroup (it sits on the rotation axis)
  const polarisGeo = new THREE.SphereGeometry(0.04, 4, 4);
  const polarisMat = new THREE.MeshBasicMaterial({ color: 0xffffee });
  const polarisStarMesh = new THREE.Mesh(polarisGeo, polarisMat);
  polarisStarMesh.position.set(0, CONSTANTS.STAR_RADIUS * CONSTANTS.STAR_Y_SCALE, 0);
  scene.add(polarisStarMesh);

  // ── Sun ─────────────────────────────────────────────────────────────────────
  const sunGeo = new THREE.SphereGeometry(CONSTANTS.SUN_RADIUS, 8, 6);
  const sunMat = new THREE.MeshBasicMaterial({ color: 0xffdd44 });
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

  const sunGroup = new THREE.Group();
  sunGroup.add(sunMesh);
  sunGroup.add(sunGlowMesh);
  scene.add(sunGroup);

  // Warm-tinted, tuned so map colors show warmly inside the day patch
  // rather than blowing out to white at the center. Angle widened so the
  // lit circle reads as roughly a quarter-to-third of the disc radius.
  const sunLight = new THREE.SpotLight(0xffe0a8, 280);
  sunLight.angle = 0.66;
  sunLight.penumbra = 0.6;
  sunLight.decay = 1.2;
  sunLight.target.position.set(0, 0, 0);
  scene.add(sunLight);
  scene.add(sunLight.target);

  // Truncated cone: 0.1 at the sun flaring to ~2.6 (day-patch radius) at the disc
  const sunBeamGeo = new THREE.CylinderGeometry(0.1, 2.6, 2.4, 16, 1, true);
  const sunBeamMat = new THREE.MeshBasicMaterial({
    color: 0xffdd44,
    transparent: true,
    opacity: 0.07,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
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

  const moonGroup = new THREE.Group();
  moonGroup.add(moonSprite);
  scene.add(moonGroup);

  const moonLight = new THREE.SpotLight(0x8899cc, 55);
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

  return {
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
    planetGroups,
  };
}

export function updateSky(sky, clock, toggles) {
  const { sunGroup, sunLight, sunBeamGroup, moonGroup, moonLight,
          starGroup, shadowObjGroup, planetGroups, moonMat, moonFrames } = sky;

  // Sun position
  const sx = clock.sunX, sz = clock.sunZ, sy = CONSTANTS.SUN_ALTITUDE;
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

  // Stars rotate sidereal
  starGroup.rotation.y = -clock.starAngle;

  // Shadow object
  shadowObjGroup.visible = toggles.shadowObject;
  if (toggles.shadowObject) {
    const sp = clock.shadowObjectPosition(sx, sz);
    shadowObjGroup.position.set(sp.x, sp.y, sp.z);
  }

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
