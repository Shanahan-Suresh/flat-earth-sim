import * as THREE from 'three';
import { CONSTANTS, SimClock, findNextLunarEclipse, findNextFullMoon, findNextSolstice, activeShower } from './sim.js';
import { initAudio, setAudioEnabled } from './audio.js';

const LORE_TIPS = {
  // Heavens toggles
  'chk-dome':      "The firmament: Samuel Birley Rowbotham's 'Earth Not a Globe' (1865) describes a solid crystal dome sealing the world like a snow globe, with stars embedded within. Without it the atmosphere and cosmic waters above would pour down.",
  'chk-clouds':    "Clouds form below the dome, circulating over the flat disc. In the flat model they cannot be 'above' a sphere; they're simply suspended moisture, exactly as they appear.",
  'chk-sunbeam':   "The sun emits a focused cone of light, not a globe-illuminating beam. Only the disc below its path receives daylight — hence the rotating day/night boundary the flat model predicts.",
  'chk-shadow':    "The Flat Earth Society's answer to lunar eclipses: an invisible 'Shadow Object' orbits between the sun and moon, casting a shadow that explains every eclipse without a spherical Earth. (wiki.tfes.org)",
  'chk-aurora':    "Believers report auroras dancing over the ice wall's rim — light playing on the dome's inner edge, refracted through the ice. Rowbotham noted the aurora was always seen near the horizon, consistent with a rim effect.",
  'chk-constellations': "The stars are lamps hung on the underside of the dome, turning once per sidereal day. The Hub circles Polaris, \"the one nail that never moves.\"",

  // Edge modes
  'edge-icewall':   "Samuel Rowbotham and modern TFES consensus: a 150-ft Antarctic ice wall rings the disc and holds the oceans in. The UN flag depicts it faithfully. Military treaties forbid civilian access — the official story.",
  'edge-waterfall': "The 'edge waterfall' is an outsider meme — flat earthers largely disavow it. But the model says water must go somewhere if it reaches the edge. This is what that minority fringe imagines.",
  'edge-infinite':  "A minority faction holds the plane extends forever — no ice wall, no edge, just ocean to infinity. They argue Antarctica isn't a continent at all, merely a ring of fractured ice at the observable boundary.",
  'edge-beyond':    "A popular 2020s flat-earth claim: entire continents exist beyond the ice wall, hidden by the Antarctic Treaty. Explorers allegedly turn back at 60°S by international agreement — covering up what lies beyond.",

  // Almanac buttons
  'btn-alm-eclipse': "The Shadow Object — a dark satellite no telescope has ever caught — orbits near the sun. When it passes between the sun and moon during a full moon, the moon turns blood-red. Click to jump to the next such alignment.",
  'btn-alm-fullmoon': "The moon is no reflector but a cold, self-luminous lamp; it shows full face only when it swings directly opposite the sun's spotlight, once every 29.5 days. Click to jump to that night.",
  'btn-alm-solstice': "The sun's spiral tightens to its smallest ring near the North-Pole hub on Jun 21, then widens all the way out past the ice wall by Dec 21. Click to jump to the next turning point.",

  // Overlays
  'chk-routes':     "On the flat map, southern hemisphere flights stretch enormously and route north past the equator. Airlines claim to fly Sydney–Santiago nonstop in ~12.5 h — flat earthers say the real route curves through North America, hidden by closed-cockpit navigation.",
  'chk-observers':  "The sun's spotlight circle determines local time: observers inside the lit patch have day, those outside have night. Local solar time is simply each point's angular position relative to the sun's azimuth.",
  'chk-traffic':    "Overhead, airliners quietly fly the flat map's true routes — closed cockpits, curtained windows, and a 14-hour crossing over the southern reaches that a globe model would never require.",
  'chk-lights':     "Cities need no lamps within the sun's spotlight — but the moment its cone slides past, streets and skylines kindle below the dome, exactly where the day patch used to be.",

  // Weather
  'chk-rain':       "Rowbotham held that all weather — rain included — lives in the lower air, drifting well beneath the solid firmament above.",

  // Sound
  'chk-audio': "Wind sweeps endlessly across the infinite plane, and the firmament above hums — a low resonance of creation at the world's edge. Listen closer: crickets rise from the disc after dark, birdsong stitches the dawn and dusk twilight bands, and near the ice wall a distant foghorn calls through the mist.",

  // Model radios
  'model-monopole': "The standard TFES model: one North Pole at the disc center, Antarctica as the surrounding ice ring. First described systematically by Orlando Ferguson (1893) and refined by Rowbotham.",
  'model-bipolar':  "A rival flat-earth map with two poles — North and South — placed side by side. Advocated by some modern flat-earth communities; even its champions don't agree on how the sun spirals over two poles, so this sim keeps the standard path.",

  // View modes
  'view-diorama':  "The classic overview diorama — see the disc, dome, sun and moon all at once. Best for understanding the model's geometry.",
  'view-ground':   "In the flat model the sun never sets — it only shrinks with distance. Ground view shows what the model predicts: a sun that spirals overhead and never dips below a real horizon.",
};

