// Water up the face from physics (rider.js `?flow` / FLOW=1, the user, 2026-11-21): for each wave, c (from the face
// height), and in the pocket (xs 1.5) at the bottom / mid / top of the face: the water's speed up the face q, the speed
// that holds the pocket there (sqrt(peel^2 + q^2)) and the angle down the face you point to hold that height.
//   FLOW=1 node test/flow.mjs
import { createRider, stepRider, useWave, TUNE, topOfFace, waveC, FLOW } from '../src/rider.js';
import { PEEL_SPEED, setWaveSize, WAVE, startRide, stepRide } from '../src/wave.js';
if (!FLOW) console.log('(FLOW is off: run with FLOW=1)');
const mph = (v) => (v * 2.237).toFixed(0);
for (const w of ['point', 'reef', 'queens', 'trestles', 'dynamic']) {
  useWave(w); setWaveSize(1); if (WAVE.bar) { startRide(); for (let i = 0; i < 6 * 120; i++) stepRide(1 / 120); }
  const { c } = waveC(); const top = topOfFace(1.5); const row = [];
  for (const [lab, h] of [['bottom', 0.1], ['mid', 0.5], ['top', 0.85]]) {
    const r = createRider(); Object.assign(r, { xs: 1.5, t: TUNE.tBottom - (TUNE.tBottom - top) * h, phi: 0, speed: PEEL_SPEED }); r.events = []; stepRider(r, {}, 0);
    const q = r.waterUp ?? 0, v = Math.hypot(PEEL_SPEED, q);
    row.push(`${lab} q ${q.toFixed(1)} m/s, hold ${mph(v)} mph pointing ${(Math.atan2(q, PEEL_SPEED) * 57.3).toFixed(0)} deg down`);
  }
  console.log(`${w.padEnd(8)} c ${c.toFixed(1)} m/s, peel ${PEEL_SPEED.toFixed(1)} (${mph(PEEL_SPEED)} mph), faceFlow was ${TUNE.faceFlow}: ${row.join(' | ')}`);
}
