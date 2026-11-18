// Arm smoothness: how jerky the hands move relative to the shoulders while riding (both surfers' poses).
// Rides each wave with S-turns (and the walk / shuffle keys) and reports the hands' frame-to-frame jerk in the
// body's frame: the 99th percentile and the max of |second difference| per step (m), lower is smoother.
import { createRider, resetRider, stepRider, useWave, frameAt, v3 } from '../src/rider.js';
import { createPose, surferObjects } from '../src/surfer.js';
const DT = 1 / 60;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
let report = [];
for (const id of ['point', 'reef', 'queens']) {
  useWave(id); const r = createRider(); resetRider(r); const pose = createPose();
  let prevH = r.heading.slice(), turnS = 0, hist = [], jerks = [];
  for (let i = 0; i < 12 / DT && r.mode !== 'wipe'; i++) {
    const t = i * DT, turn = Math.sin(t * 2.6) > 0.2 ? 1 : Math.sin(t * 2.6) < -0.2 ? -1 : 0;
    for (let k = 0; k < 2; k++) stepRider(r, { turn, walk: i % 180 === 90 && k === 0 ? (i % 360 < 180 ? 1 : -1) : 0 }, DT / 2);
    const n = frameAt(r.xs, r.t).n;
    const tr = v3.dot(v3.cross(prevH, r.heading), n) / DT; turnS += (tr - turnS) * Math.min(1, DT * 10); prevH = r.heading.slice();
    surferObjects(pose, r, { n, e2: v3.norm(v3.cross(n, v3.norm(v3.rej([1, 0, 0], n)))), turn: turnS }, DT);
    const J = pose.J; if (!J || r.mode !== 'surf' || r.falls) { hist = []; continue; } // (riding only: tucked over the falls the hands jump to the shins on purpose)
    const up = J.bodyUp, fw = J.chest, lf = v3.cross(up, fw);
    const loc = (p, sh) => { const d = sub(p, sh); return [dot(d, lf), dot(d, up), dot(d, fw)]; };
    const h = [...loc(J.armF.end, J.shFront), ...loc(J.armB.end, J.shBack)];
    hist.push(h);
    if (hist.length >= 3) { const [a, b, c] = hist.slice(-3); let m = 0; for (let k = 0; k < 6; k += 3) m = Math.max(m, Math.hypot(c[k] - 2 * b[k] + a[k], c[k + 1] - 2 * b[k + 1] + a[k + 1], c[k + 2] - 2 * b[k + 2] + a[k + 2])); jerks.push(m); }
  }
  jerks.sort((a, b) => a - b);
  report.push(`${id.padEnd(7)} hand jerk p99 ${(jerks[Math.floor(jerks.length * 0.99)] * 1000).toFixed(1)} mm, max ${(jerks[jerks.length - 1] * 1000).toFixed(1)} mm (${jerks.length} frames)`);
}
console.log(report.join('\n'));
