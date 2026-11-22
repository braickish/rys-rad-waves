// How a reef breaks, fast enough to redraw while you drag a block (the wave builder; the user, 2026-11-22).
// A port of research/reef-generator/peelrays.py (checked against FUNWAVE there: peel angle within ~2 deg for wedges up
// to 45 deg) plus the curl rule of curlline.py / the game (wave.js applyBar: the curl reaches a spot once everything
// behind it has broken).
//
// Rays start on the flat offshore strip, one every `spacing` m along the beach, all on one crest, and step together in
// time (so they keep tracing that crest). Direction by Snell's law in its local form (dtheta/ds = (sin th c_x - cos th
// c_y) / c); height H = H0 Ks Kr (shoaling from group speed, refraction from the spacing of neighbouring rays, capped
// where they cross); a ray breaks where H >= 0.78 h. Along the break line the peel angle alpha = asin(c / V_line): the
// break point runs along the line at the wave's speed / sin(alpha) (Hutt, Black & Mead 2001). Bands (approximate):
// 70-90 beginner, 50-70 intermediate, 30-50 advanced, < 30 expert, < 25 a closeout nobody can make.
// Ray theory knows nothing of diffraction and breaks once: a design tool; FUNWAVE is the check.
import { blur } from './reef.js';

const g = 9.81;
export const RAYS = { gamma: 0.78, closeout: 25, jump: 40, kw: 10, maxGap: 6, spacing: 2, dt: 0.2, tmax: 320, x0: 160 };

export const skillBand = (a) => (a < RAYS.closeout ? 'closeout' : a < 30 ? 'expert' : a < 50 ? 'advanced' : a < 70 ? 'intermediate' : 'beginner');

function kOf(h, T) {
  const w = 2 * Math.PI / T; h = Math.max(h, 0.05);
  let k = w * w / g / Math.sqrt(Math.tanh(w * w * h / g));
  for (let n = 0; n < 30; n++) { const th = Math.tanh(k * h); k -= (g * k * th - w * w) / (g * th + g * k * h / Math.cosh(k * h) ** 2); }
  return k;
}

