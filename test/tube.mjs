// Tube riding: from just inside the barrel, how do different riders fare?
import { createRider, stepRider, useWave } from '../src/rider.js';
useWave('reef');
const balance = (r) => Math.max(-1, Math.min(1, r.tube.bal * 2.5 + r.tube.balVel * 0.8));
const pols = {
  'no input': () => ({}),
  'balances, no speed input': (r) => (r.tube ? { turn: balance(r) } : {}),
  'balances + speeds out (Up)': (r) => (r.tube ? { turn: balance(r), tilt: 1 } : {}),
  'balances + stalls (Down)': (r) => (r.tube ? { turn: balance(r), tilt: -1 } : {}),
  'balances, stalls deep then speeds out': (r) => (r.tube ? { turn: balance(r), tilt: r.tube.time < 1.5 ? -1 : 1 } : {}),
  'balance backwards (wrong way)': (r) => (r.tube ? { turn: -balance(r) } : {}),
};
for (const [label, pol] of Object.entries(pols)) {
  const r = createRider(); Object.assign(r, { xs: -3, t: 13.2, phi: 0.05, speed: 9 }); r.events = []; stepRider(r, {}, 0);
  const ev = [];
  for (let i = 0; i < 10 * 120; i++) {
    stepRider(r, pol(r), 1 / 120);
    for (const e of r.events) ev.push(e.type === 'barrelExit' ? `out after ${e.time.toFixed(1)}s (deepest phase ${e.depth.toFixed(2)})` : e.move || e.type);
    if (r.mode === 'wipe' || ev.some((x) => x.startsWith('out'))) break;
  }
  console.log(label.padEnd(40), ev.join(' -> '), '|', r.mode === 'wipe' ? 'WIPE: ' + r.wipeReason : '');
}

// Pulling in: climb near the curl and turn up near the lip.
console.log('-- pulling in');
for (const [label, xs] of [['near the curl', 1.0], ['3 m ahead', 2.6], ['far out on the face', 8]]) {
  const r = createRider(); Object.assign(r, { xs, t: 11, phi: 1.0, speed: 12 }); r.events = []; stepRider(r, {}, 0);
  const ev = [];
  for (let i = 0; i < 8 * 120; i++) {
    const inp = r.tube ? { turn: balance(r), tilt: r.tube.time < 1.5 ? -1 : 1 } : r.height > 0.55 ? { turn: -1 } : {};
    stepRider(r, inp, 1 / 120);
    for (const e of r.events) ev.push(e.type === 'barrelExit' ? `out after ${e.time.toFixed(1)}s` : e.type === 'barrelEnter' ? 'PULL IN' : e.move || e.type);
    if (r.mode === 'wipe' || ev.some((x) => x.startsWith('out'))) break;
  }
  console.log(label.padEnd(24), ev.join(' -> '), '|', r.mode === 'wipe' ? 'WIPE: ' + r.wipeReason : '');
}
