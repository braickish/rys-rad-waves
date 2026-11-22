// Riding along the crest (the user, 2026-11-22, forever-on-top.jpg: positioned up by the lip you could stay there
// forever). A player-style rider holds a fixed height near the curl with small corrections; up near the crest the
// curl should catch you (or, on a longboard, you end up riding the whitewater, which pushes you along from the middle:
// `foamPush`), while mid-face you can hold the pocket indefinitely.
//   node test/crest.mjs [wave ...]
import { createRider, resetRider, stepRider, useWave, TUNE, topOfFace } from '../src/rider.js';
import { PEEL_SPEED } from '../src/wave.js';
import { nextWave, stepSea, seedSea } from '../src/sea.js';
const dt = 1 / 120, mph = (v) => (v * 2.237).toFixed(1);
const waves = process.argv.length > 2 ? process.argv.slice(2) : ['point', 'reef', 'queens'];
let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) fails++; };
function hold(H, xsGoal = 3, secs = 20, policy) {
  seedSea(1); nextWave();
  const r = createRider(); resetRider(r); r.events = [];
  r.xs = xsGoal; r.phi = 0; r.speed = PEEL_SPEED; r.t = TUNE.tBottom - H * (TUNE.tBottom - topOfFace(r.xs));
  stepRider(r, {}, 0);
  let i = 1;
  for (; i <= secs / dt; i++) {
    stepSea(dt);
    const a = policy ? policy(r) : Math.max(-0.5, Math.min(0.5, 4 * (H - r.height) - 0.3 * (xsGoal - r.xs)));
    stepRider(r, { aim: [Math.cos(a), Math.sin(a)] }, dt);
    if (r.mode !== 'surf') break;
  }
  return { t: Math.min(i, secs / dt) * dt, r };
}
const offCrest = (r) => r.mode !== 'surf' || r.height < 0.85 || r.foam > 0.3; // (the crest fade starts at 0.8: the highest line you can hold)
const fate = (t, r) => (r.mode === 'surf' ? `rode ${t.toFixed(0)} s` : `${r.mode} at ${t.toFixed(1)} s`);
for (const w of waves) {
  useWave(w);
  console.log(`-- ${w} (peel ${mph(PEEL_SPEED)} mph)`);
  for (const H of [0.5, 0.7, 0.9, 0.97]) {
    const { t, r } = hold(H);
    console.log(`  hold ${H}: ${fate(t, r)} (xs ${r.xs.toFixed(1)}, h ${r.height.toFixed(2)}, ${mph(r.speed)} mph, foam ${r.foam.toFixed(2)})`);
    if (H <= 0.7) check(r.mode === 'surf', `${w}: holding ${H} of the face in the pocket rides on`);
    else check(offCrest(r), `${w}: holding ${H} of the face, the curl catches up`);
  }
  // level along the line on the lip, no corrections
  const { t, r } = hold(0.99, 3, 20, () => 0);
  console.log(`  level on the lip: ${fate(t, r)} (xs ${r.xs.toFixed(1)}, h ${r.height.toFixed(2)})`);
  check(offCrest(r), `${w}: level on the lip doesn't sit there`);
}
console.log(fails ? 'SOME FAILED' : 'all ok');
process.exitCode = fails ? 1 : 0;
