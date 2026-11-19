// Hang ten (Queens): walk to the nose, then hold a line at a given height on the face, and report pocket power,
// height, whether she stepped up to hang ten and how long she held it. Mid-face in the pocket should hang ten;
// low on the face, high by the lip, or out on the shoulder should stay hang five.
import { createRider, resetRider, stepRider, useWave } from '../src/rider.js';
const DT = 1 / 120;
function ride(goalH, secs = 8, sign = 1, label = '') {
  useWave('queens'); const r = createRider(); resetRider(r); r.xs = Number(process.env.XS ?? 0);
  let tenAt = null, tenSecs = 0, wiped = '', pkS = 0, hS = 0, n = 0, moves = [];
  for (let i = 0; i < secs / DT; i++) {
    const t = i * DT;
    // steer toward the goal height: aim the board a little up or down the face
    const want = Math.max(-0.5, Math.min(0.5, (goalH - r.height) * 3));
    const turn = Math.abs(want - r.phi) < 0.06 ? 0 : sign * Math.sign(want - r.phi);
    stepRider(r, { turn, walk: t > 0.2 && r.footGoal < 1 ? 1 : 0 }, DT);
    for (const e of r.events) if (e.type === 'move') moves.push(e.move);
    r.events.length = 0;
    if (r.mode === 'wipe') { wiped = r.wipeReason; break; }
    if (r.onNose) { pkS += r.pocket; hS += r.height; n++; }
    if (r.ten >= 1) { tenSecs += DT; if (tenAt === null) tenAt = t; }
  }
  console.log(`${label.padEnd(26)} on nose: pocket ${(pkS / n || 0).toFixed(2)} height ${(hS / n || 0).toFixed(2)} | hang ten ${tenAt === null ? 'never' : 'at ' + tenAt.toFixed(1) + 's, ' + tenSecs.toFixed(1) + 's held'} | ${moves.join('>')} ${wiped}`);
  return { tenSecs };
}
const sign = Number(process.env.SIGN || 1);
const res = {
  mid: ride(0.55, 9, sign, 'mid-face (0.55)'),
  low: ride(0.1, 8, sign, 'low on the face (0.1)'),
  high: ride(0.95, 8, sign, 'high by the lip (0.95)'),
};
const ok = res.mid.tenSecs > 1 && res.low.tenSecs === 0 && res.high.tenSecs === 0;
console.log(ok ? 'OK' : 'CHECK');
