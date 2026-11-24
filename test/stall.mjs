// The stall (the user, 2026-11-23): already all the way back (the shortboard's back spot, the longboard's tail), pressing
// back again pushes hard on the tail and scrubs speed (rider.js `stallTime`, `stallScrub`, `stallHold`). The press that
// gets you to the back doesn't stall; holding back keeps it going; moving the feet off the back ends it. Shortboards and
// longboards both.
//   node test/stall.mjs
import { createRider, resetRider, stepRider, useWave } from '../src/rider.js';
import { nextWave, stepSea, seedSea } from '../src/sea.js';
import { applyBuilt } from '../src/waves/built.js';
import * as W from '../src/wave.js';

let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) fails++; };
const mph = (v) => (v * 2.237).toFixed(1);

// Trim mid-face for 3 s; walk to the back (one press on the shortboard, one on the longboard: tail); after 1 s, `plan`.
function run(wave, plan) {
  useWave(wave); seedSea(1); nextWave();
  const r = createRider(); resetRider(r); r.events = []; stepRider(r, {}, 0);
  const dt = 1 / 120, out = { stalls: 0 };
  for (let i = 0; i < 6 / dt; i++) {
    const t = i * dt; stepSea(dt);
    const inp = { aim: [1, Math.max(-0.4, Math.min(0.4, 2 * (0.5 - r.height)))] };
    if (Math.abs(t - 3) < dt / 2) inp.walk = -1; // to the back
    if (t > 4 - dt / 2) plan(t - 4, inp, r);
    stepRider(r, inp, dt);
    for (const e of r.events) if (e.type === 'stall') out.stalls++;
    r.events.length = 0;
    if (Math.abs(t - 4) < dt / 2) out.v0 = r.speed;
    if (Math.abs(t - 4.6) < dt / 2) out.v06 = r.speed;
    if (Math.abs(t - 5.4) < dt / 2) out.v14 = r.speed;
    if (r.mode !== 'surf') { out.end = r.wipeReason || r.mode; break; }
  }
  return out;
}
const press = (at) => (tt, inp) => { if (Math.abs(tt - at) < 1 / 240) inp.walk = -1; };
for (const [wave, name] of [['point', 'shortboard (Raglan)'], ['queens', 'longboard (Queens)']]) {
  const none = run(wave, () => {});
  const once = run(wave, press(0));
  const held = run(wave, (tt, inp) => { if (Math.abs(tt) < 1 / 240) inp.walk = -1; if (tt < 1.3) inp.stallHold = true; });
  const off = run(wave, (tt, inp) => { if (Math.abs(tt) < 1 / 240) inp.walk = -1; if (Math.abs(tt - 0.2) < 1 / 240) inp.walk = 1; });
  const d = (o) => none.v06 - o.v06;
  console.log(`${name}: speed 0.6 s after the press: none ${mph(none.v06)} | stall ${mph(once.v06)} (-${mph(d(once))}) | held ${mph(held.v06)}, 1.4 s ${mph(held.v14)} (none ${mph(none.v14)}) | feet off at 0.2 s ${mph(off.v06)}; stall events: ${none.stalls} / ${once.stalls} / ${held.stalls} / ${off.stalls}${once.end ? ' | ended: ' + once.end : ''}`);
  check(none.stalls === 0, `${name}: the press that gets you to the back doesn't stall`);
  check(once.stalls === 1 && d(once) > 0.8, `${name}: back again from the back stalls, scrubbing speed (${mph(d(once))} mph by 0.6 s)`);
  check(none.v14 - held.v14 > none.v06 - once.v06, `${name}: holding back keeps the stall going`);
  check(d(off) < d(once), `${name}: moving the feet off the back ends it`);
}
// In the tube with the wall within an arm's length, the stall is a hand in the wave (rider.js r.handDrag, r.wallPt): a built
// barrel (built.mjs's), stall into it, step back and stall again in there, at a few heights in the tube.
{
  const prof = []; for (let s0 = 0; s0 <= 200; s0 += 10) prof.push({ s: s0, peel: 8, k: 0, H: 3, c: 5.5, u: s0 >= 70 && s0 <= 130 ? 3 : 1 });
  const res = [];
  for (const line of [0.25, 0.45]) {
    applyBuilt({ v: 1, mode: 'loop', side: 'left', length: 200, base: 8, H: 3, c: 5.5, profile: prof }); useWave('built'); seedSea(1); nextWave();
    const r = createRider(); resetRider(r); r.events = []; stepRider(r, {}, 0);
    const dt = 1 / 120; let inT = -1, drag = 0, tail = 0, dist = Infinity, scrub = null;
    for (let i = 0; i < 40 / dt; i++) {
      stepSea(dt);
      const near = (W.RIDGE.c % 200) > 60 && (W.RIDGE.c % 200) < 140, inp = { aim: [1, Math.max(-0.6, Math.min(0.6, 3 * (line - r.height)))], walk: 0 };
      if (r.tube && inT < 0) inT = i;
      if (i === 120) inp.walk = -1; // (feet on the back spot before the barrel ...)
      if (inT >= 0 && i === inT + 2) inp.walk = -1; // (... and stall as soon as you're in)
      if (inT >= 0 && i > inT + 2 && i < inT + 60) inp.stallHold = true;
      stepRider(r, inp, dt);
      if (near && !r.tube && r.xs > -1.2) r.speed *= 0.995;
      if (inT >= 0 && i > inT + 2 && i < inT + 60 && r.tube) { drag = Math.max(drag, r.handDrag || 0); tail = Math.max(tail, r.stallK * (1 - (r.handDrag || 0))); if (r.wallPt) dist = Math.min(dist, Math.hypot(r.wallPt[1] - r.pos[1], r.wallPt[2] - r.pos[2])); }
      r.events.length = 0;
      if (r.mode !== 'surf' || (inT >= 0 && i > inT + 110)) break;
    }
    res.push({ line, inTube: inT >= 0, drag, tail, dist });
    console.log(`in the tube at ${line} of the face: ${inT >= 0 ? 'in' : 'never in'}; stalling there, hand drag up to ${drag.toFixed(2)}, wall point ${isFinite(dist) ? dist.toFixed(2) + ' m from the feet' : '-'}`);
  }
  check(res.some((o) => o.inTube && o.drag > 0.5), 'in the tube by the wall: the stall is a hand in the wave (it eases in over ~0.25 s; this barrel visit is short)');
  // ... and out of the barrel it goes by the face under you (the user, 2026-11-23: right outside the barrel too): on Raglan,
  // low on the steep wall (~54 deg) a hand in the face, high up where the face eases off (< 45 deg) the tail
  const openFace = (line, climb = false) => { useWave('point'); seedSea(1); nextWave(); const r = createRider(); resetRider(r); r.events = []; stepRider(r, {}, 0); let hd = 0, sk = 0;
    for (let i = 0; i < 4 * 120; i++) { stepSea(1 / 120); const inp = { aim: [1, climb && i > 255 ? 0.7 : Math.max(-0.4, Math.min(0.4, 2 * (line - r.height)))] }; if (i === 200 || i === 260) inp.walk = -1; if (i > 260) inp.stallHold = true; stepRider(r, inp, 1 / 120); if (i > 262 && i < 320) { hd = climb ? (Math.sin(r.phi) > 0.35 ? r.handDrag || 0 : hd) : Math.max(hd, r.handDrag || 0); sk = Math.max(sk, r.stallK || 0); } } // (climbing: where it's got to once the board points up the face)
    return { hd, sk }; };
  const low = openFace(0.4), high = openFace(0.8);
  console.log(`open face: stalling low on the wall, hand drag ${low.hd.toFixed(2)}; high where it eases off, hand drag ${high.hd.toFixed(2)} (stall ${high.sk.toFixed(2)})`);
  check(low.hd > 0.8, 'right outside the barrel, on a steep face: the stall is a hand in the face');
  check(high.hd < 0.01 && high.sk > 0.8, 'on a gentler face the stall stays on the tail');
  // (and only heading flat along the face or a little down, the user, 2026-11-23: climbing the steep wall it's the tail)
  const up = openFace(0.4, true);
  console.log(`stalling while climbing the steep wall: hand drag ${up.hd.toFixed(2)} (stall ${up.sk.toFixed(2)})`);
  check(up.hd < 0.05 && up.sk > 0.5, 'climbing, even on a steep face, the stall stays on the tail');
}
process.exit(fails ? 1 : 0);
