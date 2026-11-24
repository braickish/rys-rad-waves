// Turning in the barrel (the user, 2026-11-24: damp it a bit more in the barrel, further when crouched): how much of your
// turning the barrel leaves you (rider.js tubeTurnK: damped by up to `tubeTurnDamp` 0.7 by about half depth, and holding
// crouch in there by `tubeCrouchDamp` 0.35 of what's left), for every wave with a barrel. (Read off the rider's own factor: test
// bots don't stay deep in a barrel long enough to measure a turn there.)
//   node test/tubeturn.mjs
import { useWave, TUNE, tubeTurnK } from '../src/rider.js';

let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) fails++; };
for (const w of ['reef', 'built', 'trestles']) {
  useWave(w);
  const k = (tubeDamp, tubeCrouchK) => tubeTurnK({ tubeDamp, tubeCrouchK }, TUNE);
  const open = k(0, 0), deep = k(1, 0), crouched = k(1, 1), going = k(0.5, 0);
  console.log(`${w}: turning left you on the open face ${(open * 100).toFixed(0)}% | half way in ${(going * 100).toFixed(0)}% | deep in the barrel ${(deep * 100).toFixed(0)}% | deep in it crouched ${(crouched * 100).toFixed(0)}%`);
  check(open === 1 && Math.abs(deep - 0.3) < 1e-9, `${w}: deep in the barrel turning is damped 70% (was 60%)`);
  check(Math.abs(crouched - 0.3 * 0.65) < 1e-9, `${w}: holding crouch in there damps it further (to ~20%)`);
}
process.exit(fails ? 1 : 0);
