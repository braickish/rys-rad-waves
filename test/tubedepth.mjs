// Speed by depth in the tube (the user, 2026-11-24: riders slowed down the deeper they went; keep it, or add a little to
// help make it out). The rider is put in the tube at each depth (as if it got there), held at that depth (xs reset each
// step) on a line, speed free, for 1.5 s: the speed the wave settles you at there. Deeper must never be slower (within 0.05x: a low line's extra from gravity eases a little with depth, 1.32 -> 1.28),
// the deepest must reach the tube's deep boost, and it mustn't run away (under 1.35x the curl).
// (test/tube.mjs and tubetrim.mjs script their way in and no longer get in; this one doesn't depend on getting in.)
// node test/tubedepth.mjs
import * as R from '../src/rider.js';
import * as W from '../src/wave.js';
import * as S from '../src/sea.js';
import { applyBuilt } from '../src/waves/built.js';

const dt = 1 / 120;
let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) fails++; };
const xsForDepth = (d) => { let lo = -60, hi = 20; for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if (R.tubeDepth({ xs: m }) > d) lo = m; else hi = m; } return (lo + hi) / 2; };
function settle(d, H) {
  const T = R.TUNE, X = xsForDepth(d);
  const r = R.createRider(); R.resetRider(r);
  Object.assign(r, { xs: X, t: (R.topOfFace(X) + T.tBottom) / 2, phi: 0, speed: (T.tubeHold || 1) * W.PEEL_SPEED });
  r.events = []; R.stepRider(r, {}, 0);
  r.tube = { time: 0, depth: 0, depthSum: 0 }; r.inBarrel = true;
  for (let i = 0; i < 1.5 / dt; i++) {
    const a = Math.max(-0.5, Math.min(0.5, 3 * (H - r.height)));
    r.xs = X;
    R.stepRider(r, { aim: [Math.cos(a), Math.sin(a)] }, dt);
    r.events.length = 0;
    if (r.mode === 'wipe') return null;
    if (!r.tube) { r.tube = { time: 0, depth: 0, depthSum: 0 }; r.inBarrel = true; } // (out the front near the exit: put back)
  }
  return r.speed / W.PEEL_SPEED;
}
const prof = []; for (let s0 = 0; s0 <= 300; s0 += 10) { const inS = s0 >= 40 && s0 <= 260; prof.push({ s: s0, peel: inS ? 9 : 8, k: 0, H: 2.5, c: 5.5, u: inS ? 3 : 1 }); }
const cases = [
  { wave: 'reef', H: 0.45, depths: [0.1, 0.3, 0.5, 0.7, 0.9] },
  { wave: 'reef', H: 0.25, depths: [0.3, 0.5, 0.7, 0.9] },
  // (not Dynamic: its small tube's lip lands about 1.6 m out, and the pinned probe sat out in front of it, where riding now
  // wipes you out (rider.js, the curtain: the user, 2026-11-26). Its speed target is checked below, without a probe)
  { wave: 'built', H: 0.45, depths: [0.1, 0.3, 0.5, 0.7, 0.9], built: { v: 1, mode: 'full', side: 'left', length: 300, base: 8, H: 2.5, c: 5.5, profile: prof } },
];
for (const c of cases) {
  if (c.built) applyBuilt(c.built);
  R.useWave(c.wave); S.seedSea(1); S.nextWave();
  if (c.built) while (W.RIDGE.c < 70) S.stepSea(dt);
  if (W.WAVE.bar) while (W.RIDE.time < 9 || W.PEEL_SPEED < 4) S.stepSea(dt);
  const v = c.depths.map((d) => settle(d, c.H));
  const label = `${c.wave.padEnd(8)} line ${c.H}: ${c.depths.map((d, i) => `${Math.round(d * 100)}% ${v[i] === null ? 'wipe' : v[i].toFixed(2)}`).join(', ')} x the curl`;
  const ok = v.every((x) => x !== null) && v.every((x, i) => i === 0 || x >= v[i - 1] - 0.05) && Math.max(...v) < 1.35 && Math.min(...v) >= 1.1;
  check(ok, `${label}: never slower deeper, 1.1-1.35x`);
}
// The speed target itself (r.cruise) at the pinch end vs mid-tube, on each barrel wave: the deep boost is there.
{
  R.useWave('dynamic'); S.seedSea(1); S.nextWave(); while (W.RIDE.time < 9 || W.PEEL_SPEED < 4) S.stepSea(dt);
  const at = (d) => { const X = xsForDepth(d), r = R.createRider(); R.resetRider(r); Object.assign(r, { xs: X, t: (R.topOfFace(X) + R.TUNE.tBottom) / 2, phi: 0, speed: W.PEEL_SPEED }); r.events = []; R.stepRider(r, {}, 0); r.tube = { time: 0, depth: 0, depthSum: 0 }; r.inBarrel = true; R.stepRider(r, {}, dt); return r.cruise / W.PEEL_SPEED; };
  const mid = at(0.3), deep = at(0.9);
  check(deep > mid && Math.abs(mid - R.TUNE.tubeHold) < 0.01, `dynamic: the tube's target ${mid.toFixed(2)}x mid-tube, ${deep.toFixed(2)}x at 90% (tubeHold ${R.TUNE.tubeHold}, deep boost ${R.TUNE.tubeDeepBoost})`);
}
console.log(fails ? `\n${fails} failed` : '\nthe tube holds its speed at any depth');
process.exit(fails ? 1 : 0);
