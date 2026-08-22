import * as THREE from 'three';
import { CONSTANTS, eclipseAlignmentFactor, activeShower } from './sim.js';
import { makeMoonPhaseTextures, makeTwilightTexture, makeAuroraTexture, makeSparkleTexture } from './textures.js';

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
  const constellationStarMat = new THREE.PointsMaterial({
    color: 0xcfe0ff, size: 2.5, sizeAttenuation: false, transparent: true,
  });
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

  // ── Twilight Ring ────────────────────────────────────────────────────────────
  // Soft warm-orange halo at the sun's ground point, sitting just outside the
  // bright day patch. Plane footprint ≈ 6.5 units → orange band at r≈2.0–2.6.
  const twilightTex = makeTwilightTexture();
  const twilightMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(6.5, 6.5),
    new THREE.MeshBasicMaterial({
      map: twilightTex,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  twilightMesh.rotation.x = -Math.PI / 2;
  twilightMesh.position.y = 0.16;
  scene.add(twilightMesh);

  // ── Aurora Curtains ──────────────────────────────────────────────────────────
  // 8 planes evenly spaced around the disc rim (radius ≈ 9.85), facing inward,
  // each with its own material clone so we can scroll offset independently.
  const auroraBaseTex = makeAuroraTexture();
  const auroraGroup = new THREE.Group();
  const AURORA_COUNT = 8;
  const AURORA_RADIUS = 9.85;
  const auroraPlanes = [];

  for (let i = 0; i < AURORA_COUNT; i++) {
    const angle = (i / AURORA_COUNT) * Math.PI * 2;
    const mat = new THREE.MeshBasicMaterial({
      map: auroraBaseTex.clone(),
      transparent: true,
      opacity: 0.28,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    // Each clone needs its own offset instance
    mat.map.needsUpdate = true;

    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 0.9),
      mat
    );
    // Position at rim, face inward (tangential)
    mesh.position.set(
      Math.cos(angle) * AURORA_RADIUS,
      0.45 + 0.9 / 2, // base just above ice wall top
      Math.sin(angle) * AURORA_RADIUS
    );
    mesh.rotation.y = -angle + Math.PI / 2; // face tangentially toward center

    // Per-plane speed and base tilt for sway
    mesh.userData.speed = 0.02 + (i % 4) * 0.0075;
    mesh.userData.baseTilt = (i % 3 - 1) * 0.08; // slight random tilt
    auroraPlanes.push(mesh);
    auroraGroup.add(mesh);
  }
  scene.add(auroraGroup);

  // ── Sun Glitter Shimmer ──────────────────────────────────────────────────────
  // Sparkle dot field scrolled across the day patch for a glittery water sheen.
  const sparkleTex = makeSparkleTexture();
  sparkleTex.repeat.set(6, 6);
  const glitterMesh = new THREE.Mesh(
    new THREE.CircleGeometry(2.2, 32),
    new THREE.MeshBasicMaterial({
      map: sparkleTex,
      transparent: true,
      opacity: 0.12,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  glitterMesh.rotation.x = -Math.PI / 2;
  glitterMesh.position.y = 0.155;
  scene.add(glitterMesh);

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
    twilightMesh,
    auroraGroup,
    auroraPlanes,
    glitterMesh,
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
          twilightMesh, auroraGroup, auroraPlanes, glitterMesh } = sky;

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
    // Moonlight: full intensity 55, dims to ~8 (15%) at peak eclipse
    moonLight.intensity = 55 * (1 - ef * 0.85);
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

  // ── Twilight ring — follow sun ground point ──────────────────────────────────
  twilightMesh.position.x = sx;
  twilightMesh.position.z = sz;

  // ── Glitter shimmer — follow sun ground point, scroll offset ─────────────────
  glitterMesh.position.x = sx;
  glitterMesh.position.z = sz;
  glitterMesh.material.map.offset.x = (clock.simTime * 0.11) % 1;
  glitterMesh.material.map.offset.y = (clock.simTime * 0.07) % 1; // offset is a uniform; no re-upload needed

  // ── Aurora curtains — scroll texture + sway ───────────────────────────────
  auroraGroup.visible = (toggles.aurora !== false);
  if (auroraGroup.visible) {
    auroraPlanes.forEach((plane, i) => {
      plane.material.map.offset.x = (clock.simTime * plane.userData.speed) % 1;
      plane.rotation.z = plane.userData.baseTilt + Math.sin(clock.simTime * 0.8 + i) * 0.05;
    });
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
