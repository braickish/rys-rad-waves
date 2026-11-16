// Regression test for "controls flip backward at the lip": play the way a
// person does and check nothing glitches. With Up/Down only, the board must
// never end up facing the curl; with any input, the rider must never be
// flung backward unreasonably fast.
import { createRider, resetRider, stepRider } from '../src/rider.js';
import { setWaveType } from '../src/wave.js';
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
  // Up/Down never point you back at the curl, so you can't move back much
  // faster than the peel; free turning (cutbacks) can ride back at speed.
  const ok = !nan && minVx > (tiltOnly ? -9 : -14) && (!tiltOnly || minHx > -0.2);
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
console.log(failed ? `${failed} FAILED` : 'all ok');
process.exit(failed ? 1 : 0);
