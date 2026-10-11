import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { SimClock, CONSTANTS, latLonToDisc } from './sim.js';
import { buildWorld, buildRain, updateRain, GROUND_SPOT } from './world.js';
import { updateSurface } from './surface.js';
import { updateLighthouses, updatePenguins, updateUnderside } from './decor.js';
import { updateLife } from './life.js';
import { setupLook } from './look.js';
import { buildSky, updateSky, updateMeteors } from './sky.js';
import { initUI, updateUI } from './ui.js';
import { buildOverlays, buildCityLights, maybeUpdateCityLights, buildTraffic, updateTraffic } from './overlays.js';
import { initAudio, setAudioEnabled, setEdgeMode as audioSetEdgeMode, setDayFactor, setRainIntensity, setEdgeProximity } from './audio.js';
import { applyState as applySchemaState, captureState as captureSchemaState, serializeState, parseUrlState } from './state.js';

// Error log hook (dev): each distinct error once, with a repeat count
const _errCounts = new Map();
window.addEventListener('error', e => {
  let d = document.getElementById('errlog');
  if (!d) {
    d = document.createElement('div');
    d.id = 'errlog';
    d.style.cssText = 'position:fixed;bottom:0;left:0;background:red;color:#fff;font-size:10px;max-width:80vw;z-index:9999;padding:4px;word-break:break-all;white-space:pre-line;';
    document.body.appendChild(d);
  }
  const key = (e.message || '') + ' @ ' + (e.filename || '') + ':' + (e.lineno || '');
  _errCounts.set(key, (_errCounts.get(key) || 0) + 1);
  d.textContent = [..._errCounts].map(([k, n]) => (n > 1 ? `×${n} ` : '') + k).join('\n');
});

// ── Renderer ──────────────────────────────────────────────────────────────────
const canvas = document.getElementById('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); // pixel art — no device scaling
renderer.setClearColor(0x05040c, 1); // the backdrop sphere (sky.js) paints the sky
renderer.setSize(window.innerWidth, window.innerHeight);

// ── Scene ─────────────────────────────────────────────────────────────────────
const scene = new THREE.Scene();
// No scene background — the CSS gradient behind canvas shows through

// ── Camera ────────────────────────────────────────────────────────────────────
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(11.5, 7.4, 11.5);
camera.lookAt(0, 0, 0);

// ── Look: render settings + post chain (js/look.js) ──────────────────────────
const look = setupLook(renderer, scene, camera);
const composer = look.composer;

// ── Controls ──────────────────────────────────────────────────────────────────
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 4;
controls.maxDistance = 40;
controls.maxPolarAngle = Math.PI * 0.52;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.3;

// ── Lighting ──────────────────────────────────────────────────────────────────
// Cool moonlit fill so the night side stays readable; the warmth comes from the sun
const ambient = new THREE.AmbientLight(0xb4bfe6, 0.85);
scene.add(ambient);
const hemi = new THREE.HemisphereLight(0xb0c0ff, 0x6a5a48, 0.75); // pale indigo sky / earth bounce
scene.add(hemi);


// ── World & Sky ───────────────────────────────────────────────────────────────
const world = buildWorld(scene);
const sky = buildSky(scene);
sky.sunLight.shadow.mapSize.set(look.settings.shadowSize, look.settings.shadowSize);
const overlays = buildOverlays(scene);
const cityLights = buildCityLights(scene);
const traffic    = buildTraffic(scene, overlays.routeCurves);
const rain       = buildRain(scene);

// ── Edge mode: world geometry + fog + audio through one entry point ───────────
const fog = new THREE.Fog(0x14162c, 16, 42); // the open edges (infinite, beyond) fade into haze
function setEdgeMode(mode) {
  world.setEdgeMode(mode);
  scene.fog = mode === 'infinite' || mode === 'beyond' ? fog : null;
  audioSetEdgeMode(mode);
}

// ── Photo save flag ───────────────────────────────────────────────────────────
let photoSaveRequested = false;
export function requestPhotoSave() { photoSaveRequested = true; }

// ── Ground view mode ──────────────────────────────────────────────────────────
const INITIAL_CAM_POS = new THREE.Vector3(11.5, 7.4, 11.5);

// Eye height above the ground spot, and a look point a step inland and a little up
function groundCamera() {
  const { x, z } = latLonToDisc(GROUND_SPOT.lat, GROUND_SPOT.lon);
  const pos = new THREE.Vector3(x, Math.max(0, world.terrain.heightAt(x, z)) + 0.11, z);
  const inward = new THREE.Vector3(-x, 0, -z).normalize();
  return { pos, target: pos.clone().addScaledVector(inward, 1).add(new THREE.Vector3(0, 0.12, 0)) };
}

let _savedCamPos    = null;
let _savedCamTarget = null;

let _groundView = false;
export function setViewMode(mode, overrideCamPos) {
  _groundView = mode === 'ground';
  if (mode === 'ground') {
    // Save current diorama state
    _savedCamPos    = camera.position.clone();
    _savedCamTarget = controls.target.clone();

    // Position camera on disc surface
    const ground = groundCamera();
    camera.position.copy(overrideCamPos || ground.pos);
    controls.target.copy(ground.target);
    controls.minDistance   = 0.01;
    controls.maxDistance   = 1.5;
    controls.maxPolarAngle = 0.95 * Math.PI;
    controls.enablePan     = false;
    controls.autoRotate    = false;
    controls.enableZoom    = false;
    controls.update();
  } else {
    // Restore diorama
    const pos = (_savedCamPos && _savedCamPos.length() > 0.1) ? _savedCamPos : INITIAL_CAM_POS;
    camera.position.copy(pos);
    controls.target.set(0, 0, 0);
    controls.minDistance   = 4;
    controls.maxDistance   = 40;
    controls.maxPolarAngle = Math.PI * 0.52;
    controls.enablePan     = true;
    controls.enableZoom    = true;
    controls.update();
  }
}

// ── Simulation Clock ──────────────────────────────────────────────────────────
const sim = new SimClock();

// ── State plumbing (schema lives in js/state.js) ──────────────────────────────
const stateCtx = { sim, camera, controls };
const applyState   = params => applySchemaState(params, stateCtx);
const captureState = ()     => captureSchemaState(stateCtx);

// ── UI ────────────────────────────────────────────────────────────────────────
const { toggles, jumpToEclipse } = initUI({
  sim, world, sky, look, camera, controls,
  applyState, captureState, serializeState, setViewMode, setEdgeMode, requestPhotoSave,
});

// ── localStorage persistence ───────────────────────────────────────────────────
const LS_KEY = 'fes-state';

function loadStoredState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) { /* ignore */ }
  return null;
}

