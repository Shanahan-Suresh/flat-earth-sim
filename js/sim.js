// sim.js — pure math/constants module; no Three.js imports

// Scale: 1 unit = 1,245 miles
export const CONSTANTS = {
  // Scale: 1 unit = 1,245 miles
  DISC_RADIUS: 10,          // 12,450 mi
  DISC_HEIGHT: 0.3,
  ICE_WALL_RADIUS: 9.9,
  ICE_WALL_HEIGHT_MIN: 0.15,
  ICE_WALL_HEIGHT_MAX: 0.35,
  ICE_WALL_COUNT: 90,

  DOME_RADIUS: 10.4,
  DOME_Y_SCALE: 0.32,       // flattened; apex ~3.3 units (~4,100 mi)

  STAR_COUNT: 800,
  STAR_RADIUS: 10.2,        // just inside dome
  STAR_Y_SCALE: 0.32,

  // Sun: lore 32 mi diameter at ~3,000 mi altitude; upscaled ~13× for visibility
  SUN_RADIUS: 0.35,
  SUN_ALTITUDE: 2.4,
  SUN_PATH_BASE: 5.0,       // equinox path radius (units)
  SUN_PATH_RANGE: 1.3,      // swing Jun21: 3.7, Dec21: 6.3
  SUN_DECLINATION_AMP: 23.44, // degrees

  // Moon: lore 32 mi diameter; self-luminous cold light
  MOON_RADIUS: 0.32,
  MOON_ALTITUDE: 2.4,
  MOON_PATH_PHASE_OFFSET: 0.4, // radians

  // Moon angular rate: 347.81 deg/day → synodic month 29.53 days
  MOON_RATE_RATIO: 347.81 / 360.0,

  // Star wheel: sidereal day 23.93 h
  SIDEREAL_DAY: 23.93,

  // Shadow Object
  SHADOW_OBJECT_RADIUS: 0.3,
  SHADOW_OBJECT_ORBIT_RADIUS: 1.2,
  SHADOW_OBJECT_PERIOD: 20,    // sim-days

  // Simulation speed
  DEFAULT_SIM_SPEED: 24 / 12,  // 1 sim-day per 12 real seconds = 2 sim-hours/real-second

  // Planet epicycles (Tychonic: orbit point follows sun)
  PLANETS: [
    { name: 'Venus',   color: 0xFFDD88, size: 0.09, orbitRadius: 0.55, period: 1.6  },
    { name: 'Mars',    color: 0xFF5533, size: 0.08, orbitRadius: 0.80, period: 2.8  },
    { name: 'Jupiter', color: 0xDDCCAA, size: 0.12, orbitRadius: 1.05, period: 4.5  },
  ],

  // Eclipse detection tolerances
  // Full-moon angular error (rad): sun-moon opposition must be within this of π.
  // Relative angular speed ~0.0089 rad/h; 0.15 rad gives a ~17 sim-hour full-moon window
  // centered on opposition — wide enough to overlap the Shadow Object's ~3 sim-hour
  // close-approach window and give a strong visual peak (ef ≈ 0.97 at center).
  FULL_MOON_TOL: 0.15,
  // Shadow Object point-to-segment distance (scene units) from sun-moon line segment.
  // At 0.6 units the tint window is ~3 sim-hours and peak color is deep red (#ff4a39).
  // Eclipse cadence ~20-30 sim-days — reliable finder within 400 days from any start.
  ECLIPSE_ALIGN_TOL: 0.6,
};

export class SimClock {
  constructor() {
    this.simTime = 172 * 24 + 12; // start: Jun 21 noon
    this.speed = CONSTANTS.DEFAULT_SIM_SPEED; // sim-hours per real-second
    this.paused = false;
  }

  tick(dtReal) {
    // dtReal in seconds
    if (!this.paused) this.simTime += dtReal * this.speed;
  }

  get day() { return Math.floor(this.simTime / 24) % 365; }
  get timeOfDay() { return this.simTime % 24; }

  // Solar declination in radians
  get solarDeclination() {
    return (CONSTANTS.SUN_DECLINATION_AMP * Math.PI / 180)
      * Math.cos(2 * Math.PI * (this.day - 172) / 365);
  }

