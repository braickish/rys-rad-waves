// Renders wave cross-sections to an SVG for eyeballing the shapes.
import { slice, phaseAt } from '../src/wave.js';
import { writeFileSync } from 'node:fs';
const xsList = [30, 10, 2, -2, -5, -7, -10, -13, -20];
const W = 1200, rowH = 150, sc = 40;
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${rowH * xsList.length}" style="background:#fff">`;
xsList.forEach((xs, r) => {
  const sl = slice(xs, 12);
  const pts = [];
  for (let i = 0; i < sl.count; i++) {
    if (sl.z[i] < -14 || sl.z[i] > 16) continue;
    pts.push(`${(sl.z[i] + 14) * sc},${r * rowH + 120 - sl.y[i] * sc}`);
  }
  svg += `<polyline fill="none" stroke="#06c" stroke-width="2" points="${pts.join(' ')}"/>`;
  svg += `<text x="5" y="${r * rowH + 20}" font-size="16">xs=${xs} s=${phaseAt(xs).toFixed(2)}</text>`;
});
svg += '</svg>';
writeFileSync(process.argv[2], svg);
