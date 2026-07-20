// js/audio.js — procedural ambient audio engine for flat-earth-sim
// No binary assets. All sound is synthesized via WebAudio API.
// Public API: initAudio(), setAudioEnabled(bool), setEdgeMode(mode), setDayFactor(f),
//             setRainIntensity(f), setEdgeProximity(p)

let _ctx = null;          // AudioContext (created lazily on user gesture)
let _masterGain = null;   // master gain → destination
let _enabled = false;

// Layer gains (all built at graph-build time)
let _windGain      = null;
let _waterfallGain = null;
let _padGain       = null;
let _rainGain      = null;
let _cricketVCA    = null; // amplitude texture VCA (tremolo + gate)
let _cricketLevel  = null; // master swell (night audible, day silent)

// Filter refs for dayFactor modulation
let _windFilter      = null;
let _padFilter       = null;

// LFO refs
let _windLFOGain   = null; // scales wind base gain ±30%
let _padLFOGain    = null; // scales pad filter freq ±200 Hz

// State
let _graphBuilt = false;
let _currentEdge = 'icewall';
let _lastDayFactor = -1;

// Dawn/dusk birds — scheduled one-shots, active only inside the twilight band
let _birdsActive = false;
let _birdTimer = null;

// Foghorn — edge + proximity gated, scheduled recurring one-shots
let _edgeProximity = 0;
let _foghornTimer = null;

function _smoothstep(x) {
  x = Math.max(0, Math.min(1, x));
  return x * x * (3 - 2 * x);
}

// ── Brown-noise buffer generator ─────────────────────────────────────────────
function makeBrownNoiseBuffer(ctx, durationSec) {
  const sampleRate = ctx.sampleRate;
  const length = Math.ceil(sampleRate * durationSec);
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);

  let runningValue = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    runningValue = (runningValue + 0.02 * white) * 0.998; // leaky integrator
    data[i] = runningValue;
  }

  // Normalize to ±0.8
  let peak = 0;
  for (let i = 0; i < length; i++) peak = Math.max(peak, Math.abs(data[i]));
  if (peak > 0) for (let i = 0; i < length; i++) data[i] = data[i] / peak * 0.8;

  return buffer;
}

