// No bump in the flats behind the curl (the user, 2026-11-25: "make sure this can't happen"; the flats are a fixed floor at
// sea level, wave.js onFloor: no drawdown dipping under it anywhere, which left a ridge where shapes with and without one met). Out on the flats in front of a
// breaking wave the water only ever fills in: from the drawdown in front of the face up toward sea level as the whitewater
// arrives. If at any spot it rises and then drops again while the wave breaks (phase 0.8 -> 2.2), that spot stands out as a
// shelf of water sticking out ahead of the whitewater behind the curl. Checked on every shape set of every wave, built
// waves' half-barrels, barrel and ledge included, at scale 1 (sizes scale it), z 6-14 m in front of the crest, while the
// whitewater's front is still 2 m or more short of the spot.
//   node test/flats.mjs
import { WAVES, HIDDEN } from '../src/waves/index.js';
import { applyBuilt } from '../src/waves/built.js';
import * as W from '../src/wave.js';

const TOL = 0.03; // (m at scale 1: how far the flats may drop back after rising)
// (a bump comes and goes quickly: a drop within WINDOW of phase. The sim shapes' toe ebbs ~5 cm over a whole unit of phase
// (Trestles/Dynamic set 2), too slow to stand out)
const WINDOW = 0.4;
let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) fails++; };
const cp = new Float64Array(W.NP * 2), o = [0, 0];
// (the highest water over z: the curve's top crossing there; and the whitewater's front: the furthest shoreward the water
// stands FRONT_Y over sea level. Only the flats ahead of that front are checked: the bore itself rises and settles)
const FRONT_Y = 0.15;
let pts = [];
function trace() { pts = []; for (let t = 0; t <= W.NP - 1; t += 0.01) { W.crPoint(cp, t, o); pts.push(o[0], o[1]); } }
function yAt(z) {
  let best = -Infinity;
  for (let k = 2; k < pts.length; k += 2) {
    const z0 = pts[k - 2], y0 = pts[k - 1], z1 = pts[k], y1 = pts[k + 1];
    if ((z0 - z) * (z1 - z) <= 0 && z0 !== z1) best = Math.max(best, y0 + (y1 - y0) * (z - z0) / (z1 - z0));
  }
  return best;
}
function frontZ() { let f = -Infinity; for (let k = 0; k < pts.length; k += 2) if (pts[k + 1] > FRONT_Y) f = Math.max(f, pts[k]); return f; }
applyBuilt({ v: 1, mode: 'loop', side: 'left', length: 60, base: 8, H: 3.5, c: 7, profile: [{ s: 0, peel: 8, k: 0, H: 3.5, u: 3 }, { s: 60, peel: 8, k: 0, H: 3.5, u: 4 }] });
for (const def of [...WAVES, ...HIDDEN]) {
  W.setWave(def.id);
  W.SHAPES.forEach((_, i) => {
    let worst = { d: 0 };
    for (let z = 6; z <= 14; z += 1) {
      const seen = [];
      for (let s = 0.8; s <= 2.2 + 1e-9; s += 0.02) {
        W.withShape(i, () => W.controlPoints(s, cp, 1)); trace();
        if (frontZ() > z - 2) break; // (the whitewater, and the foot of the lip landing, are about here)
        const y = yAt(z);
        for (const [s0, y0] of seen) if (s - s0 <= WINDOW + 1e-9 && y0 - y > worst.d) worst = { d: y0 - y, z, s, at: s0 };
        seen.push([s, y]);
      }
    }
    // (the floor: the flats, in front from the face's foot and behind the back of the crest, never under sea level, at any phase)
    let low = { y: 0 };
    for (let s = -14; s <= 14; s += 0.05) {
      W.withShape(i, () => W.controlPoints(s, cp, 1));
      for (let t = 0; t <= W.NP - 1; t += 0.02) { if (t > W.I.CREST_BACK && t < W.I.FACE_LOW) continue; W.crPoint(cp, t, o); if (o[1] < low.y) low = { y: o[1], s, t }; }
    }
    check(low.y >= -0.005, `${def.id} set ${i}: the flats sit on sea level` + (low.y < -0.005 ? ` (${low.y.toFixed(2)} at s ${low.s.toFixed(2)}, t ${low.t.toFixed(2)})` : ''));
    check(worst.d <= TOL, `${def.id} set ${i}: the flats only fill in` + (worst.d > 0.005 ? ` (drop ${worst.d.toFixed(2)} at z ${worst.z}, s ${worst.s.toFixed(2)} after rising to s ${worst.at.toFixed(2)})` : ''));
  });
}
console.log(fails ? 'SOME FAILED' : 'all passed');
process.exit(fails ? 1 : 0);
