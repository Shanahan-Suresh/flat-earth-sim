import * as THREE from 'three';
import { CONSTANTS, latLonToDisc } from './sim.js';
import { makeRng } from './rng.js';
import { toonRamp } from './textures.js';
import { patchSurface } from './surface.js';

// ── World dressing: ice wall, forests, towns, lighthouses, penguins, and the
// floating-rock underside. Everything is instanced and seeded (own RNG streams,
// so adding dressing never reshuffles the lore objects built from buildRandom).
// Trees, towns' houses, lighthouses, penguins and the rock underside are
// decoration (flavour), not doctrine.

const R = CONSTANTS.DISC_RADIUS;
const DAY_R = CONSTANTS.DAY_PATCH_RADIUS;

const toon = (params = {}) => new THREE.MeshToonMaterial({ gradientMap: toonRamp(), ...params });

// Vertex colours from a list of [y, color] stops (geometry-local y)
function paintByHeight(geo, stops) {
  const pos = geo.attributes.position;
  const cols = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    let k = 0;
    while (k < stops.length - 2 && y > stops[k + 1][0]) k++;
    const [y0, c0] = stops[k], [y1, c1] = stops[k + 1];
    const t = Math.min(1, Math.max(0, (y - y0) / (y1 - y0)));
    c.copy(c0).lerp(c1, t);
    cols.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return geo;
}

function solidColor(geo, color) {
  const n = geo.attributes.position.count;
  const cols = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) cols.set([color.r, color.g, color.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return geo;
}

// Merge non-indexed copies of geometries that all carry position/normal/color
function merge(geos) {
  const parts = geos.map(g => (g.index ? g.toNonIndexed() : g));
  const total = parts.reduce((n, g) => n + g.attributes.position.count, 0);
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3);
  let o = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    col.set(g.attributes.color.array, o * 3);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
function place(mesh, i, x, y, z, rotY, sx, sy = sx, sz = sx, tiltX = 0, tiltZ = 0) {
  _q.setFromEuler(_e.set(tiltX, rotY, tiltZ));
  mesh.setMatrixAt(i, _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz)));
}

// ── Ice wall: a ring of crystal shards, blue at the root, snow-white at the tip ──
export function buildIceWall(scene, terrain) {
  const rng = makeRng(9001);
  const geo = new THREE.ConeGeometry(0.1, 1, 5, 2);
  geo.translate(0, 0.5, 0);
  paintByHeight(geo, [[0, new THREE.Color('#6fb6dc')], [0.55, new THREE.Color('#bfe6f7')], [1, new THREE.Color('#ffffff')]]);
  const mat = toon({ vertexColors: true, emissive: 0x2a5a78, emissiveIntensity: 0.45 });

  const N = Math.round(CONSTANTS.ICE_WALL_COUNT * 3.4);
  const mesh = new THREE.InstancedMesh(geo, mat, N);
  const { ICE_WALL_HEIGHT_MIN: hMin, ICE_WALL_HEIGHT_MAX: hMax } = CONSTANTS;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + (rng() - 0.5) * 0.02;
    const r = CONSTANTS.ICE_WALL_RADIUS - 0.1 + rng() * 0.16;
    const x = r * Math.cos(a), z = r * Math.sin(a);
    const spire = rng() < 0.12;
    const h = (hMin + rng() * (hMax - hMin)) * (spire ? 1.7 : 1);
    place(mesh, i, x, terrain.heightAt(x, z) - 0.03, z, rng() * Math.PI * 2,
      0.8 + rng() * 0.7, h, 0.8 + rng() * 0.7, (rng() - 0.5) * 0.3, (rng() - 0.5) * 0.3);
  }
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

// ── Forests: pines and round trees by biome ─────────────────────────────────
const TREE_DENSITY = { forest: 0.6, grass: 0.07, tundra: 0.1, mountain: 0.08 };

