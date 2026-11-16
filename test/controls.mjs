// Regression test for "controls flip backward at the lip": play the way a
// person does (Up/Down without Right, holding Up into the lip, holding Right
// through an air) and check the board never turns to face the curl and the
// rider never gets flung backward unless Left (cutback) is pressed.
import { createRider, resetRider, stepRider, v3 } from '../src/rider.js';
const dt = 1 / 120;
let failed = 0;
function play(name, script, secs = 8) {
  const r = createRider(); resetRider(r);
  let minHx = 1, minVx = 99, airs = 0, i = 0;
  for (; i < secs / dt; i++) {
    const input = script(i * dt, r);
    stepRider(r, input, dt);
    if (r.events.some((e) => e.type === 'launch')) airs++;
    if (r.mode === 'wipe') break;
    if (input.steer[0] >= 0) minHx = Math.min(minHx, r.heading[0]);
    minVx = Math.min(minVx, r.vel[0]);
  }
  // Facing the curl = heading's x below -0.2; flung backward = peel-frame vx far below -PEEL.
  const ok = minHx > -0.2 && minVx > -9;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(40)} ${(i * dt).toFixed(1)}s minHeadingX=${minHx.toFixed(2)} minVx=${minVx.toFixed(1)} airs=${airs} ${r.mode === 'wipe' ? '(' + r.wipeReason + ')' : ''}`);
}
const alt = (period, a, b) => (t) => (Math.floor(t / period) % 2 ? b : a);
play('Up only, then Down only (no Right)', (t) => ({ steer: t < 1.2 ? [0, 1] : [0, -1] }));
play('alternate Up / Down every 0.6s', (t) => ({ steer: alt(0.6, [0, 1], [0, -1])(t) }));
play('alternate Up / Down every 1.0s + pump', (t) => ({ steer: alt(1.0, [0, 1], [0, -1])(t), pump: alt(1.0, false, true)(t) }));
play('hold Up into the lip, then Down', (t) => ({ steer: t < 2.5 ? [0, 1] : [0, -1] }));
play('Right+Up into the lip, then Right+Down', (t) => ({ steer: t < 2.5 ? [1, 1] : [1, -1] }));
play('hold Right through everything + pumps', (t) => ({ steer: alt(0.8, [1, 1], [1, -1])(t), pump: alt(0.8, false, true)(t) }));
play('mash Up hard, pump the whole time', (t) => ({ steer: [0, 1], pump: true }), 5);
console.log(failed ? `${failed} FAILED` : 'all ok');
process.exit(failed ? 1 : 0);
