// Geometry: the water's cross-section table, a lip lookup table for the GPU
// particle emitters, and simple primitives for the surfer and board.

import { NP, FAR, phaseAt, surface, WAVE, controlPoints, crPoint } from './wave.js';

const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function sliceXs() {
  const xs = [-FAR, -800, -400, -200, -120, -90, -70];
  for (let x = -60; x < -40; x += 2) xs.push(x);
  for (let x = -40; x < 60; x += 0.5) xs.push(x);
  for (let x = 60; x < 120; x += 2) xs.push(x);
  xs.push(120, 160, 250, 400, 800, FAR);
  return xs;
}

// Water: drawn on the GPU from a table of cross-sections. The CPU builds
// the table once per wave (the cross-section shape, foam and translucency at
// TABLE.rows phases through the breaking cycle, at size 1); every frame it
// sends the GPU each slice's position and current phase (sections and sets
// change these), and the vertex shader builds the surface from the table.
export const WATER_XS = sliceXs();
export const PER_SEG = 10;
export const COLS = (NP - 1) * PER_SEG + 1 + 2; // plus far-flat ocean at each end
export const TABLE = { rows: 512, sMin: -15, sMax: 15 };

// vec4 per (row, column): [z, y, foam, thin] at scale 1.
export function buildWaterTable() {
  const { rows, sMin, sMax } = TABLE;
  const data = new Float32Array(rows * COLS * 4);
  const cp = new Float64Array(NP * 2), o = [0, 0];
  for (let r = 0; r < rows; r++) {
    const s = sMin + ((sMax - sMin) * r) / (rows - 1);
    controlPoints(s, cp, 1);
    for (let j = 0; j < COLS; j++) {
      const k = (r * COLS + j) * 4;
      if (j === 0) { data.set([-FAR, 0, 0, 0], k); continue; }
      if (j === COLS - 1) { data.set([FAR, 0, 0, 0], k); continue; }
      const t = (j - 1) / PER_SEG;
      crPoint(cp, t, o);
      data.set([o[0], o[1], WAVE.foamVisual(s, t, 0), WAVE.thin(s, t)], k);
    }
  }
  return data;
}

// Triangle indices for the water grid (slices x columns).
export function buildWaterIndices() {
  const nx = WATER_XS.length;
  const idx = new Uint32Array((nx - 1) * (COLS - 1) * 6);
  let q = 0;
  for (let i = 0; i < nx - 1; i++) {
    for (let j = 0; j < COLS - 1; j++) {
      const a = i * COLS + j, b = a + 1, c = a + COLS, d = c + 1;
      idx[q++] = a; idx[q++] = c; idx[q++] = b;
      idx[q++] = b; idx[q++] = c; idx[q++] = d;
    }
  }
  return idx;
}

// Each slice's position and its phase right now: [xs, phase] pairs.
export function slicePhases(out = new Float32Array(WATER_XS.length * 2)) {
  for (let i = 0; i < WATER_XS.length; i++) { out[i * 2] = WATER_XS[i]; out[i * 2 + 1] = phaseAt(WATER_XS[i]); }
  return out;
}

// Lip table for particle emitters: per xs, three vec4s:
//   [tipY, tipZ, dirY, dirZ], [tubeCenterY, tubeCenterZ, phase, white],
//   [crestY, crestZ, plume, impact] (plume: spray blowing back off the crest;
//   impact: whitewater bursting up where the lip lands)
export const LIP = { x0: -45, step: 0.25, count: 241 };
export function buildLipTable(data = new Float32Array(LIP.count * 12)) {
  // (each cross-section's shape is worked out once and every point read off it: the same numbers as
  // calling surface() for each point, which redid the wave shape 18 times per xs, every frame)
  const cp = new Float64Array(NP * 2), o = [0, 0];
  const at = (t, out) => { crPoint(cp, t, o); out[1] = o[1]; out[2] = o[0]; return out; };
  const a = [0, 0, 0], b = [0, 0, 0], c = [0, 0, 0], d = [0, 0, 0];
  for (let i = 0; i < LIP.count; i++) {
    const xs = LIP.x0 + i * LIP.step;
    const s = phaseAt(xs);
    controlPoints(s, cp);
    const tipT = WAVE.lipT;
    at(tipT, a);
    at(tipT + 0.15, b);
    at(12.6, c);
    let dy = b[1] - a[1], dz = b[2] - a[2];
    const l = Math.hypot(dy, dz) || 1;
    // How active the whitewater is here (drives crest spray and mist).
    const white = WAVE.white(s);
    // The crest: the highest point of the cross-section's top.
    let best = -1e9;
    for (let t = 3.0; t <= 6.5; t += 0.25) { at(t, b); if (b[1] > best) { best = b[1]; d[1] = b[1]; d[2] = b[2]; } }
    const plume = WAVE.plume ? WAVE.plume(s) : 0;
    const impact = WAVE.lipImpact ? WAVE.lipImpact(s) : 0;
    data.set([a[1], a[2], dy / l, dz / l, (a[1] + c[1]) * 0.5, (a[2] + c[2]) * 0.5, s, white, d[1], d[2], plume, impact], i * 12);
  }
  return data;
}

