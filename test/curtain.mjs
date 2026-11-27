// No riding through the broken lip (the user, 2026-11-26: "if a wave is barreling don't let the surfer pass through the wall
// that is the broken lip without a wipeout"; then "still not wiping out from the lip"). A rider put under the lip at a few
// depths turns down and out toward the open water, through the curtain: in the barrel (counted as tube riding) or just under
// the lip without it, turning hard or angling out (crossing the sheet higher up): they must wipe out before getting clear.
// Holding a line in the barrel doesn't set it off (test/tubedepth.mjs rides lines too). On a built almond barrel, on Pipe,
// and on the user's own break (a 4.7 m almond at scale 1.68).
// node test/curtain.mjs
import * as R from '../src/rider.js';
import * as W from '../src/wave.js';
import { applyBuilt } from '../src/waves/built.js';

const dt = 1 / 120;
let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) fails++; };
const xsForDepth = (d) => { let lo = -60, hi = 20; for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if (R.tubeDepth({ xs: m }) > d) lo = m; else hi = m; } return (lo + hi) / 2; };
// (under the lip at depth d, then `turn` (radians: below 0 aims down the face, out toward the open water; null holds a line)
// for up to 2 s, the depth held; what happened)
function ride(d, turn, inTube = true) {
  const T = R.TUNE, X = xsForDepth(d);
  const r = R.createRider(); R.resetRider(r);
  Object.assign(r, { xs: X, t: (R.topOfFace(X) + T.tBottom) / 2, phi: 0, speed: (T.tubeHold || 1) * W.PEEL_SPEED });
  r.events = []; R.stepRider(r, {}, 0);
  if (inTube) { r.tube = { time: 0, depth: 0, depthSum: 0 }; r.inBarrel = true; }
  for (let i = 0; i < 2 / dt; i++) {
    r.xs = X;
    const a = turn ?? Math.max(-0.5, Math.min(0.5, 3 * (0.45 - r.height)));
    R.stepRider(r, { aim: [Math.cos(a), Math.sin(a)] }, dt);
    r.events.length = 0;
    if (r.mode === 'wipe') return { wiped: true, why: r.wipeReason };
    if (inTube && !r.tube) return { wiped: false, why: 'out of the barrel' };
    if (!inTube && r.t > T.tBottom + 1.5) return { wiped: false, why: 'out on the flats' };
  }
  return { wiped: false, why: 'still in the barrel' };
}
const USER = 'eyJ2IjoxLCJtb2RlIjoibG9vcCIsInNpZGUiOiJsZWZ0IiwibGVuZ3RoIjoxMDAsImJhc2UiOjE1LjI1MjAyODQ5MzQzMDk5MSwiSCI6NC42OTIzNjk1MDMxMzU2MzYsImMiOjcuNTcxNzM0MDI0NDExOTA1LCJzd2VsbCI6eyJIIjo0LjEsIlQiOjE3LCJkaXIiOjB9LCJib2FyZCI6InNob3J0Ym9hcmQiLCJzaGFycCI6dHJ1ZSwicHJvZmlsZSI6W3sicyI6MCwicGVlbCI6MTUuMjIsImsiOjEsIkgiOjQuOTEsImMiOjcuNTQsInUiOjMuNzQzfSx7InMiOjEwLCJwZWVsIjoxNS4yNiwiayI6MSwiSCI6NC43LCJjIjo3LjQ2LCJ1Ijo0fSx7InMiOjIwLCJwZWVsIjoxMy40NywiayI6MSwiSCI6NC41OCwiYyI6Ny40MywidSI6NH0seyJzIjozMCwicGVlbCI6MTQuMiwiayI6MSwiSCI6NC41NCwiYyI6Ny4xOCwidSI6NH0seyJzIjo0MCwicGVlbCI6MTUuMjUsImsiOjAsIkgiOjQuNjksImMiOjcuNDQsInUiOjR9LHsicyI6NTAsInBlZWwiOjEzLjUzLCJrIjowLCJIIjo0Ljk2LCJjIjo3LjY5LCJ1Ijo0fSx7InMiOjYwLCJwZWVsIjoxMC4yNiwiayI6MSwiSCI6NS4wMSwiYyI6Ny43MSwidSI6NH0seyJzIjo3MCwicGVlbCI6Ny44OSwiayI6MSwiSCI6NC44OSwiYyI6Ny42MiwidSI6NH0seyJzIjo4MCwicGVlbCI6OS4zNCwiayI6MSwiSCI6NC4wNywiYyI6Ny41NywidSI6My4xODl9LHsicyI6OTAsInBlZWwiOjIwLjAyLCJrIjoxLCJIIjozLjI3LCJjIjo3LjYzLCJ1IjoyLjI2N30seyJzIjoxMDAsInBlZWwiOjE5Ljk0LCJrIjowLCJIIjozLjM1LCJjIjo3Ljg1LCJ1IjoyLjI0OX1dLCJ3YXRlciI6NjYsImZ1biI6dHJ1ZSwic2NhbGUiOjF9';
const cases = [
  { wave: 'built', name: "the user's break", built: JSON.parse(Buffer.from(decodeURIComponent(USER), 'base64').toString()) },
  { wave: 'built', name: 'a built almond', built: { v: 1, mode: 'loop', side: 'left', length: 100, base: 9, H: 2.5, c: 5.5, swell: { H: 2.2, T: 16 }, profile: [{ s: 0, peel: 9, k: 0, H: 2.5, c: 5.5, u: 3 }, { s: 100, peel: 9, k: 0, H: 2.5, c: 5.5, u: 3 }] } },
  { wave: 'reef', name: 'Pipe' },
];
for (const c of cases) {
  if (c.built) applyBuilt(c.built);
  W.setWave(c.wave); R.useWave?.(c.wave);
  for (const d of [0.5, 0.7]) { // (near the opening, 30% in, the lip hasn't come down to you yet: ducking out under it is the way out)
    for (const [turn, inTube, how] of [[-1.3, true, 'in the barrel, turning hard out'], [-0.6, true, 'in the barrel, angling out'], [-0.9, false, 'under the lip, not counted in the barrel, turning out']]) {
      const out = ride(d, turn, inTube);
      const through = !out.wiped && out.why !== 'still in the barrel'; // (still under the lip after 2 s: never reached the curtain)
      check(!through, `${c.name}, ${Math.round(d * 100)}% deep, ${how}: ${out.wiped ? 'wiped out' : through ? 'GOT THROUGH' : 'never reached it'} (${out.why})`);
    }
    const line = ride(d, null);
    check(!/curtain/.test(line.why || ''), `${c.name}, ${Math.round(d * 100)}% deep, holding a line: not taken by the curtain (${line.why})`);
  }
}
console.log(fails ? `\n${fails} failed` : '\nall ok');
process.exit(fails ? 1 : 0);
