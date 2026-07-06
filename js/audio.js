// js/audio.js — procedural ambient audio engine for flat-earth-sim
// No binary assets. All sound is synthesized via WebAudio API.
// Public API: initAudio(), setAudioEnabled(bool), setEdgeMode(mode), setDayFactor(f)

let _ctx = null;          // AudioContext (created lazily on user gesture)
let _masterGain = null;   // master gain → destination
let _enabled = false;

// Layer gains (all built at graph-build time)
let _windGain      = null;
let _waterfallGain = null;
let _padGain       = null;

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

  // Apply current edge mode now that graph is built
  _applyEdgeMode(_currentEdge, true);
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

// ── Public: setDayFactor ──────────────────────────────────────────────────────
// f ∈ [0,1]; 0=night, 1=day facing camera.
// Wind lowpass: 350→500 Hz, Pad filter: base ±50 Hz brightness shift.
export function setDayFactor(f) {
  if (!_graphBuilt) return;
  if (Math.abs(f - _lastDayFactor) < 0.01) return; // throttle
  _lastDayFactor = f;

  const now = _ctx.currentTime;
  const τ = 4.0; // long time constant so it never zippers

  // Wind lowpass cutoff: 350 Hz (night) → 500 Hz (day)
  const windCutoff = 350 + f * 150;
  _windFilter.frequency.setTargetAtTime(windCutoff, now, τ);

  // Pad filter base: 750 Hz (night) → 850 Hz (day), LFO sweeps around that
  const padBase = 750 + f * 100;
  _padFilter.frequency.setTargetAtTime(padBase, now, τ);
}
