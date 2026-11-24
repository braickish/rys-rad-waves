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
};

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
  if (!data || !data.fun || !Array.isArray(data.profile) || data.profile.length < 3) return data;
  const size = Math.sqrt(Math.max(0.05, data.H) / 3.5);
  let P = data.profile.map((p) => ({ ...p }));
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
  return { ...data, profile: P, funApplied: true };
}
