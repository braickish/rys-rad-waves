// Regression test for "controls flip backward at the lip": play the way a
// person does and check nothing glitches. With Up/Down only, the board must
// never end up facing the curl; with any input, the rider must never be
// moved faster than the board can go.
import { createRider, resetRider, stepRider, TUNE } from '../src/rider.js';
import { setWaveType, PEEL_SPEED } from '../src/wave.js';
const dt = 1 / 120;
let failed = 0;
function play(name, script, { secs = 8, tiltOnly = false } = {}) {
  const r = createRider(); resetRider(r);
  let minHx = 1, minVx = 99, airs = 0, i = 0, nan = false;
  for (; i < secs / dt; i++) {
    stepRider(r, script(i * dt, r), dt);
    if (r.events.some((e) => e.type === 'launch')) airs++;
    if (r.mode === 'wipe') break;
    if (!r.pos.every(Number.isFinite) || !r.vel.every(Number.isFinite)) { nan = true; break; }
    minHx = Math.min(minHx, r.heading[0]);
    minVx = Math.min(minVx, r.vel[0]);
  }
  // Never faster than the board's top speed through the water (in the peel
  // frame the water itself moves back at the peel speed). Up/Down alone never
  // point you back at the curl (no longer true: Up is the same as Left).
  const ok = !nan && minVx > -(TUNE.maxSpeed + PEEL_SPEED + 0.5);
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(40)} ${(i * dt).toFixed(1).padStart(4)}s minHeadingX=${minHx.toFixed(2)} minVx=${minVx.toFixed(1)} airs=${airs} ${r.mode === 'wipe' ? '(' + r.wipeReason + ')' : ''}`);
}
const alt = (period, a, b) => (t) => (Math.floor(t / period) % 2 ? b : a);
for (const wave of ['crumble', 'barrel']) {
  setWaveType(wave);
  console.log(`-- ${wave}`);
  play('Up only, then Down only', (t) => ({ tilt: t < 1.2 ? 1 : -1 }), { tiltOnly: true });
  play('alternate Up / Down every 0.6s', (t) => ({ tilt: alt(0.6, 1, -1)(t) }), { tiltOnly: true });
  play('Up / Down 1.0s + pump', (t) => ({ tilt: alt(1.0, 1, -1)(t), pump: alt(1.0, false, true)(t) }), { tiltOnly: true });
  play('hold Up into the lip, then Down', (t) => ({ tilt: t < 2.5 ? 1 : -1 }), { tiltOnly: true });
  play('mash Up, pump the whole time', () => ({ tilt: 1, pump: true }), { secs: 5, tiltOnly: true });
  play('Left / Right carving 0.4s', (t) => ({ turn: alt(0.4, 1, -1)(t) }));
  play('Left / Right carving 0.7s + pump', (t) => ({ turn: alt(0.7, 1, -1)(t), pump: alt(0.7, false, true)(t) }));
  play('hold Left (spin in circles)', () => ({ turn: 1 }), { secs: 4 });
  play('touch stick sweeping around', (t) => ({ aim: [Math.cos(t * 2), Math.sin(t * 2)] }));
}
setWaveType('crumble');
// Up/Down must never reverse direction mid-press: hold Down with the nose
// just either side of straight up the face (like coming off a snap), and
// hold Up through a rebound 180.
// Up must be exactly Left and Down exactly Right, in every situation (riding
// right, riding left, near vertical, after moves): identical rides.
console.log('-- Up == Left, Down == Right (surfer POV)');
for (const [label, init] of [['riding right', { phi: 0.2 }], ['riding left', { phi: 2.9 }], ['nose straight up', { phi: Math.PI / 2 }], ['nose straight down', { phi: -Math.PI / 2 }]]) {
  for (const [a, b, name] of [[{ tilt: 1 }, { turn: 1 }, 'Up vs Left'], [{ tilt: -1 }, { turn: -1 }, 'Down vs Right']]) {
    const mk = () => { const r = createRider(); resetRider(r); Object.assign(r, { xs: 3, t: 9, speed: 12 }, init); return r; };
    const r1 = mk(), r2 = mk(); let maxDiff = 0;
    for (let i = 0; i < 1.5 * 120; i++) {
      const pol = (inp) => (Math.floor(i / 30) % 2 ? {} : inp); // press, release, press...
      stepRider(r1, pol(a), 1 / 120); stepRider(r2, pol(b), 1 / 120);
      maxDiff = Math.max(maxDiff, Math.abs(r1.phi - r2.phi), Math.abs(r1.xs - r2.xs));
      if (r1.mode !== 'surf' || r2.mode !== 'surf') break;
    }
    const ok = maxDiff < 1e-9;
    if (!ok) failed++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: ${name} identical (max difference ${maxDiff.toExponential(1)})`);
  }
}
console.log('-- Up/Down near vertical');
for (const phi0 of [Math.PI / 2 - 0.05, Math.PI / 2 + 0.05]) {
  for (const start of [1, -1]) {
    const r = createRider(); resetRider(r); Object.assign(r, { xs: 4, t: 9, speed: 12, phi: phi0, rideDir: start });
    let reversals = 0, lastSign = 0, prev = r.phi;
    for (let i = 0; i < 0.8 * 120; i++) {
      stepRider(r, { tilt: -1 }, 1 / 120);
      const dphi = Math.atan2(Math.sin(r.phi - prev), Math.cos(r.phi - prev)); prev = r.phi;
      const sg = Math.sign(Math.round(dphi * 1e4));
      if (sg && lastSign && sg !== lastSign) reversals++;
      if (sg) lastSign = sg;
      if (Math.sin(r.phi) < -0.9 || r.mode !== 'surf') break;
    }
    const ok = reversals === 0 && Math.sin(r.phi) < -0.5;
    if (!ok) failed++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} hold Down from ${(phi0 * 57.3).toFixed(0)} deg (was riding ${start > 0 ? 'right' : 'left'}): ${reversals} reversals, ends ${(r.phi * 57.3).toFixed(0)} deg`);
  }
}
console.log(failed ? `${failed} FAILED` : 'all ok');
process.exit(failed ? 1 : 0);
