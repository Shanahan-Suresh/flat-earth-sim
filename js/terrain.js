import * as THREE from 'three';
import { CONSTANTS, latLonToDisc } from './sim.js';
import { LAND_RINGS } from './land-data.js';
import { toonRamp } from './textures.js';

// ── Terrain: real coastlines on the azimuthal-equidistant disc, raised into a
// low-poly diorama. The land mask is the Natural Earth outline projected with
// latLonToDisc (the one projection), so every coast sits where the lore map
// puts it. Heights and colours are seeded and deterministic.

const R = CONSTANTS.DISC_RADIUS;
const MASK = 512;                 // mask / distance-field resolution (px across the disc)
const PX_PER_UNIT = MASK / (2 * R);
const DEG = Math.PI / 180;

// Bipolar model: each hemisphere is its own azimuthal disc around its pole,
// side by side (north left, south right), the way bipolar maps draw it (makeMask).
const BIPOLAR_POLE_X = 3.9;       // units from the centre to each pole
const BIPOLAR_HEMI_R = 3.9;       // units from a pole to its equator

// Inverse of latLonToDisc (monopole): disc point → { lat, lon } in degrees.
export function discToLatLon(x, z) {
  const r = Math.sqrt(x * x + z * z);
  return { lat: 90 - r / R * 180, lon: Math.atan2(x, -z) / DEG };
}

// ── Mask ─────────────────────────────────────────────────────────────────────
// Antarctica's ring closes through the south pole with a single 360° step
// along lat −90. On the disc that step is the rim, so it is walked in 2° steps.
function ringPoints(ring) {
  const pts = [];
  for (let i = 0; i < ring.length; i += 2) {
    const lon = ring[i], lat = ring[i + 1];
    const prev = pts[pts.length - 1];
    if (prev && lat <= -89.9 && prev.lat <= -89.9) {
      const steps = Math.ceil(Math.abs(lon - prev.lon) / 2);
      for (let k = 1; k < steps; k++) pts.push({ lat: -90, lon: prev.lon + (lon - prev.lon) * k / steps });
    }
    pts.push({ lat, lon });
  }
  return pts;
}

function drawLand(ctx, project, clip, keep = () => true) {
  const toPx = p => [MASK / 2 + p.x * PX_PER_UNIT, MASK / 2 + p.z * PX_PER_UNIT];
  ctx.fillStyle = '#fff';
  for (const ring of LAND_RINGS) {
    const pts = ringPoints(ring);
    if (!keep(pts)) continue;
    ctx.save();
    if (clip) clip(ctx);
    ctx.beginPath();
    pts.forEach((q, i) => {
      const [px, py] = toPx(project(q.lat, q.lon));
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.fill('evenodd');   // Antarctica is coast loop + rim loop: even-odd leaves the annulus
    ctx.restore();
  }
}

function makeMask(model) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = MASK;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, MASK, MASK);

  if (model === 'bipolar') {
    // Draw each hemisphere clipped to its own pole disc
    for (const north of [true, false]) {
      const cx = MASK / 2 + (north ? -BIPOLAR_POLE_X : BIPOLAR_POLE_X) * PX_PER_UNIT;
      const proj = (lat, lon) => {
        const r = (90 - (north ? lat : -lat)) / 90 * BIPOLAR_HEMI_R;
        const a = lon * DEG;
        const c = north ? -BIPOLAR_POLE_X : BIPOLAR_POLE_X;
        return { x: c + r * Math.sin(a), z: (north ? -1 : 1) * r * Math.cos(a) };
      };
      drawLand(ctx, proj, c => {
        c.beginPath();
        c.arc(cx, MASK / 2, BIPOLAR_HEMI_R * PX_PER_UNIT, 0, Math.PI * 2);
        c.clip();
      }, pts => pts.some(q => (north ? q.lat >= 0 : q.lat < 0)));
    }
    // Ice rim around the whole plane
    ctx.beginPath();
    ctx.arc(MASK / 2, MASK / 2, MASK / 2, 0, Math.PI * 2);
    ctx.arc(MASK / 2, MASK / 2, (8.9 / R) * MASK / 2, 0, Math.PI * 2, true);
    ctx.fill();
  } else {
    drawLand(ctx, latLonToDisc, null);
  }

  const data = ctx.getImageData(0, 0, MASK, MASK).data;
  const mask = new Uint8Array(MASK * MASK);
  for (let i = 0; i < mask.length; i++) mask[i] = data[i * 4] > 127 ? 1 : 0;
  return mask;
}

