// Surfer physics. Pure JS (no DOM, no GPU) so it can be tested in node.
//
// The rider lives in the peel frame (see wave.js). While surfing they're
// pinned to the surface by surface coordinates (xs, t). Forces:
//   - gravity, projected onto the surface
//   - the board's fin/rail ("keel"): resists sliding sideways relative to the
//     water, which is what lets a surfer trim across the face. In this frame
//     the water flows up the face (the wave moves toward shore) and back along
//     -x (the peel runs away from it), so the keel drags you up and back.
//   - light drag along the board, plus pumping.
// The rider leaves the surface when it curves away faster than gravity can
// hold them (going over the lip fast) and lands when they cross it again.

import { surface, slice, phaseAt, verticalHits, segmentHit, PEEL_SPEED, WAVE_SPEED, NP } from './wave.js';

export const G = 9.8;
export const TUNE = {
  keel: 5.0, // sideways grip (1/s)
  flowUp: 0.6, // effective up-face water flow the keel feels (m/s); sets where the sweet spot is
  drag: 0.06, // along-board drag (1/s)
  power: 0, // small baseline wave push while trimming the steep face (m/s^2 at vertical)
  lift: 1.3, // fraction of gravity's pull-back the wave cancels while you climb the face
  railGrip: 0.95, // how much of a turn redirects momentum (vs. skidding)
  scrub: 0.006, // extra drag per (rad/s)^2 of turning: smooth turns keep speed
  pump: 3.5, // m/s^2 when pumping on the drop (heading down the face)
  turn: 2.6, // rad/s
  crouchTurn: 3.6,
  stick: 3.0, // extra m/s^2 of "suction" before leaving the surface
  standH: 1.75,
  crouchH: 1.1,
};

const v3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  rej: (a, n) => { const d = a[0] * n[0] + a[1] * n[1] + a[2] * n[2]; return [a[0] - n[0] * d, a[1] - n[1] * d, a[2] - n[2] * d]; },
};
export { v3 };

// Rotate a around unit axis k by angle.
function rotate(a, k, ang) {
  const c = Math.cos(ang), s = Math.sin(ang);
  const kxa = v3.cross(k, a), kda = v3.dot(k, a);
  return [
    a[0] * c + kxa[0] * s + k[0] * kda * (1 - c),
    a[1] * c + kxa[1] * s + k[1] * kda * (1 - c),
    a[2] * c + kxa[2] * s + k[2] * kda * (1 - c),
  ];
}

// Surface frame at (xs, t): point, tangents, outward normal, curvature.
export function frameAt(xs, t) {
  const h = 0.02, hx = 0.05;
  const P = surface(xs, t);
  const Pa = surface(xs, t + h), Pb = surface(xs, t - h);
  const Px1 = surface(xs + hx, t), Px0 = surface(xs - hx, t);
  const Pt = v3.mul(v3.sub(Pa, Pb), 1 / (2 * h));
  const Ptt = v3.mul(v3.add(v3.sub(Pa, v3.mul(P, 2)), Pb), 1 / (h * h));
  const Px = v3.mul(v3.sub(Px1, Px0), 1 / (2 * hx));
  const n = v3.norm(v3.cross(Pt, Px));
  // Signed curvature of the cross-section, > 0 where it bulges outward (crest).
  const zp = Pt[2], yp = Pt[1], zpp = Ptt[2], ypp = Ptt[1];
  const sp = Math.hypot(zp, yp) || 1e-6;
  const kappa = -(zp * ypp - yp * zpp) / (sp * sp * sp);
  const T = [0, yp / sp, zp / sp];
  return { P, Pt, Px, n, kappa, T };
}

export function createRider() {
  return {
    mode: 'surf', // 'surf' | 'air' | 'wipe'
    xs: 4, t: 12.0,
    pos: [0, 0, 0], vel: [1.5, 0, 0], heading: [1, 0, 0],
    crouch: false, pumping: false, steer: [0, 0],
    inBarrel: false, clearance: 99, barrelTime: 0,
    airSpin: 0, airTime: 0,
    wipeReason: '', wipeTimer: 0,
    events: [], // things that happened this step, for the HUD/score
    carve: 0, // how hard we're turning, for spray
    time: 0,
  };
}

export function resetRider(r) {
  Object.assign(r, createRider());
  const f = frameAt(r.xs, r.t);
  r.pos = f.P;
  // Just dropped in: angled down the face with some speed.
  r.heading = v3.norm(v3.rej([1, -0.5, 0.4], f.n));
  r.vel = v3.mul(r.heading, 4);
}

function wipe(r, reason) {
  r.mode = 'wipe';
  r.wipeReason = reason;
  r.wipeTimer = 2.2;
  r.inBarrel = false;
  r.events.push({ type: 'wipe', reason });
}

