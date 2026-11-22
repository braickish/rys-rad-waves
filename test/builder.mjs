// Wave builder's fast break model (src/builder: reef.js + rays.js, ports of research/reef-generator's reefgen.py and
// peelrays.py) on the Dynamic reef (recipes/sweep_combo_shelf_eased_grad10.json), against the Python model and FUNWAVE.
// References (2026-11-22): peelrays.py right ride 220 m at median peel 29.5 deg, left 220 m at 31.7; FUNWAVE (flag break
// maps) median curl 204 m, peel ~29 deg. Also how long a rebuild + trace takes (the builder redraws while you drag).
//   node test/builder.mjs
import { buildDepth, makeGrid } from '../src/builder/reef.js';
import { traceRays, analyse } from '../src/builder/rays.js';
import { defaultLoop, loopInfo, clampLoop, LOOP } from '../src/builder/loop.js';

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
check(tBuild + tRays + tAn < 400, `rebuild + trace under 400 ms in node (${(tBuild + tRays + tAn).toFixed(0)})`);
console.log(fails ? 'SOME FAILED' : 'all ok');
process.exitCode = fails ? 1 : 0;
