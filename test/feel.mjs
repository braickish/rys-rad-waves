// Feel check for the arcade surf model: is the pocket fast and fun?
import { createRider, stepRider, TUNE } from '../src/rider.js';
const dt = 1 / 120, mph = (v) => Math.round(v * 2.237);
function start(o = {}) { const r = createRider(); Object.assign(r, o); r.events = []; stepRider(r, {}, 0); return r; }
function run(r, policy, secs, onEvent = () => {}) {
  let i = 0;
  for (; i < secs / dt; i++) { stepRider(r, policy(r, i * dt), dt); r.events.forEach((e) => onEvent(e, i * dt)); if (r.mode === 'wipe') break; }
  return i * dt;
}
const out = [];
const moveName = (e) => e.move + (e.combo ? '+combo' : '') + (process.env.V ? `@xs${e.xs?.toFixed(1)}/${mph(e.speed)}mph` : '');

// 1. Climb: bottom of the pocket to the top, holding Up.
{ const r = start({ xs: 2, t: 13.5, phi: 0, speed: 9 }); let top = null;
  run(r, () => ({ tilt: 1 }), 3, (e, t) => { if (e.type === 'move' && e.move !== 'bottomTurn' && top === null) top = t; });
  out.push(`climb bottom->top holding Up: ${top === null ? 'never' : top.toFixed(2) + 's'}`); }
// 2. Drop from the top.
{ const r = start({ xs: 2, t: 6, phi: 0, speed: 9 }); const v0 = r.speed; run(r, () => ({ tilt: -1 }), 0.6);
  out.push(`drop from the top: ${mph(v0)} -> ${mph(r.speed)} mph in 0.6s`); }
// 3. Turn rate: a 180-degree turn up top vs at the bottom (same speed).
for (const [label, t0] of [['up top', 6.2], ['at the bottom', 13.6]]) {
  const r = start({ xs: 2, t: t0, phi: 0, speed: 12 }); let i = 0;
  // turn nose-down from straight along the line (so we stay at that height)
  for (; i < 3 / dt && Math.abs(r.phi) < 1.2; i++) { stepRider(r, { turn: t0 < 10 ? -1 : 1 }, dt); }
  out.push(`turn 70 degrees ${label}: ${(i * dt).toFixed(2)}s`);
}
// 4. Bottom turn: come down the face, carve back up. Speed in -> out, time.
{ const r = start({ xs: 2, t: 12.5, phi: -1.0, speed: 12 }); const v0 = r.speed; let bt = null; const moves = [];
  let vAt = null;
  run(r, (r, t) => ({ turn: 1 }), 1.6, (e, t) => { if (e.move === 'bottomTurn' && bt === null) { bt = t; vAt = e.speed; } if (e.type === 'move') moves.push(moveName(e)); });
  out.push(`bottom turn holding Left from heading down: ${mph(v0)} mph in -> ${vAt ? mph(vAt) : '?'} mph coming out (${bt?.toFixed(2)}s), moves: ${moves.join(', ')}`); }
// 5. Moves by zone: bottom turn then straight up into the top at different spots.
for (const [label, xs] of [['into the whitewater', -6], ['at the curl', -3], ['on the open face', 2]]) {
  const r = start({ xs, t: 13.0, phi: -0.9, speed: 13 }); const moves = [];
  run(r, (r, t) => ({ tilt: 1 }), 1.5, (e) => { if (e.type === 'move') moves.push(moveName(e)); });
  out.push(`bottom turn then hit the top ${label}: ${moves.join(' -> ')}`);
}
// 6. Cutback: swing the nose down and around back toward the curl (hold Right).
for (const [label, o] of [['from the pocket', { xs: 1.5, t: 8, phi: 0, speed: 12 }], ['from the shoulder', { xs: 6, t: 8, phi: 0, speed: 10 }]]) {
  const r = start(o); const moves = [];
  run(r, (r, t) => ({ turn: t < 0.9 ? -1 : 0 }), 4, (e) => { if (e.type === 'move') moves.push(moveName(e)); });
  out.push(`cutback ${label} (Right 0.9s): ${moves.join(' -> ') || 'no moves'}, now ${mph(r.speed)} mph, ${r.mode === 'wipe' ? r.wipeReason : 'riding'}`);
}
// 6b. Top turn, then let go: you should keep heading down (no automatic turn).
{ const r = start({ xs: 2, t: 6.5, phi: 0.9, speed: 12 }); let phiAfter = null;
  run(r, (r, t) => { if (t > 0.6 && phiAfter === null) phiAfter = r.phi; return {}; }, 2.5);
  out.push(`top turn then no input: heading ${(phiAfter * 57.3).toFixed(0)} deg after the turn, ${(r.phi * 57.3).toFixed(0)} deg 2.5s later (unchanged = no auto-turn), ${mph(r.speed)} mph`); }
// 7. Shoulder bog.
{ const r = start({ xs: 12, t: 10, phi: 0, speed: 13 }); const sp = [];
  run(r, (r, t) => { if (Math.abs(t % 0.5) < dt / 2) sp.push(mph(r.speed)); return {}; }, 3);
  out.push(`shoulder (xs=12) straight, mph every 0.5s: ${sp.join(' ')}`); }
// 8. A decent rider working the pocket: bottom turns into the top, cutback when ahead.
{ const r = start(); let up = true, speedSum = 0, n = 0, inPk = 0; const counts = {};
  const T = run(r, (r) => {
    if (up && r.t < TUNE.tTop + 1) up = false;
    if (!up && r.t > 12.6) up = true;
    speedSum += r.speed; n++; if (r.xs > -2 && r.xs < 6) inPk++;
    if (r.xs > 7 || (r.xs > 4 && r.speed < 9)) return { turn: -1 };
    return { tilt: up ? 1 : -1, pump: !up };
  }, 30, (e) => { if (e.type === 'move') counts[moveName(e)] = (counts[moveName(e)] || 0) + 1; });
  out.push(`pocket rider: ${T.toFixed(0)}s, avg ${mph(speedSum / n)} mph, ${Math.round(100 * inPk / n)}% in pocket, ${r.mode === 'wipe' ? r.wipeReason : 'still riding'}\n   moves: ${JSON.stringify(counts)}`); }
// 9. Mashing Left/Right like a beginner, and doing nothing.
{ const r = start(); const T = run(r, (r, t) => ({ turn: Math.floor(t / 0.4) % 2 ? -1 : 1 }), 30);
  out.push(`Left/Right every 0.4s: ${T.toFixed(0)}s, ${r.mode === 'wipe' ? r.wipeReason : 'still riding'}`); }
{ const r = start(); const T = run(r, () => ({}), 30);
  out.push(`no input: ${T.toFixed(1)}s, ${r.mode === 'wipe' ? r.wipeReason : 'still riding'}`); }
console.log(out.join('\n'));