  // Sun path radius (units on disc)
  get sunPathRadius() {
    const dec = this.solarDeclination;
    const normDec = dec / (CONSTANTS.SUN_DECLINATION_AMP * Math.PI / 180); // -1..1
    return CONSTANTS.SUN_PATH_BASE - normDec * CONSTANTS.SUN_PATH_RANGE;
  }

  // Sun angle (radians, clockwise from +X when viewed from above → use -theta for sin)
  get sunAngle() {
    return (this.timeOfDay / 24) * 2 * Math.PI;
  }

  get sunX() { return this.sunPathRadius * Math.cos(-this.sunAngle); }
  get sunZ() { return this.sunPathRadius * Math.sin(-this.sunAngle); }

  // Moon angular rate relative to sun
  get moonAngle() {
    const moonTime = this.simTime * CONSTANTS.MOON_RATE_RATIO;
    return (moonTime / 24) * 2 * Math.PI;
  }

  get moonPathRadius() {
    return CONSTANTS.SUN_PATH_BASE
      - CONSTANTS.SUN_PATH_RANGE
        * Math.cos(2 * Math.PI * (this.day - 172) / 365 + CONSTANTS.MOON_PATH_PHASE_OFFSET);
  }

  get moonX() { return this.moonPathRadius * Math.cos(-this.moonAngle); }
  get moonZ() { return this.moonPathRadius * Math.sin(-this.moonAngle); }

  // Phase angle: 0 = new, π = full
  get moonPhase() {
    return this.sunAngle - this.moonAngle; // Δ
  }

  // Star wheel rotation angle (radians)
  get starAngle() {
    return (this.simTime / CONSTANTS.SIDEREAL_DAY) * 2 * Math.PI;
  }

  // Shadow object (orbits sun)
  shadowObjectPosition(sunX, sunZ) {
    const a = (this.simTime / 24 / CONSTANTS.SHADOW_OBJECT_PERIOD) * 2 * Math.PI;
    const bob = Math.sin(a * 5) * 0.3; // vertical bobbing (inclination)
    return {
      x: sunX + CONSTANTS.SHADOW_OBJECT_ORBIT_RADIUS * Math.cos(a),
      y: CONSTANTS.SUN_ALTITUDE + bob,
      z: sunZ + CONSTANTS.SHADOW_OBJECT_ORBIT_RADIUS * Math.sin(a),
    };
  }

  // Sun ground speed in mph (circumference of current circle / 24h)
  // 1 unit = 1245 miles
  get sunSpeedMph() {
    return (2 * Math.PI * this.sunPathRadius * 1245) / 24;
  }

  // Approximate month name from day of year
  static monthName(day) {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const days = [0,31,59,90,120,151,181,212,243,273,304,334,365];
    for (let i = 0; i < 12; i++) {
      if (day < days[i+1]) return months[i];
    }
    return 'Dec';
  }

  static seasonName(day) {
    if (day < 79 || day >= 355) return 'Winter';
    if (day < 172) return 'Spring';
    if (day < 266) return 'Summer';
    return 'Autumn';
  }
}

// ── Eclipse math ──────────────────────────────────────────────────────────────

function _normalizeAngle(a) {
  const TWO_PI = Math.PI * 2;
  return ((a % TWO_PI) + TWO_PI) % TWO_PI;
}

function _pointToSegmentDist(px, py, pz, ax, ay, az, bx, by, bz) {
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const ab2 = abx * abx + aby * aby + abz * abz;
  if (ab2 === 0) return Math.sqrt(apx * apx + apy * apy + apz * apz);
  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby + apz * abz) / ab2));
  const cx = ax + t * abx, cy = ay + t * aby, cz = az + t * abz;
  const dx = px - cx, dy = py - cy, dz = pz - cz;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// Scratch-step a temporary clock computation (no real SimClock mutation) to find the
