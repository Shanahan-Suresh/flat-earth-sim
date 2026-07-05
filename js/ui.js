import * as THREE from 'three';
import { SimClock } from './sim.js';

const LORE = {
  icewall:   "Consensus: a 150-ft Antarctic ice wall rings the disc and holds the oceans in — nothing falls off.",
  waterfall: "The 'edge waterfall' is actually an outsider meme — flat earthers disavow it. But here's what it would look like.",
  infinite:  "A minority faction holds the plane extends forever — no edge, no problem.",
  beyond:    "A popular 2020s claim: secret continents beyond the ice wall, hidden by the Antarctic Treaty.",
  domeoff:   "The old Flat Earth Society model: no dome — just a disc accelerating upward at 9.8 m/s².",
  domeon:    "The firmament: a solid crystal dome sealing the world like a snow globe, stars embedded within.",
  shadow:    "Lunar eclipses: an invisible 'Shadow Object' orbiting the sun slips between sun and moon.",
};

const INITIAL_CAM = new THREE.Vector3(14, 9, 14);

function pad(n) { return n < 10 ? '0' + n : String(n); }

function updateDayLabel(d) {
  const label = document.getElementById('label-day');
  if (label) {
    label.textContent = 'Day ' + d + ' · ' + SimClock.monthName(d) + ' · ' + SimClock.seasonName(d);
  }
}

export function initUI(sim, world, sky, composer, pixelPass, camera, controls) {
  const toggles = { dome: true, clouds: true, sunBeam: true, shadowObject: false };
  let currentEdge = 'icewall';

  function updateLore() {
    const el = document.getElementById('lore-caption');
    if (!el) return;
    if (toggles.shadowObject) {
      el.textContent = LORE.shadow;
    } else if (!toggles.dome) {
      el.textContent = LORE.domeoff;
    } else {
      el.textContent = LORE[currentEdge] || '';
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

  // Edge radio buttons
  ['icewall', 'waterfall', 'infinite', 'beyond'].forEach(mode => {
    const el = document.getElementById('edge-' + mode);
    if (el) {
      el.addEventListener('change', () => {
        currentEdge = mode;
        world.setEdgeMode(mode);
        updateLore();
      });
    }
  });

  // Pause button
  const btnPause = document.getElementById('btn-pause');
  if (btnPause) {
    btnPause.addEventListener('click', () => {
      sim.paused = !sim.paused;
      btnPause.textContent = sim.paused ? 'Resume' : 'Pause';
    });
  }

  // Speed slider
  const sliderSpeed = document.getElementById('slider-speed');
  if (sliderSpeed) {
    sliderSpeed.addEventListener('input', e => {
      const v = parseFloat(e.target.value);
      if (v === 0) {
        sim.paused = true;
        if (btnPause) btnPause.textContent = 'Resume';
      } else {
        sim.paused = false;
        sim.speed = v * (24 / 12);
        if (btnPause) btnPause.textContent = 'Pause';
      }
    });
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
  if (sliderPixel) {
    sliderPixel.addEventListener('input', e => {
      pixelPass.setPixelSize(parseInt(e.target.value));
    });
  }

  // Camera reset
  const btnResetCam = document.getElementById('btn-reset-cam');
  if (btnResetCam) {
    btnResetCam.addEventListener('click', () => {
      camera.position.copy(INITIAL_CAM);
      controls.target.set(0, 0, 0);
      controls.update();
    });
  }

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

  // Auto-rotate idle timer
  let idleTimer = null;
  controls.addEventListener('start', () => {
    controls.autoRotate = false;
    clearTimeout(idleTimer);
  });
  controls.addEventListener('end', () => {
    idleTimer = setTimeout(() => { controls.autoRotate = true; }, 15000);
  });

  // Set initial lore
  updateLore();
  updateDayLabel(sim.day);

  return toggles;
}

export function updateUI(sim, world, toggles) {
  const h = Math.floor(sim.timeOfDay);
  const m = Math.floor((sim.timeOfDay % 1) * 60);
  const d = sim.day;

  const clockEl = document.getElementById('clock-display');
  if (clockEl) {
    clockEl.textContent =
      'Day ' + d + ' · ' + pad(h) + ':' + pad(m) +
      ' · ' + SimClock.monthName(d) + ' · ' + SimClock.seasonName(d);
  }

  const speedEl = document.getElementById('sun-speed');
  if (speedEl) {
    speedEl.textContent = 'Sun: ' + Math.round(sim.sunSpeedMph).toLocaleString() + ' mph';
  }

  const dayLabel = document.getElementById('label-day');
  if (dayLabel) {
    dayLabel.textContent = 'Day ' + d + ' · ' + SimClock.monthName(d) + ' · ' + SimClock.seasonName(d);
  }

  const daySlider = document.getElementById('slider-day');
  if (daySlider && document.activeElement !== daySlider) {
    daySlider.value = d;
  }
}
