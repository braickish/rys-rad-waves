// The face, its foot and the ramp out to the flats stay smooth with the run-out and scoop rules (wave.js runOut; the user,
// 2026-11-26: "make sure those are smooth curves", no elbows, no sudden moves). Every wave with a swell period, and a built
// break's shapes, each compared with itself without the rules:
//   in space: no kink (a change of direction over ~5 cm) more than 5° beyond the shape's own (or 20°), and while the wave
//     stands as an open face (to phase 0.9, the lip half a wave height or more behind the face's foot: inside a barrel that bend is the opening's own
//     design) the bend where the face meets the ramp no more than 20% tighter than without, or at least as wide as the face is tall
//   in time (every 0.01 of phase through the break): the face's foot, the lip's tip and the trough never change pace more than
//     without the rules (+1 cm): no jerks, no twitches; and never move more than twice as far in a step (+2 cm): no jumps
//   node test/smooth.mjs
import { applyBuilt } from '../src/waves/built.js';
import * as W from '../src/wave.js';

applyBuilt({ v: 1, mode: 'loop', side: 'left', length: 60, base: 8, H: 2.9, c: 5.2, swell: { H: 1.8, T: 16 }, profile: [{ s: 0, peel: 8, k: 0, H: 2.9, u: 3 }, { s: 60, peel: 8, k: 0, H: 2.9, u: 3 }] });
let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) fails++; };
const cp = new Float64Array(W.NP * 2), o = [0, 0], I = W.I;

function bend() {
  const pts = [];
  for (let t = I.FACE_UP + 0.5; t <= I.TROUGH + 0.9; t += 0.002) { W.crPoint(cp, t, o); if (!pts.length || Math.hypot(o[0] - pts[pts.length - 1][0], o[1] - pts[pts.length - 1][1]) > 0.05) pts.push([o[0], o[1]]); }
  let r = Infinity, kink = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const [a, b, c] = [pts[i - 1], pts[i], pts[i + 1]];
    let turn = Math.abs(Math.atan2(c[1] - b[1], c[0] - b[0]) - Math.atan2(b[1] - a[1], b[0] - a[0])); if (turn > Math.PI) turn = 2 * Math.PI - turn;
    const len = 0.5 * (Math.hypot(b[0] - a[0], b[1] - a[1]) + Math.hypot(c[0] - b[0], c[1] - b[1]));
    if (turn > 1e-6) r = Math.min(r, len / turn);
    kink = Math.max(kink, turn * 57.3);
  }
  return { r, kink };
}
function run(set) {
  let standR = Infinity, faceH = 0, kink = 0; const step = { foot: 0, tip: 0, trough: 0 }, pace = { foot: 0, tip: 0, trough: 0 }, prev = [], d = {};
  for (let s = -1; s <= 2.2 + 1e-9; s += 0.01) {
    W.withShape(set, () => W.controlPoints(s, cp));
    const b = bend(); kink = Math.max(kink, b.kink); if (s <= 0.9 && cp[I.FACE_LOW * 2] - cp[I.TIP * 2] >= 0.5 * (cp[I.CREST * 2 + 1] - cp[I.TROUGH * 2 + 1])) { standR = Math.min(standR, b.r); faceH = Math.max(faceH, cp[I.FACE_UP * 2 + 1] - cp[I.TROUGH * 2 + 1]); } // (open: the lip half a wave height or more behind the foot, as wave.js runOut has it)
    const now = { foot: cp[I.FACE_LOW * 2], tip: cp[I.TIP * 2 + 1], trough: cp[I.TROUGH * 2] };
    if (prev.length) for (const k in now) {
      const dk = now[k] - prev[prev.length - 1][k]; step[k] = Math.max(step[k], Math.abs(dk));
      if (d[k] != null) pace[k] = Math.max(pace[k], Math.abs(dk - d[k])); d[k] = dk;
    }
    prev.push(now);
  }
  return { standR, faceH, kink, step, pace };
}
for (const [id, sets] of [['point', [0]], ['queens', [0]], ['raglanPlus', [0, 1]], ['built', [0, 1, 2, 3, 4, 5, 6, 7]]]) {
  W.setWave(id);
  const per = W.WAVE.period;
  for (const set of sets.filter((i) => i < W.SHAPES.length)) {
    W.WAVE.period = 0; const a = run(set);
    W.WAVE.period = per; const b = run(set);
    const name = `${id} set ${set}`;
    // the wave drawn (built at scale 1, multiplied up: the GPU's tables) and the wave ridden (built at its scale) are the same
    // curve (the user, 2026-11-26: the board sank into the drawn water when the run-out didn't scale in proportion)
    { const S = W.WAVE.scale, a = new Float64Array(W.NP * 2), c = new Float64Array(W.NP * 2); let gap = 0;
      for (const s of [-0.5, 0, 0.5, 1, 1.5]) { W.withShape(set, () => W.controlPoints(s, a, 1)); W.withShape(set, () => W.controlPoints(s, c, S)); for (let q = 0; q < W.NP * 2; q++) gap = Math.max(gap, Math.abs(a[q] * S - c[q])); }
      check(gap < 0.01, `${name}: the wave drawn and the wave ridden agree (within ${(gap * 100).toFixed(1)} cm)`); }
    check(b.kink <= Math.max(20, a.kink + 5), `${name}: no kink (biggest ${b.kink.toFixed(1)}°, ${a.kink.toFixed(1)}° without the rules)`);
    if (a.standR < Infinity) check(b.standR >= 0.8 * a.standR || b.standR >= b.faceH, `${name}: the face's foot no tighter while it stands open, or a scoop as wide as the face is tall (radius ${b.standR.toFixed(2)} m, ${a.standR.toFixed(2)} m without; face ${b.faceH.toFixed(2)} m)`);
    for (const k of ['foot', 'tip', 'trough']) {
      check(b.step[k] <= Math.max(2 * a.step[k], a.step[k] + 0.02), `${name}: the ${k} moves smoothly (≤ ${b.step[k].toFixed(3)} m a step, ${a.step[k].toFixed(3)} without)`);
      check(b.pace[k] <= a.pace[k] + 0.01, `${name}: the ${k} never jerks (pace changes ≤ ${b.pace[k].toFixed(3)} m, ${a.pace[k].toFixed(3)} without)`);
    }
  }
  W.WAVE.period = per;
}
console.log(fails ? `\n${fails} failed` : '\nall smooth');
process.exit(fails ? 1 : 0);
