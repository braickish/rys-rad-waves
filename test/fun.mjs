// Fun waves (the surfable-waves plan, src/builder/fun.js): the builder's wave with its extremes tamed, its character kept.
//   node test/fun.mjs
import { funPayload, FUN } from '../src/builder/fun.js';
import { applyBuilt } from '../src/waves/built.js';

let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) fails++; };
const MPH = 2.237;
// the steepest change in the curl's speed (mph per second of curl) and in the shape (per second)
const steepest = (P, key, mul = 1) => { let m = 0; for (let i = 1; i < P.length; i++) { const dt = (P[i].s - P[i - 1].s) / Math.max(0.5, (P[i].peel + P[i - 1].peel) / 2); m = Math.max(m, Math.abs(P[i][key] - P[i - 1][key]) * mul / dt); } return m; };

// The user's 11 ft left (2026-11-23: a barrel speeding up into a section, the curl 18 -> 45 mph over ~30 m), as the builder sent it
const LEFT = [[0, 8.03, 3, 3.83], [10, 8.18, 3, 3.68], [20, 8.21, 3, 3.68], [30, 12.08, 3, 3.67], [40, 17.34, 2.87, 3.67], [50, 20.23, 2.005, 3.69, 0.4], [60, 16.23, 1.787, 3.57, 0.22],
  [70, 12.29, 1.529, 3.4], [80, 10.49, 1.502, 3.4], [90, 11.55, 1.5, 3.41], [100, 12.45, 1.497, 3.42], [110, 11.64, 1.492, 3.42], [120, 13.23, 1.485, 3.43], [130, 13.76, 1.476, 3.43],
  [140, 14.02, 1.466, 3.43], [150, 13.1, 1.454, 3.44], [160, 12.31, 1.439, 3.45], [170, 12.35, 1.415, 3.45], [180, 11.55, 1.381, 3.46], [190, 12.15, 1.305, 3.47], [200, 10.93, 1.161, 3.47],
  [210, 10.95, 0.864, 3.5], [220, 11.33, 0.492, 3.55], [230, 9.29, 0.148, 3.71], [240, 9.29, 0, 3.77], [250, 9.37, 0, 3.78]];
const left = (fun) => ({ v: 1, mode: 'full', side: 'left', length: 250, base: 11.64, H: 3.47, c: 6.96, fun, profile: LEFT.map(([s, peel, u, H, e]) => ({ s, peel, k: 0, H, c: 6.96, u, ...(e ? { e } : {}) })) });

