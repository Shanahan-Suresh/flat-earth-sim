import * as THREE from 'three';
import { CONSTANTS, findNextLunarEclipse, findNextFullMoon, findNextSolstice } from './sim.js';
import { initAudio, setAudioEnabled, uiSound } from './audio.js';
import { hydrateIcons, setIcon } from './icons.js';

let _groundMode = false;

const INITIAL_CAM = new THREE.Vector3(11.5, 7.4, 11.5);

// Cycle buttons step through a radio group; icon + hover label follow the checked radio.
const EDGE_MODES = [
  { value: 'icewall',   icon: 'wall',      tip: 'Ice wall' },
  { value: 'waterfall', icon: 'waterfall', tip: 'Waterfall' },
  { value: 'infinite',  icon: 'infinite',  tip: 'Endless' },
  { value: 'beyond',    icon: 'mountain',  tip: 'Lands beyond' },
];
const VIEW_MODES = [
  { value: 'diorama', icon: 'diorama', tip: 'Diorama' },
  { value: 'ground',  icon: 'ground',  tip: 'Ground' },
];
const MODEL_MODES = [
  { value: 'monopole', icon: 'monopole', tip: 'One pole' },
  { value: 'bipolar',  icon: 'bipolar',  tip: 'Two poles' },
];

// Speed button steps (slider-speed values; 1 = one sim day per 12 s)
const SPEED_STEPS = [1, 4, 16];
function speedIcon(v) {
  if (v < 2) return 'speed1';
  if (v < 8) return 'speed2';
  return 'speed3';
}

// ── Preset Postcards ──────────────────────────────────────────────────────────
export const PRESETS = [
  {
    label: 'Midnight sun', icon: 'sun-low',
    params: { day: 172, time: 0, edge: 'icewall', dome: true, cam: [4.5, 3.5, 4.5] },
  },
  {
    label: 'Falls at dusk', icon: 'waterfall',
    params: { edge: 'waterfall', day: 172, time: 18, cam: [13, 2.5, 13] },
  },
  {
    label: 'December', icon: 'snow',
    params: { day: 355, time: 15, edge: 'icewall', cam: [11.5, 7.4, 11.5] },
  },
  {
    label: 'Beyond the wall', icon: 'mountain',
    params: { edge: 'beyond', day: 200, time: 15, cam: [18, 4, 18] },
  },
  {
    label: 'Blood moon', icon: 'fullmoon', tone: 'blood',
    eclipse: true,  // special: triggers findNextLunarEclipse jump instead of fixed params
  },
];

