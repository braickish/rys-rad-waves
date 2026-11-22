// Wave heights over a built reef from a refraction-diffraction model (plan step 4; the user, 2026-11-22). A port of
// research/reef-generator/pewave.py, checked there against FUNWAVE (reef-zone bias ~0.02 m, rms ~0.2 m). The ray model
// (rays.js) over-reads heights on ledges (the Python validation: 1.8-2.3 m where FUNWAVE had 0.8-1.45) because it has no
// diffraction (reef features 40-120 m are about one wavelength), runs one wave from one direction (a real spectrum's
// components each focus somewhere else, which blurs a lens), and loses no energy where waves break upstream. This adds all
// three:
// - Parabolic mild-slope equation, wide-angle (Pade (1,1) of the one-way operator, Kirby 1986 / REF/DIF), marched
//   shoreward in x' with Crank-Nicolson, per spectral component; a^2 Cg is carried (|B|^2 k).
// - The swell as the research's FUNWAVE runs: JONSWAP (gamma 3.3) with a Gaussian 7 deg spread, NF equal-energy period
//   bins x ND directions; energies add (Hs = 4 sqrt(m0)).
// - Breaking: Battjes & Janssen (1978) bulk dissipation on the whole field, Hmax = gamma h with Battjes & Stive's (1985)
//   gamma = 0.5 + 0.4 tanh(33 s0); bottom friction with FUNWAVE's Cd 0.003.
// - The grid is padded along y' with copies of its edge rows, so the side walls stay far away.
// Not in it: reflection off steep faces, nonlinear shoaling (both matter most right at a ledge), setup. When each spot
// breaks and the peel still come from the rays; this gives the heights.
const G = 9.81;

function dispersion(omegas, hmax) {
  // depths 0.02-2 m every ~0.01, then to hmax + 1 (as pewave.py's table)
  const hg = []; for (let i = 0; i < 200; i++) hg.push(0.02 + (2 - 0.02) * i / 199); for (let i = 0; i < 400; i++) hg.push(2.01 + (hmax + 1 - 2.01) * i / 399);
  const K = [], CG = [];
  for (const w of omegas) {
    const k = new Float64Array(hg.length), cg = new Float64Array(hg.length);
    for (let j = 0; j < hg.length; j++) {
      const h = hg[j]; let kk = w * w / G / Math.sqrt(Math.tanh(w * w * h / G));
      for (let n = 0; n < 30; n++) { const t = Math.tanh(kk * h); kk -= (G * kk * t - w * w) / (G * t + G * kk * h / Math.cosh(kk * h) ** 2); }
      const kh = kk * h; k[j] = kk; cg[j] = 0.5 * (w / kk) * (1 + 2 * kh / Math.sinh(Math.min(2 * kh, 700)));
    }
    K.push(k); CG.push(cg);
  }
  // interpolation on the two evenly spaced pieces
  const interp = (tab, h) => {
    let u; if (h <= 2) u = Math.max(0, (h - 0.02) / (2 - 0.02) * 199); else u = 200 + Math.min(399, Math.max(0, (h - 2.01) / (hmax + 1 - 2.01) * 399));
    if (h > 2 && h < 2.01) u = 199 + (h - 2) / 0.01;
    const i = Math.min(hg.length - 2, Math.floor(u)), f = Math.min(1, u - i); return tab[i] + (tab[i + 1] - tab[i]) * f;
  };
  return { K, CG, interp };
}

