// Reef builder: recipe components -> a depth grid (the user, 2026-11-22: build breaks from snap-together blocks).
// A port of research/reef-generator/reefgen.py (Mead & Black's surf-reef components), on a cropped bay for speed.
// Frame as reefgen and the FUNWAVE runs: x' runs straight in toward the beach (offshore = small x'), y' along the beach
// (+ up-coast); a right (surfer facing the beach) peels toward -y'. Depth in metres, positive below the water.
//
// The seabed is the shallowest of a base slope and the components (each a full depth surface faded into the base by a
// soft footprint, so it only ever makes the bottom shallower), then channels (the only part that deepens), then a
// Gaussian smoothing over `blend` m so seams don't make false ledges, a flat strip offshore, and the side edges eased to
// the along-shore mean.

export const slopeOf = (s) => (typeof s === 'number' ? s : (([a, b]) => Number(a) / Number(b))(s.split(':')));
const smooth01 = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
const band = (u, a, b, fade) => smooth01((u - a) / fade + 1) * smooth01((b - u) / fade + 1);

// The bay: x' from x0 to x1, y' from y0 to y1 (m), cells of dx m.
// (the model runs 300 m wider each side than the map shows, `view`: with an angled swell many waves come in from beyond the
// map's sides, and copying its edge rows outward bent them wrong before they got there)
export const BAY_DEEP_OFF = 25; // (deep offshore water: makeGrid({ ...BAY, offDepth: BAY_DEEP_OFF }))
export const BAY = { view: { y0: 120, y1: 920 }, x0: 150, x1: 1262, y0: -180, y1: 1220, dx: 4, offDepth: 15, flatTo: 250, shoreX: 1250, edge: 60, blend: 4 };

export function makeGrid(bay = BAY) {
  const M = Math.round((bay.x1 - bay.x0) / bay.dx), N = Math.round((bay.y1 - bay.y0) / bay.dx);
  return { ...bay, M, N, depth: new Float32Array(M * N) }; // (row-major: index = j * M + i, j along y', i along x')
}