export function buildForests(scene, terrain, avoid = []) {
  const rng = makeRng(4242);
  const trunkGeo = solidColor(new THREE.CylinderGeometry(0.012, 0.017, 0.07, 5).translate(0, 0.035, 0), new THREE.Color('#6b4a32'));
  const pineGeo = merge([
    solidColor(new THREE.ConeGeometry(0.075, 0.13, 6).translate(0, 0.11, 0), new THREE.Color('#ffffff')),
    solidColor(new THREE.ConeGeometry(0.055, 0.1, 6).translate(0, 0.18, 0), new THREE.Color('#ffffff')),
  ]);
  const roundGeo = solidColor(new THREE.IcosahedronGeometry(0.075, 0).scale(1, 0.85, 1).translate(0, 0.13, 0), new THREE.Color('#ffffff'));

  const spots = [];
  for (let k = 0; k < 14000 && spots.length < 2600; k++) {
    const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * 9.2;
    const x = r * Math.cos(a), z = r * Math.sin(a);
    const s = terrain.surfaceAt(x, z);
    const p = TREE_DENSITY[s.biome] || 0;
    if (rng() > p) continue;
    if (avoid.some(c => (c.x - x) ** 2 + (c.z - z) ** 2 < (c.r || 0.25) ** 2)) continue;
    const pine = s.biome === 'tundra' || s.biome === 'mountain' || (s.biome === 'forest' && rng() < 0.45);
    spots.push({ x, z, y: s.y, pine, scale: 1.15 + rng() * 0.6, rot: rng() * Math.PI * 2, tint: rng() });
  }

  const pines = spots.filter(t => t.pine), rounds = spots.filter(t => !t.pine);
  const mat = toon({ vertexColors: true });
  const trunks = new THREE.InstancedMesh(trunkGeo, mat, spots.length);
  const pineMesh = new THREE.InstancedMesh(pineGeo, mat, pines.length);
  const roundMesh = new THREE.InstancedMesh(roundGeo, mat, rounds.length);

  const pineCols = ['#2c6a44', '#357a4a', '#2f7350'].map(c => new THREE.Color(c));
  const roundCols = ['#5aa64f', '#6fb456', '#83c25e', '#4d9a4a'].map(c => new THREE.Color(c));
  const autumn = ['#d9a441', '#d07a3a', '#e3c25a'].map(c => new THREE.Color(c));

  spots.forEach((t, i) => place(trunks, i, t.x, t.y - 0.01, t.z, t.rot, t.scale));
  pines.forEach((t, i) => {
    place(pineMesh, i, t.x, t.y - 0.01, t.z, t.rot, t.scale);
    pineMesh.setColorAt(i, pineCols[Math.floor(t.tint * pineCols.length)]);
  });
  rounds.forEach((t, i) => {
    place(roundMesh, i, t.x, t.y - 0.01, t.z, t.rot, t.scale);
    roundMesh.setColorAt(i, t.tint > 0.93 ? autumn[Math.floor((t.tint - 0.93) / 0.07 * autumn.length) % autumn.length]
      : roundCols[Math.floor(t.tint / 0.93 * roundCols.length) % roundCols.length]);
  });

  const group = new THREE.Group();
  for (const m of [trunks, pineMesh, roundMesh]) {
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }
  scene.add(group);
  group.userData.spots = spots;   // tree positions, for the fireflies (life.js)
  return group;
}

