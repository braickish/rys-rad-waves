// Procedural peeling wave.
//
// Coordinates (the "peel frame", which moves with the breaking point):
//   x: along the beach. The wave peels toward +x, so the surfer rides toward +x.
//   y: up.
//   z: toward shore. The wave travels toward +z; the face looks toward +z.
//
// In this frame the wave shape never changes: it only depends on xs, the
// distance from the peel point (xs > 0 is the unbroken shoulder ahead, xs < 0
// is the barrel and then whitewater behind). Each xs has a 2D cross-section,
// a curve through 16 control points ordered from far out to sea, over the
// crest, around the lip, down the face, and out toward shore. When the wave
// barrels, the same curve wraps around: crest -> lip top -> lip tip -> lip
// underside (the tube's roof) -> face -> trough. That one curve can represent
// an overhang, which a heightfield can't.

export const NP = 16;

// Control point indices.
export const I = {
  BACK_FAR: 0, BACK_MID: 1, BACK_NEAR: 2, CREST_BACK: 3, CREST: 4,
  LIP_OUT1: 5, LIP_OUT2: 6, LIP_OUT3: 7, TIP: 8, LIP_IN1: 9, LIP_IN2: 10,
  ROOF: 11, FACE_UP: 12, FACE_LOW: 13, TROUGH: 14, FRONT_FAR: 15,
};

export const FAR = 1500; // flat ocean extent, added by the mesh builder

// The active wave: its shape, foam, pocket and settings live in a wave
// definition (src/waves/). The keyframes are [z, y] pairs, before scale;
// `s` is the wave's phase: negative = unbroken (more negative = smaller),
// 0 = starting to break, higher = further gone into whitewater.
import { waveById } from './waves/index.js';
import { env as builtEnv } from './waves/built.js';

export let WAVE = waveById('point');
export let WAVE_TYPE = WAVE.kind; // 'crumble' | 'barrel'
export let SCALE = WAVE.scale;
export let PEEL_SPEED = WAVE.peelSpeed;
export let WAVE_SPEED = WAVE.waveSpeed;
let KF = WAVE.keyframes;

// Switch the active wave (by id or definition). The rider's settings follow
// via useWave() in rider.js; the renderer rebuilds its meshes.
export function setWave(w) {
  WAVE = typeof w === 'string' ? waveById(w) : w;
  WAVE_TYPE = WAVE.kind; KF = WAVE.keyframes;
  SHAPES = WAVE.shapes || [WAVE.keyframes];
  if (WAVE.tubeScale && WAVE.shapes) SHAPES = withHalfTubes(WAVE.shapes); // (a built wave: half-barrels between its last two sets)
  SHAPE.a = SHAPE.b = 0; SHAPE.w = 0; SHAPE.ver++;
  setWaveSize(1);
  SECTIONS.length = 0;
  startRide();
}

// Shape sets (a wave with a `bar`, Trestles: one keyframe set per section of the ride, all with the same phase
// stops). The wave's cross-section is set `a` blended toward set `b` by `w`, point by point; `ver` changes
// whenever the blend does (for anything that caches the shape). Waves without `shapes` have one set.
export let SHAPES = [KF];
// Half-barrels (a built wave between its section shape and its tube; the user, 2026-11-23: blended point by point the two made a
// slab, the tube's outer curtain with the section's open face behind it, and too small a cavity to fit in). In between,
// HALF_STEPS - 1 sets, each a smaller round tube: while the lip is thrown (phase -0.25 to 1.65) the tube's own lip, shrunk
// toward the crest by how much tube it is (w); the rest blended as before (the shapes line up there). The wave's shape
// scale (shapeU, 0 .. last) is unchanged; shapeSet maps it to a set: the last step is split HALF_STEPS ways.
// SET_TUBE: how much tube each set is (foam and glow follow it, built.js).
export const HALF_STEPS = 4;
export let SET_TUBE = [0];
const halfCache = new WeakMap();
function withHalfTubes(base) {
  if (halfCache.has(base)) { SET_TUBE = halfCache.get(base).tube; return halfCache.get(base).sets; }
  // (between the section shape, set 2, and the barrel, set 3; anything after the barrel follows, blended with the
  // barrel point by point: both are tubes)
  const n = base.length, A = base[2], T = base[3], a = new Float64Array(NP * 2), t = new Float64Array(NP * 2);
  const stops = [...new Set([...A.map((k) => k.s), ...T.map((k) => k.s)])].sort((x, y) => x - y);
  const sst = (e0, e1, x) => { const u = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return u * u * (3 - 2 * u); };
  const halves = [];
  for (let k = 1; k < HALF_STEPS; k++) {
    const w = k / HALF_STEPS;
    halves.push(stops.map((s) => {
      kfPoints(A, s, a, 1, true); kfPoints(T, s, t, 1, true); // (raw: the rules (run-out, floor) go on when they're drawn, once)
      const throwK = sst(-0.25, 0.25, s) * (1 - sst(1.475, 1.65, s));
      const p = [];
      for (let i = 0; i < NP; i++) p.push([a[i * 2] + (t[i * 2] - a[i * 2]) * w, a[i * 2 + 1] + (t[i * 2 + 1] - a[i * 2 + 1]) * w]);
      const C = p[4];
      for (let i = 5; i <= 11; i++) for (let c = 0; c < 2; c++) {
        const small = C[c] + (t[i * 2 + c] - t[4 * 2 + c]) * w;
        p[i][c] += (small - p[i][c]) * throwK;
      }
      return { s, p };
    }));
    halves[halves.length - 1].boreFrom = T.boreFrom ?? A.boreFrom;
  }
  const sets = [...base.slice(0, 3), ...halves, T, ...base.slice(4)], tube = sets.map((_, i) => (i <= 2 ? 0 : Math.min(1, (i - 2) / HALF_STEPS)));
  halfCache.set(base, { sets, tube }); SET_TUBE = tube;
  return sets;
}
// The set (fractional) for a place u on the wave's shape scale.
export function shapeSet(u) {
  if (!(WAVE.tubeScale && WAVE.shapes) || SHAPES.length === WAVE.shapes.length) return u;
  if (u <= 2) return u;
  if (u <= 3) return 2 + (u - 2) * HALF_STEPS; // (the half-barrels)
  return 2 + HALF_STEPS + (u - 3); // (past the barrel: a shape after it, if a wave has one)
}
export const SHAPE = { a: 0, b: 0, w: 0, ver: 0 };
// Run fn with the wave's shape forced to set i (to build per-set tables: the GPU water table, the rider's lines).
export function withShape(i, fn) {
  const { a, b, w } = SHAPE;
  SHAPE.a = SHAPE.b = i; SHAPE.w = 0;
  try { return fn(); } finally { SHAPE.a = a; SHAPE.b = b; SHAPE.w = w; }
}
function setShape(a, b, w) {
  if (a === SHAPE.a && b === SHAPE.b && Math.abs(w - SHAPE.w) < 1e-4) return;
  SHAPE.a = a; SHAPE.b = b; SHAPE.w = w; SHAPE.ver++;
}

