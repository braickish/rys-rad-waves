// Competition judging (src/judging.js; the user, 2026-11-22: WSL-style, on with ?judge). Synthetic rides check each
// criterion moves the score the right way and the scale behaves (9+ rare, grades, best two), then a pump bot on Raglan+
// is judged from the real ride log.
//   node test/judging.mjs
import { createRideLog, logStep, scoreRide, heatTotal, gradeOf, JUDGES } from '../src/judging.js';
let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) fails++; };
// a ride: [kind, t, extra]; in the pocket at mid-face unless said, speed kept, ending clean
const ride = (moves, { end = 'out', flow = 1.0, stall = 0, T = 20 } = {}) => {
  const log = createRideLog(); log.time = T; log.n = 100; log.speedRatio = 100 * flow; log.stall = stall;
  log.moves = moves.map(([kind, t, x = {}]) => ({ kind, t, speed: 10, after: 10, pocket: 1, height: 0.6, stalled: false, ...x }));
  log.end = end ? { t: T, fall: end === 'fall' } : null;
  return log;
};
const S = (log, ctx = {}) => scoreRide(log, { seed: 7, ...ctx });
const good = S(ride([['bottomTurn', 1], ['snap', 2.5], ['bottomTurn', 4], ['roundhouse', 5.5], ['bottomTurn', 7], ['snap', 8.5]]));
console.log(`good ride: ${good.score} ${good.grade} (raw ${good.raw.toFixed(1)}) "${good.sheet}" judges ${good.judges.map((j) => j.score + (j.dropped ? '*' : '')).join(' ')}`);
check(good.score >= 4.5 && good.score <= 7, 'snap - cutback - snap in the pocket scores good (~5-6.5)');
const two = S(ride([['bottomTurn', 1], ['floater', 2.5], ['snap', 4]]));
console.log(`two hits: ${two.score} ${two.grade} (raw ${two.raw.toFixed(1)})`);
check(two.score >= 2 && two.score < 5, 'a floater and a snap is fair (two maneuvers isn\'t a good wave)');
check(good.judges.filter((j) => j.dropped).length === 2, 'the high and the low are dropped');
check(Math.abs(good.score - good.judges.filter((j) => !j.dropped).reduce((a, j) => a + j.score, 0) / 3) < 0.006, 'the score is the average of the other three');
// difficulty: air > snap > cutback > bottom turn
const one = (k, x) => S(ride([[k, 2, x]])).raw;
check(one('air', { spins: 0 }) > one('snap') && one('snap') > one('roundhouse') && one('roundhouse') > one('bottomTurn'), 'difficulty: air > snap > cutback > bottom turn');
// criticality: in the pocket at the lip beats out on the shoulder
check(one('snap', { pocket: 1, height: 0.9 }) > 1.5 * one('snap', { pocket: 0, height: 0.4 }), 'criticality: a snap in the pocket at the lip is worth much more than one on the shoulder');
// execution: sketchy landing ~half; losing speed costs; a fall right after voids it
check(Math.abs(one('air', { spins: 180, backwards: true }) / one('air', { spins: 180 }) - 0.5) < 0.02, 'execution: a sketchy (backwards) landing halves the air');
check(one('snap', { after: 5 }) < 0.8 * one('snap'), 'execution: losing half your speed out of a snap costs');
check(S(ride([['snap', 19.8]], { end: 'fall' })).items[0].value === 0, 'execution: falling straight after a maneuver voids it');
// combination: linked beats spaced; a stall breaks the chain
const linked = S(ride([['snap', 1], ['roundhouse', 2.5], ['reentry', 4]])).raw, spaced = S(ride([['snap', 1], ['roundhouse', 5], ['reentry', 10]])).raw;
const stalled = S(ride([['snap', 1], ['roundhouse', 2.5, { stalled: true }], ['reentry', 4, { stalled: true }]])).raw;
check(linked > 1.1 * spaced && Math.abs(stalled - spaced) < 0.01, 'combination: linked maneuvers grow a multiplier; a stall breaks the chain');
// variety: three identical snaps worth much less than snap, cutback, air
const same = S(ride([['snap', 1], ['snap', 5], ['snap', 9]])).raw, mixed = S(ride([['snap', 1], ['roundhouse', 5], ['air', 9, { spins: 0 }]])).raw;
check(same < 0.7 * mixed, `variety: three snaps (${same.toFixed(1)}) much less than snap, cutback, air (${mixed.toFixed(1)})`);
// innovation: new this session pays
check(S(ride([['reentry', 2]])).raw > S(ride([['reentry', 2]]), { seen: new Set(['reentry']) }).raw, 'innovation: a maneuver new this session scores more');
// flow
check(S(ride([['snap', 2]], { flow: 1.2 })).raw > S(ride([['snap', 2]], { flow: 0.7, stall: 6 })).raw, 'flow: a fast, smooth ride scores more than a slow, stalling one');
// the scale: 9+ is hard; a huge ride gets there; grades
const huge = S(ride([['bottomTurn', 1], ['air', 2.5, { spins: 360 }], ['barrel', 8, { time: 3, depth: 0.7, made: true }], ['reentry', 10], ['snap', 11.5], ['rebound180', 13]], { flow: 1.25 }));
console.log(`huge ride: ${huge.score} ${huge.grade} (raw ${huge.raw.toFixed(1)}) "${huge.sheet}"`);
check(huge.score >= 8.5, 'a 360 air, a deep barrel and three linked hits is excellent');
const hugeish = S(ride([['air', 2.5, { spins: 180 }], ['snap', 4], ['roundhouse', 5.5], ['snap', 7]], { flow: 1.1 }));
check(hugeish.score < 9, `9+ is hard: an air reverse and three hits is ${hugeish.score}`);
check(gradeOf(1.9) === 'Poor' && gradeOf(4.9) === 'Fair' && gradeOf(6.4) === 'Good' && gradeOf(7.9) === 'Very good' && gradeOf(8) === 'Excellent', 'grades: poor / fair / good / very good / excellent');
// conditions: the same ride scores higher on a small day
check(S(ride([['snap', 2], ['roundhouse', 3.5]]), { size: 0.4 }).score > S(ride([['snap', 2], ['roundhouse', 3.5]]), { size: 1.8 }).score, 'conditions: the same ride scores higher in small surf');
// judges' biases: the air judge likes airs
const airy = S(ride([['air', 2, { spins: 180 }], ['air', 6, { spins: 0 }]]));
check(airy.judges[0].score >= Math.max(...airy.judges.slice(1).map((j) => j.score)) - 0.3, 'J1 (airs) scores an air ride at or near the top');
// heat: best two
const h = heatTotal([3.2, 7.83, 6.7, 5.1]);
check(h.total === 14.53 && h.top.join() === '7.83,6.7', 'heat: the best two waves count');
// a real ride: the pump bot on Raglan+, judged from its log
{
  const R = await import('../src/rider.js'), W = await import('../src/wave.js'), Sea = await import('../src/sea.js');
  R.useWave('raglanPlus'); Sea.seedSea(3); Sea.nextWave();
  const r = R.createRider(); R.resetRider(r); r.events = []; R.stepRider(r, {}, 0);
  const log = createRideLog(); let up = false; const dt = 1 / 120;
  for (let i = 0; i < 30 / dt; i++) {
    Sea.stepSea(dt);
    if (up && r.height > 0.8) up = false; if (!up && r.height < 0.15) up = true;
    const inp = Math.cos(r.phi) < 0 ? { aim: [1, -0.3] } : r.xs < -1 ? { aim: [1, 0.6] } : r.xs > 6 ? { aim: [-0.2, up ? 1 : -1] } : { tilt: up ? 1 : -1 };
    R.stepRider(r, inp, dt); logStep(log, r, dt, W.PEEL_SPEED);
    if (r.mode !== 'surf' && r.mode !== 'air' && r.wipeTimer <= 0) break;
  }
  const res = scoreRide(log, { seed: 1 });
  console.log(`pump bot on Raglan+: ${log.moves.length} maneuvers, ${res.score} ${res.grade}, flow x${res.flow.toFixed(2)}, "${res.sheet}"`);
  check(log.moves.length > 0 && res.score > 0 && res.score < 9, 'a real ride logs its maneuvers and scores on the scale');
}
console.log(fails ? 'SOME FAILED' : 'all ok');
process.exitCode = fails ? 1 : 0;
