// DROP IN from the wave builder (src/waves/built.js; the user, 2026-11-22): Dynamic's reef from the builder's model,
// handed to the game as a loop and as a full ride.
//   loop: the curl peels on forever (many laps), its speed never jumps (the seam crossfades), a pumping rider surfs it
//   full: the curl runs once, the wave backs off past the end, and the ride ends ("the end of the wave")
//   node test/built.mjs
import { buildDepth, makeGrid } from '../src/builder/reef.js';
import { traceRays, analyse } from '../src/builder/rays.js';
import { defaultLoop, bestLoop, wavePayload, LOOP } from '../src/builder/loop.js';
import { reefComponents, dynamicPreset } from '../src/builder/blocks.js';
import { applyBuilt } from '../src/waves/built.js';
import * as W from '../src/wave.js';
import * as R from '../src/rider.js';
import * as S from '../src/sea.js';

const swell = { H: 1.6, T: 15, dir: 0 };
const grid = buildDepth(reefComponents(dynamicPreset()), makeGrid()), A = analyse(traceRays(grid, swell), grid);
const side = A.right, lp = bestLoop(side) || defaultLoop(side);
const payloads = {
  loop: wavePayload(side, 'right', 'loop', lp.a, lp.b, swell),
  full: wavePayload(side, 'right', 'full', LOOP.edge / 2, Math.floor(side.ride / 10) * 10, swell),
};
let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) fails++; };
const mph = (v) => (v * 2.237).toFixed(1);

for (const [mode, data] of Object.entries(payloads)) {
  const def = applyBuilt(data);
  console.log(`-- ${mode}: ${data.length} m stretch, base peel ${mph(data.base)} mph, breakers ${data.H.toFixed(1)} m (wave scale ${def.scale.toFixed(2)}), peel ${mph(Math.min(...data.profile.map((p) => p.peel)))}-${mph(Math.max(...data.profile.map((p) => p.peel)))} mph, sections at ${data.profile.filter((p) => p.k).map((p) => p.s).join(',') || '-'} m`);
  R.useWave('built'); S.seedSea(1); S.nextWave();
  check(W.WAVE.id === 'built' && W.WAVE.built.mode === mode, `${mode}: the game reads the builder's wave`);
  // the curl alone
  let maxJump = 0, prev = W.PEEL_SPEED; const dt = 1 / 120;
  for (let i = 0; i < 120 / dt; i++) { S.stepSea(dt); maxJump = Math.max(maxJump, Math.abs(W.PEEL_SPEED - prev) / dt); prev = W.PEEL_SPEED; }
  console.log(`  curl over 120 s: ran ${W.RIDGE.c.toFixed(0)} m (${(W.RIDGE.c / data.length).toFixed(1)} laps), steepest speed change ${mph(maxJump)} mph/s, done ${W.RIDE.done ? 'at ' + W.RIDE.done.c.toFixed(0) + ' m' : 'no'}`);
  if (mode === 'loop') {
    check(W.RIDGE.c > 3 * data.length && !W.RIDE.done, 'loop: the curl peels on for lap after lap (3+ laps in 2 min)');
    check(maxJump < 15, 'loop: its speed never jumps, not even at the seam (< 15 mph/s)');
  } else {
    check(W.RIDE.done && Math.abs(W.RIDE.done.c - data.length) < 5, 'full: the wave is done where the stretch ends');
  }
  // a pumping rider (S-turns in the pocket)
  S.seedSea(1); S.nextWave();
  const r = R.createRider(); R.resetRider(r); r.events = []; R.stepRider(r, {}, 0);
  let up = false, i = 0, sum = 0, n = 0;
  for (; i < 60 / dt; i++) {
    S.stepSea(dt);
    if (up && r.height > 0.8) up = false; if (!up && r.height < 0.15) up = true;
    const inp = Math.cos(r.phi) < 0 ? { aim: [1, -0.3] } : r.xs < -1 ? { aim: [1, 0.6] } : r.xs > 6 ? { aim: [-0.2, up ? 1 : -1] } : { tilt: up ? 1 : -1 };
    R.stepRider(r, inp, dt);
    if (r.mode === 'surf') { sum += r.speed; n++; }
    if (r.mode === 'wipe' || r.stepOff) break;
  }
  const how = r.stepOff ? 'stepped off: ' + r.wipeReason : r.mode === 'wipe' ? 'wiped: ' + r.wipeReason : 'still riding';
  console.log(`  pump bot: ${(i * dt).toFixed(1)} s, avg ${mph(sum / Math.max(1, n))} mph, ${how}`);
  if (mode === 'loop') check(i * dt > 15, 'loop: a pumping rider surfs it for a good while (> 15 s)');
  else check(!!r.stepOff || r.mode === 'wipe' || i * dt >= 59, 'full: the ride ends (stepping off at the end of the wave, or caught)');
}
console.log(fails ? 'SOME FAILED' : 'all ok');
process.exitCode = fails ? 1 : 0;
