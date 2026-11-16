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
// Moves (quick board pivots; none of them add speed by themselves):
//  - Turning at the lip: snap / off the lip / top turn, pivoting you to point
//    straight down from the lip. Not turning: up and over the back (or an
//    air if you're fast enough).
//  - Into the whitewater heading down the line: floater.
//  - Turning back into the whitewater, high, turning as you hit: rebound.
//    Sit in the foam too long and it takes you.

import { surface, slice, phaseAt, verticalHits, segmentHit, PEEL_SPEED, WAVE_SPEED, NP, WAVE_TYPE, WAVE, setWave } from './wave.js';

export const G = 9.8;
// The rider's and board's settings. Wave-specific settings (pocket speeds,
// zones, face limits, airs...) come from the active wave's `tune` and are
// merged in by useWave().
const RIDER_TUNE = {
  feed: 2.0, // how fast the pocket brings you up to speed (1/s)
  bleed: 0.9, // how fast extra speed fades / you bog down (1/s)
  climb: 2.5, // speed lost per second pointing straight up it (m/s^2): small, so climbing is easy
  pump: 4, // m/s^2 while pumping on the face (full on the drop, less otherwise)
  turn: 5.2, // fastest turn rate (rad/s)
  hardAfter: [0.25, 0.6], // hold a turn this long (s) and you lean into it harder ...
  hardRate: 1.25, // ... a faster top turn rate ...
  hardRadius: 0.7, // ... and a tighter arc
  snapRate: 13,
  moveCalm: 0.95,
  moveScrub: { snap: 0.08, offLip: 0.07, reentry: 0.08, topTurn: 0.04, lip180: 0.1, floater: 0.05, rebound: 0.1, rebound180: 0.1, revert: 0.05, land: 0.05 }, // speed each move costs // no speeding up for this long after a move (s); 0 = off (?moveaccel)
  fakieTime: 0.7, // after landing backwards, ride it this long (s) ...
  fakieSpinRate: 18, // ... then the board spins back round this fast (rad/s)
  lip180Rate: 14, // the quick 180 off the top when you turn toward the whitewater (rad/s) // how fast the board pivots back down in a snap (rad/s): quick, not instant
  reboundRate: 11, // rebound off the whitewater, nose swinging down (rad/s)
  rebound180Rate: 12, // rebound 180 around through the top (rad/s)
  minTurn: 1.6, // slowest turn rate, so you can always turn (rad/s)
  rTop: 1.3, // turn radius up near the top of the face: snappy (m)
  rBottom: 4.8, // turn radius at the bottom: a long rail-to-rail arc (m)
  bottomDrive: 8.0, // speed gained per radian of bottom turn, nose coming up (m/s)
  bottomCarveRadius: 1.15, // a bottom turn started pointing down: fully committed at once, a slightly wider arc ...
  bottomCarveDrive: 1.6, // ... that builds more speed
  topDrive: 1.6,
  maxAccel: 10, // speed never builds faster than this when slow (m/s^2, ~22 mph per second) ...
  maxAccelFast: 0.3,
  accelTaper: [7, 14], // ... between these speeds (m/s, ~16 -> 31 mph)
  driveSmooth: 0.2, // turn drive builds in over about this long (s), no jumps
  turnWindow: 0.08, // steering this recently when you reach the lip = a turn off the top; otherwise an air
  lipExit: 1.2, // moves off the lip point you this far below the line (rad, ~70 deg)
  foamExit: 0.6, // ... but out of the whitewater, shallower (down and forward, ~35 deg) // speed gained per radian of carving up near the top of the pocket (m/s)
  comboWindow: 1.6, // seconds after a bottom turn that a move counts as a combo
  moveGap: 1.0, // at least this long between moves (s), so they don't stack
  airPop: 5.0, // upward speed off the lip for an air (m/s)
  airDrift: -1.5, // in the air the wave carries you along: you never drift back faster than this (m/s)
  softMax: 14.5, // above this (~32 mph) extra speed bleeds off quickly ...
  overBleed: 1.6, // ... at this rate (1/s)
  minSpeed: 2, maxSpeed: 17.5, // hard cap ~39 mph
  standH: 1.75,
  crouchH: 1.1,
};
export const TUNE = {};
let waveRef = null; // cached trough/crest heights for waveHeightFrac

