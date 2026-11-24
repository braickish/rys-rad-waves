// What built waves actually do (the surfable-waves plan step 2, 2026-11-24): the builder over its presets and random reefs
// (random blocks and swells), per ride you could DROP IN on (each side of each listed wave with a full ride), the numbers the
// Fun pass's limits are chosen from. Slow (the height model is ~0.3 s a reef): run by hand.
//   node test/survey.mjs            (N=200 random reefs; N=50 node test/survey.mjs for a quick look; FUN=1: the Fun version
//                                    of each ride, src/builder/fun.js)
import { buildDepth, makeGrid, BAY, BAY_DEEP_OFF, defaultCoast } from '../src/builder/reef.js';
import { traceRays, analyse, isRide } from '../src/builder/rays.js';
import { wavePayload, takeoffStart } from '../src/builder/loop.js';
import { reefComponents, dynamicPreset, beachPreset, stackedPreset, newBlock, ARM_ANGLES, ARM_SLOPES, ROTATIONS } from '../src/builder/blocks.js';
import { runPE } from '../src/builder/pewave.js';
import { funPayload } from '../src/builder/fun.js';

const N = Number(process.env.N || 200);
let seed = 12345; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)], range = (a, b) => a + (b - a) * rnd();
const MPH = 2.237, C = 6; // (peel angle from the curl's speed along the crest: tan(alpha) = c / peel)

// a random reef: a peak with one or two arms, and 0-3 extra blocks near them
function randomReef() {
  const x = 780 + Math.round(range(-60, 120) / 10) * 10, y = 520 + Math.round(range(-80, 80) / 10) * 10, bl = [newBlock('peak', x, y)];
  for (const side of rnd() < 0.7 ? [-1, 1] : [pick([-1, 1])]) {
    const a = newBlock('arm', x, y); Object.assign(a, { side, angle: pick(ARM_ANGLES), slope: pick(ARM_SLOPES)[0], length: pick([150, 212, 280]) }); bl.push(a);
  }
  bl[0].slope = pick(ARM_SLOPES)[0];
  const depth = pick([0.7, 1, 1, 1.4, 1.8]), size = pick([1, 1, 1, 1.5]);
  for (const b of bl) { b.depth = depth; b.size = size; }
  for (let k = Math.floor(range(0, 4)); k > 0; k--) {
    const t = pick(['ridge', 'pinnacle', 'ledge', 'sandbar', 'channel', 'pinnacle', 'ridge']);
    const b = newBlock(t, x + Math.round(range(-40, 200) / 10) * 10, y + Math.round(range(-220, 220) / 10) * 10);
    if (b.rot != null) b.rot = pick(ROTATIONS);
    if (t === 'ledge') b.side = pick([-1, 1]);
    bl.push(b);
  }
  return bl;
}
const swellOf = () => ({ H: +range(0.8, 4.5).toFixed(1), T: Math.round(range(8, 18)), dir: Math.round(range(-30, 30) / 5) * 5 });

const rides = [];
function survey(name, blocks, swell, deep = false) {
  const g = buildDepth(reefComponents(blocks, deep), makeGrid(deep ? { ...BAY, offDepth: BAY_DEEP_OFF } : undefined), deep ? Object.assign(defaultCoast(), { deep: true }) : undefined);
  const A = analyse(traceRays(g, swell), g, { pe: runPE(g, swell) }); if (!A) return;
  for (const w of A.waves) for (const sd of ['right', 'left']) {
    const S = w[sd]; if (!S || !isRide(S)) continue;
    const ts = takeoffStart(S); if (!ts) continue;
    const raw = wavePayload(S, sd, 'full', ts.a, ts.b, swell), d = process.env.FUN ? funPayload({ ...raw, fun: true }) : raw, P = d.profile;
    const ang = P.map((p) => Math.atan2(p.c || C, Math.max(0.05, p.peel)) * 180 / Math.PI);
    // rate of change per second of curl (10 m steps: dt = 10 / mean peel)
    let rate = 0, uRate = 0;
    for (let i = 1; i < P.length; i++) { const dt = (P[i].s - P[i - 1].s) / Math.max(0.5, (P[i].peel + P[i - 1].peel) / 2); rate = Math.max(rate, Math.abs(P[i].peel - P[i - 1].peel) * MPH / dt); uRate = Math.max(uRate, Math.abs(P[i].u - P[i - 1].u) / dt); }
    // shape: time between kinds (u within 0.3 of a half-way point), barrels (u >= 2.5) and how long they last (s of curl)
    let limbo = 0, total = 0, barrels = [], run = 0;
    for (let i = 0; i < P.length - 1; i++) {
      const dt = (P[i + 1].s - P[i].s) / Math.max(0.5, P[i].peel); total += dt;
      const f = P[i].u - Math.floor(P[i].u); if (f > 0.2 && f < 0.8) limbo += dt;
      if (P[i].u >= 2.5) run += dt; else if (run) { barrels.push(run); run = 0; }
    }
    if (run) barrels.push(run);
    const tubeH = P.filter((p) => p.u >= 2.5).map((p) => 1.13 * p.H); // (a built tube is ~1.13x the breakers: test/built.mjs)
    const Hs = P.map((p) => p.H), lead = Math.max(0, ...P.map((p) => p.e || 0));
    const take = P.filter((p) => p.s <= 30);
    rides.push({ name, side: sd, wave: w.name, len: d.length, peelMin: Math.min(...P.map((p) => p.peel)) * MPH, peelMax: Math.max(...P.map((p) => p.peel)) * MPH, peelMed: P.map((p) => p.peel).sort((a, b) => a - b)[Math.floor(P.length / 2)] * MPH,
      angMin: Math.min(...ang), angMax: Math.max(...ang), rate, uRate, limbo: limbo / total, barrels, tubeMin: tubeH.length ? Math.min(...tubeH) : null,
      lead, sizeRatio: Math.max(...Hs) / Math.max(0.1, Math.min(...Hs)), takePeel: take.reduce((a, p) => a + p.peel, 0) / take.length * MPH, end: S.end, H: d.H });
  }
}
const t0 = performance.now();
survey('Dynamic', dynamicPreset(), { H: 1.6, T: 15, dir: 0 });
survey('beach', beachPreset(), { H: 1.2, T: 12, dir: 0 });
survey('stacked', stackedPreset(), { H: 3, T: 15, dir: 0 }, true);
for (let i = 0; i < N; i++) { try { survey(`random ${i}`, randomReef(), swellOf(), rnd() < 0.3); } catch (e) { /* (a design the builder can't analyse: skipped) */ } }
const sec = ((performance.now() - t0) / 1000).toFixed(0);

