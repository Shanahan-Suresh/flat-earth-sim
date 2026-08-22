// Pure parts of js/state.js (serialize / parse). apply / capture touch the DOM
// and are exercised by smoke-test.html + the headless screenshots instead.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { STATE_SCHEMA, serializeState, parseUrlState, parseCam } from '../js/state.js';

test('schema: every key unique, cam last, edge first (apply order)', () => {
  const keys = STATE_SCHEMA.map(e => e.key);
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(keys[0], 'edge');
  assert.equal(keys[keys.length - 1], 'cam');
});

test('serialize → parse round-trips (bools as 0/1, everything else raw)', () => {
  const s = {
    edge: 'beyond', dome: true, clouds: false, beam: true, shadow: false,
    day: 200, time: 21.7, speed: 0.5, px: 3, cam: [1.25, 2, -3.5],
    view: 'ground', model: 'bipolar', routes: true, observers: false,
    aurora: true, audio: false, traffic: true, lights: false, rain: true, constellations: false,
  };
  const q = serializeState(s);
  const back = parseUrlState(q);
  assert.equal(back.edge, 'beyond');
  assert.equal(back.dome, true);
  assert.equal(back.clouds, false);
  assert.equal(back.day, '200');
  assert.equal(back.time, '21.7');
  assert.equal(back.cam, '1.25,2,-3.5');
  assert.equal(back.view, 'ground');
  assert.equal(serializeState(back), q); // stable under a second pass
});

test('parse: ignores unknown keys, treats any non-"0" bool as true, accepts leading ?', () => {
  const st = parseUrlState('?eclipse=1&dome=0&rain=1&lights=yes&bogus=7');
  assert.deepEqual(st, { dome: false, rain: true, lights: true });
});

test('serialize: skips undefined keys', () => {
  assert.equal(serializeState({ day: 5 }), 'day=5');
  assert.equal(serializeState({}), '');
});

test('parseCam: array or "x,y,z"; rejects junk', () => {
  assert.deepEqual(parseCam('1,2,3'), [1, 2, 3]);
  assert.deepEqual(parseCam([4, 5, 6]), [4, 5, 6]);
  assert.equal(parseCam('1,2'), null);
  assert.equal(parseCam('a,b,c'), null);
});
