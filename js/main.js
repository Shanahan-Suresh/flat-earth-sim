import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPixelatedPass } from 'three/addons/postprocessing/RenderPixelatedPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { SimClock, CONSTANTS } from './sim.js';
import { buildWorld, buildRain, updateRain, updateFrost } from './world.js';
import { buildSky, updateSky, updateMeteors } from './sky.js';
import { initUI, updateUI, isGroundMode } from './ui.js';
import { buildOverlays, maybeUpdateObserverBox, buildCityLights, maybeUpdateCityLights, buildTraffic, updateTraffic } from './overlays.js';
import { initAudio, setAudioEnabled, setEdgeMode as audioSetEdgeMode, setDayFactor, setRainIntensity, setEdgeProximity } from './audio.js';

// Error log hook (dev)
window.addEventListener('error', e => {
  let d = document.getElementById('errlog');
  if (!d) {
    d = document.createElement('div');
    d.id = 'errlog';
    d.style.cssText = 'position:fixed;bottom:0;left:0;background:red;color:#fff;font-size:10px;max-width:80vw;z-index:9999;padding:4px;word-break:break-all;';
    document.body.appendChild(d);
  }
  d.textContent += (e.message || '') + ' @ ' + (e.filename || '') + ':' + (e.lineno || '') + ' | ';
});

