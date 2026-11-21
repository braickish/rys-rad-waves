// Shortboard bottom turns at low speed (rider.js `skidDriveK`; the user, 2026-11-21): below ~17 mph a bottom
// turn runs on the minimum turn rate, faster than a carve at that speed, so part of it is the tail skidding round and
// drives at skidDriveK of a carve. From low on the face pointing down, hold a turn up the face until the nose points
// ~30 deg up it: the skid share, the turn drive banked, speed in -> out. NOSKID=1: every radian drives in full.
//   node test/skid.mjs [wave ...]
import { createRider, stepRider, useWave, TUNE } from '../src/rider.js';
const dt = 1 / 120, mph = (v) => (v * 2.237).toFixed(1);
const waves = process.argv.length > 2 ? process.argv.slice(2) : ['point', 'reef', 'trestles', 'peak'];
for (const w of waves) {
  useWave(w); if (process.env.NOSKID) TUNE.skidDriveK = null;
  const row = [];
  for (const v of [10, 13, 17]) {
    const r = createRider(); r.xs = 2; r.t = TUNE.tBottom - 0.6; r.phi = -0.9; r.speed = v / 2.237; r.events = []; stepRider(r, {}, 0);
    const v0 = r.speed; let sk = 0, n = 0, bank = 0, i = 0;
    for (; i < 2 / dt && Math.sin(r.phi) < 0.5; i++) { const b0 = r.driveBank; stepRider(r, { turn: 1 }, dt); sk += r.skid || 0; n++; if (r.driveBank > b0) bank += r.driveBank - b0; if (r.mode !== 'surf') break; }
    row.push(`${v} mph: skid ${(100 * sk / Math.max(1, n)).toFixed(0)}%, drive ${bank.toFixed(2)}, -> ${mph(r.speed)} in ${(i * dt).toFixed(2)}s`);
  }
  console.log(`${w.padEnd(8)} ${row.join(' | ')}`);
}