// Unit primitives (pos + normal, 6 floats).
export function boxMesh() {
  const f = [
    [[1, 0, 0], [0, 1, 0], [0, 0, 1]], [[-1, 0, 0], [0, 1, 0], [0, 0, -1]],
    [[0, 1, 0], [0, 0, 1], [1, 0, 0]], [[0, -1, 0], [0, 0, -1], [1, 0, 0]],
    [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
  ];
  const v = [];
  for (const [n, u, w] of f) {
    const corner = (su, sw) => [n[0] * 0.5 + u[0] * su * 0.5 + w[0] * sw * 0.5, n[1] * 0.5 + u[1] * su * 0.5 + w[1] * sw * 0.5, n[2] * 0.5 + u[2] * su * 0.5 + w[2] * sw * 0.5];
    const c = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)];
    for (const k of [0, 1, 2, 0, 2, 3]) v.push(...c[k], ...n);
  }
  return new Float32Array(v);
}

export function sphereMesh(lat = 10, lon = 16) {
  const v = [];
  const pt = (i, j) => {
    const th = (i / lat) * Math.PI, ph = (j / lon) * Math.PI * 2;
    return [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)];
  };
  for (let i = 0; i < lat; i++) {
    for (let j = 0; j < lon; j++) {
      const a = pt(i, j), b = pt(i + 1, j), c = pt(i + 1, j + 1), d = pt(i, j + 1);
      for (const p of [a, c, b, a, d, c]) v.push(p[0] * 0.5, p[1] * 0.5, p[2] * 0.5, ...p);
    }
  }
  return new Float32Array(v);
}

