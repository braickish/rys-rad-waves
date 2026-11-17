// Face steepness along the reef, as you'd see it from inside the tube: the face angle (deg from horizontal)
// at fixed heights above the trough (1.5, 3, 4.5, 6 m), climbing from the trough, for each xs from deep in the
// tube out to the shoulder; flags spots that get steeper going out. (6 m near the crest on the shoulder is the
// crest rounding over, not the face.) Usage: node test/steepness.mjs
import { setWave, surface, phaseAt } from '../src/wave.js';
setWave('reef');
const H = [1.5, 3, 4.5, 6];
let prev = null, rises = 0;
for (let xs = -10; xs <= 18; xs += 0.5) {
  let bot = 1e9, tb = 14; for (let t = 9; t <= 14.6; t += 0.01) { const y = surface(xs, t)[1]; if (y < bot) { bot = y; tb = t; } }
  const out = H.map((h) => {
    const y = bot + h;
    for (let t = tb; t > 4; t -= 0.01) {
      const a = surface(xs, t), b = surface(xs, t - 0.01); // climbing
      if (a[1] < y && b[1] >= y) return Math.atan2(b[1] - a[1], a[2] - b[2]) * 57.3;
      if (b[1] < a[1] - 1e-6) break; // went over the top
    }
    return NaN;
  });
  let flag = '';
  if (prev) out.forEach((g, i) => { if (g > prev[i] + 0.5) flag += ` ^${H[i]}`; });
  if (flag) rises++;
  if (xs % 1 === 0 || flag) console.log(`xs ${String(xs).padStart(5)} s ${phaseAt(xs).toFixed(2).padStart(5)} ${out.map((g) => (isNaN(g) ? '  -' : g.toFixed(0).padStart(4))).join('')}${flag}`);
  prev = out;
}
console.log('rises:', rises);
