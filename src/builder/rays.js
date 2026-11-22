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

// How it breaks, by the surf-similarity number xi0 = tan(beta) / sqrt(H0 / L0) (Iribarren; Battjes 1974: spilling < 0.5,
// plunging 0.5-3.3, surging above). Mead & Black (2001) tie reef breaking intensity to the same seabed slope along the
// wave's path. Within plunging our split (provisional, to tune against shapes in steps 3-5 of the plan): steep (a mild
// plunge) to 0.9, pitching to 1.5, barrelling above.
export const BREAK_TYPES = [[0.5, 'crumbly'], [0.9, 'steep'], [1.5, 'pitching'], [Infinity, 'barrelling']];
export const breakType = (xi) => BREAK_TYPES.find(([lim]) => xi < lim)[1];
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
  // the seabed's gradient (depth smoothed over 4 m, as research/reef-generator's ray_zone.py), for the slope the wave
  // breaks on (breaking intensity)
  const h4 = blur(grid.depth.map((d) => Math.max(d, 0.05)), M, N, 4 / dx), Hx = new Float32Array(M * N), Hy = new Float32Array(M * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < M; i++) {
    const i0 = Math.max(0, i - 1), i1 = Math.min(M - 1, i + 1), j0 = Math.max(0, j - 1), j1 = Math.min(N - 1, j + 1);
    Hx[j * M + i] = (h4[j * M + i1] - h4[j * M + i0]) / ((i1 - i0) * dx);
    Hy[j * M + i] = (h4[j1 * M + i] - h4[j0 * M + i]) / ((j1 - j0) * dx);
  }
  // bilinear sample at (x', y') in metres (cell centres at +0.5)
  const samp = (F, x, y) => {
    let u = (x - gx0) / dx - 0.5, v = (y - gy0) / dx - 0.5;
    u = Math.min(M - 1.001, Math.max(0, u)); v = Math.min(N - 1.001, Math.max(0, v));
    const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j, q = j * M + i;
    return (F[q] * (1 - fu) + F[q + 1] * fu) * (1 - fv) + (F[q + M] * (1 - fu) + F[q + M + 1] * fu) * fv;
  };
  const th0 = -swell.dir * Math.PI / 180; // (peelrays: theta0 = -dir)
  // (rays start along the offshore edge, extended past the bay's sides by as far as the swell's angle carries them on the
  // way in, so an angled swell still covers the whole bay: a long coast needs every metre of it; outside the bay they see
  // its edge rows, and only breaks inside count)
  const drift = (M * dx) * Math.tan(th0), yS = gy0 + Math.min(0, -drift), yE = gy0 + N * dx + Math.max(0, -drift);
  const sp = RAYS.spacing, n = Math.floor((yE - yS) / sp);
  const x = new Float64Array(n), y = new Float64Array(n), th = new Float64Array(n), alive = new Uint8Array(n).fill(1);
  const tb = new Float64Array(n).fill(NaN), xb = new Float64Array(n).fill(NaN), yb = new Float64Array(n).fill(NaN);
  const hb = new Float64Array(n).fill(NaN), Hb = new Float64Array(n).fill(NaN), cb = new Float64Array(n).fill(NaN), sb = new Float64Array(n).fill(NaN), thb = new Float64Array(n).fill(NaN);
  for (let r = 0; r < n; r++) { x[r] = RAYS.x0; y[r] = yS + (r + 0.5) * sp; th[r] = th0; }
  const cg0 = look(cgT, samp(hs, RAYS.x0, y[0])), b0 = sp * Math.cos(th0), kw = Math.max(1, Math.round(RAYS.kw / sp));
  // (one crest: with an angled swell the crest crosses the offshore edge at an angle, so each ray sets off when it gets there,
  // (y - y_first) sin(theta) / c0 later; starting them all at once swept the break along a coast ~2x too fast. As
  // research/reef-generator's design_eval.py, which starts its arrival march with an oblique front.)
  const c0 = samp(C, RAYS.x0, (yS + yE) / 2), go = new Float64Array(n);
  { let mn = Infinity; for (let r = 0; r < n; r++) { go[r] = (y[r] * Math.sin(th0)) / c0; mn = Math.min(mn, go[r]); } for (let r = 0; r < n; r++) go[r] -= mn; }
  const H = new Float64Array(n), crests = [];
  let t = 0, nAlive = n, step = 0;
  const tmax = RAYS.tmax + Math.max(...go);
  while (t < tmax && nAlive > 0) {
    for (let r = 0; r < n; r++) {
      if (!alive[r] || t < go[r]) continue;
      const ip = Math.min(n - 1, r + kw), im = Math.max(0, r - kw);
      const b = Math.hypot(x[ip] - x[im], y[ip] - y[im]) / Math.max(ip - im, 1);
      const Kr = Math.sqrt(Math.min(6.25, Math.max(0, b0 / Math.max(b, 1e-3))));
      const h = samp(hs, x[r], y[r]);
      H[r] = swell.H * Math.sqrt(cg0 / look(cgT, h)) * Kr;
      if (H[r] >= RAYS.gamma * h || h < 0.3) { tb[r] = t; xb[r] = x[r]; yb[r] = y[r]; hb[r] = h; Hb[r] = H[r]; cb[r] = samp(C, x[r], y[r]);
        sb[r] = -(samp(Hx, x[r], y[r]) * Math.cos(th[r]) + samp(Hy, x[r], y[r]) * Math.sin(th[r])); thb[r] = th[r]; // (the bottom rising in the wave's direction)
        alive[r] = 0; nAlive--; }
    }
    if (step % 25 === 0) crests.push({ t, x: Float32Array.from(x), y: Float32Array.from(y), alive: Uint8Array.from(alive) }); // (every 5 s: the crest lines)
    for (let r = 0; r < n; r++) {
      if (!alive[r] || t < go[r]) continue;
      const c = samp(C, x[r], y[r]), cx = samp(Cx, x[r], y[r]), cy = samp(Cy, x[r], y[r]);
      th[r] += RAYS.dt * (Math.sin(th[r]) * cx - Math.cos(th[r]) * cy);
      x[r] += RAYS.dt * c * Math.cos(th[r]); y[r] += RAYS.dt * c * Math.sin(th[r]);
      if (x[r] <= gx0 || x[r] >= gx0 + M * dx - dx || y[r] <= yS - 50 || y[r] >= yE + 50) { alive[r] = 0; nAlive--; }
    }
    t += RAYS.dt; step++;
  }
  const L0 = g * T * T / (2 * Math.PI);
  // (the seabed slope in the swell's mean direction at any spot: for breaking intensity where the height model (pewave.js)
  // says the set waves break)
  // (in the direction the wave is travelling there: `th`, the ray's own at its break, else the swell's mean direction)
  const slopeAt = (x, y, th = th0) => -(samp(Hx, x, y) * Math.cos(th) + samp(Hy, x, y) * Math.sin(th));
  return { tb, xb, yb, hb, Hb, cb, sb, thb, crests, n, H0: swell.H, L0, slopeAt };
}