// step 3: no jumps
{
  const real = left(false), fun = funPayload(left(true)), size = Math.sqrt(3.47 / 3.5);
  const r0 = steepest(real.profile, 'peel', MPH), r1 = steepest(fun.profile, 'peel', MPH), u1 = steepest(fun.profile, 'u');
  const pk0 = Math.max(...real.profile.map((p) => p.peel)), pk1 = Math.max(...fun.profile.map((p) => p.peel));
  console.log(`11 ft left: steepest curl change ${r0.toFixed(1)} -> ${r1.toFixed(1)} mph/s (limit ${(FUN.rate * MPH * size).toFixed(1)}); shape ${u1.toFixed(2)}/s (limit ${FUN.uRate}); fastest ${(pk0 * MPH).toFixed(0)} -> ${(pk1 * MPH).toFixed(0)} mph`);
  console.log(`  real ${real.profile.slice(0, 9).map((p) => (p.peel * MPH).toFixed(0)).join(' ')} ... | fun ${fun.profile.slice(0, 9).map((p) => (p.peel * MPH).toFixed(0)).join(' ')} ...`);
  check(r1 <= FUN.rate * MPH * size * 1.05, 'step 3: the curl speeds up and slows down no faster than the limit');
  check(u1 <= FUN.uRate * 1.05, 'step 3: the shape changes no faster than the limit');
  const at = (P) => P[P.map((p) => p.peel).indexOf(Math.max(...P.map((p) => p.peel)))].s;
  check(Math.abs(at(fun.profile) - at(real.profile)) <= 20, `step 3: the section stays where it is, still the fastest stretch (${at(real.profile)} -> ${at(fun.profile)} m; its speed squeezed into the band, step 4)`);
  check(fun.profile[0].peel < real.profile[0].peel * 1.25, 'step 3: the takeoff doesn\'t take on the section\'s speed');
  check(funPayload(real) === real, 'Real passes through untouched');
}
{
  const steady = { v: 1, mode: 'loop', side: 'left', length: 200, base: 8, H: 2.4, c: 5.5, fun: true, profile: Array.from({ length: 21 }, (_, i) => ({ s: i * 10, peel: 8, k: 0, H: 2.4, c: 5.5, u: 1 })) };
  const f = funPayload(steady);
  check(f.profile.every((p) => Math.abs(p.peel - f.profile[0].peel) < 0.01 && Math.abs(p.u - 1) < 0.001) && Math.abs(f.profile[0].peel / 8 - 1) < 0.05, `a steady wave stays steady, near its speed (8 -> ${f.profile[0].peel} m/s)`);
}
// step 4: the curl's speed within the band for the wave's size, its order kept
{
  const { bandOf, squash } = await import('../src/builder/fun.js');
  const b5 = bandOf(1.52), b11 = bandOf(3.35);
  console.log(`band: 5 ft breakers ${(b5.lo * MPH).toFixed(0)}-${(b5.hi * MPH).toFixed(0)} mph (pace ${(b5.pace * MPH).toFixed(0)}), 11 ft ${(b11.lo * MPH).toFixed(0)}-${(b11.hi * MPH).toFixed(0)} (pace ${(b11.pace * MPH).toFixed(0)})`);
  const vs = [1, 2, 3, 5, 7, 8, 10, 14, 20, 30], m = vs.map((v) => squash(v, b11));
  check(m.every((x, i) => x > b11.lo - 1e-9 && x < b11.hi + 1e-9 && (!i || x > m[i - 1])), 'step 4: every speed lands inside the band, in the same order');
  check(Math.abs(squash(b11.pace, b11) - b11.pace) < 1e-9 && Math.abs(squash(b11.pace * 1.1, b11) / (b11.pace * 1.1) - 1) < 0.05, 'step 4: near the comfortable pace speeds barely change');
  // the user's slow hollow right (2026-11-23: a 7-8 mph takeoff, 64 deg) and 11 ft left (a 45 mph section)
  const fun = funPayload(left(true)), bL = bandOf(3.47);
  check(fun.profile.every((p) => p.peel >= bL.lo - 0.01 && p.peel <= bL.hi + 0.01), `step 4: the 11 ft left inside its band (${(Math.min(...fun.profile.map((p) => p.peel)) * MPH).toFixed(0)}-${(Math.max(...fun.profile.map((p) => p.peel)) * MPH).toFixed(0)} mph)`);
  const slow = funPayload({ v: 1, mode: 'full', side: 'right', length: 100, base: 8.16, H: 2.19, c: 6.08, fun: true, profile: [3.31, 3.6, 3.76, 5.32, 7.29, 8.56, 8.48, 8.63, 9.81, 11.7, 13.99].map((peel, i) => ({ s: i * 10, peel, k: 0, H: 2.2, c: 6, u: 2.7 })) });
  check(slow.profile[0].peel * MPH >= 10 - 0.05, `step 4: the slow hollow right's takeoff moves (7 -> ${(slow.profile[0].peel * MPH).toFixed(0)} mph)`);
}
// step 5: clear shape zones: a wave that sat between kinds the whole way (the user's 2026-11-23 right, 2.6-2.75) becomes one kind;
// a barrel too short or too small to fit in becomes the steep section
{
  const right = (Hb, us) => funPayload({ v: 1, mode: 'full', side: 'right', length: (us.length - 1) * 10, base: 8, H: Hb, c: 6, fun: true, profile: us.map((u, i) => ({ s: i * 10, peel: 8, k: 0, H: Hb, c: 6, u })) });
  const limbo = (P) => P.filter((p) => { const f = p.u - Math.floor(p.u); return f > 0.2 && f < 0.8; }).length / P.length;
  const halfway = right(2.2, Array.from({ length: 25 }, (_, i) => 2.675 + 0.075 * Math.sin(i / 3)));
  console.log(`between kinds: the 2.6-2.75 right ${(limbo(halfway.profile) * 100).toFixed(0)}% of the ride (was 100%), u ${Math.min(...halfway.profile.map((p) => p.u)).toFixed(2)}-${Math.max(...halfway.profile.map((p) => p.u)).toFixed(2)}`);
  check(limbo(halfway.profile) < 0.1, 'step 5: a wave between two kinds the whole way becomes one kind');
  const short = right(2.2, [1, 1, 1, 1, 1, 3, 3, 1, 1, 1, 1, 1, 1, 1]); // (a barrel ~20 m long at 8 m/s: ~2.5 s)
  check(Math.max(...short.profile.map((p) => p.u)) <= 2.01, 'step 5: a barrel shorter than 3 s of curl becomes the steep section');
  const tiny = right(1.2, [1, 1, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 1, 1]); // (1.2 m breakers: a ~1.07 m tube, too small to fit in)
  check(Math.max(...tiny.profile.map((p) => p.u)) <= 2.01, 'step 5: a barrel too small to fit in becomes the steep section');
  const long = right(2.5, [1, 1, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 1, 1]);
  check(long.profile.filter((p) => p.u >= 2.9).length >= 6, 'step 5: a long, big enough barrel stays a barrel');
}
// sharp reef edges (the payload's `sharp`): Fun lets the wave change faster (a ledge still jacks up quickly)
{
  const d = { v: 1, mode: 'full', side: 'left', length: 200, base: 8, H: 3, c: 6, fun: true, profile: Array.from({ length: 21 }, (_, i) => ({ s: i * 10, peel: i === 10 ? 16 : 8, k: 0, H: 3, c: 6, u: i >= 10 ? 4 : 3 })) };
  const soft = funPayload(d), sharp = funPayload({ ...d, sharp: true });
  const r0 = steepest(soft.profile, 'peel', MPH), r1 = steepest(sharp.profile, 'peel', MPH), u0 = steepest(soft.profile, 'u'), u1 = steepest(sharp.profile, 'u');
  console.log(`sharp edges: steepest curl change ${r0.toFixed(1)} -> ${r1.toFixed(1)} mph/s, shape ${u0.toFixed(2)} -> ${u1.toFixed(2)}/s (barrel to ledge)`);
  check(r1 > r0 * 1.2 && u1 > u0 * 1.4, 'sharp edges: Fun lets the wave change faster (the profile, a point every 10 m, bounds how fast it can show)');
}
// step 6: the size along the ride steadier (the user's 2026-11-24 right: 5.3 -> 2.6 -> 3.7 -> 2.7 -> 5.8 m)
{
  const Hs = [5.31, 5.26, 4.85, 4.36, 3.48, 2.75, 2.64, 2.61, 2.64, 3.19, 3.56, 3.74, 3.74, 3.56, 3.24, 2.95, 2.75, 2.7, 2.69, 2.73, 5.18, 5.84, 5.85, 5.83, 5.8, 5.75, 5.73, 5.7, 5.68];
  const f = funPayload({ v: 1, mode: 'full', side: 'right', length: 280, base: 9.8, H: 3.74, c: 7.3, fun: true, profile: Hs.map((H, i) => ({ s: i * 10, peel: 9.8, k: 0, H, c: 7.3, u: 1 })) });
  const H = f.profile.map((p) => p.H), ratio = Math.max(...H) / Math.min(...H);
  let rate = 0; for (let i = 1; i < H.length; i++) rate = Math.max(rate, Math.abs(H[i] - H[i - 1]) / (10 / f.profile[i].peel));
  const mid = [...Hs].sort((a, b) => a - b)[Math.floor(Hs.length / 2)];
  console.log(`size: ${Math.min(...Hs).toFixed(1)}-${Math.max(...Hs).toFixed(1)} m -> ${Math.min(...H).toFixed(1)}-${Math.max(...H).toFixed(1)} (largest / smallest ${ratio.toFixed(2)}), fastest change ${(rate / mid * 100).toFixed(0)}% of the middle a second`);
  check(ratio <= 1.5, 'step 6: the size along the ride within +-20% (largest / smallest at most 1.5)');
  check(rate / mid <= 0.13, 'step 6: the size changes at most ~12% of its middle a second of curl');
}
// the game applies it: a Fun link rides the Fun profile, a Real one (or an older link, no `fun`) the builder's
{
  // (applyBuilt sets up the one built wave and returns it: read each before the next)
  const a = applyBuilt(left(true)).ridges.profile.map((p) => p.peel), b = applyBuilt(left(false)).ridges.profile.map((p) => p.peel), c = applyBuilt({ ...left(false), fun: undefined }).ridges.profile.map((p) => p.peel);
  check(a.some((v, i) => Math.abs(v - LEFT[i][1]) > 0.5), 'the game rides the Fun profile when Fun');
  check(b.every((v, i) => v === LEFT[i][1]) && c.every((v, i) => v === LEFT[i][1]), 'Real (and older links) ride the builder\'s profile exactly');
}
// set up again from WAVE.built (a replay, heat mode's full ride): the same wave, not scaled or made Fun a second time (the user,
// 2026-11-24: the replay showed a different size from the wave surfed)
{
  const W = await import('../src/wave.js');
  const d = { ...left(true), scale: 1.5 };
  const once = applyBuilt(d), H1 = once.built.H, p1 = once.ridges.profile.map((p) => p.peel), k1 = once.sizeK;
  const again = applyBuilt(once.built), H2 = again.built.H, p2 = again.ridges.profile.map((p) => p.peel), k2 = again.sizeK;
  console.log(`set up again: breakers ${H1.toFixed(2)} -> ${H2.toFixed(2)} m, sizeK ${k1.toFixed(3)} -> ${k2.toFixed(3)}`);
  check(Math.abs(H1 - H2) < 1e-9 && Math.abs(k1 - k2) < 1e-9 && p1.every((v, i) => Math.abs(v - p2[i]) < 1e-9), 'set up again from WAVE.built (a replay): the same wave, not scaled or made Fun twice');
}
process.exit(fails ? 1 : 0);