// The ride along the bar (waves with a `bar`, Trestles). The bar is a break map from FUNWAVE (src/waves/trestles-breaks.js):
// for every spot along the wave (m from the peak, + along the right we ride), when it breaks (s after the peak). A
// spot's phase is simply the time since it broke there (`phaseTime` s per unit; before it breaks, minus the time until
// it does), so the whole wave is the simulated one: the peak, the left peeling away, the right peeling through its
// sections, the inside peak breaking ahead and peeling back to meet you. The curl (the frame the game rides in) is the
// edge of broken water running down the right from the peak (RIDE.front); it stops (RIDE.closed) where it runs into
// water that broke before it got there, which is the inside closing out on you. Each ride takes the next wave of the
// map list (each set wave is a different simulated wave). The maps are the sim's own times (FUNWAVE's breaking flag,
// cross-checked with SWASH), with no slowdown or speed cap (the user, 2026-11-20): trestles_breaks.py.
export const RIDE = { time: 0, c: 0, front: 0, closed: null, closing: false, closeAt: Infinity, sectionT: -Infinity, map: null, k: -1 };
// Is a section going (the curl running through a stretch that breaks at once, faster than `bar.sectionSpeed`), or did one
// go within `bar.sectionGrace` s? The whitewater there is forgiving (rider.js; the user, 2026-11-20: easier to ride
// through, snap over). 0 = no.
// With `xs` (m ahead of the curl): also when the water there is breaking ahead of the curl, on its own (a section
// going before the curl gets there).
// (the settings: Trestles' `bar`, or a wave's own `section` (built waves, 2026-11-23: a section breaking ahead that the curl
// runs through left you in the whitewater behind it); { sectionSpeed, sectionGrace, sectionFoam })
export const sectionRules = () => WAVE.bar || WAVE.section || null;
export function sectionGrace(xs) {
  const g = sectionRules()?.sectionGrace; if (!g) return false;
  if (RIDE.time - RIDE.sectionT < g) return true;
  return !!WAVE.bar && xs !== undefined && RIDE.c + xs > RIDE.front + 2 && RIDE.time > breaksAt(RIDE.c + xs) - 0.5;
}
// n: the wave's number in the sea (sea.js goToWave): a wave with a bar rides map n + 1 of its list (wave 0 the 2nd map, as it
// always was: switching to the wave took the 1st and the first ride the 2nd; the tests are tuned on that order), so wave n
// is the same wave however many came before it. Without n (switching waves) it moves on to the next map.
export function startRide(n) {
  layRidges(); // (a wave with ridges lays out this wave's sections)
  RIDE.time = 0; RIDE.c = 0; RIDE.front = 0; RIDE.closed = null; RIDE.closing = false; RIDE.sectionT = -Infinity; RIDE.done = null;
  if (!WAVE.bar) return;
  RIDE.time = -(WAVE.bar.lead || 0); // (you drop in as the peak stands up, `lead` s before it breaks)
  // (which simulated waves: `bar.use` (the user kept 545, 2026-11-19: 1139 closed out too quickly), or ?map=<wave>)
  const want = typeof location !== 'undefined' ? Number(new URLSearchParams(location.search).get('map')) : Number(globalThis.process && process.env.MAP);
  const all = WAVE.bar.maps, maps = all.filter((m) => (want ? m.wave === want : !WAVE.bar.use || WAVE.bar.use.includes(m.wave)));
  RIDE.k = (n === undefined ? RIDE.k + 1 : n + 1) % maps.length;
  const m = maps[RIDE.k];
  RIDE.map = { d0: m.d0, step: m.step, tb: m.tb, up: m.up, wave: m.wave, swell: m.swell, end: m.end };
  RIDE.closeAt = closeoutAt();
  applyBar();
}
// Where the ride ends: the first spot down the right where the curl runs into water that broke before it got there AND
// that broken stretch is the inside (longer than `bar.sectionMax` m, or no unbroken wave beyond it). A shorter stretch
// that breaks ahead and peels back is a section (both FUNWAVE and SWASH have them, 2026-11-20): the curl runs through it
// at once and the wave carries on beyond it.
function closeoutAt() {
  const m = RIDE.map, smax = WAVE.bar.sectionMax ?? 40, end = m.d0 + (m.tb.length - 1) * m.step;
  for (let d = 0; d < end; d += m.step) {
    const t0 = breaksAt(d);
    if (!(breaksAt(d + m.step) < t0 - 0.02)) continue;
    let e = d + m.step; while (e < end && breaksAt(e) < t0) e += m.step;
    if (e - d > smax || e >= end) return d;
  }
  return Infinity;
}
// When the spot `d` m from the peak breaks (s after the peak). Past either end of the map it keeps breaking later
// outward at `edgePeel` m/s.
export function breaksAt(d) {
  const m = RIDE.map; if (!m) return 0;
  const n = m.tb.length, u = (d - m.d0) / m.step;
  if (u <= 0) return m.tb[0] - u * m.step / WAVE.bar.edgePeel;
  if (u >= n - 1) return m.tb[n - 1] + (u - n + 1) * m.step / WAVE.bar.edgePeel;
  const i = Math.floor(u), f = u - i;
  return m.tb[i] + (m.tb[i + 1] - m.tb[i]) * f;
}
// The section's shape where the curl is: a position along the bar's shape list by `shapeRows` (1.5 = half way from the
// 2nd set to the 3rd); a set wave swaps in `setShapes` (the bigger set wave's own inside).
function applyBar() {
  const rows = WAVE.bar.shapeRows, c = RIDE.c;
  let k = 0; while (k < rows.length - 2 && c > rows[k + 1].x) k++;
  const A = rows[k], B = rows[k + 1], f0 = Math.min(1, Math.max(0, (c - A.x) / (B.x - A.x)));
  const shape = A.shape + (B.shape - A.shape) * f0;
  const sets = SIZE > (WAVE.bar.setSize || 9) && WAVE.bar.setShapes ? WAVE.bar.setShapes : WAVE.bar.shapes;
  const i = Math.min(sets.length - 2, Math.floor(shape)), f = shape - i;
  if (sets.length === 1) setShape(sets[0], sets[0], 0);
  else if (f <= 1e-4) setShape(sets[i], sets[i], 0);
  else setShape(sets[i], sets[i + 1], Math.min(1, f));
}
// Reef ridges (a wave with `ridges`, Raglan+; the user, 2026-11-22): random faster sections. Where the reef has a ridge
// (the seabed running more across the waves, steeper), the wave there stands up steeper and peels faster: "a ridge causes
// a local increase in seabed gradient and leads to a wave section with a steeper face and lower peel angles" (Mead &
// Black 2001, on Raglan's reefs, via Scarfe et al. 2002). One strength per spot along the beach drives both: the shape
// blends toward the wave's section shape (SHAPES[1]) by it, and the curl runs faster by it where the curl is. The ridges
// are fixed to the reef, so ahead of you the section stands up before the curl gets there. Each wave lays out its own
// (swell direction and size light up different parts of the reef): `ridges` { first, gap, width, strength } ranges.
// RIDGE.c: how far the curl has run along the beach this ride (m, from where you dropped in).
export const RIDGE = { c: 0, list: [], at: 0 };
let ridgeRnd = mulberry32(1);
export function seedRidges(seed) { ridgeRnd = mulberry32(seed); }
function mulberry32(seed) {
  return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function layRidges() {
  RIDGE.c = 0; RIDGE.list.length = 0; RIDGE.at = 0; PASSED.length = 0; SCHED.tc.length = 0; SCHED.tb.length = 0;
  const R = WAVE.ridges; if (!R || R.profile) return; // (a built wave's profile needs no layout)
  const pick = ([a, b]) => a + (b - a) * ridgeRnd();
  for (let x = pick(R.first); x < 3000; x += pick(R.gap)) RIDGE.list.push({ x, w: pick(R.width), k: pick(R.strength) });
}
// The ridge strength under the spot xs m ahead of the curl (0 = the plain wave, 1 = a full section): each ridge a smooth
// bump `w` m either side of its middle.
// A built wave (src/waves/built.js, from the wave builder; `ridges.profile`): the curl's speed and section strength come
// from the stretch you marked, every 10 m along it, instead of laid-out ridges. Looped (`ridges.loop`), it repeats forever,
// the last `seam` m crossfading into the start so the end runs smoothly back into it (the user, 2026-11-22); a full ride
// runs once and past its end the wave backs off (the curl slows to a stop over 30 m) and the ride ends.
function profileAt(key, X) {
  const R = WAVE.ridges, P = R.profile, L = R.length;
  const lin = (u) => {
    if (u <= 0) return P[0][key] ?? 0;
    for (let i = 1; i < P.length; i++) if (u <= P[i].s) { const f = (u - P[i - 1].s) / Math.max(1e-6, P[i].s - P[i - 1].s); return (P[i - 1][key] ?? 0) + ((P[i][key] ?? 0) - (P[i - 1][key] ?? 0)) * f; }
    return P[P.length - 1][key] ?? 0; // (keys a point leaves out, `e`, are 0)
  };
  if (R.loop) {
    const u = ((X % L) + L) % L, B = R.seam ?? Math.max(20, Math.min(30, 0.15 * L));
    if (u <= L - B) return lin(u);
    const w = smooth((u - (L - B)) / B);
    return lin(u) * (1 - w) + (P[0][key] ?? 0) * w;
  }
  if (X <= L) return lin(Math.max(0, X));
  const fade = Math.max(0, 1 - (X - L) / 30); // (past the end: backing off; the size stays as it was at the end)
  return key === 'peel' ? lin(L) * fade : key === 'H' || key === 'u' ? lin(L) : 0;
}
// The wave's size at xs (plan step 2): a built wave grows and shrinks along its stretch with the breakers the builder found
// there, against the height it's scaled to (WAVE.built.H); 1 everywhere else. No cap. Applied to the whole cross-section, so the
// face keeps its shape and angles and just gets taller or smaller.
// Where on its shape scale the wave is at xs (0 .. SHAPES.length - 1): a built wave by how it breaks there (plan step 3: the
// builder's profile `u`, from the surf-similarity number), Raglan+ by its ridges (plain 0, section 1).
export function shapeU(xs) {
  if (!WAVE.ridges) return 0;
  const P = WAVE.ridges.profile;
  if (P && P[0].u != null) return Math.min((WAVE.shapes || SHAPES).length - 1, Math.max(0, profileAt('u', RIDGE.c + xs)));
  return ridgeAt(xs);
}
// How much of a tube the wave's shape has at xs (0-1; plan step 7): a built wave's barrel sections, where its shape scale
// reaches the tube shape (u 2.3 -> 2.8 of 0-3); waves with `tube` everywhere 1, others 0.
export function tubeAt(xs) {
  if (WAVE.tubeScale) { const u = shapeU(xs); return smooth(Math.min(1, Math.max(0, (u - 2.3) / 0.5))); }
  return WAVE.tube ? 1 : 0;
}
export function sizeAt(xs) {
  if (!WAVE.ridges || !WAVE.ridges.profile || !WAVE.built || !(WAVE.built.H > 0) || WAVE.ridges.profile[0].H == null) return 1;
  return Math.max(0.05, profileAt('H', RIDGE.c + xs) / WAVE.built.H); // (no cap: the user, 2026-11-22)
}
// The size the cross-section at xs is drawn at, at phase s: sizeAt, eased to the ride's own (1) as the whitewater behind the
// curl ages (phase 1.3 -> 3; controlPoints). The GPU's water gets this too (mesh.js slicePhases), so what you see matches.
export function sizeFor(xs, s) {
  const sm = Math.min(1, Math.max(0, (s - 1.3) / 1.7));
  return (1 + (sizeAt(xs) - 1) * (1 - sm * sm * (3 - 2 * sm))) * (WAVE.built ? wallAhead(xs, s) : 1); // (the wall ahead: below)
}
export function ridgeAt(xs) {
  if (!WAVE.ridges) return 0;
  if (WAVE.ridges.profile) return profileAt('k', RIDGE.c + xs);
  const X = RIDGE.c + xs; let k = 0;
  for (const r of RIDGE.list) { const d = (X - r.x) / r.w; if (d > -1 && d < 1) k += r.k * (0.5 + 0.5 * Math.cos(Math.PI * d)); }
  return Math.min(1, k);
}
// When the curl passed each spot (waves with ridges; the user, 2026-11-23: behind the curl it should look like it broke
// when it did). The curl's speed changes along these waves, so the water behind it is placed by the time since it broke
// there, as Trestles' is (barPhase), not by its distance from the curl: through a fast section a long stretch broke at
// nearly the same moment and goes on as one wall. PASSED: [time, curl position] every physics step, oldest first.
const PASSED = [], PASSED_KEEP = 40; // (s of history; older water is long past the last keyframe)
function notePassed() {
  PASSED.push(RIDE.time, RIDGE.c);
  let n = 0; while (n + 2 < PASSED.length && PASSED[n] < RIDE.time - PASSED_KEEP) n += 2;
  if (n > 2000) PASSED.splice(0, n);
}
// The time the curl passed X (m along the beach, at or behind the curl). Before the history starts: as if it had always
// peeled at the wave's own pace.
function passedAt(X, vRef) {
  const P = PASSED, n = P.length / 2;
  if (!n || X >= RIDGE.c) return RIDE.time - Math.max(0, X - RIDGE.c) / vRef;
  if (X <= P[1]) return P[0] - (P[1] - X) / vRef;
  if (X >= P[(n - 1) * 2 + 1]) { // (between the last step and now)
    const t0 = P[(n - 1) * 2], c0 = P[(n - 1) * 2 + 1];
    return RIDGE.c > c0 ? t0 + (RIDE.time - t0) * (X - c0) / (RIDGE.c - c0) : RIDE.time;
  }
  let lo = 0, hi = n - 1; // (positions never go back: the last step at or behind X)
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (P[m * 2 + 1] <= X) lo = m; else hi = m; }
  const ca = P[lo * 2 + 1], cb = P[hi * 2 + 1], ta = P[lo * 2], tb = P[hi * 2];
  return cb > ca ? ta + (tb - ta) * (X - ca) / (cb - ca) : tb;
}
// How far behind the curl the water at xs looks (m): the time since the curl passed it, at the wave's own pace (so a wave
// peeling steadily at that pace looks just as it did by distance). Eased in over the 8 m behind the curl, so the change
// of rate at the curl leaves no crease.
function behindDist(xs) {
  if (xs >= 0 || !WAVE.ridges) return -xs;
  const vRef = WAVE.peelSpeed * Math.sqrt(SIZE);
  // (a built wave: by the curl's schedule from its profile, not where the frame went: the frame follows the edge of the broken
  // water, which jumps across a section, and the time since the schedule plus the spot's lead (earlyPhase) is the time since
  // it broke)
  const tPass = WAVE.ridges.profile ? curlTime(RIDGE.c + xs) : passedAt(RIDGE.c + xs, vRef);
  const d = (RIDE.time - tPass) * vRef, w = smooth(Math.min(1, -xs / 8));
  return -xs + (d + xs) * w;
}

