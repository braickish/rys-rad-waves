// Idle decay (the user, 2026-11-22): on the shortboard waves, after 2 s with no key pressed and no change of direction
// you lose ~0.5 mph every second (steady, not growing), and the pocket doesn't top you back up, until you work the board.
// Not on Queens (longboard trim and noseriding are no-key moves) and not in the tube.
// A rider trims mid-face along the line in the pocket: idle (no input) vs holding the line with a key.
//   node test/idle.mjs [wave ...]
import { createRider, resetRider, stepRider, useWave, TUNE, topOfFace } from '../src/rider.js';
import { PEEL_SPEED } from '../src/wave.js';
import { nextWave, stepSea, seedSea } from '../src/sea.js';
const dt = 1 / 120, mph = (v) => v * 2.237;
const waves = process.argv.length > 2 ? process.argv.slice(2) : ['point', 'reef', 'queens'];
let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) fails++; };
function trim(policy, secs = 6) {
  seedSea(1); nextWave();
  const r = createRider(); resetRider(r); r.events = [];
  r.xs = 3; r.phi = 0; r.speed = PEEL_SPEED; r.t = TUNE.tBottom - 0.5 * (TUNE.tBottom - topOfFace(r.xs));
  stepRider(r, {}, 0);
  const v = [];
  for (let i = 1; i <= secs / dt; i++) {
    stepSea(dt); stepRider(r, policy(r), dt);
    if (i % 120 === 0) v.push(mph(r.speed));
    if (r.mode !== 'surf') break;
  }
  return { v, r };
}
for (const w of waves) {
  useWave(w);
  const decay = TUNE.idleDecay;
  const fmt = (v) => v.map((x) => x.toFixed(1)).join(' ');
  console.log(`-- ${w} (peel ${mph(PEEL_SPEED).toFixed(1)} mph${decay ? `, idle decay ${mph(decay).toFixed(1)} mph/s after ${TUNE.idleDelay} s` : ', no idle decay'})`);
  // the same ride with and without the decay: idle (no input), and a key held (aim along the line)
  const idle = trim(() => ({})); const held = trim(() => ({ aim: [1, 0] }));
  TUNE.idleDecay = 0;
  const idle0 = trim(() => ({})); const held0 = trim(() => ({ aim: [1, 0] }));
  TUNE.idleDecay = decay;
  console.log(`  idle:            ${fmt(idle.v)}  (mph each second)`);
  console.log(`  idle, no decay:  ${fmt(idle0.v)}`);
  console.log(`  key held:        ${fmt(held.v)}  (no decay: ${fmt(held0.v)})`);
  const n = Math.min(idle.v.length, idle0.v.length) - 1, at = (a, i) => a[Math.min(i, a.length - 1)];
  check(Math.abs(at(idle.v, 1) - at(idle0.v, 1)) < 0.2, `${w}: nothing lost in the first 2 s`);
  check(held.v.every((x, i) => Math.abs(x - held0.v[i]) < 0.05), `${w}: holding a key, no decay`);
  if (decay) { const lost = at(idle0.v, n) - at(idle.v, n), want = mph(decay) * (n + 1 - TUNE.idleDelay);
    check(lost > 0.5 * want && lost < 1.5 * want, // (it stacks on losses already under way: drifting up into the crest fade, the bleed above the cruise)
    `${w}: idle loses ~${want.toFixed(1)} mph by ${n + 1} s (${lost.toFixed(1)})`); }
}
console.log(fails ? 'SOME FAILED' : 'all ok');
process.exitCode = fails ? 1 : 0;
