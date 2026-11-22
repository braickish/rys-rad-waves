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
    if (s <= q.s) { const f = (s - p.s) / Math.max(1e-6, q.s - p.s); return { x: p.x + (q.x - p.x) * f, y: p.y + (q.y - p.y) * f, t: p.t + (q.t - p.t) * f, H: p.H + (q.H - p.H) * f, s, kind: q.kind }; }
  }
  return curl[curl.length - 1];
}

// A good default stretch: past the takeoff, up to just before the ride ends; null if the ride is too short to loop.
export function defaultLoop(side) {
  if (!side || side.ride < LOOP.min + 2 * LOOP.edge) return null;
  const a = LOOP.edge, b = Math.floor((side.ride - LOOP.edge / 2) / LOOP.snap) * LOOP.snap;
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
    prof.push({ s: s - a, v, H: p.H, kind: p.kind });
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
