// Fun waves (the surfable-waves plan, plans/2026-11-24-surfable-waves.md; the user, 2026-11-24): the builder's wave with its
// extremes tamed so it's surfable, keeping its character (which way it breaks, how long it is, where its features are and
// in what order, how hard it is next to other reefs). The builder stays honest; this works on the payload DROP IN sends
// (built.js applyBuilt, when `fun`), after the size override. Pure: the builder's ghost line (step 9) uses it too.
// The limits come from the survey (test/survey.mjs, step 2), scaled to the wave: speeds by sqrt(breakers / 3.5 m).

const MPH = 2.237;
export const FUN = {
  smooth: 1.5, // (s of curl: a light smoothing, just the ray noise; ~3 s cut a short section's peak, and the rate limit below
  // spreads the real changes out without cutting)
  rate: 6 / MPH, // (m/s of curl speed per s of curl, at 3.5 m breakers: x sqrt(size))
  uRate: 0.25, // (of the shape scale per s of curl)
  pace: 8.3, // (m/s: the comfortable curl, Raglan's own on its ~3.5 m breakers; x sqrt(size))
  band: [0.75, 1.6], // (the curl's speed within these x the comfortable pace ...)
  floor: 4.5, // (... and never under this, m/s: the rider's slowest trim, rider.js vLow, ~10 mph)
};
// step 4: the curl's speed squeezed into a makeable band around the comfortable pace for the wave's size: a smooth, monotonic
// squash (in log speed: near the pace almost unchanged, toward the band's edges more and more, never past them), so slow stays
// slower and fast faster, but a section is "pump hard", not impossible, and a near-back-off takeoff still moves. (On a small
// wave the floor can sit above 0.75 x the pace: the pace is then lifted so the floor is its 0.75.)
export function bandOf(H) {
  const v0 = FUN.pace * Math.sqrt(Math.max(0.05, H) / 3.5), lo = Math.max(FUN.band[0] * v0, FUN.floor), pace = Math.max(v0, lo / FUN.band[0]);
  return { pace, lo, hi: FUN.band[1] * pace };
}
export function squash(v, { pace, lo, hi }) {
  const x = Math.log(Math.max(0.05, v) / pace), a = Math.log(hi / pace), b = Math.log(lo / pace); // (b < 0 < a)
  return pace * Math.exp(x >= 0 ? a * Math.tanh(x / a) : b * Math.tanh(x / b));
}

// The curl's time across each step of the profile (s), at its own speeds.
const stepTimes = (P, key = 'peel') => P.slice(1).map((q, i) => (q.s - P[i].s) / Math.max(0.5, (q[key] + P[i][key]) / 2));

// A light smoothing along the curl's time: each point the Gaussian-weighted mean of its neighbours (sigma = smooth / 4).
function smoothAlong(P, key, T) {
  const t = [0]; for (let i = 1; i < P.length; i++) t.push(t[i - 1] + T[i - 1]);
  const sg = FUN.smooth / 4;
  return P.map((_, i) => {
    let a = 0, w = 0;
    for (let j = 0; j < P.length; j++) { const d = (t[j] - t[i]) / sg; if (d * d > 9) continue; const k = Math.exp(-0.5 * d * d); a += k * P[j][key]; w += k; }
    return a / w;
  });
}
// Rises and falls no steeper than `rate` per second of curl: a step too steep gives up its excess half and half, the high side
// coming down and the low side coming up, repeated until every step is within it, so a change is spread both ways from where it
// was and the section stays where it is. (Spreading it only ahead, never cutting a peak, pushed a section's speed-up back
// into the takeoff: on the user's 11 ft left the takeoff barrel then ran at 21-35 mph and both test riders went over the
// falls in ~3 s.)
function limitRate(v, P, rate) {
  for (let it = 0; it < 400; it++) {
    const T = stepTimes(P.map((p, i) => ({ s: p.s, v: v[i] })), 'v');
    let worst = 0;
    for (let i = 0; i < v.length - 1; i++) {
      const d = v[i + 1] - v[i], lim = rate * T[i], ex = Math.abs(d) - lim;
      if (ex <= 1e-4) continue;
      worst = Math.max(worst, ex);
      const k = Math.sign(d) * ex * 0.5;
      v[i] += k; v[i + 1] -= k;
    }
    if (worst < 1e-3) break;
  }
  return v;
}

// The Fun version of a payload (a copy; Real passes through untouched).
export function funPayload(data) {
  if (!data || !data.fun || data.funApplied || !Array.isArray(data.profile) || data.profile.length < 3) return data; // (funApplied: already the Fun version, set up again from WAVE.built)
  const size = Math.sqrt(Math.max(0.05, data.H) / 3.5);
  let P = data.profile.map((p) => ({ ...p }));
  // step 4: the curl's speed (and the pace trimming holds) into the band
  const band = bandOf(data.H);
  P.forEach((p) => { p.peel = squash(p.peel, band); });
  // step 3: light smoothing, then no jumps in the curl's speed or its shape
  const T0 = stepTimes(P);
  const peel = smoothAlong(P, 'peel', T0), u = P[0].u != null ? smoothAlong(P, 'u', T0) : null;
  P.forEach((p, i) => { p.peel = peel[i]; if (u) p.u = u[i]; });
  const v = limitRate(P.map((p) => p.peel), P, FUN.rate * size);
  P.forEach((p, i) => { p.peel = v[i]; });
  if (u) {
    // (the shape the same way, by the curl's time at its new speeds)
    const T = stepTimes(P), uu = P.map((p) => p.u);
    for (let it = 0; it < 400; it++) {
      let worst = 0;
      for (let i = 0; i < uu.length - 1; i++) { const d = uu[i + 1] - uu[i], ex = Math.abs(d) - FUN.uRate * T[i]; if (ex <= 1e-4) continue; worst = Math.max(worst, ex); const k = Math.sign(d) * ex * 0.5; uu[i] += k; uu[i + 1] -= k; }
      if (worst < 1e-3) break;
    }
    P.forEach((p, i) => { p.u = +uu[i].toFixed(3); });
  }
  P.forEach((p) => { p.peel = +p.peel.toFixed(2); });
  return { ...data, base: +squash(data.base, band).toFixed(2), profile: P, funApplied: true };
}
