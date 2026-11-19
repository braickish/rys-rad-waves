// Lip speed audit: from the bottom of the wave at a typical riding speed, do a
// bottom turn up the face at different distances from the curl and go straight
// up into the lip (no turn at the top, the way you'd try for an air). Reports
// your board speed when you reach the top and what you get (air / big air /
// over the back / something else), against airSpeed and airMinSpeed.
// usage: node test/lipspeed.mjs [start speed m/s ...]
import { createRider, stepRider, TUNE, airSpeedAt, bigAirSpeedAt } from '../src/rider.js';
const dt = 1 / 120, mph = (v) => (v * 2.237).toFixed(1);
const speeds = process.argv.length > 2 ? process.argv.slice(2).map(Number) : [11, 12, 13];
console.log(TUNE.airPopPerSpeed > 0 ? `air from ${mph(airSpeedAt(-9))} mph at the curl to ${mph(airSpeedAt(99))} out on the face; BIG from ${mph(bigAirSpeedAt(-9))} to ${mph(bigAirSpeedAt(99))}` : `airSpeed ${mph(TUNE.airSpeed)} mph anywhere; ${mph(TUNE.airMinSpeed)} mph within ${TUNE.airCurlZone} m of the whitewater`);
for (const v of speeds) {
  console.log(`-- ${mph(v)} mph at the bottom`);
  for (const xs of [1, 2, 3, 4, 5, 6, 8, 10, 13]) {
    const r = createRider(); Object.assign(r, { xs, t: 12.8, phi: -0.7, speed: v }); r.events = []; stepRider(r, {}, 0);
    let top = null, res = null, xTop = null;
    for (let i = 0; i < 4 / dt; i++) {
      // bottom turn: turn up until the board points ~75 deg up the face, then hold the line straight
      const inp = Math.sin(r.phi) < Math.sin(75 / 57.3) && Math.cos(r.phi) > 0 && top === null ? { turn: 1 } : {};
      const before = r.mode;
      stepRider(r, inp, dt);
      for (const e of r.events) {
        if (top === null && (e.type === 'launch' || (e.type === 'move' && e.move !== 'bottomTurn'))) { top = r.launchSpeed ?? r.speed; res = e.type === 'launch' ? (e.big ? 'BIG AIR' : 'air') : e.move; xTop = r.xs; }
      }
      if (top === null && r.mode === 'air' && before !== 'air') { top = r.launchSpeed; res = r.overTheBack ? 'over the back' : 'air?'; xTop = r.xs; }
      if (top !== null || r.mode === 'wipe') break;
    }
    if (top === null) res = r.mode === 'wipe' ? 'WIPE ' + r.wipeReason : 'never reached the top';
    console.log(`  from xs ${String(xs).padStart(2)}: ${top === null ? '' : `top at xs ${xTop.toFixed(1).padStart(5)} at ${mph(top)} mph -> `}${res}`);
  }
}
