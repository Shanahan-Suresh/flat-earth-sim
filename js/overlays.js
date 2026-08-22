import * as THREE from 'three';
import { CONSTANTS, latLonToDisc } from './sim.js';
import { applyNearestFilter, makeGlowSprite, makePlaneTexture, makeShipTexture } from './textures.js';

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const ROUTES = [
  { from: [-33.9, 151.2], to: [-33.4, -70.7], label: 'SYD–SCL', flatDist: null, realDist: '7,060 mi ~12.5h' },
  { from: [-31.9, 115.9], to: [-26.2,  28.0], label: 'PER–JNB', flatDist: null, realDist: '5,180 mi ~11h'   },
  { from: [-36.8, 174.8], to: [-34.6, -58.4], label: 'AKL–EZE', flatDist: null, realDist: '6,410 mi ~12h'   },
  { from: [ 40.7, -74.0], to: [ 51.5,  -0.1], label: 'NYC–LON', flatDist: null, realDist: '3,460 mi ~7h'    },
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

// Route distance comparison lives in the #routes-box DOM panel (bottom-left,
// stacked above #observer-box). 3D sprite text cannot survive the
// RenderPixelatedPass downsampling, so the labels are HTML, not textures.
// One row per route: `SYD–SCL  flat 15,974 mi · real 7,060 mi ~12.5h`
// (flat number yellow, real cyan). Populated once at build time.
function populateRoutesBox() {
  const box = document.getElementById('routes-box');
  if (!box) return;
  box.innerHTML = ROUTES.map(route => {
    const idx = route.realDist.indexOf(' mi');
    const realMi = route.realDist.slice(0, idx + 3);          // "7,060 mi"
    const hours  = route.realDist.slice(idx + 3).trim();      // "~12.5h"
    return `<div class="route-row">${route.label}  ` +
           `flat <span class="rb-flat">${route.flatDist}</span> · ` +
           `real <span class="rb-real">${realMi}</span> ${hours}</div>`;
  }).join('');
}

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

    // Compute flat-earth distance in scene units → miles string
    const distUnits = fromVec.distanceTo(toVec);
    route.flatDist = `${Math.round(distUnits * 1245).toLocaleString()} mi`;

    // Tube along the route
    const path = new THREE.CatmullRomCurve3([fromVec, toVec]);
    routeCurves.push(path);
    const tubeGeo = new THREE.TubeGeometry(path, 20, 0.035, 4, false);
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

  // Route labels live in the DOM (#routes-box), not the 3D scene
  populateRoutesBox();

  // --- Observers ---
  const OBSERVERS_WITH_POS = [];

  for (const obs of OBSERVERS) {
    const pos = latLonToDisc(obs.lat, obs.lon);
    const color = OBSERVER_COLORS[obs.name];

    const pinCanvas = makePinCanvas(color);
    const pinTexture = applyNearestFilter(new THREE.CanvasTexture(pinCanvas));
    const pinSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: pinTexture, depthTest: false }));
    pinSprite.renderOrder = 9; // overlay layer, but below route labels
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

// Throttled wrapper for use in main loop (250ms — mirrors maybeUpdateObserverBox)
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

export function buildTraffic(scene, routeCurves) {
  const trafficGroup = new THREE.Group();

  const planeTex = applyNearestFilter(new THREE.CanvasTexture(makePlaneTexture()));
  const shipTex  = applyNearestFilter(new THREE.CanvasTexture(makeShipTexture()));

  const planes = routeCurves.map((curve, i) => {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.35, 0.35),
      new THREE.MeshBasicMaterial({ map: planeTex, transparent: true, depthWrite: false })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = CONSTANTS.PLANE_ALTITUDE;
    mesh.userData = { curve, phase: i * 0.37 };
    trafficGroup.add(mesh);
    return mesh;
  });

  const ships = CONSTANTS.SHIP_LOOPS.map(loop => {
    const { x: cx, z: cz } = latLonToDisc(loop.lat, loop.lon);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.3, 0.22),
      new THREE.MeshBasicMaterial({ map: shipTex, transparent: true, depthWrite: false })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.18;
    mesh.userData = { cx, cz, r: loop.r, days: loop.days };
    trafficGroup.add(mesh);
    return mesh;
  });

  scene.add(trafficGroup);
  return { trafficGroup, planes, ships };
}

// simTime-driven (freezes on pause, scales with speed — consistent with sun/moon).
export function updateTraffic(traffic, sim) {
  const { planes, ships } = traffic;

  planes.forEach(mesh => {
    const { curve, phase } = mesh.userData;
    let t = ((sim.simTime / CONSTANTS.PLANE_TRIP_HOURS) + phase) % 2;
    if (t < 0) t += 2;
    const rev = t > 1;
    if (rev) t = 2 - t;

    const pos = curve.getPoint(t);
    mesh.position.x = pos.x;
    mesh.position.z = pos.z;

    let tangent = curve.getTangent(t);
    if (rev) tangent = tangent.clone().negate();
    mesh.rotation.z = Math.atan2(tangent.z, tangent.x);
  });

  ships.forEach(mesh => {
    const { cx, cz, r, days } = mesh.userData;
    const a = 2 * Math.PI * sim.simTime / (24 * days);
    mesh.position.x = cx + r * Math.cos(a);
    mesh.position.z = cz + r * Math.sin(a);
    mesh.rotation.z = a + Math.PI / 2;
  });
}

// ---------------------------------------------------------------------------
// Observer box update
// ---------------------------------------------------------------------------

// obsData = { name, x, z }[] — same array from buildOverlays return
// sim = SimClock instance
export function updateObserverBox(obsData, sim) {
  const box = document.getElementById('observer-box');
  if (!box || box.style.display === 'none') return;

  const sunAz = Math.atan2(sim.sunZ, sim.sunX);

  const lines = obsData.map(obs => {
    const obsAz = Math.atan2(obs.z, obs.x);
    let rawHour = ((obsAz - sunAz) / (2 * Math.PI) * 24 + 12);
    rawHour = ((rawHour % 24) + 24) % 24;
    const h = Math.floor(rawHour);
    const m = Math.floor((rawHour % 1) * 60);
    const pad = n => n < 10 ? '0' + n : '' + n;

    // Day/night: planar distance from observer to sun ground point
    const dx = obs.x - sim.sunX;
    const dz = obs.z - sim.sunZ;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const icon = dist < CONSTANTS.DAY_PATCH_RADIUS ? '☀' : '☾';

    return `${obs.name}: ${pad(h)}:${pad(m)} ${icon}`;
  });

  box.textContent = lines.join('\n');
}

// Throttled wrapper for use in main loop (~4×/second)
let _lastObsUpdate = 0;
export function maybeUpdateObserverBox(obsData, sim) {
  const now = performance.now();
  if (now - _lastObsUpdate < 250) return;
  _lastObsUpdate = now;
  updateObserverBox(obsData, sim);
}