// next simTime when the Shadow Object aligns on the sun-moon segment during a full moon.
// Returns simTime (number) or null if none found within 400 sim-days.
export function findNextLunarEclipse(fromSimTime) {
  const step = 0.05;
  const cap = fromSimTime + 400 * 24;

  // Inline the same math as SimClock getters, without constructing a real clock.
  function sunAngleAt(t) { return ((t % 24) / 24) * 2 * Math.PI; }
  function moonAngleAt(t) { return ((t * CONSTANTS.MOON_RATE_RATIO) / 24) * 2 * Math.PI; }
  function dayAt(t) { return Math.floor(t / 24) % 365; }
  function sunPathRadiusAt(t) {
    const d = dayAt(t);
    const dec = (CONSTANTS.SUN_DECLINATION_AMP * Math.PI / 180) * Math.cos(2 * Math.PI * (d - 172) / 365);
    const normDec = dec / (CONSTANTS.SUN_DECLINATION_AMP * Math.PI / 180);
    return CONSTANTS.SUN_PATH_BASE - normDec * CONSTANTS.SUN_PATH_RANGE;
  }
  function moonPathRadiusAt(t) {
    const d = dayAt(t);
    return CONSTANTS.SUN_PATH_BASE
      - CONSTANTS.SUN_PATH_RANGE * Math.cos(2 * Math.PI * (d - 172) / 365 + CONSTANTS.MOON_PATH_PHASE_OFFSET);
  }

  for (let t = fromSimTime + 0.5; t < cap; t += step) {
    const sa = sunAngleAt(t);
    const ma = moonAngleAt(t);
    const phaseDiff = _normalizeAngle(sa - ma);
    if (Math.abs(phaseDiff - Math.PI) >= CONSTANTS.FULL_MOON_TOL) continue;

    const r = sunPathRadiusAt(t);
    const sx = r * Math.cos(-sa), sz = r * Math.sin(-sa);
    const sy = CONSTANTS.SUN_ALTITUDE;

    const mr = moonPathRadiusAt(t);
    const mx = mr * Math.cos(-ma), mz = mr * Math.sin(-ma);
    const my = CONSTANTS.MOON_ALTITUDE;

    const a = (t / 24 / CONSTANTS.SHADOW_OBJECT_PERIOD) * 2 * Math.PI;
    const bob = Math.sin(a * 5) * 0.3;
    const spx = sx + CONSTANTS.SHADOW_OBJECT_ORBIT_RADIUS * Math.cos(a);
    const spy = CONSTANTS.SUN_ALTITUDE + bob;
    const spz = sz + CONSTANTS.SHADOW_OBJECT_ORBIT_RADIUS * Math.sin(a);

    const dist = _pointToSegmentDist(spx, spy, spz, sx, sy, sz, mx, my, mz);
    if (dist < CONSTANTS.ECLIPSE_ALIGN_TOL) return t;
  }
  return null;
}

// Continuous eclipse alignment factor (0..1): 1 = dead-center eclipse, 0 = no eclipse.
// Product of smoothstep on full-moon angular error and shadow-object segment distance.
// Drives the blood-moon tint ramp regardless of whether shadowObject is visible.
export function eclipseAlignmentFactor(clock) {
  const sa = clock.sunAngle;
  const ma = clock.moonAngle;
  const phaseDiff = _normalizeAngle(sa - ma);
  const fmErr = Math.abs(phaseDiff - Math.PI);

  const sx = clock.sunX, sz = clock.sunZ, sy = CONSTANTS.SUN_ALTITUDE;
  const mx = clock.moonX, mz = clock.moonZ, my = CONSTANTS.MOON_ALTITUDE;
  const sp = clock.shadowObjectPosition(sx, sz);
  const dist = _pointToSegmentDist(sp.x, sp.y, sp.z, sx, sy, sz, mx, my, mz);

  function smoothstep(x) {
    x = Math.max(0, Math.min(1, x));
    return x * x * (3 - 2 * x);
  }

  const fmFactor  = 1 - smoothstep(fmErr / CONSTANTS.FULL_MOON_TOL);
  const segFactor = 1 - smoothstep(dist  / CONSTANTS.ECLIPSE_ALIGN_TOL);
  return fmFactor * segFactor;
}

export function latLonToDisc(lat, lon) {
  // Azimuthal equidistant, matching makeWorldMapTexture's latLonToPixel:
  // north pole (lat 90) at disc center, south pole (lat -90) at the inner
  // ice-ring edge (220px on the 512px canvas). Canvas 256px half-width maps
  // to the 10-unit disc radius, so scale = 10/256 world units per pixel.
  const radius_px = (90 - lat) / 180 * 220;
  const lonRad = lon * Math.PI / 180;
  const scale = 10 / 256; // world units per canvas pixel
  return {
    x: radius_px * Math.sin(lonRad) * scale,
    z: -(radius_px * Math.cos(lonRad) * scale),
  };
}
