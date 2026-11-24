// The hand-drag stall's pose (frontside-barrel-stall / backside-barrel-stall in braickish/reference-images; the user,
// 2026-11-23): stick figures front-on and from the side, written to test/out/stallpose.png, and the dragging hand must meet
// the water. Frontside: stalling low on Pipe's steep face; backside: the same moment turned round (heading back, the wave
// behind you).
//   node test/stallpose.mjs
import { createRider, resetRider, stepRider, useWave, frameAt, v3 } from '../src/rider.js';
import { createPose, surferObjects } from '../src/surfer.js';
import { nextWave, stepSea, seedSea } from '../src/sea.js';
import { writeFileSync } from 'node:fs'; import { execSync } from 'node:child_process';
const out = process.argv[2] || 'test/out/stallpose.png';
let fails = 0; const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) fails++; };
const shots = [];
for (const [wave, line, back] of [['reef', 0.35, false], ['reef', 0.35, true]]) {
  let flipped = null;
  useWave(wave); seedSea(1); nextWave(); const r = createRider(); resetRider(r); r.events = []; stepRider(r, {}, 0); const pose = createPose();
  const DT = 1 / 120; let got = null;
  for (let i = 0; i < 4 / DT && !got; i++) {
    stepSea(DT); const inp = { aim: [1, Math.max(-0.4, Math.min(0.4, 2 * (line - r.height)))] };
    if (i === 120 || i === 200) inp.walk = -1; if (i > 200) inp.stallHold = true;
    stepRider(r, inp, DT);
    const n = frameAt(r.xs, r.t).n, e2 = v3.norm(v3.cross(n, v3.norm(v3.rej([1, 0, 0], n))));
    if (back && (r.handDrag || 0) > 0.95) { // (the same moment turned round: heading back toward the curl, the wave behind you: backside)
      const rb = { ...r, heading: v3.mul(r.heading, -1), vel: v3.mul(r.vel, -1), phi: r.phi + Math.PI, rideDir: -1 };
      for (let k = 0; k < 60; k++) surferObjects(pose, rb, { n, e2, turn: 0 }, DT);
      got = { J: pose.J, touch: pose.handTouch, n, side: 'heading back (backside)' }; break;
    }
    surferObjects(pose, r, { n, e2, turn: 0 }, DT);
    if (!back && (r.handDrag || 0) > 0.95 && pose.J && pose.handTouch) got = { J: pose.J, touch: pose.handTouch, n, side: back ? 'heading back (backside)' : 'down the line (frontside)' };
    if (r.mode !== 'surf') break;
  }
  if (got) { shots.push(got); check(Math.hypot(...v3.sub(got.touch, got.J.armB.end)) < 0.08, `${got.side}: the dragging hand meets the water`); const J = got.J, sh = J.shBack, d = Math.hypot(...v3.sub(got.touch, sh)); console.log(`${got.side}: torso.T ${v3.dot(J.torsoDir, J.T).toFixed(2)} chest.T ${v3.dot(J.chest, J.T).toFixed(2)} torso.up ${J.torsoDir[1].toFixed(2)} hip above feet ${(J.hip[1] - J.backFoot[1]).toFixed(2)} shoulder-to-touch ${d.toFixed(2)} m, hand to the water ${Math.hypot(...v3.sub(got.touch, J.armB.end)).toFixed(2)} m`); } else check(false, `a hand drag for ${back ? 'backside' : 'frontside'}`);
}
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${600 * shots.length}" height="1200"><rect width="100%" height="100%" fill="#fff"/>`;
shots.forEach((g, k) => {
  const J = g.J, up = [0, 1, 0];
  for (const [vi, view] of [[0, v3.mul(J.f, -1)], [1, v3.norm(v3.cross(J.f, up))]]) { // front-on (looking back up the board), side
    const right = v3.norm(v3.cross(up, view)), vup = v3.norm(v3.cross(view, right)), o = J.hip;
    const P = (p) => { const d = v3.sub(p, o); return [300 + k * 600 + v3.dot(d, right) * 220, 330 + vi * 600 - v3.dot(d, vup) * 220]; };
    const L = (a, b, c = '#000', w = 5) => { const A = P(a), B = P(b); svg += `<line x1="${A[0]}" y1="${A[1]}" x2="${B[0]}" y2="${B[1]}" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/>`; };
    const nose = v3.add(J.backFoot, v3.mul(J.f, 1.3)), tail = v3.add(J.backFoot, v3.mul(J.f, -0.35));
    L(tail, nose, '#999', 9); // board
    L(v3.add(g.touch, v3.mul(J.T, -1.2)), v3.add(g.touch, v3.mul(J.T, 0.6)), '#39c', 2); // the face across, through the touch
    for (const leg of [J.legB, J.legF]) { L(leg.root, leg.joint, '#246'); L(leg.joint, leg.end, '#246'); }
    const neck = v3.add(J.hip, v3.mul(J.torsoDir, 0.58)); L(J.hip, neck, '#000', 7);
    L(J.shBack, J.armB.joint, '#c33'); L(J.armB.joint, J.armB.end, '#c33'); // back arm red
    L(J.shFront, J.armF.joint, '#3a3'); L(J.armF.joint, J.armF.end, '#3a3'); // front arm green
    const H = P(v3.add(neck, v3.mul(J.headDir, 0.2))); svg += `<circle cx="${H[0]}" cy="${H[1]}" r="18" fill="none" stroke="#000" stroke-width="4"/>`;
    const Tc = P(g.touch); svg += `<circle cx="${Tc[0]}" cy="${Tc[1]}" r="8" fill="#39c"/>`;
    svg += `<text x="${k * 600 + 10}" y="${vi * 600 + 30}" font-size="22">${g.side}: ${vi ? 'side' : 'front-on'}</text>`;
  }
});
writeFileSync(out.replace('.png', '.svg'), svg + '</svg>'); execSync(`magick -font /System/Library/Fonts/Helvetica.ttc ${out.replace('.png', '.svg')} ${out}`);
process.exit(fails ? 1 : 0);
