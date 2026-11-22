// Takeoff check (the user, 2026-11-22: Raglan feels slow on takeoff, and pointing down doesn't pay like on Pipe):
// from the game's drop-in, hold the nose at a fixed angle below along-the-line and log speed / height over 3 s.
//   node test/takeoff.mjs [wave ...]   (OVR='{"dropTerminal":0}' to override tune values)
import { createRider, resetRider, stepRider, useWave, TUNE, faceFlow, frameAt } from '../src/rider.js';
import { PEEL_SPEED } from '../src/wave.js';
import { nextWave, stepSea, seedSea } from '../src/sea.js';
const dt = 1 / 120, mph = (v) => (v * 2.237).toFixed(1);
const waves = process.argv.length > 2 ? process.argv.slice(2) : ['point', 'reef'];
const ovr = process.env.OVR ? JSON.parse(process.env.OVR) : {};
for (const w of waves) {
  useWave(w); Object.assign(TUNE, ovr);
  seedSea(1); nextWave();
  const r0 = createRider(); resetRider(r0);
  console.log(`-- ${w}: peel ${mph(PEEL_SPEED)} mph, drop-in ${mph(r0.speed)} mph at height ${(r0.height ?? 0).toFixed(2)}, phi ${(r0.phi * 57.3).toFixed(0)} deg, flow ${faceFlow().toFixed(1)} m/s`);
  for (const deg of [0, -20, -40, -60, -80]) {
    seedSea(1); nextWave();
    const r = createRider(); resetRider(r); r.events = []; stepRider(r, {}, 0);
    const a = deg / 57.3, marks = [0.5, 1, 1.5, 2, 3]; const out = [];
    let vmax = 0, tmax = 0;
    for (let i = 1; i <= 3 / dt; i++) {
      stepSea(dt); stepRider(r, { aim: [Math.cos(a), Math.sin(a)] }, dt);
      if (r.speed > vmax) { vmax = r.speed; tmax = i * dt; }
      if (marks.some((m) => Math.abs(m - i * dt) < dt / 2)) out.push(`${mph(r.speed)}@h${r.height.toFixed(2)}`);
      if (r.mode !== 'surf') { out.push(r.mode + '@' + (i * dt).toFixed(1)); break; }
    }
    console.log(`  aim ${String(deg).padStart(3)}: ${out.join('  ')}   max ${mph(vmax)} @${tmax.toFixed(1)}s`);
  }
}
