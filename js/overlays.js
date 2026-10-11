import * as THREE from 'three';
import { CONSTANTS, latLonToDisc } from './sim.js';
import { applyNearestFilter, makeGlowSprite, toonRamp } from './textures.js';

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const ROUTES = [
  { from: [-33.9, 151.2], to: [-33.4, -70.7] },
  { from: [-31.9, 115.9], to: [-26.2,  28.0] },
  { from: [-36.8, 174.8], to: [-34.6, -58.4] },
  { from: [ 40.7, -74.0], to: [ 51.5,  -0.1] },
];

// ---------------------------------------------------------------------------
// Observers
// ---------------------------------------------------------------------------

const OBSERVERS = [
  { name: 'KL',  lat: 3.1,  lon: 101.7 },
  { name: 'LON', lat: 51.5, lon: -0.1  },
  { name: 'NYC', lat: 40.7, lon: -74.0 },
];

const OBSERVER_COLORS = { KL: '#ffcc00', LON: '#cc4444', NYC: '#4488ff' };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePinCanvas(color) {
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 24;
  const ctx = canvas.getContext('2d');

  // Transparent background
  ctx.clearRect(0, 0, 16, 24);

  // Filled circle top (8px diameter = 4px radius, centred at x=8, y=4)
  ctx.beginPath();
  ctx.arc(8, 4, 4, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  // Thin stick down from circle to bottom
  ctx.beginPath();
  ctx.moveTo(8, 8);
  ctx.lineTo(8, 24);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();

  return canvas;
}

// ---------------------------------------------------------------------------
// buildOverlays
// ---------------------------------------------------------------------------

export function buildOverlays(scene) {
  const routesGroup = new THREE.Group();
  const observersGroup = new THREE.Group();
  const routeCurves = [];

  // --- Routes ---
  for (const route of ROUTES) {
    const fromPos = latLonToDisc(route.from[0], route.from[1]);
    const toPos   = latLonToDisc(route.to[0],   route.to[1]);

    const fromVec = new THREE.Vector3(fromPos.x, 0.17, fromPos.z);
    const toVec   = new THREE.Vector3(toPos.x,   0.17, toPos.z);

    // Straight ground track for the planes; the drawn route arcs up to their cruise height
    const path = new THREE.CatmullRomCurve3([fromVec, toVec]);
    routeCurves.push(path);
    const arc = [];
    for (let k = 0; k <= 24; k++) {
      const t = k / 24, p = path.getPoint(t);
      arc.push(new THREE.Vector3(p.x, 0.17 + (CONSTANTS.PLANE_ALTITUDE - 0.17 + 0.25) * Math.sin(Math.PI * t), p.z));
    }
    const tubeGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(arc), 48, 0.018, 4, false);
    const tubeMat = new THREE.MeshBasicMaterial({ color: 0xffaa55 });
    routesGroup.add(new THREE.Mesh(tubeGeo, tubeMat));

    // Endpoint dots
    const dotGeo = new THREE.SphereGeometry(0.065, 6, 4);
    const dotMat = new THREE.MeshBasicMaterial({ color: 0xffdd88 });

    const dotFrom = new THREE.Mesh(dotGeo, dotMat);
    dotFrom.position.set(fromPos.x, 0.17, fromPos.z);
    routesGroup.add(dotFrom);

    const dotTo = new THREE.Mesh(dotGeo, dotMat);
    dotTo.position.set(toPos.x, 0.17, toPos.z);
    routesGroup.add(dotTo);
  }

  scene.add(routesGroup);

  // --- Observers ---
  const OBSERVERS_WITH_POS = [];

  for (const obs of OBSERVERS) {
    const pos = latLonToDisc(obs.lat, obs.lon);
    const color = OBSERVER_COLORS[obs.name];

    const pinCanvas = makePinCanvas(color);
    const pinTexture = applyNearestFilter(new THREE.CanvasTexture(pinCanvas));
    const pinSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: pinTexture, depthTest: false }));
    pinSprite.renderOrder = 9; // overlay layer
    pinSprite.position.set(pos.x, 0.35, pos.z);
    pinSprite.scale.set(0.4, 0.6, 1);
    pinSprite.userData = { lat: obs.lat, lon: obs.lon, name: obs.name, x: pos.x, z: pos.z };
    observersGroup.add(pinSprite);

    OBSERVERS_WITH_POS.push({ name: obs.name, x: pos.x, z: pos.z });
  }

  scene.add(observersGroup);

  return { routesGroup, observersGroup, observers: OBSERVERS_WITH_POS, routeCurves };
}

// ---------------------------------------------------------------------------
// City lights
// ---------------------------------------------------------------------------

