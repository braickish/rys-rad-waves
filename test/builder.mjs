// Wave builder's fast break model (src/builder: reef.js + rays.js, ports of research/reef-generator's reefgen.py and
// peelrays.py) on the Dynamic reef (recipes/sweep_combo_shelf_eased_grad10.json), against the Python model and FUNWAVE.
// References (2026-11-22): peelrays.py right ride 220 m at median peel 29.5 deg, left 220 m at 31.7; FUNWAVE (flag break
// maps) median curl 204 m, peel ~29 deg. Also how long a rebuild + trace takes (the builder redraws while you drag).
//   node test/builder.mjs
import { buildDepth, makeGrid, defaultCoast } from '../src/builder/reef.js';
import { traceRays, analyse } from '../src/builder/rays.js';
import { defaultLoop, loopInfo, clampLoop, LOOP } from '../src/builder/loop.js';
import { runPE } from '../src/builder/pewave.js';

const DYNAMIC = [
  { type: 'ramp', start_depth_m: 13, end_depth_m: 8.5, x0_m: 300, length_m: 420 },
  { type: 'focus', apex: [860, 520], width_m: 220, convexity: 0.667, depth_m: 3.0, gradient: '1:10' },
  { type: 'wedge', start: [860, 520], side: -1, length_m: 212, gradient: '1:10', angle_to_swell_deg: 45, depth_m: 3.0, top_depth_m: 1.0 },
  { type: 'wedge', start: [860, 520], side: 1, length_m: 212, gradient: '1:10', angle_to_swell_deg: 45, depth_m: 3.0, top_depth_m: 1.0 },
  { type: 'ledge', start: [885, 488], side: -1, length_m: 100, angle_to_swell_deg: 45, depth_m: 1.6, step_m: 4.0, face: '1:3', gradient: '1:15', width_m: 40, back_m: 40, fade_m: 40 },
];
const swell = { H: 1.6, T: 15, dir: 0 };
let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) fails++; };

