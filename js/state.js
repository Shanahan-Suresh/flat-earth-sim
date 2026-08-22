// js/state.js — the one place that knows which controls make up the sim state.
//
// STATE_SCHEMA drives apply / capture / serialize / parse, so adding a toggle
// is: one entry here, the <input> in index.html, its handler in ui.js, and a
// README row. Entry order is APPLY order: radios and bools first, then the
// clock, then sliders, then `cam` last so an explicit camera overrides the
// ground-view default standing spot that the `view` radio sets.
//
// Entry kinds:
//   bool   { id }            checkbox; URL '0' = false, anything else = true
//   radio  { ids: {value: elementId}, fallback? }
//   sim    { parse }         day / time — written straight into sim.simTime
//   range  { id, parse }     slider; dispatches 'input'
//   cam    —                 [x, y, z] or "x,y,z"

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export const STATE_SCHEMA = [
  { key: 'edge', kind: 'radio', fallback: 'icewall',
    ids: { icewall: 'edge-icewall', waterfall: 'edge-waterfall', infinite: 'edge-infinite', beyond: 'edge-beyond' } },
  { key: 'dome',           kind: 'bool', id: 'chk-dome' },
  { key: 'clouds',         kind: 'bool', id: 'chk-clouds' },
  { key: 'beam',           kind: 'bool', id: 'chk-sunbeam' },
  { key: 'shadow',         kind: 'bool', id: 'chk-shadow' },
  { key: 'aurora',         kind: 'bool', id: 'chk-aurora' },
  { key: 'routes',         kind: 'bool', id: 'chk-routes' },
  { key: 'observers',      kind: 'bool', id: 'chk-observers' },
  { key: 'audio',          kind: 'bool', id: 'chk-audio' },
  { key: 'traffic',        kind: 'bool', id: 'chk-traffic' },
  { key: 'lights',         kind: 'bool', id: 'chk-lights' },
  { key: 'rain',           kind: 'bool', id: 'chk-rain' },
  { key: 'constellations', kind: 'bool', id: 'chk-constellations' },
  { key: 'view',  kind: 'radio', ids: { diorama: 'view-diorama', ground: 'view-ground' } },
  { key: 'model', kind: 'radio', ids: { monopole: 'model-monopole', bipolar: 'model-bipolar' } },
  { key: 'day',   kind: 'sim',   parse: v => clamp(parseInt(v)   || 0, 0, 364) },
  { key: 'time',  kind: 'sim',   parse: v => clamp(parseFloat(v) || 0, 0, 24) },
  { key: 'speed', kind: 'range', id: 'slider-speed', parse: v => parseFloat(v) },
  { key: 'px',    kind: 'range', id: 'slider-pixel', parse: v => parseInt(v) },
  { key: 'cam',   kind: 'cam' },
];

const byId = id => document.getElementById(id);

function dispatch(el, evt) { el.dispatchEvent(new Event(evt)); }

export function parseCam(v) {
  const [x, y, z] = Array.isArray(v) ? v : String(v).split(',').map(Number);
  return [x, y, z].every(Number.isFinite) ? [x, y, z] : null;
}

// Drive the UI inputs (and the clock / camera) from a plain object; all keys optional.
// ctx = { sim, camera, controls }
export function applyState(params, ctx) {
  let clockTouched = false;
  for (const entry of STATE_SCHEMA) {
    const val = params[entry.key];
    if (val === undefined) continue;
    switch (entry.kind) {
      case 'bool': {
        const el = byId(entry.id);
        if (el) { el.checked = !!val; dispatch(el, 'change'); }
        break;
      }
      case 'radio': {
        const el = byId(entry.ids[val]);
        if (el) { el.checked = true; dispatch(el, 'change'); }
        break;
      }
      case 'sim': {
        if (clockTouched) break; // day + time are applied together on first sight
        clockTouched = true;
        const d = params.day  !== undefined ? STATE_SCHEMA.find(e => e.key === 'day').parse(params.day)   : ctx.sim.day;
        const t = params.time !== undefined ? STATE_SCHEMA.find(e => e.key === 'time').parse(params.time) : ctx.sim.timeOfDay;
        ctx.sim.simTime = d * 24 + t;
        break;
      }
      case 'range': {
        const el = byId(entry.id);
        if (el) { el.value = val; dispatch(el, 'input'); }
        break;
      }
      case 'cam': {
        const cam = parseCam(val);
        if (cam) { ctx.camera.position.set(...cam); ctx.controls.update(); }
        break;
      }
    }
  }
}

// Snapshot the full current state as a plain object (keys absent when the control is missing).
export function captureState(ctx) {
  const state = {};
  for (const entry of STATE_SCHEMA) {
    switch (entry.kind) {
      case 'bool': {
        const el = byId(entry.id);
        if (el) state[entry.key] = el.checked;
        break;
      }
      case 'radio': {
        let found = entry.fallback;
        for (const [value, id] of Object.entries(entry.ids)) {
          const el = byId(id);
          if (el && el.checked) { found = value; break; }
        }
        if (found !== undefined) state[entry.key] = found;
        break;
      }
      case 'sim':
        state[entry.key] = entry.key === 'day' ? ctx.sim.day : Math.round(ctx.sim.timeOfDay * 100) / 100;
        break;
      case 'range': {
        const el = byId(entry.id);
        if (el) state[entry.key] = entry.parse(el.value);
        break;
      }
      case 'cam':
        state.cam = ['x', 'y', 'z'].map(k => Math.round(ctx.camera.position[k] * 100) / 100);
        break;
    }
  }
  return state;
}

// state object → query string (no leading '?'). Pure.
export function serializeState(state) {
  const p = new URLSearchParams();
  for (const entry of STATE_SCHEMA) {
    const val = state[entry.key];
    if (val === undefined) continue;
    if (entry.kind === 'bool')     p.set(entry.key, val ? '1' : '0');
    else if (entry.kind === 'cam') p.set(entry.key, Array.isArray(val) ? val.join(',') : val);
    else                           p.set(entry.key, val);
  }
  return p.toString();
}

// query string (with or without '?') → partial state object, values still raw
// strings except bools. Pure. Unknown keys (e.g. the `eclipse` action) are ignored.
export function parseUrlState(search) {
  const qp = new URLSearchParams(search);
  const state = {};
  for (const entry of STATE_SCHEMA) {
    const raw = qp.get(entry.key);
    if (raw === null) continue;
    state[entry.key] = entry.kind === 'bool' ? raw !== '0' : raw;
  }
  return state;
}
