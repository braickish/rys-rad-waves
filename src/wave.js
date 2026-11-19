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

// The ride along the bar (waves with a `bar`, Trestles): the wave starts as a peak and the curl runs along the
// bar at the speed the bar sets at each place (sections that go almost at once are just places where it runs
// very fast), and the shape changes from section to section. RIDE.c is how far the curl has run from the peak
// (m), RIDE.time the time since the peak broke. Behind the curl a spot's phase comes from how long ago the curl
// passed it (`phaseTime` s per unit of phase), so a fast section leaves a long stretch breaking almost together
// and nothing already broken stretches when the speed changes; the left side of the peak (behind where it
// started) breaks later, peeling away the other way. Ahead of the curl it goes by distance, as on every wave.
// The ride ends with a closeout (`bar.closeout`): once the curl reaches `at` it stops there (RIDE.closed) and the
// `length` m ahead of it breaks in place, sweeping along at `speed` m/s (almost together). (It used to be the curl
// running on at 30 m/s for ever: the view travels with the curl, so the water rushed past, even on the score screen.)
export const RIDE = { time: 0, c: 0, n: 0, ts: new Float64Array(8192), cs: new Float64Array(8192), closed: null };
export function startRide() {
  RIDE.time = 0; RIDE.c = 0; RIDE.n = 1; RIDE.ts[0] = 0; RIDE.cs[0] = 0; RIDE.closed = null;
  if (WAVE.bar) { applyBar(); }
}
// The bar's setting at c (m from the peak): the bar's rows interpolated (peel speed and shape mix).
function barAt(c) {
  const rows = WAVE.bar.rows;
  let k = 0; while (k < rows.length - 2 && c > rows[k + 1].x) k++;
  const A = rows[k], B = rows[k + 1], f = Math.min(1, Math.max(0, (c - A.x) / (B.x - A.x)));
  return { peel: A.peel + (B.peel - A.peel) * f, shape: A.shape + (B.shape - A.shape) * f };
}
function applyBar() {
  const { peel, shape } = barAt(RIDE.c);
  PEEL_SPEED = RIDE.closed ? 0 : peel * Math.sqrt(SIZE); // (closed out: the curl stops; the stretch ahead breaks in place)
  // shape: a position along the bar's shape list (1.5 = half way from the 2nd set to the 3rd); a set wave
  // swaps in the bar's `setShapes` (the bigger set wave's own inside, say)
  const sets = SIZE > (WAVE.bar.setSize || 9) && WAVE.bar.setShapes ? WAVE.bar.setShapes : WAVE.bar.shapes;
  const i = Math.min(sets.length - 2, Math.floor(shape)), f = shape - i;
  if (sets.length === 1) setShape(sets[0], sets[0], 0);
  else if (f <= 1e-4) setShape(sets[i], sets[i], 0);
  else setShape(sets[i], sets[i + 1], Math.min(1, f));
}
export function stepRide(dt) {
  if (!WAVE.bar) return;
  RIDE.time += dt;
  RIDE.c += PEEL_SPEED * dt;
  const co = WAVE.bar.closeout;
  if (co && !RIDE.closed && RIDE.c >= co.at) RIDE.closed = { time: RIDE.time, c: RIDE.c };
  if (RIDE.n === RIDE.ts.length) { // (grow the history)
    const g = (a) => { const b = new Float64Array(a.length * 2); b.set(a); return b; };
    RIDE.ts = g(RIDE.ts); RIDE.cs = g(RIDE.cs);
  }
  RIDE.ts[RIDE.n] = RIDE.time; RIDE.cs[RIDE.n] = RIDE.c; RIDE.n++;
  applyBar();
}
// When the curl passed the spot `back` m behind it now (binary search of the history); before the peak broke
// for spots behind where it started (the left side of the peak breaks later, peeling away at `leftPeel`).
function brokeAt(back) {
  const c = RIDE.c - back;
  if (c <= 0) return -c / WAVE.bar.leftPeel;
  let lo = 0, hi = RIDE.n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (RIDE.cs[m] < c) lo = m; else hi = m; }
  const c0 = RIDE.cs[lo], c1 = RIDE.cs[hi];
  return RIDE.ts[lo] + (RIDE.ts[hi] - RIDE.ts[lo]) * (c1 > c0 ? (c - c0) / (c1 - c0) : 0);
}

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
  if (WAVE.bar) applyBar(); // (the bar sets the peel speed and shape; a set wave may have its own shapes)
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
    // (a wave with a bar: behind the curl, by how long ago it broke there; ahead by distance; blended through
    // the curl the same way)
    let ahead = -xs / WAVE.phase.ahead;
    // (closed out: the stretch ahead breaks too, `speed` m/s along from the curl, easing off past `length`)
    const co = RIDE.closed && WAVE.bar.closeout;
    if (co && xs > 0) {
      const sc = (RIDE.time - RIDE.closed.time - xs / co.speed) / WAVE.phaseTime - Math.max(0, xs - co.length) / WAVE.phase.ahead;
      ahead = Math.max(ahead, sc);
    }
    const behind = xs < 0 ? (RIDE.time - brokeAt(-xs)) / WAVE.phaseTime : -xs / (Math.max(0.5, PEEL_SPEED) * WAVE.phaseTime); // (floored: the curl stops at a closeout)
    s = behind + (ahead - behind) * k;
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
export function controlPoints(s, out = new Float64Array(NP * 2), scale = SCALE) {
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
  controlPoints(phaseAt(xs), _cp);
  crPoint(_cp, t, _o);
  out[0] = xs; out[1] = _o[1]; out[2] = _o[0];
  return out;
}

// Cross-section polyline for a given xs: arrays of z, y, t.
export function slice(xs, perSeg = 10) {
  const cp = controlPoints(phaseAt(xs));
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