// Sections that break ahead (built waves, open-barrel plan step 2; the user, 2026-11-23): the builder's payload gives, per
// point, how long before the curl gets there a spot breaks on its own (`e`, s of the builder's clock). Each spot's phase is
// moved on by that lead, so a section stands up, throws and peels both ways ahead of the curl (the lead grows toward the
// section's peak on the near side and falls away on the far side: open at both ends). The builder's curl runs along the
// break line at v = sqrt(peel^2 + c^2), the game's along the crest at `peel`, so the game's clock runs v / peel times slower
// there; then into phase at the wave's own rate (behindDist's: `phase.behind` m at its own pace).
// How long before the game's curl gets to X the spot breaks (s of the game's clock). By place, not by seconds: the builder's
// curl runs along the break line at v = sqrt(peel^2 + c^2) and stands still through a section (its time is the running
// latest of the break times), the game's runs along the crest at `peel` and still takes time to cross one, so their clocks
// don't keep a fixed ratio. A spot that broke `e` s before the builder's curl got there broke when the builder's curl was
// where its clock read that much earlier: the game's spot breaks when the game's curl is there.
function earlyLead(X) {
  const R = WAVE.ridges; if (!R || !R.early) return 0;
  const e = profileAt('e', X); if (!(e > 0)) return 0;
  return curlTime(X) - curlTime(builderAt(builderTime(X) - e));
}
function earlyPhase(xs) {
  const L = earlyLead(RIDGE.c + xs); // (s)
  return L > 0 ? L * WAVE.peelSpeed * Math.sqrt(SIZE) / WAVE.phase.behind : 0;
}
// The curl's schedule on a built wave: when, by its profile, the curl reaches X (s after the ride starts; the builder's curl,
// sections crossed at once, in the game's clock). Added up step by step as the ride goes (loops run on for ever). A spot
// breaks at that time less its lead: breaksAtBuilt.
// (tb: the builder's own clock, its curl along the break line at v = sqrt(peel^2 + c^2), for earlyLead)
const SCHED = { tc: [], tb: [], size: 1 }, SCHED_STEP = 0.1; // (every 0.1 m: coarser, the curl's speed came out in steps, jerking at each)
function schedTo(u) {
  if (SCHED.size !== SIZE) { SCHED.tc.length = 0; SCHED.tb.length = 0; SCHED.size = SIZE; }
  const T = SCHED.tc, B = SCHED.tb, k = Math.sqrt(SIZE), h = SCHED_STEP;
  if (!T.length) { T.push(0); B.push(0); }
  const need = Math.min(Math.ceil(u) + 1, 2000000);
  while (T.length <= need) {
    const i = T.length - 1, x = (i + 0.5) * h, p = profileAt('peel', x), c = profileAt('c', x) || 0;
    T.push(T[i] + h / Math.max(0.05, p * k)); B.push(B[i] + h / Math.max(0.05, Math.hypot(p, c)));
  }
}
function curlTime(X) {
  const h = SCHED_STEP;
  if (X <= 0) return X / Math.max(0.5, profileAt('peel', 0) * Math.sqrt(SIZE));
  const u = X / h; schedTo(u); const T = SCHED.tc;
  const i = Math.min(Math.floor(u), T.length - 2), f = u - i;
  return T[i] + (T[i + 1] - T[i]) * f;
}
function builderTime(X) {
  const h = SCHED_STEP; if (X <= 0) return 0;
  const u = X / h; schedTo(u); const B = SCHED.tb;
  const i = Math.min(Math.floor(u), B.length - 2), f = u - i;
  return B[i] + (B[i + 1] - B[i]) * f;
}
// (where the builder's curl was at its time t: the table inverted; it only ever runs forward)
function builderAt(t) {
  const B = SCHED.tb, h = SCHED_STEP; if (t <= 0 || B.length < 2) return 0;
  let lo = 0, hi = B.length - 1; if (t >= B[hi]) return hi * h;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (B[m] <= t) lo = m; else hi = m; }
  return (lo + (t - B[lo]) / Math.max(1e-9, B[hi] - B[lo])) * h;
}
const breaksAtBuilt = (X) => curlTime(X) - earlyLead(X);