const q = (arr, p) => { const a = arr.filter((x) => x != null && isFinite(x)).sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))] : NaN; };
const row = (label, arr, unit = '', d = 1) => console.log(`${label.padEnd(44)} ${[0.05, 0.25, 0.5, 0.75, 0.95].map((p) => q(arr, p).toFixed(d).padStart(7)).join('')}  ${unit}`);
console.log(`${rides.length} rides from ${N} random reefs + 3 presets (${sec} s)${process.env.FUN ? ': the Fun version' : ''}`);
console.log(`${''.padEnd(44)} ${['5%', '25%', '50%', '75%', '95%'].map((s) => s.padStart(7)).join('')}`);
row('curl speed: slowest on the ride', rides.map((r) => r.peelMin), 'mph');
row('curl speed: median', rides.map((r) => r.peelMed), 'mph');
row('curl speed: fastest on the ride', rides.map((r) => r.peelMax), 'mph');
row('peel angle: smallest (fastest)', rides.map((r) => r.angMin), 'deg', 0);
row('peel angle: largest (slowest)', rides.map((r) => r.angMax), 'deg', 0);
row('curl speed change: steepest', rides.map((r) => r.rate), 'mph/s');
row('shape change: steepest', rides.map((r) => r.uRate), 'scale/s', 2);
row('time between shape kinds', rides.map((r) => r.limbo * 100), '%', 0);
row('barrels: each one\'s length', rides.flatMap((r) => r.barrels), 's');
row('barrels: smallest tube on the ride', rides.map((r) => r.tubeMin), 'm', 2);
row('section lead: longest on the ride', rides.map((r) => r.lead), 's', 2);
row('size along the ride: largest / smallest', rides.map((r) => r.sizeRatio), 'x', 2);
row('takeoff (first 30 m): curl speed', rides.map((r) => r.takePeel), 'mph');
row('breakers', rides.map((r) => r.H * 3.281), 'ft', 0);
row('ride length', rides.map((r) => r.len * 3.281), 'ft', 0);
const pct = (f) => (100 * rides.filter(f).length / rides.length).toFixed(0) + '%';
console.log(`rides with a barrel ${pct((r) => r.barrels.length)} · a barrel under 2 s ${pct((r) => r.barrels.some((b) => b < 2))} · a tube under 1.3 m ${pct((r) => r.tubeMin != null && r.tubeMin < 1.3)}`);
console.log(`rides with a section lead > 0.8 s ${pct((r) => r.lead > 0.8)} · > 1.5 s ${pct((r) => r.lead > 1.5)} · curl over 40 mph ${pct((r) => r.peelMax > 40)} · under 10 mph ${pct((r) => r.peelMin < 10)}`);
console.log(`rides changing speed faster than 10 mph/s ${pct((r) => r.rate > 10)} · 20 mph/s ${pct((r) => r.rate > 20)} · size varying > 1.3x ${pct((r) => r.sizeRatio > 1.3)}`);
const ends = {}; for (const r of rides) ends[r.end] = (ends[r.end] || 0) + 1;
console.log('how rides end:', Object.entries(ends).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(100 * v / rides.length).toFixed(0)}%`).join(' · '));
