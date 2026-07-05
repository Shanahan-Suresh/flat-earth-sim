import * as THREE from 'three';
import { CONSTANTS } from './sim.js';
import { makeWorldMapTexture, makeWaterfallTexture } from './textures.js';

export function buildWorld(scene) {
  // ── Disc ──────────────────────────────────────────────────────────────────
  const worldMapTexture = makeWorldMapTexture();
  worldMapTexture.repeat.set(1, 1);
  worldMapTexture.center.set(0.5, 0.5);

  const discGeo = new THREE.CylinderGeometry(10, 10, 0.3, 96);
  const discMats = [
    new THREE.MeshLambertMaterial({ color: 0x4a3020, flatShading: true }),         // 0: side
    new THREE.MeshLambertMaterial({ map: worldMapTexture, flatShading: true }),     // 1: top cap
    new THREE.MeshLambertMaterial({ color: 0x4a3020, flatShading: true }),         // 2: bottom cap
  ];
  const disc = new THREE.Mesh(discGeo, discMats);
  disc.position.y = -0.15; // shift down so top face sits at y=0
  scene.add(disc);

  // ── Ice Wall ──────────────────────────────────────────────────────────────
  const iceWallGroup = new THREE.Group();
  for (let i = 0; i < CONSTANTS.ICE_WALL_COUNT; i++) {
    const angle = (i / CONSTANTS.ICE_WALL_COUNT) * Math.PI * 2;
    const h = CONSTANTS.ICE_WALL_HEIGHT_MIN
      + Math.random() * (CONSTANTS.ICE_WALL_HEIGHT_MAX - CONSTANTS.ICE_WALL_HEIGHT_MIN);

    let geo;
    if (i % 3 === 0) {
      geo = new THREE.ConeGeometry(0.12, h, 4);
    } else {
      geo = new THREE.BoxGeometry(0.18 + Math.random() * 0.1, h, 0.18 + Math.random() * 0.1);
    }

    // Self-emissive tint so ice reads white-blue day or night (never muddy tan)
    const mat = new THREE.MeshToonMaterial({
      color: 0xd8f0fa,
      emissive: 0x9fd8ea,
      emissiveIntensity: 0.35,
    });
    const block = new THREE.Mesh(geo, mat);
    const r = 9.9 + (Math.random() - 0.5) * 0.15;
    block.position.set(
      r * Math.cos(angle),
      h / 2,
      r * Math.sin(angle)
    );
    block.rotation.y = angle + (Math.random() - 0.5) * 0.3;
    iceWallGroup.add(block);
  }
  scene.add(iceWallGroup);

  // ── Dome / Firmament ──────────────────────────────────────────────────────
  const domeSphere = new THREE.SphereGeometry(10.4, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2);
  const domeMat = new THREE.MeshPhongMaterial({
    color: 0x99ccee,
    transparent: true,
    opacity: 0.10,
    side: THREE.DoubleSide,
    depthWrite: false,
    shininess: 60,
    specular: 0xaaddff,
  });
  const domeMesh = new THREE.Mesh(domeSphere, domeMat);
  domeMesh.scale.y = CONSTANTS.DOME_Y_SCALE;
  scene.add(domeMesh);

  // Dome rim ring
  const rimGeo = new THREE.TorusGeometry(10.4, 0.06, 8, 64);
  const rimMat = new THREE.MeshLambertMaterial({ color: 0xaaddf0, transparent: true, opacity: 0.5 });
  const rimMesh = new THREE.Mesh(rimGeo, rimMat);
  rimMesh.rotation.x = Math.PI / 2;
  rimMesh.position.y = 0.02;
  scene.add(rimMesh);

  // ── Mode 2: Waterfall ─────────────────────────────────────────────────────
  const waterfallGroup = new THREE.Group();
  waterfallGroup.visible = false;

  const wfTex = makeWaterfallTexture();
  wfTex.wrapS = THREE.RepeatWrapping;
  wfTex.wrapT = THREE.RepeatWrapping;
  wfTex.repeat.set(1, 4);

  for (let i = 0; i < 64; i++) {
    const angle = (i / 64) * Math.PI * 2;
    const stripGeo = new THREE.PlaneGeometry(1.0, 3.0);
    const stripMat = new THREE.MeshBasicMaterial({
      map: wfTex,
      transparent: true,
      opacity: 0.75,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const strip = new THREE.Mesh(stripGeo, stripMat);
    strip.position.set(
      9.9 * Math.cos(angle),
      -1.5,
      9.9 * Math.sin(angle)
    );
    strip.rotation.y = -angle;
    strip.rotation.z = 0.08;
    waterfallGroup.add(strip);
  }

  // Foam particle ring at rim lip
  const foamPositions = [];
  for (let i = 0; i < 200; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 9.85 + Math.random() * 0.2;
    foamPositions.push(r * Math.cos(a), Math.random() * 0.1, r * Math.sin(a));
  }
  const foamGeo = new THREE.BufferGeometry();
  foamGeo.setAttribute('position', new THREE.Float32BufferAttribute(foamPositions, 3));
  const foamMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.05, sizeAttenuation: true });
  const foamPoints = new THREE.Points(foamGeo, foamMat);
  waterfallGroup.add(foamPoints);

  scene.add(waterfallGroup);

  // ── Mode 3: Infinite Plane ────────────────────────────────────────────────
  const infiniteGroup = new THREE.Group();
  infiniteGroup.visible = false;

  const ringGeo = new THREE.RingGeometry(10, 40, 64);
  const ringMat = new THREE.MeshLambertMaterial({
    color: 0x2a5a7c,
    side: THREE.DoubleSide,
    flatShading: true,
  });
  const ringMesh = new THREE.Mesh(ringGeo, ringMat);
  ringMesh.rotation.x = -Math.PI / 2;
  ringMesh.position.y = -0.01;
  infiniteGroup.add(ringMesh);

  scene.add(infiniteGroup);

  // ── Mode 4: Lands Beyond ──────────────────────────────────────────────────
  const beyondGroup = new THREE.Group();
  beyondGroup.visible = false;

  const islandAngles = [0.3, 1.1, 2.0, 2.8, 4.2, 5.1];
  const islandColors = [0x4a7a40, 0x556644, 0x6a7a50, 0x445533, 0x3a6630, 0x507060];
  for (let i = 0; i < 6; i++) {
    const a = islandAngles[i];
    const r = 11.5 + Math.random() * 3.5;

    const baseGeo = new THREE.CylinderGeometry(0.6 + Math.random() * 0.4, 0.8, 0.25, 8);
    const baseMat = new THREE.MeshLambertMaterial({ color: islandColors[i], flatShading: true });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.set(r * Math.cos(a), 0.125, r * Math.sin(a));
    beyondGroup.add(base);

    if (i % 2 === 0) {
      const peakGeo = new THREE.ConeGeometry(0.2, 0.4, 6);
      const peakMat = new THREE.MeshToonMaterial({
        color: 0xeeeeff,
        emissive: 0x9fd8ea,
        emissiveIntensity: 0.3,
      });
      const peak = new THREE.Mesh(peakGeo, peakMat);
      peak.position.set(r * Math.cos(a), 0.45, r * Math.sin(a));
      beyondGroup.add(peak);
    }
  }

  // Faint wisps ring
  const wispPos = [];
  for (let i = 0; i < 120; i++) {
    const a = Math.random() * Math.PI * 2;
    const rr = 11 + Math.random() * 5;
    wispPos.push(rr * Math.cos(a), 0.5 + Math.random() * 0.5, rr * Math.sin(a));
  }
  const wispGeo = new THREE.BufferGeometry();
  wispGeo.setAttribute('position', new THREE.Float32BufferAttribute(wispPos, 3));
  const wispMat = new THREE.PointsMaterial({
    color: 0xaaccff,
    size: 0.08,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.5,
  });
  beyondGroup.add(new THREE.Points(wispGeo, wispMat));

  scene.add(beyondGroup);

  // ── Clouds ────────────────────────────────────────────────────────────────
  const cloudGroup = new THREE.Group();

  for (let c = 0; c < 12; c++) {
    const angle = (c / 12) * Math.PI * 2 + Math.random();
    const r = 2 + Math.random() * 6;
    const cloudBase = new THREE.Group();
    cloudBase.position.set(r * Math.cos(angle), 1.2 + Math.random() * 0.4, r * Math.sin(angle));
    cloudBase.userData.orbitRadius = r;
    cloudBase.userData.orbitAngle = angle;
    cloudBase.userData.orbitSpeed = 0.02 + Math.random() * 0.03;

    const blobCount = 3 + Math.floor(Math.random() * 3);
    for (let b = 0; b < blobCount; b++) {
      const blobGeo = new THREE.SphereGeometry(0.25 + Math.random() * 0.15, 6, 4);
      // Emissive lift so clouds read soft-white day or night, not muddy olive
      const blobMat = new THREE.MeshToonMaterial({
        color: 0xf4f8ff,
        emissive: 0xb8c4e0,
        emissiveIntensity: 0.5,
      });
      const blob = new THREE.Mesh(blobGeo, blobMat);
      blob.scale.y = 0.4;
      blob.position.set(
        (Math.random() - 0.5) * 0.5,
        (Math.random() - 0.5) * 0.1,
        (Math.random() - 0.5) * 0.5
      );
      cloudBase.add(blob);
    }
    cloudGroup.add(cloudBase);
  }
  scene.add(cloudGroup);

  // ── Return handles ────────────────────────────────────────────────────────
  return {
    disc,
    iceWallGroup,
    domeMesh,
    rimMesh,
    cloudGroup,
    waterfallGroup,
    waterfallTex: wfTex,
    infiniteGroup,
    beyondGroup,

    setEdgeMode(mode) {
      // mode: 'icewall' | 'waterfall' | 'infinite' | 'beyond'
      iceWallGroup.visible = mode === 'icewall' || mode === 'beyond';
      waterfallGroup.visible = mode === 'waterfall';
      infiniteGroup.visible = mode === 'infinite';
      beyondGroup.visible = mode === 'beyond';
    },
  };
}
