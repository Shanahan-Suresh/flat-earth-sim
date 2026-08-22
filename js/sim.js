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

  // Day patch radius (scene units): matches the sunBeam cone's base radius in sky.js.
  // Anything inside this planar distance from the sun's ground point is "in daylight" —
  // drives observer-box day/night icons and city-lights extinguishing.
  DAY_PATCH_RADIUS: 2.6,

  // City lights: 13 population centers lit by warm glow once outside the day patch.
  // Observers (KL/LON/NYC) listed first to match the OVERLAYS observer pins.
  CITY_LIGHTS: [
    { name: 'KL', lat: 3.1, lon: 101.7 }, { name: 'LON', lat: 51.5, lon: -0.1 },
    { name: 'NYC', lat: 40.7, lon: -74.0 }, { name: 'Tokyo', lat: 35.7, lon: 139.7 },
    { name: 'Beijing', lat: 39.9, lon: 116.4 }, { name: 'Delhi', lat: 28.6, lon: 77.2 },
    { name: 'Moscow', lat: 55.8, lon: 37.6 }, { name: 'Cairo', lat: 30.0, lon: 31.2 },
    { name: 'Lagos', lat: 6.5, lon: 3.4 }, { name: 'Sao Paulo', lat: -23.6, lon: -46.6 },
    { name: 'Buenos Aires', lat: -34.6, lon: -58.4 }, { name: 'Sydney', lat: -33.9, lon: 151.2 },
    { name: 'Los Angeles', lat: 34.1, lon: -118.2 },
  ],
  // How far past DAY_PATCH_RADIUS (scene units) city lights ramp from off to full glow.
  CITY_LIGHT_RAMP: 0.8,

  // Air traffic: closed-cockpit long-hauls flying the flat map's true routes.
  PLANE_TRIP_HOURS: 14,   // one-way sim-hours for a route leg
  PLANE_ALTITUDE: 0.45,   // scene units above the disc
  // Ship loops: slow ocean circuits, positioned/sized by lore-plausible open water.
  SHIP_LOOPS: [
    { lat: -10, lon: -140, r: 1.1, days: 6 },  // South Pacific
    { lat: -30, lon: -20,  r: 0.9, days: 5 },  // South Atlantic
    { lat: -10, lon:  85,  r: 0.8, days: 4 },  // Indian Ocean
  ],

  // Winter creep: a frost ring that grows toward the ice wall, peaking at the
  // Dec 21 solstice (day 355) and thinning to a sliver by midsummer.
  FROST_PEAK_DAY: 355,
  FROST_INNER_MIN: 6.4,
  FROST_INNER_MAX: 9.5,
  FROST_MAX_OPACITY: 0.5,

  // Shooting stars: spawn only on the night side of the camera view; showers
  // are lore-named calendar events that multiply the base spawn rate.
  METEOR_NIGHT_THRESHOLD: 0.35,
  METEOR_BASE_RATE: 1 / 40,   // per real-second, at dayFactor below threshold
  METEOR_DURATION: 0.9,       // real seconds per streak
  METEOR_SHOWERS: [
    { name: 'The Lanternfall',          day: 224, span: 3, mult: 8 },
    { name: "The Wheelwright's Sparks", day: 349, span: 3, mult: 6 },
    { name: 'The Dome-Menders',         day: 4,   span: 2, mult: 5 },
  ],

  // Constellations: lamps hung on the dome's underside, fixed in the star wheel.
  // Each figure is { name, stars: [[azDeg, polarDeg], ...], segs: [[i,j], ...] }
  // — polarDeg is angle from the dome apex (0 = apex/Polaris, ~85 = near rim).
  CONSTELLATIONS: [
    {
      name: 'The Hub', // rings Polaris — "the one nail that never moves"
      stars: [[0, 8], [60, 7], [120, 9], [180, 8], [240, 7], [300, 9]],
      segs: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0]],
    },
    {
      name: 'The Great Wain', // Big-Dipper-shaped: bowl + curving handle
      stars: [[38, 29], [38, 35], [46, 37], [47, 31], [54, 29], [61, 25], [67, 19]],
      segs: [[0, 1], [1, 2], [2, 3], [3, 0], [3, 4], [4, 5], [5, 6]],
    },
    {
      name: 'The Crown', // Cassiopeia-style W
      stars: [[88, 28], [95, 33], [102, 27], [109, 33], [116, 28]],
      segs: [[0, 1], [1, 2], [2, 3], [3, 4]],
    },
    {
      name: 'The Wanderer', // Orion-like hourglass with a 3-star belt
      stars: [[128, 45], [142, 46], [132, 55], [135, 56], [138, 57], [129, 66], [141, 65]],
      segs: [[0, 2], [2, 3], [3, 4], [4, 1], [2, 5], [4, 6]],
    },
    {
      name: 'The Four Lamps', // Crux-like kite/cross near the rim
      stars: [[180, 74], [180, 84], [175, 79], [185, 79]],
      segs: [[0, 1], [2, 3]],
    },
    {
      name: 'The Serpent', // winding S-curve
      stars: [[200, 48], [210, 54], [218, 62], [214, 70], [204, 74], [196, 68]],
      segs: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5]],
    },
    {
      name: 'The Twin Lights', // two close pairs
      stars: [[260, 38], [263, 40], [275, 39], [278, 41]],
      segs: [[0, 1], [2, 3]],
    },
    {
      name: 'The Swan', // Cygnus-like cross
      stars: [[315, 45], [315, 38], [315, 53], [308, 45], [322, 45]],
      segs: [[0, 1], [0, 2], [0, 3], [0, 4]],
    },
  ],

  // Drifting rain cells (world.js) + patter proximity audio (audio.js)
  RAIN: {
    CELLS: 2, ALT: 1.5, DRIFT: 0.10, JITTER: 0.35, MAX_R: 8.3,
    STREAKS: 90, STREAK_LEN: 0.18, FALL: 1.4, AUDIO_RADIUS: 4.0,
  },
};

