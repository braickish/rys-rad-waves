// Competition judging (the user, 2026-11-22: a start on WSL-style scoring, on with ?judge; later heats against other players).
// WSL: five judges score each wave 0-10 together on five criteria (commitment and degree of difficulty, innovative and
// progressive maneuvers, combination of major maneuvers, variety, speed / power / flow); the high and the low are dropped
// and the surfer gets the average of the other three; a heat keeps each surfer's best two waves (a perfect heat is 20).
// Grades: poor 0-1.9, fair 2-4.9, good 5-6.4, very good 6.5-7.9, excellent 8-10. The scale is relative to the conditions.
//
// Here the criteria are made concrete (the user's outline):
//   difficulty x criticality: each maneuver a base value (airs > snaps > cutbacks > bottom turns; barrels by time and depth),
//     x where it happened (in the pocket, at the lip, vs out on the shoulder)
//   execution: a sketchy landing (backwards) halves it; the speed kept coming out of it; a fall within 0.6 s voids it
//   combination: different major maneuvers linked within 2 s grow a multiplier (x1.12 per link, up to x1.5); a stall breaks it
//   variety: repeats of the same maneuver worth 1, 0.7, 0.4, 0.2, then nothing
//   innovation: x1.1 for a maneuver new this session, and x1.1 for a rare one
//   flow: the ride's average speed against the curl's, less the time spent stalled, x0.8-1.15 over the whole ride
// The raw points go through an S curve onto 0-10 (R0 by the wave's size), so 9+ takes a lot; five judges with their own
// biases and a little random spread score it, and the sheet shows them all.

// ---- the ride log: fed every physics step after stepRider (main.js) ----
export function createRideLog() {
  return { time: 0, moves: [], launch: null, tubeIn: null, n: 0, speedRatio: 0, stall: 0, stalled: false, end: null };
}
const MAJOR_EXCLUDE = new Set(['bottomTurn']);
// r: the rider after this step (its events are this step's); curl: the curl's speed now (PEEL_SPEED)
export function logStep(log, r, dt, curl) {
  log.time += dt;
  if (r.mode === 'surf') {
    log.n++; log.speedRatio += Math.min(1.6, r.speed / Math.max(1, curl));
    if ((r.idle || 0) > 1.0 || r.speed < 0.6 * curl) { log.stall += dt; log.stalled = true; } // (stalled: no input for a while, or bogged)
  }
  const at = () => { const o = { t: log.time, speed: r.speed, pocket: r.pocket || 0, height: r.height || 0, stalled: log.stalled }; log.stalled = false; return o; }; // (stalled: since the last maneuver)
  for (const e of r.events) {
    if (e.type === 'move') log.moves.push({ kind: e.move, ...at(), combo: !!e.combo, tube: !!e.tube });
    else if (e.type === 'launch') log.launch = { ...at(), big: !!e.big };
    else if (e.type === 'land') {
      const L = log.launch || at();
      log.moves.push({ kind: 'air', t: log.time, speed: L.speed, pocket: L.pocket, height: L.height, stalled: !!L.stalled, spins: e.spins || 0, big: !!e.big, backwards: !!e.backwards, airTime: e.airTime || 0 });
      log.launch = null;
    } else if (e.type === 'barrelEnter') log.tubeIn = log.time;
    else if (e.type === 'barrelExit' && e.time > 0.4) { log.moves.push({ kind: 'barrel', ...at(), time: e.time, depth: e.avgDepth || 0, made: true }); log.tubeIn = null; }
    else if (e.type === 'noseride' && e.time > 0.3) log.moves.push({ kind: 'noseride', ...at(), time: e.time, ten: e.tenTime || 0 });
    else if (e.type === 'wipe' && !log.end) {
      if (log.tubeIn != null && log.time - log.tubeIn > 1) log.moves.push({ kind: 'barrel', ...at(), time: log.time - log.tubeIn, depth: 0.5, made: false }); // (caught inside)
      log.end = { t: log.time, fall: !e.ended && !r.stepOff, reason: e.reason };
    }
  }
  // the speed kept 0.6 s after each maneuver (execution)
  for (const m of log.moves) if (m.after == null && log.time - m.t >= 0.6) m.after = r.speed;
}

