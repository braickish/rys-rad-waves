// The water behind the curl is placed by when it broke (wave.js behindDist; the user, 2026-11-23): on a wave peeling
// steadily at its own pace it looks just as it did by distance; behind a fast section a long stretch is at the same stage.
//   node test/phasetime.mjs
import { applyBuilt } from '../src/waves/built.js';
import * as W from '../src/wave.js';

let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) fails++; };
const run = (profile, secs) => {
  applyBuilt({ v: 1, mode: 'full', side: 'left', length: 400, base: 7.6, H: 3.5, profile });
  W.setWave('built');
  for (let i = 0; i < secs * 120; i++) W.stepRide(1 / 120);
};
const old = (xs) => -xs / (W.WAVE.phase.behind + (W.WAVE.phase.ahead - W.WAVE.phase.behind) * (() => { const f = Math.min(1, Math.max(0, (xs + 4) / 8)); return f * f * (3 - 2 * f); })());

// steady at the base pace
run([{ s: 0, peel: 7.6, k: 0, H: 3.5 }, { s: 400, peel: 7.6, k: 0, H: 3.5 }], 10);
let worst = 0; for (let xs = 20; xs >= -60; xs -= 0.5) worst = Math.max(worst, Math.abs(W.phaseAt(xs) - old(xs)));
check(worst < 1e-3, `steady wave: phase as before (worst diff ${worst.toFixed(5)})`);

// a fast section: 7.6 m/s, then 20 m/s from 60 to 140 m, then 7.6 again; look just after the curl leaves it
run([{ s: 0, peel: 7.6, k: 0, H: 3.5 }, { s: 60, peel: 7.6, k: 0, H: 3.5 }, { s: 62, peel: 20, k: 0, H: 3.5 }, { s: 138, peel: 20, k: 0, H: 3.5 }, { s: 140, peel: 7.6, k: 0, H: 3.5 }, { s: 400, peel: 7.6, k: 0, H: 3.5 }], 60 / 7.6 + 80 / 20 + 1);
const c = W.RIDGE.c, at = (X) => W.phaseAt(X - c);
console.log(`curl at ${c.toFixed(1)} m; phase at 140/120/100/80/62 m: ${[140, 120, 100, 80, 62].map((X) => at(X).toFixed(2)).join(' / ')}`);
const want = (138 - 62) / 20 / (W.WAVE.phase.behind / 7.6); // (76 m at 20 m/s, in phase units at the wave's own pace)
check(Math.abs(at(62) - at(138) - want) < 0.15, `the fast section broke nearly as one: phase spread over its 76 m ${(at(62) - at(138)).toFixed(2)} (its time ${want.toFixed(2)}; by distance it was ${((138 - 62) / W.WAVE.phase.behind).toFixed(2)})`);
check(Math.abs(at(40) - at(60) - 20 / W.WAVE.phase.behind) < 0.05, `before it, the plain wave spreads out as usual (${(at(40) - at(60)).toFixed(2)} over 20 m)`);
process.exit(fails ? 1 : 0);