// ── Pure position helpers (t = simTime in sim-hours) ─────────────────────────
// SimClock getters, the almanac finders and the eclipse tint all call these,
// so the rendered sky and the forward scans can never drift apart.
const DEG = Math.PI / 180;
const TWO_PI = Math.PI * 2;

export function dayAt(t) { return Math.floor(t / 24) % 365; }
export function timeOfDayAt(t) { return t % 24; }

// Solar declination in radians: +23.44° on day 172 (Jun 21), -23.44° on day ~355.
export function solarDeclinationAt(t) {
  return CONSTANTS.SUN_DECLINATION_AMP * DEG * Math.cos(TWO_PI * (dayAt(t) - 172) / 365);
}

// Sun path radius (units): 3.7 at the June solstice (Cancer), 6.3 in December (Capricorn).
export function sunPathRadiusAt(t) {
  const norm = solarDeclinationAt(t) / (CONSTANTS.SUN_DECLINATION_AMP * DEG); // -1..1
  return CONSTANTS.SUN_PATH_BASE - norm * CONSTANTS.SUN_PATH_RANGE;
}

// Sun angle (radians, clockwise from +X when viewed from above; use -angle for sin/cos)
export function sunAngleAt(t) { return (timeOfDayAt(t) / 24) * TWO_PI; }

export function sunPosAt(t) {
  const r = sunPathRadiusAt(t), a = sunAngleAt(t);
  return { x: r * Math.cos(-a), y: CONSTANTS.SUN_ALTITUDE, z: r * Math.sin(-a) };
}

export function moonAngleAt(t) { return ((t * CONSTANTS.MOON_RATE_RATIO) / 24) * TWO_PI; }

