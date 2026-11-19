// Air landing audit: launch airs (big near the curl, plain out on the face) and
// hold a spin for different lengths of time after takeoff, like a player
// guessing at the timing. Counts how many land and why the rest fail.
// usage: node test/landing.mjs
import { createRider, stepRider } from '../src/rider.js';
const dt = 1 / 120;
const reasons = {}; let tries = 0, landed = 0;
const rows = [];
for (const [label, start] of [['big air (near curl)', { xs: 1, t: 7.5, phi: 1.35, speed: 13 }], ['plain air (open face)', { xs: 4, t: 7.5, phi: 1.35, speed: 13 }]]) {
  for (const dir of [1, -1]) {
    let line = '';
    for (let hold = 0; hold <= 1.6001; hold += 0.05) {
      const r = createRider(); Object.assign(r, start); r.events = []; stepRider(r, {}, 0);
      let airAt = null, out = null;
      for (let i = 0; i < 5 / dt; i++) {
        const t = i * dt;
        if (r.mode === 'air' && airAt === null) airAt = t;
        const a = airAt === null ? -1 : t - airAt;
        stepRider(r, a > 0.1 && a < 0.1 + hold ? { turn: dir } : {}, dt);
        if (r.events.some((e) => e.type === 'land')) { out = 'ok'; break; }
        if (r.mode === 'wipe') { out = r.wipeReason; break; }
      }
      if (airAt === null) continue;
      tries++;
      if (out === 'ok') { landed++; line += 'o'; } else { reasons[out] = (reasons[out] || 0) + 1; line += 'x'; }
    }
    rows.push(`${label.padEnd(24)} spin ${dir > 0 ? '+' : '-'}  hold 0..1.6s: ${line}`);
  }
}
for (const l of rows) console.log(l);
console.log(`landed ${landed}/${tries}`, reasons);
