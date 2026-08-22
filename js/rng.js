// js/rng.js — tiny seeded PRNG (mulberry32) for BUILD-TIME randomness.
//
// Everything that decides how the diorama looks when it is built (ice-wall
// block heights, cloud placement, star field, island positions, map speckle)
// draws from `buildRandom` so every load renders the identical scene and a
// shared URL reproduces the frame. Runtime randomness that is meant to differ
// each viewing (meteor spawns, rain drift jitter, bird/foghorn timing) stays
// on Math.random.

export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const BUILD_SEED = 1337;
export const buildRandom = makeRng(BUILD_SEED);
