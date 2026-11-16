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

import { surface, slice, phaseAt, verticalHits, segmentHit, PEEL_SPEED, WAVE_SPEED, NP, WAVE_TYPE } from './wave.js';

export const G = 9.8;
export const TUNE = {
  keel: 5.0, // sideways grip (1/s)
  flowUp: 0.6, // effective up-face water flow the keel feels (m/s)
  drag: 0.06, // along-board drag in the pocket (1/s)
  shoulderDrag: 0.35, // extra drag out on the shoulder, where the wave has no push (1/s)
  foamDrag: 1.2, // extra drag riding in the crumbling foam (1/s)
  pocketWidth: 5.0, // how far ahead of the curl the pocket's power reaches (m)
  curlPush: 1.0, // push down the line from the curl, trimming high in the pocket (m/s^2)
  lift: 1.3, // how strongly the wave carries you up the face while climbing (scaled by steepness)
  liftCap: 0.9, // never cancel more than this fraction of gravity, or climbing would speed you up
  railGrip: 0.95, // how much of a turn redirects momentum (vs. skidding)
  scrub: 0.002, // extra drag per (rad/s)^2 of turning: smooth turns keep speed
  pump: 5.0, // m/s^2 when pumping on the drop (heading down the face)
  glide: 5.0, // minimum board speed through the water in the pocket (m/s)
  turn: 4.2, // rad/s
  crouchTurn: 5.2,
  maxTilt: 1.1, // how far Up/Down point the nose off the line (rad, ~63 deg)
  lipT: 5.6, // surface coordinate of the lip on an open face (crest is 4)
  bottomT: 14.2, // bottom of the face
  airSpeed: 5.5, // up-face speed needed to launch off the lip (m/s)
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

const sstep = (a, b, x) => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u); };
// How much power the wave has at xs: full in the pocket and through the
// barrel, fading quickly out on the shoulder and once it closes out.
export function pocketPower(xs) {
  if (xs >= 0) return Math.exp(-((xs / TUNE.pocketWidth) ** 2));
  // Behind the curl: a barrel keeps its power until it closes out; a
  // crumbling section is foam, so the power fades fast.
  return WAVE_TYPE === 'crumble' ? sstep(-6, -1, xs) : sstep(-13, -9, xs);
}