// Is there water overhead? Returns clearance to the roof (Infinity if none).
function roofClearance(xs, pos) {
  const sl = slice(xs, 8);
  let best = Infinity;
  for (const h of verticalHits(sl, pos[2])) {
    if (h.ny < -0.05 && h.y > pos[1] + 0.05) best = Math.min(best, h.y - pos[1]);
  }
  return best;
}

// input: { steer: [x, y] (x: along the wave, y: up the face), pump, crouch }
export function stepRider(r, input, dt) {
  r.events.length = 0;
  r.time += dt;
  r.crouch = !!input.crouch;
  r.pumping = false;
  r.steer = input.steer;
  if (r.mode === 'wipe') {
    r.wipeTimer -= dt;
    return;
  }
  if (r.mode === 'surf') stepSurf(r, input, dt);
  else stepAir(r, input, dt);
}

function stepSurf(r, input, dt) {
  const T = TUNE;
  let f = frameAt(r.xs, r.t);
  const n = f.n;

  // Board heading stays in the tangent plane; turn toward the stick direction.
  let h = v3.norm(v3.rej(r.heading, n));
  const e1 = v3.norm(v3.rej([1, 0, 0], n)); // along the wave
  const e2 = v3.norm(v3.cross(n, e1)); // up the face
  const [sx, sy] = input.steer;
  r.carve *= Math.exp(-dt * 6);
  r.turnRate = 0;
  if (sx || sy) {
    const target = v3.norm(v3.add(v3.mul(e1, sx), v3.mul(e2, sy)));
    const ang = Math.atan2(v3.dot(v3.cross(h, target), n), v3.dot(h, target));
    const rate = r.crouch ? T.crouchTurn : T.turn;
    const d = Math.sign(ang) * Math.min(Math.abs(ang), rate * dt);
    h = rotate(h, n, d);
    r.turnRate = Math.abs(d) / dt;
    // Carving: the rail bends your momentum with the board instead of
    // skidding it off. Rotate velocity relative to the water by the turn.
    const w0 = v3.rej([-PEEL_SPEED, 0, -T.flowUp], n);
    const rel = rotate(v3.sub(v3.rej(r.vel, n), w0), n, d * T.railGrip);
    r.vel = v3.add(rel, w0);
    r.carve = Math.min(1, r.carve + Math.abs(d) / (rate * dt) * dt * 8);
  }
  r.heading = h;

  // Forces.
  const g = v3.rej([0, -G, 0], n);
  const water = v3.rej([-PEEL_SPEED, 0, -T.flowUp], n);
  const vr = v3.sub(r.vel, water);
  const side = v3.norm(v3.cross(n, h));
  let a = g;
  a = v3.sub(a, v3.mul(side, T.keel * (1 + (r.crouch ? 0.3 : 0)) * v3.dot(vr, side)));
  const along = v3.dot(vr, h);
  // Fins stop the board sliding tail-first.
  a = v3.sub(a, v3.mul(h, (along < 0 ? T.keel : T.drag) * along));
  const ph = phaseAt(r.xs);
  // How much the wave is "working" here: steep pocket = lots, shoulder and
  // whitewater = little.
  const steep = Math.max(0, 1 - n[1]) * (ph < 1.2 ? 1 : Math.max(0, 1 - (ph - 1.2) * 3));
  const up = v3.dot(h, e2); // > 0: board pointing up the face
  // Speed comes from going up and down. Dropping converts height to speed at
  // full gravity; climbing back up, the rising wave carries you, so gravity
  // takes back less. Each linked turn nets energy, more in the pocket.
  const gAlong = v3.dot(g, h);
  if (gAlong < 0) a = v3.add(a, v3.mul(h, -gAlong * T.lift * Math.min(1, steep * 2.2)));
  // A little push for trimming the steep face, not enough to keep up alone.
  a = v3.add(a, v3.mul(h, T.power * steep * Math.max(0, v3.dot(h, e1))));
  // Turning too hard scrubs speed.
  a = v3.sub(a, v3.mul(h, T.scrub * r.turnRate * r.turnRate * Math.max(0, v3.dot(vr, h))));
  // Pumping only works on the way down (compress into the drop).
  if (input.pump && ph < 1.4 && up < -0.15 && n[1] < 0.97) {
    a = v3.add(a, v3.mul(h, T.pump * Math.min(1, -up * 2)));
    r.pumping = true;
  }
  r.vel = v3.rej(v3.add(r.vel, v3.mul(a, dt)), n);

  // Leave the surface if it curves away faster than gravity can hold us.
  const vt = v3.dot(r.vel, f.T);
  const normalForce = -f.kappa * vt * vt + G * n[1] + T.stick;
  if (normalForce < 0 && v3.dot(r.vel, f.T) !== 0) {
    r.mode = 'air';
    r.airSpin = 0;
    r.airTime = 0;
    r.pos = f.P;
    r.vel = v3.add(r.vel, v3.mul(n, 0.6)); // small pop off the lip
    r.events.push({ type: 'launch' });
    return;
  }

  // Move in surface coordinates: solve [Px Pt] [dxs dt]^T ~= vel*dt.
  const d = v3.mul(r.vel, dt);
  const a11 = v3.dot(f.Px, f.Px), a12 = v3.dot(f.Px, f.Pt), a22 = v3.dot(f.Pt, f.Pt);
  const b1 = v3.dot(f.Px, d), b2 = v3.dot(f.Pt, d);
  const det = a11 * a22 - a12 * a12 || 1e-9;
  r.xs += (b1 * a22 - b2 * a12) / det;
  r.t += (a11 * b2 - a12 * b1) / det;
  r.t = Math.min(NP - 1.05, Math.max(0.05, r.t));

  // Keep speed, follow the new tangent plane.
  f = frameAt(r.xs, r.t);
  const sp = v3.len(r.vel);
  const vn = v3.rej(r.vel, f.n);
  r.vel = v3.mul(v3.norm(vn), sp);
  r.pos = f.P;

  checkHazards(r, dt, f);
}

