// Barrel riding: you surf the face inside the tube as normal. Too deep =
// pinched, up into the roof = over the falls, way below the bottom = the lip
// lands on you, forward out = out.
import { createRider, stepRider, useWave, tubeDepth } from '../src/rider.js';
useWave('reef');
// S-turns between two heights on the face.
const sturns = (lo, hi, ang = 0.7) => { let up = true; return (r) => { if (up && r.height > hi) up = false; if (!up && r.height < lo) up = true; const a = up ? ang : -ang; return { aim: [Math.cos(a), Math.sin(a)] }; }; };
const runs = [
  ['no input (trim)', () => ({})],
  ['S-turns low-mid (0.1 - 0.6)', sturns(0.1, 0.6)],
  ['S-turns big (0.05 - 0.85)', sturns(0.05, 0.85)],
  ['S-turns into the roof (to 1.0)', sturns(0.1, 1.01)],
  ['straight up into the roof', sturns(0.1, 1.01, 1.45)],
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
