// Determinism: a ride is a pure function of (the wave, the sea's seed, the wave's number, the inputs each physics step).
// That's what replays, contests (everyone gets the same waves) and score checks stand on
// (plans/2026-11-23-accounts-and-paid-plans.md, task 1).
//   1. Wave n is the same wave however the waves before it went (ridden longer or shorter, or not at all).
//   2. Riding a wave again from the same address with the same inputs gives the same ride, bit for bit, after other
//      rides and after switching to another wave and back (nothing left over in module state or caches).
//   3. The judged score agrees too.
// node test/determinism.mjs
import * as R from '../src/rider.js';
import * as W from '../src/wave.js';
import * as S from '../src/sea.js';
import { createRideLog, logStep, scoreRide } from '../src/judging.js';

const dt = 1 / 120;
// A seeded input script: a pocket bot with random pokes on top (turns, pumps, tilts, foot moves), so rides vary and last.
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
// Ride the current wave from a fresh rider: the trace (every 0.25 s and the end), the steps, the judged score.
function ride(pseed, maxSecs = 40, n = S.SEA.n) {
  const r = R.createRider(); R.resetRider(r);
  const log = createRideLog(), act = policy(pseed), trace = [];
  let i = 0;
  for (; i < maxSecs / dt; i++) {
    S.stepSea(dt);
    R.stepRider(r, act(r), dt);
    logStep(log, r, dt, W.PEEL_SPEED);
    if (i % 30 === 0) trace.push([r.xs, r.t, r.speed, r.phi, W.RIDE.c, W.PEEL_SPEED, W.SECTIONS.length]);
    if (r.mode === 'wipe' && r.wipeTimer <= 0) break;
  }
  trace.push([r.xs, r.t, r.speed, r.phi, r.mode, r.wipeReason || '']);
  const res = scoreRide(log, { size: (W.WAVE.sizeK || 1) * W.SIZE, seed: n + 1 });
  return { steps: i, secs: i * dt, trace: JSON.stringify(trace), score: res.score };
}
const same = (a, b) => a.steps === b.steps && a.trace === b.trace && a.score === b.score;

let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) fails++; };

const waves = ['point', 'raglanPlus', 'reef', 'queens', 'trestles', 'dynamic'];
for (const id of waves) {
  const SEED = 7, N = 3;
  // A: ride waves 0 .. N-1 for different lengths first, then wave N.
  R.useWave(id); S.seedSea(SEED);
  for (let k = 0; k < N; k++) { S.nextWave(); ride(100 + k, 2 + k * 3); }
  S.nextWave();
  const a = ride(42);
  // B: straight to wave N, after a stop on another wave (caches, module state).
  R.useWave(id === 'point' ? 'reef' : 'point'); S.seedSea(99); S.nextWave(); ride(5, 6);
  R.useWave(id); S.seedSea(SEED); S.goToWave(N);
  const b = ride(42);
  // C: the same again, with the title screen's demo having run in between (more stepping on another address).
  S.seedSea(1); S.nextWave(); ride(6, 10);
  S.seedSea(SEED); S.goToWave(N);
  const c = ride(42);
  check(same(a, b) && same(b, c), `${id.padEnd(10)} wave ${N}: the same ride three ways (${a.secs.toFixed(1)} s, score ${a.score})${same(a, b) ? '' : ` [A ${a.secs.toFixed(2)}s/${a.score} vs B ${b.secs.toFixed(2)}s/${b.score}]`}${same(b, c) ? '' : ` [B vs C ${c.secs.toFixed(2)}s/${c.score}]`}`);
  // The waves differ from each other (the address matters): waves N and N + 1 with the same inputs.
  S.goToWave(N + 1);
  const d = ride(42);
  const sizeN = (S.goToWave(N), S.SEA.size), sizeN1 = (S.goToWave(N + 1), S.SEA.size);
  check(d.trace !== a.trace || sizeN !== sizeN1 || id === 'queens', `${id.padEnd(10)} waves ${N} and ${N + 1} differ (sizes ${sizeN} / ${sizeN1})`);
}
// Built waves: the same, from a builder payload.
{
  const { applyBuilt } = await import('../src/waves/built.js');
  const prof = Array.from({ length: 21 }, (_, i) => ({ s: i * 10, peel: 5 + Math.sin(i) * 1.5, u: 0.6 + 0.3 * Math.sin(i * 0.7), H: 2 + 0.3 * Math.cos(i) }));
  const d = { v: 1, mode: 'full', side: 'left', length: 200, base: 8, H: 2.1, c: 5.2, profile: prof };
  applyBuilt(d); R.useWave('built'); S.seedSea(11); S.nextWave(); ride(1, 5); S.nextWave();
  const a = ride(9);
  R.useWave('point'); S.seedSea(1); S.nextWave(); ride(2, 4);
  applyBuilt(d); R.useWave('built'); S.seedSea(11); S.goToWave(1);
  const b = ride(9);
  check(same(a, b), `built      wave 1: the same ride (${a.secs.toFixed(1)} s, score ${a.score})`);
}
console.log(fails ? `\n${fails} failed` : '\nall deterministic');
process.exit(fails ? 1 : 0);