// ---- values ----
// Base values in raw points (a maneuver's worth done well in the pocket): airs above snaps, snaps above cutbacks, cutbacks above
// bottom turns.
export const MOVE_VALUES = {
  bottomTurn: 0.4, topTurn: 1.0, check: 0.8, revert: 1.6, floater: 2.0, lip180: 2.2, roundhouse: 2.6, slash: 3.0, snap: 3.0, verticalSnap: 3.8,
  reentry: 3.6, rebound: 3.2, rebound180: 4.2, hang5: 1.6, hang10: 3.0,
};
const AIR_VALUES = { 0: 4.0, 180: 6.5, 360: 9, 540: 11, 720: 13 };
const RARE = new Set(['rebound180', 'air360', 'air540', 'air720', 'barrelSlash']);
const CATEGORY = (m) => (m.kind === 'air' ? 'air' : m.kind === 'barrel' ? 'barrel' : ['snap', 'verticalSnap', 'reentry', 'slash', 'roundhouse', 'rebound', 'rebound180', 'lip180'].includes(m.kind) ? 'power' : 'other');
const keyOf = (m) => (m.kind === 'air' ? `air${Math.min(720, m.spins)}` : m.kind === 'slash' && m.tube ? 'barrelSlash' : m.kind);
function baseValue(m) {
  if (m.kind === 'air') return AIR_VALUES[Math.min(720, m.spins)] * (m.big ? 1.25 : 1);
  if (m.kind === 'barrel') return Math.min(16, (2.5 + 2.6 * m.time) * (0.7 + 0.9 * m.depth)) * (m.made ? 1 : 0.3); // (time in the tube, more the deeper; caught inside: a little)
  if (m.kind === 'noseride') return Math.min(6, 0.8 * m.time + 0.8 * m.ten);
  if (m.kind === 'slash' && m.tube) return 4.5;
  return MOVE_VALUES[m.kind] ?? 0.5;
}
const sstep = (a, b, x) => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u); };

// The judges (biases on the categories and on flow; spread: their random variation)
export const JUDGES = [
  { name: 'J1', likes: 'airs', bias: { air: 1.18 }, spread: 0.22 },
  { name: 'J2', likes: 'power', bias: { power: 1.15 }, flow: 1.3, spread: 0.2 },
  { name: 'J3', likes: 'barrels', bias: { barrel: 1.18 }, spread: 0.22 },
  { name: 'J4', likes: 'flow', bias: {}, flow: 1.8, spread: 0.2 },
  { name: 'J5', likes: 'by the book', bias: {}, spread: 0.15 },
];
export const GRADES = [[2, 'Poor'], [5, 'Fair'], [6.5, 'Good'], [8, 'Very good'], [Infinity, 'Excellent']];
export const gradeOf = (s) => GRADES.find(([lim]) => s < lim)[1];