// Two-pass chamfer distance (px) from every cell to the nearest cell where mask !== inside.
function chamfer(mask, inside) {
  const N = MASK, INF = 1e9;
  const d = new Float32Array(N * N);
  for (let i = 0; i < d.length; i++) d[i] = mask[i] === inside ? INF : 0;
  const A = 1, B = Math.SQRT2;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x; let v = d[i]; if (v === 0) continue;
    if (x > 0) v = Math.min(v, d[i - 1] + A);
    if (y > 0) {
      v = Math.min(v, d[i - N] + A);
      if (x > 0) v = Math.min(v, d[i - N - 1] + B);
      if (x < N - 1) v = Math.min(v, d[i - N + 1] + B);
    }
    d[i] = v;
  }
  for (let y = N - 1; y >= 0; y--) for (let x = N - 1; x >= 0; x--) {
    const i = y * N + x; let v = d[i]; if (v === 0) continue;
    if (x < N - 1) v = Math.min(v, d[i + 1] + A);
    if (y < N - 1) {
      v = Math.min(v, d[i + N] + A);
      if (x < N - 1) v = Math.min(v, d[i + N + 1] + B);
      if (x > 0) v = Math.min(v, d[i + N - 1] + B);
    }
    d[i] = v;
  }
  return d;
}

// Signed distance in scene units: + inland, − offshore.
function signedField(mask) {
  const inLand = chamfer(mask, 1);
  const inSea = chamfer(mask, 0);
  const f = new Float32Array(MASK * MASK);
  for (let i = 0; i < f.length; i++) f[i] = (mask[i] ? inLand[i] - 0.5 : -(inSea[i] - 0.5)) / PX_PER_UNIT;
  return f;
}

function sampleField(f, x, z) {
  const gx = Math.min(MASK - 1.001, Math.max(0, MASK / 2 + x * PX_PER_UNIT - 0.5));
  const gz = Math.min(MASK - 1.001, Math.max(0, MASK / 2 + z * PX_PER_UNIT - 0.5));
  const x0 = Math.floor(gx), z0 = Math.floor(gz), tx = gx - x0, tz = gz - z0;
  const i = z0 * MASK + x0;
  return (f[i] * (1 - tx) + f[i + 1] * tx) * (1 - tz) + (f[i + MASK] * (1 - tx) + f[i + MASK + 1] * tx) * tz;
}

// ── Noise (hash-based value noise; deterministic, no RNG state) ──────────────
function hash(x, y) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const tx = x - x0, ty = y - y0;
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const a = hash(x0, y0), b = hash(x0 + 1, y0), c = hash(x0, y0 + 1), d = hash(x0 + 1, y0 + 1);
  return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
}
function fbm(x, y, oct = 4) {
  let v = 0, amp = 0.5, f = 1;
  for (let o = 0; o < oct; o++) { v += amp * vnoise(x * f, y * f); f *= 2.03; amp *= 0.5; }
  return v;   // ~0..1
}

const smooth = (a, b, t) => { const u = Math.min(1, Math.max(0, (t - a) / (b - a))); return u * u * (3 - 2 * u); };

// Mountain belts as lat/lon centres (geography for the relief; not lore)
const RANGES = [
  [30, 82, 9, 1.0], [36, 72, 6, 0.8], [33, 95, 7, 0.8],            // Himalaya, Hindu Kush, Tibet
  [48, -115, 7, 0.65], [40, -108, 6, 0.6], [58, -128, 6, 0.5],     // Rockies
  [-3, -78, 4, 0.8], [-17, -69, 5, 0.9], [-33, -70, 4, 0.8], [-45, -72, 4, 0.6],   // Andes
  [46, 9, 3, 0.55], [42, 43, 3, 0.45], [-1, 37, 4, 0.45], [62, 60, 5, 0.3],        // Alps, Caucasus, E. Africa, Urals
  [-30, 149, 4, 0.35], [72, -40, 7, 0.55],                          // Great Dividing Range, Greenland cap
];