// ── Towns: a cluster of little houses at every city; windows glow at night ──
export function buildTowns(scene, terrain) {
  const rng = makeRng(777);
  const wallGeo = new THREE.BoxGeometry(0.06, 0.05, 0.07).translate(0, 0.025, 0);
  const roofGeo = new THREE.ConeGeometry(0.058, 0.04, 4).rotateY(Math.PI / 4).scale(1, 1, 1.15).translate(0, 0.07, 0);

  const houses = [];
  const centres = [];
  for (const city of CONSTANTS.CITY_LIGHTS) {
    const c = latLonToDisc(city.lat, city.lon);
    centres.push(c);
    const n = 7 + Math.floor(rng() * 5);
    for (let k = 0, tries = 0; k < n && tries < 60; tries++) {
      const a = rng() * Math.PI * 2, r = 0.04 + Math.sqrt(rng()) * 0.2;
      const x = c.x + r * Math.cos(a), z = c.z + r * Math.sin(a);
      const s = terrain.surfaceAt(x, z);
      if (!s.land || s.biome === 'ice') continue;
      houses.push({ x, z, y: s.y, rot: rng() * Math.PI, scale: 0.85 + rng() * 0.5, tall: rng() < 0.25 ? 1.6 : 1, roof: rng() });
      k++;
    }
  }

  const wallMat = patchSurface(toon({ color: 0xf2e6cc }), {
    fragEmissive: `
{
  float dSun = length(vWPos.xz - uSunXZ);
  float night = smoothstep(${DAY_R.toFixed(2)}, ${(DAY_R + CONSTANTS.CITY_LIGHT_RAMP).toFixed(2)}, dSun);
  float win = step(0.5, fract(vWPos.y * 55.0 + 0.2)) * step(0.45, fract((vWPos.x + vWPos.z) * 48.0));
  totalEmissiveRadiance += vec3(2.2, 1.35, 0.55) * win * night;
}
`,
  });
  const roofMat = toon({ color: 0xffffff });
  const walls = new THREE.InstancedMesh(wallGeo, wallMat, houses.length);
  const roofs = new THREE.InstancedMesh(roofGeo, roofMat, houses.length);
  const roofCols = ['#c8553d', '#d9813c', '#3f7f8c', '#8a4f7d', '#b84a4a'].map(c => new THREE.Color(c));
  houses.forEach((h, i) => {
    place(walls, i, h.x, h.y - 0.005, h.z, h.rot, h.scale, h.scale * h.tall, h.scale);
    // Roof sits on the wall top: shift by the extra wall height
    _q.setFromEuler(_e.set(0, h.rot, 0));
    roofs.setMatrixAt(i, _m.compose(_p.set(h.x, h.y - 0.005 + 0.05 * h.scale * (h.tall - 1), h.z), _q, _s.set(h.scale, h.scale, h.scale)));
    roofs.setColorAt(i, roofCols[Math.floor(h.roof * roofCols.length)]);
  });
  const group = new THREE.Group();
  for (const m of [walls, roofs]) { m.castShadow = true; m.receiveShadow = true; group.add(m); }
  scene.add(group);
  return { group, centres };
}

// ── Lighthouses on a few capes; beams sweep when the sun is away (flavour) ──
const CAPES = [[-34.8, 20.0], [-55.9, -67.3], [50.1, -5.7], [44.5, -63.6], [-43.6, 146.9], [43.0, 145.0], [8.1, 77.5]];

export function buildLighthouses(scene, terrain) {
  const towerGeo = new THREE.CylinderGeometry(0.016, 0.026, 0.2, 8, 6).translate(0, 0.1, 0);
  const pos = towerGeo.attributes.position;
  const cols = new Float32Array(pos.count * 3);
  const red = new THREE.Color('#c8413a'), white = new THREE.Color('#f6f1e6');
  for (let i = 0; i < pos.count; i++) {
    const band = Math.floor(pos.getY(i) / 0.2 * 6 - 0.001);
    const c = band % 2 ? red : white;
    cols.set([c.r, c.g, c.b], i * 3);
  }
  towerGeo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const towerMat = toon({ vertexColors: true });
  const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.6, 1.2) });
  const beamGeo = new THREE.ConeGeometry(0.16, 1.4, 12, 1, true).translate(0, -0.7, 0).rotateZ(Math.PI / 2);
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xfff0b0, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });

  const items = [];
  for (const [lat, lon] of CAPES) {
    // Walk inland from the projected cape to the first land just behind the shore
    const p = latLonToDisc(lat, lon);
    let best = null;
    for (let k = 0; k < 80 && !best; k++) {
      const a = k * 2.399, r = 0.02 * Math.sqrt(k);
      const x = p.x + r * Math.cos(a), z = p.z + r * Math.sin(a);
      const s = terrain.surfaceAt(x, z);
      if (s.land && s.biome !== 'ice' && s.s < 0.25) best = { x, z, y: s.y };
    }
    if (!best) continue;
    const g = new THREE.Group();
    g.position.set(best.x, best.y - 0.01, best.z);
    const tower = new THREE.Mesh(towerGeo, towerMat);
    tower.castShadow = true;
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), lampMat);
    lamp.position.y = 0.215;
    const beam = new THREE.Mesh(beamGeo, beamMat.clone());
    beam.position.y = 0.215;
    g.add(tower, lamp, beam);
    scene.add(g);
    items.push({ g, beam, phase: items.length * 1.3 });
  }
  return items;
}

