// Score checks (src/ride-check.js; accounts plan task 15): a real ride passes; doctored ones are flagged, each for its
// reason. node test/ride-check.mjs
import * as R from '../src/rider.js';
import * as W from '../src/wave.js';
import * as S from '../src/sea.js';
import { createRideLog, logStep, scoreRide } from '../src/judging.js';
import { createRecording, recordStep, finishRecording, encodeRecording, decodeRecording } from '../src/replay.js';
import { checkRide, DRIFT_OK } from '../src/ride-check.js';
import { judgeSeed } from '../src/heat.js';

let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) fails++; };
const dt = 1 / 120;

// A heat's first wave, ridden by a pocket bot, recorded and judged as the game does.
function ride(wave, heatSeed) {
  R.useWave(wave); S.seedSea(heatSeed); S.nextWave();
  const r = R.createRider(); R.resetRider(r);
  const rec = createRecording({ wave, built: null, seed: S.SEA.seed, n: S.SEA.n, params: {} }), log = createRideLog();
  let up = false;
  for (let i = 0; i < 120 * 60; i++) {
    const y = r.pos[1]; if (up && y > 2.6) up = false; if (!up && y < 1) up = true;
    const inp = r.xs > 6 ? { aim: [-0.6, up ? 0.8 : -0.5] } : r.xs < -1 ? { aim: [1, up ? 0.5 : -0.6], pump: !up } : { tilt: up ? 0.9 : -0.8, pump: !up };
    recordStep(rec, inp, r); S.stepSea(dt); R.stepRider(r, inp, dt); logStep(log, r, dt, W.PEEL_SPEED);
    if (r.mode === 'wipe' && r.wipeTimer <= 0) break;
  }
  const judge = { seed: judgeSeed(heatSeed, 0), seen: [] };
  const score = scoreRide(log, { size: (W.WAVE.sizeK || 1) * W.SIZE, seed: judge.seed, seen: new Set() }).score;
  finishRecording(rec, r, { score: 0, judged: { score }, judge });
  return { text: encodeRecording(rec), score };
}
const fresh = (t) => decodeRecording(t);

for (const wave of ['point', 'reef', 'queens']) {
  const { text, score } = ride(wave, 4242);
  const v = checkRide(fresh(text), { score, waveNo: 1, heatSeed: 4242, wave });
  check(v.ok && v.drift === 0 && v.score === score, `${wave}: a real ride passes (judged ${score}, re-run ${v.score}, drift ${v.drift})`);
}

const { text, score } = ride('point', 777);
const ok = { score, waveNo: 1, heatSeed: 777, wave: 'point' };
const flags = (rec, expect = ok) => checkRide(rec, expect).reasons.join(',');
check(flags(fresh(text), { ...ok, score: score + 1.5 }) === 'score', `submitted 1.5 more than it scores: "score"`);
check(flags(fresh(text), { ...ok, score: score + 0.03 }) === '', 'a hair off (another engine judging a move a hair differently): passes');
check(flags(fresh(text), { ...ok, wave: 'reef' }) === 'wrong_wave', 'ridden on another wave: "wrong_wave"');
check(flags(fresh(text), { ...ok, heatSeed: 778 }) === 'wrong_sea,wrong_judges', 'from another sea: "wrong_sea", "wrong_judges"');
check(flags(fresh(text), { ...ok, waveNo: 2 }) === 'wrong_judges', "the judges' seed for another wave number: \"wrong_judges\"");
{ const rec = fresh(text); rec.params = { size: '1.75' }; check(flags(rec).startsWith('settings'), 'ridden with ?size=1.75: "settings"'); }
{ // a checkpoint moved 40 m along the wave (a log spliced together): "drift"
  const rec = fresh(text); const c = rec.checks[Math.floor(rec.checks.length / 2)][1];
  if (Array.isArray(c.pos)) c.pos[0] += 40; else if (typeof c.xs === 'number') c.xs += 40;
  const v = checkRide(rec, ok);
  check(v.reasons.includes('drift') && v.drift > DRIFT_OK, `a checkpoint moved 40 m: "drift" (${v.drift.toFixed(2)})`);
}
{ // moved 3 m: within what another engine's maths can do to an honest ride: not flagged for drift (only if it scores differently)
  const rec = fresh(text); const c = rec.checks[Math.floor(rec.checks.length / 2)][1];
  if (Array.isArray(c.pos)) c.pos[0] += 3; else if (typeof c.xs === 'number') c.xs += 3;
  const v = checkRide(rec, ok);
  check(!v.reasons.includes('drift') && v.drift >= 3, `a checkpoint moved 3 m: drift ${v.drift.toFixed(2)} shown, not flagged (${v.reasons.join(', ') || 'passes'})`);
}
{ // two seconds of the ride re-steered (the inputs swapped for a hard turn): it no longer reaches its own checkpoints
  const rec = fresh(text), at = Math.floor(rec.steps / 3);
  const before = [...rec.inputs].reverse().find(([k]) => k <= at + 240)?.[1] || {};
  rec.inputs = [...rec.inputs.filter(([k]) => k < at), [at, { aim: [-1, -1] }], [at + 240, before], ...rec.inputs.filter(([k]) => k > at + 240)];
  const v = checkRide(rec, ok);
  check(!v.ok, `two seconds re-steered: flagged (${v.reasons.join(', ')}, drift ${v.drift?.toFixed(2)})`);
}
{ // one step's input changed: a hair's difference, the same score, nothing gained: passes
  const rec = fresh(text), at = Math.floor(rec.steps / 3);
  const was = [...rec.inputs].reverse().find(([k]) => k <= at)?.[1] || {};
  if (!rec.inputs.some(([k]) => k === at || k === at + 1)) rec.inputs.splice(rec.inputs.findIndex(([k]) => k > at), 0, [at, { aim: [1, 1] }], [at + 1, was]);
  const v = checkRide(rec, ok);
  check(v.ok, `one step changed, same score: passes (drift ${v.drift?.toFixed(2)})`);
}
{ // the log's own score raised to match a raised submission
  const rec = fresh(text); rec.result.judged.score = score + 2;
  check(flags(rec, { ...ok, score: score + 2 }) === 'score,log_score', 'the log and the submission both raised: "score", "log_score"');
}
console.log(fails ? `\n${fails} failed` : '\nscore checks ok');
process.exit(fails ? 1 : 0);