// One component's depth at (x, y), given the base depth there (returns the base where it doesn't reach).
function compDepth(c, x, y, base, bay) {
  const fade = c.fade_m ?? 40;
  let d, m;
  switch (c.type) {
    case 'ramp': {
      const h = (c.heading_deg || 0) * Math.PI / 180, cy = c.center_y_m ?? (bay.y0 + bay.y1) / 2;
      const dxp = x - c.x0_m, dyp = y - cy, u = dxp * Math.cos(h) + dyp * Math.sin(h), v = -dxp * Math.sin(h) + dyp * Math.cos(h);
      const L = c.length_m, a = Math.min(1, Math.max(0, u / L));
      d = c.start_depth_m + (c.end_depth_m - c.start_depth_m) * a;
      // (past its end it shoals on to the beach at shoreX; the bay floor with a coastline holds its depth there instead and
      // the coast's own profile takes it in (the user, 2026-11-27: the slope options did nothing: this ramp, 1:66.7 on in,
      // was shallower than a steeper beach face everywhere but the waterline); the default 1:66.7 beach is shallower than
      // either, so it's the same floor)
      if (u > L) d = c.floor && bay.coastFloor ? c.end_depth_m : c.end_depth_m - (u - L) * bay.offDepth / (bay.shoreX - bay.flatTo);
      const w = c.width_m ?? 1e9;
      m = band(u, 0, 1e9, fade) * band(v, -w / 2, w / 2, fade);
      break;
    }
    case 'focus': {
      const u = x - c.apex[0], v = y - c.apex[1], w = c.width_m, k = c.convexity ?? 0.5, r0 = c.tip_radius_m ?? 20;
      const off = Math.max(0, -u + 1.5 * k * (Math.sqrt(v * v + r0 * r0) - r0));
      d = c.depth_m + slopeOf(c.gradient ?? '1:20') * off;
      m = band(v, -w / 2, w / 2, fade) * band(u, -1e9, c.back_m ?? w / 2, fade);
      break;
    }
    case 'wedge': case 'ledge': {
      const a = c.angle_to_swell_deg * Math.PI / 180, sd = c.side;
      const tv = [Math.sin(a), sd * Math.cos(a)], nv = [-Math.cos(a), sd * Math.sin(a)];
      const dX = x - c.start[0], dY = y - c.start[1];
      const sAlong = dX * tv[0] + dY * tv[1], sOff = dX * nv[0] + dY * nv[1];
      let reach;
      if (c.type === 'wedge') {
        const dLine = c.depth_m + ((c.end_depth_m ?? c.depth_m) - c.depth_m) * Math.min(1, Math.max(0, sAlong / c.length_m));
        d = Math.max(c.top_depth_m ?? 0.8, dLine + slopeOf(c.gradient) * sOff);
        reach = c.width_m ?? 200;
      } else {
        const top = c.depth_m, face = slopeOf(c.face ?? '1:3');
        d = Math.max(top, top + face * sOff);
        d = Math.min(d, top + c.step_m + slopeOf(c.gradient ?? '1:30') * Math.max(0, sOff - c.step_m / face));
        reach = c.width_m ?? 150;
      }
      m = band(sAlong, 0, c.length_m, fade) * band(sOff, -(c.back_m ?? 150), reach, fade);
      m *= smooth01(sd * dY / 20 + 1); // (only on its own side of the peak)
      break;
    }
    case 'ridge': {
      const dist = polyDist(c.points, x, y);
      d = c.depth_m + (base - c.depth_m) * smooth01(dist / c.width_m); m = 1;
      break;
    }
    case 'bar': { // (a sandbar, plan step 6: a long gentle mound of sand, Mead & Black's elongated platform / broad ridge on a
      // ramp: `depth_m` along its crest line `points`, falling away 1:`slope` to either side and off its rounded ends)
      const dist = polyDist(c.points, x, y);
      d = c.depth_m + slopeOf(c.slope ?? '1:40') * dist; m = 1;
      break;
    }
    case 'pinnacle': {
      const r = Math.hypot(x - c.center[0], y - c.center[1]);
      d = c.depth_m + (base - c.depth_m) * smooth01(r / c.radius_m); m = 1;
      break;
    }
    case 'platform': {
      const h = (c.rotation_deg || 0) * Math.PI / 180, dxp = x - c.center[0], dyp = y - c.center[1];
      const u = dxp * Math.cos(h) + dyp * Math.sin(h), v = -dxp * Math.sin(h) + dyp * Math.cos(h);
      d = c.depth_m - slopeOf(c.slope ?? 0) * u;
      m = band(u, -c.size[0] / 2, c.size[0] / 2, fade) * band(v, -c.size[1] / 2, c.size[1] / 2, fade);
      break;
    }
    default: return base;
  }
  d = Math.min(d, base);
  return base + m * (d - base);
}
// Deep water in front (the user, 2026-11-28: a ledge near the beach rose from a shallow floor, so a big swell's sets broke
// on the floor before reaching it): a peak's or an arm's face carries on down to `front_m` instead of stopping at the
// floor, then deep water runs `front_w` m out from its foot, easing back to the floor over `front_fade` m. It deepens the
// floor before the reef pieces go on it (so it never cuts into a reef), and eases out near the shore (where the floor is
// under ~2-5 m: the beach stays). Returns { t: the depth there, w: how much it applies } or null.
function frontAt(c, x, y) {
  const D = c.front_m, gr = slopeOf(c.gradient ?? '1:10');
  let off, d0, wa;
  if (c.type === 'focus') {
    const u = x - c.apex[0], v = y - c.apex[1], k = c.convexity ?? 0.5, r0 = c.tip_radius_m ?? 20;
    off = -u + 1.5 * k * (Math.sqrt(v * v + r0 * r0) - r0); d0 = c.depth_m; wa = band(v, -c.width_m / 2, c.width_m / 2, c.fade_m ?? 40);
  } else if (c.type === 'wedge') {
    const a = c.angle_to_swell_deg * Math.PI / 180, sd = c.side, dX = x - c.start[0], dY = y - c.start[1];
    const sAlong = dX * Math.sin(a) + dY * sd * Math.cos(a);
    off = -dX * Math.cos(a) + dY * sd * Math.sin(a);
    d0 = c.depth_m + ((c.end_depth_m ?? c.depth_m) - c.depth_m) * Math.min(1, Math.max(0, sAlong / c.length_m));
    wa = band(sAlong, 0, c.length_m, c.fade_m ?? 40) * smooth01(sd * dY / 20 + 1);
  } else return null;
  if (off <= 0 || wa <= 0) return null;
  const run = Math.max(0, (D - d0) / gr), wo = 1 - smooth01((off - run - (c.front_w ?? 40)) / (c.front_fade ?? 30));
  return wo > 0 ? { t: Math.min(D, d0 + gr * off), w: wa * wo } : null;
}
function withFronts(fronts, x, y, d, base) {
  const shore = smooth01((base - 2) / 3);
  if (shore <= 0) return d;
  for (const c of fronts) { const f = frontAt(c, x, y); if (f && f.t > d) d += shore * f.w * (f.t - d); }
  return d;
}
function polyDist(P, x, y) {
  let best = Infinity;
  for (let k = 0; k + 1 < P.length; k++) {
    const [px, py] = P[k], ex = P[k + 1][0] - px, ey = P[k + 1][1] - py, l2 = ex * ex + ey * ey || 1e-9;
    const t = Math.min(1, Math.max(0, ((x - px) * ex + (y - py) * ey) / l2));
    best = Math.min(best, Math.hypot(x - px - t * ex, y - py - t * ey));
  }
  return best;
}