let t0 = performance.now();
const grid = buildDepth(DYNAMIC, makeGrid());
const tBuild = performance.now() - t0; t0 = performance.now();
const R = traceRays(grid, swell);
const tRays = performance.now() - t0; t0 = performance.now();
const A = analyse(R, grid);
const tAn = performance.now() - t0;
console.log(`grid ${grid.M} x ${grid.N} (${grid.dx} m), ${R.n} rays; build ${tBuild.toFixed(0)} ms, rays ${tRays.toFixed(0)} ms, analyse ${tAn.toFixed(0)} ms`);
console.log(`peak at x' ${A.peak.x.toFixed(0)}, y' ${A.peak.y.toFixed(0)} (Python 860, 514)`);
const ref = { right: [220, 29.5], left: [220, 31.7] };
for (const side of ['right', 'left']) {
  const s = A[side];
  console.log(`${side.padEnd(5)}: line ${s.line.toFixed(0)} m, ride ${s.ride.toFixed(0)} m, median peel ${s.peel.toFixed(1)} deg (${s.band}), breaker H ${s.H.toFixed(1)} m, ${s.seconds.toFixed(1)} s, ends: ${s.end}`);
  console.log('       per 20 m:', s.segs.map((q) => q.a.toFixed(0)).join(' '));
  check(Math.abs(s.peel - ref[side][1]) < 4, `${side}: peel within 4 deg of Python's ${ref[side][1]}`);
  check(Math.abs(s.ride - ref[side][0]) < 50, `${side}: ride within 50 m of Python's ${ref[side][0]} m (FUNWAVE 204)`);
}
// Loop (the user, 2026-11-22: mark the primary stretch and surf it on repeat): the default stretch on each side
for (const side of ['right', 'left']) {
  const st = defaultLoop(A[side]), I = st && loopInfo(A[side], st.a, st.b);
  console.log(`loop ${side}: ${st ? `${st.a}-${st.b} m, ${I.length} m, ${I.seconds.toFixed(1)} s a lap, curl ${(I.vMin * 2.237).toFixed(0)}-${(I.vMax * 2.237).toFixed(0)} mph, ${I.sections} sections, seam dv ${(I.seam.dv * 100).toFixed(0)}% dH ${(I.seam.dH * 100).toFixed(0)}%` : 'none'}`);
  check(st && I.length >= LOOP.min && !I.closes, `${side}: a default loop past the takeoff, no closeout in it`);
  check(I && I.profile.length === Math.floor(I.length / 10) + 1, `${side}: the loop's profile has a point every 10 m`);
}
check(clampLoop(A.right, 0, 9999).b <= A.right.ride && clampLoop(A.right, 200, 210) === null || clampLoop(A.right, 200, 210)?.b - clampLoop(A.right, 200, 210)?.a >= LOOP.min, 'a loop stays inside the ride and at least LOOP.min long');
// Breaking intensity (plan step 1): xi0 = the seabed slope along the wave / sqrt(H0 / L0). Python's ray_zone.py on this
// reef: the right arm ~0.9-1.5 (plunging). Steeper reef lines and longer periods break harder; the peel barely changes.
console.log(`intensity: right xi0 ${A.right.xi.toFixed(2)} (${A.right.how}), left ${A.left.xi.toFixed(2)} (${A.left.how})`);
check(A.left.xi > 0.5 && A.left.xi < 3.3 && A.right.xi > 0.5 && A.right.xi < 3.3, 'both arms plunge (xi0 0.5-3.3, as the Python model)');
{
  const arms = (grad, T = 15) => {
    const D = [DYNAMIC[0], { ...DYNAMIC[1], gradient: grad }, { ...DYNAMIC[3], gradient: grad }];
    const g = buildDepth(D, makeGrid()); return analyse(traceRays(g, { ...swell, T }), g).left;
  };
  const x6 = arms('1:6'), x10 = arms('1:10'), x15 = arms('1:15'), t10 = arms('1:10', 10), t18 = arms('1:10', 18);
  console.log(`  arm line 1:6 / 1:10 / 1:15: xi0 ${x6.xi.toFixed(2)} / ${x10.xi.toFixed(2)} / ${x15.xi.toFixed(2)} (peel ${x6.peel.toFixed(0)} / ${x10.peel.toFixed(0)} / ${x15.peel.toFixed(0)}); 10 / 18 s: ${t10.xi.toFixed(2)} / ${t18.xi.toFixed(2)}`);
  check(x6.xi > x10.xi && x10.xi > x15.xi, 'a steeper reef line breaks harder');
  check(Math.abs(x6.peel - x15.peel) < 5, 'the reef line\'s gradient leaves the peel alone (within 5 deg)');
  check(t18.xi > t10.xi, 'a longer-period swell breaks harder on the same reef');
}
// The height model (plan step 4: pewave.js, a port of research/reef-generator/pewave.py): Hs on this reef against the
// Python model's own (pewave.py on the recipe, 2 m cells, 2026-11-22: x', y', depth, Hs), then the refined wave.
{
  const PY = [
  [800, 520, 6.65, 1.847],
  [860, 520, 2.99, 2.286],
  [900, 480, 1.78, 1.912],
  [940, 440, 1.62, 1.414],
  [980, 400, 2.88, 1.551],
  [1010, 370, 3.0, 1.563],
  [900, 560, 2.81, 1.652],
  [940, 600, 3.01, 1.606],
  [980, 640, 2.81, 1.572],
  [700, 520, 8.25, 1.768],
  [1050, 520, 1.1, 1.213],
  [885, 488, 2.27, 1.847],
  [905, 468, 2.09, 1.608]];
  let t1 = performance.now(); const P = runPE(grid, swell); const tPE = performance.now() - t1;
  let se = 0, worst = 0;
  for (const [x, y, , hpy] of PY) { const i = Math.round((x - grid.x0) / grid.dx - 0.5), j = Math.round((y - grid.y0) / grid.dx - 0.5), d = P.Hs[j * grid.M + i] - hpy; se += d * d; worst = Math.max(worst, Math.abs(d)); }
  const rms = Math.sqrt(se / PY.length);
  console.log(`height model: ${tPE.toFixed(0)} ms; Hs vs pewave.py at ${PY.length} points: rms ${rms.toFixed(2)} m, worst ${worst.toFixed(2)} m`);
  check(rms < 0.2, 'height model: Hs within 0.2 m rms of the Python model');
  check(tPE < 1500, 'height model: fast enough to refine after a drag (< 1.5 s in node)');
  const B = analyse(R, grid, { pe: P });
  console.log(`refined: right H ${B.right.H.toFixed(2)} m (rays ${A.right.H.toFixed(2)}), xi0 ${B.right.xi.toFixed(2)} (${B.right.how}, rays ${A.right.xi.toFixed(2)}); left H ${B.left.H.toFixed(2)}, xi0 ${B.left.xi.toFixed(2)} (${B.left.how})`);
  check(B.right.refined && B.right.H < A.right.H, 'refined: the set waves break smaller than the rays said (they over-read)');
  check(B.right.xi > 0.5 && B.right.xi < 3.3 && B.left.xi > 0.5, 'refined: both arms still plunge (the right\'s ledge shelf ~1.5: the set waves break on its steep face)');
  check(Math.abs(B.right.peel - A.right.peel) < 1e-9 && B.right.ride === A.right.ride, 'refined: timing and peel stay the rays\'');
}
// The coastline (plan step 5): the default is the old floor; a sandy coast at a steep angle to the swell peels the whole bay
// like Skeleton Bay; the beach face sets the hollowness and the swell's angle the peel, as research/reef-generator's
// Skeleton Bay sweep (75 deg off the shore normal: ~30 deg peel; faces 1:12 / 1:20 / 1:35 -> xi 0.93 / 0.63 / 0.37;
// periods 11.6 / 15 / 18 s -> xi 0.49 / 0.63 / 0.76).
{
  const { FLOOR } = await import('../src/builder/blocks.js');
  const a = buildDepth(DYNAMIC, makeGrid()).depth, b = buildDepth(DYNAMIC, makeGrid(), defaultCoast()).depth;
  let m = 0; for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i]));
  check(m < 0.02, `coast: the default coastline is the old floor (max ${m.toFixed(3)} m apart)`);
  const angled = (face, ang) => { const c = defaultCoast(); c.face = face; const t = Math.tan(ang * Math.PI / 180); c.pts = c.pts.map(([x, y]) => [1240 - (y - c.pts[0][1]) * t, y]); return c; };
  const coast = (c, sw) => { const g = buildDepth(FLOOR, makeGrid(), c), R2 = traceRays(g, sw); return analyse(R2, g, { pe: runPE(g, sw) }); };
  const sk = coast(angled(20, 35), { H: 1.6, T: 15, dir: 40 }).right;
  console.log(`coast 35 deg, swell +40 (75 deg to the shore), face 1:20: ride ${sk.ride.toFixed(0)} m at ${sk.peel.toFixed(0)} deg, xi0 ${sk.xi.toFixed(2)} (${sk.how})`);
  check(sk.ride > 600 && sk.peel > 24 && sk.peel < 34, 'coast: a sandy coast nearly along the swell peels the whole bay at ~25-33 deg');
  const f35 = coast(angled(35, 35), { H: 1.6, T: 15, dir: 40 }).right, t11 = coast(angled(20, 35), { H: 1.6, T: 11.6, dir: 40 }).right, t18 = coast(angled(20, 35), { H: 1.6, T: 18, dir: 40 }).right;
  const f12 = coast(angled(12, 35), { H: 1.6, T: 15, dir: 40 }).right;
  console.log(`  faces 1:12 / 1:20 / 1:35: xi0 ${f12.xi.toFixed(2)} / ${sk.xi.toFixed(2)} / ${f35.xi.toFixed(2)} (research 0.93 / 0.63 / 0.37); 11.6 / 18 s: ${t11.xi.toFixed(2)} / ${t18.xi.toFixed(2)} (0.49 / 0.76)`);
  check(f12.xi > sk.xi && sk.xi > f35.xi && Math.abs(sk.xi - 0.63) < 0.15 && Math.abs(f35.xi - 0.37) < 0.1, 'coast: the beach face sets the hollowness, near the research\'s numbers');
  check(t18.xi > sk.xi && sk.xi > t11.xi, 'coast: a longer period breaks hollower');
  const st = coast((() => { const c = defaultCoast(); c.face = 20; return c; })(), { H: 1.6, T: 15, dir: 0 });
  check(!st || (st.right.ride < 60 && st.left.ride < 60), 'coast: a straight beach facing the swell closes out');
}
check(tBuild + tRays + tAn < 400, `rebuild + trace under 400 ms in node (${(tBuild + tRays + tAn).toFixed(0)})`);
console.log(fails ? 'SOME FAILED' : 'all ok');
process.exitCode = fails ? 1 : 0;
