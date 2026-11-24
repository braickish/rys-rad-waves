// Ride recording and replay (src/replay.js; accounts plan task 2).
//   1. Record a ride, write it to text and read it back, replay it after other rides: the same steps, the same end, the same
//      points and judged score, no drift (snapping at every checkpoint changes nothing).
//   2. Drift: knock the rider off the recording mid-ride (as another browser's maths might); without checkpoints the ride
//      goes elsewhere, with them it's back on the recording by the next checkpoint and ends where the ride did.
//   3. A built break plays back from the payload in the recording.
//   4. Size: a recording is small.
// node test/replay.mjs
import * as R from '../src/rider.js';
import * as W from '../src/wave.js';
import * as S from '../src/sea.js';
import { createRideLog, logStep, scoreRide } from '../src/judging.js';
import { createRecording, recordStep, finishRecording, encodeRecording, decodeRecording, createPlayer, playerStep, playerEnd, snapshot } from '../src/replay.js';

const dt = 1 / 120;
// The determinism test's seeded rider: a pocket bot with random pokes on top.
function policy(seed) {
  let s = seed >>> 0 || 1;
  const rnd = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
  let up = false, poke = null, left = 0;
  return (r) => {
    if (left <= 0) { left = 20 + Math.floor(rnd() * 90); poke = rnd() < 0.35 ? { turn: rnd() < 0.5 ? -1 : 1, walk: rnd() < 0.15 ? (rnd() < 0.5 ? -1 : 1) : 0 } : null; }
    left--;
    if (poke) return { ...poke, walk: left % 60 === 0 ? poke.walk : 0 };
    const y = r.pos[1] + r.vel[1] * 0.3;
    if (up && y > 2.6) up = false;
    if (!up && y < 1.0) up = true;
    if (r.xs > 6) return { aim: [-0.6, up ? 0.8 : -0.5] };
    if (r.xs < -1) return { aim: [1, up ? 0.5 : -0.6], pump: !up, crouch: r.inBarrel };
    return { tilt: up ? 0.9 : -0.8, pump: !up, crouch: r.inBarrel };
  };
}
// The game's loop, headless: points as main.js handleEvents counts the big ones are left out; the judged score stands in.
function play({ wave, built = null, seed, n, input, player = null, record = false, knock = null, maxSecs = 40 }) {
  R.useWave(wave); S.seedSea(seed); S.goToWave(n);
  const r = R.createRider(); R.resetRider(r);
  const rec = record ? createRecording({ wave, built, seed, n, params: {} }) : null;
  const log = createRideLog(), trace = [];
  let i = 0;
  for (; i < maxSecs / dt; i++) {
    if (knock && i === knock.step) r.speed += knock.by;
    const inp = player ? playerStep(player, r) : input(r);
    if (rec) recordStep(rec, inp, r);
    S.stepSea(dt);
    R.stepRider(r, inp, dt);
    logStep(log, r, dt, W.PEEL_SPEED);
    if (i % 60 === 0) trace.push([r.xs, r.t, r.speed]);
    if (r.mode === 'wipe' && r.wipeTimer <= 0) { i++; break; }
    if (player && player.done) { i++; break; }
  }
  const judged = scoreRide(log, { size: (W.WAVE.sizeK || 1) * W.SIZE, seed: 1 });
  if (rec) finishRecording(rec, r, { judged: { score: judged.score }, mode: r.mode, reason: r.wipeReason, time: i * dt });
  return { steps: i, r, rec, judged: judged.score, trace: JSON.stringify(trace), end: JSON.stringify([r.xs, r.t, r.speed, r.phi, r.mode]) };
}

let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) fails++; };

// The rider's state must survive a copy as plain data (what a checkpoint is): no functions, no class instances.
{
  const a = play({ wave: 'raglanPlus', seed: 5, n: 2, input: policy(3), maxSecs: 8 });
  const bad = Object.entries(snapshot(a.r)).filter(([, v]) => typeof v === 'function' || (v && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) !== Object.prototype));
  check(!bad.length, `the rider's state is plain data (${bad.map(([k]) => k).join(', ') || 'all fields'})`);
}