// ── Renderer ──────────────────────────────────────────────────────────────────
const canvas = document.getElementById('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); // pixel art — no device scaling
renderer.setClearColor(0x000000, 0); // transparent — CSS gradient shows through
renderer.setSize(window.innerWidth, window.innerHeight);

// ── Scene ─────────────────────────────────────────────────────────────────────
const scene = new THREE.Scene();
// No scene background — the CSS gradient behind canvas shows through

// ── Camera ────────────────────────────────────────────────────────────────────
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(14, 9, 14);
camera.lookAt(0, 0, 0);

// ── Composer ──────────────────────────────────────────────────────────────────
const composer = new EffectComposer(renderer);
const pixelPass = new RenderPixelatedPass(4, scene, camera);
pixelPass.normalEdgeStrength = 0.3;
pixelPass.depthEdgeStrength = 0.4;
composer.addPass(pixelPass);
composer.addPass(new OutputPass());

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
// Warm ambient + hemisphere so the night side stays readable
const ambient = new THREE.AmbientLight(0xffd9aa, 0.6);
scene.add(ambient);
const hemi = new THREE.HemisphereLight(0x9a92d8, 0x8a6a4a, 0.35); // pale indigo sky / warm brown ground
scene.add(hemi);

// ── Sky Tint overlay ─────────────────────────────────────────────────────────
const skyTint = document.getElementById('sky-tint');
let _lastSkyTintOpacity = -1; // track last set value to avoid churn

// ── World & Sky ───────────────────────────────────────────────────────────────
const world = buildWorld(scene);
const sky = buildSky(scene);
const overlays = buildOverlays(scene);
const cityLights = buildCityLights(scene);
const traffic    = buildTraffic(scene, overlays.routeCurves);
const rain       = buildRain(scene);

// ── Fog (only for infinite edge mode) ─────────────────────────────────────────
const fogColor = 0x1a2a3a;
const fog = new THREE.Fog(fogColor, 18, 45);
// We'll toggle scene.fog on/off based on edge mode

// Patch world.setEdgeMode to also toggle fog and update audio
const originalSetEdgeMode = world.setEdgeMode.bind(world);
world.setEdgeMode = (mode) => {
  originalSetEdgeMode(mode);
  scene.fog = mode === 'infinite' ? fog : null;
  audioSetEdgeMode(mode);
};

// ── Photo save flag ───────────────────────────────────────────────────────────
let photoSaveRequested = false;
export function requestPhotoSave() { photoSaveRequested = true; }

// ── Ground view mode ──────────────────────────────────────────────────────────
const INITIAL_CAM_POS = new THREE.Vector3(14, 9, 14);
const GROUND_CAM_POS  = new THREE.Vector3(7, 0.5, 0);
const GROUND_TARGET   = new THREE.Vector3(0.0, 0.30, 0.0);

let _savedCamPos    = null;
let _savedCamTarget = null;

export function setViewMode(mode, overrideCamPos) {
  if (mode === 'ground') {
    // Save current diorama state
    _savedCamPos    = camera.position.clone();
    _savedCamTarget = controls.target.clone();

    // Position camera on disc surface
    const pos = overrideCamPos || GROUND_CAM_POS;
    camera.position.copy(pos);
    controls.target.copy(GROUND_TARGET);
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

// ── applyState / captureState ─────────────────────────────────────────────────
// applyState(params): drive UI inputs from a plain object; all keys optional.
// params shape: {edge, dome, clouds, beam, shadow, day, time, speed, px, cam,
//               view, model, aurora, routes, observers, audio,
//               traffic, lights, rain, constellations}
function applyState(params) {
  const setInput = (id, val, evt) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.type === 'checkbox') el.checked = val;
    else el.value = val;
    el.dispatchEvent(new Event(evt || 'change'));
  };

  if (params.edge !== undefined) {
    const el = document.getElementById('edge-' + params.edge);
    if (el) { el.checked = true; el.dispatchEvent(new Event('change')); }
  }

  const boolMap = [
    ['dome',      'chk-dome'],
    ['clouds',    'chk-clouds'],
    ['beam',      'chk-sunbeam'],
    ['shadow',    'chk-shadow'],
    ['aurora',    'chk-aurora'],
    ['routes',    'chk-routes'],
    ['observers', 'chk-observers'],
    ['audio',     'chk-audio'],
    ['traffic',        'chk-traffic'],
    ['lights',         'chk-lights'],
    ['rain',           'chk-rain'],
    ['constellations', 'chk-constellations'],
  ];
  for (const [key, id] of boolMap) {
    if (params[key] !== undefined) setInput(id, !!params[key]);
  }

  if (params.view !== undefined) {
    const vEl = document.getElementById(
      params.view === 'ground' ? 'view-ground' : 'view-diorama'
    );
    if (vEl) { vEl.checked = true; vEl.dispatchEvent(new Event('change')); }
  }
  if (params.model !== undefined) {
    const mEl = document.getElementById(
      params.model === 'bipolar' ? 'model-bipolar' : 'model-monopole'
    );
    if (mEl) { mEl.checked = true; mEl.dispatchEvent(new Event('change')); }
  }

  if (params.day !== undefined || params.time !== undefined) {
    const d = params.day  !== undefined ? Math.max(0, Math.min(364, parseInt(params.day)  || 0)) : sim.day;
    const t = params.time !== undefined ? Math.max(0, Math.min(24,  parseFloat(params.time) || 0)) : sim.timeOfDay;
    sim.simTime = d * 24 + t;
  }

  if (params.speed !== undefined) setInput('slider-speed', params.speed, 'input');
  if (params.px    !== undefined) setInput('slider-pixel',  params.px,    'input');

  if (params.cam !== undefined) {
    const [x, y, z] = Array.isArray(params.cam)
      ? params.cam
      : String(params.cam).split(',').map(Number);
    if ([x, y, z].every(Number.isFinite)) {
      camera.position.set(x, y, z);
      controls.update();
    }
  }
}

// captureState(): snapshot current full state as a plain object.
function captureState() {
  const edgeNames = ['icewall', 'waterfall', 'infinite', 'beyond'];
  let edge = 'icewall';
  for (const e of edgeNames) {
    const el = document.getElementById('edge-' + e);
    if (el && el.checked) { edge = e; break; }
  }

  const readChk = id => {
    const el = document.getElementById(id);
    return el ? el.checked : undefined;
  };
  const readRadio = ids => {
    for (const [id, val] of ids) {
      const el = document.getElementById(id);
      if (el && el.checked) return val;
    }
    return undefined;
  };

  const state = {
    edge,
    dome:    readChk('chk-dome'),
    clouds:  readChk('chk-clouds'),
    beam:    readChk('chk-sunbeam'),
    shadow:  readChk('chk-shadow'),
    day:     sim.day,
    time:    Math.round(sim.timeOfDay * 100) / 100,
    speed:   (() => { const el = document.getElementById('slider-speed'); return el ? parseFloat(el.value) : undefined; })(),
    px:      (() => { const el = document.getElementById('slider-pixel'); return el ? parseInt(el.value) : undefined; })(),
    cam:     [
      Math.round(camera.position.x * 100) / 100,
      Math.round(camera.position.y * 100) / 100,
      Math.round(camera.position.z * 100) / 100,
    ],
  };

  // Radio groups and toggle checkboxes — only included if elements exist
  const view = readRadio([['view-diorama','diorama'],['view-ground','ground']]);
  if (view !== undefined) state.view = view;

  const model = readRadio([['model-monopole','monopole'],['model-bipolar','bipolar']]);
  if (model !== undefined) state.model = model;

  for (const [key, id] of [
    ['aurora','chk-aurora'],['routes','chk-routes'],['observers','chk-observers'],['audio','chk-audio'],
    ['traffic','chk-traffic'],['lights','chk-lights'],['rain','chk-rain'],['constellations','chk-constellations'],
  ]) {
    const v = readChk(id);
    if (v !== undefined) state[key] = v;
  }

  return state;
}

// Serialize a state object to URLSearchParams query string
function serializeState(state) {
  const p = new URLSearchParams();
  if (state.edge    !== undefined) p.set('edge',   state.edge);
  if (state.dome    !== undefined) p.set('dome',   state.dome   ? '1' : '0');
  if (state.clouds  !== undefined) p.set('clouds', state.clouds ? '1' : '0');
  if (state.beam    !== undefined) p.set('beam',   state.beam   ? '1' : '0');
  if (state.shadow  !== undefined) p.set('shadow', state.shadow ? '1' : '0');
  if (state.day     !== undefined) p.set('day',    state.day);
  if (state.time    !== undefined) p.set('time',   state.time);
  if (state.speed   !== undefined) p.set('speed',  state.speed);
  if (state.px      !== undefined) p.set('px',     state.px);
  if (state.cam     !== undefined) p.set('cam',    Array.isArray(state.cam) ? state.cam.join(',') : state.cam);
  if (state.view      !== undefined) p.set('view',      state.view);
  if (state.model     !== undefined) p.set('model',     state.model);
  if (state.routes    !== undefined) p.set('routes',    state.routes    ? '1' : '0');
  if (state.observers !== undefined) p.set('observers', state.observers ? '1' : '0');
  if (state.aurora    !== undefined) p.set('aurora',    state.aurora    ? '1' : '0');
  if (state.audio     !== undefined) p.set('audio',     state.audio     ? '1' : '0');
  if (state.traffic        !== undefined) p.set('traffic',        state.traffic        ? '1' : '0');
  if (state.lights         !== undefined) p.set('lights',         state.lights         ? '1' : '0');
  if (state.rain           !== undefined) p.set('rain',           state.rain           ? '1' : '0');
  if (state.constellations !== undefined) p.set('constellations', state.constellations ? '1' : '0');
  return p.toString();
}

// ── UI ────────────────────────────────────────────────────────────────────────
const toggles = initUI(sim, world, sky, composer, pixelPass, camera, controls, applyState, serializeState, setViewMode, requestPhotoSave);

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

// Delegated save listener on the right panel
const rightPanel = document.getElementById('right-panel');
if (rightPanel) {
  rightPanel.addEventListener('change', scheduleSave);
  rightPanel.addEventListener('input',  scheduleSave);
}
// Camera drag end
controls.addEventListener('end', scheduleSave);

// ── Initial state: defaults → localStorage → URL params ───────────────────────
{
  const stored = loadStoredState();
  if (stored) applyState(stored);

  // URL params always win
  const qp = new URLSearchParams(location.search);
  const urlState = {};
  if (qp.get('edge')   !== null) urlState.edge   = qp.get('edge');
  if (qp.get('dome')   !== null) urlState.dome   = qp.get('dome')   !== '0';
  if (qp.get('clouds') !== null) urlState.clouds = qp.get('clouds') !== '0';
  if (qp.get('beam')   !== null) urlState.beam   = qp.get('beam')   !== '0';
  if (qp.get('shadow') !== null) urlState.shadow = qp.get('shadow') !== '0';
  if (qp.get('day')    !== null) urlState.day    = qp.get('day');
  if (qp.get('time')   !== null) urlState.time   = qp.get('time');
  if (qp.get('speed')  !== null) urlState.speed  = qp.get('speed');
  if (qp.get('px')     !== null) urlState.px     = qp.get('px');
  if (qp.get('cam')    !== null) urlState.cam    = qp.get('cam');
  if (qp.get('aurora')    !== null) urlState.aurora    = qp.get('aurora')    !== '0';
  if (qp.get('view')      !== null) urlState.view      = qp.get('view');
  if (qp.get('routes')    !== null) urlState.routes    = qp.get('routes')    !== '0';
  if (qp.get('observers') !== null) urlState.observers = qp.get('observers') !== '0';
  if (qp.get('model')     !== null) urlState.model     = qp.get('model');
  if (qp.get('audio')     !== null) urlState.audio     = qp.get('audio')     !== '0';
  if (qp.get('traffic')        !== null) urlState.traffic        = qp.get('traffic')        !== '0';
  if (qp.get('lights')         !== null) urlState.lights         = qp.get('lights')         !== '0';
  if (qp.get('rain')           !== null) urlState.rain           = qp.get('rain')           !== '0';
  if (qp.get('constellations') !== null) urlState.constellations = qp.get('constellations') !== '0';
  if (Object.keys(urlState).length) {
    // If switching to ground view with an explicit cam param, override ground default pos
    if (urlState.view === 'ground' && urlState.cam) {
      applyState({ ...urlState, _groundCamOverride: true });
    } else {
      applyState(urlState);
    }
  }
  // eclipse=1: action param — find+jump to next eclipse after other state is applied
  if (qp.get('eclipse') === '1' && typeof initUI._jumpToEclipse === 'function') {
    initUI._jumpToEclipse();
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
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});

// ── Animation Loop ────────────────────────────────────────────────────────────
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const dtReal = clock.getDelta(); // real seconds

  // Tick simulation
  sim.tick(dtReal);

  // Day factor: d ∈ [-1,1] where 1 = camera facing directly toward the sun,
  // mapped to [0,1] with smoothstep. Hoisted above updateSky so meteors/audio
  // (Phase B/D) can consume it too.
  const camAz  = Math.atan2(camera.position.z, camera.position.x);
  const sunAz  = Math.atan2(sim.sunZ, sim.sunX);
  const dDay   = Math.cos(camAz - sunAz);
  const tDay   = (dDay + 1) * 0.5;
  const dayFactor = tDay * tDay * (3 - 2 * tDay);

  // Update celestial objects
  updateSky(sky, sim, toggles);
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

  // Animate waterfall texture offset (scroll down)
  if (world.waterfallGroup.visible && world.waterfallTex) {
    world.waterfallTex.offset.y += dtReal * 0.3; // scroll speed
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
  updateFrost(world, sim);

  // Update controls
  controls.update();

  // ── Day/night sky tint + star dimming ────────────────────────────────────────
  {
    // Sky tint opacity — only update when change > 0.01
    if (skyTint) {
      const op = parseFloat((dayFactor * 0.5).toFixed(2));
      if (Math.abs(op - _lastSkyTintOpacity) > 0.01) {
        skyTint.style.opacity = op;
        _lastSkyTintOpacity = op;
      }
    }

    // Star layer dimming
    if (sky.starLayers) {
      sky.starLayers.forEach((layer, i) => {
        layer.material.opacity = sky.starBaseOpacities[i] * (1 - dayFactor * 0.85);
      });
    }

    // Constellation dimming — same day/night curve as the star field
    if (sky.constellationLines) sky.constellationLines.material.opacity = sky.constellationLinesBaseOpacity * (1 - dayFactor * 0.85);
    if (sky.constellationStars) sky.constellationStars.material.opacity = sky.constellationStarsBaseOpacity * (1 - dayFactor * 0.85);

    // Audio day factor (cheap — setDayFactor throttles internally)
    setDayFactor(dayFactor);

    // Foghorn proximity: how close the camera is to the disc edge (radius 10)
    const camR = Math.sqrt(camera.position.x * camera.position.x + camera.position.z * camera.position.z);
    const edgeProx = Math.max(0, Math.min(1, (camR - 6.5) / 3.0));
    setEdgeProximity(edgeProx * edgeProx * (3 - 2 * edgeProx)); // smoothstep
  }

  // Update UI readouts
  updateUI(sim, world, toggles);

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

  // Update observer box (throttled ~4×/sec)
  if (overlays.observersGroup.visible) {
    maybeUpdateObserverBox(overlays.observers, sim);
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
