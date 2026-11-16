// The sea: sets (each wave you ride is a different size) and sections (a
// stretch ahead of you breaks early for a while: it closes out on the point,
// throws an early barrel on the reef). The settings live in the wave's
// `sea` (see src/waves/). Deterministic for a given seed, so tests are
// repeatable.

import { WAVE, SECTIONS, stepSections, setWaveSize, surface } from './wave.js';

let rnd = mulberry(1);
let setIndex = -1, timer = 0;
export const SEA = { enabled: true, waveInSet: 0, setSize: 3, size: 1, events: [] };

function mulberry(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const between = ([a, b]) => a + (b - a) * rnd();

export function seedSea(seed) { rnd = mulberry(seed); setIndex = -1; }

// Start a new ride: the next wave of the set (sizes cycle through the set).
export function nextWave() {
  const cfg = WAVE.sea;
  SECTIONS.length = 0;
  if (!SEA.enabled || !cfg) { setWaveSize(1); SEA.size = 1; return; }
  setIndex = (setIndex + 1) % cfg.set.length;
  SEA.waveInSet = setIndex + 1;
  SEA.setSize = cfg.set.length;
  SEA.size = cfg.set[setIndex];
  setWaveSize(SEA.size);
  timer = between(cfg.firstSection);
}

// Face height of the wave being ridden, in feet (for the HUD).
export function waveHeightFt() {
  return (surface(0.5, 4)[1] - surface(0.5, 13.9)[1]) * 3.28;
}

export function stepSea(dt) {
  SEA.events.length = 0;
  stepSections(dt);
  const cfg = WAVE.sea;
  if (!SEA.enabled || !cfg) return;
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
