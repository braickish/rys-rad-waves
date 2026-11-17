// Face steepness along the wave: the angle (deg from horizontal) at 25/50/70% of the rideable face height
// (from faceTop down) for each xs, flagging any place it gets steeper going forward toward the shoulder.
// Usage: node test/steepness.mjs [reef|point]
import { setWave, surface, phaseAt, WAVE } from '../src/wave.js';
setWave(process.argv[2] || 'reef');
const rows = [];
for (let xs = -12; xs <= 24; xs += 0.5) {
  const tTop = WAVE.faceTop(phaseAt(xs)); let top = surface(xs, tTop)[1], bot = 1e9;
  for (let t = tTop; t <= 14.6; t += 0.01) bot = Math.min(bot, surface(xs, t)[1]);
  const out = [];
  for (const f of [0.25, 0.5, 0.7]) {
    const y = bot + (top - bot) * f;
    let g = NaN;
    for (let t = tTop; t <= 14.6; t += 0.01) {
      const a = surface(xs, t), b = surface(xs, t + 0.01);
      if (a[1] >= y && b[1] < y) { g = Math.atan2(a[1] - b[1], b[2] - a[2]) * 57.3; break; }
    }
    out.push(g);
  }
  rows.push([xs, out]);
}
let prev = null, bumps = 0;
for (const [xs, o] of rows) {
  let flag = '';
  if (prev) o.forEach((g, i) => { if (g > prev[i] + 0.3) flag += ` ^${['25', '50', '70'][i]}`; });
  if (flag) bumps++;
  if (xs % 1 === 0 || flag) console.log(`xs ${String(xs).padStart(5)} s ${phaseAt(xs).toFixed(2).padStart(5)}  ${o.map((g) => g.toFixed(0).padStart(4)).join('')}${flag}`);
  prev = o;
}
console.log('rises going forward:', bumps);
