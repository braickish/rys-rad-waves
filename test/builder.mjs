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
// The Sandbar block (plan step 6): a gentle 1:40 mound, a beach-break peak. On the beach preset (medium 1:20 beach, 12 s
// swell): pointing out to sea an A-frame, crumbly, both ways; lined up with the swell it closes out or barely rides.
{
  const { reefComponents: rc, newBlock: nb, beachPreset } = await import('../src/builder/blocks.js');
  const sw12 = { H: 1.6, T: 12, dir: 0 }, coast20 = defaultCoast(); coast20.face = 20;
  const beach = (bl) => { const g = buildDepth(rc(bl), makeGrid(), coast20), R2 = traceRays(g, sw12); return analyse(R2, g, { pe: runPE(g, sw12) }); };
  const af = beach(beachPreset());
  console.log(`sandbar A-frame: right ${af.right.ride.toFixed(0)} m ${af.right.peel.toFixed(0)} deg ${af.right.how}, left ${af.left.ride.toFixed(0)} m ${af.left.peel.toFixed(0)} deg ${af.left.how} (xi0 ${af.right.xi.toFixed(2)} / ${af.left.xi.toFixed(2)})`);
  check(af.right.ride >= 40 && af.left.ride >= 40 && af.right.xi < 0.5 && af.left.xi < 0.5, 'sandbar: pointing out to sea, a crumbly A-frame both ways');
  const par = beach([Object.assign(nb('sandbar', 1040, 520), { rot: 90 })]);
  console.log(`sandbar lined up with the swell: right ${par ? par.right.ride.toFixed(0) : 0} m, left ${par ? par.left.ride.toFixed(0) : 0} m`);
  check(!par || par.right.ride + par.left.ride < af.right.ride + af.left.ride, 'sandbar: lined up with the swell it rides less (it closes out)');
}
// Big swells (the user, 2026-11-22): on the shallow-shelf bay a 4 m swell breaks across the bay at once; with Deep offshore
// water (25 m, the shelf at 24-16 m, the nearshore dropping 1:25) the Dynamic reef rides it.
{
  const { BAY, BAY_DEEP_OFF } = await import('../src/builder/reef.js');
  const { reefComponents: rc, dynamicPreset: dp } = await import('../src/builder/blocks.js');
  const big = { H: 4, T: 15, dir: 0 };
  const bay = (deep) => { const c = defaultCoast(); c.deep = deep; const g = buildDepth(rc(dp(), deep), makeGrid(deep ? { ...BAY, offDepth: BAY_DEEP_OFF } : BAY), c), R2 = traceRays(g, big); return analyse(R2, g, { pe: runPE(g, big) }); };
  const shelf = bay(false), deep = bay(true);
  console.log(`4 m swell: shelf bay right ${shelf.right.ride.toFixed(0)} / left ${shelf.left.ride.toFixed(0)} m; deep bay right ${deep.right.ride.toFixed(0)} / left ${deep.left.ride.toFixed(0)} m at ${deep.left.peel.toFixed(0)} deg, ${(deep.left.H * 3.281).toFixed(0)} ft`);
  check(deep.right.ride + deep.left.ride > 2 * (shelf.right.ride + shelf.left.ride) && deep.left.ride > 60, 'big swell: deep offshore water lets the reef ride a 4 m swell that closes out on the shelf');
}
// Reef Size (the user, 2026-11-22): every length and depth of a block x 2.5 (Froude: a 2.5x reef breaks a 2.5x swell alike).
// A 13 ft swell on the Dynamic reef at 1x rides short and crumbly; at 2.5x (its peak set 160 m further out so its arms fit) it
// rides long and pitching again, as the 1x reef does at 5 ft.
{
  const { BAY, BAY_DEEP_OFF } = await import('../src/builder/reef.js');
  const { reefComponents: rc, dynamicPreset: dp } = await import('../src/builder/blocks.js');
  const big = { H: 4, T: 18, dir: 0 };
  const ride = (size, x) => { const bl = dp(); for (const b of bl) { b.size = size; b.x = x; } const c = defaultCoast(); c.deep = true; const g = buildDepth(rc(bl, true), makeGrid({ ...BAY, offDepth: BAY_DEEP_OFF }), c), R2 = traceRays(g, big); return analyse(R2, g, { pe: runPE(g, big) }); };
  const s1 = ride(1, 860), s25 = ride(2.5, 700);
  console.log(`13 ft 18 s: reef 1x right ${s1.right.ride.toFixed(0)} m ${s1.right.how}, left ${s1.left.ride.toFixed(0)} m; reef 2.5x right ${s25.right.ride.toFixed(0)} m at ${s25.right.peel.toFixed(0)} deg ${s25.right.how}, left ${s25.left.ride.toFixed(0)} m at ${s25.left.peel.toFixed(0)} deg`);
  check(s25.right.ride > 2 * s1.right.ride && s25.left.ride > 2 * s1.left.ride && s25.right.xi > 0.9, 'size: a 2.5x reef rides a 13 ft swell long and pitching, as the 1x reef rides 5 ft');
}
// Stacked reefs (plan step 8): a broken wave loses height toward 0.4 h (Dally, Dean & Dalrymple) and reforms where the water
// deepens. Behind an outer reef with a reef flat it never does (the inner reef gets no wave of its own); with a lagoon it
// reforms and breaks again on the inner reef: a second, smaller wave, steeper than the swell's own height would say.
{
  const { BAY, BAY_DEEP_OFF, defaultCoast: dc } = await import('../src/builder/reef.js');
  const { reefComponents: rc, stackedPreset } = await import('../src/builder/blocks.js');
  const sw = { H: 3, T: 15, dir: 0 };
  const run = (back) => { const bl = stackedPreset(); for (const b of bl) if (b.back) b.back = back; const g = buildDepth(rc(bl, true), makeGrid({ ...BAY, offDepth: BAY_DEEP_OFF }), Object.assign(dc(), { deep: true })); return analyse(traceRays(g, sw), g, { pe: runPE(g, sw) }); };
  const flat = run('flat'), lag = run('lagoon'), ins = lag.waves.find((w) => w.tier === 'inside');
  const desc = (A) => A.waves.map((w) => `${w.name} ${w.tier} at x' ${w.peak.x.toFixed(0)} (${(Math.max(w.right.H, w.left.H) * 3.281).toFixed(0)} ft, ${w.left.how})`).join(', ');
  console.log(`stacked, 10 ft 15 s: reef flat behind: ${desc(flat)}; lagoon: ${desc(lag)}`);
  check(!flat.waves.some((w) => w.tier === 'inside'), 'stacked: behind a reef flat the broken waves never reform');
  check(ins && ins.peak.x > 950 && ins.left.ride >= 60 && ins.left.H < 0.7 * lag.left.H, 'stacked: over a lagoon they reform and break again on the inside reef, smaller');
  check(ins && ins.left.xi >= 0.5, 'stacked: the inside wave breaks by its own height (not crumbly from the swell\'s)');
  check(lag.waves[0].tier === 'outside' && Math.abs(lag.left.ride - flat.left.ride) < 30, 'stacked: the outside wave is the main one and the lagoon leaves it alone');
}
// No crawling waves (the user, 2026-11-22: an inside wave listed at 90 deg, "curl ~0 mph"): on Dynamic with a 10 ft 9 s swell
// from +35 a reformed wave reaching the beach breaks along its own path (90 deg); it isn't listed, and no extra wave is
// listed without a ride between a closeout and a back-off (25-70 deg).
{
  const { BAY, BAY_DEEP_OFF, defaultCoast: dc } = await import('../src/builder/reef.js');
  const { reefComponents: rc, dynamicPreset: dp } = await import('../src/builder/blocks.js');
  const { isRide } = await import('../src/builder/rays.js');
  const sw = { H: 3, T: 9, dir: 35 }, g = buildDepth(rc(dp(), true), makeGrid({ ...BAY, offDepth: BAY_DEEP_OFF }), Object.assign(dc(), { deep: true }));
  const A = analyse(traceRays(g, sw), g, { pe: runPE(g, sw) });
  console.log(`crawl check: ${A.waves.map((w) => `${w.name} ${w.tier} ${['right', 'left'].map((sd) => `${sd[0]} ${isFinite(w[sd].peelAll) ? w[sd].peelAll.toFixed(0) : '-'} deg`).join(' ')}`).join(' | ')}`);
  check(A.waves.slice(1).every((w) => isRide(w.right) || isRide(w.left)), 'no crawling waves: every extra wave has a ride peeling 25-70 deg');
}
// A section that breaks ahead (the user, 2026-11-23: a barrel section you ride through, open at both ends): a pinnacle just
// seaward of Dynamic's right arm stands the wave up early there. The stretch breaks on its own before the curl gets there,
// the curl runs through it, and the ride carries on down the arm beyond (it used to end there, "reaches the end of the
// reef"); the payload carries each spot's lead (`e`). Plain Dynamic has no such stretch.
{
  const { reefComponents: rc, dynamicPreset: dp, newBlock } = await import('../src/builder/blocks.js');
  const { wavePayload, takeoffStart } = await import('../src/builder/loop.js');
  const go = (bl) => { const g = buildDepth(rc(bl), makeGrid()); return analyse(traceRays(g, swell), g, { pe: runPE(g, swell) }); };
  const plain = go(dp()), pin = go([...dp(), newBlock('pinnacle', 920, 440)]);
  const lead = (S) => S.curl.filter((p) => p.s <= S.ride).reduce((m, p) => Math.max(m, p.t - p.tb), 0);
  const ahead = pin.right.curl.filter((p) => p.t - p.tb > 0.3 && p.s <= pin.right.ride);
  const span = ahead.length ? ahead[ahead.length - 1].s - ahead[0].s : 0;
  const ts = takeoffStart(pin.right), pay = wavePayload(pin.right, 'right', 'full', ts.a, ts.b, swell);
  console.log(`section ahead: plain right ride ${plain.right.ride.toFixed(0)} m (lead ${lead(plain.right).toFixed(1)} s); with a pinnacle ${pin.right.ride.toFixed(0)} m, a stretch at ${ahead.length ? ahead[0].s.toFixed(0) : '-'} m breaking up to ${lead(pin.right).toFixed(1)} s ahead (${span.toFixed(0)} m); payload points with e: ${pay.profile.filter((p) => p.e).map((p) => `${p.s}:${p.e}`).join(' ')}`);
  check(lead(plain.right) < 0.3 && lead(plain.left) < 0.3, 'section ahead: plain Dynamic has none');
  check(ahead.length && span <= 40 && lead(pin.right) > 1, 'section ahead: a pinnacle by the arm makes one (breaking > 1 s before the curl, up to 40 m long)');
  check(pin.right.ride > ahead[ahead.length - 1].s + 60, 'section ahead: the ride carries on beyond it');
  check(pay.profile.some((p) => p.e > 1), 'section ahead: the payload carries its lead (e)');
}
// A true ledge (the user, 2026-11-24, after Teahupoo): Ledge blocks on their own (deep water, then a near-vertical wall) give the
// ledge shape (u toward 4, loop.js shapeIndex, from rays.js `step`: the steepest seabed within 30 m seaward); Dynamic's arms don't.
{
  const { reefComponents: rc, dynamicPreset: dp, newBlock } = await import('../src/builder/blocks.js');
  const { wavePayload, takeoffStart } = await import('../src/builder/loop.js');
  const go = (bl, sw) => { const g = buildDepth(rc(bl), makeGrid()); return analyse(traceRays(g, sw), g, { pe: runPE(g, sw) }); };
  const lifted = (A) => Math.max(...['right', 'left'].filter((sd) => A[sd] && takeoffStart(A[sd])).map((sd) => { const t = takeoffStart(A[sd]); return Math.max(...wavePayload(A[sd], sd, 'full', t.a, t.b, swell).profile.map((p) => p.u)); }));
  const led = go([Object.assign(newBlock('ledge', 860, 520), { side: -1 }), Object.assign(newBlock('ledge', 860, 520), { side: 1 })], { H: 2, T: 15, dir: 0 });
  const dyn = go(dp(), swell);
  const uL = lifted(led), uD = lifted(dyn);
  console.log(`ledge: Ledge blocks reach shape ${uL.toFixed(2)} (4 = the ledge), Dynamic ${uD.toFixed(2)}`);
  check(uL > 3.5, 'ledge: Ledge blocks on their own give the ledge shape');
  check(uD <= 3, 'ledge: Dynamic\'s arms don\'t');
}
check(tBuild + tRays + tAn < 400, `rebuild + trace under 400 ms in node (${(tBuild + tRays + tAn).toFixed(0)})`);
console.log(fails ? 'SOME FAILED' : 'all ok');
process.exitCode = fails ? 1 : 0;
