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
  SHAPE.a = SHAPE.b = 0; SHAPE.w = 0; SHAPE.ver++;
  setWaveSize(1);
  SECTIONS.length = 0;
  startRide();
}

// Shape sets (a wave with a `bar`, Trestles: one keyframe set per section of the ride, all with the same phase
// stops). The wave's cross-section is set `a` blended toward set `b` by `w`, point by point; `ver` changes
// whenever the blend does (for anything that caches the shape). Waves without `shapes` have one set.
export let SHAPES = [KF];
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
export function sectionGrace(xs) {
  const g = WAVE.bar && WAVE.bar.sectionGrace; if (!g) return false;
  if (RIDE.time - RIDE.sectionT < g) return true;
  return xs !== undefined && RIDE.c + xs > RIDE.front + 2 && RIDE.time > breaksAt(RIDE.c + xs) - 0.5;
}
export function startRide() {
  layRidges(); // (a wave with ridges lays out this wave's sections)
  RIDE.time = 0; RIDE.c = 0; RIDE.front = 0; RIDE.closed = null; RIDE.closing = false; RIDE.sectionT = -Infinity; RIDE.done = null;
  if (!WAVE.bar) return;
  RIDE.time = -(WAVE.bar.lead || 0); // (you drop in as the peak stands up, `lead` s before it breaks)
  // (which simulated waves: `bar.use` (the user kept 545, 2026-11-19: 1139 closed out too quickly), or ?map=<wave>)
  const want = typeof location !== 'undefined' ? Number(new URLSearchParams(location.search).get('map')) : Number(globalThis.process && process.env.MAP);
  const all = WAVE.bar.maps, maps = all.filter((m) => (want ? m.wave === want : !WAVE.bar.use || WAVE.bar.use.includes(m.wave)));
  RIDE.k = (RIDE.k + 1) % maps.length;
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
  RIDGE.c = 0; RIDGE.list.length = 0; RIDGE.at = 0;
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
    if (u <= 0) return P[0][key];
    for (let i = 1; i < P.length; i++) if (u <= P[i].s) { const f = (u - P[i - 1].s) / Math.max(1e-6, P[i].s - P[i - 1].s); return P[i - 1][key] + (P[i][key] - P[i - 1][key]) * f; }
    return P[P.length - 1][key];
  };
  if (R.loop) {
    const u = ((X % L) + L) % L, B = R.seam ?? Math.max(20, Math.min(30, 0.15 * L));
    if (u <= L - B) return lin(u);
    const w = smooth((u - (L - B)) / B);
    return lin(u) * (1 - w) + P[0][key] * w;
  }
  if (X <= L) return lin(Math.max(0, X));
  const fade = Math.max(0, 1 - (X - L) / 30); // (past the end: backing off; the size stays as it was at the end)
  return key === 'peel' ? lin(L) * fade : key === 'H' ? lin(L) : 0;
}
// The wave's size at xs (plan step 2): a built wave grows and shrinks along its stretch with the breakers the builder found
// there, against the height it's scaled to (WAVE.built.H); 1 everywhere else. Applied to the whole cross-section, so the
// face keeps its shape and angles and just gets taller or smaller.
export function sizeAt(xs) {
  if (!WAVE.ridges || !WAVE.ridges.profile || !WAVE.built || !(WAVE.built.H > 0) || WAVE.ridges.profile[0].H == null) return 1;
  return Math.min(1.8, Math.max(0.5, profileAt('H', RIDGE.c + xs) / WAVE.built.H));
}
export function ridgeAt(xs) {
  if (!WAVE.ridges) return 0;
  if (WAVE.ridges.profile) return profileAt('k', RIDGE.c + xs);
  const X = RIDGE.c + xs; let k = 0;
  for (const r of RIDGE.list) { const d = (X - r.x) / r.w; if (d > -1 && d < 1) k += r.k * (0.5 + 0.5 * Math.cos(Math.PI * d)); }
  return Math.min(1, k);
}
// The speed the pocket holds you at when you trim (rider.js energy pocket): the curl's speed, except through a ridge's
// faster section, where it stays the wave's own (the user, 2026-11-22: as a section speeds up you need to pump to keep
// up; trimming holds the plain wall's pace, and the extra comes from working the steeper face).
export const holdPeel = () => (WAVE.ridges ? WAVE.peelSpeed * Math.sqrt(SIZE) : PEEL_SPEED);
// The curl's speed with ridges: the wave's own peel (by size) x up to `ridges.fast` where the curl is on a full ridge.
// The curl advances by its speed, added up (never time x speed: anything varying the peel must integrate).
function stepRidges(dt) {
  if (WAVE.ridges.profile) { // (a built wave: the curl's speed from the stretch you marked)
    RIDE.time += dt;
    RIDGE.at = ridgeAt(0);
    PEEL_SPEED = profileAt('peel', RIDGE.c) * Math.sqrt(SIZE);
    RIDGE.c += PEEL_SPEED * dt;
    if (!WAVE.ridges.loop && !RIDE.done && RIDGE.c >= WAVE.ridges.length) RIDE.done = { time: RIDE.time, c: RIDGE.c };
    SHAPE.ver++;
    return;
  }
  const base = WAVE.peelSpeed * Math.sqrt(SIZE);
  RIDGE.at = ridgeAt(0);
  PEEL_SPEED = base * (1 + (WAVE.ridges.fast - 1) * RIDGE.at);
  RIDGE.c += PEEL_SPEED * dt;
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
  } else s = -xs / (WAVE.phase.behind + (WAVE.phase.ahead - WAVE.phase.behind) * k);
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

// Control points for a phase, as a Float64Array [z0, y0, z1, y1, ...], scaled.
const _cpB = new Float64Array(NP * 2);
export function controlPoints(s, out = new Float64Array(NP * 2), scale = SCALE, xs) {
  // (a wave with `ridges`, Raglan+: the plain shape blended toward the section shape by the reef ridge under xs)
  if (WAVE.ridges && xs !== undefined && SHAPE.a === SHAPE.b) {
    kfPoints(SHAPES[0], s, out, scale);
    const w = ridgeAt(xs);
    if (w > 1e-4) { kfPoints(SHAPES[1], s, _cpB, scale); for (let i = 0; i < NP * 2; i++) out[i] += (_cpB[i] - out[i]) * w; }
    const f = sizeAt(xs); // (a built wave's size along its stretch)
    if (f !== 1) for (let i = 0; i < NP * 2; i++) out[i] *= f;
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
function kfPoints(KF, s, out, scale) {
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
  return out;
}

// Centripetal Catmull-Rom between p1 and p2 (avoids loops and cusps when
// control points are unevenly spaced, which ours are).
function knot(az, ay, bz, by) {
  return Math.max(1e-4, Math.sqrt(Math.hypot(bz - az, by - ay)));
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