function stepAir(r, input, dt) {
  r.airTime += dt;
  const prev = r.pos;
  r.vel = v3.add(r.vel, [0, -G * dt, 0]);
  r.pos = v3.add(r.pos, v3.mul(r.vel, dt));
  r.xs = r.pos[0];
  // Spin with left/right.
  const spin = (input.steer[0] || 0) * 7.5 * dt;
  r.heading = rotate(r.heading, [0, 1, 0], -spin);
  r.airSpin += spin;

  const sl = slice(r.xs, 10);
  const hit = segmentHit(sl, prev[2], prev[1], r.pos[2], r.pos[1]);
  if (hit) {
    const into = r.vel[2] * hit.nz + r.vel[1] * hit.ny;
    if (into < 0) {
      // Landing (or slamming into the lip from underneath).
      if (hit.ny < -0.2) return wipe(r, 'Hit the lip!');
      r.t = hit.t;
      const f = frameAt(r.xs, r.t);
      r.pos = f.P;
      const vt = v3.rej(r.vel, f.n);
      const impact = -v3.dot(r.vel, f.n);
      const h = v3.norm(v3.rej(r.heading, f.n));
      const align = v3.dot(v3.norm(vt), h);
      r.mode = 'surf';
      r.heading = h;
      r.vel = vt;
      const spins = Math.round(Math.abs(r.airSpin) / Math.PI) * 180;
      if (impact > 11) return wipe(r, 'Too much air!');
      if (align < 0.3 && v3.len(vt) > 2) return wipe(r, 'Bad landing!');
      // Landing backwards is fine if you're going slowly; flip the board.
      if (align < 0) r.heading = v3.mul(h, -1);
      r.events.push({ type: 'land', spins, airTime: r.airTime });
      checkHazards(r, dt, f);
      return;
    }
  }
  if (r.pos[1] < -2) wipe(r, 'Bad landing!');
}

function checkHazards(r, dt, f) {
  const ph = phaseAt(r.xs);
  // Caught by the whitewater.
  if (ph > 1.55 && r.t > 9.5) return wipe(r, 'Caught by the whitewater!');
  if (r.xs < -30) return wipe(r, 'Caught by the whitewater!');
  // Fell off the back or washed out in front.
  if (r.t < 2.2) return wipe(r, 'Pulled over the back!');
  if (r.t > 14.6) return wipe(r, 'Lost the wave!');
  if (r.xs > 70) return wipe(r, 'Outran the wave!');

  // Barrel?
  const c = roofClearance(r.xs, r.pos);
  r.clearance = c;
  const was = r.inBarrel;
  r.inBarrel = c < 6;
  if (r.inBarrel) {
    const height = r.crouch ? TUNE.crouchH : TUNE.standH;
    if (c < height) return wipe(r, r.crouch ? 'Closed out!' : 'Head hit the lip! (crouch!)');
    r.barrelTime += dt;
  }
  if (was && !r.inBarrel) {
    r.events.push({ type: 'barrelExit', time: r.barrelTime });
    r.barrelTime = 0;
  }
  if (!was && r.inBarrel) r.events.push({ type: 'barrelEnter' });
}

// Speed relative to the ground (the frame moves with the wave).
export function groundSpeed(r) {
  return v3.len(v3.add(r.vel, [PEEL_SPEED, 0, WAVE_SPEED]));
}