// Make a wave active for riding: its shape (wave.js) and its settings.
export function useWave(w) {
  setWave(w);
  for (const k of Object.keys(TUNE)) delete TUNE[k];
  Object.assign(TUNE, RIDER_TUNE, WAVE.tune);
  waveRef = null;
}


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
  return WAVE.pocket(xs);
}

// How much foam is under the rider (from the wave; the mesh draws the same foam).
export function foamAt(xs, t) {
  return WAVE.foam(phaseAt(xs), t);
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

// How high you are as a fraction of the full open wave (trough to crest at
// the curl), measured in real height, not position along the surface.
function waveHeightFrac(y) {
  if (!waveRef) waveRef = { lo: surface(0.5, TUNE.tBottom)[1], hi: surface(0.5, 4)[1] };
  return clamp((y - waveRef.lo) / (waveRef.hi - waveRef.lo), 0, 1);
}

// Heading up the face and down the line (climbing up the whitewater).
function climbingFoam(r) {
  return Math.sin(r.phi) > 0.2 && Math.cos(r.phi) > -0.15;
}

// Where the rideable face tops out at xs (the barrel's roof starts earlier).
function topOfFace(xs) {
  return WAVE.faceTop(phaseAt(xs));
}

export function createRider() {
  return {
    mode: 'surf', // 'surf' | 'air' | 'wipe'
    xs: 4, t: 9.5, speed: 9, phi: -0.85, // drop in angled well down the face
    pos: [0, 0, 0], vel: [0, 0, 0], heading: [1, 0, 0],
    crouch: false, pumping: false, turnRate: 0,
    inBarrel: false, clearance: 99, barrelTime: 0,
    foam: 0, foamTime: 0, pocket: 0,
    airSpin: 0, airTime: 0, spinArmed: false,
    moveCooldown: 0, lastBottomTurn: -9, bottomArmed: false,
    fakie: null, driveBank: 0, lastTurnTime: -9, lastTurnDir: 0, overTheBack: false,
    rideDir: 1, turnDir: 0, turnDirAge: 9, turnHeld: 0, hard: 0, assist: null, bottomCarve: false, floater: null,
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
  const travel = v3.norm(v3.add(v3.mul(f.e1, Math.cos(r.phi)), v3.mul(f.e2, Math.sin(r.phi))));
  r.vel = v3.add(v3.mul(travel, r.speed), [-PEEL_SPEED, 0, 0]);
  // Riding backwards after a reverse landing: the board points the other way
  // from where you're going (until it spins back round).
  r.heading = r.fakie ? v3.norm(rotate(travel, f.n, Math.PI - r.fakie.spin)) : travel;
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
  for (const e of r.events) {
    if ((e.type === 'move' && e.move !== 'bottomTurn') || e.type === 'land') {
      r.calm = TUNE.moveCalm;
      // A move costs a little speed (the board scrubs as it pivots), and any
      // drive still banked from the bottom turn is spent.
      r.speed *= 1 - (TUNE.moveScrub[e.move || 'land'] || 0);
      r.postMove = true;
      r.driveBank = 0;
    }
  }
  // A turn off the lip springs the body open (for the surfer's pose).
  r.unload = Math.max(0, (r.unload || 0) - dt);
  if (r.events.some((e) => e.type === 'move' && ['snap', 'offLip', 'reentry', 'topTurn', 'lip180'].includes(e.move))) r.unload = 0.45;
}

function stepSurf(r, input, dt) {
  const T = TUNE;
  r.moveCooldown = Math.max(0, r.moveCooldown - dt);
  const speedAtStart = r.speed;
  // Riding backwards: after a moment the board spins back round to forwards.
  if (r.fakie) {
    r.fakie.time += dt;
    if (r.fakie.time > T.fakieTime) {
      r.fakie.spin += T.fakieSpinRate * dt;
      if (r.fakie.spin >= Math.PI) { r.fakie = null; r.events.push({ type: 'move', move: 'revert', speed: r.speed, xs: r.xs }); }
    }
  }
  let f = frameAt(r.xs, r.t);

  const pk = pocketPower(r.xs);
  const foam = foamAt(r.xs, r.t);
  const top = topOfFace(r.xs);
  const height = clamp((T.tBottom - r.t) / (T.tBottom - top), 0, 1); // 0 bottom, 1 top
  const low = 1 - sstep(0.15, 0.6, height); // 1 at the bottom of the face, 0 up top
  // 0 on flat water, 1 on a steep face; the pocket counts as steep even near
  // the rounded crest.
  const steep = Math.max(clamp((1 - f.n[1]) / 0.55, 0, 1), 0.85 * pk * sstep(0.05, 0.3, 1 - f.n[1]));
  r.pocket = pk; r.foam = foam; r.height = height;

  // --- steering ---
  // Every input is the same rail-to-rail carve; only the direction differs:
  //  - Left/Right: counterclockwise / clockwise (as seen from the beach)
  //  - Up/Down: whichever way swings the nose up / down the face, until it
  //    points straight up / down (so it never loops you over)
  //  - touch stick: toward where it points, harder the further you push
  // How tight you can turn depends on where you are: up top the board pivots
  // (snappy), at the bottom it's a long rail-to-rail arc. Hold a turn and you
  // progressively lean into it harder: a tighter arc that drives more.
  // Start a turn while pointing down the face (a bottom turn) and you're
  // committed at once: full lean, a slightly wider arc, more drive.
  const wantsTurn = !!(input.turn || input.tilt || (input.aim && (input.aim[0] || input.aim[1])));
  if (!wantsTurn || Math.sin(r.phi) > 0.5) r.bottomCarve = false;
  else if (r.turnHeld === 0 && !r.turnDir && Math.sin(r.phi) < -0.3 && height < 0.6) r.bottomCarve = true;
  const hard = r.bottomCarve ? 1 : r.hard;
  const radius = (T.rTop + (T.rBottom - T.rTop) * low) * (r.bottomCarve ? T.bottomCarveRadius : 1 - (1 - T.hardRadius) * hard);
  const rate = clamp(r.speed / radius, T.minTurn, T.turn * (1 + (T.hardRate - 1) * hard));
  // Which way you're riding along the wave, with hysteresis: it only flips
  // once you're clearly heading the other way, so Up/Down can't swap
  // direction while the nose is near vertical (e.g. coming off a snap).
  if (Math.cos(r.phi) > 0.3) r.rideDir = 1;
  else if (Math.cos(r.phi) < -0.3) r.rideDir = -1;
  // One control, from the surfer's point of view: Left (or Up) turns the
  // board to the surfer's left, Right (or Down) to their right. Riding right
  // along the wave, the surfer's left is up the face. Nothing depends on
  // which way you're riding, so it can never flip.
  const steer = clamp((input.turn || 0) + (input.tilt || 0), -1, 1);
  let d = 0;
  if (steer) d = steer * rate * dt;
  else if (input.aim && (input.aim[0] || input.aim[1])) {
    const push = Math.min(1, Math.hypot(input.aim[0], input.aim[1]));
    d = clampTurn(wrap(Math.atan2(input.aim[1], input.aim[0]) - r.phi), rate * (0.45 + 0.55 * push) * dt);
  }
  // Which way the player is turning (remembered briefly, for whitewater hits)
  // and how long they've held it (for the progressive lean).
  if (d) {
    const dir = Math.sign(d);
    r.turnHeld = dir === r.turnDir ? r.turnHeld + dt : 0;
    r.turnDir = dir; r.turnDirAge = 0;
  } else {
    r.turnHeld = 0;
    r.turnDirAge += dt;
    if (r.turnDirAge > 0.15) r.turnDir = 0;
  }
  r.hard = r.bottomCarve ? 1 : sstep(T.hardAfter[0], T.hardAfter[1], r.turnHeld);
  // A quick assisted turn (snap release, rebound) takes over the board for a
  // moment and then hands control straight back.
  const playerD = d;
  if (r.assist) {
    const left = wrap(r.assist.target - r.phi) * r.assist.dir; // angle still to go, in the assist's direction
    const togo = left < -0.05 ? left + Math.PI * 2 : left;
    const stepA = r.assist.rate * dt;
    if (togo <= stepA) { d = r.assist.dir * Math.max(0, togo); r.assist = null; }
    else d = r.assist.dir * stepA;
  }
  const sinBefore = Math.sin(r.phi);
  r.phi = wrap(r.phi + d);
  r.turnRate = dt > 0 ? Math.abs(d) / dt : 0;
  // A bottom turn drives you: swinging the nose from down the face back up it,
  // low on the wave, turns the drop into speed up the face.
  // Carving near the top of the wave drives you too (a high line is the fast
  // line), just less than a bottom turn.
  const driveLow = 1 - sstep(0.35, 0.9, height); // starts higher up the face, and works out on the flats too
  const high = sstep(0.55, 0.95, height);
  // (Only your own carving drives you, not the quick assisted pivots.)
  const carveDrive = r.bottomCarve ? T.bottomCarveDrive : 1 + 0.35 * hard;
  // Turn drive goes into a buffer that releases smoothly, so speed builds
  // through the turn instead of jumping.
  // A committed bottom turn drives from its very first moment (the nose
  // starting to come round), not only once it's coming up the face.
  // (turning so the nose swings up the face, toward the wave, not further down)
  r.carvingUp = d !== 0 && Math.sign(d) === (Math.cos(r.phi - d) >= 0 ? 1 : -1);
  const driving = r.bottomCarve ? r.carvingUp : Math.sin(r.phi) > sinBefore;
  if (driveLow > 0 && driving && d === playerD) r.driveBank += T.bottomDrive * carveDrive * Math.abs(d) * driveLow * (0.4 + 0.6 * pk);
  if (high > 0 && d === playerD) r.driveBank += T.topDrive * Math.abs(d) * high * pk;
  const release = r.driveBank * (1 - Math.exp(-dt / T.driveSmooth));
  r.speed += release; r.driveBank -= release;
  if (playerD) { r.lastTurnTime = r.time; r.lastTurnDir = Math.sign(playerD); }

  // Track bottom turns (for moves and combos): down low heading down, then up.
  if (sinBefore < -0.3 && height < 0.45) r.bottomArmed = true;
  if (r.bottomArmed && Math.sin(r.phi) > 0.3) {
    r.bottomArmed = false;
    if (height < 0.6) { r.lastBottomTurn = r.time; r.events.push({ type: 'move', move: 'bottomTurn', speed: r.speed, xs: r.xs }); }
  }
  if (height > 0.75) r.bottomArmed = false;

  // --- speed ---
  // Cruising speed climbs with height: up near the top of the pocket is fastest.
  let target = T.vLow + (T.vPocket - T.vLow) * pk * steep * (0.45 + 0.75 * height);
  r.boost = Math.max(0, (r.boost || 0) - dt);
  if (r.boost > 0 && r.boost < 0.85 && foam < 0.2) r.boost = 0; // cleared the foam you bounced off
  if (r.boost > 0) { /* just rebounded: the foam can't slow you for a moment */ }
  else if (r.floater) target = Math.max(target, r.speed); // floating holds your speed
  else target += (T.vFoam - target) * foam * (climbingFoam(r) ? T.climbFoamDrag : 1); // climbing up the whitewater drags less
  r.speed += (target - r.speed) * (r.speed < target ? T.feed : T.bleed) * dt;
  const sinp = Math.sin(r.phi);
  // Pointing down pays, and pays most from the top third of the wave: that's
  // where the drop has the most height to turn into speed.
  const topThird = sstep(0.45, 0.75, height) * pk; // top half of the pocket (most in the top third); not out on the shoulder
  // (The drop off a move doesn't count: no high-drop boost until you've come
  // back down below mid-face.)
  if (height < 0.45) r.postMove = false;
  const highDropNow = r.postMove ? 0 : topThird * Math.max(0, -Math.sin(r.phi)); // pointing down, high in the pocket
  const dropSteep = Math.max(steep, 0.9 * topThird); // the rounded crest still counts as a steep drop
  const dropBoost = r.postMove ? 1 : 1 + (T.topDropBoost - 1) * topThird;
  if (sinp < 0) r.speed += -sinp * T.drop * dropBoost * dropSteep * dt;
  else r.speed += -sinp * T.climb * steep * dt;
  if (input.pump && steep > 0.2) {
    r.speed += T.pump * (sinp < -0.1 ? 1 : 0.35) * (0.3 + 0.7 * pk) * (0.7 + 0.6 * height) * dt;
    r.pumping = true;
  }
  // Stacked moves can't run away with your speed: above softMax it bleeds off.
  const softMax = T.softMax + T.highDropSoftMax * highDropNow; // a drop from high up can run a bit faster
  if (r.speed > softMax) r.speed -= (r.speed - softMax) * T.overBleed * dt;
  // However many things are feeding you speed at once (drop, pocket, turn
  // drive, pump), it never surges: speed builds at most maxAccel.
  // Pointing down high on the wave is allowed to build speed faster.
  const highDrop = highDropNow;
  const accelCap = T.maxAccel * (1 - (1 - T.maxAccelFast) * sstep(T.accelTaper[0], T.accelTaper[1], speedAtStart)) * (1 + T.highDropAccel * highDrop);
  r.speed = Math.min(r.speed, speedAtStart + accelCap * dt);
  // During a move, and for a moment after it, you don't speed up at all:
  // the move is a turn of the board, not a boost. (Bottom turns excluded.)
  r.calm = Math.max(0, (r.calm || 0) - dt);
  if (r.assist || r.floater || r.calm > 0) r.speed = Math.min(r.speed, speedAtStart);
  r.speed = clamp(r.speed, T.minSpeed, T.maxSpeed);

  // --- move ---
  const cosp = Math.cos(r.phi);
  r.xs += (r.speed * cosp - PEEL_SPEED) * dt;
  r.t -= (r.speed * sinp * dt) / Math.max(0.3, Math.hypot(f.Pt[1], f.Pt[2]));
  r.t = Math.min(r.t, T.tFlats); // ride out onto the flats in front if you don't turn back up

  // --- floater: riding along the top of the whitewater ---
  // Pivots out of a move point you straight down from the lip (a little
  // forward), the way you're riding, not back toward the whitewater.
  // (Out of the whitewater the exit is shallower, down *and* forward, so it
  // carries you out of the foam rather than down into it.)
  const downFromLip = (rate, exit = T.lipExit) => (r.rideDir >= 0
    ? { dir: -1, target: -exit, rate }
    : { dir: 1, target: -(Math.PI - exit), rate });
  if (r.floater) {
    r.floater.time += dt;
    r.t = r.floater.t; // ride along at the height you got onto the foam
    if (!r.assist) r.phi += clampTurn(wrap((r.rideDir >= 0 ? 0.05 : Math.PI - 0.05) - r.phi), 4 * dt); // flat along the top of the foam
    const cleared = r.xs > T.curlZone[0] + 0.3 && foamAt(r.xs, top + 0.6) < 0.2;
    if (cleared || r.floater.time > T.floaterMax) {
      r.floater = null;
      r.assist = downFromLip(T.snapRate * 0.7, T.foamExit); // drop back down off the foam
      r.boost = 1.0; // and the foam can't slow you until you're clear of it
    }
  }

  // --- the top: what happens depends on where you hit it, and whether you're turning ---
  const ready = r.moveCooldown === 0; // moves need a gap between them
  // Climbing up the whitewater from below: once you're high on it you pop
  // up onto it and float, without needing to reach the very top.
  const turningNow = r.time - (r.lastTurnTime ?? -9) < T.turnWindow;
  const highOnFoam = !r.floater && !r.assist && r.t > top && sinp > 0.2 && cosp > -0.15
    && (r.xs < T.curlZone[0] || foamAt(r.xs, r.t) > 0.3) && waveHeightFrac(r.pos[1]) > T.floaterHeight
    && !(turningNow && sinp > 0.55);
  if (highOnFoam) {
    r.floater = { time: 0, t: r.t };
    if (ready) {
      r.events.push({ type: 'move', move: 'floater', speed: r.speed, combo: r.time - (r.lastBottomTurn ?? -9) < T.comboWindow, xs: r.xs });
      r.moveCooldown = T.moveGap;
    }
  }
  if (!r.floater && !r.assist && r.t <= top && sinp > 0) {
    r.t = top;
    const ph = phaseAt(r.xs);
    const inWhitewater = r.xs < T.curlZone[0] || foamAt(r.xs, r.t + 0.6) > 0.3;
    const turning = r.time - (r.lastTurnTime ?? -9) < T.turnWindow;
    const combo = r.time - (r.lastBottomTurn ?? -9) < T.comboWindow;
    if (inWhitewater && cosp > -0.15 && !(turning && sinp > 0.55)) {
      // Into the whitewater heading down the line: ride along the top of it.
      r.floater = { time: 0, t: r.t };
      if (ready) {
        r.events.push({ type: 'move', move: 'floater', speed: r.speed, combo, xs: r.xs });
        r.moveCooldown = T.moveGap;
      }
    } else if (turning) {
      // Turning at the lip: the fins release and the board pivots quickly in
      // the direction you're turning, then gravity takes over. Inside the gap
      // after another move it's just a plain turn off the top.
      //  - Turning away from the whitewater (to the surfer's right, nose
      //    swinging down the line): snap / off the lip / re-entry, ending
      //    pointed down the face and forward, away from the whitewater.
      //  - Turning toward the whitewater: only a quick 180, carrying on round
      //    to point straight back down the wave.
      const towardWhitewater = (r.lastTurnDir || -1) > 0;
      if (towardWhitewater) {
        r.assist = { dir: 1, target: -Math.PI / 2, rate: T.lip180Rate };
      } else {
        r.assist = { dir: -1, target: -(inWhitewater ? T.foamExit : T.lipExit), rate: T.snapRate };
        if (inWhitewater) r.boost = 1.0; // a re-entry carries you out of the foam
      }
      if (ready) {
        const inCurl = !inWhitewater && r.xs <= T.curlZone[1];
        let move;
        if (towardWhitewater) move = 'lip180';
        else if (inWhitewater) move = 'reentry';
        else if (inCurl) move = sinp > 0.45 ? 'snap' : 'topTurn';
        else move = sinp > 0.7 ? 'offLip' : 'topTurn';
        r.events.push({ type: 'move', move, speed: r.speed, combo, xs: r.xs });
        r.moveCooldown = T.moveGap;
      }
    } else {
      // Not turning: you keep going, up and off the top. Fast enough (and out
      // of the whitewater) it's an air; otherwise over the back you go.
      f = frameAt(r.xs, r.t);
      r.mode = 'air'; r.airSpin = 0; r.airTime = 0; r.spinArmed = false; r.overTheBack = false;
      r.airAxis = f.n; // spins in the air turn the same way as on the face
      r.pos = f.P;
      // Near the curl you always get an air (if you're moving); out on the
      // open face you need the speed for it, or you go over the back.
      const nearCurl = r.xs - T.curlZone[0] < T.airCurlZone;
      const air = T.airs && !inWhitewater && sinp > 0.4
        && (r.speed > T.airSpeed || (nearCurl && r.speed > T.airMinSpeed));
      // Right next to the whitewater (within ~2 ft) it throws you higher.
      const nearWhitewater = r.xs - T.airBoostZone < T.curlZone[0] || foamAt(r.xs - T.airBoostZone, r.t + 0.6) > 0.3;
      r.launchSpeed = r.speed;
      if (air) {
        r.vel = [r.speed * cosp - PEEL_SPEED, T.airPop + Math.max(0, r.speed - T.airSpeed) * 0.3 + (nearWhitewater ? T.airBoostUp : 0), 1.2];
        r.events.push({ type: 'launch', big: nearWhitewater });
        r.bigAir = nearWhitewater;
        r.moveCooldown = T.moveGap;
      } else {
        r.vel = [r.speed * cosp - PEEL_SPEED, 1.5 + sinp * 1.5, -2.5]; // up and over, out the back
        r.overTheBack = true;
      }
      return; // the board keeps its heading; it rotates over gradually in the air
    }
  }
  // --- turning back into the whitewater ---
  // Meet it high and be turning as you hit: turning Left rebounds you off it
  // (top half of the wave), turning Right spins you 180 around through the
  // top (top third). Lower than that, or not turning, and it buries you.
  // Inside the gap after another move the whitewater just slows you down.
  if (ready && !r.assist && !r.floater && cosp < -0.15 && foamAt(r.xs, r.t) > T.foamContact) {
    const hNow = waveHeightFrac(r.pos[1]);
    if (!r.turnDir) return wipe(r, 'Hit the whitewater straight on! (turn as you hit it)');
    if (hNow < T.reboundMinHeight) return wipe(r, 'Buried by the whitewater! (hit it higher)');
    // Turning Right only spins the 180 from the top third; lower than that
    // it's a plain rebound.
    const left = r.turnDir > 0 || hNow < T.rebound180MinHeight;
    r.assist = { dir: left ? 1 : -1, target: -0.6, rate: left ? T.reboundRate : T.rebound180Rate };
    r.boost = 1.0; // the foam can't slow you until you've cleared it (up to 1s); no speed kick
    r.foamTime = 0;
    const combo = r.time - (r.lastBottomTurn ?? -9) < T.comboWindow;
    r.events.push({ type: 'move', move: left ? 'rebound' : 'rebound180', speed: r.speed, combo, xs: r.xs });
    r.moveCooldown = T.moveGap;
  }

  f = frameAt(r.xs, r.t);
  syncPose(r, f);
  checkHazards(r, dt);
}

function stepAir(r, input, dt) {
  r.airTime += dt;
  const prev = r.pos;
  r.vel = v3.add(r.vel, [0, -G * dt, 0]);
  if (!r.overTheBack) r.vel[0] = Math.max(r.vel[0], TUNE.airDrift); // the wave carries you along (no drifting back into the whitewater)
  r.pos = v3.add(r.pos, v3.mul(r.vel, dt));
  r.xs = r.pos[0];
  // Spin with a fresh Left/Right press after takeoff.
  const steer = clamp((input.turn || 0) + (input.tilt || 0), -1, 1);
  if (!steer) r.spinArmed = true;
  const spin = r.spinArmed ? steer * 7.5 * dt : 0;
  // Same direction as the turn on the face (Left/Up = to the surfer's left).
  r.heading = rotate(r.heading, r.airAxis || [0, 0, 1], spin);
  r.airSpin += spin;
  // The nose rotates over gradually as you come down (no snap to a new angle).
  const along = r.heading[0] >= 0 ? 1 : -1;
  const want = v3.norm([along * Math.hypot(r.heading[0], r.heading[2]), r.vel[1] < 0 ? -0.35 : 0.25, r.heading[2]]);
  const kh = 1 - Math.exp(-dt * 3);
  r.heading = v3.norm(v3.add(r.heading, v3.mul(v3.sub(want, r.heading), kh)));

  const sl = slice(r.xs, 10);
  const hit = segmentHit(sl, prev[2], prev[1], r.pos[2], r.pos[1]);
  if (hit && r.vel[2] * hit.nz + r.vel[1] * hit.ny < 0) {
    const half = Math.round(r.airSpin / Math.PI);
    const spinErr = Math.abs(r.airSpin - half * Math.PI);
    r.mode = 'surf';
    r.t = clamp(hit.t, TUNE.tTop, TUNE.tBottom);
    if (hit.nz < -0.05 || r.overTheBack) return wipe(r, r.overTheBack ? 'Went over the back! (turn at the lip)' : 'Landed over the back!');
    if (spinErr > 0.9) return wipe(r, 'Bad landing! (finish the spin)');
    // Land travelling the way you were going (along the line, nose... or tail
    // ... down the face). If the board came round backwards, ride it
    // backwards for a moment, then it spins back round to forwards.
    const fl = frameAt(r.xs, r.t);
    const vt = v3.rej(v3.add(r.vel, [PEEL_SPEED, 0, 0]), fl.n);
    const ph1 = Math.atan2(v3.dot(vt, fl.e2), v3.dot(vt, fl.e1));
    r.phi = Math.cos(ph1) >= 0 ? -0.35 : Math.PI + 0.35;
    // Backwards = the nose points back along the line, against your travel.
    const noseAlong = v3.dot(r.heading, fl.e1), travelAlong = Math.cos(r.phi);
    r.fakie = noseAlong * travelAlong < 0 && Math.abs(noseAlong) > 0.2 ? { time: 0, spin: 0 } : null;
    r.speed = clamp((r.launchSpeed || r.speed) * 0.92, TUNE.minSpeed, TUNE.maxSpeed); // keep most of your takeoff speed
    syncPose(r, frameAt(r.xs, r.t));
    r.events.push({ type: 'land', spins: Math.abs(half) * 180, airTime: r.airTime, big: !!r.bigAir, backwards: !!r.fakie });
    r.bigAir = false;
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
  if (r.foam > 0.6 && !r.floater && !(r.boost > 0) && !climbingFoam(r)) r.foamTime += dt; // floating on it, carrying out of a move, or climbing it doesn't count
  else r.foamTime = Math.max(0, r.foamTime - dt * 2);
  if (r.foamTime > TUNE.foamLimit) return wipe(r, 'Caught by the whitewater!');
  if (r.xs < -25) return wipe(r, 'Caught by the whitewater!');

  if (!WAVE.tube) { r.inBarrel = false; return; }
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

useWave(WAVE);
