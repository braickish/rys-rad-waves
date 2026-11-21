// Trimming in the barrel (Pipe), for the energy pocket's tube rules (the user, 2026-11-21: no tube engine
// or speed holder; a high line is fast by gravity; the back foot is the stall). Pulls in the way test/tube.mjs does
// (stall low by the curl until the tube comes over you), then with each shortboard foot spot holds a line at a height
// for up to 5 s: speed / peel in the tube, how deep you go, how long you stay in, and how it ends.
//   node test/tubetrim.mjs
import { createRider, stepRider, useWave, tubeDepth } from '../src/rider.js';
import { PEEL_SPEED } from '../src/wave.js';
const dt = 1 / 120;
useWave('reef');
for (const h of [0.15, 0.3, 0.45]) {
  const row = [];
  for (const [label, shuf] of [['back', -1], ['middle', 0], ['forward', 1]]) {
    const r = createRider(); Object.assign(r, { xs: 1.5, t: 11.5, phi: 0.8, speed: 11 }); r.events = []; stepRider(r, {}, 0);
    let inT = 0, vs = 0, n = 0, dMax = 0, out = '', t0 = null;
    for (let i = 0; i < 12 / dt; i++) {
      if (t0 === null && r.tube) { t0 = i; r.shuf = r.shufGoal = shuf; r.speed = PEEL_SPEED; } // (as if timed right: in at the curl's speed)
      const a = Math.max(-0.5, Math.min(0.5, 3 * (h - r.height))), line = { aim: [Math.cos(a), Math.sin(a)] };
      const inp = t0 !== null || r.xs < -2.5 ? line : r.height > 0.55 ? { turn: -1 } : { aim: [0.6, 0.8] }; // pull in (as tube.mjs), then the line
      stepRider(r, inp, dt);
      if (r.tube) { inT += dt; vs += r.speed; n++; dMax = Math.max(dMax, tubeDepth(r)); }
      for (const e of r.events) if (e.type === 'barrelExit' && !out) out = `out the front after ${e.time.toFixed(1)}s`;
      r.events.length = 0;
      if (r.mode === 'wipe') { out = r.wipeReason.replace(/!.*/, '!'); break; }
      if (out || (t0 !== null && i - t0 > 5 / dt)) break;
    }
    row.push(t0 === null ? `${label}: never in` : `${label}: ${(vs / n / PEEL_SPEED).toFixed(2)}x, in ${inT.toFixed(1)}s, deepest ${(100 * dMax).toFixed(0)}%, ${out || 'still in at 5 s'}`);
  }
  console.log(`line at ${h}: ${row.join(' | ')}`);
}
