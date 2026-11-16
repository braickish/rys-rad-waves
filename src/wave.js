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
export const SCALE = 1.25; // overall wave size multiplier
export const PEEL_SPEED = 6.0; // m/s the breaking point moves along +x
export const WAVE_SPEED = 5.0; // m/s the wave moves toward shore (+z)

// Control point indices.
export const I = {
  BACK_FAR: 0, BACK_MID: 1, BACK_NEAR: 2, CREST_BACK: 3, CREST: 4,
  LIP_OUT1: 5, LIP_OUT2: 6, LIP_OUT3: 7, TIP: 8, LIP_IN1: 9, LIP_IN2: 10,
  ROOF: 11, FACE_UP: 12, FACE_LOW: 13, TROUGH: 14, FRONT_FAR: 15,
};

export const FAR = 1500; // flat ocean extent, added by the mesh builder

// Keyframes: [z, y] pairs, before SCALE. `s` is the wave's phase:
// negative = unbroken (more negative = smaller), 0 = starting to pitch,
// ~0.8 = full barrel, >1.3 = collapsing into whitewater.
const KF = [
  { s: -14, p: [[-40, 0], [-30, 0], [-10, 0], [-4, 0], [0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [7, 0], [8, 0], [10, 0], [13, 0], [22, 0]] },
  { s: -3.5, p: [[-40, 0], [-30, 0], [-10, 0.25], [-4, 0.7], [0, 0.9], [1.2, 0.86], [2.2, 0.78], [3.0, 0.68], [3.7, 0.58], [4.4, 0.48], [5.2, 0.38], [6.0, 0.29], [7.0, 0.2], [9.0, 0.08], [13, 0], [22, 0]] },
  { s: -1.2, p: [[-40, 0], [-30, 0], [-10, 0.4], [-4, 1.5], [0, 2.2], [0.9, 2.15], [1.7, 2.0], [2.3, 1.82], [2.8, 1.62], [3.25, 1.4], [3.7, 1.17], [4.2, 0.92], [4.8, 0.65], [6.0, 0.25], [8.5, -0.1], [22, 0]] },
  { s: -0.25, p: [[-40, 0], [-30, 0], [-10, 0.5], [-3.5, 2.1], [0, 3.0], [0.9, 3.05], [1.6, 2.9], [2.0, 2.65], [2.25, 2.35], [2.4, 2.05], [2.55, 1.75], [2.7, 1.45], [3.0, 1.1], [3.8, 0.45], [6.0, -0.3], [22, 0]] },
  { s: 0.25, p: [[-40, 0], [-30, 0], [-10, 0.5], [-3.5, 2.2], [0, 3.25], [1.2, 3.4], [2.4, 3.25], [3.3, 2.85], [3.75, 2.35], [3.45, 2.25], [2.8, 2.55], [2.0, 2.6], [1.55, 2.1], [1.9, 0.9], [4.5, -0.35], [22, 0]] },
  { s: 0.8, p: [[-40, 0], [-30, 0], [-10, 0.6], [-3.5, 2.3], [0, 3.35], [1.5, 3.55], [3.0, 3.3], [4.3, 2.5], [4.9, 1.2], [4.6, 1.15], [3.9, 2.2], [2.6, 2.75], [1.3, 2.3], [1.3, 0.8], [3.2, -0.4], [22, 0]] },
  { s: 1.3, p: [[-40, 0], [-30, 0], [-10, 0.55], [-3.5, 2.0], [0, 2.9], [1.5, 3.0], [2.8, 2.6], [3.8, 1.8], [4.3, 0.5], [4.0, 0.45], [3.4, 1.3], [2.4, 1.7], [1.4, 1.4], [1.4, 0.5], [3.0, -0.2], [22, 0]] },
  { s: 2.0, p: [[-40, 0], [-30, 0], [-10, 0.5], [-3.5, 1.6], [0, 2.1], [1.2, 2.15], [2.3, 2.0], [3.2, 1.8], [3.9, 1.55], [4.2, 1.4], [4.5, 1.25], [4.8, 1.1], [5.2, 0.9], [6.0, 0.55], [8.0, 0.05], [22, 0]] },
  { s: 3.5, p: [[-40, 0], [-30, 0], [-10, 0.3], [-4, 0.65], [0, 0.8], [1, 0.8], [2, 0.78], [3, 0.72], [4, 0.64], [5, 0.55], [6, 0.46], [7, 0.37], [8, 0.28], [10, 0.14], [13, 0.02], [22, 0]] },
  { s: 14, p: [[-40, 0], [-30, 0], [-10, 0], [-4, 0], [0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [7, 0], [8, 0], [10, 0], [13, 0], [22, 0]] },
];

// Phase from distance to the peel point.
export function phaseAt(xs) {
  return xs >= 0 ? -xs / 10 : -xs / 8.5;
}

const smooth = (f) => f * f * (3 - 2 * f);

// Control points for a phase, as a Float64Array [z0, y0, z1, y1, ...], scaled.
export function controlPoints(s, out = new Float64Array(NP * 2)) {
  let k = 0;
  if (s <= KF[0].s) k = 0;
  else if (s >= KF[KF.length - 1].s) k = KF.length - 2;
  else while (k < KF.length - 2 && s > KF[k + 1].s) k++;
  const a = KF[k], b = KF[k + 1];
  const f = smooth(Math.min(1, Math.max(0, (s - a.s) / (b.s - a.s))));
  for (let i = 0; i < NP; i++) {
    out[i * 2] = (a.p[i][0] + (b.p[i][0] - a.p[i][0]) * f) * SCALE;
    out[i * 2 + 1] = (a.p[i][1] + (b.p[i][1] - a.p[i][1]) * f) * SCALE;
  }
  return out;
}

// Centripetal Catmull-Rom between p1 and p2 (avoids loops and cusps when
// control points are unevenly spaced, which ours are).
function knot(az, ay, bz, by) {
  return Math.max(1e-4, Math.sqrt(Math.hypot(bz - az, by - ay)));
}
function crPoint(c, t, out) {
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