// How much foam is under the rider (crumbling wave): matches the mesh's foam.
export function foamAt(xs, t) {
  if (WAVE_TYPE !== 'crumble') return 0;
  const s = phaseAt(xs);
  const reach = 6 + 7 * sstep(0.0, 1.1, s);
  const spill = sstep(-0.15, 0.35, s) * sstep(3.6, 4.6, t) * (1 - sstep(reach - 1.2, reach + 0.6, t));
  return Math.max(spill, sstep(0.8, 1.4, s) * sstep(3.5, 5.0, t));
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
    crouch: false, pumping: false,
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
// The roof is the lip's underside: an earlier part of the curve than the face
// you're riding (t well below yours) that really overhangs.
function roofClearance(xs, t, pos) {
  const sl = slice(xs, 8);
  let best = Infinity;
  for (const h of verticalHits(sl, pos[2])) {
    if (h.ny < -0.3 && h.t < t - 0.8 && h.y > pos[1] + 0.05) best = Math.min(best, h.y - pos[1]);
  }
  return best;
}

// input: { turn: -1..1 (Left = +1), tilt: -1..1 (Up = +1), aim: [x, y] | null, pump, crouch }
export function stepRider(r, input, dt) {
  r.events.length = 0;
  r.time += dt;
  r.crouch = !!input.crouch;
  r.pumping = false;
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

  // Board heading stays in the tangent plane. Three ways to steer:
  //  - Left/Right (input.turn): carve the board around, counterclockwise /
  //    clockwise as seen from in front of the wave. Full freedom (cutbacks).
  //  - Up/Down (input.tilt): point the nose up or down the face, relative to
  //    whichever way you're riding; the turn swings through the front.
  //  - Touch stick (input.aim): point the board where the stick points.
  let h = v3.norm(v3.rej(r.heading, n));
  const e1 = v3.norm(v3.rej([1, 0, 0], n)); // down the line
  const e2 = v3.norm(v3.cross(n, e1)); // up the face
  r.carve *= Math.exp(-dt * 6);
  r.turnRate = 0;
  const rate = r.crouch ? T.crouchTurn : T.turn;
  const phi = Math.atan2(v3.dot(h, e2), v3.dot(h, e1));
  let d = 0;
  if (input.turn) {
    d = input.turn * rate * dt;
  } else if (input.aim && (input.aim[0] || input.aim[1])) {
    d = clampTurn(wrap(Math.atan2(input.aim[1], input.aim[0]) - phi), rate * dt);
  } else if (input.tilt) {
    const right = Math.cos(phi) >= 0;
    const target = right ? input.tilt * T.maxTilt : Math.PI - input.tilt * T.maxTilt;
    d = clampTurn(wrap(target - phi), rate * dt);
  }
  if (d) {
    // Carving: the rail bends your forward momentum with the board. Only the
    // forward part turns; sideways slide is left for the fins to kill.
    const w0 = v3.rej([-PEEL_SPEED, 0, -T.flowUp], n);
    const rel = v3.sub(v3.rej(r.vel, n), w0);
    const fwdSpeed = v3.dot(rel, h);
    if (fwdSpeed > 0) {
      const sidePart = v3.sub(rel, v3.mul(h, fwdSpeed));
      const fwd = v3.mul(rotate(h, n, d * T.railGrip), fwdSpeed);
      r.vel = v3.add(v3.add(fwd, sidePart), w0);
    }
    h = v3.norm(rotate(h, n, d));
    r.turnRate = Math.abs(d) / dt;
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
  const pk = pocketPower(r.xs);
  r.pocket = pk;
  // Out on the shoulder the wave has no push and the board bogs down; in the
  // crumbling foam behind the curl it bogs down harder.
  const foam = foamAt(r.xs, r.t);
  r.foam = foam;
  const steepHere = Math.max(0, 1 - n[1]);
  const flats = 1 - sstep(0.06, 0.2, steepHere); // flat water in front of / behind the wave
  const bog = Math.max(r.xs > 0 ? T.shoulderDrag * (1 - pk) : 0, T.shoulderDrag * flats);
  if (along > 0) a = v3.sub(a, v3.mul(h, (bog + T.foamDrag * foam) * along));
  const steep = Math.max(0, 1 - n[1]);
  const up = v3.dot(h, e2); // > 0: board pointing up the face
  // Speed comes from going up and down in the pocket. Dropping converts
  // height to speed at full gravity; climbing back up, the rising wave
  // carries you, so gravity takes back less. Only where the wave has power.
  const gAlong = v3.dot(g, h);
  if (gAlong < 0) a = v3.add(a, v3.mul(h, -gAlong * Math.min(T.liftCap, T.lift * steep * 2.2) * pk));
  // The curl drives you down the line when you trim high in the pocket.
  const high = sstep(0.4, 2.4, r.pos[1]);
  a = v3.add(a, v3.mul(h, T.curlPush * pk * high * sstep(0.12, 0.35, steep) * Math.max(0, Math.abs(v3.dot(h, e1)))));
  // Glide: in the pocket a board turning back up the face never stalls
  // completely, so you can always climb out of the flats. No help riding
  // straight down the line.
  const onFace = sstep(0.12, 0.35, steep); // the flats in front of the wave don't count
  if (ph < 1.3 && up > 0.2 && along < T.glide * pk * onFace) a = v3.add(a, v3.mul(h, (T.glide * pk * onFace - along) * 1.5));
  // Turning too hard scrubs speed.
  a = v3.sub(a, v3.mul(h, T.scrub * r.turnRate * r.turnRate * Math.max(0, along)));
  // Pumping only works on the way down (compress into the drop), and does
  // most where the wave has power.
  if (input.pump && ph < 1.4 && up < -0.15 && n[1] < 0.97) {
    a = v3.add(a, v3.mul(h, T.pump * (0.35 + 0.65 * pk) * Math.min(1, -up * 2)));
    r.pumping = true;
  }
  r.vel = v3.rej(v3.add(r.vel, v3.mul(a, dt)), n);

  // The top and bottom of the face are soft walls (arcade, not physics):
  //  - Hit the open lip fast enough and you launch an air.
  //  - Otherwise the lip (or the barrel's roof, where the surface starts to
  //    overhang) gives you a snappy top turn back down the face.
  //  - At the bottom, a bottom turn swings you back up instead of riding off
  //    the front of the wave.
  r.wallCooldown = Math.max(0, (r.wallCooldown || 0) - dt);
  const vUp = v3.dot(r.vel, e2);
  const atLip = r.t < T.lipT;
  const atRoof = n[1] < -0.05;
  if ((atLip || atRoof) && vUp > 0) {
    if (atLip && !atRoof && n[2] > 0.1 && vUp > T.airSpeed && ph < (WAVE_TYPE === 'crumble' ? -0.1 : 0.6)) {
      // Air: turn the up-the-face speed into height, drifting slightly toward
      // shore, so you come down on the face rather than over the back.
      r.mode = 'air';
      r.airSpin = 0;
      r.airTime = 0;
      r.spinArmed = false;
      r.pos = f.P;
      r.vel = [r.vel[0], Math.min(4.5, vUp * 0.6 + 1.5), 1.2];
      r.events.push({ type: 'launch' });
      return;
    }
    r.vel = v3.sub(r.vel, v3.mul(e2, vUp * 1.25));
    r.heading = snapToward(r.heading, n, e1, e2, Math.cos(phi) >= 0 ? -0.8 : Math.PI + 0.8, T.turn * 2 * dt);
    if (r.wallCooldown === 0 && vUp > 2.5) {
      const crumbling = WAVE_TYPE === 'crumble' && ph > -0.35 && ph < 1.1;
      r.events.push({ type: atRoof ? 'roofTurn' : crumbling ? 'snap' : 'topTurn', speed: vUp });
      r.carve = 1;
    }
    r.wallCooldown = 0.5;
  }
  if (r.t > T.bottomT && vUp < 0) {
    r.vel = v3.sub(r.vel, v3.mul(e2, vUp * 1.1));
    r.heading = snapToward(r.heading, n, e1, e2, Math.cos(phi) >= 0 ? 0.7 : Math.PI - 0.7, T.turn * 1.5 * dt);
  }

  // Move in surface coordinates: solve [Px Pt] [dxs dt]^T ~= vel*dt.
  const step = v3.mul(r.vel, dt);
  const a11 = v3.dot(f.Px, f.Px), a12 = v3.dot(f.Px, f.Pt), a22 = v3.dot(f.Pt, f.Pt);
  const b1 = v3.dot(f.Px, step), b2 = v3.dot(f.Pt, step);
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

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clampTurn = (a, max) => Math.sign(a) * Math.min(Math.abs(a), max);

// Rotate heading toward a tilt angle off the line (used by top/bottom turns).
function snapToward(h, n, e1, e2, targetPhi, maxStep) {
  const phi = Math.atan2(v3.dot(h, e2), v3.dot(h, e1));
  let ang = targetPhi - phi;
  ang = Math.atan2(Math.sin(ang), Math.cos(ang));
  const d = Math.sign(ang) * Math.min(Math.abs(ang), maxStep);
  return v3.norm(rotate(h, n, d));
}

function stepAir(r, input, dt) {
  r.airTime += dt;
  const prev = r.pos;
  r.vel = v3.add(r.vel, [0, -G * dt, 0]);
  r.pos = v3.add(r.pos, v3.mul(r.vel, dt));
  r.xs = r.pos[0];
  // Spin with a fresh Left/Right press after takeoff, so holding Right
  // through the launch doesn't twist the board.
  if (!input.turn) r.spinArmed = true;
  const spin = r.spinArmed ? (input.turn || 0) * 7.5 * dt : 0;
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
      // Spins must come round close to a multiple of 180 degrees.
      const half = Math.round(r.airSpin / Math.PI);
      const spinErr = Math.abs(r.airSpin - half * Math.PI);
      const spins = Math.abs(half) * 180;
      r.mode = 'surf';
      if (f.n[2] < -0.05) return wipe(r, 'Landed over the back!');
      if (impact > 11) return wipe(r, 'Too much air!');
      if (spinErr > 0.9) return wipe(r, 'Bad landing! (finish the spin)');
      // Re-entry: the board lines up down the line, angled down the face.
      const e1 = v3.norm(v3.rej([1, 0, 0], f.n));
      const e2 = v3.norm(v3.cross(f.n, e1));
      r.heading = v3.norm(v3.add(e1, v3.mul(e2, -0.6)));
      const w = v3.rej([-PEEL_SPEED, 0, -TUNE.flowUp], f.n);
      r.vel = v3.add(v3.mul(r.heading, Math.max(TUNE.glide, v3.len(v3.sub(vt, w)) * 0.85)), w);
      r.events.push({ type: 'land', spins, airTime: r.airTime });
      checkHazards(r, dt, f);
      return;
    }
  }
  if (r.pos[1] < -2) wipe(r, 'Bad landing!');
}

function checkHazards(r, dt, f) {
  const ph = phaseAt(r.xs);
  // Up on the lip itself (not the face) where the wave is pitching, and the
  // surface tips past vertical under you: you go with it.
  if (ph > 0 && r.t < 11.5 && f.n[1] < 0.1) return wipe(r, 'Over the falls!');
  // Caught by the whitewater.
  if (ph > 1.55 && r.t > 9.5) return wipe(r, 'Caught by the whitewater!');
  if (r.xs < -30) return wipe(r, 'Caught by the whitewater!');
  // Fell off the back or washed out in front.
  if (r.t < 2.2) return wipe(r, 'Pulled over the back!');
  if (r.t > 14.6) return wipe(r, 'Lost the wave!');

  // Barrel?
  const c = roofClearance(r.xs, r.t, r.pos);
  r.clearance = c;
  const was = r.inBarrel;
  // A tube only counts once the lip has really thrown over (phase > 0.2),
  // and it only hurts once the lip is coming down (phase > 0.4): before that
  // it's throwing out and away from you, which is the pocket.
  r.inBarrel = c < 6 && ph > 0.2;
  if (r.inBarrel) {
    const height = r.crouch ? TUNE.crouchH : TUNE.standH;
    if (ph > 0.4 && c < height) return wipe(r, r.crouch ? 'Closed out!' : 'Head hit the lip! (crouch!)');
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
