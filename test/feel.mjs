// Feel check for the arcade surf model: is the pocket fast and fun?
import { createRider, stepRider, TUNE } from '../src/rider.js';
const dt = 1 / 120, mph = (v) => Math.round(v * 2.237);
function start(o = {}) { const r = createRider(); Object.assign(r, o); r.events = []; stepRider(r, {}, 0); return r; }
function run(r, policy, secs, onEvent = () => {}) {
  let i = 0;
  for (; i < secs / dt; i++) { stepRider(r, policy(r, i * dt), dt); r.events.forEach((e) => onEvent(e, i * dt)); if (r.mode === 'wipe') break; }
  return i * dt;
}
const out = { push: (line) => console.log(line), join: () => '' }; // print as we go
const moveName = (e) => (e.type === 'launch' ? 'AIR' : e.move) + (e.combo ? '+combo' : '') + (process.env.V ? `@xs${e.xs?.toFixed(1)}/${mph(e.speed)}mph` : '');

// 1. Climb: bottom of the pocket to the top, holding Up.
{ const r = start({ xs: 2, t: 13.5, phi: 0, speed: 9 }); let top = null;
  run(r, (r) => (r.t < TUNE.tTop + 1.2 ? { turn: -1 } : { tilt: 1 }), 3, (e, t) => { if (((e.type === 'move' && e.move !== 'bottomTurn') || e.type === 'launch') && top === null) top = t; });
  out.push(`climb bottom->top holding Up: ${top === null ? 'never' : top.toFixed(2) + 's'}`); }
// 2. Dropping: from the top third vs from mid-face, pointing down for 0.4s.
for (const [label, t0] of [['top third', 6.0], ['mid-face', 10.0]]) {
  const r = start({ xs: 2, t: t0, phi: -0.9, speed: 11 }); const v0 = r.speed; run(r, () => ({}), 0.4);
  out.push(`drop from the ${label}: ${mph(v0)} -> ${mph(r.speed)} mph in 0.4s`);
}
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
  run(r, (r, t) => (r.t < TUNE.tTop + 1.2 ? { turn: -1 } : { tilt: 1 }), 1.5, (e) => { if (e.type === 'move' || e.type === 'launch') moves.push(moveName(e)); });
  out.push(`bottom turn then hit the top ${label}: ${moves.join(' -> ')}`);
}
// 6. Turning back into the whitewater: must be high, and turning as you hit.
// Riders start heading back toward the curl (phi ~ pi) and hold the given
// input until something happens.
for (const [label, o, inp] of [
  ['high, turning Left', { xs: 0.4, t: 7.5, phi: 3.05, speed: 12 }, { turn: 1 }],
  ['high, turning Right', { xs: 1.5, t: 7.5, phi: 2.9, speed: 12 }, { turn: -1 }],
  ['high, not turning', { xs: 1.5, t: 7.5, phi: 3.05, speed: 12 }, {}],
  ['low on the wave, turning Left', { xs: -1, t: 13.2, phi: 3.05, speed: 12 }, { turn: 1 }],
]) {
  const r = start(o); const moves = [];
  let t0 = null, pivot = null, steps = 0;
  for (; steps < 2.5 / dt; steps++) {
    const holding = !moves.length && !r.assist;
    stepRider(r, holding ? inp : {}, dt);
    for (const e of r.events) if (e.type === 'move') moves.push(moveName(e));
    if (r.assist && t0 === null) t0 = steps * dt;
    if (t0 !== null && !r.assist && pivot === null) pivot = steps * dt - t0;
    if (r.mode === 'wipe') break;
  }
  out.push(`into the whitewater ${label}: ${moves.join(' -> ') || '-'}${pivot !== null ? ` (pivot ${pivot.toFixed(2)}s)` : ''}, ${r.mode === 'wipe' ? 'WIPE: ' + r.wipeReason : 'riding, heading ' + (r.phi * 57.3).toFixed(0) + ' deg'}`);
}
// 6a. Snap: how long the release pivot takes before you're back in control.
{ const r = start({ xs: 1, t: 7, phi: 1.2, speed: 13 }); let t0 = null, dur = null;
  for (let i = 0; i < 1 / dt; i++) { stepRider(r, { turn: -1 }, dt); if (r.assist && t0 === null) t0 = i * dt; if (t0 !== null && !r.assist && dur === null) dur = i * dt - t0; }
  out.push(`snap at the curl: release pivot ${dur === null ? '?' : dur.toFixed(2) + 's'}, then heading ${(r.phi * 57.3).toFixed(0)} deg`); }
// 6c. Holding a turn leans in harder: tighter arc.
{ const a = start({ xs: 2, t: 10, phi: 0, speed: 12 }), b = start({ xs: 2, t: 10, phi: 0, speed: 12 });
  for (let i = 0; i < 0.25 / dt; i++) stepRider(a, { turn: -1 }, dt);
  for (let i = 0; i < 0.6 / dt; i++) stepRider(b, { turn: -1 }, dt);
  out.push(`lean builds while holding a turn: after 0.25s hard=${a.hard.toFixed(2)}, after 0.6s hard=${b.hard.toFixed(2)}`); }
