import * as THREE from 'three';
import { CONSTANTS } from './sim.js';
import { makeRng } from './rng.js';
import { toonRamp } from './textures.js';
import { surfaceUniforms } from './surface.js';

// ── Wildlife and drifters (all flavour): bird flocks that fly where it is day,
// fireflies over the forests where it is night, and a few hot-air balloons.

const DAY_R = CONSTANTS.DAY_PATCH_RADIUS;
const toon = (params = {}) => new THREE.MeshToonMaterial({ gradientMap: toonRamp(), ...params });
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();

function buildBirds(scene, rng) {
  const FLOCKS = 4, PER = 7;
  // Body faces +X; each wing spans out along Z from a hinge on the body axis
  const left = new THREE.BoxGeometry(0.02, 0.004, 0.05).translate(0, 0, -0.025);
  const right = new THREE.BoxGeometry(0.02, 0.004, 0.05).translate(0, 0, 0.025);
  const mat = toon({ color: 0x2b2d3a });
  const L = new THREE.InstancedMesh(left, mat, FLOCKS * PER);
  const R = new THREE.InstancedMesh(right, mat, FLOCKS * PER);
  L.frustumCulled = R.frustumCulled = false;
  const flocks = [];
  for (let f = 0; f < FLOCKS; f++) {
    // A loose V: leader first, then pairs trailing back on alternate sides
    const birds = [];
    for (let k = 0; k < PER; k++) {
      const side = k === 0 ? 0 : (k % 2 ? 1 : -1), row = Math.ceil(k / 2);
      birds.push({ dx: -row * 0.08, dz: side * row * 0.07, phase: rng() * 6 });
    }
    flocks.push({ birds, a0: rng() * Math.PI * 2, r: 0.6 + rng() * 0.8, speed: 0.25 + rng() * 0.2, h: 0.55 + rng() * 0.3, off: rng() * Math.PI * 2 });
  }
  scene.add(L, R);
  return { L, R, flocks };
}

function updateBirds(b, sim, t) {
  let i = 0;
  for (const f of b.flocks) {
    // Each flock circles a point inside the sun's day patch, so birds keep to the daylight
    const a = f.a0 + t * f.speed;
    const x = sim.sunX + Math.cos(f.off) * 0.9 + f.r * Math.cos(a);
    const z = sim.sunZ + Math.sin(f.off) * 0.9 + f.r * Math.sin(a);
    const yaw = Math.atan2(-Math.cos(a), -Math.sin(a));   // facing along the circle
    const fx = Math.cos(yaw), fz = -Math.sin(yaw);        // local +X in world
    for (const bird of f.birds) {
      const px = x + bird.dx * fx - bird.dz * fz, pz = z + bird.dx * fz + bird.dz * fx;
      const y = f.h + Math.sin(t * 1.3 + bird.phase) * 0.02;
      const flap = Math.sin(t * 9 + bird.phase) * 0.6;
      _p.set(px, y, pz); _s.setScalar(2.6);
      b.L.setMatrixAt(i, _m.compose(_p, _q.setFromEuler(_e.set(-flap, yaw, 0, 'YXZ')), _s));
      b.R.setMatrixAt(i, _m.compose(_p, _q.setFromEuler(_e.set(flap, yaw, 0, 'YXZ')), _s));
      i++;
    }
  }
  b.L.instanceMatrix.needsUpdate = b.R.instanceMatrix.needsUpdate = true;
}

function buildFireflies(scene, rng, spots) {
  const forest = spots.filter(s => !s.pine || rng() < 0.3);
  const N = Math.min(420, forest.length * 2);
  const pos = new Float32Array(N * 3), phase = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const s = forest[Math.floor(rng() * forest.length)];
    pos.set([s.x + (rng() - 0.5) * 0.3, s.y + 0.08 + rng() * 0.18, s.z + (rng() - 0.5) * 0.3], i * 3);
    phase[i] = rng() * 6.283;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: surfaceUniforms.uTime, uSunXZ: surfaceUniforms.uSunXZ },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      attribute float aPhase;
      uniform float uTime;
      uniform vec2 uSunXZ;
      varying float vGlow;
      void main() {
        vec3 p = position + vec3(sin(uTime * 0.7 + aPhase) * 0.04, sin(uTime * 1.1 + aPhase * 2.0) * 0.025, cos(uTime * 0.6 + aPhase) * 0.04);
        float night = smoothstep(${(DAY_R + 0.3).toFixed(2)}, ${(DAY_R + 1.2).toFixed(2)}, length(p.xz - uSunXZ));
        vGlow = night * pow(0.5 + 0.5 * sin(uTime * 2.4 + aPhase * 5.0), 3.0);
        gl_PointSize = 1.0;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `
      varying float vGlow;
      void main() { gl_FragColor = vec4(vec3(2.4, 2.6, 0.9) * vGlow, vGlow); }`,
  });
  const points = new THREE.Points(geo, mat);
  scene.add(points);
  return points;
}

function buildBalloons(scene, rng) {
  const stripes = ['#e2574c', '#f0c05a', '#4f9fd0', '#6fbf6a', '#d77fb5'];
  const balloons = [];
  for (let i = 0; i < 3; i++) {
    const env = new THREE.SphereGeometry(0.11, 12, 10).scale(1, 1.2, 1).toNonIndexed();
    const pos = env.attributes.position, cols = new Float32Array(pos.count * 3);
    const a = new THREE.Color(stripes[i % stripes.length]), b = new THREE.Color('#f7f1e4');
    for (let k = 0; k < pos.count; k += 3) {
      const ang = Math.atan2(pos.getZ(k) + pos.getZ(k + 1) + pos.getZ(k + 2), pos.getX(k) + pos.getX(k + 1) + pos.getX(k + 2));
      const c = Math.floor((ang + Math.PI) / (Math.PI * 2) * 8) % 2 ? a : b;
      for (let j = 0; j < 3; j++) cols.set([c.r, c.g, c.b], (k + j) * 3);
    }
    env.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    env.computeVertexNormals();
    const g = new THREE.Group();
    const envMesh = new THREE.Mesh(env, toon({ vertexColors: true }));
    envMesh.position.y = 0.2;
    const basket = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.03, 0.035), toon({ color: 0x8a5a3a }));
    basket.position.y = 0.04;
    envMesh.castShadow = basket.castShadow = true;
    g.add(envMesh, basket);
    g.scale.setScalar(1.3);
    g.userData = { a: rng() * Math.PI * 2, r: 2.5 + rng() * 4.5, y: 0.75 + rng() * 0.35, speed: 0.012 + rng() * 0.01, phase: rng() * 6 };
    scene.add(g);
    balloons.push(g);
  }
  return balloons;
}

export function buildLife(scene, forestSpots) {
  const rng = makeRng(8128);
  return {
    birds: buildBirds(scene, rng),
    fireflies: buildFireflies(scene, rng, forestSpots),
    balloons: buildBalloons(scene, rng),
  };
}

export function updateLife(life, sim, t) {
  updateBirds(life.birds, sim, t);
  for (const g of life.balloons) {
    const d = g.userData, a = d.a + t * d.speed;
    g.position.set(d.r * Math.cos(a), d.y + Math.sin(t * 0.4 + d.phase) * 0.05, d.r * Math.sin(a));
    g.rotation.y = t * 0.05 + d.phase;
  }
}