export function updateLighthouses(items, sim, t) {
  for (const it of items) {
    const dx = it.g.position.x - sim.sunX, dz = it.g.position.z - sim.sunZ;
    const night = THREE.MathUtils.smoothstep(Math.sqrt(dx * dx + dz * dz), DAY_R, DAY_R + 1.0);
    it.beam.rotation.y = t * 1.1 + it.phase;
    it.beam.material.opacity = 0.16 * night;
    it.beam.visible = night > 0.01;
  }
}

// ── Penguins: little colonies on the ice inside the wall (flavour) ──────────
export function buildPenguins(scene, terrain) {
  const rng = makeRng(2718);
  const body = solidColor(new THREE.SphereGeometry(0.018, 8, 6).scale(1, 1.5, 1).translate(0, 0.026, 0), new THREE.Color('#22252e'));
  const belly = solidColor(new THREE.SphereGeometry(0.014, 8, 6).scale(0.9, 1.35, 0.6).translate(0, 0.024, 0.009), new THREE.Color('#f4f4ee'));
  const beak = solidColor(new THREE.ConeGeometry(0.005, 0.012, 4).rotateX(Math.PI / 2).translate(0, 0.042, 0.017), new THREE.Color('#f0a43a'));
  const geo = merge([body, belly, beak]);
  const mat = toon({ vertexColors: true });

  const birds = [];
  for (let c = 0; c < 9; c++) {
    const a = rng() * Math.PI * 2, r = 9.35 + rng() * 0.3;
    const n = 3 + Math.floor(rng() * 4);
    for (let k = 0; k < n; k++) {
      const aa = a + (rng() - 0.5) * 0.04, rr = r + (rng() - 0.5) * 0.12;
      const x = rr * Math.cos(aa), z = rr * Math.sin(aa);
      birds.push({ x, z, y: terrain.heightAt(x, z), face: rng() * Math.PI * 2, phase: rng() * 6 });
    }
  }
  const mesh = new THREE.InstancedMesh(geo, mat, birds.length);
  mesh.castShadow = true;
  scene.add(mesh);
  return { mesh, birds };
}

export function updatePenguins(p, t) {
  p.birds.forEach((b, i) => {
    const w = Math.sin(t * 6 + b.phase);
    place(p.mesh, i, b.x, b.y + Math.abs(w) * 0.004, b.z, b.face + Math.sin(t * 0.4 + b.phase) * 0.6, 1.6, 1.6, 1.6, 0, w * 0.12);
  });
  p.mesh.instanceMatrix.needsUpdate = true;
}

