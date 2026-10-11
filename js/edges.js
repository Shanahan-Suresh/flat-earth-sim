import * as THREE from 'three';
import { CONSTANTS } from './sim.js';
import { makeRng } from './rng.js';
import { toonRamp } from './textures.js';
import { surfaceUniforms } from './surface.js';

// ── The three alternative edges (the ice wall itself lives in decor.js) ──────
//   waterfall — the ocean pours off the rim as one continuous curtain
//   infinite  — the sea runs on past the rim into the haze
//   beyond    — an ice shelf past the wall with hidden lands on it

const R = CONSTANTS.DISC_RADIUS;
const toon = (params = {}) => new THREE.MeshToonMaterial({ gradientMap: toonRamp(), ...params });

function buildWaterfall() {
  const group = new THREE.Group();
  const H = 4.2;
  // Slight outward flare so the curtain arcs away from the rock below
  const geo = new THREE.CylinderGeometry(R + 0.02, R + 0.55, H, 160, 24, true);
  geo.translate(0, -H / 2 + 0.02, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: surfaceUniforms.uTime },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform float uTime;
      varying vec2 vUv;
      float h(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
      float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      void main() {
        float fall = 1.0 - vUv.y;                        // 0 at the lip, 1 at the bottom
        // Long vertical streaks: fine around the rim, stretched down the fall
        vec2 p = vec2(vUv.x * 160.0, fall * 2.2 - uTime * 0.9);
        float streak = n(p) * 0.65 + n(vec2(vUv.x * 410.0, fall * 5.0 - uTime * 1.6)) * 0.35;
        vec3 deep = vec3(0.07, 0.30, 0.50), mid = vec3(0.18, 0.55, 0.74);
        vec3 c = mix(deep, mid, smoothstep(0.35, 0.7, streak));
        c = mix(c, vec3(0.92, 0.98, 1.0), smoothstep(0.78, 0.92, streak));   // white water
        c = mix(c, vec3(1.0), (1.0 - smoothstep(0.0, 0.05, fall)) * 0.85);   // foam at the lip
        float a = (0.5 + 0.35 * streak) * (1.0 - smoothstep(0.5, 1.0, fall));
        gl_FragColor = vec4(c, a);
      }`,
  });
  const curtain = new THREE.Mesh(geo, mat);
  curtain.renderOrder = 3;
  group.add(curtain);

  return group;
}

function buildInfinite() {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x1d5c86, roughness: 0.45, metalness: 0 });
  const sea = new THREE.Mesh(new THREE.RingGeometry(R - 0.05, 60, 96, 1), mat);
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = -0.005;
  sea.receiveShadow = true;
  group.add(sea);
  return group;
}

function buildBeyond() {
  const rng = makeRng(1960);   // the Antarctic Treaty year
  const group = new THREE.Group();

  // The shelf: a broad ring of pack ice past the wall
  const shelfGeo = new THREE.RingGeometry(R - 0.05, 19, 128, 6).toNonIndexed();
  const pos = shelfGeo.attributes.position;
  const cols = new Float32Array(pos.count * 3);
  // Soft patches of fresher and older ice (smooth noise on the face centre)
  const a = new THREE.Color('#e2f1f9'), b = new THREE.Color('#c4e0ef'), c = new THREE.Color();
  for (let i = 0; i < pos.count; i += 3) {
    const x = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3, y = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
    const t = 0.5 + 0.25 * Math.sin(x * 0.9 + y * 0.4) + 0.25 * Math.sin(y * 1.3 - x * 0.7);
    c.copy(a).lerp(b, t);
    for (let k = 0; k < 3; k++) cols.set([c.r, c.g, c.b], (i + k) * 3);
  }
  shelfGeo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  shelfGeo.computeVertexNormals();
  const shelf = new THREE.Mesh(shelfGeo, toon({ vertexColors: true }));
  shelf.rotation.x = -Math.PI / 2;
  shelf.position.y = 0.02;
  shelf.receiveShadow = true;
  group.add(shelf);

  // Hidden lands: terraced green islands with snowy peaks
  const tierMat = toon({ vertexColors: false, color: 0x6fb05c });
  const cliffMat = toon({ color: 0x8b7a68 });
  const snowMat = toon({ color: 0xf4f8fc });
  const treeMat = toon({ color: 0x2f7350 });
  const treeGeo = new THREE.ConeGeometry(0.09, 0.26, 6).translate(0, 0.13, 0);
  for (let i = 0; i < 7; i++) {
    const ang = i / 7 * Math.PI * 2 + rng() * 0.5;
    const r = 12 + rng() * 4.5;
    const island = new THREE.Group();
    island.position.set(r * Math.cos(ang), 0.02, r * Math.sin(ang));
    const base = 0.6 + rng() * 0.7;
    const tiers = 2 + Math.floor(rng() * 3);
    let y = 0;
    for (let t = 0; t < tiers; t++) {
      const rad = base * (1 - t / (tiers + 0.6));
      const hgt = 0.12 + rng() * 0.12;
      const cliff = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad * 1.06, hgt, 9), cliffMat);
      cliff.position.y = y + hgt / 2;
      const top = new THREE.Mesh(new THREE.CylinderGeometry(rad * 1.01, rad * 1.01, 0.03, 9), t === tiers - 1 && rng() < 0.6 ? snowMat : tierMat);
      top.position.y = y + hgt;
      for (const m of [cliff, top]) { m.castShadow = m.receiveShadow = true; island.add(m); }
      if (t < tiers - 1) {
        for (let k = 0; k < 5; k++) {
          const tr = new THREE.Mesh(treeGeo, treeMat);
          const ta = rng() * Math.PI * 2, tr2 = rad * (0.75 + rng() * 0.2);
          tr.position.set(tr2 * Math.cos(ta), y + hgt + 0.01, tr2 * Math.sin(ta));
          tr.castShadow = true;
          island.add(tr);
        }
      }
      y += hgt;
    }
    group.add(island);
  }
  return group;
}

export function buildEdges(scene) {
  const waterfallGroup = buildWaterfall();
  const infiniteGroup = buildInfinite();
  const beyondGroup = buildBeyond();
  for (const g of [waterfallGroup, infiniteGroup, beyondGroup]) {
    g.visible = false;
    scene.add(g);
  }
  return { waterfallGroup, infiniteGroup, beyondGroup };
}