function rangeStrength(lat, lon) {
  let s = 0;
  for (const [la, lo, rad, k] of RANGES) {
    let dl = Math.abs(lon - lo); if (dl > 180) dl = 360 - dl;
    const d = Math.sqrt((lat - la) ** 2 + (dl * Math.cos(la * DEG)) ** 2);
    s = Math.max(s, k * (1 - smooth(rad * 0.4, rad, d)));
  }
  return s;
}

// ── Palette ──────────────────────────────────────────────────────────────────
const C = {
  sand:   new THREE.Color('#ead59b'),
  grass:  new THREE.Color('#8acb6a'),
  grass2: new THREE.Color('#72b85c'),
  forest: new THREE.Color('#3f8b4e'),
  dry:    new THREE.Color('#c8b56a'),
  desert: new THREE.Color('#e3c07a'),
  tundra: new THREE.Color('#a8b994'),
  rock:   new THREE.Color('#9b8f86'),
  snow:   new THREE.Color('#f4f7fb'),
  ice:    new THREE.Color('#dcf0fb'),
  shelf:  new THREE.Color('#d9c890'),
  deep:   new THREE.Color('#2a5878'),
  cliff:  new THREE.Color('#6b5444'),
};

function surfaceAt(x, z, field, model) {
  const s = sampleField(field, x, z);            // + inland, − offshore (units)
  const r = Math.sqrt(x * x + z * z);
  const { lat, lon } = model === 'bipolar' ? { lat: 0, lon: 0 } : discToLatLon(x, z);
  const n = fbm(x * 0.9 + 11, z * 0.9 - 7);
  const nFine = fbm(x * 3.1 - 3, z * 3.1 + 5, 3);
  const polarIce = model === 'bipolar' ? r > 8.9 : lat < -62;

  if (s <= 0) {
    // Seabed: shelf near the coast, falling to the deep
    const depth = smooth(0, 1.4, -s);
    const y = -0.035 - 0.2 * depth + (nFine - 0.5) * 0.02;
    const col = C.shelf.clone().lerp(C.deep, smooth(0.05, 0.9, depth));
    return { y, col, land: false, s, biome: 'sea' };
  }

  if (polarIce) {
    const y = 0.05 + smooth(0, 0.4, s) * 0.05 + (nFine - 0.5) * 0.04;
    return { y, col: C.ice.clone().lerp(C.snow, nFine), land: true, s, biome: 'ice' };
  }

  const inland = smooth(0, 0.7, s);
  const hills = (n - 0.35) * 0.16 * smooth(0.15, 1.0, s);
  const mt = model === 'bipolar' ? 0 : rangeStrength(lat, lon);
  const ridge = 1 - Math.abs(fbm(x * 2.2 + 4, z * 2.2 - 9) * 2 - 1);
  const mountain = mt * (0.18 + 0.32 * ridge * ridge) * smooth(0.1, 0.5, s);
  const y = 0.03 + 0.05 * inland + Math.max(0, hills) + mountain;

  // Biome colour
  const absLat = Math.abs(lat);
  let col, biome;
  if (s < 0.07 && y < 0.07) { col = C.sand.clone(); biome = 'beach'; }
  else if (model !== 'bipolar' && absLat > 66 && lat > 0) { col = C.tundra.clone().lerp(C.snow, smooth(70, 80, lat)); biome = 'tundra'; }
  else if (model !== 'bipolar' && absLat > 14 && absLat < 34 && s > 0.25 && n < 0.62) { col = C.desert.clone().lerp(C.dry, smooth(0.45, 0.62, n)); biome = 'desert'; }
  else if (n > 0.55) { col = C.forest.clone(); biome = 'forest'; }
  else { col = (nFine > 0.5 ? C.grass : C.grass2).clone(); biome = 'grass'; }
  if (mountain > 0.06) { col.lerp(C.rock, smooth(0.06, 0.2, mountain)); if (mountain > 0.14) biome = 'mountain'; }
  if (y > 0.3) { col.lerp(C.snow, smooth(0.3, 0.42, y)); biome = 'peak'; }
  return { y, col, land: true, s, biome };
}

