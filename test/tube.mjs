// Barrel riding: you surf the face inside the tube as normal. Too deep =
// pinched, up into the roof = over the falls, way below the bottom = the lip
// lands on you, forward out = out.
import { createRider, stepRider, useWave, tubeDepth } from '../src/rider.js';
useWave('reef');
// S-turns between two heights on the face.
const sturns = (lo, hi, ang = 0.7) => { let up = true; return (r) => { if (up && r.height > hi) up = false; if (!up && r.height < lo) up = true; const a = up ? ang : -ang; return { aim: [Math.cos(a), Math.sin(a)] }; }; };
const runs = [
  ['no input (trim)', () => ({})],
  ['S-turns low-mid (0.08 - 0.4)', sturns(0.08, 0.4, 0.6)],
  ['S-turns up to half way', sturns(0.08, 0.5, 0.6)],
  ['climb into the top 3/8', sturns(0.1, 0.9)],
  ['point down, never turn up (too low)', () => ({ aim: [0.3, -1] })],
];
for (const [label, pol] of runs) {
  // Start on the face just ahead of the curl, low, riding along: let the tube come over you.
  const r = createRider(); Object.assign(r, { xs: 1.5, t: 11.5, phi: 0.8, speed: 11 }); r.events = []; stepRider(r, {}, 0);
  const ev = []; let maxDepth = 0;
  for (let i = 0; i < 15 * 120; i++) {
    // Stall low on the face (board pointing a little back) until the barrel comes over you.
    stepRider(r, r.tube || r.xs < -2.5 ? pol(r) : r.height > 0.55 ? { turn: -1 } : { aim: [0.6, 0.8] }, 1 / 120); // climb, then turn at the top near the curl to pull in
    if (r.tube) maxDepth = Math.max(maxDepth, tubeDepth(r));
    for (const e of r.events) if (e.type.startsWith('barrel')) ev.push(e.type === 'barrelExit' ? `out after ${e.time.toFixed(1)}s` : 'IN');
    if (r.mode === 'wipe' || ev.some((x) => x.startsWith('out'))) break;
  }
  console.log(label.padEnd(32), ev.join(' -> ') || '-', `| deepest ${(maxDepth * 100).toFixed(0)}%`, r.mode === 'wipe' ? '| WIPE: ' + r.wipeReason : '');
}

// Out on the flats when the curl passes: no barrel. A bottom turn up onto the
// face behind the curl: barrel.
console.log('-- entering from the flats');
for (const [label, pol] of [['stay out on the flats', () => ({ aim: [1, -0.3] })], ['bottom turn up into it', (r) => (r.xs < -3 || r.turnedUp ? (r.turnedUp = true, { aim: [0.35, 0.95] }) : { aim: [0.6, -0.8] })]]) {
  const r = createRider(); Object.assign(r, { xs: 1, t: 14.4, phi: -0.2, speed: 6 }); r.events = []; stepRider(r, {}, 0);
  let firstIn = null, i = 0;
  for (; i < 4 * 120; i++) {
    stepRider(r, pol(r), 1 / 120);
    if (r.tube && firstIn === null) firstIn = `entered at height ${(r.height ?? 0).toFixed(2)}, t=${r.t.toFixed(2)}`;
    if (r.mode === 'wipe') break;
  }
  console.log(label.padEnd(32), firstIn || 'never in the barrel', r.mode === 'wipe' ? '| WIPE: ' + r.wipeReason : '');
}
