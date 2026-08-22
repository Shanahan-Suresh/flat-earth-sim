// Pure-math tests for js/sim.js. Run with: node --test test/
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CONSTANTS, SimClock,
  findNextFullMoon, findNextSolstice, findNextLunarEclipse, eclipseAlignmentFactor,
  activeShower, frostFactor, latLonToDisc,
  sunPosAt, moonPosAt, shadowObjectPosAt, sunPathRadiusAt, starAngleAt,
} from '../js/sim.js';

// 360 / (360 - 347.81) days = 29.532 days, the synodic month the constants imply
const SYNODIC_HOURS = 24 / (1 - CONSTANTS.MOON_RATE_RATIO);

test('findNextFullMoon: strictly later, spaced one synodic month apart', () => {
  const t0 = 172 * 24 + 12;
  const a = findNextFullMoon(t0);
  const b = findNextFullMoon(a);
  assert.ok(a > t0);
  assert.ok(b > a);
  assert.ok(Math.abs((b - a) - SYNODIC_HOURS) < 0.05, `spacing ${b - a}`);
  assert.ok(Math.abs(SYNODIC_HOURS / 24 - 29.53) < 0.01); // the README's 29.53 days
});

test('findNextFullMoon: at a full moon, jumps to the next one (not the same instant)', () => {
  const a = findNextFullMoon(0);
  const again = findNextFullMoon(a);
  assert.ok(again - a > SYNODIC_HOURS - 0.05);
});

test('findNextSolstice: picks the nearest future solstice and wraps the year', () => {
  const fromDay300 = findNextSolstice(300 * 24);
  assert.equal(fromDay300.label, 'Dec 21');
  assert.equal(fromDay300.simTime, 355 * 24 + 12);

  const fromDay360 = findNextSolstice(360 * 24);
  assert.equal(fromDay360.label, 'Jun 21');
  assert.equal(fromDay360.simTime, 365 * 24 + 172 * 24 + 12);

  // Exactly at a solstice: strictly after, so the next one
  const atJun = findNextSolstice(172 * 24 + 12);
  assert.equal(atJun.label, 'Dec 21');
});

test('activeShower: inclusive span, null outside', () => {
  assert.equal(activeShower(2)?.name, 'The Dome-Menders');
  assert.equal(activeShower(6)?.name, 'The Dome-Menders');
  assert.equal(activeShower(7), null);
  assert.equal(activeShower(364), null);
  assert.equal(activeShower(100), null);
  assert.equal(activeShower(224)?.name, 'The Lanternfall');
  assert.equal(activeShower(227)?.name, 'The Lanternfall');
  assert.equal(activeShower(228), null);
});

test('frostFactor: peaks at the December solstice, vanishes at the June one', () => {
  assert.ok(Math.abs(frostFactor(CONSTANTS.FROST_PEAK_DAY) - 1) < 1e-9);
  assert.ok(frostFactor(172) < 0.01);
});

test('latLonToDisc: the map shares the disc mile scale (tropics under the sun path)', () => {
  const r = (lat) => { const p = latLonToDisc(lat, 37); return Math.hypot(p.x, p.z); };
  const jun = CONSTANTS.SUN_PATH_BASE - CONSTANTS.SUN_PATH_RANGE; // 3.7
  const dec = CONSTANTS.SUN_PATH_BASE + CONSTANTS.SUN_PATH_RANGE; // 6.3
  assert.ok(Math.abs(r(23.44) - jun) < 0.02, `Cancer at ${r(23.44)} units, sun at ${jun}`);
  assert.ok(Math.abs(r(-23.44) - dec) < 0.02, `Capricorn at ${r(-23.44)} units, sun at ${dec}`);
  assert.ok(Math.abs(r(0) - CONSTANTS.SUN_PATH_BASE) < 0.02, `equator at ${r(0)}`);
  assert.ok(Math.abs(r(-90) - CONSTANTS.DISC_RADIUS) < 0.02, `south pole at ${r(-90)}`);
  assert.ok(r(90) < 1e-9);
});

test('latLonToDisc: azimuth convention (lon 0 toward -z, lon 90 toward +x)', () => {
  const p0 = latLonToDisc(0, 0);
  const p90 = latLonToDisc(0, 90);
  assert.ok(Math.abs(p0.x) < 1e-9 && p0.z < 0);
  assert.ok(p90.x > 0 && Math.abs(p90.z) < 1e-9);
});

test('findNextLunarEclipse: finds an alignment the tint function agrees with', () => {
  const T = findNextLunarEclipse(172 * 24 + 12);
  assert.ok(Number.isFinite(T));
  // T is the onset (first instant inside both tolerances); the peak follows within a few sim-hours.
  const clock = new SimClock();
  let peak = 0;
  for (let t = T; t < T + 6; t += 0.05) { clock.simTime = t; peak = Math.max(peak, eclipseAlignmentFactor(clock)); }
  assert.ok(peak > 0.3, `peak factor ${peak}`);
  // Half a synodic month later the moon is new: no eclipse possible
  clock.simTime = T + SYNODIC_HOURS / 2;
  assert.ok(eclipseAlignmentFactor(clock) < 0.05);
});

test('SimClock: day/time getters and sun path radius at the solstices', () => {
  const c = new SimClock();
  assert.equal(c.day, 172);
  assert.equal(c.timeOfDay, 12);
  assert.ok(Math.abs(c.sunPathRadius - 3.7) < 1e-6);
  c.simTime = 355 * 24;
  assert.ok(Math.abs(c.sunPathRadius - 6.3) < 1e-3); // day 355 is 183 days past 172, not exactly half a year
  c.simTime = 79 * 24; // ~equinox
  assert.ok(Math.abs(c.sunPathRadius - 5.0) < 0.05);
});

test('SimClock.monthName / seasonName boundaries', () => {
  assert.equal(SimClock.monthName(0), 'Jan');
  assert.equal(SimClock.monthName(30), 'Jan');
  assert.equal(SimClock.monthName(31), 'Feb');
  assert.equal(SimClock.monthName(364), 'Dec');
  assert.equal(SimClock.seasonName(0), 'Winter');
  assert.equal(SimClock.seasonName(79), 'Spring');
  assert.equal(SimClock.seasonName(172), 'Summer');
  assert.equal(SimClock.seasonName(266), 'Autumn');
  assert.equal(SimClock.seasonName(355), 'Winter');
});

test('pure helpers and SimClock getters agree (finders and scene share one model)', () => {
  const c = new SimClock();
  for (const t of [0, 172 * 24 + 12, 1000.37, 355 * 24 + 3, 9000.5]) {
    c.simTime = t;
    const s = sunPosAt(t), m = moonPosAt(t), sh = shadowObjectPosAt(t), cs = c.shadowObjectPosition();
    assert.ok(Math.abs(s.x - c.sunX) < 1e-12 && Math.abs(s.z - c.sunZ) < 1e-12);
    assert.ok(Math.abs(m.x - c.moonX) < 1e-12 && Math.abs(m.z - c.moonZ) < 1e-12);
    assert.ok(Math.abs(sh.x - cs.x) < 1e-12 && Math.abs(sh.y - cs.y) < 1e-12 && Math.abs(sh.z - cs.z) < 1e-12);
    assert.equal(sunPathRadiusAt(t), c.sunPathRadius);
    assert.equal(starAngleAt(t), c.starAngle);
  }
});