// Separable Gaussian blur (sigma in cells), edges clamped (scipy's mode='nearest').
export function blur(src, M, N, sigma) {
  if (sigma <= 0.01) return src;
  const r = Math.ceil(sigma * 4), k = new Float32Array(2 * r + 1); let s = 0;
  for (let i = -r; i <= r; i++) { k[i + r] = Math.exp(-0.5 * (i / sigma) ** 2); s += k[i + r]; }
  for (let i = 0; i < k.length; i++) k[i] /= s;
  const tmp = new Float32Array(M * N), out = new Float32Array(M * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < M; i++) {
    let a = 0; for (let q = -r; q <= r; q++) a += k[q + r] * src[j * M + Math.min(M - 1, Math.max(0, i + q))];
    tmp[j * M + i] = a;
  }
  for (let j = 0; j < N; j++) for (let i = 0; i < M; i++) {
    let a = 0; for (let q = -r; q <= r; q++) a += k[q + r] * tmp[Math.min(N - 1, Math.max(0, j + q)) * M + i];
    out[j * M + i] = a;
  }
  return out;
}

// Build the seabed for a list of components (reefgen's `components`).
// The coastline (plan step 5; the user, 2026-11-22: long sandy shores like Skeleton Bay, where the whole sloping shore is the
// "sandbar"; in Mead & Black's terms one long wedge on a ramp; research/reef-generator's `shore` component): the waterline as
// a polyline of points [x', y'] (sorted along y'), and the beach face's slope 1:`face` down to 5 m, then 1:66.7 (the bay's
// own slope) beyond. The bay's floor is then the coast's profile by distance from that line (offshore +). The default, a
// straight line at x' 1250 with face 66.7, is exactly the old floor (15 m at x' 250 shoaling 1:66.7 to the beach at 1250).
export const COAST = { face: 66.7, faceDepth: 5, outer: 66.7, dune: 2.5 };
// (the coastline's handles: five across the bay as first shown, and two more toward each end of the water the zoomed-out map shows
// (the user, 2026-11-27: control the coast the whole length); the line runs on straight past the last ones)
const COAST_F = [0.08, 0.31, 0.54, 0.77, 0.92];
const coastEnds = (bay = BAY) => [bay.y0 + bay.edge + 30, bay.y0 + bay.edge + 160, bay.y1 - bay.edge - 160, bay.y1 - bay.edge - 30]; // (-90, 40 ... 1000, 1130 on BAY)
export const defaultCoast = (bay = BAY) => {
  const [a, b, c, d] = coastEnds(bay), mid = COAST_F.map((f) => bay.view.y0 + (bay.view.y1 - bay.view.y0) * f);
  return { face: 66.7, pts: [a, b, ...mid, c, d].map((y) => [bay.shoreX, y]) };
};
// (a coast saved before the extra handles (five, all inside the first view): the extra ones added on the line as it already ran,
// straight on past its end handles, so its shape doesn't change)
export function extendCoast(coast, bay = BAY) {
  if (!coast || !Array.isArray(coast.pts) || coast.pts.length < 2) return coast;
  const P = coast.pts.slice().sort((p, q) => p[1] - q[1]), n = P.length, lo = P[0][1], hi = P[n - 1][1];
  const on = (y) => { const [A, B] = y < lo ? [P[0], P[1]] : [P[n - 2], P[n - 1]]; return A[0] + (B[0] - A[0]) * (y - A[1]) / ((B[1] - A[1]) || 1e-9); };
  const add = coastEnds(bay).filter((y) => y < lo - 60 || y > hi + 60).map((y) => [on(y), y]);
  return add.length ? { ...coast, pts: [...add, ...P].sort((p, q) => p[1] - q[1]) } : coast;
}
// (deep offshore water: past the beach face the bottom drops away 1:25 instead of 1:66.7, deep water close in, as at
// Pipeline, where the reef rises out of ~15-20 m a couple of hundred metres out; on the gentle slope a big swell broke all
// the way across the bay on the straight contours)
function coastDepth(n, face, deep) {
  const outer = deep ? 25 : COAST.outer;
  if (n <= 0) return Math.max(-COAST.dune, n / COAST.outer); // (up the beach)
  const nf = COAST.faceDepth * face;
  return n <= nf ? n / face : COAST.faceDepth + (n - nf) / outer;
}
// Signed distance from the coastline: + offshore (smaller x' than the line at that y'), - on the beach. The line runs on
// straight past its end points.
function coastDist(pts, x, y) {
  const P = pts.slice().sort((a, b) => a[1] - b[1]), n = P.length;
  const ext = [[P[0][0] - (P[1][0] - P[0][0]) * 50, P[0][1] - (P[1][1] - P[0][1]) * 50], ...P, [P[n - 1][0] + (P[n - 1][0] - P[n - 2][0]) * 50, P[n - 1][1] + (P[n - 1][1] - P[n - 2][1]) * 50]];
  let best = Infinity, lineX = ext[0][0];
  for (let k = 0; k + 1 < ext.length; k++) {
    const [ax, ay] = ext[k], [bx, by] = ext[k + 1], ex = bx - ax, ey = by - ay, l2 = ex * ex + ey * ey || 1e-9;
    const t = Math.min(1, Math.max(0, ((x - ax) * ex + (y - ay) * ey) / l2));
    best = Math.min(best, Math.hypot(x - ax - t * ex, y - ay - t * ey));
    if (y >= ay && y <= by) lineX = ax + (bx - ax) * ((y - ay) / (by - ay || 1e-9));
  }
  return x <= lineX ? best : -best;
}