// ctx: { sim, world, sky, look, camera, controls, applyState, serializeState,
//        setViewMode, setEdgeMode, requestPhotoSave }
// Returns { toggles, jumpToEclipse }.
export function initUI(ctx) {
  const { sim, world, look, camera, controls, applyState, captureState, serializeState, setViewMode, setEdgeMode, requestPhotoSave } = ctx;
  const toggles = { dome: true, clouds: true, sunBeam: true, shadowObject: false, aurora: true, view: 'diorama', routes: false, observers: false, model: 'monopole', traffic: true, lights: true, rain: true, constellations: true };
  const byId = id => document.getElementById(id);

  // Title card only on a plain load: deep links and screenshots open straight to the scene
  const plainLoad = !location.search;

  hydrateIcons();

  // ── Speed / pause (one place writes the slider, the pause icon and the speed icon) ──
  const btnPause    = byId('btn-pause');
  const btnSpeed    = byId('btn-speed');
  const sliderSpeed = byId('slider-speed');
  function syncPauseUI() {
    if (btnPause) {
      setIcon(btnPause, sim.paused ? 'play' : 'pause');
      btnPause.dataset.tip = sim.paused ? 'Play' : 'Pause';
    }
    if (btnSpeed && sliderSpeed) setIcon(btnSpeed, speedIcon(parseFloat(sliderSpeed.value) || 1));
  }
  // v = slider value (0 = paused, 1 = 1×)
  function setSpeed(v) {
    if (sliderSpeed && parseFloat(sliderSpeed.value) !== v) sliderSpeed.value = v;
    if (v === 0) {
      sim.paused = true;
    } else {
      sim.paused = false;
      sim.speed = v * CONSTANTS.DEFAULT_SIM_SPEED;
    }
    syncPauseUI();
  }
  function togglePause() {
    sim.paused = !sim.paused;
    syncPauseUI();
  }

  // ── Eclipse jump (shared by the almanac button, postcard, and URL param) ──
  function jumpToEclipse() {
    const T = findNextLunarEclipse(sim.simTime);
    if (T === null) return;
    sim.simTime = T - 2;     // 2 sim-hours before eclipse onset
    setSpeed(0.5);
    // Force-enable Shadow Object through the existing toggle + checkbox
    const cs = byId('chk-shadow');
    if (cs && !cs.checked) {
      cs.checked = true;
      cs.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  // ── Checkbox toggles: id → toggles key, plus any scene side effect ──
  function bindToggle(id, key, onChange) {
    const el = byId(id);
    if (!el) return;
    el.checked = toggles[key];
    el.addEventListener('change', e => {
      toggles[key] = e.target.checked;
      if (onChange) onChange(e.target.checked);
    });
  }
  bindToggle('chk-dome', 'dome', on => { world.domeMesh.visible = on; world.rimMesh.visible = on; });
  bindToggle('chk-clouds', 'clouds', on => { world.cloudGroup.visible = on; });
  bindToggle('chk-sunbeam', 'sunBeam');
  bindToggle('chk-shadow', 'shadowObject');
  bindToggle('chk-aurora', 'aurora');
  bindToggle('chk-routes', 'routes');
  bindToggle('chk-observers', 'observers');
  bindToggle('chk-traffic', 'traffic');   // visibility gated in main.js animate loop
  bindToggle('chk-lights', 'lights');
  bindToggle('chk-rain', 'rain');
  bindToggle('chk-constellations', 'constellations');

  // Audio toggle
  const chkAudio = byId('chk-audio');
  if (chkAudio) {
    chkAudio.checked = false; // default off
    chkAudio.addEventListener('change', e => {
      // change event IS a user gesture — safe to create/resume AudioContext here
      initAudio();
      setAudioEnabled(e.target.checked);
    });
  }

  // ── UI sounds: one delegated listener for every HUD control ──
  const hudEl = byId('hud');
  if (hudEl) {
    hudEl.addEventListener('change', e => {
      const el = e.target;
      if (el instanceof HTMLInputElement && el.type === 'checkbox') uiSound(el.checked ? 'on' : 'off');
    });
    hudEl.addEventListener('click', e => {
      const btn = e.target.closest('button');
      if (!btn) return;
      if (btn.dataset.pop) uiSound(btn.classList.contains('open') ? 'open' : 'close');
      else if (btn.classList.contains('preset-btn') || btn.id.startsWith('btn-alm')) uiSound('jump');
      else uiSound('click');
    });
  }

  // ── Radio groups + their cycle buttons ──
  function bindCycle(btnId, name, modes) {
    const btn = byId(btnId);
    const radios = modes.map(m => byId(name + '-' + m.value));
    function sync() {
      const i = Math.max(0, radios.findIndex(r => r && r.checked));
      if (btn) {
        setIcon(btn, modes[i].icon);
        btn.dataset.tip = modes[i].tip;
      }
    }
    radios.forEach(r => r && r.addEventListener('change', sync));
    if (btn) {
      btn.addEventListener('click', () => {
        const i = radios.findIndex(r => r && r.checked);
        const next = radios[(i + 1) % radios.length];
        next.checked = true;
        next.dispatchEvent(new Event('change', { bubbles: true }));
        showTip(btn);
      });
    }
    sync();
  }

  function applyModelMode(mode) {
    toggles.model = mode;
    if (world.setModel) world.setModel(mode);
    ['chk-routes', 'chk-observers', 'chk-traffic', 'chk-lights'].forEach(id => {
      const el = byId(id);
      if (el) el.disabled = mode === 'bipolar';
    });
  }
  MODEL_MODES.forEach(m => {
    const el = byId('model-' + m.value);
    if (el) el.addEventListener('change', () => { if (el.checked) applyModelMode(m.value); });
  });

  EDGE_MODES.forEach(m => {
    const el = byId('edge-' + m.value);
    if (el) el.addEventListener('change', () => { if (el.checked) setEdgeMode(m.value); });
  });

  const viewDiorama = byId('view-diorama');
  const viewGround  = byId('view-ground');
  if (viewDiorama) {
    viewDiorama.addEventListener('change', () => {
      if (!viewDiorama.checked) return;
      _groundMode = false;
      toggles.view = 'diorama';
      if (setViewMode) setViewMode('diorama');
    });
  }
  if (viewGround) {
    viewGround.addEventListener('change', () => {
      if (!viewGround.checked) return;
      _groundMode = true;
      toggles.view = 'ground';
      if (setViewMode) setViewMode('ground');
    });
  }

  // ── Time controls ──
  if (btnPause) btnPause.addEventListener('click', togglePause);
  if (btnSpeed && sliderSpeed) {
    btnSpeed.addEventListener('click', () => {
      const cur = parseFloat(sliderSpeed.value) || 1;
      const i = SPEED_STEPS.findIndex(s => s > cur + 0.01);
      sliderSpeed.value = SPEED_STEPS[i === -1 ? 0 : i];
      sliderSpeed.dispatchEvent(new Event('input', { bubbles: true }));
      showTip(btnSpeed);
    });
  }
  if (sliderSpeed) sliderSpeed.addEventListener('input', e => setSpeed(parseFloat(e.target.value)));

  const sliderDay = byId('slider-day');
  if (sliderDay) {
    sliderDay.addEventListener('input', e => {
      sim.simTime = parseInt(e.target.value) * 24 + sim.timeOfDay;
    });
  }

  // ── Almanac jumps ──
  function syncDayUI() {
    if (sliderDay && document.activeElement !== sliderDay) sliderDay.value = sim.day;
    syncPauseUI();
  }
  const btnAlmEclipse = byId('btn-alm-eclipse');
  if (btnAlmEclipse) btnAlmEclipse.addEventListener('click', jumpToEclipse);

  const btnAlmFullmoon = byId('btn-alm-fullmoon');
  if (btnAlmFullmoon) {
    btnAlmFullmoon.addEventListener('click', () => {
      sim.simTime = findNextFullMoon(sim.simTime) - 1; // arrive ~1h early
      sim.paused = false;
      syncDayUI();
    });
  }

  const btnAlmSolstice = byId('btn-alm-solstice');
  if (btnAlmSolstice) {
    btnAlmSolstice.addEventListener('click', () => {
      sim.simTime = findNextSolstice(sim.simTime).simTime;
      sim.paused = false;
      syncDayUI();
    });
  }

  // ── Look ──
  const sliderPixel = byId('slider-pixel');
  if (sliderPixel) {
    sliderPixel.addEventListener('input', e => look.setPixelSize(parseInt(e.target.value)));
  }

  const btnResetCam = byId('btn-reset-cam');
  if (btnResetCam) {
    btnResetCam.addEventListener('click', () => {
      if (_groundMode && setViewMode) {
        // Reset to ground default look direction, not diorama
        setViewMode('ground');
      } else {
        camera.position.copy(INITIAL_CAM);
        controls.target.set(0, 0, 0);
        controls.update();
      }
    });
  }

  // ── Photo mode ──
  let _photoMode = false;
  function enterPhotoMode() {
    closePops();
    _photoMode = true;
    document.body.classList.add('photo-mode');
  }
  function exitPhotoMode() {
    _photoMode = false;
    document.body.classList.remove('photo-mode');
    uiSound('close');
  }
  function savePhoto() {
    uiSound('shutter');
    if (requestPhotoSave) requestPhotoSave();
  }
  const btnPhoto = byId('btn-photo');
  if (btnPhoto) btnPhoto.addEventListener('click', enterPhotoMode);
  const btnPhotoExit = byId('btn-photo-exit');
  if (btnPhotoExit) btnPhotoExit.addEventListener('click', exitPhotoMode);
  const btnSavePng = byId('btn-save-png');
  if (btnSavePng) btnSavePng.addEventListener('click', savePhoto);

  // ── Copy link: the live state as a shareable URL (URL params are one-shot on load) ──
  const btnCopyLink = byId('btn-copy-link');
  if (btnCopyLink && captureState && serializeState) {
    let resetTimer = null;
    btnCopyLink.addEventListener('click', async () => {
      const url = location.origin + location.pathname + '?' + serializeState(captureState());
      let ok = false;
      try {
        if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(url); ok = true; }
      } catch (_) { /* fall through to prompt */ }
      if (!ok) window.prompt('Copy this link:', url);
      setIcon(btnCopyLink, ok ? 'check' : 'link');
      clearTimeout(resetTimer);
      resetTimer = setTimeout(() => setIcon(btnCopyLink, 'link'), 1500);
    });
  }

  // Reset all settings (info card)
  const btnReset = byId('btn-reset-all');
  if (btnReset) {
    btnReset.addEventListener('click', () => {
      localStorage.removeItem('fes-state');
      location.href = location.pathname;
    });
  }

  // ── Postcards ──
  const wrap = byId('postcards-wrap');
  if (wrap && applyState) {
    PRESETS.forEach(preset => {
      const btn = document.createElement('button');
      btn.className = 'tool preset-btn';
      btn.dataset.tip = preset.label;
      if (preset.tone) btn.dataset.tone = preset.tone;
      const icon = document.createElement('i');
      icon.dataset.icon = preset.icon;
      btn.appendChild(icon);
      setIcon(icon, preset.icon);
      btn.addEventListener('click', () => {
        if (preset.eclipse) jumpToEclipse();
        else applyState(preset.params);
      });
      wrap.appendChild(btn);
    });
  }

  // ── Popovers: one open at a time, above the dock ──
  const popButtons = [...document.querySelectorAll('[data-pop]')];
  function closePops() {
    popButtons.forEach(b => {
      b.classList.remove('open');
      const pop = byId(b.dataset.pop);
      if (pop) pop.hidden = true;
    });
  }
  popButtons.forEach(b => {
    b.addEventListener('click', () => {
      const pop = byId(b.dataset.pop);
      const wasOpen = pop && !pop.hidden;
      closePops();
      hideTip();
      if (pop && !wasOpen) {
        pop.hidden = false;
        b.classList.add('open');
        placePop(pop, b);
      }
    });
  });
  // Centre the popover over its button, kept inside the window
  function placePop(pop, btn) {
    const hudRect = byId('hud').getBoundingClientRect();
    const r = btn.getBoundingClientRect();
    const w = pop.offsetWidth;
    const centre = Math.min(Math.max(r.left + r.width / 2, w / 2 + 8), window.innerWidth - w / 2 - 8);
    pop.style.left = (centre - hudRect.left - w / 2) + 'px';
  }
  document.addEventListener('pointerdown', e => {
    if (!e.target.closest('#hud')) closePops();
  });

  // ── Hover labels (desktop only) ──
  const tip = byId('tip');
  const finePointer = !window.matchMedia('(pointer: coarse)').matches;
  let tipFor = null;
  function showTip(el) {
    if (!tip || !finePointer || !el || !el.dataset.tip) return;
    tipFor = el;
    tip.textContent = el.dataset.tip;
    tip.hidden = false;
    const r = el.getBoundingClientRect();
    const w = tip.offsetWidth, h = tip.offsetHeight;
    const left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), window.innerWidth - w - 8);
    let top = r.top - h - 8;
    if (top < 8) top = r.bottom + 8;
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
  }
  function hideTip() {
    tipFor = null;
    if (tip) tip.hidden = true;
  }
  document.addEventListener('pointerover', e => {
    const el = e.target.closest('[data-tip]');
    if (el && el !== tipFor) showTip(el);
    else if (!el && tipFor) hideTip();
  });
  document.addEventListener('pointerdown', e => {
    if (!e.target.closest('[data-tip]')) hideTip();
  });

  // ── Idle: the HUD dims after 3 s without pointer movement ──
  let idleTimer = null;
  function wake() {
    document.body.classList.remove('idle');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => document.body.classList.add('idle'), 3000);
  }
  window.addEventListener('pointermove', wake, { passive: true });
  window.addEventListener('pointerdown', wake, { passive: true });
  wake();

  // ── Keys: Space pause, H hide HUD, P photo, Esc close / exit ──
  document.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    if (_photoMode) {
      if (k === 'Escape' || k === 'p' || k === 'P') exitPhotoMode();
      if (k === 's' || k === 'S') savePhoto();
      return;
    }
    if (k === 'Escape') { closePops(); hideTip(); }
    else if (k === ' ' && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); togglePause(); }
    else if (k === 'h' || k === 'H') document.body.classList.toggle('hud-off');
    else if (k === 'p' || k === 'P') enterPhotoMode();
  });

  // Auto-rotate idle timer (disabled in ground mode)
  let rotateTimer = null;
  controls.addEventListener('start', () => {
    controls.autoRotate = false;
    clearTimeout(rotateTimer);
  });
  controls.addEventListener('end', () => {
    if (!_groundMode) {
      rotateTimer = setTimeout(() => { controls.autoRotate = true; }, 15000);
    }
  });

  bindCycle('btn-edge', 'edge', EDGE_MODES);
  bindCycle('btn-view', 'view', VIEW_MODES);
  bindCycle('btn-model', 'model', MODEL_MODES);

  // ── Title card ──
  const card = byId('title-card');
  if (card && plainLoad) {
    card.hidden = false;
    const dismiss = () => {
      card.classList.add('gone');
      setTimeout(() => card.remove(), 1000);
      window.removeEventListener('pointerdown', dismiss);
    };
    setTimeout(dismiss, 3500);
    window.addEventListener('pointerdown', dismiss);
  } else if (card) {
    card.remove();
  }

  syncPauseUI();

  return { toggles, jumpToEclipse };
}