// The speed the pocket holds you at when you trim (rider.js energy pocket): the curl's speed, except through a ridge's
// faster section, where it stays the wave's own (the user, 2026-11-22: as a section speeds up you need to pump to keep
// up; trimming holds the plain wall's pace, and the extra comes from working the steeper face).
// Then (the user, 2026-11-22: sections were hard to make): a section's wall stands steeper (the ridge that makes it fast
// makes it steep), and on a steeper face gravity pulls harder along your line and the wave carries you more as you trim, so
// trimming also holds a share of the section's extra speed: up to SECTION_HOLD of it, by how steep the wall is at the curl
// (Raglan+: its ridge strength; a built wave: its shape past Raglan's wall, the steep section or the barrel). Pumping still
// makes the rest.
// (then 0.85, the user, 2026-11-22: more of a boost when the section speeds up; on Raglan+ trimming alone makes ~4 of 7
// sections, pumping all of them; 1.0 let trimming make nearly all, and pumping stopped mattering)
export const SECTION_HOLD = 0.85;
function sectionSteep() {
  if (!WAVE.ridges) return 0;
  const P = WAVE.ridges.profile;
  if (P && P[0].u != null) return Math.min(1, Math.max(0, shapeU(0) - 1)); // (built: 1 = Raglan's wall, 2+ = steep section / barrel)
  return ridgeAt(0);
}
export const holdPeel = () => {
  if (!WAVE.ridges) return PEEL_SPEED;
  const base = WAVE.peelSpeed * Math.sqrt(SIZE);
  return base + SECTION_HOLD * sectionSteep() * Math.max(0, PEEL_SPEED - base);
};
const CURL_MAX = 25; // (m/s at size 1: builder loop.js CURL_MAX, Trestles' frameMax)
// The curl's speed with ridges: the wave's own peel (by size) x up to `ridges.fast` where the curl is on a full ridge.
// The curl advances by its speed, added up (never time x speed: anything varying the peel must integrate).
function stepRidges(dt) {
  if (WAVE.ridges.profile) { // (a built wave: the curl's speed from the stretch you marked)
    // The curl is the edge of the broken water, as on Trestles (open-barrel plan step 3, the user's option 1, 2026-11-23):
    // from where it is, on while the water just ahead has broken (breaksAtBuilt: the schedule less each spot's lead). With no
    // section that's the schedule itself, the profile's speed. A section breaking ahead peels back toward it; once its near
    // side meets the curl, the curl crosses the broken stretch (at up to CURL_MAX, catching up smoothly) and runs on along the
    // section's far side at its own pace: the tube you ride through is measured from it.
    RIDE.time += dt;
    RIDGE.at = ridgeAt(0);
    const t = RIDE.time;
    let f = RIDE.front;
    const h = SCHED_STEP, step = (x) => (Math.floor(x / h + 1e-9) + 1) * h; // (in the schedule's own steps: by whole metres its speed came in steps)
    for (let n = 0; n < 40000 && breaksAtBuilt(step(f)) <= t; n++) f = step(f);
    { const i = step(f) - h, a = breaksAtBuilt(i), b = breaksAtBuilt(i + h); if (b > a && t > a) f = Math.max(f, i + h * Math.min(1, (t - a) / (b - a))); }
    RIDE.front = Math.max(RIDE.front, f);
    PEEL_SPEED = Math.min(CURL_MAX * Math.sqrt(SIZE), Math.max(0, (RIDE.front - RIDGE.c) / dt));
    RIDGE.c += PEEL_SPEED * dt;
    notePassed();
    if (WAVE.section && PEEL_SPEED > WAVE_SPEED / Math.tan(WAVE.section.closeout * Math.PI / 180)) RIDE.sectionT = RIDE.time; // (a section going: forgiving whitewater)
    if (!WAVE.ridges.loop && !RIDE.done && RIDGE.c >= WAVE.ridges.length) RIDE.done = { time: RIDE.time, c: RIDGE.c };
    SHAPE.ver++;
    return;
  }
  const base = WAVE.peelSpeed * Math.sqrt(SIZE);
  RIDGE.at = ridgeAt(0);
  PEEL_SPEED = base * (1 + (WAVE.ridges.fast - 1) * RIDGE.at);
  RIDE.time += dt;
  RIDGE.c += PEEL_SPEED * dt;
  notePassed();
  SHAPE.ver++; // (the shape at the curl changes as the ridges come through: caches keyed on it recompute)
}

export function stepRide(dt) {
  if (WAVE.ridges) return stepRidges(dt);
  if (!WAVE.bar) return;
  RIDE.time += dt;
  // The curl: from where it is, on along the right while the water there has broken (to the exact spot between map
  // points). Running into water that broke well before the curl got there = it met a section that broke ahead: closed.
  if (!RIDE.closed) {
    const m = RIDE.map, t = RIDE.time;
    let f = RIDE.front;
    for (let n = 0; n < 4000 && breaksAt(f + m.step) <= t; n++) {
      // (water just ahead that broke before the curl got here: a section that broke on its own and peeled back to meet it)
      if (f + m.step > RIDE.closeAt && breaksAt(f + m.step) < breaksAt(f) - 0.02 && breaksAt(f + m.step) < t - 0.2) { RIDE.closed = { time: t, c: f }; break; }
      f += m.step;
    }
    if (!RIDE.closed) {
      const a = breaksAt(f), b = breaksAt(f + m.step);
      if (b > a && t > a) f += m.step * Math.min(1, (t - a) / (b - a));
    }
    RIDE.front = Math.max(RIDE.front, f);
    // (maps with `end`, the Peak: past where the right stops breaking the curl slows to a stop (the map fades it out); the
    // wave is done once the curl gets there, and the ride ends `bar.fadeEnd` s later, rider.js checkHazards)
    if (m.end != null && !RIDE.done && RIDE.front >= m.end) RIDE.done = { time: t, c: RIDE.front };
    // (closing: water within 80 m ahead of the curl, past the closeout spot, has already broken: the inside, broken on its own, coming to meet it)
    if (!RIDE.closing) for (let d = 2 * m.step; d <= 80; d += m.step) if (RIDE.front + d > RIDE.closeAt && breaksAt(RIDE.front + d) < t) { RIDE.closing = true; break; }
  }
  // The frame follows the curl (at most `frameMax` m/s, so a stretch that goes at once is caught up
  // with smoothly); it stops when the inside closes out.
  const goal = RIDE.closed ? RIDE.c : RIDE.front;
  const v = Math.min(WAVE.bar.frameMax, Math.max(0, (goal - RIDE.c) / dt));
  RIDE.c += v * dt;
  if (v > (WAVE.bar.sectionSpeed ?? 12)) RIDE.sectionT = RIDE.time;
  PEEL_SPEED = v;
  applyBar();
}
// (the time since the spot `xs` m ahead of the frame broke, in units of phase)
function barPhase(xs) { return (RIDE.time - breaksAt(RIDE.c + xs)) / WAVE.phaseTime; }