const LORE = {
  icewall:   "Consensus: a 150-ft Antarctic ice wall rings the disc and holds the oceans in — nothing falls off.",
  waterfall: "The 'edge waterfall' is actually an outsider meme — flat earthers disavow it. But here's what it would look like.",
  infinite:  "A minority faction holds the plane extends forever — no edge, no problem.",
  beyond:    "A popular 2020s claim: secret continents beyond the ice wall, hidden by the Antarctic Treaty.",
  domeoff:   "The old Flat Earth Society model: no dome — just a disc accelerating upward at 9.8 m/s².",
  domeon:    "The firmament: a solid crystal dome sealing the world like a snow globe, stars embedded within.",
  shadow:    "Lunar eclipses: an invisible 'Shadow Object' orbiting the sun slips between sun and moon.",
  aurora:    "Believers report auroras dancing over the ice wall — light playing on the dome's rim.",
  ground:    "In the flat model the sun never sets — it only shrinks into the distance. This is what the model predicts you'd see.",
  eclipse:   "The Shadow Object — a dark satellite no telescope has ever caught — slides between sun and moon. Watch the moon turn to blood.",
  eclipseNone: "The heavens grant no eclipse this season.",
  audio:       "Wind over the endless plane, the slow hum of the firmament — the world has a sound, if you listen.",
  routes:    "On the flat map, Sydney→Santiago stretches double and detours north past the equator. Airlines fly it nonstop in ~12.5 h — flat earthers say the actual route curves through North America, hidden by closed-cockpit navigation.",
  bipolar:   "A rival map among flat-earthers: two poles side by side, continents clustered around each. Even its advocates don't agree on sun mechanics, so the sun keeps the standard spiral path.",
  traffic:   "Airliners fly the flat map's true routes behind closed cockpits — 14-hour southern crossings the globe model would call impossible.",
  lights:    "When the sun's spotlight slides on, the cities beneath kindle — no lamps needed inside the day patch.",
  rain:      "Rowbotham held all weather lives in the lower air, well beneath the firmament.",
  constellations: "Lamps hung on the underside of the dome, turning once per sidereal day. The Hub circles Polaris — the one nail that never moves.",
};

let _groundMode = false;

const INITIAL_CAM = new THREE.Vector3(14, 9, 14);

// ── Preset Postcards ──────────────────────────────────────────────────────────
export const PRESETS = [
  {
    label: 'Midnight Sun',
    params: { day: 172, time: 0, edge: 'icewall', dome: true, cam: [4.5, 3.5, 4.5] },
  },
  {
    label: 'Falls at Dusk',
    params: { edge: 'waterfall', day: 172, time: 18, cam: [13, 2.5, 13] },
  },
  {
    label: 'December Rush',
    params: { day: 355, time: 15, edge: 'icewall', cam: [14, 9, 14] },
  },
  {
    label: 'Beyond the Wall',
    params: { edge: 'beyond', day: 200, time: 15, cam: [18, 4, 18] },
  },
  {
    label: 'Blood Moon',
    eclipse: true,  // special: triggers findNextLunarEclipse jump instead of fixed params
  },
];

