// Speed from a steep wall (Trestles `wallK`, rider.js wallPower; the user, 2026-11-19: up-and-down carves on a steep
// section standing up ahead of the curl should make speed, so you can make the section; a fat shoulder still bogs).
// Holds the wave still at a moment of a ride, puts a rider on the face at a spot and has it carve up and down (S-turns
// between 30% and 80% of the face) for 4 s, with and without the wall's power. Then rides the whole wave with a racer.
//   node test/wallspeed.mjs
import { createRider, stepRider, useWave, TUNE, wallPower, pocketPower, frameAt, topOfFace } from '../src/rider.js';
import { RIDE, setWaveSize, startRide, stepRide, phaseAt, surface } from '../src/wave.js';
const dt = 1 / 120, mph = (v) => (v * 2.237).toFixed(1);
useWave('trestles'); setWaveSize(1);
const WALL = TUNE.wallK;
function goTo(wave, time) {
  for (let k = 0; k < 4; k++) { startRide(); if (RIDE.map.wave === wave) break; }
  while (RIDE.time < time) stepRide(dt);
}
const angleAt = (xs) => { const top = topOfFace(xs); return Math.acos(frameAt(xs, top + (TUNE.tBottom - top) / 2).n[1]) * 57.3; };
function carve(xs0, v0, wallK) {
  TUNE.wallK = wallK;
  const r = createRider(); r.xs = xs0; r.speed = v0; r.phi = 0;
  const top = topOfFace(xs0); r.t = top + (TUNE.tBottom - top) * 0.45; r.events = []; stepRider(r, {}, 0);
  let up = false, minV = 99, wiped = '', sum = 0, n = 0, wsum = 0;
  for (let i = 0; i < 4 / dt; i++) {
    if (up && r.height > 0.8) up = false;
    if (!up && r.height < 0.3) up = true;
    const a = up ? 0.55 : -0.55;
    stepRider(r, { aim: [Math.cos(a), Math.sin(a)] }, dt);
    minV = Math.min(minV, r.speed); sum += r.speed; n++; wsum += (TUNE.wallK = WALL, wallPower(r.xs)); TUNE.wallK = wallK;
    if (r.mode === 'wipe') { wiped = ` WIPE (${r.wipeReason})`; break; }
  }
  return { v: sum / n, minV, xs: r.xs, wiped, wall: wsum / n };
}
let ok = true;
const cases = [
  ['420 at 8 s: a section standing up ahead (steep, about to break)', 420, 8, 22],
  ['336 at 3 s: the wall just ahead of the pocket', 336, 3, 12],
  ['747 at 14 s: the fat shoulder (still swell)', 747, 14, 30],
  ['747 at 8 s: the pocket', 747, 8, 1],
];
console.log('-- carving up and down for 4 s from 20 mph, the wave held still (average speed; slowest; where it ended up)');
const res = {};
for (const [label, wave, time, xs] of cases) {
  goTo(wave, time);
  const a = carve(xs, 9, 0), b = carve(xs, 9, WALL);
  console.log(`${label}\n   at xs ${xs}: phase ${phaseAt(xs).toFixed(1)}, mid-face ${angleAt(xs).toFixed(0)} deg, pocket ${pocketPower(xs).toFixed(2)}, wall ${(TUNE.wallK = WALL, wallPower(xs)).toFixed(2)}`);
  console.log(`   without the wall: avg ${mph(a.v)} mph (slowest ${mph(a.minV)}, ended xs ${a.xs.toFixed(0)})${a.wiped}   with: avg ${mph(b.v)} mph (slowest ${mph(b.minV)}, ended xs ${b.xs.toFixed(0)})${b.wiped}; wall power under the rider on average ${b.wall.toFixed(2)}`);
  res[label] = [a, b];
}
TUNE.wallK = WALL;
const [steepA, steepB] = res[cases[0][0]], [fatA, fatB] = res[cases[2][0]], [pkA, pkB] = res[cases[3][0]];
const check = (cond, msg) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`); ok = ok && cond; };
check(steepB.v > steepA.v + 1.5 / 2.237, `a steep section ahead pays (at least 1.5 mph): +${mph(steepB.v - steepA.v)} mph with the wall`);
check(fatB.v - fatA.v < 0.3 / 2.237, `the fat shoulder still bogs: +${mph(fatB.v - fatA.v)} mph`);
// In the pocket itself the wave's cruising speed is the same with or without the wall (the pocket is worth more there);
// a carving rider soon leaves it for the wall just ahead, where the wall does pay (747 at 8 s above).
goTo(747, 8);
const cruiseAt = (xs, h, wallK) => { TUNE.wallK = wallK; const r = createRider(); r.xs = xs; r.speed = 8; r.phi = 0;
  const top = topOfFace(xs); r.t = top + (TUNE.tBottom - top) * (1 - h); r.events = []; stepRider(r, {}, dt); return r.cruise; };
let worst = 0;
for (const xs of [0, 1, 2]) for (const h of [0.3, 0.5, 0.7]) worst = Math.max(worst, Math.abs(cruiseAt(xs, h, WALL) - cruiseAt(xs, h, 0)));
TUNE.wallK = WALL;
check(worst < 0.1, `in the pocket (0-2 m out, pocket power >= 0.85) the cruising speed is unchanged: largest difference ${mph(worst)} mph`);
console.log(`   (the pocket rider carving out onto the wall ahead: avg ${mph(pkA.v)} -> ${mph(pkB.v)} mph)`);
process.exit(ok ? 0 : 1);