export function moonPathRadiusAt(t) {
  return CONSTANTS.SUN_PATH_BASE
    - CONSTANTS.SUN_PATH_RANGE
      * Math.cos(TWO_PI * (dayAt(t) - 172) / 365 + CONSTANTS.MOON_PATH_PHASE_OFFSET);
}

export function moonPosAt(t) {
  const r = moonPathRadiusAt(t), a = moonAngleAt(t);
  return { x: r * Math.cos(-a), y: CONSTANTS.MOON_ALTITUDE, z: r * Math.sin(-a) };
}

// Star wheel rotation (radians); sidereal day, so it gains on the sun.
export function starAngleAt(t) { return (t / CONSTANTS.SIDEREAL_DAY) * TWO_PI; }

// Shadow Object: orbits the sun's position with a 5× vertical bob (inclination).
export function shadowObjectPosAt(t) {
  const a = (t / 24 / CONSTANTS.SHADOW_OBJECT_PERIOD) * TWO_PI;
  const bob = Math.sin(a * 5) * 0.3;
  const s = sunPosAt(t);
  return {
    x: s.x + CONSTANTS.SHADOW_OBJECT_ORBIT_RADIUS * Math.cos(a),
    y: CONSTANTS.SUN_ALTITUDE + bob,
    z: s.z + CONSTANTS.SHADOW_OBJECT_ORBIT_RADIUS * Math.sin(a),
  };
}

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

  get day() { return dayAt(this.simTime); }
  get timeOfDay() { return timeOfDayAt(this.simTime); }
  get solarDeclination() { return solarDeclinationAt(this.simTime); }
  get sunPathRadius() { return sunPathRadiusAt(this.simTime); }
  get sunAngle() { return sunAngleAt(this.simTime); }
  get sunX() { return sunPosAt(this.simTime).x; }
  get sunZ() { return sunPosAt(this.simTime).z; }
  get moonAngle() { return moonAngleAt(this.simTime); }
  get moonPathRadius() { return moonPathRadiusAt(this.simTime); }
  get moonX() { return moonPosAt(this.simTime).x; }
  get moonZ() { return moonPosAt(this.simTime).z; }

  // Phase angle: 0 = new, π = full
  get moonPhase() { return this.sunAngle - this.moonAngle; }

  get starAngle() { return starAngleAt(this.simTime); }

  shadowObjectPosition() { return shadowObjectPosAt(this.simTime); }

  // Sun ground speed in mph (circumference of current circle / 24h); 1 unit = 1245 mi
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
  return ((a % TWO_PI) + TWO_PI) % TWO_PI;
}

function _pointToSegmentDist(p, a, b) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const apx = p.x - a.x, apy = p.y - a.y, apz = p.z - a.z;
  const ab2 = abx * abx + aby * aby + abz * abz;
  if (ab2 === 0) return Math.sqrt(apx * apx + apy * apy + apz * apz);
  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby + apz * abz) / ab2));
  const dx = p.x - (a.x + t * abx), dy = p.y - (a.y + t * aby), dz = p.z - (a.z + t * abz);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function _smoothstep(x) {
  x = Math.max(0, Math.min(1, x));
  return x * x * (3 - 2 * x);
}

// Full-moon angular error (rad) and Shadow-Object distance from the sun-moon
// segment (units) at simTime t. Shared by the finder and the tint ramp.
function _eclipseGeometryAt(t) {
  const phaseDiff = _normalizeAngle(sunAngleAt(t) - moonAngleAt(t));
  const fmErr = Math.abs(phaseDiff - Math.PI);
  if (fmErr >= CONSTANTS.FULL_MOON_TOL) return { fmErr, dist: Infinity };
  const dist = _pointToSegmentDist(shadowObjectPosAt(t), sunPosAt(t), moonPosAt(t));
  return { fmErr, dist };
}