export function buildCityLights(scene) {
  const lightsGroup = new THREE.Group();
  const cities = CONSTANTS.CITY_LIGHTS;

  const positions = new Float32Array(cities.length * 3);
  const colors = new Float32Array(cities.length * 3);
  const planar = [];

  cities.forEach((city, i) => {
    const p = latLonToDisc(city.lat, city.lon);
    positions[i * 3 + 0] = p.x;
    positions[i * 3 + 1] = 0.165;
    positions[i * 3 + 2] = p.z;
    planar.push({ x: p.x, z: p.z });
  });

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const colorAttr = new THREE.Float32BufferAttribute(colors, 3);
  colorAttr.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('color', colorAttr);

  // makeGlowSprite already returns a THREE.Texture (applyNearestFilter'd) — use directly.
  const glow = makeGlowSprite();
  const map = glow.isTexture ? glow : applyNearestFilter(new THREE.CanvasTexture(glow));

  const mat = new THREE.PointsMaterial({
    size: 4,
    sizeAttenuation: false,
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    map,
  });
  const points = new THREE.Points(geo, mat);
  lightsGroup.add(points);
  scene.add(lightsGroup);

  return { lightsGroup, points, planar };
}

function _smoothstep(x) {
  x = Math.max(0, Math.min(1, x));
  return x * x * (3 - 2 * x);
}

export function updateCityLights(cityLights, sim) {
  const { points, planar } = cityLights;
  const colorAttr = points.geometry.attributes.color;

  for (let i = 0; i < planar.length; i++) {
    const dx = planar[i].x - sim.sunX;
    const dz = planar[i].z - sim.sunZ;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const b = _smoothstep((dist - CONSTANTS.DAY_PATCH_RADIUS) / CONSTANTS.CITY_LIGHT_RAMP);
    colorAttr.setXYZ(i, 1.0 * b, 0.72 * b, 0.35 * b);
  }
  colorAttr.needsUpdate = true;
}

// Throttled wrapper for use in main loop (250ms)
let _lastCityLightsUpdate = 0;
export function maybeUpdateCityLights(cityLights, sim) {
  const now = performance.now();
  if (now - _lastCityLightsUpdate < 250) return;
  _lastCityLightsUpdate = now;
  updateCityLights(cityLights, sim);
}

// ---------------------------------------------------------------------------
// Traffic — ships & planes
// ---------------------------------------------------------------------------

// ── Traffic: low-poly planes with vapour trails, boats with foam wakes ───────
const TRAIL_LEN = 26;

function vcolor(geo, hex) {
  const c = new THREE.Color(hex), n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo.toNonIndexed();
}
function mergeGeos(geos) {
  const total = geos.reduce((n, g) => n + g.attributes.position.count, 0);
  const out = { position: new Float32Array(total * 3), normal: new Float32Array(total * 3), color: new Float32Array(total * 3) };
  let o = 0;
  for (const g of geos) {
    for (const k of Object.keys(out)) out[k].set(g.attributes[k].array, o * 3);
    o += g.attributes.position.count;
  }
  const geo = new THREE.BufferGeometry();
  for (const k of Object.keys(out)) geo.setAttribute(k, new THREE.BufferAttribute(out[k], 3));
  return geo;
}

function planeGeometry() {
  return mergeGeos([
    vcolor(new THREE.BoxGeometry(0.17, 0.034, 0.034), '#f4f1ea'),                                  // fuselage
    vcolor(new THREE.ConeGeometry(0.017, 0.04, 6).rotateZ(-Math.PI / 2).translate(0.105, 0, 0), '#f4f1ea'), // nose
    vcolor(new THREE.BoxGeometry(0.055, 0.008, 0.22).translate(0.01, -0.004, 0), '#dfe3ea'),       // wings
    vcolor(new THREE.BoxGeometry(0.035, 0.045, 0.007).translate(-0.072, 0.03, 0), '#d2493e'),      // tail fin
    vcolor(new THREE.BoxGeometry(0.03, 0.006, 0.075).translate(-0.072, 0.006, 0), '#dfe3ea'),      // tailplane
  ]);
}

function boatGeometry(hullHex) {
  return mergeGeos([
    vcolor(new THREE.BoxGeometry(0.18, 0.035, 0.065).translate(0, 0.012, 0), hullHex),
    vcolor(new THREE.ConeGeometry(0.0325, 0.06, 4).rotateZ(-Math.PI / 2).rotateX(Math.PI / 4).scale(1, 0.55, 1).translate(0.12, 0.012, 0), hullHex),
    vcolor(new THREE.BoxGeometry(0.06, 0.035, 0.05).translate(-0.035, 0.045, 0), '#f6f3ea'),
    vcolor(new THREE.CylinderGeometry(0.011, 0.011, 0.04, 6).translate(-0.04, 0.078, 0), '#e0a83a'),
  ]);
}

