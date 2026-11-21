// Longboard tail turns by speed (Queens; with ENERGY=1 the pivot share falls with speed, the user, 2026-11-21: slow
// 85% pivot away from the face / 50% toward it, fast 60% / 35%). From mid-face, riding level along the wave, hold a
// turn down the face (away) or up it (toward) for 70 degrees: the pivot share reached, how long it took, speed in -> out.
// The middle of the board (all rail) for comparison.
//   ENERGY=1 node test/pivotshare.mjs
import { createRider, stepRider, useWave, TUNE } from '../src/rider.js';
const dt = 1 / 120, mph = (v) => (v * 2.237).toFixed(1);
useWave('queens');
for (const speedMph of [7, 11, 15]) {
  const row = [];
  for (const [dir, turn] of [['away', -1], ['toward', 1]]) {
    for (const [spot, foot] of [['tail', -1], ['middle', 0]]) {
      const r = createRider(); r.xs = 2; r.t = (TUNE.tTop + TUNE.tBottom) / 2; r.phi = 0; r.speed = speedMph / 2.237;
      r.foot = r.footGoal = foot; r.events = []; stepRider(r, {}, 0);
      const v0 = r.speed; let pv = 0, i = 0;
      for (; i < 3 / dt && Math.abs(r.phi) < 1.22; i++) { stepRider(r, { turn }, dt); pv = Math.max(pv, r.pivot || 0); if (r.mode !== 'surf') break; }
      row.push(`${spot} ${spot === 'tail' ? (100 * pv).toFixed(0) + '% pivot, ' : ''}${(i * dt).toFixed(2)}s, ${mph(v0)} -> ${mph(r.speed)}`);
    }
    row.push('|');
  }
  console.log(`${String(speedMph).padStart(2)} mph  away: ${row.slice(0, 2).join('; ')}  |  toward: ${row.slice(3, 5).join('; ')}`);
}