function pad(n) { return n < 10 ? '0' + n : String(n); }

function updateDayLabel(d) {
  const label = document.getElementById('label-day');
  if (label) {
    label.textContent = 'Day ' + d + ' · ' + SimClock.monthName(d) + ' · ' + SimClock.seasonName(d);
  }
}

// ctx: { sim, world, sky, pixelPass, camera, controls, applyState, serializeState,
//        setViewMode, setEdgeMode, requestPhotoSave }
// Returns { toggles, jumpToEclipse }.
export function initUI(ctx) {
  const { sim, world, pixelPass, camera, controls, applyState, serializeState, setViewMode, setEdgeMode, requestPhotoSave } = ctx;
  const toggles = { dome: true, clouds: true, sunBeam: true, shadowObject: false, aurora: true, view: 'diorama', routes: false, observers: false, model: 'monopole', traffic: true, lights: true, rain: true, constellations: true };
  let currentEdge = 'icewall';

  function updateLore(overrideKey) {
    const el = document.getElementById('lore-caption');
    if (!el) return;
    if (overrideKey) {
      el.textContent = LORE[overrideKey] || '';
    } else if (_groundMode) {
      el.textContent = LORE.ground;
    } else if (toggles.shadowObject) {
      el.textContent = LORE.shadow;
    } else if (!toggles.dome) {
      el.textContent = LORE.domeoff;
    } else {
      el.textContent = LORE[currentEdge] || '';
    }
  }

  // ── Speed / pause (one place writes the slider, its label and the button) ──
  const btnPause    = document.getElementById('btn-pause');
  const sliderSpeed = document.getElementById('slider-speed');
  const labelSpeed  = document.getElementById('label-speed');
  function syncPauseUI() {
    if (btnPause) btnPause.textContent = sim.paused ? 'RESUME' : 'PAUSE';
    if (labelSpeed && sliderSpeed) labelSpeed.textContent = sim.paused ? 'PAUSED' : sliderSpeed.value + '×';
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

  // ── Eclipse jump (shared by the almanac button, postcard, and URL param) ──
  function jumpToEclipse() {
    const T = findNextLunarEclipse(sim.simTime);
    if (T !== null) {
      sim.simTime = T - 2;     // 2 sim-hours before eclipse onset
      setSpeed(0.5);
      // Force-enable Shadow Object through the existing toggle + checkbox
      const cs = document.getElementById('chk-shadow');
      if (cs && !cs.checked) {
        cs.checked = true;
        cs.dispatchEvent(new Event('change'));
      }
      updateLore('eclipse');
    } else {
      updateLore('eclipseNone');
    }
  }

  // Collapse button
  const panel = document.getElementById('right-panel');
  const btnCollapse = document.getElementById('btn-collapse');
  if (btnCollapse && panel) {
    btnCollapse.addEventListener('click', () => {
      const collapsed = panel.classList.toggle('collapsed');
      btnCollapse.textContent = collapsed ? '[+]' : '[–]';
    });
  }

  // Dome toggle
  const chkDome = document.getElementById('chk-dome');
  if (chkDome) {
    chkDome.checked = toggles.dome;
    chkDome.addEventListener('change', e => {
      toggles.dome = e.target.checked;
      world.domeMesh.visible = toggles.dome;
      world.rimMesh.visible = toggles.dome;
      updateLore();
    });
  }

  // Clouds toggle
  const chkClouds = document.getElementById('chk-clouds');
  if (chkClouds) {
    chkClouds.checked = toggles.clouds;
    chkClouds.addEventListener('change', e => {
      toggles.clouds = e.target.checked;
      world.cloudGroup.visible = toggles.clouds;
    });
  }

  // Sun beam toggle
  const chkSunBeam = document.getElementById('chk-sunbeam');
  if (chkSunBeam) {
    chkSunBeam.checked = toggles.sunBeam;
    chkSunBeam.addEventListener('change', e => {
      toggles.sunBeam = e.target.checked;
    });
  }

  // Shadow object toggle
  const chkShadow = document.getElementById('chk-shadow');
  if (chkShadow) {
    chkShadow.checked = toggles.shadowObject;
    chkShadow.addEventListener('change', e => {
      toggles.shadowObject = e.target.checked;
      updateLore();
    });
  }

  // Aurora toggle
  const chkAurora = document.getElementById('chk-aurora');
  if (chkAurora) {
    chkAurora.checked = toggles.aurora;
    chkAurora.addEventListener('change', e => {
      toggles.aurora = e.target.checked;
      if (toggles.aurora) updateLore('aurora');
      else updateLore();
    });
  }

  // Routes toggle
  const chkRoutes = document.getElementById('chk-routes');
  if (chkRoutes) {
    chkRoutes.checked = toggles.routes;
    chkRoutes.addEventListener('change', e => {
      toggles.routes = e.target.checked;
      const box = document.getElementById('routes-box');
      if (box) box.style.display = e.target.checked ? 'block' : 'none';
      updateLore(e.target.checked ? 'routes' : undefined);
    });
  }

  // Observers toggle
  const chkObservers = document.getElementById('chk-observers');
  if (chkObservers) {
    chkObservers.checked = toggles.observers;
    chkObservers.addEventListener('change', e => {
      toggles.observers = e.target.checked;
      const box = document.getElementById('observer-box');
      if (box) box.style.display = e.target.checked ? 'block' : 'none';
    });
  }

  // Traffic toggle (ships & planes) — visibility gated in main.js animate loop
  const chkTraffic = document.getElementById('chk-traffic');
  if (chkTraffic) {
    chkTraffic.checked = toggles.traffic;
    chkTraffic.addEventListener('change', e => {
      toggles.traffic = e.target.checked;
      updateLore(e.target.checked ? 'traffic' : undefined);
    });
  }

  // City lights toggle
  const chkLights = document.getElementById('chk-lights');
  if (chkLights) {
    chkLights.checked = toggles.lights;
    chkLights.addEventListener('change', e => {
      toggles.lights = e.target.checked;
      updateLore(e.target.checked ? 'lights' : undefined);
    });
  }

  // Rain toggle
  const chkRain = document.getElementById('chk-rain');
  if (chkRain) {
    chkRain.checked = toggles.rain;
    chkRain.addEventListener('change', e => {
      toggles.rain = e.target.checked;
      updateLore(e.target.checked ? 'rain' : undefined);
    });
  }

  // Constellations toggle
  const chkConstellations = document.getElementById('chk-constellations');
  if (chkConstellations) {
    chkConstellations.checked = toggles.constellations;
    chkConstellations.addEventListener('change', e => {
      toggles.constellations = e.target.checked;
      updateLore(e.target.checked ? 'constellations' : undefined);
    });
  }

  // Audio toggle
  const chkAudio = document.getElementById('chk-audio');
  if (chkAudio) {
    chkAudio.checked = false; // default off
    chkAudio.addEventListener('change', e => {
      // change event IS a user gesture — safe to create/resume AudioContext here
      initAudio();
      setAudioEnabled(e.target.checked);
      if (e.target.checked) updateLore('audio');
      else updateLore();
    });
  }

  // Model radios
  const modelMonopole = document.getElementById('model-monopole');
  const modelBipolar  = document.getElementById('model-bipolar');
  function applyModelMode(mode) {
    toggles.model = mode;
    if (world.setModel) world.setModel(mode);
    const routesEl  = document.getElementById('chk-routes');
    const obsEl     = document.getElementById('chk-observers');
    const trafficEl = document.getElementById('chk-traffic');
    const lightsEl  = document.getElementById('chk-lights');
    const box       = document.getElementById('observer-box');
    const routesBox = document.getElementById('routes-box');
    if (mode === 'bipolar') {
      if (routesEl)  routesEl.disabled = true;
      if (obsEl)     obsEl.disabled    = true;
      if (trafficEl) trafficEl.disabled = true;
      if (lightsEl)  lightsEl.disabled  = true;
      if (box)       box.style.display = 'none';
      if (routesBox) routesBox.style.display = 'none';
      updateLore('bipolar');
    } else {
      if (routesEl)  routesEl.disabled = false;
      if (obsEl)     obsEl.disabled    = false;
      if (trafficEl) trafficEl.disabled = false;
      if (lightsEl)  lightsEl.disabled  = false;
      if (box && obsEl && obsEl.checked) box.style.display = 'block';
      if (routesBox && routesEl && routesEl.checked) routesBox.style.display = 'block';
      updateLore();
    }
  }
  if (modelMonopole) {
    modelMonopole.addEventListener('change', () => {
      if (modelMonopole.checked) applyModelMode('monopole');
    });
  }
  if (modelBipolar) {
    modelBipolar.addEventListener('change', () => {
      if (modelBipolar.checked) applyModelMode('bipolar');
    });
  }

  // Edge radio buttons
  ['icewall', 'waterfall', 'infinite', 'beyond'].forEach(mode => {
    const el = document.getElementById('edge-' + mode);
    if (el) {
      el.addEventListener('change', () => {
        currentEdge = mode;
        setEdgeMode(mode);
        updateLore();
      });
    }
  });

  // Pause button
  if (btnPause) {
    btnPause.addEventListener('click', () => {
      sim.paused = !sim.paused;
      syncPauseUI();
    });
  }

  // ── Almanac buttons ────────────────────────────────────────────────────────
  function syncDayUI() {
    updateDayLabel(sim.day);
    const sd = document.getElementById('slider-day');
    if (sd && document.activeElement !== sd) sd.value = sim.day;
    syncPauseUI();
  }

  const btnAlmEclipse = document.getElementById('btn-alm-eclipse');
  if (btnAlmEclipse) {
    btnAlmEclipse.addEventListener('click', jumpToEclipse);
  }

  const btnAlmFullmoon = document.getElementById('btn-alm-fullmoon');
  if (btnAlmFullmoon) {
    btnAlmFullmoon.addEventListener('click', () => {
      sim.simTime = findNextFullMoon(sim.simTime) - 1; // arrive ~1h early
      sim.paused = false;
      syncDayUI();
    });
  }

  const btnAlmSolstice = document.getElementById('btn-alm-solstice');
  if (btnAlmSolstice) {
    btnAlmSolstice.addEventListener('click', () => {
      const s = findNextSolstice(sim.simTime);
      sim.simTime = s.simTime;
      sim.paused = false;
      syncDayUI();
    });
  }

  // Speed slider
  if (sliderSpeed) {
    sliderSpeed.addEventListener('input', e => setSpeed(parseFloat(e.target.value)));
  }

  // Day slider
  const sliderDay = document.getElementById('slider-day');
  if (sliderDay) {
    sliderDay.addEventListener('input', e => {
      const d = parseInt(e.target.value);
      const tod = sim.timeOfDay;
      sim.simTime = d * 24 + tod;
      updateDayLabel(d);
    });
  }

  // Pixel slider
  const sliderPixel = document.getElementById('slider-pixel');
  const labelPixel  = document.getElementById('label-pixel');
  if (sliderPixel) {
    sliderPixel.addEventListener('input', e => {
      pixelPass.setPixelSize(parseInt(e.target.value));
      if (labelPixel) labelPixel.textContent = e.target.value;
    });
  }

  // Camera reset
  const btnResetCam = document.getElementById('btn-reset-cam');
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

  // View radios (Diorama / Ground)
  const viewDiorama = document.getElementById('view-diorama');
  const viewGround  = document.getElementById('view-ground');
  if (viewDiorama) {
    viewDiorama.addEventListener('change', () => {
      if (viewDiorama.checked) {
        _groundMode = false;
        toggles.view = 'diorama';
        if (setViewMode) setViewMode('diorama');
        updateLore();
      }
    });
  }
  if (viewGround) {
    viewGround.addEventListener('change', () => {
      if (viewGround.checked) {
        _groundMode = true;
        toggles.view = 'ground';
        if (setViewMode) setViewMode('ground');
        updateLore('ground');
      }
    });
  }

  // Photo mode
  let _photoMode = false;
  function enterPhotoMode() {
    _photoMode = true;
    document.body.classList.add('photo-mode');
  }
  function exitPhotoMode() {
    _photoMode = false;
    document.body.classList.remove('photo-mode');
  }

  const btnPhoto = document.getElementById('btn-photo');
  if (btnPhoto) {
    btnPhoto.addEventListener('click', enterPhotoMode);
  }

  const photoExit = document.getElementById('photo-exit');
  if (photoExit) {
    photoExit.addEventListener('click', exitPhotoMode);
  }

  const btnSavePng = document.getElementById('btn-save-png');
  if (btnSavePng) {
    btnSavePng.addEventListener('click', e => {
      e.stopPropagation(); // don't also exit
      if (requestPhotoSave) requestPhotoSave();
    });
  }

  document.addEventListener('keydown', e => {
    if (_photoMode) {
      if (e.key === 'Escape') exitPhotoMode();
      if (e.key === 's' || e.key === 'S') {
        if (requestPhotoSave) requestPhotoSave();
      }
    }
  });

  // About modal
  const btnAbout = document.getElementById('btn-about');
  const modalAbout = document.getElementById('modal-about');
  const modalClose = document.getElementById('modal-close');
  if (btnAbout && modalAbout) {
    btnAbout.addEventListener('click', () => {
      modalAbout.style.display = 'flex';
    });
  }
  if (modalClose && modalAbout) {
    modalClose.addEventListener('click', () => {
      modalAbout.style.display = 'none';
    });
  }
  if (modalAbout) {
    modalAbout.addEventListener('click', e => {
      if (e.target === e.currentTarget) modalAbout.style.display = 'none';
    });
  }

  // Reset all settings link (inside About modal)
  const btnReset = document.getElementById('btn-reset-all');
  if (btnReset) {
    btnReset.addEventListener('click', e => {
      e.preventDefault();
      localStorage.removeItem('fes-state');
      location.href = location.pathname;
    });
  }

  // Auto-rotate idle timer (disabled in ground mode)
  let idleTimer = null;
  controls.addEventListener('start', () => {
    controls.autoRotate = false;
    clearTimeout(idleTimer);
  });
  controls.addEventListener('end', () => {
    if (!_groundMode) {
      idleTimer = setTimeout(() => { controls.autoRotate = true; }, 15000);
    }
  });

  // ── Postcards panel ───────────────────────────────────────────────────────
  const postcardsSection = document.getElementById('section-postcards');
  if (postcardsSection && applyState && serializeState) {
    const wrap = document.getElementById('postcards-wrap');
    if (wrap) {
      PRESETS.forEach(preset => {
        const btn = document.createElement('button');
        btn.className = 'pixel-btn preset-btn';
        btn.textContent = preset.label;
        btn.addEventListener('click', () => {
          if (preset.eclipse) {
            // Eclipse preset: run the finder+jump, update URL with eclipse=1 action param
            jumpToEclipse();
            history.replaceState(null, '', '?eclipse=1');
          } else {
            applyState(preset.params);
            // Sync the lore/edge state after preset applies
            const edgeEl = document.querySelector('input[name="edge"]:checked');
            if (edgeEl) {
              currentEdge = edgeEl.value;
              updateLore();
            }
            // Update address bar
            history.replaceState(null, '', '?' + serializeState(preset.params));
          }
        });
        wrap.appendChild(btn);
      });
    }
  }

  // ── Lore tooltips ─────────────────────────────────────────────────────────
  const tooltip = document.getElementById('tooltip');
  if (tooltip && !window.matchMedia('(pointer: coarse)').matches) {
    function attachTooltip(el, tip) {
      if (!el || !tip) return;
      el.addEventListener('mouseenter', () => {
        tooltip.textContent = tip;
        tooltip.style.display = 'block';
        const rect = el.getBoundingClientRect();
        const ttH = tooltip.offsetHeight || 80;
        let top = rect.top - ttH - 6;
        if (top < 8) top = rect.bottom + 6;
        const left = Math.min(rect.left, window.innerWidth - 276);
        tooltip.style.left = Math.max(8, left) + 'px';
        tooltip.style.top = top + 'px';
      });
      el.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });
    }

    const rows = document.querySelectorAll('.checkbox-row, .radio-row');
    rows.forEach(row => {
      // Find the associated input's id
      const input = row.querySelector('input[id]');
      if (!input) return;
      attachTooltip(row, LORE_TIPS[input.id]);
    });

    // Also attach to named buttons in LORE_TIPS
    ['btn-alm-fullmoon', 'btn-alm-eclipse', 'btn-alm-solstice'].forEach(id => {
      attachTooltip(document.getElementById(id), LORE_TIPS[id]);
    });
  }

  // Set initial lore + readouts
  updateLore();
  updateDayLabel(sim.day);
  syncPauseUI();

  return { toggles, jumpToEclipse };
}

