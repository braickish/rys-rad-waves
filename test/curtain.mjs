// No riding through the broken lip (the user, 2026-11-26: "if a wave is barreling don't let the surfer pass through the wall
// that is the broken lip without a wipeout"). A rider put in the barrel at a few depths turns down and out toward the open
// water, through the curtain: they must wipe out (the lip gets them) before getting clear of it. Holding a line in the barrel
// doesn't set it off (test/tubedepth.mjs rides lines too).
// node test/curtain.mjs
import * as R from '../src/rider.js';
import * as W from '../src/wave.js';
import { applyBuilt } from '../src/waves/built.js';

const dt = 1 / 120;
let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) fails++; };
const xsForDepth = (d) => { let lo = -60, hi = 20; for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if (R.tubeDepth({ xs: m }) > d) lo = m; else hi = m; } return (lo + hi) / 2; };
// (in the barrel at depth d, then `turn` (radians: below 0 aims down the face, out toward the open water) for up to 2 s, the
// depth held; what happened)
function ride(d, turn) {
  const T = R.TUNE, X = xsForDepth(d);
  const r = R.createRider(); R.resetRider(r);
  Object.assign(r, { xs: X, t: (R.topOfFace(X) + T.tBottom) / 2, phi: 0, speed: (T.tubeHold || 1) * W.PEEL_SPEED });
  r.events = []; R.stepRider(r, {}, 0);
  r.tube = { time: 0, depth: 0, depthSum: 0 }; r.inBarrel = true;
  for (let i = 0; i < 2 / dt; i++) {
    r.xs = X;
    const a = turn ?? Math.max(-0.5, Math.min(0.5, 3 * (0.45 - r.height)));
    R.stepRider(r, { aim: [Math.cos(a), Math.sin(a)] }, dt);
    r.events.length = 0;
    if (r.mode === 'wipe') return { wiped: true, why: r.wipeReason, z: r.pos[2] };
    if (!r.tube) return { wiped: false, why: 'out of the barrel', z: r.pos[2] };
  }
  return { wiped: false, why: 'still in the barrel', z: r.pos[2] };
}
for (const c of [{ wave: 'built', built: { v: 1, mode: 'loop', side: 'left', length: 100, base: 9, H: 2.5, c: 5.5, swell: { H: 2.2, T: 16 }, profile: [{ s: 0, peel: 9, k: 0, H: 2.5, c: 5.5, u: 3 }, { s: 100, peel: 9, k: 0, H: 2.5, c: 5.5, u: 3 }] } }, { wave: 'reef' }]) {
  if (c.built) applyBuilt(c.built);
  W.setWave(c.wave); R.useWave?.(c.wave);
  for (const d of [0.5, 0.7]) { // (near the opening, 30% in, the lip hasn't come down to you yet: ducking out under it is the way out)
    const out = ride(d, -1.3);
    check(out.wiped, `${c.wave}, ${Math.round(d * 100)}% deep, turning out through the curtain: ${out.wiped ? 'wiped out' : 'got through'} (${out.why})`);
    const line = ride(d, null);
    check(!/curtain/.test(line.why || ''), `${c.wave}, ${Math.round(d * 100)}% deep, holding a line: not taken by the curtain (${line.why})`);
  }
}
console.log(fails ? `\n${fails} failed` : '\nall ok');
process.exit(fails ? 1 : 0);
