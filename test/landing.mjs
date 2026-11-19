// Air landing audit: launch airs (big near the curl, plain out on the face) and
// hold a spin for different lengths of time after takeoff, like a player
// guessing at the timing. Counts how many land and why the rest fail, and
// lists the board's angle on the face at each touchdown (0 = along the line
// toward the shoulder, -90 = straight down the face, +-180 = back toward the
// whitewater) with o = landed, x = wiped.
// usage: node test/landing.mjs
import { createRider, stepRider, frameAt, v3, TUNE } from '../src/rider.js';
const dt = 1 / 120;
const reasons = {}; let tries = 0, landed = 0;
const rows = [], byAngle = {};
for (const [label, start] of [['near the curl', { xs: 1, t: 7.5, phi: 1.35, speed: 11.5 }], ['open face', { xs: 4, t: 7.5, phi: 1.35, speed: 11.5 }]]) {
  for (const dir of [1, -1]) {
    let line = '';
    for (let hold = 0; hold <= 1.6001; hold += 0.05) {
      const r = createRider(); Object.assign(r, start); r.events = []; stepRider(r, {}, 0);
      let airAt = null, out = null, ang = null;
      for (let i = 0; i < 5 / dt; i++) {
        const t = i * dt;
        if (r.mode === 'air' && airAt === null) airAt = t;
        const a = airAt === null ? -1 : t - airAt;
        const wasAir = r.mode === 'air', heading = r.heading.slice();
        stepRider(r, a > 0.1 && a < 0.1 + hold ? { turn: dir } : {}, dt);
        if (wasAir && r.mode !== 'air') { const fl = frameAt(r.xs, r.t); ang = Math.atan2(v3.dot(heading, fl.e2), v3.dot(heading, fl.e1)) * 57.3; }
        if (r.events.some((e) => e.type === 'land')) { out = 'ok'; break; }
        if (r.mode === 'wipe') { out = r.wipeReason; break; }
      }
      if (airAt === null) continue;
      tries++;
      if (ang !== null) { const b = Math.round(ang / 15) * 15; (byAngle[b] ||= []).push(out === 'ok' ? 'o' : 'x'); }
      if (out === 'ok') { landed++; line += 'o'; } else { reasons[out] = (reasons[out] || 0) + 1; line += 'x'; }
    }
    rows.push(`${label.padEnd(14)} spin ${dir > 0 ? '+' : '-'}  hold 0..1.6s: ${line}`);
  }
}
for (const l of rows) console.log(l);
console.log('board angle at touchdown (deg, 15 deg buckets):');
for (const k of Object.keys(byAngle).map(Number).sort((a, b) => a - b)) console.log(`  ${String(k).padStart(5)}: ${byAngle[k].join('')}`);
console.log(`landed ${landed}/${tries}`, reasons, TUNE.airLandDown ? `(always lands pointing ${-90 - TUNE.airLandDown[0]}..${-90 + TUNE.airLandDown[1]} deg)` : '');
