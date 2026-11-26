// Shapes shared by the wave definitions. Every wave uses the same 16-point
// cross-section layout (see wave.js): 0-3 back, 4 crest, 5-11 lip (outside,
// tip at 8, underside/roof up to 11), 12-13 face, 14 trough, 15 front.

export const KF_BARREL = [
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

// A crumbling (spilling) wave: the crest steepens, then spills foam down the
// face instead of throwing a lip. Same 16-point layout, but the curve never
// overhangs, so there's no barrel. Phase 0 is where it starts to crumble.
export const KF_CRUMBLE = [
  KF_BARREL[0],
  KF_BARREL[1],
  KF_BARREL[2],
  { s: -0.25, p: [[-40, 0], [-30, 0], [-10, 0.5], [-3.5, 2.1], [0, 2.95], [0.9, 2.98], [1.6, 2.85], [2.1, 2.62], [2.45, 2.35], [2.7, 2.05], [2.9, 1.75], [3.1, 1.45], [3.4, 1.1], [4.1, 0.45], [6.0, -0.2], [22, 0]] },
  // Crumbling: a tumbling lump of whitewater rides up on the crest.
  { s: 0.4, p: [[-40, 0], [-30, 0], [-10, 0.5], [-3.5, 2.05], [0, 2.95], [1.0, 3.15], [1.9, 3.1], [2.6, 2.8], [3.0, 2.4], [3.3, 1.95], [3.55, 1.55], [3.8, 1.2], [4.2, 0.85], [4.9, 0.4], [6.5, -0.2], [22, 0]] },
  // Whitewater: a tall, steep-fronted wall of foam rolling in.
  { s: 1.2, p: [[-40, 0], [-30, 0], [-10, 0.45], [-3.5, 1.7], [0, 2.4], [1.2, 2.6], [2.3, 2.6], [3.2, 2.4], [3.9, 2.1], [4.4, 1.8], [4.8, 1.5], [5.2, 1.2], [5.7, 0.9], [6.6, 0.4], [8.5, -0.15], [22, 0]] },
  KF_BARREL[8],
  KF_BARREL[9],
];


export const sstep = (a, b, x) => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u); };

// A heavy, hollow reef barrel: the wall stands up suddenly, a thick lip
// throws far out, and the tube is round to oval (about as tall as it is
// wide), with water drawn off the reef in front (trough below sea level).
export const KF_PIPE_HEAD = [
  KF_BARREL[0],
  KF_BARREL[1],
  // Building: already a tall, steep wall ahead of the curl.
  { s: -1.2, p: [[-40, 0], [-30, 0], [-9, 0.5], [-3.5, 2.2], [0, 3.3], [0.8, 3.32], [1.45, 3.18], [1.95, 2.9], [2.2, 2.68], [2.38, 2.45], [2.52, 2.2], [2.64, 1.9], [2.86, 1.53], [3.55, 0.86], [6.41, -0.28], [22, 0]] },
  // The wall stands up: tall, near vertical and slightly hollow, the crest
  // rounding over the top (no overhang yet, so the rideable face is unchanged).
  { s: -0.25, p: [[-40, 0], [-30, 0], [-8, 0.45], [-3, 2.4], [0, 3.95], [0.9, 4.1], [1.6, 4], [2.1, 3.7], [2.3, 3.45], [2.43, 3.18], [2.51, 2.88], [2.57, 2.52], [2.66, 1.77], [3, 0.8], [4.31, -0.53], [22, 0]] },
  // The lip pitches far out in front of the face.
  { s: 0.25, p: [[-40, 0], [-30, 0], [-8, 0.4], [-2.5, 2.6], [0, 4.1], [1.4, 4.4], [2.9, 4.3], [4.15, 3.85], [4.9, 3], [4.65, 2.95], [3.9, 3.6], [2.8, 4.05], [1.75, 3.8], [1.66, 1.32], [2.79, -0.68], [22, 0]] },
  // (Points 10-13 of the full and closing tubes lie on an ellipse, so the inside
  // of the tube is a true arc: round over the top into the back wall.)
  // Full barrel: a round tube (about as wide as it is tall), the thin curtain
  // of the lip landing well out in front.
  { s: 0.8, p: [[-40, 0], [-30, 0], [-8, 0.4], [-2.5, 2.7], [0, 4.2], [1.5, 4.55], [3.2, 4.35], [5.15, 3.2], [5.3, -0.35], [5.05, -0.32], [5.03, 2.37], [3.62, 4.07], [1.69, 3.45], [1.04, 1.33], [2.25, -0.75], [22, 0]] },
  // Closing: the full tube scaled to 78% about the bottom of the back wall, so
  // the tube is a tapered cylinder: the same round section, narrowing toward
  // the back (the user's model), lip and all.
  { s: 1.3, p: [[-40, 0], [-30, 0], [-8, 0.4], [-2.5, 2.3], [0.22, 3.11], [1.39, 3.38], [2.72, 3.23], [4.24, 2.33], [4.35, -0.44], [4.16, -0.41], [4.14, 1.68], [3.04, 3.01], [1.54, 2.53], [1.03, 0.87], [1.98, -0.75], [22, 0]] },
];
// (then the tube collapses into whitewater where its lip landed, and the whitewater lasts: withBore below; KF_PIPE is set
// after it)