// The distance offshore that sets the depth, smoothed more the farther out (the user, 2026-11-27: a diagonal beach meeting a
// straight one turned every deeper band hard at the corner): the nearest distance to a bent line has a sharp corner on the
// water side of every bend at any distance, but a real bottom's contours straighten out offshore. So the distance is blurred,
// over ~COAST_SMOOTH x itself (a band 400 m out over ~160 m): the bands next to the beach follow it, the deep ones round off
// and ease from one run of beach to the next. A straight beach's distance is linear, which a blur leaves as it is: unchanged.
const COAST_SMOOTH = 0.4, SM_CELL = 20, SM_SIG = [0, 25, 50, 100, 200, 400];
function smoothCoastDist(pts, grid) {
  const pad = 4 * SM_SIG[SM_SIG.length - 1], X0 = grid.x0 - pad, Y0 = grid.y0 - pad;
  const W = Math.ceil((grid.M * grid.dx + 2 * pad) / SM_CELL) + 1, H = Math.ceil((grid.N * grid.dx + 2 * pad) / SM_CELL) + 1;
  const raw = new Float32Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) raw[j * W + i] = coastDist(pts, X0 + i * SM_CELL, Y0 + j * SM_CELL);
  const levels = SM_SIG.map((s) => (s ? blur(raw, W, H, s / SM_CELL) : raw));
  const sample = (L, x, y) => {
    const fi = (x - X0) / SM_CELL, fj = (y - Y0) / SM_CELL, i = Math.min(W - 2, Math.max(0, Math.floor(fi))), j = Math.min(H - 2, Math.max(0, Math.floor(fj)));
    const a = fi - i, b = fj - j, k = j * W + i;
    return (L[k] * (1 - a) + L[k + 1] * a) * (1 - b) + (L[k + W] * (1 - a) + L[k + W + 1] * a) * b;
  };
  return (x, y) => {
    const n = coastDist(pts, x, y);
    if (n <= 0) return n; // (up the beach: as it is)
    const s = Math.min(SM_SIG[SM_SIG.length - 1], COAST_SMOOTH * n);
    let l = 0; while (l + 2 < SM_SIG.length && s > SM_SIG[l + 1]) l++;
    const t = (s - SM_SIG[l]) / (SM_SIG[l + 1] - SM_SIG[l]);
    const lo = l ? sample(levels[l], x, y) : n, hi = sample(levels[l + 1], x, y);
    return Math.max(0, lo + (hi - lo) * t); // (still offshore: the waterline stays where it's drawn)
  };
}

