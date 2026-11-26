// Ride recording and replay (plans/2026-11-23-accounts-and-paid-plans.md, task 2).
//
// A ride is a pure function of (the wave, the sea's seed, the wave's number, the inputs each physics step) (sea.js wave
// addresses, test/determinism.mjs). So a recording is that: the wave's address, the URL options that change the physics,
// and the inputs the sim actually used, step by step (stored only when they change: a keyboard ride is a few hundred
// entries). Replaying feeds them back in and rebuilds every turn, snap and air exactly, so a replay can be re-judged,
// checked, and filmed from any camera.
//
// Checkpoints: every CHECK_EVERY steps the recording keeps the rider's whole state (not just where it is: speed, heading,
// the timers of whatever move it's in). Browsers' Math.sin / exp can differ in the last bit (V8 vs Safari's
// JavaScriptCore), and over a long ride that can grow; a replay snaps the rider back onto each checkpoint (no visible jump
// at that size), and reports how far it had drifted, which a score check can compare with a tolerance.
//
// The sea isn't checkpointed: it doesn't depend on the rider, so it's rebuilt from the address and stepped the same.

export const REPLAY_VERSION = 1;
// Bump when a physics change would make old recordings play differently (they still play: checkpoints keep them on track,
// but the drift shows and a score check would flag them).
export const SIM_VERSION = 6; // (2: 2026-11-24, the tube holds its speed at any depth; 3: 2026-11-25, turn drive from the wave rules; 4: 2026-11-25, no shelf on the flats behind a collapsing tube; 5: 2026-11-25, the vertical snap; 6: 2026-11-25, the flats a fixed floor at sea level)
export const CHECK_EVERY = 120; // steps (1 s at 1/120 s)

// meta: { wave (id), built (a built break's payload, or null), seed, n, params ({ size, map, moveaccel, nosea } when set) }
export function createRecording(meta) {
  return { v: REPLAY_VERSION, sim: SIM_VERSION, step: 1 / 120, ...meta, steps: 0, inputs: [], checks: [], result: null, _last: '' };
}

// Call once per physics step, before stepRider, with the input that step will use and the rider as it is.
export function recordStep(rec, input, rider) {
  if (rec.steps % CHECK_EVERY === 0) rec.checks.push([rec.steps, snapshot(rider)]);
  const inp = compactInput(input), key = JSON.stringify(inp);
  if (key !== rec._last) { rec.inputs.push([rec.steps, inp]); rec._last = key; }
  rec.steps++;
}

// result: { score (the arcade points), judged ({ score, judges } or null), judge ({ seed, seen } the sheet was scored
// with), mode, reason, time }
export function finishRecording(rec, rider, result) {
  rec.checks.push([rec.steps, snapshot(rider)]); // (the end, so a replay can say it ended where the ride did)
  rec.result = result;
  return rec;
}

// To a file and back. JSON, with non-finite numbers kept (the rider uses -Infinity for "never", which JSON would turn into
// null).
export function encodeRecording(rec) {
  const { _last, ...out } = rec;
  return JSON.stringify(out, (k, v) => (typeof v === 'number' && !Number.isFinite(v) ? { '#': String(v) } : v));
}
export function decodeRecording(text) {
  const rec = JSON.parse(text, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) && typeof v['#'] === 'string' && Object.keys(v).length === 1 ? Number(v['#']) : v));
  if (rec.v !== REPLAY_VERSION) throw new Error(`replay version ${rec.v}, this game reads ${REPLAY_VERSION}`);
  // (a file that isn't a whole ride: say so, instead of failing part way through playing it)
  if (!(rec.steps > 0) || !Array.isArray(rec.inputs) || !rec.inputs.length || !Array.isArray(rec.checks) || !rec.checks.length || typeof rec.wave !== 'string') {
    throw new Error("that isn't a whole ride");
  }
  return rec;
}

// Playback. Each step: playerStep(p, rider) before stepRider gives the input and, on a checkpoint step, measures the drift
// and puts the rider back on the recording. p.drift: the largest gap found (m / m/s / rad, whichever was biggest).
export function createPlayer(rec) {
  return { rec, step: 0, ii: 0, ci: 0, input: {}, drift: 0, snaps: 0, done: false };
}
export function playerStep(p, rider) {
  const { rec } = p;
  const c = rec.checks[p.ci];
  if (c && c[0] === p.step) {
    p.ci++;
    if (p.step < rec.steps) { // (the last checkpoint is the end: compared in playerEnd, not snapped to)
      p.drift = Math.max(p.drift, gap(rider, c[1]));
      restore(rider, c[1]);
      if (p.step > 0) p.snaps++;
    }
  }
  while (p.ii < rec.inputs.length && rec.inputs[p.ii][0] <= p.step) { p.input = rec.inputs[p.ii][1]; p.ii++; }
  p.step++;
  if (p.step >= rec.steps) p.done = true;
  return { ...p.input, aim: p.input.aim && p.input.aim.slice() };
}
// After the last step: how far the replay ended from where the ride did.
export function playerEnd(p, rider) {
  const end = p.rec.checks[p.rec.checks.length - 1];
  const g = end && end[0] === p.rec.steps ? gap(rider, end[1]) : Infinity;
  p.drift = Math.max(p.drift, g);
  return { endGap: g, drift: p.drift, sameEnd: g === 0, steps: p.step };
}

// ---- internals ----
// The input as the sim reads it: only what's set (a held key, a non-zero value), numbers exactly as used.
function compactInput(input) {
  const o = {};
  for (const k of Object.keys(input || {})) {
    const v = input[k];
    if (v === undefined || v === null || v === false || v === 0) continue;
    o[k] = Array.isArray(v) ? v.slice() : v;
  }
  return o;
}
// The rider's whole state, as plain data (events are this step's only and are rebuilt each step).
export function snapshot(r) {
  const o = {};
  for (const k of Object.keys(r)) if (k !== 'events') o[k] = clone(r[k]);
  return o;
}
function restore(r, snap) {
  for (const k of Object.keys(r)) if (k !== 'events' && !(k in snap)) delete r[k];
  for (const k of Object.keys(snap)) r[k] = clone(snap[k]);
}
function clone(v) {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(clone);
  if (ArrayBuffer.isView(v)) return Array.from(v);
  const o = {}; for (const k of Object.keys(v)) o[k] = clone(v[k]); return o;
}
// The largest difference in where the rider is and how it's moving.
function gap(r, s) {
  let g = 0;
  const d = (a, b) => { if (a === b) return; g = Math.max(g, typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) : Infinity); };
  d(r.mode, s.mode); d(r.xs, s.xs); d(r.t, s.t); d(r.speed, s.speed); d(r.phi, s.phi);
  for (let i = 0; i < 3; i++) { d(r.pos[i], s.pos[i]); d(r.vel[i], s.vel[i]); }
  return g;
}
