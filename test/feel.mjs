// Feel check for the arcade surf model: is the pocket fast and fun?
import { createRider, resetRider, stepRider, frameAt, TUNE } from '../src/rider.js';
const dt = 1 / 120, mph = (v) => Math.round(v * 2.237);
function start(o = {}) { const r = createRider(); Object.assign(r, o); r.events = []; stepRider(r, {}, 0); return r; }
function run(r, policy, secs, onEvent = () => {}) {
  let i = 0;
  for (; i < secs / dt; i++) { stepRider(r, policy(r, i * dt), dt); r.events.forEach((e) => onEvent(e, i * dt)); if (r.mode === 'wipe') break; }
  return i * dt;
}
const out = [];
// 1. Climb: bottom of the pocket to the top, holding Up.
{ const r = start({ xs: 2, t: 13.5, phi: 0, speed: 9 }); let top = null;
  run(r, () => ({ tilt: 1 }), 3, (e, t) => { if (e.type === 'snap' && top === null) top = t; });
  out.push(`climb bottom->top holding Up: ${top === null ? 'never' : top.toFixed(2) + 's'}`); }
// 2. Speed from a drop: top of the pocket, point down.
{ const r = start({ xs: 2, t: 6, phi: 0, speed: 9 }); const v0 = r.speed; run(r, () => ({ tilt: -1 }), 0.6);
  out.push(`drop from the top: ${mph(v0)} -> ${mph(r.speed)} mph in 0.6s`); }
// 3. Cutback: swing the nose down and around back toward the curl (hold
// Right = clockwise), then rebound off the whitewater.
for (const [label, o, hold] of [['from mid-face in the pocket', { xs: 1.5, t: 8, phi: 0, speed: 12 }, 0.6], ['from out on the shoulder', { xs: 6, t: 8, phi: 0, speed: 10 }, 0.6]]) {
  const r = start(o); let re = null;
  run(r, (r, t) => ({ turn: t < hold ? -1 : 0 }), 4, (e, t) => { if (e.type === 'reentry' && re === null) re = t; });
  out.push(`cutback ${label} (Right ${hold}s): re-entry ${re === null ? 'NEVER' : 'at ' + re.toFixed(2) + 's'}, now ${mph(r.speed)} mph, ${r.mode === 'wipe' ? r.wipeReason : 'riding'}`);
}
// 4. Out on the shoulder going straight.
{ const r = start({ xs: 12, t: 10, phi: 0, speed: 13 }); const sp = [];
  run(r, (r, t) => { if (Math.abs(t % 0.5) < dt / 2) sp.push(mph(r.speed)); return {}; }, 3);
  out.push(`shoulder (xs=12) straight, mph every 0.5s: ${sp.join(' ')}`); }
// 5. A decent rider working the pocket: S-turns with pumps, cut back when ahead.
{ const r = start(); let up = true, snaps = 0, re = 0, speedSum = 0, n = 0, inPk = 0;
  const T = run(r, (r) => {
    if (up && r.t < TUNE.tTop + 1) up = false;
    if (!up && r.t > 12.8) up = true;
    speedSum += r.speed; n++; if (r.xs > -2 && r.xs < 6) inPk++;
    if (r.xs > 7 || (r.xs > 4 && r.speed < 9)) return { turn: -1 }; // cutback toward the curl
    return { tilt: up ? 1 : -1, pump: !up };
  }, 30, (e) => { if (e.type === 'snap') snaps++; if (e.type === 'reentry') re++; });
  out.push(`pocket rider: ${T.toFixed(0)}s, avg ${mph(speedSum / n)} mph, ${Math.round(100 * inPk / n)}% in pocket, ${snaps} snaps, ${re} re-entries, ${r.mode === 'wipe' ? r.wipeReason : 'still riding'}`); }
// 6. Mashing Left/Right like a beginner.
{ const r = start(); let snaps = 0, re = 0;
  const T = run(r, (r, t) => ({ turn: Math.floor(t / 0.4) % 2 ? -1 : 1 }), 30, (e) => { if (e.type === 'snap') snaps++; if (e.type === 'reentry') re++; });
  out.push(`Left/Right every 0.4s: ${T.toFixed(0)}s, ${snaps} snaps, ${re} re-entries, ${r.mode === 'wipe' ? r.wipeReason : 'still riding'}`); }
// 7. Doing nothing at all.
{ const r = start(); const T = run(r, () => ({}), 30);
  out.push(`no input: ${T.toFixed(1)}s, ${r.mode === 'wipe' ? r.wipeReason : 'still riding'} at xs=${r.xs.toFixed(1)}`); }
console.log(out.join('\n'));
