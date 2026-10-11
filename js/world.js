import * as THREE from 'three';
import { CONSTANTS, latLonToDisc } from './sim.js';
import { buildRandom, makeRng } from './rng.js';
import { toonRamp } from './textures.js';
import { buildEdges } from './edges.js';
import { buildTerrain } from './terrain.js';
import { buildWater } from './water.js';
import { patchSurface } from './surface.js';
import { buildIceWall, buildForests, buildTowns, buildLighthouses, buildPenguins, buildUnderside } from './decor.js';
import { buildLife } from './life.js';

// Where the ground view stands: a coastal clearing, looking in toward the pole
export const GROUND_SPOT = { lat: 37.8, lon: -121.8, r: 0.6 };

export function buildWorld(scene) {
  // ── Disc: raised terrain, ocean, and the underside cap ───────────────────
  const terrain = buildTerrain(scene);
  patchSurface(terrain.material);
  const water = buildWater(scene, terrain);

  const underside = buildUnderside(scene, -0.32);

  // ── Dressing: towns first so forests keep clear of them ─────────────────
  const towns = buildTowns(scene, terrain);
  // Keep clearings at the towns and where the ground-view camera stands
  const forests = buildForests(scene, terrain, [...towns.centres, { ...latLonToDisc(GROUND_SPOT.lat, GROUND_SPOT.lon), r: GROUND_SPOT.r }]);
  const lighthouses = buildLighthouses(scene, terrain);
  const penguins = buildPenguins(scene, terrain);
  const life = buildLife(scene, forests.userData.spots);

  // ── Ice Wall ──────────────────────────────────────────────────────────────
  const iceWallGroup = buildIceWall(scene, terrain);

  // ── Dome / Firmament ──────────────────────────────────────────────────────
  const domeSphere = new THREE.SphereGeometry(CONSTANTS.DOME_RADIUS, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2);
  // Glass firmament: nearly clear face-on, glowing at the grazing edges, with
  // a faint sheen where the sun's light catches it
  const domeMat = new THREE.ShaderMaterial({
    uniforms: { uSun: { value: new THREE.Vector3() } },
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      varying vec3 vN, vW;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vW = wp.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `
      uniform vec3 uSun;
      varying vec3 vN, vW;
      void main() {
        vec3 v = normalize(cameraPosition - vW);
        float f = pow(1.0 - abs(dot(normalize(vN), v)), 4.0);
        float sheen = pow(max(dot(reflect(-v, normalize(vN)), normalize(uSun - vW)), 0.0), 24.0);
        vec3 c = vec3(0.45, 0.75, 1.0) * (0.02 + 0.2 * f) + vec3(1.0, 0.9, 0.7) * sheen * 0.5;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const domeMesh = new THREE.Mesh(domeSphere, domeMat);
  domeMesh.scale.y = CONSTANTS.DOME_Y_SCALE;
  scene.add(domeMesh);

  // Dome rim ring
  const rimGeo = new THREE.TorusGeometry(CONSTANTS.DOME_RADIUS, 0.06, 8, 64);
  const rimMat = new THREE.MeshLambertMaterial({ color: 0xaaddf0, transparent: true, opacity: 0.5 });
  const rimMesh = new THREE.Mesh(rimGeo, rimMat);
  rimMesh.rotation.x = Math.PI / 2;
  rimMesh.position.y = 0.02;
  scene.add(rimMesh);

  // ── Alternative edges (js/edges.js) ─────────────────────────────────────
  const { waterfallGroup, infiniteGroup, beyondGroup } = buildEdges(scene);

  // ── Clouds ────────────────────────────────────────────────────────────────
  // Puffy toon clouds: a row of rounded blobs, the biggest in the middle and a
  // flattened base. Shared geometry and material; each cloud orbits on its own.
  const cloudGroup = new THREE.Group();
  const puffGeo = new THREE.IcosahedronGeometry(1, 1);
  const puffMat = new THREE.MeshToonMaterial({
    color: 0xfbfdff,
    gradientMap: toonRamp(),
    emissive: 0x9aa8cc,
    emissiveIntensity: 0.35,   // soft-white on the night side, never muddy
  });
  const puffRng = makeRng(31337);

  for (let c = 0; c < 12; c++) {
    const angle = (c / 12) * Math.PI * 2 + buildRandom();
    const r = 2 + buildRandom() * 6;
    const cloudBase = new THREE.Group();
    cloudBase.position.set(r * Math.cos(angle), 1.2 + buildRandom() * 0.4, r * Math.sin(angle));
    cloudBase.rotation.y = puffRng() * Math.PI;
    cloudBase.userData.orbitRadius = r;
    cloudBase.userData.orbitAngle = angle;
    cloudBase.userData.orbitSpeed = 0.02 + buildRandom() * 0.03;

    const n = 4 + Math.floor(puffRng() * 4);
    const len = 0.28 + n * 0.09;
    for (let b = 0; b < n; b++) {
      const t = n === 1 ? 0.5 : b / (n - 1);
      const size = (0.13 + 0.12 * Math.sin(Math.PI * t)) * (0.85 + puffRng() * 0.35);
      const puff = new THREE.Mesh(puffGeo, puffMat);
      puff.castShadow = true;
      puff.scale.set(size, size * 0.78, size);
      puff.position.set((t - 0.5) * len, size * 0.25 + (puffRng() - 0.5) * 0.03, (puffRng() - 0.5) * 0.16);
      cloudBase.add(puff);
    }
    cloudGroup.add(cloudBase);
  }
  scene.add(cloudGroup);

  // ── Return handles ────────────────────────────────────────────────────────
  return {
    terrain,
    water,
    underside,
    towns,
    forests,
    lighthouses,
    penguins,
    life,
    iceWallGroup,
    domeMesh,
    rimMesh,
    cloudGroup,
    waterfallGroup,
    infiniteGroup,
    beyondGroup,

    setEdgeMode(mode) {
      // mode: 'icewall' | 'waterfall' | 'infinite' | 'beyond'
      iceWallGroup.visible = mode === 'icewall' || mode === 'beyond';
      waterfallGroup.visible = mode === 'waterfall';
      infiniteGroup.visible = mode === 'infinite';
      beyondGroup.visible = mode === 'beyond';
    },

    setModel(mode) {
      // mode: 'monopole' | 'bipolar'. Dressing is placed for the monopole map.
      terrain.setModel(mode);
      const mono = mode !== 'bipolar';
      towns.group.visible = forests.visible = life.fireflies.visible = mono;
      lighthouses.forEach(l => { l.g.visible = mono; });
    },
  };
}

// ── Drifting rain cells ────────────────────────────────────────────────────────
// Streak y is local to the cell (which floats at RAIN.ALT): from just under the
// cloud down to the ground.
const RAIN_TOP = -0.08;
const RAIN_BOTTOM = -CONSTANTS.RAIN.ALT + 0.05;

export function buildRain(scene) {
  const rainGroup = new THREE.Group();
  const cells = [];

  for (let c = 0; c < CONSTANTS.RAIN.CELLS; c++) {
    const cellGroup = new THREE.Group();
    const startAngle = buildRandom() * Math.PI * 2;
    const startR = 2 + buildRandom() * 5;
    const x0 = startR * Math.cos(startAngle);
    const z0 = startR * Math.sin(startAngle);
    cellGroup.position.set(x0, CONSTANTS.RAIN.ALT, z0);
    cellGroup.userData = { heading: buildRandom() * Math.PI * 2, x: x0, z: z0 };

    // Flattened dark cloud blobs (mirrors the cloudGroup construction above)
    const blobCount = 4 + Math.floor(buildRandom() * 2); // 4-5
    for (let b = 0; b < blobCount; b++) {
      const blobGeo = new THREE.SphereGeometry(0.28 + buildRandom() * 0.15, 6, 4);
      const blobMat = new THREE.MeshToonMaterial({
        color: 0x8a90a8,
        emissive: 0x5a6078,
        emissiveIntensity: 0.35,
      });
      const blob = new THREE.Mesh(blobGeo, blobMat);
      blob.scale.y = 0.35;
      blob.position.set(
        (buildRandom() - 0.5) * 0.6,
        (buildRandom() - 0.5) * 0.12,
        (buildRandom() - 0.5) * 0.6
      );
      cellGroup.add(blob);
    }

    // Vertical rain streaks in a radius-0.7 cylinder from the cloud base to the ground
    const streakCount = CONSTANTS.RAIN.STREAKS;
    const positions = new Float32Array(streakCount * 2 * 3);
    for (let i = 0; i < streakCount; i++) {
      const a = buildRandom() * Math.PI * 2;
      const r = buildRandom() * 0.7;
      const sx = r * Math.cos(a);
      const sz = r * Math.sin(a);
      const sy = RAIN_TOP - buildRandom() * (RAIN_TOP - RAIN_BOTTOM);

      positions[i * 6 + 0] = sx;
      positions[i * 6 + 1] = sy;
      positions[i * 6 + 2] = sz;
      positions[i * 6 + 3] = sx;
      positions[i * 6 + 4] = sy - CONSTANTS.RAIN.STREAK_LEN;
      positions[i * 6 + 5] = sz;
    }
    const streakGeo = new THREE.BufferGeometry();
    const streakPosAttr = new THREE.Float32BufferAttribute(positions, 3);
    streakPosAttr.setUsage(THREE.DynamicDrawUsage);
    streakGeo.setAttribute('position', streakPosAttr);
    const streakMat = new THREE.LineBasicMaterial({
      color: 0xa8c8e0, transparent: true, opacity: 0.5, depthWrite: false,
    });
    const streaks = new THREE.LineSegments(streakGeo, streakMat);
    cellGroup.add(streaks);
    cellGroup.userData.streaks = streaks;

    rainGroup.add(cellGroup);
    cells.push(cellGroup);
  }

  scene.add(rainGroup);
  return { rainGroup, cells };
}

// Returns array of {x, z} cell centers (Phase D reads these for audio proximity).
export function updateRain(rain, sim, dtReal) {
  const dt = sim.paused ? 0 : dtReal;
  const centers = [];

  for (const cell of rain.cells) {
    const ud = cell.userData;

    ud.heading += (Math.random() - 0.5) * CONSTANTS.RAIN.JITTER * dt;
    ud.x += Math.cos(ud.heading) * CONSTANTS.RAIN.DRIFT * dt;
    ud.z += Math.sin(ud.heading) * CONSTANTS.RAIN.DRIFT * dt;

    const rad = Math.sqrt(ud.x * ud.x + ud.z * ud.z);
    if (rad > CONSTANTS.RAIN.MAX_R) {
      ud.heading = Math.atan2(-ud.z, -ud.x); // nudge back toward center
    }

    cell.position.x = ud.x;
    cell.position.z = ud.z;

    const posAttr = ud.streaks.geometry.attributes.position;
    const arr = posAttr.array;
    const fall = CONSTANTS.RAIN.FALL * dt;
    for (let i = 0; i < CONSTANTS.RAIN.STREAKS; i++) {
      let topY = arr[i * 6 + 1] - fall;
      let botY = arr[i * 6 + 4] - fall;
      if (botY < RAIN_BOTTOM) {
        topY = RAIN_TOP;
        botY = RAIN_TOP - CONSTANTS.RAIN.STREAK_LEN;
      }
      arr[i * 6 + 1] = topY;
      arr[i * 6 + 4] = botY;
    }
    posAttr.needsUpdate = true;

    centers.push({ x: ud.x, z: ud.z });
  }

  return centers;
}
