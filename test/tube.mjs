// Barrel riding: depth control (Up/Down) and line (Left/Right). Fun, not
// brutal: a sensible rider should get long tubes; riding too deep pinches
// you, riding high near the pinch clips you.
import { createRider, stepRider, useWave, tubeDepth } from '../src/rider.js';
useWave('reef');
// Wiggle up and down around a line (drives you forward), keeping inside the funnel.
const wiggler = (target, period = 0.22) => (r) => {
  const d = tubeDepth(r), line = r.tube.line || 0;
  if (Math.abs(line) > 0.25) return { turn: line > 0 ? -1 : 1 };
  return { turn: d > target ? (Math.floor(r.tube.time / period) % 2 ? 1 : -1) : 0 };
};
const keepDepth = wiggler;
const pols = {
  'no input': () => ({}),
  'wiggle the whole time': (r) => ({ turn: Math.floor(r.tube.time / 0.22) % 2 ? 1 : -1 }),
  'wiggle when past 35% deep': wiggler(0.35),
  'wiggle when past 60% deep': wiggler(0.6),
  'lazy wiggles (slow)': wiggler(0.35, 0.6),
  'hold Left (too high)': () => ({ turn: 1 }),
  'hold Right (too low)': () => ({ turn: -1 }),
};
for (const [label, pol] of Object.entries(pols)) {
  const r = createRider(); Object.assign(r, { xs: -3, t: 13.2, phi: 0.05, speed: 10 }); r.events = []; stepRider(r, {}, 0);
  const ev = [];
  for (let i = 0; i < 16 * 120; i++) {
    stepRider(r, r.tube ? pol(r) : {}, 1 / 120);
    for (const e of r.events) ev.push(e.type === 'barrelExit' ? `out after ${e.time.toFixed(1)}s (avg depth ${(e.avgDepth * 100).toFixed(0)}%)` : e.move || e.type);
    if (r.mode === 'wipe' || ev.some((x) => x.startsWith('out'))) break;
  }
  console.log(label.padEnd(30), ev.join(' -> ') || (r.tube ? `still in the tube after 16s` : '-'), '|', r.mode === 'wipe' ? 'WIPE: ' + r.wipeReason : '');
}

// Pulling in: climb near the curl and turn up near the lip.
console.log('-- pulling in');
for (const [label, xs] of [['near the curl', 1.0], ['3 m ahead', 2.6], ['far out on the face', 8]]) {
  const r = createRider(); Object.assign(r, { xs, t: 11, phi: 1.0, speed: 12 }); r.events = []; stepRider(r, {}, 0);
  const ev = [];
  for (let i = 0; i < 10 * 120; i++) {
    const inp = r.tube ? keepDepth(0.4)(r) : r.height > 0.55 ? { turn: -1 } : {};
    stepRider(r, inp, 1 / 120);
    for (const e of r.events) ev.push(e.type === 'barrelExit' ? `out after ${e.time.toFixed(1)}s` : e.type === 'barrelEnter' ? 'PULL IN' : e.move || e.type);
    if (r.mode === 'wipe' || ev.some((x) => x.startsWith('out'))) break;
  }
  console.log(label.padEnd(30), ev.join(' -> '), '|', r.mode === 'wipe' ? 'WIPE: ' + r.wipeReason : '');
}