// Which way the wave peels in the world (`dir` in the wave definition): 1 toward +x (screen right from the
// beach: a left, for the surfer), -1 toward -x (a right). Everything about riding works along the wave, in the
// peel frame (xs ahead of the curl, t down the face, the camera's shots), whichever way it runs; toWorld places
// a peel-frame point or direction in the world (the sun, the surfer's body and stance stay real-world).
export const waveDir = () => (WAVE.dir < 0 ? -1 : 1);
export const toWorld = (v) => (WAVE.dir < 0 ? [-v[0], v[1], v[2]] : v);

// Size of the wave being ridden, relative to the wave's normal size (sets
// bring bigger and smaller waves). Bigger waves peel a little faster.
export let SIZE = 1;
export function setWaveSize(k) {
  SIZE = k;
  SCALE = WAVE.scale * k;
  PEEL_SPEED = WAVE.peelSpeed * Math.sqrt(k);
  WAVE_SPEED = WAVE.waveSpeed * Math.sqrt(k);
  if (WAVE.bar) { PEEL_SPEED = 0; applyBar(); } // (the bar's map moves the curl; a set wave may have its own shapes)
  if (WAVE.ridges) PEEL_SPEED = WAVE.ridges.profile ? profileAt('peel', RIDGE.c) * Math.sqrt(k) : PEEL_SPEED * (1 + (WAVE.ridges.fast - 1) * ridgeAt(0));
}

// Sections: places along the wave that break differently for a while (a
// section ahead that closes out, or throws early). In the peel frame they
// are fixed to the reef/sandbar, so they move back toward the curl at the
// peel speed. Each: { x (peel frame), age, grow (s to fully break), width, target (phase) }.
export const SECTIONS = [];
export function stepSections(dt) {
  for (const sec of SECTIONS) { sec.x -= PEEL_SPEED * dt; sec.age += dt; }
  for (let i = SECTIONS.length - 1; i >= 0; i--) if (SECTIONS[i].x < -30) SECTIONS.splice(i, 1);
}
export const setWaveType = setWave; // old name

// Phase from distance to the peel point.
export function phaseAt(xs) {
  // (the rate changes smoothly through the curl: a sharp change there shows
  // as a crease in the wave)
  const k = smooth(Math.min(1, Math.max(0, (xs + 4) / 8)));
  let s;
  if (WAVE.bar) {
    s = barPhase(xs); // (a wave with a bar: the time since it broke there, from the simulation's break map)
  } else s = behindDist(xs) / (WAVE.phase.behind + (WAVE.phase.ahead - WAVE.phase.behind) * k) + earlyPhase(xs);
  // Optionally the broken wave behind lasts longer: past phase `farFrom` it
  // changes `behindFar` m per phase instead of `behind`, eased in smoothly
  // over ±0.3 so there's no crease.
  const far = WAVE.phase.behindFar;
  if (far && s > WAVE.phase.farFrom - 0.3) {
    const e = s - WAVE.phase.farFrom, w = 0.3, g = e >= w ? e : ((e + w) * (e + w)) / (4 * w);
    s -= (1 - WAVE.phase.behind / far) * g;
  }
  for (const sec of SECTIONS) {
    const d = (xs - sec.x) / sec.width;
    const profile = sec.kind === 'throw' ? Math.exp(-d * d) : Math.exp(-(d * d) * d * d); // a peak that throws / a flat-topped closeout
    const ramp = smooth(Math.min(1, Math.max(0, sec.age / sec.grow)));
    const k = profile * ramp;
    if (k > 1e-3 && sec.target > s) s += (sec.target - s) * k;
  }
  return s;
}

const smooth = (f) => f * f * (3 - 2 * f);

