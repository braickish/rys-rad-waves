// Move audit: for each move, the peak acceleration (mph per second, over
// 0.1s windows), speed before -> 1.5s later, and whether it leaves you in the
// whitewater. Nothing should surge, and no move should dump you in the foam.
import { createRider, stepRider, TUNE } from '../src/rider.js';
import { foamAt } from '../src/rider.js';
const dt = 1 / 120, mph = (v) => v * 2.237;
function audit(name, init, policy, secs = 1.5) {
  const r = createRider(); Object.assign(r, init); r.events = []; stepRider(r, {}, 0);
  const v0 = r.speed, hist = [r.speed]; const moves = []; let inFoam = 0, i = 0;
  for (; i < secs / dt; i++) {
    stepRider(r, policy(r, i * dt), dt);
    for (const e of r.events) if (e.type === 'move' || e.type === 'launch' || e.type === 'land') moves.push(e.move || e.type);
    hist.push(r.mode === 'surf' ? r.speed : hist[hist.length - 1]);
    if (r.mode === 'surf' && foamAt(r.xs, r.t) > 0.45 && !r.floater && !(r.boost > 0)) inFoam += dt; // bogged in foam (not just passing through)
    if (r.mode === 'wipe') break;
  }
  const w = Math.round(0.1 / dt);
  let peak = 0;
  for (let k = w; k < hist.length; k++) peak = Math.max(peak, (mph(hist[k]) - mph(hist[k - w])) / 0.1);
  console.log(`${name.padEnd(34)} ${moves.join('>').padEnd(26)} ${mph(v0).toFixed(0).padStart(3)} -> ${mph(r.speed).toFixed(0).padStart(3)} mph  peak +${peak.toFixed(0).padStart(3)} mph/s  bogged in foam ${inFoam.toFixed(2)}s  ${r.mode === 'wipe' ? 'WIPE: ' + r.wipeReason : ''}`);
  return { peak, inFoam, wiped: r.mode === 'wipe' };
}
// Hold an input until the first move happens, then let go.
const once = (inp) => { let done = false; return (r) => { if (r.events.some((e) => e.type === 'move' && e.move !== 'bottomTurn')) done = true; return done || r.assist ? {} : inp; }; };
// Ride straight until the whitewater is right there, then turn as you hit it.
const atFoam = (inp) => { const o = once(inp); return (r) => (r.foam > 0.05 || foamAt(r.xs - 0.6, r.t) > 0.2 ? o(r) : {}); };
// Climb (turn nose-up only until it points up the face), then turn at the lip.
const lipTurn = (r) => (r.t < TUNE.tTop + 1.2 ? { turn: -1 } : Math.sin(r.phi) < 0.95 && Math.cos(r.phi) > 0 ? { turn: 1 } : {});
const rows = [
  ['snap at the curl', { xs: 0.5, t: 8, phi: 1.2, speed: 12 }, lipTurn],
  ['off the lip (open face)', { xs: 5, t: 8, phi: 1.3, speed: 12 }, lipTurn],
  ['re-entry (whitewater, steep)', { xs: -2.5, t: 8, phi: 1.35, speed: 12 }, lipTurn],
  ['floater', { xs: -5, t: 8, phi: 0.5, speed: 13 }, () => ({})],
  ['rebound (turning Left)', { xs: 0.4, t: 7.5, phi: 3.05, speed: 12 }, once({ turn: 1 })],
  ['rebound, slow', { xs: 0.4, t: 7.5, phi: 3.05, speed: 7 }, once({ turn: 1 })],
  ['rebound 180 (turning Right)', { xs: 1.5, t: 7.5, phi: 2.9, speed: 12 }, once({ turn: -1 })],
  ['rebound just under halfway up (top 2/3)', { xs: 0.4, t: 9.9, phi: 3.12, speed: 12 }, atFoam({ turn: 1 })],
  ['into the whitewater low (should bury)', { xs: -1, t: 12.6, phi: 3.05, speed: 12 }, once({ turn: 1 })],
  ['air + landing', { xs: 4, t: 7.5, phi: 1.3, speed: 16 }, () => ({})],
  ['bottom turn (started pointing down)', { xs: 2, t: 13.2, phi: -1.0, speed: 12 }, () => ({ turn: 1 })],
  ['bottom turn out on the flats', { xs: 3, t: 14.4, phi: -1.2, speed: 11 }, () => ({ turn: 1 })],
];
let worst = 0, foamBad = 0;
for (const [name, init, pol] of rows) {
  const o = audit(name, init, pol);
  worst = Math.max(worst, o.peak);
  if (o.inFoam > 0.5) foamBad++;
}
console.log(`worst peak acceleration: +${worst.toFixed(0)} mph/s; moves leaving you in the foam: ${foamBad}`);
