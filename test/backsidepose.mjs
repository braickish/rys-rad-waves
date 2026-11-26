// The backside bottom turn's pose (backside-1..3 in braickish/reference-images; the user, 2026-11-26: the surfer turned the
// hips and shoulders to the face too much, too soon). Rides a bottom turn on Raglan backside (regular foot on a left) and
// frontside (for comparison), and draws stick figures as seen from the beach at four moments: setting up (nose down the
// face), the bottom of the arc, coming up (nose ~30 deg up), climbing out (~55 deg). Numbers: how far the chest and the
// hips have turned toward the wave (0 = square to the board's line, + toward the wave), and where the hands are.
//   node test/backsidepose.mjs [out.png]
import { createRider, stepRider, useWave, frameAt, v3 } from '../src/rider.js';
import { createPose, surferObjects, setSurferStance } from '../src/surfer.js';
import { setWaveSize, startRide, stepRide } from '../src/wave.js';
import { writeFileSync } from 'node:fs'; import { execSync } from 'node:child_process';
const out = process.argv[2] || 'test/out/backsidepose.png';
const DT = 1 / 120, deg = (x) => Math.round(x * 57.3);
const rows = [];
for (const stance of ['regular', 'goofy']) { // (Raglan is a left: goofy is frontside, regular backside)
  useWave('point'); setSurferStance(stance); setWaveSize(1); startRide(); for (let i = 0; i < 240; i++) stepRide(DT);
  const r = createRider(); Object.assign(r, { xs: 2, t: 10.5, phi: -1.0, speed: 20 / 2.237 }); r.events = []; stepRider(r, {}, 0);
  const pose = createPose(); let prevH = r.heading.slice(), turnS = 0;
  const marks = [[-0.75, 'setting up'], [0, 'bottom of the arc'], [0.5, 'coming up'], [0.95, 'climbing out']]; let mi = 0;
  const shots = [];
  for (let i = 0; i < 1.6 / DT && r.mode === 'surf' && mi < marks.length; i++) {
    stepRide(DT); stepRider(r, { turn: 1 }, DT);
    const n = frameAt(r.xs, r.t).n, e2 = v3.norm(v3.cross(n, v3.norm(v3.rej([1, 0, 0], n))));
    const tr = v3.dot(v3.cross(prevH, r.heading), n) / DT; turnS += (tr - turnS) * Math.min(1, DT * 10); prevH = r.heading.slice();
    surferObjects(pose, r, { n, e2, turn: turnS }, DT);
    if (pose.J && Math.sin(r.phi) >= Math.sin(marks[mi][0])) {
      const J = pose.J, Wv = v3.mul(e2, 1); // (toward the wave: up the face)
      const side = v3.norm(v3.rej(Wv, J.f)); // (across the board, toward the wave)
      const facing = (d) => deg(Math.asin(Math.max(-1, Math.min(1, v3.dot(v3.norm(v3.rej(d, J.bodyUp)), side))))); // + toward the wave
      const hipAx = v3.norm(v3.sub(J.legF.root, J.legB.root)), hipFacing = v3.norm(v3.cross(J.bodyUp, hipAx));
      const hipN = v3.dot(hipFacing, J.chest) < 0 ? v3.mul(hipFacing, -1) : hipFacing; // (the hips' front, the chest's side)
      const hand = (a) => `${v3.dot(v3.sub(a.end, J.hip), J.f).toFixed(2)} fwd ${v3.dot(v3.sub(a.end, J.hip), side).toFixed(2)} waveward ${(a.end[1] - J.backFoot[1]).toFixed(2)} up`;
      shots.push({ J, label: `${stance === 'regular' ? 'BACKSIDE' : 'frontside'}: ${marks[mi][1]} (nose ${deg(r.phi)}°)` });
      rows.push(`${stance === 'regular' ? 'backside ' : 'frontside'} ${marks[mi][1].padEnd(18)} nose ${String(deg(r.phi)).padStart(4)}°  chest ${String(facing(J.chest)).padStart(4)}°  hips ${String(facing(hipN)).padStart(4)}° toward the wave | front hand ${hand(J.armF)} | back hand ${hand(J.armB)}`);
      mi++;
    }
  }
  rows.push('');
  // Stick figures from the beach (looking up the face at the wave), four across.
  let svg = '';
  shots.forEach((g, k) => {
    const J = g.J, up = [0, 1, 0], view = [0, 0, -1]; // (the beach looks out to sea: -z)
    const right = v3.norm(v3.cross(up, view)), vup = up, o = J.hip;
    const P = (p) => { const d = v3.sub(p, o); return [200 + k * 400 + v3.dot(d, right) * 150, 260 - v3.dot(d, vup) * 150]; };
    const L = (a, b, c = '#000', w = 5) => { const A = P(a), B = P(b); svg += `<line x1="${A[0]}" y1="${A[1]}" x2="${B[0]}" y2="${B[1]}" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/>`; };
    L(v3.add(J.backFoot, v3.mul(J.f, -0.35)), v3.add(J.backFoot, v3.mul(J.f, 1.3)), '#999', 9);
    for (const leg of [J.legB, J.legF]) { L(leg.root, leg.joint, '#246'); L(leg.joint, leg.end, '#246'); }
    L(J.legB.root, J.legF.root, '#246', 7);
    const neck = v3.add(J.hip, v3.mul(J.torsoDir, 0.58)); L(J.hip, neck, '#000', 7);
    L(J.shBack, J.shFront, '#000', 5);
    L(J.shBack, J.armB.joint, '#c33'); L(J.armB.joint, J.armB.end, '#c33');
    L(J.shFront, J.armF.joint, '#3a3'); L(J.armF.joint, J.armF.end, '#3a3');
    L(neck, v3.add(neck, v3.mul(J.chest, 0.25)), '#f90', 4); // (where the chest faces)
    const H = P(v3.add(neck, v3.mul(J.headDir, 0.2))); svg += `<circle cx="${H[0]}" cy="${H[1]}" r="14" fill="none" stroke="#000" stroke-width="4"/>`;
    svg += `<text x="${k * 400 + 8}" y="24" font-size="15">${g.label}</text>`;
  });
  rows.svgs = (rows.svgs || []).concat([svg]);
}
setSurferStance(null);
console.log(rows.join('\n'));
const svgs = rows.svgs;
let all = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="${420 * svgs.length}"><rect width="100%" height="100%" fill="#fff"/>`;
svgs.forEach((s, i) => { all += `<g transform="translate(0 ${i * 420})">${s}</g>`; });
writeFileSync(out.replace('.png', '.svg'), all + '</svg>'); execSync(`magick -font /System/Library/Fonts/Helvetica.ttc ${out.replace('.png', '.svg')} ${out}`);
console.log(`(stick figures from the beach: ${out}; red back arm, green front arm, orange where the chest faces)`);