export function buildDepth(components, grid = makeGrid(), coast = null) {
  const { M, N, dx, x0, y0, offDepth, flatTo, shoreX } = grid;
  const baseSlope = offDepth / (shoreX - flatTo);
  const cd = coast && smoothCoastDist(coast.pts, grid), fgrid = coast ? { ...grid, coastFloor: true } : grid;
  const baseAt = coast ? (x, y, n) => Math.min(offDepth, coastDepth(n, coast.face, !!coast.deep)) : (x) => offDepth - baseSlope * Math.max(0, x - flatTo);
  const baseGrid = new Float32Array(M * N), floorGrid = new Float32Array(M * N);
  let depth = new Float32Array(M * N);
  const shallow = components.filter((c) => c.type !== 'channel'), chans = components.filter((c) => c.type === 'channel');
  const floors = shallow.filter((c) => c.floor), pieces = shallow.filter((c) => !c.floor), fronts = shallow.filter((c) => c.front_m > 0);
  for (let j = 0; j < N; j++) {
    const y = y0 + (j + 0.5) * dx;
    for (let i = 0; i < M; i++) {
      const x = x0 + (i + 0.5) * dx;
      const n = cd ? cd(x, y) : 0, base = baseAt(x, y, n); baseGrid[j * M + i] = base;
      // (the bay floor's ramp, with a coastline: by distance from it, as if the beach were at shoreX (the user, 2026-11-27:
      // moving the beach left the floor's bands straight across the bay where it had been, turning hard into the coast's);
      // the default beach is at shoreX, so it's the same there)
      const fx = cd ? shoreX - n : x;
      let d = base;
      for (const c of floors) d = Math.min(d, compDepth(c, fx, y, base, fgrid));
      floorGrid[j * M + i] = d; // (the smooth part: the coast and the bay floor, for fineDepthAt)
      const df = fronts.length ? withFronts(fronts, x, y, d, base) : d, pb = df > d ? Math.max(base, df) : base; // (deep water in front: the floor deepened first)
      d = df;
      for (const c of pieces) d = Math.min(d, compDepth(c, x, y, pb, fgrid));
      depth[j * M + i] = withChannels(chans, x, y, d);
    }
  }
  depth = blur(depth, M, N, grid.blend / dx);
  // flat offshore strip, eased in; side edges eased to the along-shore mean
  // (with a coastline: the reef's part (depth - the coast's floor) is eased to its along-shore mean at the sides, so a bent
  // coast stays bent to the edge; for a straight coast this is the same as before)
  const bg = coast ? blur(baseGrid, M, N, grid.blend / dx) : null;
  const mean = new Float32Array(M);
  for (let i = 0; i < M; i++) { let a = 0; for (let j = 0; j < N; j++) a += depth[j * M + i] - (bg ? bg[j * M + i] : 0); mean[i] = a / N; }
  for (let j = 0; j < N; j++) {
    const y = (j + 0.5) * dx, e = grid.edge > 0 ? smooth01(Math.min(y, N * dx - y) / grid.edge) : 1;
    for (let i = 0; i < M; i++) {
      const x = x0 + (i + 0.5) * dx, w = smooth01(x / flatTo);
      let d = offDepth * (1 - w) + depth[j * M + i] * w;
      const mw = offDepth * (1 - w) + (mean[i] + (bg ? bg[j * M + i] : 0)) * w;
      depth[j * M + i] = mw * (1 - e) + d * e;
    }
  }
  grid.depth = depth;
  grid.fine = { baseGrid, floorGrid, pieces, fronts, chans, fgrid }; // (fineDepthAt)
  return grid;
}
// (channels deepen: along a polyline, `depth_m` across `width_m`, easing out over `fade_m`)
function withChannels(chans, x, y, d) {
  for (const c of chans) {
    const mm = 1 - smooth01((polyDist(c.points, x, y) - c.width_m / 2) / (c.fade_m ?? 20));
    d = Math.max(d, d + mm * Math.max(0, c.depth_m - d));
  }
  return d;
}

