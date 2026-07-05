import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPixelatedPass } from 'three/addons/postprocessing/RenderPixelatedPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { SimClock } from './sim.js';
import { buildWorld } from './world.js';
import { buildSky, updateSky } from './sky.js';
import { initUI, updateUI } from './ui.js';

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
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true });
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

// ── World & Sky ───────────────────────────────────────────────────────────────
const world = buildWorld(scene);
const sky = buildSky(scene);

// ── Fog (only for infinite edge mode) ─────────────────────────────────────────
const fogColor = 0x1a2a3a;
const fog = new THREE.Fog(fogColor, 18, 45);
// We'll toggle scene.fog on/off based on edge mode

// Patch world.setEdgeMode to also toggle fog
const originalSetEdgeMode = world.setEdgeMode.bind(world);
world.setEdgeMode = (mode) => {
  originalSetEdgeMode(mode);
  scene.fog = mode === 'infinite' ? fog : null;
};

// ── Simulation Clock ──────────────────────────────────────────────────────────
const sim = new SimClock();

// ── UI ────────────────────────────────────────────────────────────────────────
const toggles = initUI(sim, world, sky, composer, pixelPass, camera, controls);

// ── URL query params (initial state; applied before first frame) ──────────────
// ?edge=icewall|waterfall|infinite|beyond  dome/clouds/beam/shadow=0|1
// ?day=0-364  time=0-24  speed=N  px=2-8  cam=X,Y,Z
{
  const qp = new URLSearchParams(location.search);
  const setInput = (id, val, evt) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.type === 'checkbox') el.checked = val;
    else el.value = val;
    el.dispatchEvent(new Event(evt || 'change'));
  };
  if (qp.get('edge')) {
    const el = document.getElementById('edge-' + qp.get('edge'));
    if (el) { el.checked = true; el.dispatchEvent(new Event('change')); }
  }
  const boolParams = [['dome', 'chk-dome'], ['clouds', 'chk-clouds'], ['beam', 'chk-sunbeam'], ['shadow', 'chk-shadow']];
  for (const [key, id] of boolParams) {
    if (qp.get(key) !== null) setInput(id, qp.get(key) !== '0');
  }
  if (qp.get('day') !== null || qp.get('time') !== null) {
    const d = qp.get('day') !== null ? Math.max(0, Math.min(364, parseInt(qp.get('day')) || 0)) : sim.day;
    const t = qp.get('time') !== null ? Math.max(0, Math.min(24, parseFloat(qp.get('time')) || 0)) : sim.timeOfDay;
    sim.simTime = d * 24 + t;
  }
  if (qp.get('speed') !== null) setInput('slider-speed', qp.get('speed'), 'input');
  if (qp.get('px') !== null) setInput('slider-pixel', qp.get('px'), 'input');
  if (qp.get('cam')) {
    const [x, y, z] = qp.get('cam').split(',').map(Number);
    if ([x, y, z].every(Number.isFinite)) {
      camera.position.set(x, y, z);
      controls.update();
    }
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

  // Update celestial objects
  updateSky(sky, sim, toggles);

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

  // Update controls
  controls.update();

  // Update UI readouts
  updateUI(sim, world, toggles);

  // Render
  composer.render();
}

animate();
