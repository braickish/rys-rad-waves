// Heats (accounts plan task 3 = live contests plan phase 1: solo heat mode, no network yet).
//
// A heat: a seed, an end (a timer, or a number of waves), and surfers. Everyone surfs the same sea: the heat's seed is
// the sea's seed, so your 1st, 2nd, 3rd ... wave are that seed's waves 0, 1, 2 ... (sea.js wave addresses), however fast
// you ride them. Each wave is judged (judging.js) with the judges' seed from the heat's seed and the wave's number, so a
// sheet is the same on every screen. Your heat total is your best two waves (out of 20); ties go to the best single wave,
// then the second best, then the third (WSL's order).
//
// On a timer a wave counts if you caught it before the horn (as WSL), even if you're still riding it when the horn goes.
// In solo mode the other surfers are bots: each has a skill, and their waves come in on a schedule drawn from the heat's
// seed (so a heat with the same seed has the same rivals with the same scores at the same times).
//
// `needs`: with the target total T (the leader's, or with `advance`, the last advancing place's) and your best two
// b1 >= b2, a new wave w replaces b2, so you need w > T - b1 (to 0.01); "combo" when that's over 10 (you need two).
// Pure: no DOM, no clock of its own (stepHeat moves it on); main.js draws it.

export const JERSEYS = [
  { id: 'red', color: '#e5393b' }, { id: 'white', color: '#f2f2f2' }, { id: 'blue', color: '#2f6fe0' }, { id: 'yellow', color: '#ffd426' },
  { id: 'green', color: '#2fb55a' }, { id: 'black', color: '#1b1b1b' }, { id: 'pink', color: '#ff3d8b' }, { id: 'teal', color: '#00c2c7' },
];
const BOT_NAMES = ['Kai', 'Mara', 'Tuck', 'Noa', 'Juno', 'Ollie', 'Wren'];

// '?heat=10m' -> { minutes: 10 }, '5w' -> { waves: 5 }; anything else -> null
export function parseHeatParam(v) {
  const m = /^(\d+(?:\.\d+)?)\s*(m|min|w|waves?)?$/i.exec(String(v || '').trim());
  if (!m) return null;
  const n = Number(m[1]); if (!(n > 0)) return null;
  return /^w/i.test(m[2] || 'm') ? { waves: Math.max(1, Math.round(n)) } : { minutes: n };
}

