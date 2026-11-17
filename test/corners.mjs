// Sharpest bend (curvature, 1/m at world scale) in each cross-section, excluding the lip tip.
import { setWave, slice, SCALE } from '../src/wave.js';
setWave(process.argv[2] || 'reef');
export function corners(xsList, log = false) {
  const out = [];
  for (const x of xsList) {
    const sl = slice(x, 40); let worst = 0, wt = 0;
    for (let i = 1; i < sl.count - 1; i++) {
      const t = sl.t[i]; if (t < 2.5 || t > 14.5 || (t > 7.0 && t < 9.2)) continue; // ends, and the lip tip
      const ax = sl.z[i] - sl.z[i - 1], ay = sl.y[i] - sl.y[i - 1], bx = sl.z[i + 1] - sl.z[i], by = sl.y[i + 1] - sl.y[i];
      const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
      const k = Math.abs(Math.atan2(ax * by - ay * bx, ax * bx + ay * by)) / ((la + lb) / 2);
      if (k > worst) { worst = k; wt = t; }
    }
    out.push([x, worst, wt]);
    if (log) console.log(String(x).padStart(5), worst.toFixed(2).padStart(6), 't', wt.toFixed(2));
  }
  return out;
}
if (process.argv[1].endsWith('corners.mjs')) { const L = []; for (let x = -14; x <= 24; x += 1) L.push(x); corners(L, true); }
