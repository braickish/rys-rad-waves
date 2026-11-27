// Coast handles the whole length of the zoomed-out map (the user, 2026-11-27), without breaking existing designs: the depth the
// model builds from an old five-handle coast is the same with the handles extendCoast adds, and the new nine-handle default is
// the same as the old five-handle default. node test/coast.mjs
import { buildDepth, makeGrid, defaultCoast, extendCoast, BAY } from '../src/builder/reef.js';

let fails = 0;
const oldDefault = () => ({ face: 66.7, pts: [0.08, 0.31, 0.54, 0.77, 0.92].map((f) => [BAY.shoreX, BAY.view.y0 + (BAY.view.y1 - BAY.view.y0) * f]) });
const blocks = [{ type: 'peak', start: [900, 520], side: 0, depth_m: 2, width_m: 60, back_m: 60, fade_m: 40 }];
const diff = (a, b) => { const ga = buildDepth(blocks, makeGrid(), a), gb = buildDepth(blocks, makeGrid(), b); let m = 0; for (let i = 0; i < ga.depth.length; i++) m = Math.max(m, Math.abs(ga.depth[i] - gb.depth[i])); return m; };
const cases = {
  'old default vs new default': [oldDefault(), defaultCoast()],
  'old default, extended': [oldDefault(), extendCoast(oldDefault())],
  'a bent beach (old, 5 handles), extended': (() => { const c = oldDefault(); c.pts = c.pts.map(([x, y], k) => [x - [0, 30, 60, 20, 0][k], y]); return [c, extendCoast(c)]; })(),
  'an angled beach (old), extended': (() => { const c = oldDefault(); c.pts = c.pts.map(([x, y], k) => [x - 25 * k, y]); c.face = 20; c.deep = true; return [c, extendCoast(c)]; })(),
};
for (const [name, [a, b]] of Object.entries(cases)) {
  const d = diff(a, b), ok = d < 1e-6 && b.pts.length === 9;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${a.pts.length} -> ${b.pts.length} handles, depth differs by at most ${d.toFixed(4)} m`);
  if (!ok) fails++;
}
// (a coast that already has the new handles is left as it is)
const nine = defaultCoast(); const again = extendCoast(nine);
const same = again.pts.length === 9 && again.pts.every((p, k) => p[0] === nine.pts[k][0] && p[1] === nine.pts[k][1]);
console.log(`${same ? 'ok  ' : 'FAIL'} a coast with the new handles isn't extended again`); if (!same) fails++;
console.log(fails ? `\n${fails} failed` : '\nall ok');
process.exit(fails ? 1 : 0);
