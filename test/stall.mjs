// The stall (the user, 2026-11-23): already all the way back (the shortboard's back spot, the longboard's tail), pressing
// back again pushes hard on the tail and scrubs speed (rider.js `stallTime`, `stallScrub`, `stallHold`). The press that
// gets you to the back doesn't stall; holding back keeps it going; moving the feet off the back ends it. Shortboards and
// longboards both.
//   node test/stall.mjs
import { createRider, resetRider, stepRider, useWave } from '../src/rider.js';
import { nextWave, stepSea, seedSea } from '../src/sea.js';

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
process.exit(fails ? 1 : 0);