// Trace one crest across the grid. swell: { H, T, dir } (dir: degrees off straight in, + from up-coast).
export function traceRays(grid, swell) {
  const { M, N, dx, x0: gx0, y0: gy0 } = grid;
  const hs = blur(grid.depth.map((d) => Math.max(d, 0.05)), M, N, 3 / dx); // (a little smoothing: rays hate grid noise)
  const T = swell.T, w = 2 * Math.PI / T;
  // celerity and group speed tables by depth
  const hMax = 30, nT = 600, hT = new Float32Array(nT), cT = new Float32Array(nT), cgT = new Float32Array(nT);
  for (let i = 0; i < nT; i++) {
    const h = 0.05 + (hMax - 0.05) * i / (nT - 1), k = kOf(h, T);
    hT[i] = h; cT[i] = w / k; cgT[i] = w / k * 0.5 * (1 + 2 * k * h / Math.sinh(2 * k * h));
  }
  const look = (tab, h) => { const u = Math.min(nT - 1, Math.max(0, (h - 0.05) / (hMax - 0.05) * (nT - 1))), i = Math.min(nT - 2, Math.floor(u)), f = u - i; return tab[i] + (tab[i + 1] - tab[i]) * f; };
  const C = new Float32Array(M * N);
  for (let q = 0; q < M * N; q++) C[q] = look(cT, hs[q]);
  const Cx = new Float32Array(M * N), Cy = new Float32Array(M * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < M; i++) {
    const q = j * M + i;
    Cx[q] = (C[j * M + Math.min(M - 1, i + 1)] - C[j * M + Math.max(0, i - 1)]) / ((Math.min(M - 1, i + 1) - Math.max(0, i - 1)) * dx);
    Cy[q] = (C[Math.min(N - 1, j + 1) * M + i] - C[Math.max(0, j - 1) * M + i]) / ((Math.min(N - 1, j + 1) - Math.max(0, j - 1)) * dx);
  }
  // bilinear sample at (x', y') in metres (cell centres at +0.5)
  const samp = (F, x, y) => {
    let u = (x - gx0) / dx - 0.5, v = (y - gy0) / dx - 0.5;
    u = Math.min(M - 1.001, Math.max(0, u)); v = Math.min(N - 1.001, Math.max(0, v));
    const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j, q = j * M + i;
    return (F[q] * (1 - fu) + F[q + 1] * fu) * (1 - fv) + (F[q + M] * (1 - fu) + F[q + M + 1] * fu) * fv;
  };
  const sp = RAYS.spacing, n = Math.floor((N * dx) / sp), th0 = -swell.dir * Math.PI / 180; // (peelrays: theta0 = -dir)
  const x = new Float64Array(n), y = new Float64Array(n), th = new Float64Array(n), alive = new Uint8Array(n).fill(1);
  const tb = new Float64Array(n).fill(NaN), xb = new Float64Array(n).fill(NaN), yb = new Float64Array(n).fill(NaN);
  const hb = new Float64Array(n).fill(NaN), Hb = new Float64Array(n).fill(NaN), cb = new Float64Array(n).fill(NaN);
  for (let r = 0; r < n; r++) { x[r] = RAYS.x0; y[r] = gy0 + (r + 0.5) * sp; th[r] = th0; }
  const cg0 = look(cgT, samp(hs, RAYS.x0, y[0])), b0 = sp * Math.cos(th0), kw = Math.max(1, Math.round(RAYS.kw / sp));
  const H = new Float64Array(n), crests = [];
  let t = 0, nAlive = n, step = 0;
  while (t < RAYS.tmax && nAlive > 0) {
    for (let r = 0; r < n; r++) {
      if (!alive[r]) continue;
      const ip = Math.min(n - 1, r + kw), im = Math.max(0, r - kw);
      const b = Math.hypot(x[ip] - x[im], y[ip] - y[im]) / Math.max(ip - im, 1);
      const Kr = Math.sqrt(Math.min(6.25, Math.max(0, b0 / Math.max(b, 1e-3))));
      const h = samp(hs, x[r], y[r]);
      H[r] = swell.H * Math.sqrt(cg0 / look(cgT, h)) * Kr;
      if (H[r] >= RAYS.gamma * h || h < 0.3) { tb[r] = t; xb[r] = x[r]; yb[r] = y[r]; hb[r] = h; Hb[r] = H[r]; cb[r] = samp(C, x[r], y[r]); alive[r] = 0; nAlive--; }
    }
    if (step % 25 === 0) crests.push({ t, x: Float32Array.from(x), y: Float32Array.from(y), alive: Uint8Array.from(alive) }); // (every 5 s: the crest lines)
    for (let r = 0; r < n; r++) {
      if (!alive[r]) continue;
      const c = samp(C, x[r], y[r]), cx = samp(Cx, x[r], y[r]), cy = samp(Cy, x[r], y[r]);
      th[r] += RAYS.dt * (Math.sin(th[r]) * cx - Math.cos(th[r]) * cy);
      x[r] += RAYS.dt * c * Math.cos(th[r]); y[r] += RAYS.dt * c * Math.sin(th[r]);
      if (x[r] <= gx0 || x[r] >= gx0 + M * dx - dx || y[r] <= gy0 || y[r] >= gy0 + N * dx - dx) { alive[r] = 0; nAlive--; }
    }
    t += RAYS.dt; step++;
  }
  return { tb, xb, yb, hb, Hb, cb, crests, n };
}

