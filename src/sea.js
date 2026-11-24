// The sea: sets (each wave you ride is a different size) and sections (a
// stretch ahead of you breaks early for a while: it closes out on the point,
// throws an early barrel on the reef). The settings live in the wave's
// `sea` (see src/waves/). Deterministic for a given seed, so tests are
// repeatable.
//
// Every wave has an address: the sea's seed and its number n (0, 1, 2 ...). Everything random about wave n (its place in
// the set, its sections, its ridges, a bar's map) comes from that address alone, so wave n is the same wave however long
// the waves before it were ridden (or the title screen's demo ran). That's what lets a contest give everyone the same
// waves in the same order and a replay rebuild a ride (plans/2026-11-23-accounts-and-paid-plans.md, task 1).

import { WAVE, SECTIONS, stepSections, setWaveSize, surface, startRide, stepRide, seedRidges } from './wave.js';

let rnd = mulberry(1);
let timer = 0;
// seed, n: the address of the wave being ridden (n -1 before the first)
export const SEA = { enabled: true, waveInSet: 0, setSize: 3, size: 1, events: [], seed: 1, n: -1 };

function mulberry(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const between = ([a, b]) => a + (b - a) * rnd();

// A new sea: the next wave is its wave 0.
export function seedSea(seed) { SEA.seed = seed; SEA.n = -1; }

// The seed of wave n: wave 0 uses the sea's own seed (as before addresses, so single-wave tests are unchanged), later
// waves a hash of (seed, n).
export function waveSeed(seed, n) {
  if (n === 0) return seed;
  let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(n + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15; h = Math.imul(h, 0x846ca68b); h ^= h >>> 16;
  return h | 0 || 1;
}

// Start a new ride: the next wave (sizes cycle through the set).
export function nextWave() { goToWave(SEA.n + 1); }

// Start a ride on wave n of this sea.
export function goToWave(n) {
  const cfg = WAVE.sea;
  SEA.n = n;
  const s = waveSeed(SEA.seed, n);
  rnd = mulberry(s); seedRidges(s);
  SECTIONS.length = 0;
  startRide(n); // (a wave with a bar starts again from its peak)
  if (!SEA.enabled || !cfg) { setWaveSize(1); SEA.size = 1; return; }
  const setIndex = n % cfg.set.length;
  SEA.waveInSet = setIndex + 1;
  SEA.setSize = cfg.set.length;
  SEA.size = cfg.set[setIndex];
  setWaveSize(SEA.size);
  if (cfg.sections) timer = between(cfg.firstSection);
}

// Face height of the wave being ridden, in feet (for the HUD).
export function waveHeightFt() {
  return (surface(0.5, 4)[1] - surface(0.5, 13.9)[1]) * 3.28;
}

export function stepSea(dt) {
  SEA.events.length = 0;
  stepRide(dt); // (a wave with a bar: the curl runs on along it)
  stepSections(dt);
  const cfg = WAVE.sea;
  if (!SEA.enabled || !cfg || !cfg.sections) return;
  timer -= dt;
  if (timer <= 0) {
    timer = between(cfg.sectionEvery);
    const kind = rnd() < (cfg.closeoutChance ?? 1) ? 'closeout' : 'throw';
    SECTIONS.push({
      x: between(cfg.ahead), age: 0, grow: between(cfg.grow), width: between(cfg.width),
      target: kind === 'closeout' ? cfg.closeoutPhase : cfg.throwPhase, kind,
    });
    SEA.events.push({ type: 'section', kind });
  }
}