// ── Underside: the disc floats on a hanging rock mass (flavour) ─────────────
export function buildUnderside(scene, topY) {
  const rng = makeRng(5150);
  const profile = [
    [R, topY], [R - 0.15, topY - 0.35], [R - 0.7, topY - 0.9], [R - 1.8, topY - 1.6], [R - 3.4, topY - 2.4],
    [R - 5.2, topY - 3.2], [R - 7.0, topY - 3.9], [R - 8.6, topY - 4.5], [0.4, topY - 5.0], [0.0, topY - 5.1],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const geo = new THREE.LatheGeometry(profile, 72).toNonIndexed();

  // Craggy displacement + strata bands, flat shaded
  const pos = geo.attributes.position;
  const strata = ['#8a6a4c', '#6e5240', '#a07c58', '#5c4436', '#7c6048'].map(c => new THREE.Color(c));
  const cols = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  const noise = (x, y, z) => Math.sin(x * 1.7 + z * 0.9) * Math.cos(z * 1.3 - y * 2.1) + 0.5 * Math.sin(x * 3.9 - y * 2.7 + z * 2.2);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const depth = topY - v.y;
    if (depth > 0.05) {
      const k = 1 + 0.08 * noise(v.x, v.y, v.z) * Math.min(1, depth);
      v.x *= k; v.z *= k;
      v.y -= 0.12 * Math.abs(noise(v.z, v.x, v.y)) * Math.min(1, depth);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    const band = strata[Math.floor(((depth * 2.6 + 0.6 * noise(v.x * 0.5, 0, v.z * 0.5)) % strata.length + strata.length) % strata.length)];
    cols.set([band.r, band.g, band.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  geo.computeVertexNormals();
  const rock = new THREE.Mesh(geo, toon({ vertexColors: true }));

  // Glowing crystals poking out of the rock
  const crystalGeo = new THREE.OctahedronGeometry(0.12, 0).scale(0.6, 1.6, 0.6);
  const crystalMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.1, 2.0, 2.6) });
  const crystals = new THREE.InstancedMesh(crystalGeo, crystalMat, 26);
  for (let i = 0; i < 26; i++) {
    const t = 0.15 + rng() * 0.7;                       // fraction down the profile
    const seg = Math.floor(t * (profile.length - 1));
    const p0 = profile[seg], p1 = profile[seg + 1], f = t * (profile.length - 1) - seg;
    const rr = (p0.x + (p1.x - p0.x) * f) * 0.97, yy = p0.y + (p1.y - p0.y) * f;
    const a = rng() * Math.PI * 2;
    place(crystals, i, rr * Math.cos(a), yy, rr * Math.sin(a), rng() * 3, 0.6 + rng() * 0.9, 0.6 + rng() * 0.9, 0.6 + rng() * 0.9,
      (rng() - 0.5) * 1.6, (rng() - 0.5) * 1.6);
    crystals.setColorAt(i, new THREE.Color(rng() < 0.5 ? '#bfe8ff' : '#e6b8ff'));
  }

  // Roots dangling from the rim
  const rootPts = [];
  for (let i = 0; i < 60; i++) {
    const a = rng() * Math.PI * 2, r = R - 0.1 - rng() * 0.8;
    let x = r * Math.cos(a), z = r * Math.sin(a), y = topY - 0.1;
    const len = 0.4 + rng() * 1.1, steps = 5;
    for (let k = 0; k < steps; k++) {
      const nx = x + (rng() - 0.5) * 0.12, nz = z + (rng() - 0.5) * 0.12, ny = y - len / steps;
      rootPts.push(x, y, z, nx, ny, nz);
      x = nx; y = ny; z = nz;
    }
  }
  const rootGeo = new THREE.BufferGeometry();
  rootGeo.setAttribute('position', new THREE.Float32BufferAttribute(rootPts, 3));
  const roots = new THREE.LineSegments(rootGeo, new THREE.LineBasicMaterial({ color: 0x4a3426 }));

  // A few small rocks drifting below the island
  const chunkGeo = new THREE.DodecahedronGeometry(0.35, 0);
  const chunks = [];
  const chunkMat = toon({ color: 0x7a5e48 });
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(chunkGeo, chunkMat);
    const a = i / 6 * Math.PI * 2 + rng(), r = 4 + rng() * 5;
    m.userData = { a, r, y: topY - 2.5 - rng() * 2.5, s: 0.5 + rng() * 0.9, speed: 0.02 + rng() * 0.03 };
    m.scale.setScalar(m.userData.s);
    chunks.push(m);
  }

  const group = new THREE.Group();
  group.add(rock, crystals, roots, ...chunks);
  scene.add(group);
  return { group, chunks };
}

export function updateUnderside(u, t) {
  for (const m of u.chunks) {
    const d = m.userData;
    const a = d.a + t * d.speed;
    m.position.set(d.r * Math.cos(a), d.y + Math.sin(t * 0.5 + d.a) * 0.15, d.r * Math.sin(a));
    m.rotation.set(t * 0.1 + d.a, t * 0.07, 0);
  }
}