// The wall ahead of the curl on a built break (the user, 2026-11-26, from inside a barrel: the wall ahead fell away, half as
// tall 30 m down the line). Ahead of the curl the wave is drawn as earlier stages of its break, and those start from a small
// generic swell; on a reef the wall ahead is the same swell still coming in along it. So the unbroken wave ahead never stands
// lower than the incoming swell: the builder's swell against its breaker (swell.H / H, at most 0.95) of the shape's height at
// the curl. Where a stage is lower it's scaled up as a whole to meet it, a bigger swell of the same shape (a soft max, no corner),
// as part of the slice's size (sizeFor): the same for the wave drawn (the GPU's tables) and the wave ridden. Eased in over the first
// 8 m ahead and out between 40 and 100 m, so the sea doesn't become a wall to the horizon. Built breaks only (they have a swell).
const _crest0 = new WeakMap(), _w0 = new Float64Array(NP * 2);
function crestAtCurl(KF) { let c = _crest0.get(KF); if (c == null) { kfPoints(KF, 0, _w0, 1, true); c = _w0[I.CREST * 2 + 1] - _w0[I.TROUGH * 2 + 1]; _crest0.set(KF, c); } return c; }
const _ws = new Float64Array(NP * 2);
function stageHeight(KF, s) { kfPoints(KF, s, _ws, 1, true); return _ws[I.CREST * 2 + 1] - _ws[I.TROUGH * 2 + 1]; }
function wallAhead(xs, s) {
  const B = WAVE.built, sw = B?.swell?.H;
  if (!(xs > 0) || !(s < 0) || !(sw > 0) || !(B.H > 0) || !WAVE.shapes) return 1;
  const ratio = Math.min(0.95, sw / (B.H / (B.scaleApplied || 1)));
  const near = smooth(Math.min(1, xs / 8)), far = 1 - smooth(Math.min(1, Math.max(0, (xs - 40) / 60)));
  const u = shapeSet(shapeU(xs)), i = Math.min(SHAPES.length - 2, Math.floor(u)), w = u - i;
  const at = (q) => (w > 1e-4 ? q(SHAPES[i]) * (1 - w) + q(SHAPES[i + 1]) * w : q(SHAPES[i]));
  const c0 = at(crestAtCurl), h = at((K) => stageHeight(K, s)), want = ratio * c0 * near * far;
  if (!(h > 1e-3) || !(want > 0)) return 1;
  // (a soft max that leaves the stage alone until it's within `soft` of the floor, and adds at most soft / 4 there: C1, no
  // corner; a smoother one lifted every stage a little, out to where the floor ends, and left a step there)
  const soft = 0.05 * c0, g = want - h, hh = g <= -soft ? h : g >= soft ? want : h + (g + soft) * (g + soft) / (4 * soft);
  return hh / h;
}
// Control points for a phase, as a Float64Array [z0, y0, z1, y1, ...], scaled.
const _cpB = new Float64Array(NP * 2);
export function controlPoints(s, out = new Float64Array(NP * 2), scale = SCALE, xs) {
  // (a wave with `ridges`, Raglan+: the plain shape blended toward the section shape by the reef ridge under xs)
  if (WAVE.ridges && xs !== undefined && SHAPE.a === SHAPE.b) {
    // (the place on the wave's shape scale: Raglan+ 0-1 plain -> section by the ridge; a built wave 0-2 by how it breaks)
    const u = shapeSet(shapeU(xs)), i = Math.min(SHAPES.length - 2, Math.floor(u)), w = u - i;
    kfPoints(SHAPES[i], s, out, scale);
    if (w > 1e-4) { kfPoints(SHAPES[i + 1], s, _cpB, scale); for (let q = 0; q < NP * 2; q++) out[q] += (_cpB[q] - out[q]) * w; }
    // (a built wave's size along its stretch. Behind the curl, as the whitewater ages (phase 1.3 -> 3), it eases to the ride's own
    // size (1): at the curl the wave stands up at its local size, but further back the local size kept reshaping the bore's foam
    // apron over the flats, a bump along the broken part where the wave that broke there was bigger; the user, 2026-11-24)
    const f = sizeFor(xs, s);
    // (everything but the trough's depth: the water in front of the wave is the fixed reference (the user, 2026-11-24): scaled
    // with the rest, a size that halves within 10 m left a step along the base of the wave across the flats)
    if (f !== 1) { const ty = out[I.TROUGH * 2 + 1]; for (let i = 0; i < NP * 2; i++) out[i] *= f; out[I.TROUGH * 2 + 1] = ty; }
    return out;
  }
  if (SHAPES.length === 1) return kfPoints(KF, s, out, scale);
  // (shape sets: set a blended toward set b, point by point)
  kfPoints(SHAPES[SHAPE.a], s, out, scale);
  if (SHAPE.w > 0 && SHAPE.b !== SHAPE.a) {
    kfPoints(SHAPES[SHAPE.b], s, _cpB, scale);
    for (let i = 0; i < NP * 2; i++) out[i] += (_cpB[i] - out[i]) * SHAPE.w;
  }
  return out;
}
function kfPoints(KF, s, out, scale, raw = false) {
  // A smooth curve through the keyframes (cubic Hermite with Catmull-Rom
  // slopes), so the wave has no creases where one keyframe hands over to
  // the next.
  const n = KF.length;
  let k = 0;
  if (s <= KF[0].s) { s = KF[0].s; k = 0; }
  else if (s >= KF[n - 1].s) { s = KF[n - 1].s; k = n - 2; }
  else while (k < n - 2 && s > KF[k + 1].s) k++;
  const a = KF[k], b = KF[k + 1];
  const h = b.s - a.s;
  const f = Math.min(1, Math.max(0, (s - a.s) / h));
  const h00 = 2 * f ** 3 - 3 * f * f + 1, h10 = f ** 3 - 2 * f * f + f, h01 = -2 * f ** 3 + 3 * f * f, h11 = f ** 3 - f * f;
  const pa = KF[Math.max(0, k - 1)], pb = KF[Math.min(n - 1, k + 2)];
  for (let i = 0; i < NP; i++) {
    for (let c = 0; c < 2; c++) {
      const y0 = a.p[i][c], y1 = b.p[i][c];
      // slopes per unit phase, scaled to this interval (zero at the ends)
      const m0 = k > 0 ? ((b.p[i][c] - pa.p[i][c]) / (b.s - pa.s)) * h : 0;
      const m1 = k + 2 < n ? ((pb.p[i][c] - a.p[i][c]) / (pb.s - a.s)) * h : 0;
      out[i * 2 + c] = (h00 * y0 + h10 * m0 + h01 * y1 + h11 * m1) * scale;
    }
  }
  return raw ? out : onFloor(runOut(out, KF, scale, s));
}
// The run out from the face to the flats (the user, 2026-11-26, after a photo of Teahupoo: real waves don't go flat as quickly
// as ours, the face sweeps out past where the lip lands and eases down). A rule on the swell, for every wave that has a period:
// the water in front of a breaking wave is the trough before the next one, so how far the face takes to reach the flats goes
// with the wavelength where it breaks: L = T sqrt(g h), with h the depth it breaks in (~ its height / 0.78). The trough (point
// 14, where the curve is level) goes at least RUNOUT_K L in front of the face's foot (13); the curve between is a concave ramp,
// whose shape comes from the face: a steep, plunging face enters it steep and bowls out, a gentle one eases straight down.
// Long-period groundswell gets long, smooth ramps; short wind swell short ones. RUNOUT_K: the built barrel the user approved
// the same day (2 m breakers, 16 s: ~7 m from the foot to the trough). The lip lands on the ramp, not through it. Waves whose
// shapes come from a simulation (Pipe, Trestles, Dynamic) have no `period` here: their troughs are the sim's.
const RUNOUT_K = 0.07, BREAK_DEPTH = 0.78, LAND = 0.03;
// The blend (the user, 2026-11-26, chosen over the period alone after comparing both): the period sets how long the run-out is,
// how steeply the face comes down into its foot sets how much of it is ramp (and scoop). A gentle, spilling face covers the
// distance itself and keeps its own foot; a steep, plunging one drops to its foot and the rest is ramp. None at 25 degrees or
// less, all of it at 55 or more (overhanging and curled walls too), eased between.
const STEEP = [Math.sin(25 / 57.2958), Math.sin(55 / 57.2958)];
// (how steeply the lower face comes down into its foot: the drawn curve's direction at three fixed places on it (points 12.4,
// 12.7, 13), averaged; for each, how vertical it runs going down (the sine of its angle), 1 once it overhangs or curls under,
// 0 where it rises (whitewater, not a face). Continuous: an angle between two points flipped as they passed each other)
const _s0 = [0, 0], _s1 = [0, 0];
function steepness(p) {
  let v = 0;
  for (const t of [12.4, 12.7, 13.0]) {
    crPoint(p, t - 0.03, _s0); crPoint(p, t + 0.03, _s1);
    const dz = _s1[0] - _s0[0], dy = _s1[1] - _s0[1], len = Math.hypot(dz, dy);
    v += len < 1e-9 ? 0 : dz <= 0 ? 1 : dy < 0 ? -dy / len : 0;
  }
  const x = Math.min(1, Math.max(0, (v / 3 - STEEP[0]) / (STEEP[1] - STEEP[0])));
  return x * x * (3 - 2 * x);
}
// (a shape's steepness: how it breaks, spilling to plunging, so one number for the shape, the steepest its lower face comes down
// while it stands (its keyframes up to where the whitewater takes over). Read at each moment instead, it dropped within a few
// frames as a barrel collapsed, and the ramp's trough jumped back metres)
const _steep = new WeakMap(), _kp = new Float64Array(NP * 2);
function shapeSteepness(KF) {
  let v = _steep.get(KF);
  if (v == null) {
    v = 0;
    for (const k of KF) {
      if (KF.boreFrom != null && k.s > KF.boreFrom) continue;
      for (let i = 0; i < NP; i++) { _kp[i * 2] = k.p[i][0]; _kp[i * 2 + 1] = k.p[i][1]; }
      v = Math.max(v, steepness(_kp));
    }
    _steep.set(KF, v);
  }
  return v;
}
const _crest = new WeakMap(), _ro = [0, 0];
function crestOf(KF) { let c = _crest.get(KF); if (c == null) { c = Math.max(...KF.map((k) => k.p[I.CREST][1])); _crest.set(KF, c); } return c; }
// (the curve's height where it crosses z on the way out from the face's foot (13) to the trough, or null)
function rampAt(p, z) {
  let pz = p[I.FACE_LOW * 2];
  for (let t = I.FACE_LOW + 0.01; t <= I.TROUGH + 1e-9; t += 0.01) {
    crPoint(p, t, _ro);
    if ((pz - z) * (_ro[0] - z) <= 0) return _ro[1];
    pz = _ro[0];
  }
  return null;
}
// The bend where the face meets the ramp (the user, 2026-11-26: no elbows): no tighter than SCOOP_K x the face's height (from
// its middle, point 12, down to the trough: about half the wave's), so a
// face sweeps round into its run-out in a scoop that grows with the wave. Where it would be tighter, the face's foot (13) slides
// out along the curve a step at a time: the turn spreads over a longer stretch, the shape otherwise kept.
const SCOOP_K = 3, SLIDE_K = 0.3, _sc = [0, 0];
// (the bend at the foot, as a radius in m: the drawn curve's bend at a few fixed places around the foot (just above it, at it,
// and out along the start of the ramp: points 12.8 - 13.4), combined as a soft minimum (the 4-norm of their curvatures). Fixed
// places along the curve, so it changes as smoothly as the curve does: the tightest spot anywhere jumped about where a
// collapsing face is nearly flat; the control points' own angle missed bends the curve packs in right at the foot)
const _b0 = [0, 0], _b1 = [0, 0], _b2 = [0, 0];
function footBend(p) {
  let sum = 0;
  for (const t of [12.8, 13.0, 13.2, 13.4]) {
    crPoint(p, t - 0.04, _b0); crPoint(p, t, _b1); crPoint(p, t + 0.04, _b2);
    const ab = Math.hypot(_b1[0] - _b0[0], _b1[1] - _b0[1]), bc = Math.hypot(_b2[0] - _b1[0], _b2[1] - _b1[1]), ca = Math.hypot(_b0[0] - _b2[0], _b0[1] - _b2[1]);
    const cross = Math.abs((_b1[0] - _b0[0]) * (_b2[1] - _b0[1]) - (_b1[1] - _b0[1]) * (_b2[0] - _b0[0]));
    const k = ab * bc * ca > 1e-12 ? (2 * cross) / (ab * bc * ca) : 0;
    sum += k ** 4;
  }
  const k = sum ** 0.25;
  return k > 1e-6 ? 1 / k : Infinity;
}
function runOut(p, KF, scale, s) {
  const T = WAVE.period;
  if (!T) return p;
  const hb = crestOf(KF) * scale / BREAK_DEPTH, R = RUNOUT_K * T * Math.sqrt(9.81 * Math.max(0.1, hb));
  const steep = shapeSteepness(KF);
  const want = p[I.FACE_LOW * 2] + steep * R;
  // (the trough goes out to `want` where it's short of it, handed over softly (a smooth max, ~1/8 of the run-out wide): a hard
  // max put a corner in its pace where the ramp first took over)
  const tz = p[I.TROUGH * 2], soft = Math.max(1e-3, 0.125 * R), out = Math.max(tz, want) + soft * Math.log1p(Math.exp(-Math.abs(tz - want) / soft));
  if (out > tz + 1e-6) {
    p[I.TROUGH * 2] = out;
    if (p[I.FRONT_FAR * 2] < out + R) p[I.FRONT_FAR * 2] = out + R; // (the far flats stay well out in front of it)
  }
  // (how far it slides follows smoothly from how much too tight the bend is: a search for the least slide that does it made the
  // foot twitch where the tightest spot moved along the curve)
  const minR = SCOOP_K * Math.max(0, p[I.FACE_UP * 2 + 1] - p[I.TROUGH * 2 + 1]), r0 = footBend(p); // (the face it's on: as a face collapses into whitewater, the scoop it needs goes with it)
  if (r0 < minR) {
    // (eased off over the 0.4 of the break before the whitewater takes over (shapes.js withBore's `from`): a collapsing face
    // lets go of its scoop within a few frames otherwise, and the foot snapped back)
    const bf = KF.boreFrom, e = bf == null ? 1 : Math.min(1, Math.max(0, (bf - s) / 0.4)), ease = e * e * (3 - 2 * e);
    // (open faces only: where the lip is thrown out over the foot (a barrel), the back wall is the barrel's own shape, and
    // sliding its foot out laid it down into a ramp under the lip and closed the opening. Eased off as the lip passes the foot)
    const ahead = (p[I.FACE_LOW * 2] - p[I.TIP * 2]) / Math.max(1e-3, 0.5 * (p[I.CREST * 2 + 1] - p[I.TROUGH * 2 + 1])), o = Math.min(1, Math.max(0, ahead)), open = o * o * (3 - 2 * o); // (full once the lip is half a wave height behind the foot; over that, as the lip throws fast)
    // (soft at both ends, so the foot never changes pace with a jerk: it starts sliding from rest as the bend first gets too
    // tight, x^2 / (x + 0.3), and eases into its limit, 0.8 tanh)
    const x = Math.log(minR / Math.max(1e-3, r0)), raw = SLIDE_K * x * x / (x + 0.3);
    const u = steep * open * ease * 0.8 * Math.tanh(raw / 0.8);
    crPoint(p, I.FACE_LOW + u, _sc); p[I.FACE_LOW * 2] = _sc[0]; p[I.FACE_LOW * 2 + 1] = _sc[1];
  }
  // the lip lands on the ramp: wherever its tip (or the water just inside it) would come down under the face, it lands on it
  // (only out in front of the foot, on the ramp itself, eased in over a wave height in front of it: behind the foot the lip lands on the
  // face as the shape draws it. Searching the face for it flipped between crossings, and handing over at the foot jumped)
  for (const j of [I.TIP, I.LIP_IN1]) {
    const e = Math.min(1, Math.max(0, (p[j * 2] - p[I.FACE_LOW * 2]) / Math.max(1e-3, p[I.CREST * 2 + 1] - p[I.TROUGH * 2 + 1]))); // (over a wave height: the lip throws fast)
    if (!(e > 0)) continue;
    const y = rampAt(p, p[j * 2]);
    // (softly: lifted by a smooth max of 0 and how far under it is, so the lift doesn't start with a corner)
    if (y != null) { const g = y + LAND * scale - p[j * 2 + 1], soft = 0.05 * scale, lift = soft * Math.log1p(Math.exp(g / soft)); if (lift > 1e-6) p[j * 2 + 1] += lift * e * e * (3 - 2 * e); }
  }
  return p;
}
// The flats are a fixed floor at sea level (0), on every wave and every shape (the user, 2026-11-25): no drawdown in front of
// the face. A shape whose lowest water out toward the flats isn't on 0 is moved as a whole instead: the wave (points 2-14, back
// of the crest to the trough) moves straight up (or down), unchanged, until the lowest water in front of it (and behind) sits on 0; only the
// long run out to the far flats (points 0, 1, 15, at 0) bends to meet it. Where one shape dipped and the next didn't, the
// flats stepped along the wave: a ridge out on the flats behind the curl. (Not a clamp, and not a lift by height: both bent
// the foot of the face, a hard edge where the flats meet the barrel; the user, same day.)
const _fo = [0, 0];
// (the lowest water in front, from the face's foot to the trough, and behind, from the far flats to the back of the crest)
function lowIn(p, t0, t1) { let lo = Infinity; for (let k = 0, n = Math.round((t1 - t0) / 0.05); k <= n; k++) lo = Math.min(lo, crPoint(p, t0 + (t1 - t0) * k / n, _fo)[1]); return lo; }
function onFloor(p) {
  // (the trough sets the level: on 0, up or down. The wave behind can't go under 0 either, so if it would, it's lifted by that.
  // Raising the wave bends the runs out to the far flats, which can move the lowest point: a few passes settle it)
  for (let pass = 0; pass < 4; pass++) {
    const front = lowIn(p, I.FACE_LOW, I.TROUGH);
    let d = -front;
    if (Math.abs(d) <= 1e-4) d = 0;
    if (d) for (let i = 2; i <= I.TROUGH; i++) p[i * 2 + 1] += d;
    const back = lowIn(p, 1, I.CREST_BACK);
    if (back < -1e-4) for (let i = 2; i <= I.TROUGH; i++) p[i * 2 + 1] -= back;
    if (!d && !(back < -1e-4)) break;
  }
  return p;
}

