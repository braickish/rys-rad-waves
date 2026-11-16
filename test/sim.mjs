// Headless physics check: scripted riders, prints how they fare.
import { createRider, resetRider, stepRider, frameAt, groundSpeed } from '../src/rider.js';
import { phaseAt } from '../src/wave.js';

const dt = 1 / 120;
function run(name, policy, secs = 30, verbose = false) {
  const r = createRider(); resetRider(r);
  let barrel = 0, airs = 0, maxSpeed = 0;
  const log = [];
  for (let i = 0; i < secs / dt; i++) {
    const input = policy(r, i * dt);
    stepRider(r, input, dt);
    for (const e of r.events) { if (e.type === 'launch') airs++; }
    if (r.inBarrel) barrel += dt;
    maxSpeed = Math.max(maxSpeed, groundSpeed(r));
    if (i % 60 === 0) log.push(`${(i*dt).toFixed(1)}s ${r.mode} xs=${r.xs.toFixed(1)} t=${r.t.toFixed(2)} y=${r.pos[1].toFixed(2)} v=${r.vel.map(v=>v.toFixed(1))} clr=${r.clearance.toFixed(1)}`);
    if (r.mode === 'wipe') { log.push(`WIPE at ${(i*dt).toFixed(1)}s: ${r.wipeReason}`); break; }
  }
  console.log(`${name}: survived ${r.time.toFixed(1)}s, barrel ${barrel.toFixed(1)}s, airs ${airs}, maxSpeed ${(maxSpeed*2.237).toFixed(0)}mph ${r.mode==='wipe'?'('+r.wipeReason+')':''}`);
  if (verbose) console.log(log.join('\n'));
}

run('no input', () => ({ steer: [0, 0] }), 30, process.argv.includes('-v0'));
run('hold right', () => ({ steer: [1, 0] }), 30);
run('hold right+pump', () => ({ steer: [1, 0], pump: true }), 30);

// Autopilot: hold a target position on the face and in the wave.
function auto(tTarget, xsTarget, crouch) {
  return (r) => {
    const dy = (r.t - tTarget) * 1.2;           // too low on the face -> point up
    const dx = 1 + (xsTarget - r.xs) * 0.25;     // too deep -> point along wave harder
    return { steer: [Math.min(2, Math.max(0.8, dx)), Math.max(-0.8, Math.min(0.8, dy))], pump: r.xs < xsTarget, crouch };
  };
}
run('auto mid-face, pocket xs=2', auto(12.4, 2), 30, process.argv.includes('-v1'));
run('auto barrel xs=-4 crouch', auto(12.8, -4, true), 30, process.argv.includes('-v2'));
run('auto barrel xs=-4 standing', auto(12.8, -4, false), 30);
run('auto no pump xs=2', (r) => ({ ...auto(12.4, 2)(r), pump: false }), 30, process.argv.includes('-v3'));
run('trim slightly down', () => ({ steer: [1, -0.25] }), 30, process.argv.includes('-v4'));

// Height-seeking controller: stay at yTarget on the face, chase xsTarget.
function seek(yTarget, xsTarget, opts = {}) {
  return (r) => {
    const yErr = yTarget - r.pos[1];
    const behind = xsTarget - r.xs; // > 0: too deep, need speed
    const sy = Math.max(-0.9, Math.min(0.9, yErr * 0.9 - (behind > 0 ? 0.25 : 0)));
    return { steer: [1, sy], pump: opts.pump !== false && behind > 0, crouch: !!opts.crouch };
  };
}
console.log('--- seek controllers');
for (const yT of [1.5, 2.2, 3.0]) for (const xT of [3, -2, -5]) {
  run(`seek y=${yT} xs=${xT}`, seek(yT, xT, { crouch: xT < 0 }), 30, process.argv.includes(`-s${yT}_${xT}`));
}
run('seek y=2.2 xs=3 no pump', seek(2.2, 3, { pump: false }), 30);

// S-turns: alternate between a high and low target on the face.
function sturns(yHi, yLo, opts = {}) {
  let goingUp = false;
  return (r) => {
    if (goingUp && r.pos[1] > yHi) goingUp = false;
    if (!goingUp && r.pos[1] < yLo) goingUp = true;
    const sy = goingUp ? 0.9 : -0.8;
    return { steer: [1, sy], pump: !goingUp && opts.pump !== false, crouch: !!opts.crouch };
  };
}
console.log('--- S-turns vs trimming (does linking turns keep up with the peel?)');
for (const [hi, lo] of [[2.5, 0.8], [3.2, 1.0], [2.0, 1.2]]) {
  run(`S-turns ${hi}/${lo} + pump`, sturns(hi, lo), 30, process.argv.includes(`-t${hi}`));
  run(`S-turns ${hi}/${lo} no pump`, sturns(hi, lo, { pump: false }), 30);
}
run('trim mid-face (seek y=1.8 xs=3)', seek(1.8, 3, { pump: false }), 30);