let _saveTimer = null;
function scheduleSave() {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(captureState())); } catch (_) { /* ignore */ }
  }, 1000);
}

window.addEventListener('beforeunload', () => {
  try { localStorage.setItem(LS_KEY, JSON.stringify(captureState())); } catch (_) { /* ignore */ }
});

// Delegated save listener on the HUD (every state input lives inside it)
const hud = document.getElementById('hud');
if (hud) {
  hud.addEventListener('change', scheduleSave);
  hud.addEventListener('input',  scheduleSave);
}
// Camera drag end
controls.addEventListener('end', scheduleSave);

// ── Initial state: defaults → localStorage → URL params ───────────────────────
// A plain load (no URL params) gets the fade-in and the intro swoop; deep links
// and screenshots open straight on their frame.
const plainLoad = !location.search;
{
  const stored = loadStoredState();
  if (stored) applyState(stored);

  // URL params win over the stored state (cam is applied last by the schema,
  // so an explicit cam overrides the ground-view default standing spot)
  const urlState = parseUrlState(location.search);
  if (Object.keys(urlState).length) applyState(urlState);

  // Action param, applied after the state:
  //   eclipse=1  — find + jump to the next Shadow-Object eclipse
  const qp = new URLSearchParams(location.search);
  if (qp.get('eclipse') === '1') jumpToEclipse();

  // URL params are one-shot: strip them so later changes (saved to
  // localStorage) are not overridden by a stale query on reload. Sharing
  // goes through the COPY LINK button, which serialises the live state.
  if (location.search) history.replaceState(null, '', location.pathname);
}