// Centripetal Catmull-Rom between p1 and p2 (avoids loops and cusps when
// control points are unevenly spaced, which ours are).
function knot(az, ay, bz, by) {
  return Math.max(1e-4, Math.sqrt(Math.hypot(bz - az, by - ay)));
}
// d(height)/d(knot parameter) at control point j, as the centripetal Catmull-Rom has it, with the flats' rules (crPoint)
function slopeY(c, j) {
  if (j === 1 || j === I.TROUGH) return 0;
  const n = NP - 1, P = (q, k) => (q < 0 ? 2 * c[k] - c[2 + k] : q > n ? 2 * c[n * 2 + k] - c[(n - 1) * 2 + k] : c[q * 2 + k]);
  const dA = knot(P(j - 1, 0), P(j - 1, 1), P(j, 0), P(j, 1)), dB = knot(P(j, 0), P(j, 1), P(j + 1, 0), P(j + 1, 1));
  const y0 = P(j - 1, 1), y1 = P(j, 1), y2 = P(j + 1, 1);
  let m = (y1 - y0) / dA - (y2 - y0) / (dB + dA) + (y2 - y1) / dB;
  if (j === 2) { const r = (y1 - y0) / dA; m = r * m <= 0 ? 0 : Math.sign(m) * Math.min(Math.abs(m), 3 * Math.abs(r)); }
  // (the face's foot (13): the run out to the trough only goes down, never dips under it and comes back up (Fritsch-Carlson's
  // 3x on its own fall, as at 2 behind). A steep wall into a low foot and a far trough (the run-out) dipped ~0.3 under the flats
  // partway out; the floor rule then lifted the wave by that, and the water rose again toward the trough: a bump out in front,
  // and a barrel floor standing up. The user, 2026-11-26, from inside a barrel: smooth and gradual)
  if (j === I.FACE_LOW) { const r = (y2 - y1) / dB; m = r * m <= 0 ? 0 : Math.sign(m) * Math.min(Math.abs(m), 3 * Math.abs(r)); }
  return m;
}
export function crPoint(c, t, out) {
  const n = NP - 1;
  let i = Math.floor(t);
  if (i < 0) i = 0;
  if (i > n - 1) i = n - 1;
  const f = Math.min(1, Math.max(0, t - i));
  const g = (j, k) => {
    if (j < 0) return 2 * c[k] - c[2 + k];
    if (j > n) return 2 * c[n * 2 + k] - c[(n - 1) * 2 + k];
    return c[j * 2 + k];
  };
  const p0z = g(i - 1, 0), p0y = g(i - 1, 1);
  const p1z = g(i, 0), p1y = g(i, 1);
  const p2z = g(i + 1, 0), p2y = g(i + 1, 1);
  const p3z = g(i + 2, 0), p3y = g(i + 2, 1);
  const t0 = 0;
  const t1 = t0 + knot(p0z, p0y, p1z, p1y);
  const t2 = t1 + knot(p1z, p1y, p2z, p2y);
  const t3 = t2 + knot(p2z, p2y, p3z, p3y);
  const u = t1 + (t2 - t1) * f;
  const l = (pa, pb, ta, tb) => ((tb - u) / (tb - ta)) * pa + ((u - ta) / (tb - ta)) * pb;
  for (let k = 0; k < 2; k++) {
    const P0 = k ? p0y : p0z, P1 = k ? p1y : p1z, P2 = k ? p2y : p2z, P3 = k ? p3y : p3z;
    const A1 = l(P0, P1, t0, t1), A2 = l(P1, P2, t1, t2), A3 = l(P2, P3, t2, t3);
    const B1 = l(A1, A2, t0, t2), B2 = l(A2, A3, t1, t3);
    out[k] = l(B1, B2, t1, t2);
  }
  // The run out to the flats can't swing under them. Centripetal Catmull-Rom aimed the slope at the trough (14) from the face's
  // foot toward the far flats point and sagged up to ~0.7 below the trough past it; behind, where the low back of the wave turns
  // sharply up into the crest (2 -> 3), it sagged ~0.4 under sea level 10-17 m out to sea. Here the same curve as a cubic Hermite
  // (Yuksel et al.: equal to the Barry-Goldman form above) with its height's slopes, per unit of the knot parameter so the curve
  // stays smooth across points: level at the trough and where the far flats behind begin (1), and at the back of the wave (2) no
  // steeper than its rise from the flats allows without dipping (Fritsch-Carlson's 3x). Nothing else moves.
  if (i <= 2 || i >= I.FACE_UP) { // (from the middle of the face (12) on: its foot's slope is limited, and the face above meets it smoothly)
    const f2 = f * f, f3 = f2 * f, h = t2 - t1;
    out[1] = (2 * f3 - 3 * f2 + 1) * p1y + (f3 - 2 * f2 + f) * h * slopeY(c, i) + (-2 * f3 + 3 * f2) * p2y + (f3 - f2) * h * slopeY(c, i + 1);
  }
  return out;
}

