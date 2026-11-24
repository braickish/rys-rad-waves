// The builder's Pipeline preset (blocks.js PIPELINE; the user, 2026-11-23: the Pipe wave on Pipeline's real reef, with first,
// second and third reef). The reef against the real one (the 2013 USACE lidar, research/pipeline-reef, and the usual figures:
// First Reef ~60-80 m out in 1-3 m, Second ~130-150 m out in 4.5-6 m, Third ~300 m out in 9-12 m), then how it breaks in the
// builder's own model (rays + pewave, as after a drag) as the swell grows.
//   node test/pipeline.mjs
import { buildDepth, makeGrid, BAY, BAY_DEEP_OFF, defaultCoast } from '../src/builder/reef.js';
import { traceRays, analyse } from '../src/builder/rays.js';
import { runPE } from '../src/builder/pewave.js';
import { takeoffStart, wavePayload } from '../src/builder/loop.js';
import { reefComponents, pipelinePreset, PIPELINE } from '../src/builder/blocks.js';

let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) fails++; };
const grid = buildDepth(reefComponents(pipelinePreset(), true), makeGrid({ ...BAY, offDepth: BAY_DEEP_OFF }), Object.assign(defaultCoast(), PIPELINE.coast));
const out = (x) => 1250 - x; // (metres offshore of the waterline)
const depthAt = (n, y) => grid.depth[Math.floor((y - grid.y0) / grid.dx) * grid.M + Math.floor((1250 - n - grid.x0) / grid.dx)];

// The reef. Each reef's top along its peak's line, and the floor offshore of the whole thing (the lidar's: 2.5 m at 60 m out,
// 4.7 at 120, 8.3 at 200, 10.5 at 300, 11-15 at 400-600).
const [r1, r2, r3] = PIPELINE.reefs;
const top = (r, lo, hi) => { let m = Infinity; for (let n = lo; n <= hi; n += 4) m = Math.min(m, depthAt(n, r.y)); return m; };
const t1 = top(r1, 60, 110), t2 = top(r2, 120, 180), t3 = top(r3, 250, 360);
console.log(`reef tops: First ${t1.toFixed(1)} m (${out(r1.x)} m out), Second ${t2.toFixed(1)} m (${out(r2.x)} m), Third ${t3.toFixed(1)} m (${out(r3.x)} m)`);
check(out(r1.x) >= 60 && out(r1.x) <= 100 && t1 >= 0.6 && t1 <= 3, 'First Reef: 60-100 m out, its top 0.6-3 m down (the usual "two to eight feet"; its flat behind the arms)');
check(out(r2.x) >= 120 && out(r2.x) <= 170 && t2 >= 4.5 && t2 <= 6, 'Second Reef: 120-170 m out, its top 4.5-6 m down');
check(out(r3.x) >= 270 && out(r3.x) <= 360 && t3 >= 6 && t3 <= 12, 'Third Reef: 270-360 m out, its top 6-12 m down (the lidar: ~9)');
check(t1 < t2 && t2 < t3, 'the reefs step down offshore: First shallower than Second shallower than Third');
const floor = [60, 120, 200, 300, 450].map((n) => depthAt(n, 120 + 30)); // (off to the side, clear of the reefs)
console.log(`floor beside the reefs at 60/120/200/300/450 m out: ${floor.map((d) => d.toFixed(1)).join(' / ')} m (lidar on the peak line: 2.5 / 4.7 / 8.3 / 10.5 / ~12)`);
check(floor[2] > 6 && floor[2] < 10 && floor[4] > 10 && floor[4] < 18, 'the floor deepens like the lidar shelf (6-10 m at 200 m out, 10-18 m at 450 m)');

// How it breaks. Each swell: the waves, and the one breaking on the reef we expect.
const run = (H, T, dir) => { const sw = { H, T, dir }; return { sw, A: analyse(traceRays(grid, sw), grid, { pe: runPE(grid, sw) }) }; };
const on = (A, lo, hi) => (A?.waves || []).filter((w) => out(w.peak.x) >= lo && out(w.peak.x) <= hi);
const desc = (w) => `${w.name} ${out(w.peak.x).toFixed(0)} m out: left ${w.left.ride.toFixed(0)} m @ ${w.left.peel?.toFixed(0)} deg ${w.left.how} (xi ${w.left.xi?.toFixed(2)}, H ${w.left.H?.toFixed(1)} m) | right ${w.right.ride.toFixed(0)} m @ ${w.right.peel?.toFixed(0)} deg`;
const barrel = (s, ride) => s && s.ride >= ride && s.peel >= 24 && s.peel <= 40 && s.xi >= 1.9; // (1.9: the builder's barrel shapes, loop.js shapeIndex)

{ // the default swell: a classic First Reef day, ~6 ft from the WNW
  const { sw, A } = run(PIPELINE.swell.H, PIPELINE.swell.T, PIPELINE.swell.dir);
  const w = A.waves[0];
  console.log(`default swell ${sw.H} m ${sw.T} s dir ${sw.dir}: ${desc(w)}`);
  check(out(w.peak.x) >= 60 && out(w.peak.x) <= 120, 'default swell: the main wave peaks on First Reef');
  check(barrel(w.left, 100), 'default swell: Pipe, a barrelling left of 100 m or more peeling 24-40 deg');
  check(w.right.ride >= 40, 'default swell: Backdoor, a right off the same peak');
  const st = takeoffStart(w.left), d = st && wavePayload(w.left, 'left', 'full', st.a, st.b, sw);
  console.log(`  DROP IN (left, full ride): ${d.length} m, breaker ${d.H.toFixed(1)} m, curl ${(d.base * 2.237).toFixed(0)} mph, shape u ${Math.min(...d.profile.map((q) => q.u)).toFixed(1)}-${Math.max(...d.profile.map((q) => q.u)).toFixed(1)}`);
  check(d && d.length >= 80 && d.profile.every((q) => q.u >= 2.5), 'DROP IN on it: 80 m or more in the barrel shapes the whole way (Pipe\'s tube)');
  check(d.base * 2.237 >= 18 && d.base * 2.237 <= 30, 'its curl runs 18-30 mph (the game\'s Pipe: 26)');
}
{ // a bigger First Reef day
  const { A } = run(2.5, 15, -10); const w = on(A, 60, 120).find((q) => barrel(q.left, 100));
  console.log(`2.5 m 15 s: ${w ? desc(w) : 'no First Reef barrel'}`);
  check(!!w, '8 ft: First Reef still barrels (Second Reef 4.5-6 m down lets it through)');
}
{ // Second Reef
  const { A } = run(3.5, 16, -10); const w = on(A, 120, 200).find((q) => barrel(q.left, 150));
  console.log(`3.5 m 16 s: ${(A.waves || []).map(desc).join('\n            ')}`);
  check(!!w, '11 ft: Second Reef breaks with a barrelling left of 150 m or more');
}
{ // Third Reef
  const { A } = run(4.5, 17, -10);
  console.log(`4.5 m 17 s: ${(A.waves || []).map(desc).join('\n            ')}`);
  check(out(A.peak.x) >= 250, '15 ft: it breaks first out on Third Reef');
}
{ // a more northerly swell: Backdoor
  const { A } = run(1.8, 15, -5); const w = on(A, 60, 120)[0];
  console.log(`1.8 m dir -5: ${w ? desc(w) : 'no First Reef wave'}`);
  check(w && w.right.ride > w.left.ride, 'a more northerly swell (dir -5) favours the right off First Reef (Backdoor) over the left');
}
console.log(fails ? 'SOME FAILED' : 'all ok');
process.exitCode = fails ? 1 : 0;
