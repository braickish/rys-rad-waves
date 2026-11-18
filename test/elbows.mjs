// Elbow glitches on the skinned body: rides each wave, poses the MakeHuman body (body.js) every frame and reports
// how far each elbow jumps per frame against its shoulder (body frame) and how sharply each upper arm twists about
// itself per frame. Lower is smoother; sudden flips show as large maxima.
import { readFileSync } from 'node:fs';
import { createRider, resetRider, stepRider, useWave, frameAt, v3 } from '../src/rider.js';
import { createPose, surferObjects } from '../src/surfer.js';
import { parseSkinnedGLB } from '../src/glb.js';
import { createBody } from '../src/body.js';
const DT = 1 / 60;
const load = (f) => { const b = readFileSync(f); return createBody(parseSkinnedGLB(b.buffer.slice(b.byteOffset, b.byteOffset + b.length))); };
const bodies = { guy: load('assets/body/guy.glb'), girl: load('assets/body/girl.glb') };
const pt = (m, b, p) => [m[b * 16] * p[0] + m[b * 16 + 4] * p[1] + m[b * 16 + 8] * p[2] + m[b * 16 + 12], m[b * 16 + 1] * p[0] + m[b * 16 + 5] * p[1] + m[b * 16 + 9] * p[2] + m[b * 16 + 13], m[b * 16 + 2] * p[0] + m[b * 16 + 6] * p[1] + m[b * 16 + 10] * p[2] + m[b * 16 + 14]];
const col = (m, b, c) => [m[b * 16 + c * 4], m[b * 16 + c * 4 + 1], m[b * 16 + c * 4 + 2]];
let worst = 0;
for (const id of ['point', 'reef', 'queens']) {
  useWave(id); const B = bodies[id === 'queens' ? 'girl' : 'guy'], R = B.model.rest;
  let jumps = [], twists = [];
  for (const seed of [0, 1, 2]) {
    const r = createRider(); resetRider(r); const pose = createPose();
    let prevH = r.heading.slice(), turnS = 0, prev = null;
    for (let i = 0; i < 10 / DT && r.mode !== 'wipe'; i++) {
      const t = i * DT, w = 2.2 + seed * 0.5, turn = Math.sin(t * w) > 0.2 ? 1 : Math.sin(t * w) < -0.2 ? -1 : 0;
      for (let k = 0; k < 2; k++) stepRider(r, { turn, walk: i % 150 === 75 && k === 0 ? (i % 300 < 150 ? 1 : -1) : 0 }, DT / 2);
      const n = frameAt(r.xs, r.t).n;
      const tr = v3.dot(v3.cross(prevH, r.heading), n) / DT; turnS += (tr - turnS) * Math.min(1, DT * 10); prevH = r.heading.slice();
      surferObjects(pose, r, { n, e2: v3.norm(v3.cross(n, v3.norm(v3.rej([1, 0, 0], n)))), turn: turnS }, DT);
      if (!pose.J || r.mode !== 'surf' || r.falls) { prev = null; continue; }
      const m = B.update(pose.J), J = pose.J, up = J.bodyUp, fw = J.chest, lf = v3.cross(up, fw);
      const cur = {};
      for (const s of ['l', 'r']) {
        const ua = R['upperarm_' + s].index, la = R['lowerarm_' + s].index;
        const sh = pt(m, ua, R['upperarm_' + s].head), el = pt(m, la, R['lowerarm_' + s].head), d = v3.sub(el, sh);
        cur[s] = { el: [v3.dot(d, lf), v3.dot(d, up), v3.dot(d, fw)], z: col(m, ua, 2), y: col(m, ua, 1) };
      }
      if (prev) for (const s of ['l', 'r']) {
        const a = prev[s], b = cur[s];
        jumps.push(Math.hypot(b.el[0] - a.el[0], b.el[1] - a.el[1], b.el[2] - a.el[2]));
        const za = v3.norm(v3.rej(a.z, b.y)), zb = v3.norm(v3.rej(b.z, b.y)); // twist about the arm
        twists.push(Math.acos(Math.max(-1, Math.min(1, v3.dot(za, zb)))) * 57.3);
      }
      prev = cur;
    }
  }
  jumps.sort((a, b) => a - b); twists.sort((a, b) => a - b);
  const q = (a, p) => a[Math.floor(a.length * p)];
  console.log(`${id.padEnd(7)} elbow jump p99 ${(q(jumps, 0.99) * 100).toFixed(1)} cm, max ${(jumps.at(-1) * 100).toFixed(1)} cm | arm twist p99 ${q(twists, 0.99).toFixed(1)} deg, max ${twists.at(-1).toFixed(1)} deg/frame (${jumps.length} samples)`);
  worst = Math.max(worst, twists.at(-1));
}