// ── Intro: the camera swoops in from low and close to the saved view ──────────
const INTRO_SECONDS = 4.2;
let intro = null;
if (plainLoad && !_groundView) {
  const to = new THREE.Spherical().setFromVector3(camera.position);
  const from = new THREE.Spherical(to.radius * 0.42, Math.min(Math.PI * 0.47, to.phi + 0.32), to.theta - 1.1);
  intro = { from, to, t: 0 };
  camera.position.setFromSpherical(from);
  controls.autoRotate = false;
  controls.addEventListener('start', () => { intro = null; }, { once: true });
}
const _sph = new THREE.Spherical();
function stepIntro(dt) {
  intro.t = Math.min(1, intro.t + dt / INTRO_SECONDS);
  const k = intro.t < 0.5 ? 4 * intro.t ** 3 : 1 - (-2 * intro.t + 2) ** 3 / 2;   // ease in-out cubic
  const { from, to } = intro;
  _sph.set(from.radius + (to.radius - from.radius) * k, from.phi + (to.phi - from.phi) * k, from.theta + (to.theta - from.theta) * k);
  camera.position.setFromSpherical(_sph);
  if (intro.t >= 1) { intro = null; controls.autoRotate = true; }
}

// Fade in from black once the first frames (and their shader compiles) are done
const fade = document.getElementById('fade');
if (fade) {
  if (plainLoad) {
    let frames = 0;
    const tick = () => (++frames < 3 ? requestAnimationFrame(tick) : fade.classList.add('gone'));
    requestAnimationFrame(tick);
    fade.addEventListener('transitionend', () => fade.remove(), { once: true });
  } else {
    fade.remove();
  }
}

// ── Deferred audio: if audio was restored from state but no gesture yet ────────
// applyState checks the #chk-audio checkbox but the 'change' handler in ui.js
// will call initAudio() which is safe (just creates a suspended context), and
// setAudioEnabled(true) which calls buildGraph() — all fine without gesture.
// The AudioContext will be suspended until a gesture occurs. We register a
// one-time listener that resumes the context on first real interaction.
{
  const audioEl = document.getElementById('chk-audio');
  if (audioEl && audioEl.checked) {
    // Audio was restored as enabled — register first-gesture resume
    const resumeOnGesture = () => {
      initAudio();
      setAudioEnabled(true);
      window.removeEventListener('pointerdown', resumeOnGesture);
      window.removeEventListener('keydown',     resumeOnGesture);
    };
    window.addEventListener('pointerdown', resumeOnGesture, { once: true });
    window.addEventListener('keydown',     resumeOnGesture, { once: true });
  }
}

// ── Resize ────────────────────────────────────────────────────────────────────
// Portrait screens keep the landscape horizontal view, so the whole disc fits on a phone
function fitCamera() {
  const aspect = window.innerWidth / window.innerHeight;
  camera.aspect = aspect;
  camera.fov = aspect >= 1 ? 50 : Math.min(80, 2 * Math.atan(Math.tan(25 * Math.PI / 180) / aspect) * 180 / Math.PI);
  camera.updateProjectionMatrix();
}
fitCamera();

window.addEventListener('resize', () => {
  fitCamera();
  renderer.setSize(window.innerWidth, window.innerHeight);
  look.setSize(window.innerWidth, window.innerHeight);
});