// ---- Whitewater behind the curl (the user, 2026-11-23: once the lip hits the water everything behind it is broken,
// connected whitewater) ----
// How tall the broken wave stays: fraction of its height just after breaking, by seconds since it broke. From the FUNWAVE
// runs behind Trestles (sim-trestles.js: 100% at 3 s, 96% at 6, 84% at 10, 67% at 15, 53% at 21, 37% at 30).
export const BORE_DECAY = [[3, 1.0], [6, 0.96], [10, 0.84], [15, 0.67], [21, 0.53], [30, 0.37]];
// A bore (a rolling wall of whitewater) as one keyframe: crest at z `zc`, `H` tall, its front `w` x H wide from the crest
// to its base, a foam apron spreading 1.8 H ahead of that, then the toe; the back (points 2-3) taken from `back` and
// scaled to the height. Points 5-13 sit along front and apron at `ts` (0-1 down the front, 1-2 across the apron): every
// bore of a wave keeps one layout, so it can shrink and spread without points sliding along it.
// BORE_TS: the layout after a closing tube: the tip (8) at the base of the wall, where the lip landed, 9-13 the apron.
export const BORE_TS = [0.3, 0.55, 0.78, 1, 1.14, 1.3, 1.5, 1.72, 2];
// (`ap`: the apron's size, 1 = the full 1.8 H reach and 0.15 H depth at its base)
function boreCurve(t, zc, H, w, ap = 1) {
  const zb = zc + w * H;
  if (t > 1) { const a = Math.min(1, t - 1); return [zb + 1.8 * ap * H * a, ap * H * (0.15 * (1 - a) ** 1.6 + 0.02 * a)]; }
  const a = [zc, H], b = [zc + 0.45 * w * H, 1.03 * H], c = [zb - Math.min(0.15, 0.09 / w) * w * H, (0.32 + 0.12 / w) * H], d = [zb, 0.15 * H], u = 1 - t;
  return [0, 1].map((i) => u * u * u * a[i] + 3 * u * u * t * b[i] + 3 * u * t * t * c[i] + t * t * t * d[i]);
}
export function boreKF(s, { zc, H, w, back, ts = BORE_TS, apron = 1 }) {
  const hb = Math.max(...back.p.map((q) => q[1]), 1e-3), k = H / hb, zb = zc + w * H;
  const toe = Math.min(21, zb + (0.8 + 1.8 * apron) * H);
  return { s, p: [[-40, 0], [-30, 0], [back.p[2][0] * Math.min(1, k), back.p[2][1] * k], [back.p[3][0] * Math.min(1, k), back.p[3][1] * k],
    [zc, H], ...ts.map((t) => boreCurve(t, zc, H, w, apron)), [toe, -0.01 * H], [22, 0]] };
}
// The layout (ts) that matches a keyframe's own points 5-13: the same share of the way along points 4-14, measured on a
// bore with the same crest and height.
export function matchTs(kf, w = 2.6) {
  const P = kf.p.slice(4, 15), H = Math.max(...kf.p.map((q) => q[1])), zc = kf.p[4][0];
  const cum = [0]; for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
  const B = boreKF(0, { zc, H, w, back: kf, ts: Array.from({ length: 201 }, (_, i) => i / 100) }).p.slice(4, 4 + 202).concat([[Math.min(21, zc + w * H + 2.6 * H), 0]]);
  const bc = [0]; for (let i = 1; i < B.length; i++) bc.push(bc[i - 1] + Math.hypot(B[i][0] - B[i - 1][0], B[i][1] - B[i - 1][1]));
  return [1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => {
    const want = (cum[i] / cum[cum.length - 1]) * bc[bc.length - 1];
    let j = 1; while (j < bc.length - 1 && bc[j] < want) j++;
    return Math.min(2, ((j - 1) + (want - bc[j - 1]) / Math.max(1e-6, bc[j] - bc[j - 1])) / 100);
  });
}
// A wave's keyframes up to its last broken shape (`from`), then the bore tail. With `collapse` (a closing tube): the
// cavity flattens along the bottom under the lip, then the tube collapses into a steep foam wall where its lip landed (at
// s `collapse`). Then the whitewater relaxes into a broad bore and shrinks as BORE_DECAY. `sOf(t)`: the phase t seconds
// after a spot broke (each wave's own rate). The last authored keyframe's height is the 100%.
// `ts` (optional): the bore's point layout, for a set blended point by point with another (a built wave's tube set takes its
// section set's, or the blend of the two bores bulged into a step behind the curl; the user, 2026-11-23).
// (behind a collapsed tube the foam apron is this size: the full one (0.15 H deep, 1.8 H out) lifted the flats behind the curl
// 0.25-0.5 m out to ~12 m from the whitewater where in front of the curl they're at sea level; the user, 2026-11-25)
const TUBE_APRON = 0.35;
export function withBore(kf, { from, sOf, collapse, ts: tsOver }) {
  const head = kf.filter((k) => k.s <= from), last = head[head.length - 1];
  const H = Math.max(...last.p.map((q) => q[1])), zc = last.p[4][0], out = [...head];
  let ts = tsOver || matchTs(last, 2.6);
  if (collapse != null) {
    ts = tsOver || BORE_TS;
    const zt = last.p[8][0] + 0.3, Hc = 0.97 * H;
    const wall = boreKF(collapse, { zc, H: Hc, w: Math.max(0.6, (zt - zc) / Hc), back: last, ts, apron: TUBE_APRON });
    // (half way: the front half way to the wall, the tip down on the water where it landed, the tube's inside (9-14)
    // closed in onto the tip, just starting to spread forward toward the wall's apron. It used to lie flattened along the
    // bottom back to the trough: hidden behind the curtain in a full barrel, but on a half-barrel (a built wave between the
    // section and tube shapes, blended point by point) the curtain is half thrown and that fold showed as an edge jutting
    // out behind the curl; the user, 2026-11-23)
    // (the trough (14) is not part of the tube's inside: it's the water drawn down in front, and it fills in half way from the
    // closing tube's to the wall's toe, ahead of the tip. Closed onto the tip with the rest, it lifted the flats from the
    // drawdown (~-0.5) to above sea level for a moment and back down to the toe: a shelf of water out in front of the
    // whitewater behind the curl; the user, 2026-11-25)
    const tip = [last.p[8][0], Math.max(last.p[8][1], 0.04 * H)];
    const mid = { s: (from + collapse) / 2, p: last.p.map((q, i) => {
      if (i < 2 || i === 15) return q;
      if (i <= 7) return [(q[0] + wall.p[i][0]) / 2, (q[1] + wall.p[i][1]) / 2];
      if (i === 8) return tip;
      if (i === 14) return [Math.max(tip[0] + 0.25 * H, (q[0] + wall.p[i][0]) / 2), (q[1] + wall.p[i][1]) / 2];
      const f = 0.12 * (i - 8) / 6; return [tip[0] + (wall.p[i][0] - tip[0]) * f, tip[1] + (wall.p[i][1] - tip[1]) * f];
    }) };
    out.push(mid, wall);
  }
  // (after a tube collapses, the whitewater's base stays where the lip landed (the wall's): the broken wave behind the curl travels
  // with the rest of it, it doesn't run out ahead. Relaxing to 2.6 H wide moved its base ~5 m further in within a few metres
  // behind the collapse and spread its apron 0.3-0.6 m deep out to ~20 m: a lump sticking out into the flats behind the curl;
  // the user, 2026-11-25)
  const base = collapse != null ? last.p[8][0] + 0.3 : null;
  for (const [t, f] of BORE_DECAY) {
    const s = sOf(t); if (!(s > out[out.length - 1].s + 0.05)) continue;
    const w = base != null ? Math.max(0.6, (base - zc * f) / (H * f)) : 2.6;
    out.push(boreKF(s, { zc: zc * f, H: H * f, w, back: last, ts, apron: base != null ? TUBE_APRON : 1 }));
  }
  return out;
}