export function rng(seed) {
  let s = seed | 0 || 1;
  return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const r2 = (x) => Math.round(x * 100) / 100;

// The judges' seed for wave i (0-based) of a heat.
export function judgeSeed(seed, i) {
  let h = Math.imul((seed | 0) ^ 0x27d4eb2f, 0x165667b1) ^ Math.imul(i + 1, 0x9e3779b1);
  h ^= h >>> 15; h = Math.imul(h, 0x85ebca77); h ^= h >>> 13;
  return (h >>> 0) || 1;
}

// opts: { seed, end: { minutes } | { waves }, you (your name), bots (how many rivals, 0-7), advance (0: one round, the
// winner; N: the top N go through), skills (bots' mean wave scores, else drawn), jersey (your colour's id, from your
// profile: the bots take the others in order; red if none) }
export function createHeat({ seed = 1, end = { minutes: 10 }, you = 'You', bots = 3, advance = 0, skills = null, jersey = 'red' } = {}) {
  const rnd = rng(seed ^ 0x5bd1e995);
  const h = { seed, end, advance, time: 0, duration: end.minutes ? end.minutes * 60 : Infinity, horn: false, done: false, surfers: [], events: [] };
  const mine = JERSEYS.find((j) => j.id === jersey) || JERSEYS[0], others = JERSEYS.filter((j) => j !== mine);
  h.surfers.push({ id: 'you', name: you, you: true, jersey: mine, waves: [], plan: [] });
  const nb = Math.max(0, Math.min(7, bots));
  for (let b = 0; b < nb; b++) {
    // (skills: a spread from steady to sharp, shuffled by the seed: mean wave scores ~3.8-6.4)
    const skill = skills ? skills[b] : 3.8 + (2.6 * (b + rnd())) / Math.max(1, nb);
    const s = { id: `bot${b + 1}`, name: BOT_NAMES[b], bot: true, skill: r2(skill), jersey: others[b], waves: [], plan: [] };
    // (the waves they ride: on a timer, the first 20-60 s in, then every 45-95 s; a wave count, that many, every 35-70 s)
    const gauss = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
    let at = end.minutes ? 20 + rnd() * 40 : 15 + rnd() * 30;
    for (let k = 0; end.minutes ? at < h.duration : k < end.waves; k++) {
      s.plan.push({ at: r2(at), score: r2(Math.min(9.9, Math.max(0.3, skill + 1.4 * gauss()))) });
      at += end.minutes ? 45 + rnd() * 50 : 35 + rnd() * 35;
    }
    h.surfers.push(s);
  }
  return h;
}
export const you = (h) => h.surfers[0];

// Move the heat's clock on (seconds of heat time). Bots' waves come in as their times pass; the horn sounds at the end of a
// timer. Returns this step's events: { type: 'score', surfer, score, wave } | { type: 'horn' }.
export function stepHeat(h, dt) {
  h.events = [];
  if (h.done) return h.events;
  h.time += dt;
  for (const s of h.surfers) {
    while (s.plan.length && s.plan[0].at <= h.time && s.plan[0].at < h.duration) {
      const w = s.plan.shift();
      s.waves.push({ n: s.waves.length, score: w.score, at: w.at });
      h.events.push({ type: 'score', surfer: s, score: w.score, wave: s.waves.length });
    }
  }
  if (!h.horn && h.time >= h.duration) { h.horn = true; h.events.push({ type: 'horn' }); }
  return h.events;
}

// Can you catch another wave that counts? (a timer: before the horn; a wave count: you haven't ridden them all)
export function canCatch(h) {
  if (h.done) return false;
  return h.end.minutes ? h.time < h.duration : you(h).waves.length < h.end.waves;
}
// Your wave, scored: counts if it was caught before the horn (`at`: heat time at the drop-in) / within the wave count.
export function addWave(h, { score, at, ride = null }) {
  const me = you(h);
  const counts = h.end.minutes ? at < h.duration : me.waves.length < h.end.waves;
  if (counts) me.waves.push({ n: me.waves.length, score: r2(score), at, ride });
  return counts;
}
// Over? (a timer: the horn has gone and you're not on a wave; a wave count: you've ridden yours, and the bots' remaining
// waves come in at once, as if you'd waited on the beach for them)
export function checkOver(h, riding) {
  if (h.done) return true;
  if (h.end.minutes ? h.horn && !riding : you(h).waves.length >= h.end.waves && !riding) {
    if (h.end.waves) for (const s of h.surfers) while (s.plan.length) { const w = s.plan.shift(); s.waves.push({ n: s.waves.length, score: w.score, at: w.at }); }
    h.done = true;
  }
  return h.done;
}

// Best two, in order.
export function bestTwo(waves) {
  const top = waves.map((w) => w.score).sort((a, b) => b - a).slice(0, 2);
  return { top, total: r2(top.reduce((a, s) => a + s, 0)) };
}
// Who's ahead: the higher total, then the best single wave, the second, the third ... (WSL)
export function compare(a, b) {
  if (a.total !== b.total) return b.total - a.total;
  const sa = a.scores, sb = b.scores;
  for (let i = 0; i < Math.max(sa.length, sb.length); i++) { const x = sa[i] ?? -1, y = sb[i] ?? -1; if (x !== y) return y - x; }
  return 0;
}
// What a surfer with best two b1 >= b2 needs on one wave to pass a total T: { score } (to 0.01) or { combo: true }.
export function needFor(top, T) {
  const b1 = top[0] ?? 0;
  const w = r2(Math.floor((T - b1) * 100 + 1e-6) / 100 + 0.01);
  return w > 10 ? { combo: true } : { score: Math.max(0.01, w) };
}
// The standings: [{ surfer, total, top, scores (all, best first), place, need: { score | combo, for: 'win' | 'adv' } | null }]
export function standings(h) {
  const rows = h.surfers.map((s) => { const b = bestTwo(s.waves); return { surfer: s, total: b.total, top: b.top, scores: s.waves.map((w) => w.score).sort((a, b) => b - a) }; });
  rows.sort(compare);
  rows.forEach((r, i) => { r.place = i > 0 && compare(rows[i - 1], r) === 0 ? rows[i - 1].place : i + 1; });
  const adv = h.advance > 0 && h.advance < rows.length ? h.advance : 0;
  for (const r of rows) {
    r.need = null;
    if (adv) { if (r.place > adv) r.need = { ...needFor(r.top, rows[adv - 1].total), for: 'adv' }; }
    else if (r.place > 1) r.need = { ...needFor(r.top, rows[0].total), for: 'win' };
  }
  return rows;
}
// "8:41" / "0:07" for the heat clock (counting down), or "Wave 3 of 5".
export function clockText(h) {
  if (h.end.minutes) { const left = Math.max(0, Math.ceil(h.duration - h.time)); return `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`; }
  return `Wave ${Math.min(h.end.waves, you(h).waves.length + 1)} of ${h.end.waves}`;
}