// The depth at any point, finer than the grid (the user, 2026-11-28: the map drawn at 1 m, the model staying at 4 m): the
// reef pieces worked out right there, on the coast and bay floor read off the grid (they're smooth, so in between cells
// is as good). Exact for a grid built without smoothing (blend 0: Sharp edges); in the offshore strip and the side margins
// (eased afterwards) it reads the grid's own depth.
export function fineDepthAt(grid) {
  const { M, N, dx, x0, y0, flatTo, edge, depth } = grid, { baseGrid, floorGrid, pieces, fronts = [], chans, fgrid } = grid.fine;
  const lerp = (A, x, y) => {
    const fi = Math.min(M - 1.001, Math.max(0, (x - x0) / dx - 0.5)), fj = Math.min(N - 1.001, Math.max(0, (y - y0) / dx - 0.5));
    const i = Math.floor(fi), j = Math.floor(fj), ti = fi - i, tj = fj - j, k = j * M + i;
    return (A[k] * (1 - ti) + A[k + 1] * ti) * (1 - tj) + (A[k + M] * (1 - ti) + A[k + M + 1] * ti) * tj;
  };
  const yLo = y0 + edge, yHi = y0 + N * dx - edge;
  return (x, y) => {
    if (x < flatTo || y < yLo || y > yHi) return lerp(depth, x, y); // (as buildDepth eases them: x < flatTo, the side margins)
    const base = lerp(baseGrid, x, y), d0 = lerp(floorGrid, x, y);
    let d = fronts.length ? withFronts(fronts, x, y, d0, base) : d0;
    const pb = d > d0 ? Math.max(base, d) : base;
    for (const c of pieces) d = Math.min(d, compDepth(c, x, y, pb, fgrid));
    return withChannels(chans, x, y, d);
  };
}
