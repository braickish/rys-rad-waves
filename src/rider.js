// Surfer control: an arcade model designed for feel, using the wave's shape
// for position and looks. Pure JS (no DOM, no GPU) so it can be tested in node.
//
// State on the face: xs (distance ahead of the curl, in the peel frame), t
// (surface coordinate: smaller = higher on the face), a board speed S
// (relative to the water) and a direction phi (0 = straight down the line,
// +pi/2 = straight up the face, pi = back toward the curl).
//
// Speed:
//  - The pocket feeds you toward a fast cruising speed, faster the higher
//    you are on the face. Out on the shoulder, on flat water, or in the foam
//    the wave bleeds you down instead. So speed lives in the pocket.
//  - Dropping down the face pays a lot; climbing costs only a little, so
//    getting high on the wave is easy and every drop is a burst.
//  - Pumping adds speed on the face, more on the drop.
// Moves:
//  - Snap: reach the top of the wave going up and you snap back down, with a
//    little kick (a bigger one off the crumbling whitewater).
//  - Re-entry: turn back into the curl and hit the whitewater and you rebound
//    off it, heading down the line, faster. Sit in the foam too long and it
//    takes you.

import { surface, slice, phaseAt, verticalHits, segmentHit, PEEL_SPEED, WAVE_SPEED, NP, WAVE_TYPE } from './wave.js';