// Next simTime at which the Shadow Object sits on the sun-moon segment during a
// full moon — the eclipse ONSET (peak follows within a few sim-hours). Scans
// forward in 0.05 h steps; returns null if none within 400 sim-days.
export function findNextLunarEclipse(fromSimTime) {
  const step = 0.05;
  const cap = fromSimTime + 400 * 24;
  for (let t = fromSimTime + 0.5; t < cap; t += step) {
    if (_eclipseGeometryAt(t).dist < CONSTANTS.ECLIPSE_ALIGN_TOL) return t;
  }
  return null;
}

// Continuous eclipse alignment factor (0..1): 1 = dead-center eclipse, 0 = no eclipse.
// Product of smoothstep on full-moon angular error and shadow-object segment distance.
// Drives the blood-moon tint ramp regardless of whether shadowObject is visible.
export function eclipseAlignmentFactor(clock) {
  const { fmErr, dist } = _eclipseGeometryAt(clock.simTime);
  const fmFactor  = 1 - _smoothstep(fmErr / CONSTANTS.FULL_MOON_TOL);
  const segFactor = 1 - _smoothstep(dist  / CONSTANTS.ECLIPSE_ALIGN_TOL);
  return fmFactor * segFactor;
}

// ── Almanac finders (Phase A plumbing for the sky almanac) ────────────────────

// Next full moon: sun-moon phase separation (sim.moonPhase, unwrapped) grows
// linearly with simTime at a rate derived from MOON_RATE_RATIO, exactly as
// SimClock.sunAngle/moonAngle compute it. Full moon = separation of π (mod 2π).
// Analytic — no scanning. Returns the smallest simTime strictly greater than
// fromSimTime + 0.01.
export function findNextFullMoon(fromSimTime) {
  // d(sunAngle)/dt = (2π/24) rad/h; d(moonAngle)/dt = (2π/24)·MOON_RATE_RATIO rad/h.
  // phase(t) = sunAngle(t) - moonAngle(t) grows at omega = (2π/24)(1 - MOON_RATE_RATIO).
  const omega = (2 * Math.PI / 24) * (1 - CONSTANTS.MOON_RATE_RATIO);
  const synodicPeriod = (2 * Math.PI) / omega; // ≈ 29.53 days in hours

  const currentPhase = _normalizeAngle(omega * fromSimTime);
  let deltaT = _normalizeAngle(Math.PI - currentPhase) / omega;
  if (deltaT < 0.01) deltaT += synodicPeriod; // already (almost) full — jump to the next one
  return fromSimTime + deltaT;
}

// Next solstice: day 172 noon ('Jun 21') or day 355 noon ('Dec 21'), whichever
// comes first strictly after fromSimTime (wraps into the next year as needed).
export function findNextSolstice(fromSimTime) {
  const YEAR = 365 * 24;
  const candidates = [
    { base: 172 * 24 + 12, label: 'Jun 21' },
    { base: 355 * 24 + 12, label: 'Dec 21' },
  ];
  let best = null;
  for (let k = -1; k <= 2; k++) {
    for (const { base, label } of candidates) {
      const t = base + k * YEAR;
      if (t > fromSimTime && (best === null || t < best.simTime)) {
        best = { simTime: t, label };
      }
    }
  }
  return best;
}

// Active meteor shower for a given day-of-year, wrap-aware (distance modulo 365).
export function activeShower(day) {
  for (const shower of CONSTANTS.METEOR_SHOWERS) {
    const raw = Math.abs(day - shower.day);
    const dist = Math.min(raw, 365 - raw);
    if (dist <= shower.span) return shower;
  }
  return null;
}

// Winter creep factor (0..1): 1 at FROST_PEAK_DAY (Dec 21), 0 at the opposite
// solstice. Drives the frost ring's inner radius and opacity.
export function frostFactor(day) {
  return (1 + Math.cos(2 * Math.PI * (day - CONSTANTS.FROST_PEAK_DAY) / 365)) / 2;
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
