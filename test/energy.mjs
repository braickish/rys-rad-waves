// Does linking turns generate speed? Compares riding styles by how they keep
// pace with the peel (mean vx in the peel frame; >= 0 means keeping up).
import { createRider, resetRider, stepRider } from '../src/rider.js';
const dt = 1 / 120;
function ride(name, policy, secs = 20) {
  const r = createRider(); resetRider(r);
  let sumVx = 0, n = 0, i = 0;
  for (; i < secs / dt; i++) {
    stepRider(r, policy(r), dt);
    sumVx += r.vel[0]; n++;
    if (r.mode !== 'surf') break;
  }
  console.log(`${name.padEnd(34)} ${(i * dt).toFixed(1).padStart(5)}s  mean vx ${(sumVx / n).toFixed(2).padStart(6)}  ${r.mode === 'wipe' ? r.wipeReason : r.mode}`);
}
function sturns(yHi, yLo, pump, look = 0.35) {
  let up = false;
  return (r) => {
    const vy = r.vel[1];
    if (up && r.pos[1] + vy * look > yHi) up = false;
    if (!up && r.pos[1] + vy * look < yLo) up = true;
    return { steer: [1, up ? 0.9 : -0.8], pump: pump && !up };
  };
}
function trim(yT) {
  return (r) => ({ steer: [1, Math.max(-0.6, Math.min(0.6, (yT - r.pos[1]) * 0.8))] });
}
for (const y of [1.2, 1.8, 2.4]) ride(`trim at y=${y}`, trim(y));
for (const [hi, lo] of [[2.0, 1.0], [2.6, 0.9], [3.0, 1.2]]) {
  ride(`S-turns ${hi}/${lo}`, sturns(hi, lo, false));
  ride(`S-turns ${hi}/${lo} + pump`, sturns(hi, lo, true));
}