export const G = 9.8;
export const TUNE = {
  vPocket: 14, // cruising speed the pocket feeds you toward, high on the face (m/s)
  vLow: 4.5, // what you bog down to out on the shoulder or flat water (m/s)
  vFoam: 3, // ... and in the foam
  feed: 2.0, // how fast the pocket brings you up to speed (1/s)
  bleed: 0.9, // how fast extra speed fades / you bog down (1/s)
  drop: 12, // speed gained per second pointing straight down a steep face (m/s^2)
  climb: 2.5, // speed lost per second pointing straight up it (m/s^2): small, so climbing is easy
  pump: 4, // m/s^2 while pumping on the face (full on the drop, less otherwise)
  turn: 5.2, // fastest turn rate (rad/s)
  hardRate: 1.25, // leaning harder (Shift): faster top turn rate ...
  hardRadius: 0.7, // ... and a tighter arc
  minTurn: 1.6, // slowest turn rate, so you can always turn (rad/s)
  rTop: 1.3, // turn radius up near the top of the face: snappy (m)
  rBottom: 4.8, // turn radius at the bottom: a long rail-to-rail arc (m)
  bottomDrive: 4.0, // speed gained per radian of bottom turn, nose coming up (m/s)
  curlZone: [-0.5, 2.5], // xs range of the curl; behind it is whitewater, ahead the open face
  comboWindow: 1.6, // seconds after a bottom turn that a move counts as a combo
  reentryKick: 2.0, // speed kick rebounding off the whitewater in a cutback (m/s)
  reboundSpeed: 12.5, // a rebound fires you out at least this fast (m/s)
  foamLimit: 1.8, // seconds you can sit in heavy foam before it takes you
  airSpeed: 12, // board speed needed to launch off the top going straight up (m/s)
  tTop: 5.3, // surface coordinate of the top of the rideable face
  tBottom: 13.9, // ... and the bottom
  minSpeed: 2, maxSpeed: 18,
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

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clampTurn = (a, max) => Math.sign(a) * Math.min(Math.abs(a), max);
const sstep = (a, b, x) => { const u = clamp((x - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); };

function rotate(a, k, ang) {
  const c = Math.cos(ang), s = Math.sin(ang);
  const kxa = v3.cross(k, a), kda = v3.dot(k, a);
  return [
    a[0] * c + kxa[0] * s + k[0] * kda * (1 - c),
    a[1] * c + kxa[1] * s + k[1] * kda * (1 - c),
    a[2] * c + kxa[2] * s + k[2] * kda * (1 - c),
  ];
}

// How much power the wave has at xs: full in the pocket, fading quickly out
// on the shoulder and behind the curl.
export function pocketPower(xs) {
  if (xs >= 0) return Math.exp(-((xs / 6) ** 2));
  return WAVE_TYPE === 'crumble' ? sstep(-6, -1, xs) : sstep(-13, -9, xs);
}

// How much foam is under the rider (crumbling wave): matches the mesh's foam.
export function foamAt(xs, t) {
  if (WAVE_TYPE !== 'crumble') return phaseAt(xs) > 1.5 && t > 9.5 ? 1 : 0;
  const s = phaseAt(xs);
  const reach = 6 + 7 * sstep(0.0, 0.7, s); // the spill reaches further down the face further behind the curl
  const spill = sstep(-0.15, 0.35, s) * sstep(3.6, 4.6, t) * (1 - sstep(reach - 1.2, reach + 0.6, t));
  return Math.max(spill, sstep(0.8, 1.4, s) * sstep(3.5, 5.0, t));
}

// Surface frame at (xs, t): point, tangents, outward normal, and the unit
// directions down the line (e1) and up the face (e2).
export function frameAt(xs, t) {
  const h = 0.02, hx = 0.05;
  const P = surface(xs, t);
  const Pt = v3.mul(v3.sub(surface(xs, t + h), surface(xs, t - h)), 1 / (2 * h));
  const Px = v3.mul(v3.sub(surface(xs + hx, t), surface(xs - hx, t)), 1 / (2 * hx));
  const n = v3.norm(v3.cross(Pt, Px));
  const e1 = v3.norm(v3.rej([1, 0, 0], n));
  const e2 = v3.norm(v3.cross(n, e1));
  return { P, Pt, Px, n, e1, e2 };
}

// Where the rideable face tops out at xs (the barrel's roof starts earlier).
function topOfFace(xs) {
  return WAVE_TYPE === 'barrel' && phaseAt(xs) > 0.1 ? 11.9 : TUNE.tTop;
}

export function createRider() {
  return {
    mode: 'surf', // 'surf' | 'air' | 'wipe'
    xs: 4, t: 9.5, speed: 9, phi: -0.5,
    pos: [0, 0, 0], vel: [0, 0, 0], heading: [1, 0, 0],
    crouch: false, pumping: false, turnRate: 0,
    inBarrel: false, clearance: 99, barrelTime: 0,
    foam: 0, foamTime: 0, pocket: 0,
    airSpin: 0, airTime: 0, spinArmed: false,
    moveCooldown: 0, lastBottomTurn: -9, bottomArmed: false,
    wipeReason: '', wipeTimer: 0,
    events: [],
    time: 0,
  };
}

export function resetRider(r) {
  Object.assign(r, createRider());
  syncPose(r, frameAt(r.xs, r.t));
}

// Derive 3D position, heading and velocity (peel frame) from surface state.
function syncPose(r, f) {
  r.pos = f.P;
  r.heading = v3.norm(v3.add(v3.mul(f.e1, Math.cos(r.phi)), v3.mul(f.e2, Math.sin(r.phi))));
  r.vel = v3.add(v3.mul(r.heading, r.speed), [-PEEL_SPEED, 0, 0]);
}

function wipe(r, reason) {
  r.mode = 'wipe';
  r.wipeReason = reason;
  r.wipeTimer = 2.2;
  r.inBarrel = false;
  r.events.push({ type: 'wipe', reason });
}

// input: { turn: -1..1 (Left = +1), tilt: -1..1 (Up = +1), aim: [x, y] | null, pump, crouch }
export function stepRider(r, input, dt) {
  r.events.length = 0;
  r.time += dt;
  r.crouch = !!input.crouch;
  r.pumping = false;
  if (r.mode === 'wipe') { r.wipeTimer -= dt; return; }
  if (r.mode === 'surf') stepSurf(r, input, dt);
  else stepAir(r, input, dt);
}

function stepSurf(r, input, dt) {
  const T = TUNE;
  r.moveCooldown = Math.max(0, r.moveCooldown - dt);
  let f = frameAt(r.xs, r.t);

  const pk = pocketPower(r.xs);
  const foam = foamAt(r.xs, r.t);
  const top = topOfFace(r.xs);
  const height = clamp((T.tBottom - r.t) / (T.tBottom - top), 0, 1); // 0 bottom, 1 top
  const low = 1 - sstep(0.15, 0.6, height); // 1 at the bottom of the face, 0 up top
  // 0 on flat water, 1 on a steep face; the pocket counts as steep even near
  // the rounded crest.
  const steep = Math.max(clamp((1 - f.n[1]) / 0.55, 0, 1), 0.85 * pk * sstep(0.05, 0.3, 1 - f.n[1]));
  r.pocket = pk; r.foam = foam;

  // --- steering ---
  // How tight you can turn depends on where you are: up top the board pivots
  // (snappy), at the bottom it's a long rail-to-rail arc. The radius sets the
  // turn rate at your speed.
  // Every input is the same rail-to-rail carve; only the direction differs:
  //  - Left/Right: counterclockwise / clockwise (as seen from the beach)
  //  - Up/Down: whichever way swings the nose up / down the face, until it
  //    points straight up / down (so it never loops you over)
  //  - touch stick: toward where it points, harder the further you push
  // Leaning harder (Shift) tightens the arc and drives more out of it.
  const hard = r.crouch ? 1 : 0;
  const radius = (T.rTop + (T.rBottom - T.rTop) * low) * (hard ? T.hardRadius : 1);
  const rate = clamp(r.speed / radius, T.minTurn, T.turn * (hard ? T.hardRate : 1));
  const sinNow = Math.sin(r.phi), right = Math.cos(r.phi) >= 0;
  let d = 0;
  if (input.turn) d = input.turn * rate * dt;
  else if (input.tilt) {
    const pointed = input.tilt > 0 ? sinNow > 0.97 : sinNow < -0.97;
    if (!pointed) d = (right ? 1 : -1) * Math.sign(input.tilt) * rate * dt;
  } else if (input.aim && (input.aim[0] || input.aim[1])) {
    const push = Math.min(1, Math.hypot(input.aim[0], input.aim[1]));
    d = clampTurn(wrap(Math.atan2(input.aim[1], input.aim[0]) - r.phi), rate * (0.45 + 0.55 * push) * dt);
  }
  // At the bottom of the face you can't go any lower: with no input the board
  // carves its own bottom turn back up.
  if (!d && r.t >= T.tBottom - 0.05 && Math.sin(r.phi) < 0.3) {
    const target = Math.cos(r.phi) >= 0 ? 0.75 : Math.PI - 0.75;
    d = clampTurn(wrap(target - r.phi), rate * dt);
  }
  const sinBefore = Math.sin(r.phi);
  r.phi = wrap(r.phi + d);
  r.turnRate = dt > 0 ? Math.abs(d) / dt : 0;
  // A bottom turn drives you: swinging the nose from down the face back up it,
  // low on the wave, turns the drop into speed up the face.
  if (low > 0 && Math.sin(r.phi) > sinBefore) r.speed += T.bottomDrive * (hard ? 1.35 : 1) * Math.abs(d) * low * (0.4 + 0.6 * pk);

  // Track bottom turns (for moves and combos): down low heading down, then up.
  if (sinBefore < -0.3 && height < 0.45) r.bottomArmed = true;
  if (r.bottomArmed && Math.sin(r.phi) > 0.3) {
    r.bottomArmed = false;
    if (height < 0.6) { r.lastBottomTurn = r.time; r.events.push({ type: 'move', move: 'bottomTurn', speed: r.speed, xs: r.xs }); }
  }
  if (height > 0.75) r.bottomArmed = false;

  // --- speed ---
  let target = T.vLow + (T.vPocket - T.vLow) * pk * steep * (0.55 + 0.45 * height);
  r.boost = Math.max(0, (r.boost || 0) - dt);
  if (r.boost > 0) target = Math.max(target, T.reboundSpeed); // firing out of a rebound: the foam can't hold you
  else target += (T.vFoam - target) * foam;
  r.speed += (target - r.speed) * (r.speed < target ? T.feed : T.bleed) * dt;
  const sinp = Math.sin(r.phi);
  r.speed += (sinp < 0 ? -sinp * T.drop : -sinp * T.climb) * steep * dt;
  if (input.pump && steep > 0.2) {
    r.speed += T.pump * (sinp < -0.1 ? 1 : 0.35) * (0.3 + 0.7 * pk) * dt;
    r.pumping = true;
  }
  if (r.boost > 0) r.speed = Math.max(r.speed, T.reboundSpeed - 1);
  r.speed = clamp(r.speed, T.minSpeed, T.maxSpeed);

  // --- move ---
  const cosp = Math.cos(r.phi);
  r.xs += (r.speed * cosp - PEEL_SPEED) * dt;
  r.t -= (r.speed * sinp * dt) / Math.max(0.3, Math.hypot(f.Pt[1], f.Pt[2]));
  r.t = Math.min(r.t, T.tBottom);

  // --- the top: which move depends on where you hit it, and how ---
  if (r.t <= top && sinp > 0) {
    r.t = top;
    const ph = phaseAt(r.xs);
    if (WAVE_TYPE === 'crumble' && sinp > 0.8 && r.speed > T.airSpeed && ph < -0.15 && r.xs > T.curlZone[1]) {
      f = frameAt(r.xs, r.t);
      r.mode = 'air'; r.airSpin = 0; r.airTime = 0; r.spinArmed = false;
      r.pos = f.P;
      r.vel = [r.speed * cosp - PEEL_SPEED, 3.5 + (r.speed - T.airSpeed) * 0.3, 1.2];
      r.heading = v3.norm([cosp, 0.3, 0]);
      r.events.push({ type: 'launch' });
      return;
    }
    r.phi = -r.phi * 0.85; // flip from going up to going down, same way along the line
    if (r.moveCooldown === 0) {
      // Zones along the wave: the crumbling whitewater, the curl, the open face.
      const inWhitewater = r.xs < T.curlZone[0] || foamAt(r.xs, r.t + 0.6) > 0.3;
      const inCurl = !inWhitewater && r.xs <= T.curlZone[1];
      let move;
      if (inWhitewater) move = sinp > 0.6 ? 'reentry' : 'snap';
      else if (inCurl) move = sinp > 0.45 ? 'snap' : 'topTurn';
      else move = sinp > 0.7 ? 'offLip' : 'topTurn';
      const kick = { reentry: 2.5, snap: 2.0, offLip: 1.2, topTurn: 0.5 }[move];
      r.speed = Math.min(T.maxSpeed, r.speed + kick);
      if (move === 'reentry' || move === 'snap') r.boost = Math.max(r.boost || 0, 0.4);
      const combo = r.time - (r.lastBottomTurn ?? -9) < T.comboWindow;
      r.events.push({ type: 'move', move, speed: r.speed, combo, xs: r.xs });
      r.moveCooldown = 0.35;
    }
  }
  // --- cutback: rebound off the whitewater ---
  if (cosp < -0.15 && foamAt(r.xs, r.t) > 0.45 && r.moveCooldown === 0) {
    r.phi = -0.35 - 0.4 * Math.max(0, Math.sin(r.phi)); // rebound back down the line, a little down the face
    r.speed = Math.min(T.maxSpeed, Math.max(r.speed, T.reboundSpeed) + T.reentryKick);
    r.boost = 0.7;
    r.foamTime = 0;
    r.events.push({ type: 'move', move: 'cutback', speed: r.speed, combo: false });
    r.moveCooldown = 0.35;
  }

  f = frameAt(r.xs, r.t);
  syncPose(r, f);
  checkHazards(r, dt);
}

function stepAir(r, input, dt) {
  r.airTime += dt;
  const prev = r.pos;
  r.vel = v3.add(r.vel, [0, -G * dt, 0]);
  r.pos = v3.add(r.pos, v3.mul(r.vel, dt));
  r.xs = r.pos[0];
  // Spin with a fresh Left/Right press after takeoff.
  if (!input.turn) r.spinArmed = true;
  const spin = r.spinArmed ? (input.turn || 0) * 7.5 * dt : 0;
  r.heading = rotate(r.heading, [0, 1, 0], -spin);
  r.airSpin += spin;

  const sl = slice(r.xs, 10);
  const hit = segmentHit(sl, prev[2], prev[1], r.pos[2], r.pos[1]);
  if (hit && r.vel[2] * hit.nz + r.vel[1] * hit.ny < 0) {
    const half = Math.round(r.airSpin / Math.PI);
    const spinErr = Math.abs(r.airSpin - half * Math.PI);
    r.mode = 'surf';
    r.t = clamp(hit.t, TUNE.tTop, TUNE.tBottom);
    if (hit.nz < -0.05) return wipe(r, 'Landed over the back!');
    if (spinErr > 0.9) return wipe(r, 'Bad landing! (finish the spin)');
    // Land heading down the line and down the face.
    r.phi = -0.5;
    r.speed = clamp(Math.hypot(r.vel[0] + PEEL_SPEED, r.vel[2]), 8, TUNE.maxSpeed);
    syncPose(r, frameAt(r.xs, r.t));
    r.events.push({ type: 'land', spins: Math.abs(half) * 180, airTime: r.airTime });
    return;
  }
  if (r.pos[1] < -2) wipe(r, 'Bad landing!');
}

// Is there water overhead? (barrel wave) The roof is the lip's underside:
// an earlier part of the curve than the face you're riding that overhangs.
function roofClearance(xs, t, pos) {
  const sl = slice(xs, 8);
  let best = Infinity;
  for (const h of verticalHits(sl, pos[2])) {
    if (h.ny < -0.3 && h.t < t - 0.8 && h.y > pos[1] + 0.05) best = Math.min(best, h.y - pos[1]);
  }
  return best;
}

function checkHazards(r, dt) {
  const ph = phaseAt(r.xs);
  // The foam only takes you if you sit in it.
  if (r.foam > 0.6) r.foamTime += dt;
  else r.foamTime = Math.max(0, r.foamTime - dt * 2);
  if (r.foamTime > TUNE.foamLimit) return wipe(r, 'Caught by the whitewater!');
  if (r.xs < -25) return wipe(r, 'Caught by the whitewater!');

  if (WAVE_TYPE !== 'barrel') { r.inBarrel = false; return; }
  const c = roofClearance(r.xs, r.t, r.pos);
  r.clearance = c;
  const was = r.inBarrel;
  r.inBarrel = c < 6 && ph > 0.2;
  if (r.inBarrel) {
    const h = r.crouch ? TUNE.crouchH : TUNE.standH;
    if (ph > 0.4 && c < h) return wipe(r, r.crouch ? 'Closed out!' : 'Head hit the lip! (crouch!)');
    r.barrelTime += dt;
  }
  if (was && !r.inBarrel) { r.events.push({ type: 'barrelExit', time: r.barrelTime }); r.barrelTime = 0; }
  if (!was && r.inBarrel) r.events.push({ type: 'barrelEnter' });
}

// Speed for the HUD: board speed while surfing, ground speed in the air.
export function groundSpeed(r) {
  if (r.mode === 'surf') return r.speed;
  return v3.len(v3.add(r.vel, [PEEL_SPEED, 0, WAVE_SPEED]));
}