// When each 4 m strip along the reef first breaks (5-strip running median), then from the earliest spot (the peak) both
// ways: the curl's path, peel angle per 20 m, and where the ride ends (peelrays.peel). Each side's points get the time
// the curl reaches them (the running max: a stretch that broke before the curl got there is crossed at once) and a
// kind for drawing: 'ride', 'section' (fast but makeable, 25-30 deg), 'closeout' (< 25 deg twice in a row: where the
// ride ends), 'backoff' (the wave backs off: slower than 70 deg, or a gap where it doesn't break).
// With `pe` (pewave.js runPE over the same grid, plan step 4): the heights, where the set waves break and so the slope
// they break on come from the refraction-diffraction model, as research/reef-generator's design_eval.py: along each
// strip's row, coming in from offshore, the first spot where Hs / h >= 0.47 (the 1-in-100 wave, 1.67 Hs, reaching 0.78 h)
// is where it breaks, and Hs there its height. A strip where it never gets there doesn't break in that model (the rays
// over-read ledges): its curl is marked as backing off. Timing and peel stay the rays'.
export function analyse(R, grid, { binM = 4, step = 20, pe = null } = {}) {
  const V = grid.view || { y0: grid.y0, y1: grid.y0 + grid.N * grid.dx }, yLo = V.y0 + 70, yHi = V.y1 - 70; // (the curl within the map, clear of its edges)
  const strips = [];
  for (let e = yLo; e < yHi; e += binM) {
    let best = -1;
    for (let r = 0; r < R.n; r++) if (R.hb[r] > 0.4 && R.yb[r] >= e && R.yb[r] < e + binM && (best < 0 || R.tb[r] < R.tb[best])) best = r;
    strips.push(best < 0 ? [e + binM / 2, NaN, NaN, NaN, NaN, NaN, NaN] : [e + binM / 2, R.tb[best], R.xb[best], R.cb[best], R.Hb[best], R.sb[best], R.thb[best]]);
  }
  for (let col = 1; col <= 5; col++) { // (running median over 5 strips: where rays cross a strip breaks a second or two off)
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
    // the ride: from the peak until more than 40 m in a row breaks faster than anyone can surf (shorter is a section the curl
    // runs through); the takeoff stretch doesn't count
    // (each stretch's angle as the median of it and its neighbours: along a long coast the 20 m readings jitter by ~8 deg
    // where rays cross, and a coast peeling at ~27 deg tripped the rule by chance)
    segs.forEach((sg, i) => { const v = segs.slice(Math.max(0, i - 1), i + 2).map((q) => q.a).sort((a, b) => a - b); sg.am = v[Math.floor(v.length / 2)]; });
    let ride = 0, bad = 0, closed = false;
    for (const sg of segs) {
      bad = sg.am < RAYS.closeout && sg.e0 >= step ? bad + 1 : 0;
      if (bad >= 3) { ride = sg.e0 - 2 * step; closed = true; break; } // (more than 40 m in a row faster than anyone can surf: a closeout, as the game's own rule for Trestles, bar.sectionMax 40 m; shorter is a section the curl runs through)
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
      else if (gaps.includes(k) || (sg && sg.am > 70 && s[k] > step)) kind = 'backoff';
      else if (sg && sg.am < 30 && s[k] > step) kind = 'section';
      return { x: p[2], y: p[0], t: tc, s: s[k], H: p[4], Hray: p[4], c: p[3], slope: p[5], th: p[6], kind }; // (c: the wave's speed at breaking there; th: the wave's direction there)
    });
    if (pe) { // (heights, break spots and slopes from the height model; then a 5-point running median along the curl)
      const { Hs, M } = pe, d = grid.depth, raw = curl.map((p) => {
        const j = Math.min(grid.N - 1, Math.max(0, Math.round((p.y - grid.y0) / grid.dx - 0.5)));
        for (let i = 0; i < M; i++) { const h = d[j * M + i], hs = Hs[j * M + i]; if (h > 0.3 && hs / h >= 0.47) { const x = grid.x0 + (i + 0.5) * grid.dx; return { H: hs, slope: R.slopeAt(x, p.y, isFinite(p.th) ? p.th : undefined), breaks: true }; } }
        const i = Math.min(M - 1, Math.max(0, Math.round((p.x - grid.x0) / grid.dx - 0.5)));
        return { H: Hs[j * M + i], slope: p.slope, breaks: false };
      });
      const med5 = (k, key) => { const v = raw.slice(Math.max(0, k - 2), k + 3).map((r) => r[key]).filter(isFinite).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : raw[k][key]; };
      curl.forEach((p, k) => {
        p.H = med5(k, 'H'); p.slope = med5(k, 'slope'); p.peBreaks = raw.slice(Math.max(0, k - 2), k + 3).filter((r) => r.breaks).length >= 3;
        if (!p.peBreaks && p.kind !== 'closeout' && k > 0) p.kind = 'backoff';
      });
    }
    for (const p of curl) { p.xi = Math.max(0, p.slope) / Math.sqrt(R.H0 / R.L0); p.how = breakType(p.xi); } // (surf-similarity, Battjes' xi0: the slope it breaks on / sqrt(H0 / L0))
    const inRide = segs.filter((q) => q.e0 < ride && q.e0 >= step).map((q) => q.a).sort((a, b) => a - b);
    const med = inRide.length ? inRide[Math.floor(inRide.length / 2)] : NaN;
    const Hs = (pe ? curl.filter((p) => p.s <= ride).map((p) => p.H) : segs.filter((q) => q.e0 < ride).map((q) => q.H)).sort((a, b) => a - b);
    const xis = curl.filter((p) => p.s >= step && p.s <= ride).map((p) => p.xi).sort((a, b) => a - b);
    const xiMed = xis.length ? xis[Math.floor(xis.length / 2)] : NaN;
    out[side] = { refined: !!pe, xi: xiMed, how: isFinite(xiMed) ? breakType(xiMed) : '-', curl, segs, ride, line: s[s.length - 1], peel: med, band: isFinite(med) ? skillBand(med) : '-', H: Hs.length ? Hs[Math.floor(Hs.length / 2)] : NaN, end, seconds: curl.length ? curl[curl.length - 1].t - curl[0].t : 0 };
  }
  return out;
}