// A small seeded random (the same ride and seed scores the same)
function rng(seed) { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) / 4294967296); }; }
function gauss(rand) { const u = Math.max(1e-9, rand()), v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

// Score a ride. ctx: { size (the wave's size against a normal one, 1), seed, seen (Set of maneuver keys used earlier this
// session: innovation) }. Returns the parts, each judge's score, the result and the sheet's shorthand.
export function scoreRide(log, { size = 1, seed = 1, seen = new Set() } = {}) {
  const items = [], counts = {}, firsts = new Set();
  let chain = 0, lastMajor = -9, lastKey = '';
  const flowRatio = log.n ? log.speedRatio / log.n : 0, stallFrac = log.time > 0 ? log.stall / log.time : 0;
  for (const m of log.moves) {
    const k = keyOf(m), base = baseValue(m), major = !MAJOR_EXCLUDE.has(m.kind);
    // criticality: in the pocket and up at the lip vs out on the shoulder (barrels: their depth already says it)
    const crit = m.kind === 'barrel' ? 1 : 0.6 + 0.45 * m.pocket + 0.25 * sstep(0.55, 0.9, m.height); // (0.6 on the shoulder low down .. 1.3 in the pocket at the lip)
    // execution: done (no fall within 0.6 s), the landing, the speed kept
    const fell = log.end && log.end.fall && log.end.t - m.t < 0.6 && m.kind !== 'barrel';
    const kept = m.after == null ? 1 : Math.min(1.1, m.after / Math.max(1, m.speed));
    const exec = fell ? 0 : (m.backwards ? 0.5 : 1) * (0.7 + 0.3 * sstep(0.5, 1, kept));
    // variety: repeats worth less
    const rep = counts[k] || 0; counts[k] = rep + 1;
    const variety = [1, 0.7, 0.4, 0.2][rep] ?? 0; // (a second critical snap is normal in a good ride; a third adds little, a fifth nothing)
    // innovation: new this session, and rare
    const isNew = !seen.has(k) && !firsts.has(k) && base >= 2; if (!seen.has(k)) firsts.add(k);
    const innov = (isNew ? 1.1 : 1) * (RARE.has(k) || (m.kind === 'barrel' && m.depth > 0.5 && m.made) ? 1.1 : 1);
    // combination: linked within 2 s; a stall breaks the chain
    // (the same maneuver again doesn't grow the chain: a combination is different maneuvers linked)
    if (major && !fell) { chain = m.t - lastMajor <= 2 && !m.stalled ? (k === lastKey ? chain : chain + 1) : 1; lastMajor = m.t; lastKey = k; }
    const combo = major ? Math.min(1.5, 1 + 0.12 * (chain - 1)) * (m.combo ? 1.08 : 1) : 1;
    const value = base * crit * exec * variety * innov * combo;
    items.push({ m, key: k, base, crit, exec, variety, innov, combo, value, fell, cat: CATEGORY(m) });
  }
  const flow = Math.min(1.15, Math.max(0.8, 0.85 + 0.3 * (flowRatio - 0.8) / 0.5 - 0.15 * stallFrac));
  // the curve: an S (s / (10 - s) = (R / R0)^1.75): slow over the first maneuver or two, steep as a ride builds, flat toward 10.
  // Fitted on a normal wave: snap - cutback - snap in the pocket (raw ~9.4) 5.0, the start of good; a floater and a snap (~6.5) ~3.4 fair; a straight air, a snap, a floater and a
  // second air (~17) ~7.3 very good; a 360 air, a deep barrel and three linked hits (~50) ~9.5 excellent. (Exponentials gave
  // two maneuvers "good" or the big ride under 9.) R0 by the conditions: smaller waves score high on less.
  const R0 = 9.4 * Math.min(1.3, Math.max(0.75, 0.7 + 0.3 * size));
  const curve = (R) => { const x = (Math.max(0, R) / R0) ** 1.75; return 10 * x / (1 + x); };
  const rand = rng(seed * 2654435761 + Math.round(log.time * 1000));
  const judges = JUDGES.map((J) => {
    const R = items.reduce((a, it) => a + it.value * (J.bias[it.cat] || 1), 0) * flow ** (J.flow || 1);
    const s = Math.min(10, Math.max(0, curve(R) + gauss(rand) * J.spread));
    return { name: J.name, likes: J.likes, score: Math.round(s * 10) / 10 };
  });
  // drop the high and the low, average the rest
  const order = judges.map((j, i) => i).sort((a, b) => judges[a].score - judges[b].score);
  judges[order[0]].dropped = true; judges[order[4]].dropped = true;
  const kept = judges.filter((j) => !j.dropped);
  const score = Math.round(kept.reduce((a, j) => a + j.score, 0) / 3 * 100) / 100;
  const raw = items.reduce((a, it) => a + it.value, 0) * flow;
  return { score, grade: gradeOf(score), judges, raw, flow, items, sheet: shorthand(items, log.end), newMoves: [...firsts] };
}

// The judge's shorthand for the sheet: "BT - snap - cutback - air rev - out"
const SHORT = { bottomTurn: 'BT', topTurn: 'top turn', check: 'check', revert: 'revert', floater: 'float', lip180: '180', roundhouse: 'cutback', slash: 'slash', snap: 'snap', verticalSnap: 'vert snap', reentry: 're-entry', rebound: 'rebound', rebound180: 'rebound 180', hang5: 'hang 5', hang10: 'hang 10' };
export function shorthand(items, end) {
  const out = [];
  for (const it of items) {
    const m = it.m;
    let s = m.kind === 'air' ? `air${m.spins ? ` ${m.spins === 180 ? 'rev' : m.spins}` : ''}${m.backwards ? ' (sketchy)' : ''}`
      : m.kind === 'barrel' ? `tube ${m.time.toFixed(1)}s${m.made ? '' : ' (caught)'}`
        : m.kind === 'noseride' ? `nose ${m.time.toFixed(1)}s`
          : m.kind === 'slash' && m.tube ? 'barrel slash' : SHORT[m.kind] || m.kind;
    if (it.fell) s += ' ✗';
    if (s === 'BT' && out[out.length - 1] === 'BT') continue; // (bottom turns back to back: one)
    out.push(s);
  }
  out.push(!end ? '…' : end.fall ? 'fall' : 'out');
  return out.join(' – ');
}

// A heat (for now the session): every wave's score, the best two count.
export function heatTotal(scores) {
  const top = scores.slice().sort((a, b) => b - a).slice(0, 2);
  return { total: Math.round(top.reduce((a, s) => a + s, 0) * 100) / 100, top };
}