// Dial sky: night indigo to day blue, warm at dawn and dusk
const DIAL_NIGHT = [14, 16, 44], DIAL_DAY = [58, 112, 178], DIAL_DUSK = [196, 118, 82];
function mix(a, b, t) { return a.map((v, i) => Math.round(v + (b[i] - v) * t)); }

// Per-frame UI: the day/night dial and the season track follow sim time.
let _lastDialDeg = null;
export function updateUI(sim) {
  // Noon puts the sun at the top of the dial, midnight the moon
  const deg = Math.round(((sim.timeOfDay / 24) * 360 + 180) % 360);
  if (deg !== _lastDialDeg) {
    const wheel = document.getElementById('dial-wheel');
    if (wheel) wheel.style.transform = `rotate(${deg}deg)`;
    const dial = document.getElementById('dial');
    if (dial) {
      const height = -Math.cos(sim.timeOfDay / 24 * 2 * Math.PI);   // 1 at noon, -1 at midnight
      const day = Math.max(0, Math.min(1, (height + 0.15) / 0.6));
      const dusk = Math.max(0, 1 - Math.abs(height) / 0.3);
      const c = mix(mix(DIAL_NIGHT, DIAL_DAY, day), DIAL_DUSK, dusk * 0.6);
      dial.style.backgroundColor = `rgb(${c.join(',')})`;
    }
    _lastDialDeg = deg;
  }

  const daySlider = document.getElementById('slider-day');
  const d = sim.day;
  if (daySlider && document.activeElement !== daySlider && parseInt(daySlider.value) !== d) {
    daySlider.value = d;
  }
}