// When each 4 m strip along the reef first breaks (5-strip running median), then from the earliest spot (the peak) both
// ways: the curl's path, peel angle per 20 m, and where the ride ends (peelrays.peel). Each side's points get the time
// the curl reaches them (the running max: a stretch that broke before the curl got there is crossed at once) and a
// kind for drawing: 'ride', 'section' (fast but makeable, 25-30 deg), 'closeout' (< 25 deg twice in a row: where the
// ride ends), 'backoff' (the wave backs off: slower than 70 deg, or a gap where it doesn't break).
export function analyse(R, grid, { binM = 4, step = 20 } = {}) {
  const yLo = grid.y0 + grid.edge + 10, yHi = grid.y0 + grid.N * grid.dx - grid.edge - 10;
  const strips = [];
  for (let e = yLo; e < yHi; e += binM) {
    let best = -1;
    for (let r = 0; r < R.n; r++) if (R.hb[r] > 0.4 && R.yb[r] >= e && R.yb[r] < e + binM && (best < 0 || R.tb[r] < R.tb[best])) best = r;
    strips.push(best < 0 ? [e + binM / 2, NaN, NaN, NaN, NaN] : [e + binM / 2, R.tb[best], R.xb[best], R.cb[best], R.Hb[best]]);
  }
  for (let col = 1; col <= 4; col++) { // (running median over 5 strips: where rays cross a strip breaks a second or two off)
    const v = strips.map((s) => s[col]);
    for (let i = 0; i < v.length; i++) {
      if (!isFinite(v[i])) continue;
      const wv = v.slice(Math.max(0, i - 2), i + 3).filter(isFinite).sort((a, b) => a - b);
      strips[i][col] = wv[Math.floor(wv.length / 2)];
    }
  }
  let ip = -1; for (let i = 0; i < strips.length; i++) if (isFinite(strips[i][1]) && (ip < 0 || strips[i][1] < strips[ip][1])) ip = i;
  if (ip < 0) return null;
  const out = { peak: { x: strips[ip][2], y: strips[ip][0], t: strips[ip][1] } };
  for (const [side, d] of [['right', -1], ['left', 1]]) {
    const pts = [strips[ip]], gaps = []; let j = ip, gap = 0, end = 'reef';
    while (j + d >= 0 && j + d < strips.length) {
      j += d; const q = strips[j];
      if (!isFinite(q[1])) { gap++; if (gap > RAYS.maxGap) { end = 'backs off'; break; } continue; }
      const pr = pts[pts.length - 1];
      if (Math.abs(q[2] - pr[2]) > RAYS.jump * (1 + gap)) { end = 'reaches the end of the reef'; break; }
      if (q[1] < pr[1] - 1.5) { end = 'meets water breaking the other way'; break; }
      if (gap) gaps.push(pts.length); // (a short gap the curl jumps: a back-off)
      pts.push(q); gap = 0;
    }
    // distance along the break line, peel angle per `step` m
    const s = [0]; for (let k = 1; k < pts.length; k++) s.push(s[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][2] - pts[k - 1][2]));
    const segs = [];
    for (let e0 = 0; e0 < s[s.length - 1]; e0 += step) {
      const idx = []; for (let k = 0; k < pts.length; k++) if (s[k] >= e0 && s[k] <= e0 + step) idx.push(k);
      if (idx.length < 3) continue;
      const mx = idx.reduce((a, k) => a + s[k], 0) / idx.length, my = idx.reduce((a, k) => a + pts[k][1], 0) / idx.length;
      let sxy = 0, sxx = 0; for (const k of idx) { sxy += (s[k] - mx) * (pts[k][1] - my); sxx += (s[k] - mx) ** 2; }
      const sl = sxx > 0 ? sxy / sxx : 0, cm = idx.reduce((a, k) => a + pts[k][3], 0) / idx.length;
      const a = sl <= 0 ? 0 : Math.asin(Math.min(1, cm * sl)) * 180 / Math.PI;
      segs.push({ e0, a, H: idx.reduce((q, k) => q + pts[k][4], 0) / idx.length });
    }
    // the ride: from the peak until two stretches in a row break faster than anyone can surf (one alone is a section the
    // curl runs through); the takeoff stretch doesn't count
    let ride = 0, bad = 0, closed = false;
    for (const sg of segs) {
      bad = sg.a < RAYS.closeout && sg.e0 >= step ? bad + 1 : 0;
      if (bad >= 2) { ride = sg.e0 - step; closed = true; break; }
      ride = sg.e0 + step;
    }
    ride = Math.min(ride, s[s.length - 1]);
    if (closed) end = 'closes out';
    // the curl along the line: time = running max of break times; kind per point
    let tc = -Infinity;
    const curl = pts.map((p, k) => {
      tc = Math.max(tc, p[1]);
      const sg = segs.find((q) => s[k] >= q.e0 && s[k] <= q.e0 + step) || segs[segs.length - 1];
      let kind = 'ride';
      if (s[k] > ride && closed) kind = 'closeout';
      else if (gaps.includes(k) || (sg && sg.a > 70 && s[k] > step)) kind = 'backoff';
      else if (sg && sg.a < 30 && s[k] > step) kind = 'section';
      return { x: p[2], y: p[0], t: tc, s: s[k], H: p[4], c: p[3], kind }; // (c: the wave's speed at breaking there)
    });
    const inRide = segs.filter((q) => q.e0 < ride && q.e0 >= step).map((q) => q.a).sort((a, b) => a - b);
    const med = inRide.length ? inRide[Math.floor(inRide.length / 2)] : NaN;
    const Hs = segs.filter((q) => q.e0 < ride).map((q) => q.H).sort((a, b) => a - b);
    out[side] = { curl, segs, ride, line: s[s.length - 1], peel: med, band: isFinite(med) ? skillBand(med) : '-', H: Hs.length ? Hs[Math.floor(Hs.length / 2)] : NaN, end, seconds: curl.length ? curl[curl.length - 1].t - curl[0].t : 0 };
  }
  return out;
}