export function spectrum(H, T, spread, nf = 8, nd = 9, gamma = 3.3) {
  const ff = [], E = []; const fp = 1 / T;
  for (let f = 0.04 + 0.00125; f < 0.25; f += 0.0025) ff.push(f);
  let tot = 0;
  for (const f of ff) { const sig = f <= fp ? 0.07 : 0.09; const S = f ** -5 * Math.exp(-1.25 * (fp / f) ** 4) * gamma ** Math.exp(-((f - fp) ** 2) / (2 * sig * sig * fp * fp)); E.push(S); tot += S * 0.0025; }
  for (let i = 0; i < E.length; i++) E[i] = E[i] / tot * (H / 4) ** 2 * 0.0025;
  const sum = E.reduce((a, b) => a + b, 0), cum = []; let c = 0; for (const e of E) { c += e; cum.push(c / sum); }
  const edges = []; for (let i = 1; i < nf; i++) { const q = i / nf; let j = 0; while (j < cum.length && cum[j] < q) j++; edges.push(j); } // (np.searchsorted)
  const bounds = [0, ...edges, ff.length], fs = [], es = [];
  for (let b = 0; b + 1 < bounds.length; b++) {
    let ew = 0, fw = 0; for (let i = bounds[b]; i < bounds[b + 1]; i++) { ew += E[i]; fw += ff[i] * E[i]; }
    if (bounds[b + 1] > bounds[b]) { fs.push(fw / ew); es.push(ew); }
  }
  const th = [], wd = []; let ws = 0;
  for (let i = 0; i < nd; i++) { const t = nd > 1 ? -3 * spread + 6 * spread * i / (nd - 1) : 0; th.push(t); const w = nd > 1 ? Math.exp(-0.5 * (t / spread) ** 2) : 1; wd.push(w); ws += w; }
  for (let i = 0; i < nd; i++) wd[i] /= ws;
  let fm = 0; for (let i = 0; i < ff.length; i++) fm += ff[i] * E[i]; fm /= sum;
  const amp = fs.map((_, i) => wd.map((w) => Math.sqrt(2 * es[i] * w)));
  return { fs, th, amp, fm };
}

// Battjes-Janssen share of breaking waves: (1 - Qb) / -ln Qb = b^2, b = Hrms / Hmax
function bjQb(b) {
  if (b >= 1) return 1;
  const bb = Math.max(b, 1e-6); if (bb < 0.2) return 0;
  let x = Math.min(1 - 1e-9, Math.max(1e-12, Math.exp(-1 / (bb * bb))));
  for (let n = 0; n < 25; n++) { const f = (1 - x) + bb * bb * Math.log(x), df = -1 + bb * bb / x; x = Math.min(1 - 1e-9, Math.max(1e-12, x - f / df)); }
  return x;
}

