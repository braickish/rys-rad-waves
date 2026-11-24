// Riding through a section that breaks ahead (open-barrel plan step 3, the user's option 1, 2026-11-23): a built wave that
// barrels from 70 to 140 m, with a section at 100 m breaking up to `lead` s early (made as the builder makes it: below). The curl is the edge of the broken water
// (wave.js stepRidges): it waits for the section's near side, crosses the broken stretch at once, and runs on along its far
// side at that side's own pace, so the tube you'd ride through is measured from the section's own curl. Before (the curl
// following the builder's schedule) it raced the whole stretch that broke early at up to CURL_MAX and left you behind it.
// (Riding a tube through it, entering at the near end and out the far end, wants a player: this bot sits at the curl and
// never gets barrelled on this wave, with or without a section.)
//   node test/sectionride.mjs
import { applyBuilt } from '../src/waves/built.js';
import * as W from '../src/wave.js';
import * as R from '../src/rider.js';
import * as S from '../src/sea.js';
import { buildDepth, makeGrid } from '../src/builder/reef.js';
import { traceRays, analyse } from '../src/builder/rays.js';
import { wavePayload, takeoffStart } from '../src/builder/loop.js';
import { reefComponents, dynamicPreset, newBlock } from '../src/builder/blocks.js';
import { runPE } from '../src/builder/pewave.js';

let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) fails++; };

// The wave as the builder makes it (rays.js / loop.js): each spot's own break time along the reef, peeling at 8 m/s, a
// section around 100 m breaking up to `lead` s early (a smooth bump, 20 m either side); the curl is the running latest of
// those times, its speed along the crest from that (40 m window, at most CURL_MAX 25 m/s), and `e` how long before the curl a
// spot breaks.
function wave(lead) {
  const c = 5.5, raw = (x) => x / 8 - lead * Math.max(0, 1 - ((x - 100) / 20) ** 2) ** 2, step = 2, xs = [], tc = [];
  let run = -Infinity; for (let x = 0; x <= 340; x += step) { run = Math.max(run, raw(x)); xs.push(x); tc.push(run); }
  const at = (x) => tc[Math.max(0, Math.min(tc.length - 1, Math.round(x / step)))];
  const prof = [];
  for (let x = 0; x <= 300; x += 10) {
    const w0 = Math.max(0, Math.min(x - 20, 260)), v = Math.min(25, 40 / Math.max(0.05, at(w0 + 40) - at(w0)));
    const e = at(x) - raw(x);
    prof.push({ s: x, peel: +Math.sqrt(Math.max(0, v * v - c * c)).toFixed(2), k: 0, H: 3, c, u: x >= 70 && x <= 140 ? 3 : 1.5, ...(e > 0.05 ? { e: +e.toFixed(2) } : {}) });
  }
  return { v: 1, mode: 'full', side: 'left', length: 300, base: 8, H: 3, c, profile: prof };
}
// The curl alone: it only ever moves over water that has broken (the edge of the broken water: every spot it passes has
// reached phase 0), against the builder's schedule (the old curl), which ran on over water that hadn't broken yet.
function curl(d, edge = true) {
  applyBuilt(d); W.setWave('built');
  const dt = 1 / 120; let unbroken = 0, crossed = 0, maxV = 0;
  for (let i = 0; i < 40 / dt && W.RIDGE.c < d.length - 10; i++) {
    const c0 = W.RIDGE.c; W.stepRide(dt); const c1 = W.RIDGE.c;
    for (let X = c0 + 0.25; X < c1; X += 0.5) if (W.phaseAt(X - c1) < -0.05) { unbroken = Math.max(unbroken, -W.phaseAt(X - c1)); }
    if (W.PEEL_SPEED > 20 * Math.sqrt(W.SIZE)) crossed += c1 - c0;
    maxV = Math.max(maxV, W.PEEL_SPEED);
  }
  return { unbroken, crossed, maxV };
}
// ... and with no section, the curl keeps to the schedule exactly
{
  applyBuilt(wave(0)); W.setWave('built');
  const dt = 1 / 120; let x = 0, worst = 0;
  for (let i = 0; i < 20 / dt; i++) { const v = W.WAVE.ridges.profile, k = Math.min(v.length - 2, Math.floor(x / 10)), f = x / 10 - k; x += (v[k].peel + (v[k + 1].peel - v[k].peel) * f) * Math.sqrt(W.SIZE) * dt; W.stepRide(dt); worst = Math.max(worst, Math.abs(W.RIDGE.c - x)); }
  console.log(`no section: the curl vs its schedule over 20 s, worst ${worst.toFixed(2)} m apart`);
  check(worst < 0.5, 'no section: the curl runs on the profile\'s schedule (as before)');
}
// a rider holding a line (fraction of the face), heading down the line
function ride(lead, line) {
  applyBuilt(wave(lead)); R.useWave('built'); S.seedSea(1); S.nextWave();
  const r = R.createRider(); R.resetRider(r); r.events = []; R.stepRider(r, {}, 0);
  const dt = 1 / 120; let i = 0;
  for (; i < 40 / dt; i++) {
    S.stepSea(dt);
    R.stepRider(r, { aim: [1, Math.max(-0.6, Math.min(0.6, 3 * (line - r.height)))], walk: 0 }, dt);
    if (r.mode === 'wipe' || r.stepOff) break;
  }
  return { at: W.RIDGE.c + r.xs, how: r.stepOff ? 'stepped off' : r.mode === 'wipe' ? r.wipeReason : 'riding' };
}
for (const lead of [0.4, 0.8, 1.5]) {
  const rides = [0.35, 0.45, 0.55].map((line) => ride(lead, line));
  console.log(`lead ${lead} s: riders ${rides.map((o) => `${o.at.toFixed(0)} m ${o.how}`).join(' | ')}`);
  check(rides.some((o) => o.at > 150), `lead ${lead} s: a rider holding a line gets past the section`);
}
// The builder's own wave with a section: Dynamic with a pinnacle by its right arm (test/builder.mjs: a stretch breaking up
// to 3.2 s ahead). The curl waits for the section to connect, crosses the stretch that broke on its own, then follows the far
// side at its own pace (in the pinnacle's lee it barely peels, 2-4 m/s, as the builder's profile has it).
{
  const swell = { H: 1.6, T: 15, dir: 0 };
  const g = buildDepth(reefComponents([...dynamicPreset(), newBlock('pinnacle', 920, 440)]), makeGrid()), A = analyse(traceRays(g, swell), g, { pe: runPE(g, swell) });
  const ts = takeoffStart(A.right), c = curl(wavePayload(A.right, 'right', 'full', ts.a, ts.b, swell));
  console.log(`pinnacle wave: the curl crossed ${c.crossed.toFixed(0)} m at > 20 m/s (the stretch that broke on its own), top ${(c.maxV * 2.237).toFixed(0)} mph; deepest unbroken water it ran over: phase -${c.unbroken.toFixed(2)}`);
  check(c.unbroken < 0.1, 'pinnacle wave: the curl only moves over water that has broken (the edge of the broken water)');
  check(c.crossed > 10, 'pinnacle wave: once the section connects, the curl crosses it');
}
process.exit(fails ? 1 : 0);
