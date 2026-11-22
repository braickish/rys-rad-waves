// Floater audit: ride up onto the whitewater heading down the line (a floater),
// then steer different ways. Reports how long the float lasts, how the heading
// answers your input while floating, speed in -> peak -> 1.5 s after, and the
// outcome. A floater should let you steer the whole time (no grabbing the board
// or locking input) and give a little speed, not freeze it.
// usage: node test/floater.mjs
import { createRider, stepRider, TUNE } from '../src/rider.js';
const dt = 1 / 120, mph = (v) => (v * 2.237).toFixed(1);
const starts = {
  'onto the foam at the top': { xs: -5, t: 8, phi: 0.5, speed: 13 },
  'climbing the foam from below': { xs: -4, t: 11.5, phi: 0.7, speed: 11 },
};
const plans = {
  'no input': () => ({}),
  'hold turn +1 (0.4 s in)': (t) => (t > 0.4 ? { turn: 1 } : {}),
  'hold turn -1 (0.4 s in)': (t) => (t > 0.4 ? { turn: -1 } : {}),
  'tap turn -1 0.2 s (0.3 s in)': (t) => (t > 0.3 && t < 0.5 ? { turn: -1 } : {}),
};
for (const [sname, start] of Object.entries(starts)) {
  console.log(`-- ${sname}`);
  for (const [pname, plan] of Object.entries(plans)) {
    const r = createRider(); Object.assign(r, start); r.events = []; stepRider(r, {}, 0);
    let fStart = null, fEnd = null, v0 = null, peak = 0, phiIn = null, phiOut = null, locked = 0, vAfter = null, moves = [];
    for (let i = 0; i < 4 / dt; i++) {
      const t = fStart === null ? 0 : i * dt - fStart;
      stepRider(r, fStart === null ? {} : plan(t), dt);
      for (const e of r.events) if (e.type === 'move' && e.move !== 'bottomTurn') moves.push(e.move);
      if (r.floater && fStart === null) { fStart = i * dt; v0 = r.speed; phiIn = r.phi; }
      if (fStart !== null && fEnd === null) {
        peak = Math.max(peak, r.speed);
        if (r.lock || r.assist) locked += dt;
        if (!r.floater) { fEnd = i * dt; phiOut = r.phi; }
      }
      if (fEnd !== null && vAfter === null && i * dt - fEnd >= 1.5) vAfter = r.speed;
      if (r.mode === 'wipe') break;
      if (vAfter !== null) break;
    }
    if (fStart === null) { console.log(`  ${pname.padEnd(30)} no floater (${moves.join('>') || '-'}) ${r.mode === 'wipe' ? 'WIPE ' + r.wipeReason : ''}`); continue; }
    const dur = ((fEnd ?? 4) - fStart).toFixed(2);
    console.log(`  ${pname.padEnd(30)} float ${dur}s, heading ${(phiIn * 57.3).toFixed(0)} -> ${phiOut === null ? '?' : (phiOut * 57.3).toFixed(0)} deg, `
      + `input locked ${locked.toFixed(2)}s, ${mph(v0)} -> peak ${mph(peak)} -> ${vAfter === null ? '?' : mph(vAfter)} mph 1.5s after, ${r.mode === 'wipe' ? 'WIPE ' + r.wipeReason : 'riding'} (${moves.join('>')})`);
  }
}
// No air straight off a floater (the user, 2026-11-22): airs need you rising up the face (`airMinRise`) and a gap since
// the last move (`airMoveGap`). Every start and plan above, any speed: no launch within 0.5 s of the float ending.
{ let bad = 0;
  for (const start of Object.values(starts)) for (const plan of Object.values(plans)) for (const speed of [11, 13, 15]) {
    const r = createRider(); Object.assign(r, start, { speed }); r.events = []; stepRider(r, {}, 0);
    let fStart = null, fEnd = null;
    for (let i = 0; i < 4 / dt && r.mode === 'surf'; i++) {
      stepRider(r, fStart === null ? {} : plan(i * dt - fStart), dt);
      if (r.floater && fStart === null) fStart = i * dt;
      if (fStart !== null && fEnd === null && !r.floater) fEnd = i * dt;
      for (const e of r.events) if (e.type === 'launch' && fEnd !== null && i * dt - fEnd < 0.5) bad++;
    }
  }
  console.log(`${bad ? 'FAIL' : 'ok  '} no air straight off a floater (${bad} launched within 0.5 s)`);
  if (bad) process.exitCode = 1;
}