const _cp = new Float64Array(NP * 2);
const _o = [0, 0];

// Surface point at (xs, t), t in [0, NP-1] along the cross-section.
export function surface(xs, t, out = [0, 0, 0]) {
  controlPoints(phaseAt(xs), _cp, SCALE, xs);
  crPoint(_cp, t, _o);
  out[0] = xs; out[1] = _o[1]; out[2] = _o[0];
  return out;
}

// Cross-section polyline for a given xs: arrays of z, y, t.
export function slice(xs, perSeg = 10) {
  const cp = controlPoints(phaseAt(xs), undefined, SCALE, xs);
  const count = (NP - 1) * perSeg + 1;
  const z = new Float64Array(count), y = new Float64Array(count), t = new Float64Array(count);
  const o = [0, 0];
  for (let i = 0; i < count; i++) {
    const tt = i / perSeg;
    crPoint(cp, tt, o);
    z[i] = o[0]; y[i] = o[1]; t[i] = tt;
  }
  return { z, y, t, count };
}

// Outward (air-side) 2D normal [nz, ny] for a polyline segment going a -> b.
export function segNormal(az, ay, bz, by) {
  const dz = bz - az, dy = by - ay;
  const l = Math.hypot(dz, dy) || 1;
  return [-dy / l, dz / l];
}

// All places where the vertical line at z crosses the slice.
// Returns [{y, t, ny}] where ny is the outward normal's y component
// (ny > 0: water below this point; ny < 0: water above, i.e. a roof).
export function verticalHits(sl, z) {
  const hits = [];
  for (let i = 0; i < sl.count - 1; i++) {
    const z0 = sl.z[i], z1 = sl.z[i + 1];
    if ((z0 - z) * (z1 - z) > 0 || z0 === z1) continue;
    const f = (z - z0) / (z1 - z0);
    const y = sl.y[i] + (sl.y[i + 1] - sl.y[i]) * f;
    const [, ny] = segNormal(z0, sl.y[i], z1, sl.y[i + 1]);
    hits.push({ y, t: sl.t[i] + (sl.t[i + 1] - sl.t[i]) * f, ny });
  }
  return hits;
}

// First crossing of the 2D segment (az,ay)->(bz,by) with the slice.
export function segmentHit(sl, az, ay, bz, by) {
  let best = null;
  const rz = bz - az, ry = by - ay;
  for (let i = 0; i < sl.count - 1; i++) {
    const cz = sl.z[i], cy = sl.y[i];
    const sz = sl.z[i + 1] - cz, sy = sl.y[i + 1] - cy;
    const den = rz * sy - ry * sz;
    if (Math.abs(den) < 1e-12) continue;
    const qz = cz - az, qy = cy - ay;
    const a = (qz * sy - qy * sz) / den; // along movement
    const b = (qz * ry - qy * rz) / den; // along slice segment
    if (a < 0 || a > 1 || b < 0 || b > 1) continue;
    if (!best || a < best.a) {
      const [nz, ny] = segNormal(cz, cy, sl.z[i + 1], sl.y[i + 1]);
      best = { a, t: sl.t[i] + (sl.t[i + 1] - sl.t[i]) * b, nz, ny };
    }
  }
  return best;
}

// (the built wave's functions need the shape state and tubeAt: handed over here, src/waves/built.js env)
builtEnv.SHAPE = SHAPE; builtEnv.tubeAt = tubeAt; builtEnv.setTube = (a) => SET_TUBE[a] ?? 0;