// ── White-noise buffer generator ─────────────────────────────────────────────
function makeWhiteNoiseBuffer(ctx, durationSec) {
  const sampleRate = ctx.sampleRate;
  const length = Math.ceil(sampleRate * durationSec);
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

// ── Build the full audio graph ────────────────────────────────────────────────
function buildGraph() {
  if (_graphBuilt) return;
  _graphBuilt = true;

  const ctx = _ctx;
  const now = ctx.currentTime;

  // Master gain (faded in/out by setAudioEnabled)
  _masterGain = ctx.createGain();
  _masterGain.gain.setValueAtTime(0, now);
  _masterGain.connect(ctx.destination);

  // ── 1. WIND layer ──────────────────────────────────────────────────────────
  const brownBuf = makeBrownNoiseBuffer(ctx, 4);
  const windSrc = ctx.createBufferSource();
  windSrc.buffer = brownBuf;
  windSrc.loop = true;

  _windFilter = ctx.createBiquadFilter();
  _windFilter.type = 'lowpass';
  _windFilter.frequency.setValueAtTime(400, now);
  _windFilter.Q.setValueAtTime(0.8, now);

  // Wind base gain
  const windBaseGain = ctx.createGain();
  windBaseGain.gain.setValueAtTime(0.5, now);

  // LFO for gusting: ~0.05 Hz, ±30% of base gain
  const windLFO = ctx.createOscillator();
  windLFO.type = 'sine';
  windLFO.frequency.setValueAtTime(0.05, now);

  _windLFOGain = ctx.createGain();
  _windLFOGain.gain.setValueAtTime(0.15, now); // ±30% of 0.5

  windSrc.connect(_windFilter);
  _windFilter.connect(windBaseGain);
  windLFO.connect(_windLFOGain);
  _windLFOGain.connect(windBaseGain.gain);
  windBaseGain.connect(_masterGain);

  windSrc.start(now);
  windLFO.start(now);

  // ── 2. WATERFALL layer ────────────────────────────────────────────────────
  const whiteBuf = makeWhiteNoiseBuffer(ctx, 4);
  const wfSrc = ctx.createBufferSource();
  wfSrc.buffer = whiteBuf;
  wfSrc.loop = true;

  const wfFilter = ctx.createBiquadFilter();
  wfFilter.type = 'bandpass';
  wfFilter.frequency.setValueAtTime(900, now);
  wfFilter.Q.setValueAtTime(0.8, now);

  _waterfallGain = ctx.createGain();
  _waterfallGain.gain.setValueAtTime(0, now); // off by default

  wfSrc.connect(wfFilter);
  wfFilter.connect(_waterfallGain);
  _waterfallGain.connect(_masterGain);

  wfSrc.start(now);

  // ── 3. PAD layer — Am add9 voicing ────────────────────────────────────────
  // A1=55Hz, E2=82.4Hz, B2=123.47Hz — deep muddier-cozy bass register
  // Slight detune between oscillators for warmth
  const padFreqs = [
    { freq: 55.00,  detune:  0 },  // A1 root
    { freq: 82.41,  detune:  3 },  // E2 fifth, +3 cents
    { freq: 123.47, detune: -3 },  // B2 ninth, -3 cents
  ];

  // Shared lowpass swept by slow LFO
  _padFilter = ctx.createBiquadFilter();
  _padFilter.type = 'lowpass';
  _padFilter.frequency.setValueAtTime(800, now);
  _padFilter.Q.setValueAtTime(0.7, now);

  // LFO for pad filter sweep: ~0.02 Hz, ±200 Hz
  const padLFO = ctx.createOscillator();
  padLFO.type = 'sine';
  padLFO.frequency.setValueAtTime(0.02, now);

  _padLFOGain = ctx.createGain();
  _padLFOGain.gain.setValueAtTime(200, now);

  padLFO.connect(_padLFOGain);
  _padLFOGain.connect(_padFilter.frequency);

  _padGain = ctx.createGain();
  _padGain.gain.setValueAtTime(0.12, now);

  padFreqs.forEach(({ freq, detune }) => {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, now);
    osc.detune.setValueAtTime(detune, now);
    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(1 / padFreqs.length, now);
    osc.connect(oscGain);
    oscGain.connect(_padFilter);
    osc.start(now);
  });

  _padFilter.connect(_padGain);
  _padGain.connect(_masterGain);

  padLFO.start(now);

  // ── 4. RAIN layer ──────────────────────────────────────────────────────────
  const rainBuf = makeWhiteNoiseBuffer(ctx, 4);
  const rainSrc = ctx.createBufferSource();
  rainSrc.buffer = rainBuf;
  rainSrc.loop = true;

  const rainFilter = ctx.createBiquadFilter();
  rainFilter.type = 'bandpass';
  rainFilter.frequency.setValueAtTime(2200, now);
  rainFilter.Q.setValueAtTime(0.6, now);

  _rainGain = ctx.createGain();
  _rainGain.gain.setValueAtTime(0, now); // off by default

  rainSrc.connect(rainFilter);
  rainFilter.connect(_rainGain);
  _rainGain.connect(_masterGain);

  rainSrc.start(now);

  // ── 5. CRICKETS layer ─────────────────────────────────────────────────────
  const cricketOsc = ctx.createOscillator();
  cricketOsc.type = 'sine';
  cricketOsc.frequency.setValueAtTime(4300, now);

  const cricketFilter = ctx.createBiquadFilter();
  cricketFilter.type = 'bandpass';
  cricketFilter.frequency.setValueAtTime(4300, now);
  cricketFilter.Q.setValueAtTime(6, now);

  _cricketVCA = ctx.createGain();
  _cricketVCA.gain.setValueAtTime(0.5, now);

  _cricketLevel = ctx.createGain();
  _cricketLevel.gain.setValueAtTime(0, now); // swell driven by setDayFactor

  cricketOsc.connect(cricketFilter);
  cricketFilter.connect(_cricketVCA);
  _cricketVCA.connect(_cricketLevel);
  _cricketLevel.connect(_masterGain);

  // Fast tremolo LFO
  const cricketTremolo = ctx.createOscillator();
  cricketTremolo.type = 'sine';
  cricketTremolo.frequency.setValueAtTime(24, now);
  const cricketTremoloDepth = ctx.createGain();
  cricketTremoloDepth.gain.setValueAtTime(0.4, now);
  cricketTremolo.connect(cricketTremoloDepth);
  cricketTremoloDepth.connect(_cricketVCA.gain);

  // Slow gate LFO
  const cricketGate = ctx.createOscillator();
  cricketGate.type = 'sine';
  cricketGate.frequency.setValueAtTime(0.9, now);
  const cricketGateDepth = ctx.createGain();
  cricketGateDepth.gain.setValueAtTime(0.4, now);
  cricketGate.connect(cricketGateDepth);
  cricketGateDepth.connect(_cricketVCA.gain);

  cricketOsc.start(now);
  cricketTremolo.start(now);
  cricketGate.start(now);

  // ── 6. FOGHORN scheduler (started once; gates itself each firing) ────────
  _scheduleFoghorn();

  // Apply current edge mode now that graph is built
  _applyEdgeMode(_currentEdge, true);
}

