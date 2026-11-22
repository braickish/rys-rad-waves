// DROP IN from the wave builder (src/waves/built.js; the user, 2026-11-22): Dynamic's reef from the builder's model,
// handed to the game as a loop and as a full ride.
//   loop: the curl peels on forever (many laps), its speed never jumps (the seam crossfades), a pumping rider surfs it
//   full: the curl runs once, the wave backs off past the end, and the ride ends ("the end of the wave")
//   node test/built.mjs
import { buildDepth, makeGrid } from '../src/builder/reef.js';
import { traceRays, analyse } from '../src/builder/rays.js';
import { defaultLoop, bestLoop, wavePayload, takeoffStart, LOOP } from '../src/builder/loop.js';
import { reefComponents, dynamicPreset } from '../src/builder/blocks.js';
import { runPE } from '../src/builder/pewave.js';
import { applyBuilt } from '../src/waves/built.js';
import * as W from '../src/wave.js';
import * as R from '../src/rider.js';
import * as S from '../src/sea.js';

const swell = { H: 1.6, T: 15, dir: 0 };
const grid = buildDepth(reefComponents(dynamicPreset()), makeGrid()), Rg = traceRays(grid, swell), A = analyse(Rg, grid, { pe: runPE(grid, swell) }); // (refined, as DROP IN sends it)
const side = A.right, lp = bestLoop(side) || defaultLoop(side);
const payloads = {
  loop: wavePayload(side, 'right', 'loop', lp.a, lp.b, swell),
  full: wavePayload(side, 'right', 'full', takeoffStart(side).a, takeoffStart(side).b, swell),
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
// Plan step 2 (the user, 2026-11-22): the takeoff speed and the wave's speed come from the builder, and the wave's size follows
// the breakers along the stretch. Takeoff: Dynamic's full right. Size: a made-up loop whose breakers step from 2.0 to 3.0 m
// over 60-80 m and back at the seam.
{
  const d = payloads.full; applyBuilt(d); R.useWave('built'); S.seedSea(1); S.nextWave();
  const r = R.createRider(); R.resetRider(r);
  const want = d.profile[0].peel * Math.sqrt(W.SIZE);
  console.log(`-- takeoff: curl at the stretch's start ${mph(want)} mph, drop-in ${mph(r.speed)} mph; wave speed ${W.WAVE_SPEED.toFixed(2)} m/s (builder c ${d.c.toFixed(2)} x sqrt(size ${W.SIZE}))`);
  check(Math.abs(r.speed - Math.max(R.TUNE.vLow, Math.min(R.TUNE.softMax, want))) < 0.05, 'takeoff: you drop in at the curl\'s speed where the builder\'s stretch starts');
  check(Math.abs(W.WAVE_SPEED - d.c * Math.sqrt(W.SIZE)) < 0.01, 'takeoff: the wave moves toward the shore at the builder\'s speed');
}
{
  const prof = []; for (let s0 = 0; s0 <= 200; s0 += 10) prof.push({ s: s0, peel: 8, k: 0, H: s0 < 60 ? 2 : s0 < 80 ? 2 + (s0 - 60) / 20 : 3, c: 5.5 });
  const d = { v: 1, mode: 'loop', side: 'left', length: 200, base: 8, H: 2, c: 5.5, profile: prof };
  applyBuilt(d); R.useWave('built'); S.seedSea(1); S.nextWave();
  const face = () => W.surface(0.5, R.topOfFace(0.5))[1] - W.surface(0.5, R.TUNE.tBottom)[1];
  const dt = 1 / 120; let lo = 1e9, hi = 0, jump = 0, prev = face();
  const at = {}; for (let i = 0; i < 60 / dt; i++) {
    S.stepSea(dt); const f = face(); lo = Math.min(lo, f); hi = Math.max(hi, f); jump = Math.max(jump, Math.abs(f - prev) / dt); prev = f;
    const u = W.RIDGE.c % 200; if (Math.abs(u - 30) < 0.1) at.small = f; if (Math.abs(u - 120) < 0.1) at.big = f;
  }
  console.log(`-- size: face ${at.small?.toFixed(2)} m on the 2 m stretch, ${at.big?.toFixed(2)} m on the 3 m stretch (range ${lo.toFixed(2)}-${hi.toFixed(2)}), fastest change ${jump.toFixed(2)} m/s`);
  check(at.small && at.big && Math.abs(at.big / at.small - 1.5) < 0.05, 'size: the face is 1.5x taller where the breakers are 1.5x bigger');
  check(jump < 1.5, 'size: it grows and shrinks smoothly, the seam included (< 1.5 m/s)');
  // a pumping rider through the size change
  S.seedSea(1); S.nextWave();
  const r = R.createRider(); R.resetRider(r); r.events = []; R.stepRider(r, {}, 0);
  let up = false, i = 0, airs = 0;
  for (; i < 40 / dt; i++) {
    S.stepSea(dt);
    if (up && r.height > 0.8) up = false; if (!up && r.height < 0.15) up = true;
    R.stepRider(r, Math.cos(r.phi) < 0 ? { aim: [1, -0.3] } : r.xs < -1 ? { aim: [1, 0.6] } : r.xs > 6 ? { aim: [-0.2, up ? 1 : -1] } : { tilt: up ? 1 : -1 }, dt);
    for (const e of r.events) if (e.type === 'launch') airs++;
    if (r.mode === 'wipe') break;
  }
  console.log(`  pump bot through it: ${(i * dt).toFixed(1)} s (${(W.RIDGE.c / 200).toFixed(1)} laps), ${r.mode === 'wipe' ? r.wipeReason : 'still riding'}, airs ${airs}`);
  check(i * dt > 15, 'size: a pumping rider rides through the size change (> 15 s)');
}
// Plan step 3: the shape follows how it breaks. The builder places each spot on the scale (u 0 crumbly, 1 Raglan's wall,
// 2 the steep section) from xi; gentle / medium / steep arm slopes move it; the game's face steepens along the scale; riders
// cope at both ends.
{
  const { shapeIndex } = await import('../src/builder/loop.js');
  const { newBlock } = await import('../src/builder/blocks.js');
  const us = {};
  for (const slope of ['1:18', '1:10', '1:6']) {
    const bl = dynamicPreset(); for (const b of bl) if (b.type === 'arm') b.slope = slope;
    const g2 = buildDepth(reefComponents(bl), makeGrid()), A2 = analyse(traceRays(g2, swell), g2, { pe: runPE(g2, swell) }), lp2 = bestLoop(A2.left) || defaultLoop(A2.left);
    const d2 = wavePayload(A2.left, 'left', 'loop', lp2.a, lp2.b, swell), u = d2.profile.map((p) => p.u);
    us[slope] = u.reduce((x, y) => x + y, 0) / u.length;
    console.log(`-- shape: arms ${slope}: xi0 ${A2.left.xi.toFixed(2)} (${A2.left.how}), shape scale ${Math.min(...u).toFixed(2)}-${Math.max(...u).toFixed(2)} (mean ${us[slope].toFixed(2)})`);
  }
  check(us['1:18'] < us['1:10'] && us['1:10'] < us['1:6'], 'shape: gentle arms sit softer on the scale, steep ones harder');
  check(shapeIndex(0.3) === 0 && Math.abs(shapeIndex(0.8) - 1) < 1e-9 && shapeIndex(2) === 2, 'shape: crumbly at xi <= 0.4, the wall at 0.8, the section from 1.3');
  const angAt = (frac) => { // (the face's angle at a height on it, at the curl)
    const top = R.topOfFace(0.5), yT = W.surface(0.5, top)[1], yB = W.surface(0.5, R.TUNE.tBottom)[1], y = yB + frac * (yT - yB);
    let t = R.TUNE.tBottom; for (; t > top; t -= 0.01) if (W.surface(0.5, t)[1] >= y) break;
    const a = W.surface(0.5, t + 0.03), b = W.surface(0.5, t - 0.03); return Math.atan2(b[1] - a[1], Math.abs(b[2] - a[2])) * 57.3;
  };
  const res = {};
  for (const u of [0, 1, 2]) {
    const prof = []; for (let s0 = 0; s0 <= 200; s0 += 10) prof.push({ s: s0, peel: 8, k: 0, H: 2.1, c: 5.2, u });
    applyBuilt({ v: 1, mode: 'loop', side: 'left', length: 200, base: 8, H: 2.1, c: 5.2, profile: prof }); R.useWave('built'); S.seedSea(1); S.nextWave();
    const angles = [0.5, 0.75].map(angAt);
    const r = R.createRider(); R.resetRider(r); r.events = []; R.stepRider(r, {}, 0);
    let up = false, i = 0; const moves = {}; const dt = 1 / 120;
    for (; i < 40 / dt; i++) {
      S.stepSea(dt);
      if (up && r.height > 0.8) up = false; if (!up && r.height < 0.15) up = true;
      R.stepRider(r, Math.cos(r.phi) < 0 ? { aim: [1, -0.3] } : r.xs < -1 ? { aim: [1, 0.6] } : r.xs > 6 ? { aim: [-0.2, up ? 1 : -1] } : { tilt: up ? 1 : -1 }, dt);
      for (const e of r.events) if (e.type === 'move' && e.move !== 'bottomTurn' || e.type === 'launch') moves[e.move || 'air'] = (moves[e.move || 'air'] || 0) + 1;
      if (r.mode === 'wipe') break;
    }
    res[u] = { angles, t: i * dt };
    console.log(`  u ${u}: face ${angles.map((a) => a.toFixed(0)).join(' / ')} deg at half / 3/4 height; pump bot ${(i * dt).toFixed(1)} s ${r.mode === 'wipe' ? '(' + r.wipeReason + ')' : 'still riding'}, moves ${JSON.stringify(moves)}`);
  }
  check(res[0].angles[0] < res[1].angles[0] && res[1].angles[0] < res[2].angles[0], 'shape: the face steepens along the scale (crumbly < wall < section)');
  check(res[0].t > 15 && res[2].t > 15, 'shape: a pumping rider rides both the crumbly and the steep wave (> 15 s)');
}
// The beach break (plan step 6): a full ride off the sandbar's A-frame starts past its at-once peak, so a rider can follow it.
{
  const { beachPreset } = await import('../src/builder/blocks.js'); const { defaultCoast } = await import('../src/builder/reef.js');
  const sw = { H: 1.6, T: 12, dir: 0 }, c = defaultCoast(); c.face = 20;
  const g = buildDepth(reefComponents(beachPreset()), makeGrid(), c), A2 = analyse(traceRays(g, sw), g, { pe: runPE(g, sw) });
  const st = takeoffStart(A2.left), d = wavePayload(A2.left, 'left', 'full', st.a, st.b, sw);
  applyBuilt(d); R.useWave('built'); S.seedSea(1); S.nextWave();
  const r = R.createRider(); R.resetRider(r); r.events = []; R.stepRider(r, {}, 0);
  const dt = 1 / 120; let up = false, i = 0;
  for (; i < 30 / dt; i++) {
    S.stepSea(dt); if (up && r.height > 0.8) up = false; if (!up && r.height < 0.15) up = true;
    R.stepRider(r, Math.cos(r.phi) < 0 ? { aim: [1, -0.3] } : r.xs < -1 ? { aim: [1, 0.6] } : r.xs > 6 ? { aim: [-0.2, up ? 1 : -1] } : { tilt: up ? 1 : -1 }, dt);
    if (r.mode === 'wipe' || r.stepOff) break;
  }
  console.log(`-- beach: the left off the sandbar from ${st.a} m (of ${st.b}), peel ${mph(d.profile[0].peel)} mph at the takeoff; pump bot ${(i * dt).toFixed(1)} s, ${r.stepOff ? 'stepped off: ' + r.wipeReason : r.mode === 'wipe' ? r.wipeReason : 'still riding'}`);
  check(st.a > LOOP.edge / 2 && d.profile[0].peel < 15, 'beach: the ride starts past the at-once peak, where the curl can be followed');
  check(i * dt > 4, 'beach: a pumping rider rides the sandbar\'s left (> 4 s)');
}
console.log(fails ? 'SOME FAILED' : 'all ok');
process.exitCode = fails ? 1 : 0;