// Surfboards, in board space: x along the board (+x = nose), y up, z across.
// Each is built in two pieces over [u0, u1] of the length (u = -1 tail .. +1
// nose) so the nose can be a different color. Each wave picks its board
// (`board` in the wave definition; the fish by default).
//   fish: short and wide, a fuller rounded nose, a wide swallowtail with a
//     notch, flat rocker, twin keel fins (1.6 m).
//   shortboard: a 6'6" (1.98 m) thruster for heavy barrels: narrower, a
//     pointed nose, a rounded pin tail, and much more rocker (a strong nose
//     kick and some tail lift) so it fits the curve of a steep face.
const clampU = (x) => Math.min(1, Math.max(0, x));
const planform = (W, a, b, uCut) => {
  let max = 0;
  for (let u = -1; u <= 1; u += 0.01) max = Math.max(max, Math.pow(1 - u, a) * Math.pow(1 + Math.max(u, uCut), b));
  return (u) => { const uu = Math.max(u, uCut); return (W * Math.pow(1 - uu, a) * Math.pow(1 + uu, b)) / max; };
};
export const BOARDS = {
  fish: {
    half: 0.8,
    width: planform(0.29, 0.45, 0.15, -0.97), // wide tail: cut off well before it narrows
    notch: 0.13, // swallowtail: how far the middle of the tail is cut in (m)
    rocker: (u) => 0.08 * Math.max(0, u - 0.35) ** 2 / 0.42 + 0.02 * Math.max(0, -u - 0.6) ** 2 / 0.16,
    thick: (u) => 0.034 * (1 - 0.55 * u * u),
    noseFrom: 0.6, // where the colored nose starts (u)
    stance: [-0.52, -0.02], // back and front foot (m from the middle)
    // fins: [along (m from the middle), across (m, + = rider's left), height, length]
    fins: [[-0.58, 0.17, 0.1, 0.2], [-0.58, -0.17, 0.1, 0.2]],
    stringer: [1.2, -0.12], // length, center
  },
  shortboard: {
    half: 0.99,
    width: planform(0.245, 0.62, 0.32, -0.985), // 19.5" wide, widest just behind the middle; pointed nose, narrow pin tail
    notch: 0,
    rocker: (u) => 0.045 * u * u + 0.13 * Math.max(0, u - 0.45) ** 2 / 0.3025 + 0.035 * Math.max(0, -u - 0.4) ** 2 / 0.36,
    thick: (u) => 0.031 * (1 - 0.6 * u * u),
    noseFrom: 0.72,
    stance: [-0.64, -0.08], // back foot over the fins
    fins: [[-0.72, 0.15, 0.11, 0.13], [-0.72, -0.15, 0.11, 0.13], [-0.88, 0, 0.11, 0.13]], // thruster
    stringer: [1.7, -0.05],
  },
  // A 9'0" noserider (Queens; was 9'6", the user had it shortened): 23" wide, a wide round nose
  // (for standing on it) and a squared tail, thick and flat with only a little nose kick (less than
  // before: a noserider wants a flat nose) and a little tail kick, one big fin. Seafoam with a turquoise rail (the user's pick).
  // faceTilt: on a steep face it sits mostly level with the wave-side rail cut in (surfer.js).
  longboard: {
    half: 1.37,
    width: planform(0.292, 0.22, 0.42, -0.95), // 23" wide; the nose stays wide (round), the tail squares off
    notch: 0,
    rocker: (u) => 0.012 * u * u + 0.055 * Math.max(0, u - 0.6) ** 2 / 0.16 + 0.04 * Math.max(0, -u - 0.75) ** 2 / 0.0625,
    thick: (u) => 0.07 * (1 - 0.45 * u * u),
    noseFrom: 0.88,
    stance: [-0.19, 0.17], // the middle spot: feet either side of the middle of the board, close together (36 cm; was 54: the user, 2026-11-18, a longboarder stands narrower)
    tailStance: [-1.0, -0.52], // the tail spot (pivots): back foot a little ahead of the fin, front foot close behind it (moved forward 0.1 m: the user felt she was slightly too far back)
    noseStance: [0.9, 1.23], // on the nose: back foot close behind, front toes over the nose (hang five; 33 cm apart, was 49)
    fins: [[-1.18, 0, 0.23, 0.26]], // single fin
    stringer: [2.55, 0],
    faceTilt: 0.35,
    rollK: 0.5, // half the rail roll of the shortboards in turns
    // Seafoam green with a turquoise border all the way round the edge (the user's pick; was pink).
    // `rail` draws the edge as its own band (boardMesh part 'rail'): the outer railS of the ring.
    colors: { deck: [0.62, 0.89, 0.76], nose: [0.62, 0.89, 0.76], rail: [0.0, 0.76, 0.8] },
    railS: 0.68, // the border: ring faces within asin(0.68) = 43 deg of the rail line (outer ~25% of each side from above)
  },
};
export const BOARD_HALF_LENGTH = BOARDS.fish.half;
// part: 'all', or 'body' / 'rail' to split off the edge band (shape.railS) so it can be its own color.
export function boardMesh(shape = BOARDS.fish, u0 = -1, u1 = 1, segs = 28, ring = 14, part = 'all') {
  const L = shape.half, width = shape.width, rocker = shape.rocker, thick = shape.thick;
  const NOTCH = shape.notch;
  const notchAt = (u, c) => NOTCH * clampU((-u - 0.82) / 0.18) * (1 - Math.abs(c));
  const pts = [];
  for (let i = 0; i <= segs; i++) {
    const u = u0 + (u1 - u0) * (i / segs);
    const w = Math.max(width(u), 0.004), y0 = rocker(u), th = thick(u);
    const row = [];
    for (let k = 0; k < ring; k++) {
      const a = (k / ring) * Math.PI * 2;
      const c = Math.cos(a), s = Math.sin(a);
      // Flatter deck and bottom, rounded rails.
      const sy = Math.sign(s) * Math.pow(Math.abs(s), 0.6);
      const p = [u * L + notchAt(u, c), y0 + th * sy, w * c];
      const n = [0, sy / th, c / w];
      const l = Math.hypot(...n);
      row.push([p, [n[0] / l, n[1] / l, n[2] / l]]);
    }
    pts.push(row);
  }
  const v = [];
  const push = ([p, n]) => v.push(...p, ...n);
  const keep = (k) => {
    if (part === 'all') return true;
    const isRail = Math.abs(Math.sin(((k + 0.5) / ring) * Math.PI * 2)) < shape.railS;
    return (part === 'rail') === isRail;
  };
  for (let i = 0; i < segs; i++) {
    for (let k = 0; k < ring; k++) {
      if (!keep(k)) continue;
      const a = pts[i][k], b = pts[i][(k + 1) % ring], c = pts[i + 1][k], d = pts[i + 1][(k + 1) % ring];
      push(a); push(c); push(b); push(b); push(c); push(d);
    }
  }
  // Cap the tail end (part of the border when there is one).
  if (u0 <= -1 && part !== 'body') {
    const row = pts[0], ctr = [u0 * L + NOTCH * 0.9, rocker(u0), 0];
    for (let k = 0; k < ring; k++) {
      push([ctr, [-1, 0, 0]]); push([row[(k + 1) % ring][0], [-1, 0, 0]]); push([row[k][0], [-1, 0, 0]]);
    }
  }
  return new Float32Array(v);
}

// Unit cylinder along y (-0.5..0.5), radius 0.5, smooth sides and flat caps.
// Used for the surfer's limbs and torso (joints are covered by spheres).
export function cylinderMesh(seg = 16) {
  const v = [];
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
    const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
    const P = (c, s, y) => [c * 0.5, y, s * 0.5];
    // side
    for (const [c, s, y] of [[c0, s0, -0.5], [c1, s1, 0.5], [c1, s1, -0.5], [c0, s0, -0.5], [c0, s0, 0.5], [c1, s1, 0.5]]) v.push(...P(c, s, y), c, 0, s);
    // caps
    for (const y of [-0.5, 0.5]) {
      const ny = Math.sign(y);
      for (const [c, s] of [[0, 0], [c0, s0], [c1, s1]]) v.push(c * 0.5, y, s * 0.5, 0, ny, 0);
    }
  }
  return new Float32Array(v);
}