// ── Internal: dawn/dusk bird chirp scheduler ─────────────────────────────────
function _scheduleBird() {
  if (!_birdsActive || !_enabled || !_ctx) return;

  const ctx = _ctx;
  const now = ctx.currentTime;
  const repeats = 2 + Math.floor(Math.random() * 2); // 2–3 quick chirps

  for (let i = 0; i < repeats; i++) {
    const t = now + i * 0.14;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(2800, t);
    osc.frequency.linearRampToValueAtTime(3400, t + 0.12);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.12, t + 0.015);
    env.gain.linearRampToValueAtTime(0, t + 0.15);

    osc.connect(env);
    env.connect(_masterGain);

    osc.start(t);
    osc.stop(t + 0.2);
  }

  _birdTimer = setTimeout(_scheduleBird, 2000 + Math.random() * 5000);
}

// ── Internal: foghorn scheduler (recurring; gates on fire) ───────────────────
function _scheduleFoghorn() {
  _foghornTimer = setTimeout(_scheduleFoghorn, 45000 + Math.random() * 75000);

  if (!_enabled || _edgeProximity <= 0.75 || _currentEdge !== 'icewall') return;
  if (!_ctx || !_masterGain) return;

  const ctx = _ctx;
  const now = ctx.currentTime;

  const hornFilter = ctx.createBiquadFilter();
  hornFilter.type = 'lowpass';
  hornFilter.frequency.setValueAtTime(200, now);

  const env = ctx.createGain();
  env.gain.setValueAtTime(0, now);
  env.gain.linearRampToValueAtTime(0.22, now + 1.2);
  env.gain.setValueAtTime(0.22, now + 2.5);
  env.gain.linearRampToValueAtTime(0, now + 4.0);

  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(65, now);

  const subOsc = ctx.createOscillator();
  subOsc.type = 'sine';
  subOsc.frequency.setValueAtTime(32.5, now);

  osc.connect(hornFilter);
  subOsc.connect(hornFilter);
  hornFilter.connect(env);
  env.connect(_masterGain);

  osc.start(now);
  subOsc.start(now);
  osc.stop(now + 4.2);
  subOsc.stop(now + 4.2);
}

// ── Public: initAudio ─────────────────────────────────────────────────────────
// Idempotent. Creates the AudioContext. Must be called from a user-gesture path.
export function initAudio() {
  if (_ctx) {
    // Resume if suspended (e.g. browser paused it)
    if (_ctx.state === 'suspended') _ctx.resume();
    return;
  }
  _ctx = new (window.AudioContext || window.webkitAudioContext)();
}

