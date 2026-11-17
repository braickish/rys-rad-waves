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
export const KF_PIPE = [
  KF_BARREL[0],
  KF_BARREL[1],
  // Building: already a tall, steep wall ahead of the curl. The same shape as
  // the standing wall below, scaled to this height and leaned out, so the
  // blend between them is even (two differently shaped walls sagged into a
  // fold on the face part way out toward the shoulder).
  { s: -1.2, p: [[-40, 0], [-30, 0], [-9, 0.5], [-3.5, 2.2], [0, 3.2], [0.9, 3.32], [1.6, 3.24], [2.27, 3.07], [2.6, 2.89], [2.78, 2.75], [2.91, 2.6], [3.0, 2.45], [3.09, 2.27], [3.74, 0.98], [6.39, -0.26], [22, 0]] },
  // (Points 7-14 of both wall keyframes are sampled from one smooth design
  // curve each: placed by hand, the close-together points made a notch.)
  // The wall stands up: tall and steep, the crest rounding over the top, no
  // overhang yet. Points 8-12 sit close together on the upper face where the
  // lip will form, so the face below is one smooth sweep and nothing has to
  // fold over as it turns into the pitching lip (that left a ledge on the face).
  { s: -0.25, p: [[-40, 0], [-30, 0], [-8, 0.45], [-3.0, 2.4], [0, 3.95], [0.9, 4.1], [1.6, 4.0], [1.99, 3.8], [2.19, 3.58], [2.3, 3.4], [2.37, 3.22], [2.42, 3.04], [2.48, 2.82], [2.86, 1.25], [4.45, -0.25], [22, 0]] },
  // The lip pitches far out in front of the face.
  { s: 0.15, p: [[-40, 0], [-30, 0], [-8, 0.4], [-2.5, 2.6], [0, 4.1], [1.4, 4.42], [2.9, 4.35], [4.05, 3.85], [4.75, 2.9], [4.5, 2.88], [3.85, 3.62], [2.8, 4.06], [1.6, 3.85], [1.45, 1.4], [3.0, -0.6], [22, 0]] },
  // Mid-throw: the lip on its way down, the tip pushed out on the arc of the
  // tube (with the reef's even keyframe blending the tip would otherwise go
  // straight from pitching to landing and the opening would lose its round top).
  { s: 0.45, p: [[-40, 0], [-30, 0], [-8, 0.4], [-2.5, 2.65], [0, 4.15], [1.45, 4.5], [3.05, 4.38], [4.5, 3.7], [5.3, 1.55], [5.05, 1.55], [4.3, 3.3], [3.0, 4.13], [1.6, 3.92], [1.25, 1.45], [2.7, -0.68], [22, 0]] },
  // Full barrel: a round tube (about as wide as it is tall), the thin curtain
  // of the lip landing well out in front.
  { s: 0.8, p: [[-40, 0], [-30, 0], [-8, 0.4], [-2.5, 2.7], [0, 4.2], [1.5, 4.55], [3.2, 4.35], [4.6, 3.4], [5.3, -0.35], [5.05, -0.32], [4.6, 2.9], [3.2, 4.15], [1.6, 3.98], [1.1, 1.5], [2.4, -0.75], [22, 0]] },
  // Closing: the tube narrows and the lip drives down into the trough.
  { s: 1.3, p: [[-40, 0], [-30, 0], [-8, 0.4], [-2.5, 2.3], [0, 3.7], [1.4, 4.0], [2.9, 3.6], [4.0, 2.5], [4.4, -0.4], [4.15, -0.37], [3.85, 2.05], [2.8, 3.42], [1.4, 3.7], [1.1, 1.1], [2.4, -0.6], [22, 0]] },
  KF_BARREL[7],
  KF_BARREL[8],
  KF_BARREL[9],
];