for (const wave of ['raglanPlus', 'reef', 'trestles', 'queens']) {
  const live = play({ wave, seed: 21, n: 4, input: policy(77), record: true });
  const text = encodeRecording(live.rec);
  play({ wave: 'point', seed: 3, n: 1, input: policy(1), maxSecs: 5 }); // (something else in between)
  const rec = decodeRecording(text);
  const p = createPlayer(rec);
  const back = play({ wave: rec.wave, seed: rec.seed, n: rec.n, player: p });
  const e = playerEnd(p, back.r);
  check(back.steps === live.steps && back.trace === live.trace && back.end === live.end && back.judged === live.judged && e.sameEnd && e.drift === 0,
    `${wave.padEnd(10)} replays exactly: ${live.steps} steps (${(live.steps * dt).toFixed(1)} s), judged ${live.judged} / ${back.judged}, ${p.snaps} checkpoints, drift ${e.drift}, ${rec.inputs.length} input changes, ${(text.length / 1024).toFixed(0)} KB`);
}

// Drift: knock the speed by 0.01 m/s at step 250 of the replay.
{
  const live = play({ wave: 'raglanPlus', seed: 8, n: 3, input: policy(12), record: true });
  const rec = decodeRecording(encodeRecording(live.rec));
  const loose = play({ wave: rec.wave, seed: rec.seed, n: rec.n, player: createPlayer({ ...rec, checks: rec.checks.slice(0, 1).concat(rec.checks.slice(-1)) }), knock: { step: 250, by: 0.01 } });
  const p = createPlayer(rec);
  const held = play({ wave: rec.wave, seed: rec.seed, n: rec.n, player: p, knock: { step: 250, by: 0.01 } });
  const e = playerEnd(p, held.r);
  check(loose.end !== live.end, `knocked off by 0.01 m/s without checkpoints, the ride ends elsewhere (${JSON.parse(loose.end).slice(0, 3).map((x) => +(+x).toFixed(2))} vs ${JSON.parse(live.end).slice(0, 3).map((x) => +(+x).toFixed(2))})`);
  check(e.sameEnd && held.judged === live.judged && e.drift > 0 && e.drift < 0.1, `with checkpoints it's put back and ends where the ride did (drift found ${e.drift.toFixed(4)}, judged ${held.judged} / ${live.judged})`);
}

// A built break, from the payload in the recording.
{
  const { applyBuilt } = await import('../src/waves/built.js');
  const prof = Array.from({ length: 21 }, (_, i) => ({ s: i * 10, peel: 5 + Math.sin(i) * 1.5, u: 0.6 + 0.3 * Math.sin(i * 0.7), H: 2 + 0.3 * Math.cos(i) }));
  const d = { v: 1, mode: 'full', side: 'left', length: 200, base: 8, H: 2.1, c: 5.2, profile: prof };
  applyBuilt(d);
  const live = play({ wave: 'built', built: d, seed: 2, n: 0, input: policy(4), record: true });
  applyBuilt({ ...d, H: 3, base: 6 }); play({ wave: 'built', seed: 1, n: 0, input: policy(9), maxSecs: 4 }); // (another break in between)
  const rec = decodeRecording(encodeRecording(live.rec));
  applyBuilt(rec.built);
  const p = createPlayer(rec);
  const back = play({ wave: 'built', seed: rec.seed, n: rec.n, player: p });
  check(playerEnd(p, back.r).sameEnd && back.judged === live.judged, `built break replays from its recording (${(live.steps * dt).toFixed(1)} s, judged ${live.judged})`);
}
console.log(fails ? `\n${fails} failed` : '\nall replays match');
process.exit(fails ? 1 : 0);