// ── Almanac refresh (throttled, cached across the ~400-sim-day eclipse scan) ──
let _almCache = null;      // { fullMoonT, eclipseT, solsticeT, solsticeLabel, computedFrom }
let _almLastRefresh = 0;

function refreshAlmanac(sim) {
  const now = performance.now();
  if (now - _almLastRefresh < 1000) return;
  _almLastRefresh = now;

  const stale = !_almCache ||
    sim.simTime < _almCache.computedFrom ||
    sim.simTime > _almCache.fullMoonT ||
    sim.simTime > _almCache.solsticeT ||
    sim.simTime > _almCache.eclipseT;

  if (stale) {
    const fullMoonT = findNextFullMoon(sim.simTime);
    const ecl = findNextLunarEclipse(sim.simTime);
    const eclipseT = ecl === null ? Infinity : ecl;
    const sol = findNextSolstice(sim.simTime);
    _almCache = {
      fullMoonT,
      eclipseT,
      solsticeT: sol.simTime,
      solsticeLabel: sol.label,
      computedFrom: sim.simTime,
    };
  }

  function fmt(T) {
    const day = Math.floor(T / 24) % 365;
    const tod = T % 24;
    const h = Math.floor(tod), m = Math.floor((tod % 1) * 60);
    return 'Day ' + day + ' · ' + SimClock.monthName(day) + ' ' + pad(h) + ':' + pad(m);
  }

  const fmEl = document.getElementById('alm-fullmoon-val');
  if (fmEl) fmEl.textContent = fmt(_almCache.fullMoonT);

  const eclEl = document.getElementById('alm-eclipse-val');
  if (eclEl) eclEl.textContent = _almCache.eclipseT === Infinity ? 'none this season' : fmt(_almCache.eclipseT);

  const solEl = document.getElementById('alm-solstice-val');
  if (solEl) solEl.textContent = fmt(_almCache.solsticeT) + ' · ' + _almCache.solsticeLabel;

  const sh = activeShower(sim.day);
  const shEl = document.getElementById('alm-shower');
  if (shEl) {
    if (sh) {
      shEl.textContent = '☄ ' + sh.name.toUpperCase();
      shEl.style.display = 'block';
    } else {
      shEl.style.display = 'none';
    }
  }
}

// Per-frame readouts; DOM writes only when the displayed text actually changes.
const _lastText = {};
function setTextIfChanged(id, text) {
  if (_lastText[id] === text) return;
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  _lastText[id] = text;
}

export function updateUI(sim, world, toggles) {
  const h = Math.floor(sim.timeOfDay);
  const m = Math.floor((sim.timeOfDay % 1) * 60);
  const d = sim.day;

  setTextIfChanged('clock-display',
    'Day ' + d + ' · ' + pad(h) + ':' + pad(m) + ' · ' + SimClock.monthName(d) + ' · ' + SimClock.seasonName(d));
  setTextIfChanged('sun-speed', 'Sun: ' + Math.round(sim.sunSpeedMph).toLocaleString() + ' mph');
  setTextIfChanged('label-day', 'Day ' + d + ' · ' + SimClock.monthName(d) + ' · ' + SimClock.seasonName(d));

  const daySlider = document.getElementById('slider-day');
  if (daySlider && document.activeElement !== daySlider && parseInt(daySlider.value) !== d) {
    daySlider.value = d;
  }

  refreshAlmanac(sim);
}