// 6d. Floater: come up into the whitewater at a shallow angle heading down the line.
{ const r = start({ xs: -5, t: 8, phi: 0.5, speed: 13 }); const moves = []; let floatT = 0;
  run(r, (r) => { if (r.floater) floatT += dt; return {}; }, 2, (e) => { if (e.type === 'move') moves.push(moveName(e)); });
  out.push(`shallow up into the whitewater: ${moves.join(' -> ') || '-'}, floated ${floatT.toFixed(2)}s, ${r.mode === 'wipe' ? 'WIPE ' + r.wipeReason : 'riding'}`); }
// 6e. Bottom turn started pointing down vs a held turn from level: speed gained over 0.5s.
for (const [label, phi] of [['started pointing down', -1.0], ['started level', 0.0]]) {
  const r = start({ xs: 2, t: 13.2, phi, speed: 12 }); const v0 = r.speed;
  run(r, () => ({ turn: 1 }), 0.5);
  out.push(`turn held 0.5s at the bottom, ${label}: ${mph(v0)} -> ${mph(r.speed)} mph (hard ${r.hard.toFixed(2)}, carve ${r.bottomCarve})`);
}
// 6f. Moves can't stack: a snap straight into the whitewater within a second.
// Snap high in the whitewater zone, then immediately carve Left back into the
// foam (which would be a rebound if moves could stack).
{ const r = start({ xs: -1.5, t: 6.2, phi: 1.3, speed: 13 }); const moves = []; let foamHits = 0;
  const T = run(r, (r, t) => { if (Math.cos(r.phi) < -0.15 && r.foam > 0.25) foamHits++; return { turn: t > 0.15 ? 1 : 0 }; }, 1.5, (e, t) => { if (e.type === 'move' && e.move !== 'bottomTurn') moves.push(`${e.move}@${t.toFixed(2)}s`); });
  out.push(`snap, then carve straight back into the foam: moves ${moves.join(', ')}; ${(foamHits * dt).toFixed(2)}s heading back in foam; ${r.mode === 'wipe' ? 'WIPE at ' + T.toFixed(2) + 's: ' + r.wipeReason : 'riding'}`); }
// 6g. Up into the lip without turning: over the back (slow) or an air (fast).
for (const [label, speed] of [['slow', 10], ['fast', 16]]) {
  const r = start({ xs: 4, t: 7.5, phi: 1.3, speed }); const evs = [];
  run(r, () => ({}), 2, (e) => evs.push(e.type === 'move' ? e.move : e.type));
  out.push(`straight up into the lip, no turn, ${label}: ${evs.join(' -> ')}${r.mode === 'wipe' ? ' (' + r.wipeReason + ')' : ''}`);
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
{ const r = start(); let up = true, speedSum = 0, n = 0, inPk = 0, maxV = 0; const counts = {};
  const T = run(r, (r) => {
    if (up && r.t < TUNE.tTop + 1) up = false;
    if (!up && r.t > 12.6) up = true;
    speedSum += r.speed; n++; if (r.xs > -2 && r.xs < 6) inPk++; maxV = Math.max(maxV, r.speed);
    // Cutback: carve back toward the curl, then climb to meet the whitewater
    // high, turning Left as you hit it.
    if (Math.cos(r.phi) < 0) return { aim: [1, -0.3] }; // facing back: turn back down the line
    if (r.xs < -1) return { aim: [1, 0.6], pump: true }; // behind the curl: climb out along the line
    return { tilt: up ? 1 : -1, pump: !up };
  }, 30, (e) => { if (e.type === 'move') counts[moveName(e)] = (counts[moveName(e)] || 0) + 1; });
  out.push(`pocket rider: ${T.toFixed(0)}s, avg ${mph(speedSum / n)} mph, max ${mph(maxV)} mph, ${Math.round(100 * inPk / n)}% in pocket, ${r.mode === 'wipe' ? r.wipeReason : 'still riding'}\n   moves: ${JSON.stringify(counts)}`); }
// 9. Mashing Left/Right like a beginner, and doing nothing.
{ const r = start(); const T = run(r, (r, t) => ({ turn: Math.floor(t / 0.4) % 2 ? -1 : 1 }), 30);
  out.push(`Left/Right every 0.4s: ${T.toFixed(0)}s, ${r.mode === 'wipe' ? r.wipeReason : 'still riding'}`); }
{ const r = start(); const T = run(r, () => ({}), 30);
  out.push(`no input: ${T.toFixed(1)}s, ${r.mode === 'wipe' ? r.wipeReason : 'still riding'}`); }

