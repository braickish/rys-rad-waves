// Score checks (accounts plan task 15): ride a recorded wave again, with no screen and no GPU, and see whether it comes
// out where the player's game said. Plain physics modules only, so the same code runs in the browser, in Node (the
// tests) and in the check-rides Edge Function (Deno).
//
// rerunRide(rec): the game's own loop (main.js tick), step by step from the recording's inputs, putting the rider back
// on the recording at each checkpoint (as a replay does) and measuring how far off it had drifted. A real ride drifts a
// little at most (see DRIFT_OK); a made-up or edited recording drifts far, or its judged score doesn't come out the same.
//
// checkRide(rec, expect): that, plus the ride belonging where it was submitted: the contest's wave, the heat's seed,
// the judges' seed for that wave number, no unusual physics settings, and the score submitted. Answers
// { ok, score (the re-run's), drift, reasons: [short codes] }.
import * as R from './rider.js';
import * as W from './wave.js';
import * as S from './sea.js';
import { createRideLog, logStep, scoreRide } from './judging.js';
import { createPlayer, playerStep, playerEnd } from './replay.js';
import { applyBuilt } from './waves/built.js';
import { judgeSeed } from './heat.js';

// How far off is still the same ride. A ride replays with drift 0 in the engine that recorded it, but engines round the
// maths functions differently (Chrome against Node or Deno, both V8: sin, cos, exp, log, atan2 and most others differ in
// the last bit; only pow, sqrt and hypot agree), and a surfer's line magnifies that until the next checkpoint puts the
// rider back: honest Chrome rides re-run on the server have drifted up to ~4 (metres) and still scored exactly the
// same. So drift only flags a log that jumps absurdly far (spliced together), and the score is the real check. (Re-
// running a ride exactly, without its checkpoints, would need the game's own maths functions: a project of its own.)
export const DRIFT_OK = 25;    // (m, m/s or rad, the largest gap at a checkpoint)
export const SCORE_OK = 0.05;  // (scores are to 0.01; room for another engine judging a move a hair differently)

export function rerunRide(rec, { maxSecs = 300 } = {}) {
  if (rec.built) applyBuilt(rec.built);
  R.useWave(rec.wave); S.seedSea(rec.seed); S.goToWave(rec.n);
  const r = R.createRider(); R.resetRider(r);
  const want = rec.params || {};
  if (want.ridet && W.WAVE.bar) { for (let i = 0; i < Number(want.ridet) * 120; i++) W.stepRide(1 / 120); R.resetRider(r); }
  const dt = rec.step || 1 / 120, p = createPlayer(rec), log = createRideLog();
  let i = 0;
  for (; i < maxSecs / dt; i++) {
    const inp = playerStep(p, r);
    S.stepSea(dt);
    R.stepRider(r, inp, dt);
    logStep(log, r, dt, W.PEEL_SPEED);
    if ((r.mode === 'wipe' && r.wipeTimer <= 0) || p.done) { i++; break; }
  }
  const j = rec.result?.judge || { seed: 1, seen: [] };
  const judged = scoreRide(log, { size: (W.WAVE.sizeK || 1) * W.SIZE, seed: j.seed, seen: new Set(j.seen || []) }).score;
  const e = playerEnd(p, r);
  return { judged, drift: e.drift, sameEnd: e.sameEnd, steps: i, snaps: p.snaps };
}

// expect: { score, waveNo, heatSeed, wave (the contest's wave id, or 'built') }
export function checkRide(rec, expect) {
  const reasons = [];
  if (Object.keys(rec.params || {}).length) reasons.push('settings'); // (?size=, ?moveaccel... : not a contest ride)
  if (expect.wave && rec.wave !== expect.wave) reasons.push('wrong_wave');
  if (expect.heatSeed != null && rec.seed !== expect.heatSeed) reasons.push('wrong_sea');
  if (expect.heatSeed != null && rec.result?.judge?.seed !== judgeSeed(expect.heatSeed, expect.waveNo - 1)) reasons.push('wrong_judges');
  let run = null;
  try { run = rerunRide(rec); } catch (e) { reasons.push('wont_run'); return { ok: false, score: null, drift: null, reasons, error: String(e?.message || e) }; }
  if (!run.sameEnd || run.drift > DRIFT_OK) reasons.push('drift');
  if (Math.abs(run.judged - Number(expect.score)) > SCORE_OK) reasons.push('score');
  if (rec.result?.judged && Math.abs(run.judged - rec.result.judged.score) > SCORE_OK) reasons.push('log_score');
  return { ok: !reasons.length, score: run.judged, drift: run.drift, steps: run.steps, reasons };
}