// The almond barrel (the user, 2026-11-24: we were missing it, and the built barrel looked unrealistic: KF_PIPE's tube is a tall
// hairpin, the lip a straight curtain dropping beside a vertical back wall, the floor sagging well under the water). Real
// tubes: the lip throws out and curves down to land in front, the back wall rises concave from the trough, and the opening is
// an almond about 1.4x taller than wide, pointed where the lip lands and rounder up under the roof, leaning forward a little.
// KF_PIPE_HEAD's stages with the pitch, the full tube and the closing tube redrawn that way (same units: crest ~4.2).
// (the user, 2026-11-26: from inside it looked square: the back wall dropped straight to the floor, which ran flat ~2 m out
// to where the lip lands. Now the back wall sweeps forward under the lip, so the opening narrows to a point where it lands.)
const ALMOND_FULL = [[-40, 0], [-30, 0], [-8, 0.4], [-2.5, 2.7], [0, 4.2], [1.45, 4.5], [2.95, 4.05], [4.1, 2.75], [4.6, 0.05], [4.3, 0.1], [3.6, 2.1], [2.3, 3.5], [1.2, 2.75], [1.6, 0.75], [3.6, -0.3], [22, 0]];
export const KF_ALMOND_HEAD = KF_PIPE_HEAD.map((k) => {
  if (k.s === 0.25) return { s: 0.25, p: [[-40, 0], [-30, 0], [-8, 0.4], [-2.5, 2.6], [0, 4.1], [1.4, 4.45], [2.85, 4.2], [3.95, 3.5], [4.5, 2.8], [4.22, 2.74], [3.45, 3.3], [2.4, 3.72], [1.6, 3.05], [1.75, 1.15], [3.5, -0.5], [22, 0]] };
  if (k.s === 0.8) return { s: 0.8, p: ALMOND_FULL };
  if (k.s === 1.3) { // (closing: the full tube scaled to 80% about the foot of the back wall, as KF_PIPE's)
    const o = [0.85, -0.2];
    return { s: 1.3, p: ALMOND_FULL.map(([z, y], i) => (i < 3 || i === 15 ? [z, y] : [o[0] + (z - o[0]) * 0.8, o[1] + (y - o[1]) * 0.8])) };
  }
  return k;
});
// The ledge barrel (the user, 2026-11-24: the heaviest shape we'd want, on a true ledge; after Teahupoo: the reef a near-vertical
// wall up from a ~10 m shelf, breaking "below sea level", the lip half the wave's height thick or more, the face much taller
// than the back). A short back, a thick lip thrown far out, and a round tube about as wide as it's tall.
// Drawn first with its trough well under the water; then (the user, same day) the flats are a fixed reference: no dipping where
// a wave is a ledge, no step where the shape changes along the wave. So at each stage everything from the back of the crest to
// the trough is lifted until the trough sits at the others' level (~-0.45): the wave keeps all its height and jacks up above the
// water instead, as it does when it reaches a ledge. The lip still lands on the waterline. Same units as KF_PIPE_HEAD.
const LEDGE_TROUGH = -0.3; // (the almond's trough: at -0.45 the curve out to the flats overshot to ~-0.7 m in front of the curl)
const jackUp = (p, land) => { const up = LEDGE_TROUGH - p[14][1]; return p.map(([z, y], i) => (i < 3 || i === 15 ? [z, y] : land && (i === 8 || i === 9) ? [z, i === 8 ? 0.05 : 0.1] : [z, y + up])); };
const LEDGE_FULL = jackUp([[-40, 0], [-30, 0], [-6, 0.3], [-2.2, 2.0], [0, 3.3], [1.8, 3.9], [3.9, 3.5], [5.4, 1.6], [5.8, -0.9], [4.9, -0.8], [4.4, 0.9], [2.8, 2.1], [1.1, 1.3], [1.0, -0.6], [2.6, -1.6], [22, 0]], true);
export const KF_LEDGE_HEAD = [
  KF_BARREL[0],
  KF_BARREL[1],
  // building: the shelf lifts it, the water drawing off the reef in front
  { s: -1.2, p: jackUp([[-40, 0], [-30, 0], [-7, 0.3], [-2.5, 1.8], [0, 3.0], [0.8, 2.95], [1.4, 2.75], [1.8, 2.4], [2.05, 2.0], [2.25, 1.5], [2.45, 0.9], [2.75, 0.3], [3.3, -0.3], [4.5, -0.7], [7.5, -0.95], [22, 0]]) },
  // it stands up on the wall, near vertical
  { s: -0.25, p: jackUp([[-40, 0], [-30, 0], [-6, 0.3], [-2.2, 2.2], [0, 3.6], [0.6, 3.55], [1.0, 3.3], [1.2, 2.9], [1.25, 2.4], [1.28, 1.9], [1.3, 1.2], [1.35, 0.4], [1.5, -0.4], [2.2, -1.0], [4.0, -1.2], [22, 0]]) },
  // the lip pitches, thick
  { s: 0.25, p: jackUp([[-40, 0], [-30, 0], [-6, 0.3], [-2.2, 2.1], [0, 3.5], [1.4, 3.95], [3.0, 3.7], [4.0, 2.9], [4.3, 2.1], [3.8, 2.0], [3.0, 2.6], [2.0, 2.9], [1.2, 2.2], [1.1, 0.2], [2.6, -1.4], [22, 0]]) },
  { s: 0.8, p: LEDGE_FULL },
  // closing: the full tube scaled to 80% about the foot of the back wall
  { s: 1.3, p: LEDGE_FULL.map(([z, y], i) => (i < 3 || i === 15 ? [z, y] : [1.0 + (z - 1.0) * 0.8, 0.55 + (y - 0.55) * 0.8])) },
];
// Pipe's phase t s after a spot broke (reef.js: 13 m per phase at 10.5 m/s up to phase 1.3, then 22 m: behindFar).
export const pipeSOf = (t) => (t <= 1.61 ? t * 10.5 / 13 : 1.3 + (t - 1.61) * 10.5 / 22);
export const KF_PIPE = withBore(KF_PIPE_HEAD, { from: 1.3, collapse: 1.65, sOf: pipeSOf });
