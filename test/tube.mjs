// Barrel riding: depth control (Up/Down) and line (Left/Right). Fun, not
// brutal: a sensible rider should get long tubes; riding too deep pinches
// you, riding high near the pinch clips you.
import { createRider, stepRider, useWave, tubeDepth } from '../src/rider.js';
useWave('reef');
const keepDepth = (target) => (r) => {
  const d = tubeDepth(r);
  return { tilt: d > target + 0.08 ? 1 : d < target - 0.08 ? -1 : 0 };
};
const pols = {
  'no input': () => ({}),
  'speed straight out (Up)': () => ({ tilt: 1 }),
  'stall the whole way (Down)': () => ({ tilt: -1 }),
  'hold ~50% deep, middle line': keepDepth(0.5),
  'hold ~75% deep, middle line': keepDepth(0.75),
  'hold ~75% deep, low line': (r) => ({ ...keepDepth(0.75)(r), turn: -1 }),
  'hold ~75% deep, high line': (r) => ({ ...keepDepth(0.75)(r), turn: 1 }),
  'hold ~50% for 4s, then out': (r) => (r.tube && r.tube.time > 4 ? { tilt: 1 } : keepDepth(0.5)(r)),
};
for (const [label, pol] of Object.entries(pols)) {
  const r = createRider(); Object.assign(r, { xs: -3, t: 13.2, phi: 0.05, speed: 9 }); r.events = []; stepRider(r, {}, 0);
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
    const inp = r.tube ? (r.tube.time > 3 ? { tilt: 1 } : keepDepth(0.5)(r)) : r.height > 0.55 ? { turn: -1 } : {};
    stepRider(r, inp, 1 / 120);
    for (const e of r.events) ev.push(e.type === 'barrelExit' ? `out after ${e.time.toFixed(1)}s` : e.type === 'barrelEnter' ? 'PULL IN' : e.move || e.type);
    if (r.mode === 'wipe' || ev.some((x) => x.startsWith('out'))) break;
  }
  console.log(label.padEnd(30), ev.join(' -> '), '|', r.mode === 'wipe' ? 'WIPE: ' + r.wipeReason : '');
}