function wakeGeometry() {
  // A V of foam opening behind the bow; vertex colour fades to black (additive = clear)
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([
    0.1, 0, 0,  -0.45, 0, 0.16,  -0.45, 0, 0.05,
    0.1, 0, 0,  -0.45, 0, -0.05, -0.45, 0, -0.16,
  ], 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute([
    0.9, 0.95, 1,  0, 0, 0,  0, 0, 0,
    0.9, 0.95, 1,  0, 0, 0,  0, 0, 0,
  ], 3));
  return geo;
}

export function buildTraffic(scene, routeCurves) {
  const trafficGroup = new THREE.Group();
  const planeMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp() });
  const pGeo = planeGeometry();
  const trailMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });

  // Every route is flown both ways
  const planes = [];
  routeCurves.forEach((curve, i) => {
    for (const offset of [0, 1]) {
      const mesh = new THREE.Mesh(pGeo, planeMat);
      mesh.castShadow = true;
      mesh.scale.setScalar(2.8);
      const trailGeo = new THREE.BufferGeometry();
      const pts = new Float32Array(TRAIL_LEN * 3), cols = new Float32Array(TRAIL_LEN * 3);
      for (let k = 0; k < TRAIL_LEN; k++) { const f = 0.55 * (1 - k / TRAIL_LEN) ** 1.5; cols.set([f, f, f * 1.05], k * 3); }
      trailGeo.setAttribute('position', new THREE.BufferAttribute(pts, 3).setUsage(THREE.DynamicDrawUsage));
      trailGeo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      const trail = new THREE.Line(trailGeo, trailMat);
      trail.frustumCulled = false;
      mesh.userData = { curve, phase: i * 0.37 + offset, trail, filled: false };
      trafficGroup.add(mesh, trail);
      planes.push(mesh);
    }
  });

  const wakeMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const boatMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp() });
  const hulls = ['#c8413a', '#2f5576', '#3f7f5c', '#d9813c', '#5a4a7a'];
  const ships = CONSTANTS.SHIP_LOOPS.map((loop, i) => {
    const { x: cx, z: cz } = latLonToDisc(loop.lat, loop.lon);
    const g = new THREE.Group();
    const boat = new THREE.Mesh(boatGeometry(hulls[i % hulls.length]), boatMat);
    boat.castShadow = true;
    const wake = new THREE.Mesh(wakeGeometry(), wakeMat);
    wake.position.y = 0.006;
    g.add(boat, wake);
    g.scale.setScalar(2.2);
    g.userData = { cx, cz, r: loop.r, days: loop.days, boat, phase: i * 1.7 };
    trafficGroup.add(g);
    return g;
  });

  scene.add(trafficGroup);
  return { trafficGroup, planes, ships };
}

// simTime-driven (freezes on pause, scales with speed — consistent with sun/moon).
const _prev = new THREE.Vector3();
export function updateTraffic(traffic, sim) {
  const { planes, ships } = traffic;

  planes.forEach(mesh => {
    const ud = mesh.userData;
    let t = ((sim.simTime / CONSTANTS.PLANE_TRIP_HOURS) + ud.phase) % 2;
    if (t < 0) t += 2;
    const rev = t > 1;
    if (rev) t = 2 - t;

    const pos = ud.curve.getPoint(t);
    _prev.copy(mesh.position);
    mesh.position.set(pos.x, CONSTANTS.PLANE_ALTITUDE + 0.25 * Math.sin(Math.PI * t), pos.z);

    let tangent = ud.curve.getTangent(t);
    if (rev) tangent = tangent.clone().negate();
    mesh.rotation.set(Math.sin(sim.simTime * 0.7 + ud.phase * 3) * 0.08, Math.atan2(-tangent.z, tangent.x), 0, 'YXZ');

    // Vapour trail: shift the history back one slot when the plane has moved on
    const arr = ud.trail.geometry.attributes.position.array;
    if (!ud.filled || _prev.distanceToSquared(mesh.position) > 0.4) {
      for (let k = 0; k < TRAIL_LEN; k++) arr.set([mesh.position.x, mesh.position.y, mesh.position.z], k * 3);
      ud.filled = true;
    } else if (Math.hypot(arr[0] - mesh.position.x, arr[1] - mesh.position.y, arr[2] - mesh.position.z) > 0.03) {
      arr.copyWithin(3, 0, (TRAIL_LEN - 1) * 3);
      arr.set([mesh.position.x, mesh.position.y, mesh.position.z], 0);
    }
    ud.trail.geometry.attributes.position.needsUpdate = true;
  });

  ships.forEach(g => {
    const { cx, cz, r, days, boat, phase } = g.userData;
    const a = 2 * Math.PI * sim.simTime / (24 * days) + phase;
    g.position.set(cx + r * Math.cos(a), -0.004, cz + r * Math.sin(a));
    g.rotation.y = -Math.atan2(Math.cos(a), -Math.sin(a));
    boat.rotation.x = Math.sin(sim.simTime * 1.3 + phase) * 0.06;
  });
}
