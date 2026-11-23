// Raglan+ sections (wave.js `ridges`; the user, 2026-11-22): random faster sections where the wave stands up steeper and
// the curl runs faster. From the drop-in, over several waves (each its own layout):
//   trim: hold mid-face with small corrections, no pumping
//   pump: S-turns in the pocket (up and down the face, like energy.mjs's bot)
// For each: how long it rides, how many sections the curl ran through while you were still riding, and where you were
// (xs, m ahead of the curl) coming out of each. Pumping should make sections that trimming can't.
//   node test/sections.mjs [waves]   (default 6 waves; WAVE=point to compare plain Raglan)
import { createRider, resetRider, stepRider, useWave } from '../src/rider.js';
import { PEEL_SPEED, RIDGE, ridgeAt } from '../src/wave.js';
import { nextWave, stepSea, seedSea } from '../src/sea.js';
const dt = 1 / 120, mph = (v) => (v * 2.237).toFixed(0);
const N = Number(process.argv[2] || 6), wave = process.env.WAVE || 'raglanPlus';
useWave(wave);
const policies = {
  trim: () => (r) => ({ aim: [1, Math.max(-0.6, Math.min(0.6, 3 * (0.5 - r.height)))] }),
  pump: () => { let up = false; return (r) => {
    if (up && r.height > 0.8) up = false;
    if (!up && r.height < 0.15) up = true;
    if (Math.cos(r.phi) < 0) return { aim: [1, -0.3] };
    if (r.xs < -1) return { aim: [1, 0.6] };
    if (r.xs > 6) return { aim: [-0.2, up ? 1 : -1] };
    return { tilt: up ? 1 : -1 };
  }; },
};
const totals = {};
for (const [name, make] of Object.entries(policies)) {
  seedSea(7);
  const rows = []; let made = 0, met = 0, rode = 0;
  for (let k = 0; k < N; k++) {
    nextWave();
    const r = createRider(); resetRider(r); r.events = []; stepRider(r, {}, 0);
    const policy = make();
    let i = 0, inSec = false, secPeak = 0; const outs = [];
    for (; i < 45 / dt; i++) {
      stepSea(dt); stepRider(r, policy(r), dt);
      if (r.mode !== 'surf' && r.mode !== 'air') break;
      const k0 = RIDGE.at;
      if (!inSec && k0 > 0.5) { inSec = true; secPeak = 0; met++; }
      if (inSec) secPeak = Math.max(secPeak, PEEL_SPEED);
      if (inSec && k0 < 0.2) { inSec = false; made++; outs.push(`${r.xs.toFixed(0)}m@${mph(secPeak)}`); }
    }
    const t = i * dt; rode += t;
    rows.push(`    wave ${k + 1}: ${r.mode === 'surf' || r.mode === 'air' ? 'rode 45 s' : 'caught at ' + t.toFixed(1) + ' s'}, curl ran ${RIDGE.c.toFixed(0)} m; out of sections at ${outs.join(', ') || '-'}`);
  }
  totals[name] = { made, met, rode };
  console.log(`-- ${wave} ${name}: made ${made} of ${met} sections met, average ride ${(rode / N).toFixed(1)} s`);
  rows.forEach((x) => console.log(x));
}
if (wave === 'raglanPlus') {
  const ok = totals.pump.made > totals.trim.made && totals.pump.rode > totals.trim.rode;
  console.log(`${ok ? 'ok  ' : 'FAIL'} pumping makes more sections and rides longer than trimming`);
  if (!ok) process.exitCode = 1;
  // (the user, 2026-11-22: sections were hard to make; trimming now holds up to half a section's extra speed by its
  // steepness: pumping should make most sections, trimming alone still shouldn't)
  const ok2 = totals.pump.made >= 0.8 * totals.pump.met && totals.trim.made <= 0.5 * totals.trim.met;
  console.log(`${ok2 ? 'ok  ' : 'FAIL'} pumping makes most sections (${totals.pump.made}/${totals.pump.met}), trimming alone not (${totals.trim.made}/${totals.trim.met})`);
  if (!ok2) process.exitCode = 1;
}