// ── Animation Loop ────────────────────────────────────────────────────────────
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const dtReal = clock.getDelta(); // real seconds

  // Tick simulation
  sim.tick(dtReal);

  // Day factor in [0,1], read by the sky, stars, meteors and audio. From the
  // diorama: how squarely the camera faces the sun's side. On the ground:
  // whether the spot you stand on is inside the sun's day patch.
  let dayFactor;
  if (_groundView) {
    const d = Math.hypot(camera.position.x - sim.sunX, camera.position.z - sim.sunZ);
    const R = CONSTANTS.DAY_PATCH_RADIUS;
    dayFactor = 1 - THREE.MathUtils.smoothstep(d, R - 0.6, R + 0.9);
  } else {
    const camAz = Math.atan2(camera.position.z, camera.position.x);
    const sunAz = Math.atan2(sim.sunZ, sim.sunX);
    const tDay  = (Math.cos(camAz - sunAz) + 1) * 0.5;
    dayFactor = tDay * tDay * (3 - 2 * tDay);
  }

  // Update celestial objects
  updateSky(sky, sim, toggles);
  // The beam cone reads as a flat band from inside it
  if (_groundView) sky.sunBeamGroup.visible = false;
  world.domeMesh.material.uniforms.uSun.value.copy(sky.sunGroup.position);
  updateMeteors(sky, sim, dtReal, dayFactor);

  // Update cloud orbits
  if (world.cloudGroup.visible) {
    world.cloudGroup.children.forEach(cloud => {
      cloud.userData.orbitAngle += cloud.userData.orbitSpeed * (sim.paused ? 0 : dtReal);
      const r = cloud.userData.orbitRadius;
      const a = cloud.userData.orbitAngle;
      cloud.position.x = r * Math.cos(a);
      cloud.position.z = r * Math.sin(a);
    });
  }

  // Update cloud visibility
  world.cloudGroup.visible = toggles.clouds;

  // Drifting rain cells + winter creep
  if (toggles.rain) {
    rain.rainGroup.visible = true;
    const centers = updateRain(rain, sim, dtReal);
    let dNearest = Infinity;
    for (const c of centers) {
      const dx = c.x - controls.target.x, dz = c.z - controls.target.z;
      dNearest = Math.min(dNearest, Math.sqrt(dx * dx + dz * dz));
    }
    setRainIntensity(Math.max(0, Math.min(1, 1 - dNearest / CONSTANTS.RAIN.AUDIO_RADIUS)));
  } else {
    rain.rainGroup.visible = false;
    setRainIntensity(0);
  }
  updateSurface(sim, clock.elapsedTime);
  updateLighthouses(world.lighthouses, sim, clock.elapsedTime);
  updatePenguins(world.penguins, clock.elapsedTime);
  updateUnderside(world.underside, clock.elapsedTime);
  updateLife(world.life, sim, clock.elapsedTime);

  // Update controls
  if (intro) stepIntro(Math.min(dtReal, 0.05));
  controls.update();
  look.setZoom(camera.position.distanceTo(controls.target));

  // ── Day/night backdrop + star dimming ────────────────────────────────────────
  {
    // Stars fade by day; under a blue ground-view sky they go out entirely
    const starDim = 1 - dayFactor * (_groundView ? 1 : 0.85);
    // Backdrop warms on the side facing the sun
    sky.backdrop.material.uniforms.uDay.value = dayFactor;
    sky.backdrop.material.uniforms.uGround.value = _groundView ? 1 : 0;

    // Star layer dimming
    if (sky.starLayers) {
      sky.starLayers.forEach((layer, i) => {
        layer.material.opacity = sky.starBaseOpacities[i] * starDim;
      });
    }

    // Constellation dimming — same day/night curve as the star field
    if (sky.constellationLines) sky.constellationLines.material.opacity = sky.constellationLinesBaseOpacity * starDim;
    if (sky.constellationStars) sky.constellationStars.material.opacity = sky.constellationStarsBaseOpacity * starDim;

    // Audio day factor (cheap — setDayFactor throttles internally)
    setDayFactor(dayFactor);

    // Foghorn proximity: how close the camera is to the disc edge (radius 10)
    const camR = Math.sqrt(camera.position.x * camera.position.x + camera.position.z * camera.position.z);
    const edgeProx = Math.max(0, Math.min(1, (camR - 6.5) / 3.0));
    setEdgeProximity(edgeProx * edgeProx * (3 - 2 * edgeProx)); // smoothstep
  }

  // Update UI (day/night dial, season track)
  updateUI(sim);

  // Overlay visibility (routes/observers driven by toggles)
  {
    const isBipolar = toggles.model === 'bipolar';
    overlays.routesGroup.visible    = toggles.routes    && !isBipolar;
    overlays.observersGroup.visible = toggles.observers && !isBipolar;

    cityLights.lightsGroup.visible = toggles.lights && !isBipolar;
    if (cityLights.lightsGroup.visible) maybeUpdateCityLights(cityLights, sim);

    traffic.trafficGroup.visible = toggles.traffic && !isBipolar;
    if (traffic.trafficGroup.visible) updateTraffic(traffic, sim);
  }

  // Render
  composer.render();

  // Photo save — must be immediately after render in the same frame
  if (photoSaveRequested) {
    photoSaveRequested = false;
    const url = renderer.domElement.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = 'flat-earth-' + Date.now() + '.png';
    a.click();
  }
}

animate();
