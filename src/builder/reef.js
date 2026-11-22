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
      if (u > L) d = c.end_depth_m - (u - L) * bay.offDepth / (bay.shoreX - bay.flatTo);
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
export const defaultCoast = (bay = BAY) => ({ face: 66.7, pts: [0.08, 0.31, 0.54, 0.77, 0.92].map((f) => [bay.shoreX, bay.view.y0 + (bay.view.y1 - bay.view.y0) * f]) }); // (handles inside the bay, the line running on past them)
function coastDepth(n, face) {
  if (n <= 0) return Math.max(-COAST.dune, n / COAST.outer); // (up the beach)
  const nf = COAST.faceDepth * face;
  return n <= nf ? n / face : COAST.faceDepth + (n - nf) / COAST.outer;
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

export function buildDepth(components, grid = makeGrid(), coast = null) {
  const { M, N, dx, x0, y0, offDepth, flatTo, shoreX } = grid;
  const baseSlope = offDepth / (shoreX - flatTo);
  const baseAt = coast ? (x, y) => Math.min(offDepth, coastDepth(coastDist(coast.pts, x, y), coast.face)) : (x) => offDepth - baseSlope * Math.max(0, x - flatTo);
  const baseGrid = new Float32Array(M * N);
  let depth = new Float32Array(M * N);
  const shallow = components.filter((c) => c.type !== 'channel'), chans = components.filter((c) => c.type === 'channel');
  for (let j = 0; j < N; j++) {
    const y = y0 + (j + 0.5) * dx;
    for (let i = 0; i < M; i++) {
      const x = x0 + (i + 0.5) * dx;
      const base = baseAt(x, y); baseGrid[j * M + i] = base;
      let d = base;
      for (const c of shallow) d = Math.min(d, compDepth(c, x, y, base, grid));
      for (const c of chans) { // (channels deepen: along a polyline, `depth_m` across `width_m`, easing out over `fade_m`)
        const mm = 1 - smooth01((polyDist(c.points, x, y) - c.width_m / 2) / (c.fade_m ?? 20));
        d = Math.max(d, d + mm * Math.max(0, c.depth_m - d));
      }
      depth[j * M + i] = d;
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
  return grid;
}
