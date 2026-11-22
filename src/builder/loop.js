// Loop a stretch of a built wave (the user, 2026-11-22: mark the primary stretch and keep surfing it on a loop; the
// builder will eventually drive endless waves like Queens, Raglan and Raglan+, which peel on forever).
// A loop is a stretch of one side's curl, from `a` to `b` metres along its break line from the peak. What the game would
// repeat is its profile: the curl's speed, the breaker height and the kind (ride / section / backoff) every `step` m,
// the same shape of data Raglan+'s ridges feed the wave (a curl speed and a section strength along the beach), so a
// looped stretch can drive an endless wave. The seam (where the end runs back into the start) should match, or the wave
// jumps there: curl speed and height within 15% / 20%.

export const LOOP = { snap: 10, min: 60, edge: 20, seamSpeed: 0.15, seamHeight: 0.2 };

// The point on a curl at distance s along it (interpolated).
export function curlAt(curl, s) {
  if (!curl.length) return null;
  if (s <= curl[0].s) return curl[0];
  for (let k = 1; k < curl.length; k++) {
    const p = curl[k - 1], q = curl[k];
    if (s <= q.s) { const f = (s - p.s) / Math.max(1e-6, q.s - p.s); return { x: p.x + (q.x - p.x) * f, y: p.y + (q.y - p.y) * f, t: p.t + (q.t - p.t) * f, H: p.H + (q.H - p.H) * f, c: p.c + (q.c - p.c) * f, xi: p.xi + (q.xi - p.xi) * f, s, kind: q.kind }; }
  }
  return curl[curl.length - 1];
}

// Where a full ride starts (plan step 6, the sandbar): the first spot past the peak where the curl can be followed (its speed
// along the line no more than c / sin 25 deg, the closeout limit), not inside the peak itself, which often breaks all at
// once (a sandbar's curved end: its first ~25 m go together); at least LOOP.edge / 2 in.
export function takeoffStart(side) {
  const end = Math.floor(side.ride / LOOP.snap) * LOOP.snap;
  if (end < LOOP.min) return null;
  const I = loopInfo(side, 0, end, 2), lim = 1 / Math.sin(25 * Math.PI / 180);
  const p = I.profile.find((q) => q.s >= LOOP.edge / 2 && q.v <= lim * q.c);
  const a = p ? Math.ceil(p.s / 2) * 2 : LOOP.edge / 2;
  return end - a >= LOOP.min / 2 ? { a, b: end } : null;
}

// A good default stretch: past the takeoff, up to just before the ride ends; null if the ride is too short to loop.
export function defaultLoop(side) {
  if (!side || side.ride < LOOP.min + 2 * LOOP.edge) return null;
  const a = LOOP.edge, b = Math.floor((side.ride - LOOP.edge) / LOOP.snap) * LOOP.snap; // (20 m in from each end: the takeoff, and the last metres that often go at once)
  return b - a >= LOOP.min ? { a, b } : null;
}

// Keep a stretch inside the ride and at least LOOP.min long (the wave changed under it).
export function clampLoop(side, a, b) {
  const end = Math.max(0, side.ride);
  b = Math.min(b, end); a = Math.max(0, Math.min(a, b - LOOP.min));
  return b - a >= LOOP.min ? { a, b } : null;
}

// What the looped wave would be.
export function loopInfo(side, a, b, step = 10) {
  const prof = [];
  for (let s = a; s <= b + 1e-6; s += step) {
    const p = curlAt(side.curl, s), q = curlAt(side.curl, Math.min(b, s + 20)), o = curlAt(side.curl, Math.max(a, s - 20));
    const v = (q.s - o.s) / Math.max(0.05, q.t - o.t); // (the curl's speed along the line, over ~40 m: rays wobble)
    // (the game's peel speed is the curl's speed along the crest, in the wave's own frame: the break point runs along the
    // reef at v = c / sin(alpha) while the wave carries it in at c, so along the crest it's sqrt(v^2 - c^2) = c / tan(alpha))
    const peel = Math.sqrt(Math.max(0, v * v - p.c * p.c));
    let xs = 0, xn = 0; for (let d = -20; d <= 20; d += 5) { const q2 = curlAt(side.curl, Math.min(b, Math.max(a, s + d))); if (q2 && isFinite(q2.xi)) { xs += q2.xi; xn++; } }
    prof.push({ s: s - a, v, peel, c: p.c, H: p.H, xi: xn ? xs / xn : NaN, kind: p.kind }); // (xi: how it breaks, averaged over +-20 m)
  }
  const vs = prof.map((p) => p.v), mean = vs.reduce((x, y) => x + y, 0) / vs.length;
  let sections = 0, inSec = false;
  for (const p of prof) { if (p.kind === 'section' && !inSec) sections++; inSec = p.kind === 'section'; }
  const head = prof.slice(0, 3), tail = prof.slice(-3), avg = (arr, k) => arr.reduce((x, p) => x + p[k], 0) / arr.length;
  const dv = Math.abs(avg(head, 'v') - avg(tail, 'v')) / Math.max(0.1, avg(head, 'v'));
  const dH = Math.abs(avg(head, 'H') - avg(tail, 'H')) / Math.max(0.1, avg(head, 'H'));
  const closes = prof.some((p) => p.kind === 'closeout');
  return {
    length: b - a, seconds: curlAt(side.curl, b).t - curlAt(side.curl, a).t,
    vMin: Math.min(...vs), vMax: Math.max(...vs), vMean: mean, sections, closes,
    seam: { dv, dH, ok: dv <= LOOP.seamSpeed && dH <= LOOP.seamHeight },
    profile: prof,
  };
}