// ── Public: setAudioEnabled ────────────────────────────────────────────────────
export function setAudioEnabled(enabled) {
  _enabled = enabled;

  if (enabled) {
    // Ensure context + graph exist (safe if already built)
    if (!_ctx) initAudio();
    if (_ctx.state === 'suspended') _ctx.resume();
    if (!_graphBuilt) buildGraph();

    const now = _ctx.currentTime;
    _masterGain.gain.setTargetAtTime(0.25, now, 0.15); // ~0.5s fade in (τ=0.15s)
  } else {
    if (!_masterGain) return; // graph not built yet — nothing to do
    const now = _ctx.currentTime;
    _masterGain.gain.setTargetAtTime(0, now, 0.15);
  }
}

// ── Internal: apply edge mode immediately or with crossfade ──────────────────
function _applyEdgeMode(mode, immediate) {
  if (!_waterfallGain) return;
  const now = _ctx.currentTime;
  const targetGain = (mode === 'waterfall') ? 0.4 : 0;
  if (immediate) {
    _waterfallGain.gain.setValueAtTime(targetGain, now);
  } else {
    // ~1s crossfade: setTargetAtTime with τ=0.33s (reaches ~95% in ~1s)
    _waterfallGain.gain.setTargetAtTime(targetGain, now, 0.33);
  }
}

// ── Public: setEdgeMode ───────────────────────────────────────────────────────
export function setEdgeMode(mode) {
  _currentEdge = mode;
  if (!_graphBuilt) return; // will be applied at buildGraph time
  _applyEdgeMode(mode, false);
}

// ── Public: setRainIntensity ──────────────────────────────────────────────────
// f ∈ [0,1]; 1 = camera at/near a rain cell center, 0 = no rain nearby.
export function setRainIntensity(f) {
  if (!_graphBuilt) return;
  const now = _ctx.currentTime;
  const g = 0.18 * Math.max(0, Math.min(1, f));
  _rainGain.gain.setTargetAtTime(g, now, 0.5);
}

// ── Public: setEdgeProximity ──────────────────────────────────────────────────
// p ∈ [0,1]; how close the camera is to the disc edge. Gates the foghorn.
export function setEdgeProximity(p) {
  _edgeProximity = Math.max(0, Math.min(1, p));
}

// ── Public: setDayFactor ──────────────────────────────────────────────────────
// f ∈ [0,1]; 0=night, 1=day facing camera.
// Wind lowpass: 350→500 Hz, Pad filter: base ±50 Hz brightness shift.
export function setDayFactor(f) {
  if (!_graphBuilt) return;
  if (Math.abs(f - _lastDayFactor) < 0.01) return; // throttle
  const prevF = _lastDayFactor;
  _lastDayFactor = f;

  const now = _ctx.currentTime;
  const τ = 4.0; // long time constant so it never zippers

  // Wind lowpass cutoff: 350 Hz (night) → 500 Hz (day)
  const windCutoff = 350 + f * 150;
  _windFilter.frequency.setTargetAtTime(windCutoff, now, τ);

  // Pad filter base: 750 Hz (night) → 850 Hz (day), LFO sweeps around that
  const padBase = 750 + f * 100;
  _padFilter.frequency.setTargetAtTime(padBase, now, τ);

  // Crickets: swell in at night (f<0.30), silent by day
  const cricketTarget = 0.10 * _smoothstep((0.30 - f) / 0.15);
  _cricketLevel.gain.setTargetAtTime(cricketTarget, now, 1.5);

  // Dawn/dusk birds: active only inside the twilight band (0.30, 0.65)
  const bandNow = f > 0.30 && f < 0.65;
  const bandPrev = prevF > 0.30 && prevF < 0.65;
  if (bandNow && !bandPrev) {
    _birdsActive = true;
    _scheduleBird();
  } else if (!bandNow && bandPrev) {
    _birdsActive = false;
    clearTimeout(_birdTimer);
  }
}