// ── Geometry: polar grid, flat-shaded faces, plus a rock skirt to the rim ─────
const RINGS = 120, SEGS = 320, SKIRT_Y = -0.32;

function buildGeometry(field, model) {
  // Vertex lattice
  const pts = [];            // [ring][seg] -> { x, y, z, col }
  for (let i = 0; i <= RINGS; i++) {
    const r = R * i / RINGS;
    const row = [];
    const segs = i === 0 ? 1 : SEGS;
    for (let j = 0; j < segs; j++) {
      const a = (j / SEGS) * Math.PI * 2;
      const x = r * Math.cos(a), z = r * Math.sin(a);
      const sf = surfaceAt(x, z, field, model);
      // Lip at the very rim so the skirt meets cleanly
      const y = i === RINGS ? Math.max(sf.y, 0.02) : sf.y;
      row.push({ x, y, z, col: sf.col });
    }
    pts.push(row);
  }

  const pos = [], col = [];
  const tri = (a, b, c) => {
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    const cr = (a.col.r + b.col.r + c.col.r) / 3, cg = (a.col.g + b.col.g + c.col.g) / 3, cb = (a.col.b + b.col.b + c.col.b) / 3;
    for (let k = 0; k < 3; k++) col.push(cr, cg, cb);
  };
  for (let i = 0; i < RINGS; i++) {
    for (let j = 0; j < SEGS; j++) {
      const j2 = (j + 1) % SEGS;
      if (i === 0) { tri(pts[0][0], pts[1][j2], pts[1][j]); continue; }
      const a = pts[i][j], b = pts[i][j2], c = pts[i + 1][j], d = pts[i + 1][j2];
      tri(a, b, c); tri(b, d, c);
    }
  }
  // Skirt: rim ring down to the underside
  const rim = pts[RINGS];
  for (let j = 0; j < SEGS; j++) {
    const a = rim[j], b = rim[(j + 1) % SEGS];
    const a2 = { x: a.x, y: SKIRT_Y, z: a.z, col: C.cliff }, b2 = { x: b.x, y: SKIRT_Y, z: b.z, col: C.cliff };
    const ac = { ...a, col: C.cliff }, bc = { ...b, col: C.cliff };
    tri(ac, a2, bc); tri(bc, a2, b2);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  return geo;
}

// Offshore distance texture for the water shader: R = 0 at the coast → 1 at 1.5 units out;
// G = 1 on land. Linear filtering gives smooth shore bands.
function makeCoastTexture(field) {
  const data = new Uint8Array(MASK * MASK * 4);
  for (let i = 0; i < MASK * MASK; i++) {
    const s = field[i];
    data[i * 4] = Math.round(255 * Math.min(1, Math.max(0, -s / 1.5)));
    data[i * 4 + 1] = s > 0 ? 255 : 0;
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, MASK, MASK, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

export function buildTerrain(scene) {
  // Banded toon light; the non-indexed geometry already carries face normals
  const material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp() });
  const mesh = new THREE.Mesh(undefined, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);

  const cache = {};
  function build(model) {
    if (!cache[model]) {
      const field = signedField(makeMask(model));
      cache[model] = { geometry: buildGeometry(field, model), coastTex: makeCoastTexture(field), field };
    }
    return cache[model];
  }

  const terrain = {
    mesh,
    material,
    model: 'monopole',
    current: build('monopole'),
    // Height of the ground (land or seabed) at a disc point
    heightAt(x, z) { return surfaceAt(x, z, terrain.current.field, terrain.model).y; },
    surfaceAt(x, z) { return surfaceAt(x, z, terrain.current.field, terrain.model); },
    isLand(x, z) { return sampleField(terrain.current.field, x, z) > 0; },
    setModel(model) {
      terrain.model = model;
      terrain.current = build(model);
      mesh.geometry = terrain.current.geometry;
      if (terrain.onModel) terrain.onModel(terrain.current);
    },
  };
  mesh.geometry = terrain.current.geometry;
  return terrain;
}