// How well a loop from a to b would join (the seam alone: speed and height, end vs start), cheaply.
export function seamOf(side, a, b) {
  const I = loopInfo(side, a, b);
  return { ...I.seam, closes: I.closes, info: I };
}

// Dragging a loop end: from the spot under the pointer, snap to the nearest spot within `reach` m whose seam with the other
// end is smooth (the user, 2026-11-22: snap the ends to where they match), else stay where the pointer is.
export function snapEnd(side, which, s, other, reach = 20) {
  const end = Math.floor(side.ride / LOOP.snap) * LOOP.snap;
  const ok = (v) => { const a = which === 'a' ? v : other, b = which === 'a' ? other : v; return b - a >= LOOP.min && a >= 0 && b <= end; };
  const want = Math.round(s / LOOP.snap) * LOOP.snap;
  let best = null;
  for (let d = 0; d <= reach; d += LOOP.snap) for (const v of d ? [want - d, want + d] : [want]) {
    if (best || !ok(v)) continue;
    const sm = which === 'a' ? seamOf(side, v, other) : seamOf(side, other, v);
    if (sm.ok && !sm.closes) best = v;
  }
  if (best != null) return { s: best, snapped: best !== want };
  const clamped = which === 'a' ? Math.max(0, Math.min(want, other - LOOP.min)) : Math.min(end, Math.max(want, other + LOOP.min));
  return { s: clamped, snapped: false };
}

// The best loop on a side: the longest stretch with a smooth seam and no closeout inside (ties: the smoother seam).
export function bestLoop(side) {
  const end = Math.floor(side.ride / LOOP.snap) * LOOP.snap;
  let best = null;
  // (from past the takeoff, as the default loop: a lap that ran back through the peak's slow first metres would stall each time)
  for (let a = LOOP.edge; a <= end - LOOP.min; a += LOOP.snap) for (let b = end; b >= a + LOOP.min; b -= LOOP.snap) {
    if (best && b - a < best.b - best.a) break;
    const sm = seamOf(side, a, b);
    if (!sm.ok || sm.closes) continue;
    const score = sm.dv + sm.dH;
    if (!best || b - a > best.b - best.a || (b - a === best.b - best.a && score < best.score)) best = { a, b, score };
    break; // (the longest from this start found; shorter ones can't beat it)
  }
  return best;
}

// What DROP IN hands the game (src/waves/built.js): the stretch's profile every 10 m (peel speed along the crest, section
// strength, breaker height), whether it loops, which way it peels, and the wave's base pace (what trimming holds: the
// median peel outside the sections, as Raglan+'s plain wall).
// Where a spot sits on the built wave's shape scale (plan step 3), from how it breaks (xi0, rays.js): 0 crumbly at xi 0.4
// and below (spilling < 0.5), 1 Raglan's wall at 0.8 (a mild plunge), 2 the steep section shape from 1.3 (pitching).
export function shapeIndex(xi) {
  if (!isFinite(xi)) return 1;
  if (xi <= 0.4) return 0;
  if (xi <= 0.8) return (xi - 0.4) / 0.4;
  return Math.min(2, 1 + (xi - 0.8) / 0.5);
}
export function wavePayload(side, which, mode, a, b, swell) {
  const I = loopInfo(side, a, b);
  const plain = I.profile.filter((p) => p.kind !== 'section').map((p) => p.peel).sort((x, y) => x - y);
  const all = I.profile.map((p) => p.peel).sort((x, y) => x - y);
  const base = (plain.length ? plain : all)[Math.floor((plain.length ? plain : all).length / 2)];
  const med = (k) => { const v = I.profile.map((p) => p[k]).sort((x, y) => x - y); return v[Math.floor(v.length / 2)]; };
  return {
    // (H: the reference height the wave is sized to, and per point the size along it (plan step 2); c: the wave's speed
    // toward the shore at breaking, for the game's wave speed; the takeoff speed is the curl's at the stretch's start)
    v: 1, mode, side: which, length: I.length, base, H: med('H'), c: med('c'), swell,
    profile: I.profile.map((p) => ({ s: p.s, peel: +p.peel.toFixed(2), k: p.kind === 'section' ? 1 : 0, H: +p.H.toFixed(2), c: +p.c.toFixed(2), u: +shapeIndex(p.xi).toFixed(3) })),
  };
}
