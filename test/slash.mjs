// The slash: a Right turn started low on the way up out of a bottom turn.
// The fins hold for a moment (slashHold), then release and the board slides.
// Reports, for each wave and how long Right is held: whether it slashed and
// when, how high you carried, speed before -> lowest after, slide angle and
// total turn. Also checks that a Right turn started higher isn't a slash.
import { createRider, resetRider, stepRider, useWave } from '../src/rider.js';

const dt = 1 / 120, mph = (v) => (v * 2.237).toFixed(0), deg = (a) => (a * 57.3).toFixed(0);
let fails = 0;
function run(label, setup, hold, switchH = 0.1) {
  const r = createRider(); resetRider(r); setup(r);
  let stage = 'drop', tR = 0, v0 = 0, vMin = 99, maxH = 0, h0 = 0, phi0 = 0, slashAt = null, maxSlide = 0, phiEnd = null, tube0 = false;
  for (let i = 0; i < 120 * 5 && r.mode === 'surf'; i++) {
    let inp = { aim: [Math.cos(-0.9), Math.sin(-0.9)] };
    if (stage === 'drop' && r.height < 0.12 && Math.sin(r.phi) < 0) stage = 'bt';
    if (stage === 'bt') { inp = { turn: 1 }; if (Math.sin(r.phi) > 0.35 && r.height >= switchH) { stage = 'right'; v0 = r.speed; h0 = r.height; phi0 = r.phi; tube0 = !!r.tube; } }
    if (stage === 'right') {
      tR += dt; inp = tR < hold ? { turn: -1 } : {};
      maxH = Math.max(maxH, r.height); maxSlide = Math.max(maxSlide, r.slide);
      if (tR < 0.8) vMin = Math.min(vMin, r.speed);
      if (tR >= 0.8 && phiEnd === null) phiEnd = r.phi;
      if (tR > 1.2) break;
    }
    stepRider(r, inp, dt);
    if (stage === 'right' && slashAt === null && r.events.some((e) => e.move === 'slash')) slashAt = tR;
  }
  console.log(`${label.padEnd(26)} hold ${hold.toFixed(2)}s: ${slashAt === null ? 'no slash     ' : `slash @${slashAt.toFixed(2)}s `} ${tube0 ? '[tube] ' : ''}h ${h0.toFixed(2)}->${maxH.toFixed(2)}  ${mph(v0)}->${mph(vMin)} mph  slide ${deg(maxSlide).padStart(2)}deg  turned ${phiEnd === null ? '?' : deg(phi0 - phiEnd)}deg  ${r.mode === 'wipe' ? 'WIPE ' + r.wipeReason : ''}`);
  return slashAt !== null;
}
const expect = (ok, what) => { if (!ok) { fails++; console.log(`FAIL ${what}`); } };
for (const hold of [0.12, 0.3, 0.5]) { useWave('point'); const s = run('point', () => {}, hold); expect(s === hold > 0.18, `point hold ${hold}`); }
for (const hold of [0.3, 0.5]) { useWave('point'); expect(!run('point, Right started higher', () => {}, hold, 0.3), 'started higher should not slash'); }
for (const hold of [0.3, 0.5]) { useWave('reef'); expect(run('reef face', () => {}, hold), `reef hold ${hold}`); }
for (const hold of [0.3, 0.5]) { useWave('reef'); expect(run('reef in the barrel', (r) => { r.xs = -3; r.t = 12.6; r.phi = -0.6; r.speed = 11; }, hold), `barrel hold ${hold}`); }
console.log(fails ? `${fails} failed` : 'all ok');
process.exitCode = fails ? 1 : 0;
