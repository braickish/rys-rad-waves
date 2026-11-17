// Along the wave: where the face sits (world z, with the bend) at fixed heights above the trough, and its
// curvature along xs. Seen from inside the tube the wall should only wrap in (z'' >= 0); z'' < 0 is a bulge.
import { setWave, slice } from '../src/wave.js';
setWave('reef');
const H = [1, 2, 3, 4, 5];
export function faceZ(x) {
  const sl = slice(x, 40); let bot = 1e9, ib = 0;
  for (let i = 0; i < sl.count; i++) if (sl.t[i] > 9 && sl.y[i] < bot) { bot = sl.y[i]; ib = i; }
  return H.map((h) => { const y = bot + h;
    for (let i = ib; i > 0; i--) { if (sl.y[i - 1] < sl.y[i] - 1e-6) break; if (sl.y[i] < y && sl.y[i - 1] >= y) { const f = (y - sl.y[i]) / (sl.y[i - 1] - sl.y[i]); return sl.z[i] + f * (sl.z[i - 1] - sl.z[i]); } }
    return NaN; });
}
export function bulges(log) {
  const dx = 1, out = []; let total = 0;
  for (let x = -12; x <= 22; x += 0.5) {
    const a = faceZ(x - dx), b = faceZ(x), c = faceZ(x + dx);
    const k = b.map((v, i) => (a[i] - 2 * v + c[i]) / (dx * dx));
    k.forEach((v) => { if (v < -0.005) total += v * v; });
    if (log && (x % 2 === 0 || k.some((v) => v < -0.02))) console.log(String(x).padStart(5), k.map((v) => isNaN(v) ? '     -' : v.toFixed(3).padStart(7)).join(''), k.some((v) => v < -0.02) ? ' <- bulge' : '');
  }
  return total;
}
if (process.argv[1].endsWith('concave.mjs')) console.log('bulge score', bulges(true).toFixed(3));