// Run it over the builder's grid (reef.js: depth[j * M + i], j along y', i along x' from grid.x0). Returns Hs per cell.
// swell: { H, T, dir } (dir as the rays: degrees off straight in; the mean direction in the grid is -dir).
export function runPE(grid, swell, { spread = 7, nf = 8, nd = 9, pad = 400, cd = 0.003, alpha = 1, hmin = 0.05, wide = true } = {}) {
  const { M, N: N0, dx, depth } = grid, npad = Math.round(pad / dx), N = N0 + 2 * npad;
  const h = new Float64Array(N * M); let hmax = 0;
  for (let j = 0; j < N; j++) { const jj = Math.min(N0 - 1, Math.max(0, j - npad)); for (let i = 0; i < M; i++) { const v = Math.max(depth[jj * M + i], hmin); h[j * M + i] = v; if (v > hmax) hmax = v; } }
  const { fs, th, amp, fm } = spectrum(swell.H, swell.T, spread, nf, nd);
  const omegas = fs.map((f) => 2 * Math.PI * f), D = dispersion(omegas, hmax);
  const comps = []; for (let a = 0; a < fs.length; a++) for (let b = 0; b < th.length; b++) comps.push([a, b]);
  const C = comps.length, theta0 = -(swell.dir || 0);
  // per column: k and cg for each frequency, then per component (by its frequency)
  const kcol = (col, out, tab) => { for (let a = 0; a < fs.length; a++) for (let j = 0; j < N; j++) out[a * N + j] = D.interp(tab[a], h[j * M + col]); };
  const NF = fs.length, kA = new Float64Array(NF * N), kB = new Float64Array(NF * N), cgB = new Float64Array(NF * N);
  kcol(0, kA, D.K); kcol(0, cgB, D.CG);
  const Br = new Float64Array(C * N), Bi = new Float64Array(C * N);
  for (let c = 0; c < C; c++) {
    const [a, b] = comps[c], s = Math.sin((th[b] + theta0) * Math.PI / 180), a0 = amp[a][b];
    for (let j = 0; j < N; j++) { const k = kA[a * N + j], cg = cgB[a * N + j], m = a0 * Math.sqrt(cg / k), ph = k * s * j * dx; Br[c * N + j] = m * Math.cos(ph); Bi[c * N + j] = m * Math.sin(ph); }
  }
  const Hs = new Float32Array(N0 * M);
  const ip = Math.min(fs.length - 1, (() => { let i = 0; while (i < fs.length && fs[i] < 1 / swell.T) i++; return i; })());
  const L0 = G * swell.T ** 2 / (2 * Math.PI), s0 = (swell.H / Math.SQRT2) / L0, gam = 0.5 + 0.4 * Math.tanh(33 * s0);
  const inv = 1 / dx ** 2, c4 = wide ? 0.25 : 0, c34 = wide ? 0.75 : 0.5;
  const kh = new Float64Array(N), gr_r = new Float64Array(N), gr_i = new Float64Array(N), gl_r = new Float64Array(N), gl_i = new Float64Array(N);
  const rr = new Float64Array(N), ri = new Float64Array(N), cpr = new Float64Array(N), cpi = new Float64Array(N);
  const a2sum = new Float64Array(N), su2 = new Float64Array(N);
  const store = (col) => { for (let j = npad; j < npad + N0; j++) Hs[(j - npad) * M + col] = 4 * Math.sqrt(0.5 * a2sum[j]); };
  // the starting column's heights
  a2sum.fill(0);
  for (let c = 0; c < C; c++) { const a = comps[c][0]; for (let j = 0; j < N; j++) { const q = c * N + j; a2sum[j] += (Br[q] ** 2 + Bi[q] ** 2) * kA[a * N + j] / cgB[a * N + j]; } }
  store(0);
  for (let col = 0; col < M - 1; col++) {
    kcol(col + 1, kB, D.K); kcol(col + 1, cgB, D.CG);
    for (let c = 0; c < C; c++) {
      const a = comps[c][0], off = a * N;
      let k0 = 0; for (let j = 0; j < N; j++) { kh[j] = 0.5 * (kA[off + j] + kB[off + j]); k0 += kh[j]; } k0 /= N;
      // R0 = i (kh - k0) - delta; gX = i (kh c34 - k0 c4) - delta c4; s = 1 / (dy^2 kh^2)
      // gl = (c4 - dx/2 gX) s, gr = (c4 + dx/2 gX) s; dl = (1 - dx/2 R0) - gl nb, dr = (1 + dx/2 R0) - gr nb
      for (let j = 0; j < N; j++) {
        const delta = (kB[off + j] - kA[off + j]) / dx / (2 * kh[j]), sj = inv / (kh[j] * kh[j]);
        const gXr = -delta * c4, gXi = kh[j] * c34 - k0 * c4;
        gl_r[j] = (c4 - 0.5 * dx * gXr) * sj; gl_i[j] = (-0.5 * dx * gXi) * sj;
        gr_r[j] = (c4 + 0.5 * dx * gXr) * sj; gr_i[j] = (0.5 * dx * gXi) * sj;
        const nb = j === 0 || j === N - 1 ? 1 : 2, R0r = -delta, R0i = kh[j] - k0;
        // right-hand side
        const drr = 1 + 0.5 * dx * R0r - gr_r[j] * nb, dri = 0.5 * dx * R0i - gr_i[j] * nb, q = c * N + j;
        let xr = drr * Br[q] - dri * Bi[q], xi = drr * Bi[q] + dri * Br[q];
        if (j > 0) { xr += gr_r[j] * Br[q - 1] - gr_i[j] * Bi[q - 1]; xi += gr_r[j] * Bi[q - 1] + gr_i[j] * Br[q - 1]; }
        if (j < N - 1) { xr += gr_r[j] * Br[q + 1] - gr_i[j] * Bi[q + 1]; xi += gr_r[j] * Bi[q + 1] + gr_i[j] * Br[q + 1]; }
        rr[j] = xr; ri[j] = xi;
        // the diagonal, kept in cpr/cpi for the solve below (Thomas: gl below and above)
        cpr[j] = 1 - 0.5 * dx * R0r - gl_r[j] * nb; cpi[j] = -0.5 * dx * R0i - gl_i[j] * nb;
      }
      // tridiagonal solve: gl[j] B[j-1] + d[j] B[j] + gl[j] B[j+1] = r[j] (no coupling past the ends), complex Thomas
      // forward sweep: c'[j] = up[j] / (d[j] - lo[j] c'[j-1]); r'[j] = (r[j] - lo[j] r'[j-1]) / (d[j] - lo[j] c'[j-1])
      let pr = 0, pi = 0; // c'[j-1]
      for (let j = 0; j < N; j++) {
        const lor = j > 0 ? gl_r[j] : 0, loi = j > 0 ? gl_i[j] : 0;
        const mr = cpr[j] - (lor * pr - loi * pi), mi = cpi[j] - (lor * pi + loi * pr); // m = d - lo c'
        const den = mr * mr + mi * mi;
        const upr = j < N - 1 ? gl_r[j] : 0, upi = j < N - 1 ? gl_i[j] : 0;
        const ncr = (upr * mr + upi * mi) / den, nci = (upi * mr - upr * mi) / den; // up / m
        const prevr = j > 0 ? rr[j - 1] : 0, previ = j > 0 ? ri[j - 1] : 0;
        const tr = rr[j] - (lor * prevr - loi * previ), ti = ri[j] - (lor * previ + loi * prevr);
        rr[j] = (tr * mr + ti * mi) / den; ri[j] = (ti * mr - tr * mi) / den;
        cpr[j] = ncr; cpi[j] = nci; pr = ncr; pi = nci;
      }
      for (let j = N - 2; j >= 0; j--) { const xr = rr[j + 1], xi = ri[j + 1]; rr[j] -= cpr[j] * xr - cpi[j] * xi; ri[j] -= cpr[j] * xi + cpi[j] * xr; }
      for (let j = 0; j < N; j++) { Br[c * N + j] = rr[j]; Bi[c * N + j] = ri[j]; }
    }
    // breaking and friction on the whole field
    a2sum.fill(0); su2.fill(0);
    for (let c = 0; c < C; c++) {
      const a = comps[c][0], off = a * N, om = omegas[a];
      for (let j = 0; j < N; j++) {
        const q = c * N + j, k2 = kB[off + j], a2 = (Br[q] ** 2 + Bi[q] ** 2) * k2 / cgB[off + j];
        a2sum[j] += a2; const hh = h[j * M + col + 1]; su2[j] += a2 * (om / Math.sinh(Math.min(k2 * hh, 700))) ** 2;
      }
    }
    const offP = ip * N;
    for (let j = 0; j < N; j++) {
      const Hrms = 2 * Math.sqrt(a2sum[j]), hh = h[j * M + col + 1], Hm = gam * hh, q = bjQb(Hrms / Hm);
      let Dp = alpha / 4 * fm * q * Hm * Hm;
      const su = Math.sqrt(0.5 * su2[j]); Dp += cd * 2 * Math.sqrt(2 / Math.PI) * su ** 3 / G;
      const rate = Dp / Math.max(Hrms * Hrms / 8 * cgB[offP + j], 1e-9), f = Math.exp(-0.5 * Math.min(rate * dx, 50));
      if (f < 1) for (let c = 0; c < C; c++) { Br[c * N + j] *= f; Bi[c * N + j] *= f; }
      a2sum[j] *= f * f;
    }
    store(col + 1);
    kA.set(kB);
  }
  return { Hs, M, N: N0 };
}
