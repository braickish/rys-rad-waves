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

import { surface, slice, phaseAt, verticalHits, segmentHit, PEEL_SPEED, WAVE_SPEED, NP, WAVE, setWave, SCALE } from './wave.js';

export const G = 9.8;
// The rider's and board's settings. Wave-specific settings (pocket speeds,
// zones, face limits, airs...) come from the active wave's `tune` and are
// merged in by useWave().
const RIDER_TUNE = {
  feed: 2.0, // how fast the pocket brings you up to speed (1/s)
  shoulderReach: 0, // the pocket's speed (and the water flowing up the face) carries this much further out toward the shoulder before it fades (m); per wave
  bleed: 0.9, // how fast extra speed fades / you bog down (1/s)
  climb: 6, // speed lost per second pointing straight up it (m/s^2)
  pump: 4, // m/s^2 while pumping on the face (full on the drop, less otherwise)
  turn: 5.2, // fastest turn rate (rad/s)
  hardAfter: [0.25, 0.6], // hold a turn this long (s) and you lean into it harder ...
  hardRate: 1.25, // ... a faster top turn rate ...
  hardRadius: 0.7, // ... and a tighter arc
  snapRate: 13,
  moveCalm: 0.95,
  moveScrub: { roundhouse: 0.03, slash: 0.25, snap: 0.08, reentry: 0.08, topTurn: 0.04, lip180: 0.1, floater: 0.05, rebound: 0.1, rebound180: 0.1, revert: 0.05, land: 0.05 }, // speed each move costs // no speeding up for this long after a move (s); 0 = off (?moveaccel)
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
  // Slash: turn to the surfer's right mid-face in the pocket (or anywhere in
  // the barrel) and the fins release: the tail slides out and the board comes
  // round much sharper for a moment, then grips again. No speed added.
  // Slash: on the way up out of a bottom turn, start the Right turn early,
  // still down in the flats or at the very bottom, and the fins release: the
  // board swings round sideways while you carry on up the face (the tail
  // sliding), then the fins grip and you go where the board points. Start the
  // Right turn any higher and it's an ordinary turn (a snap up at the lip).
  slashLow: 0.2, // start the Right turn below this height on the face (the flats count) ...
  slashClimb: 0.3, // ... with the nose up the face (sin of angle, ~17 deg) ...
  slashDropAngle: 0.45, // ... out of a real bottom turn: pointing at least this steeply down (sin, ~27 deg) ...
  slashDropRecent: 1.2, // ... low on the face (below slashDropLow) within this long before (s)
  slashDropLow: 0.3,
  slashWindow: 0.15, // ... the turn having started this recently (s)
  slashPocket: 0.15, // not out on the shoulder (pocket power)
  slashMinSpeed: 5, // m/s
  slashHold: 0.15, // the fins hold this long into the turn (a normal carve) before they release (s); let go before and it's just a turn
  slashSpin: 5, // how fast the board swings round on the slide (rad/s) ...
  slashSlideMax: 1.0, // ... up to this far ahead of where you're going (rad, ~57 deg) ...
  slashTime: 0.45, // ... for up to this long after the release while you hold the turn (s)
  slashEnd: 1.05, // the board stops swinging once it points this far down the face (rad, ~60 deg)
  slashFollow: 0.25, // while it slides, your line swings round this fraction as fast as the board, so you don't carry on up as far
  slashGrip: 9, // then the fins grip and your line swings round to the board this fast (rad/s)
  slashCarve: 0.5, // how much your own carve keeps turning you while it slides (1 = all of it)
  slashDrag: 3.2, // while the board is sideways it scrubs speed (1/s, at fully sideways), so you don't carry on up as far and stay nearer the pocket
  // In the barrel a slash is a smaller, scrubbier slide: it turns about half as
  // far and scrubs harder (these override the settings above in the tube).
  slashTube: { slashSpin: 4, slashSlideMax: 0.35, slashFollow: 0.15, slashCarve: 0.3, slashDrag: 5.0 },
  // Snap / off the lip / re-entry (turning away from the whitewater at the
  // lip): you stay on the lip, your line running along it, while the fins
  // release and the board swings round in place, scrubbing speed; then the
  // fins grip (slashGrip) and you ride back down.
  lipSnapSwing: 11, // how fast the board swings round on the lip (rad/s)
  snapZone: 3.0, // climbing with the nose well up (snapUp), start the Right turn this close below the top (t) and the snap starts right there
  snapUp: 0.7, // (sin of angle, ~45 deg)
  snapLine: 2.6, // the snap holds you at least this far below the top (t), where the face is steep (~45 deg on the point), so the board stands up with its deck showing
  snapStandRate: 20, // first the board comes round to point straight up the face (rad/s), then it spins down to the right
  lipSnapDrag: 1.4, // speed scrubbed while it swings and grips (1/s)
  // Roundhouse: out on the shoulder, turn back toward the whitewater; the
  // further round you come the deeper you lean and the lower you crouch, and
  // the turn tightens. Scores once you're heading back toward the whitewater.
  roundhouseZone: 5, // out on the shoulder: at least this far ahead of the curl (m) ...
  roundhousePocket: 0.55, // ... where the pocket has faded below this
  roundhouseDepth: [0.35, 1.6], // turned this far (rad) = starting to lean .. fully deep and crouched
  roundhouseStart: 0.4, // it starts as a slow, wide turn: this fraction of the normal turn rate ...
  roundhouseHold: 0.1, // ... for the first this long you hold it (s) ...
  roundhouseRamp: 0.2, // ... then it eases up to the full rate over this long (s) ...
  roundhouseDeep: 1.25, // deep into it (full depth) the arc tightens this much ...
  roundhouseMaxRate: 5.0, // ... but never faster than this: a sweeping arc, even high on the face where turns are snappy (rad/s)
  roundhouseScore: 1.8, // turned at least this far (rad, ~100 deg) and heading back toward the whitewater
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
  if (!waveRef || waveRef.scale !== SCALE) waveRef = { lo: surface(0.5, TUNE.tBottom)[1], hi: surface(0.5, 4)[1], scale: SCALE };
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
    tube: null, fakie: null, driveBank: 0, lastTurnTime: -9, lastTurnDir: 0, overTheBack: false,
    rideDir: 1, lock: null, inDir: 0, lipSnap: null, snapGrip: false, roundhouse: null, crouchDepth: 0, slash: null, slide: 0, rightHeld: 0, turnDir: 0, turnDirAge: 9, turnHeld: 0, hard: 0, assist: null, bottomCarve: false, floater: null,
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
  // In a slash the tail slides out, so the nose points further into the turn.
  r.heading = r.fakie ? v3.norm(rotate(travel, f.n, Math.PI - r.fakie.spin))
    : r.slide ? v3.norm(rotate(travel, f.n, -r.slide)) : travel;
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
  r.crouch = !!input.crouch || !!r.tube;
  r.pumping = false;
  if (r.mode === 'wipe') { r.wipeTimer -= dt; return; }
  if (r.mode === 'surf') stepSurf(r, input, dt);
  else stepAir(r, input, dt);
  for (const e of r.events) {
    if ((e.type === 'move' && e.move !== 'bottomTurn') || e.type === 'land') {
      // (no calm after a slash: it's a sharper turn, not a pivot off the lip,
      // so carving through it keeps its flow; it still scrubs a little)
      if (e.move !== 'slash' && e.move !== 'roundhouse') r.calm = TUNE.moveCalm; // (a roundhouse flows into the rebound)
      // A move costs a little speed (the board scrubs as it pivots), and any
      // drive still banked from the bottom turn is spent.
      r.speed *= 1 - (TUNE.moveScrub[e.move || 'land'] || 0);
      r.postMove = true;
      r.driveBank = 0;
    }
  }
  // A turn off the lip springs the body open (for the surfer's pose).
  r.unload = Math.max(0, (r.unload || 0) - dt);
  if (r.events.some((e) => e.type === 'move' && ['snap', 'reentry', 'topTurn', 'lip180', 'slash'].includes(e.move))) r.unload = 0.45;
}

// Snap / off the lip / re-entry: the board swings round on the face just
// under the lip. Your line runs along the wave (phi 0) while the board keeps
// pointing where it was (heading = phi - slide) and then spins to the right.
function startLipSnap(r, top, target) {
  r.lipSnap = { t: Math.max(r.t, top + TUNE.snapLine), target, time: 0, standing: true };
  lockInput(r);
  r.slide = -r.phi; r.phi = 0;
  r.roundhouse = null; r.slash = null;
}

// While a move has the board, and afterwards until you let go of (or
// reverse) the key you were holding, your steering is ignored: holding the
// turn through a move doesn't carry on turning you once it's done.
function lockInput(r) { r.lock = { dir: r.inDir }; }

function stepSurf(r, input, dt) {
  const T = TUNE;
  // Pulling in: stall low-ish on the face while the barrel comes over you.
  if (r.tube && r.tube.pullIn) {
    r.speed += (PEEL_SPEED - T.pullInSpeed - r.speed) * Math.min(1, dt * 6);
    r.phi += clampTurn(wrap(0 - r.phi), 4 * dt);
    r.t += (T.pullInLine - r.t) * (1 - Math.exp(-dt * 4));
    r.xs += (r.speed * Math.cos(r.phi) - PEEL_SPEED) * dt;
    if (phaseAt(r.xs) > T.tubeEnter + 0.05) r.tube.pullIn = false;
    syncPose(r, frameAt(r.xs, r.t));
    r.height = 0.3;
    checkHazards(r, dt);
    return;
  }
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
  {
    const raw = clamp((input.turn || 0) + (input.tilt || 0), -1, 1);
    r.inDir = raw ? Math.sign(raw) : (input.aim && (input.aim[0] || input.aim[1]) ? 2 : 0);
    const busy = r.assist || r.lipSnap || r.snapGrip;
    if (r.lock && !busy && r.inDir !== r.lock.dir) r.lock = null; // let go, or changed to a different input
    if (r.lock) input = { crouch: input.crouch };
  }
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
  // --- slash: a Right turn started low on the way up (also in the barrel) ---
  // While it slides, your line keeps carving normally (carrying you on up the
  // face) and the board swings round ahead of it (r.slide); when you let go,
  // or it's swung far enough, the fins grip and your line catches up to the
  // board. The total turn is sharper than a carve, but it's still a turn:
  // nothing is added to your speed.
  r.rightHeld = steer < 0 ? r.rightHeld + dt : 0;
  const inTube = r.tube && !r.tube.pullIn;
  if (!r.slash && !r.slide && !r.lipSnap && steer < 0 && r.rightHeld <= T.slashWindow && r.moveCooldown === 0 && !r.assist && !r.floater && !r.fakie
    && r.speed > T.slashMinSpeed && height < T.slashLow
    && r.time - (r.steepDropTime ?? -9) < T.slashDropRecent // a real bottom turn, not a little turn in the pocket
    && Math.sin(r.phi) > T.slashClimb && Math.cos(r.phi) > -0.5 // on the way up (not cutting back along the wave)
    && (inTube || (pk > T.slashPocket && foam < 0.3))) {
    // Armed: the fins hold for a moment (an ordinary carve), then release.
    r.slash = { time: 0, released: false, tube: !!inTube };
  }
  let gripD = 0;
  // Snap on the lip: the board swings round in place while your line runs
  // along the lip (heading = phi - slide); then the fins grip, below.
  if (r.lipSnap) {
    const ls = r.lipSnap;
    // (the move has the board while it swings)
    ls.time += dt;
    d = 0;
    let head = r.phi - r.slide;
    if (ls.standing) {
      // the board comes round to point straight up the face ...
      head = Math.min(Math.PI / 2, head + T.snapStandRate * dt);
      if (head >= Math.PI / 2 - 1e-4) ls.standing = false;
    } else head = Math.max(ls.target, head - T.lipSnapSwing * dt); // ... then spins down to the right
    r.slide = r.phi - head;
    if (head <= ls.target + 1e-4 || ls.time > 0.5) { r.lipSnap = null; r.snapGrip = true; }
  }
  if (r.slash) {
    const sl = r.slash;
    const S = (k) => (sl.tube && T.slashTube[k] !== undefined ? T.slashTube[k] : T[k]); // barrel settings in the tube
    sl.time += dt;
    if (!sl.released) {
      if (steer >= 0 || r.assist || r.floater) r.slash = null; // let go before the fins released: just a turn
      else if (sl.time >= T.slashHold) {
        sl.released = true; sl.time = 0;
        r.moveCooldown = T.moveGap;
        r.events.push({ type: 'move', move: 'slash', speed: r.speed, xs: r.xs, tube: sl.tube, combo: r.time - (r.lastBottomTurn ?? -9) < T.comboWindow });
      }
    } else if (steer >= 0 || sl.time > T.slashTime || r.assist || r.floater || r.phi - r.slide < -T.slashEnd) {
      if (steer < 0) lockInput(r); // ended while you're still holding Right: don't carry on turning
      r.slash = null;
    }
    else {
      r.slide = Math.min(S('slashSlideMax'), r.slide + S('slashSpin') * Math.abs(steer) * dt); // the board swings round ahead of your line ...
      gripD = -S('slashFollow') * S('slashSpin') * Math.abs(steer) * dt; // ... and your line partly follows it
      d *= S('slashCarve'); // (in the barrel your own carve mostly gives way to the slide)
    }
  }
  // --- roundhouse: out on the shoulder, turning back toward the whitewater ---
  // (it starts from a turn begun while riding along or down the line; not a
  // bottom turn: turning the nose back up from pointing down)
  const bottomTurning = Math.sin(r.phi) < -0.3 && Math.sign(d) === (r.rideDir >= 0 ? 1 : -1);
  if (!r.roundhouse && d && r.turnHeld <= 0.1 && !bottomTurning && !r.assist && !r.lipSnap && !r.snapGrip && !r.slash && !r.floater && !r.tube
    && r.xs > T.roundhouseZone && pk < T.roundhousePocket && Math.cos(r.phi) > 0.2) {
    r.roundhouse = { dir: Math.sign(d), turned: 0, depth: 0, scored: false, time: 0 };
  }
  if (r.roundhouse) {
    const rh = r.roundhouse;
    if (!d || Math.sign(d) !== rh.dir || r.assist || r.lipSnap || r.slash || r.floater) r.roundhouse = null;
    else {
      // A slow, wide start: hold it and it eases into the full turn.
      rh.time += dt;
      d *= T.roundhouseStart + (1 - T.roundhouseStart) * sstep(T.roundhouseHold, T.roundhouseHold + T.roundhouseRamp, rh.time);
      d *= 1 + (T.roundhouseDeep - 1) * rh.depth; // deeper in, it comes round faster
      d = clampTurn(d, T.roundhouseMaxRate * dt);
      rh.turned += Math.abs(d);
      rh.depth = sstep(T.roundhouseDepth[0], T.roundhouseDepth[1], rh.turned);
      if (!rh.scored && rh.turned > T.roundhouseScore && Math.cos(r.phi + d) < -0.3) {
        rh.scored = true;
        r.lastRoundhouse = r.time; // (a 180 off the top straight after counts as a rebound)
        r.events.push({ type: 'move', move: 'roundhouse', speed: r.speed, xs: r.xs, combo: r.time - (r.lastBottomTurn ?? -9) < T.comboWindow });
      }
    }
  }
  // (for the surfer's pose: crouch lower and lean deeper as the roundhouse comes round)
  r.crouchDepth += ((r.roundhouse ? r.roundhouse.depth : 0) - r.crouchDepth) * (1 - Math.exp(-dt * (r.roundhouse ? 10 : 4)));
  if (r.roundhouse) r.hard = Math.max(r.hard, r.roundhouse.depth);
  if (r.assist) { r.slide = 0; r.snapGrip = false; } // an assisted pivot takes the board over
  else if (!r.slash && !r.lipSnap && r.slide > 0) {
    // The fins grip: your line swings round to where the board points.
    // (After a snap the move has the board until they've gripped, like the
    // old pivot: holding the turn through it doesn't spin you round.)
    if (r.snapGrip) d = 0;
    const c = Math.min(r.slide, T.slashGrip * dt);
    gripD = -c; r.slide -= c; // (applied below: it isn't you steering)
    if (r.slide < 1e-3) { r.slide = 0; r.snapGrip = false; }
  }
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
  d += gripD;
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
  if (driveLow > 0 && driving && d === playerD && !(r.slash && r.slash.released) && !r.slide) r.driveBank += T.bottomDrive * carveDrive * Math.abs(d) * driveLow * (0.4 + 0.6 * pk);
  if (high > 0 && d === playerD && !(r.slash && r.slash.released) && !r.slide) r.driveBank += T.topDrive * Math.abs(d) * high * pk;
  const release = r.driveBank * (1 - Math.exp(-dt / T.driveSmooth));
  r.speed += release; r.driveBank -= release;
  if (playerD) { r.lastTurnTime = r.time; r.lastTurnDir = Math.sign(playerD); }

  // Track bottom turns (for moves and combos): down low heading down, then up.
  if (sinBefore < -0.3 && height < 0.45) r.bottomArmed = true;
  if (sinBefore < -T.slashDropAngle && height < T.slashDropLow) r.steepDropTime = r.time; // (for the slash: came off the bottom pointing steeply down)
  if (r.bottomArmed && Math.sin(r.phi) > 0.3) {
    r.bottomArmed = false;
    if (height < 0.6) { r.lastBottomTurn = r.time; r.events.push({ type: 'move', move: 'bottomTurn', speed: r.speed, xs: r.xs }); }
  }
  if (height > 0.75) r.bottomArmed = false;

  // --- speed ---
  // Cruising speed climbs with height: up near the top of the pocket is fastest.
  // (speed fades a little further out than the pocket itself: shoulderReach)
  const pkSpeed = r.xs > 0 ? pocketPower(Math.max(0, r.xs - T.shoulderReach)) : pk;
  let target = T.vLow + (T.vPocket - T.vLow) * pkSpeed * steep * (0.45 + 0.75 * height);
  r.boost = Math.max(0, (r.boost || 0) - dt);
  if (r.boost > 0 && r.boost < 0.85 && foam < 0.2) r.boost = 0; // cleared the foam you bounced off
  if (r.boost > 0) { /* just rebounded: the foam can't slow you for a moment */ }
  else if (r.floater) target = Math.max(target, r.speed); // floating holds your speed
  else target += (T.vFoam - target) * foam * (climbingFoam(r) ? T.climbFoamDrag : 1); // climbing up the whitewater drags less
  // The pocket only feeds you while you're not climbing: point up the face
  // and you slow down for real.
  const climbing = sstep(0.15, 0.6, Math.sin(r.phi));
  r.speed += (target - r.speed) * (r.speed < target ? T.feed * (1 - climbing) : T.bleed) * dt;
  const sinp = Math.sin(r.phi);
  // Pointing down pays, and pays most from the top third of the wave: that's
  // where the drop has the most height to turn into speed.
  const topThird = sstep(0.45, 0.75, height) * pkSpeed; // top half of the pocket (most in the top third); not out on the shoulder
  // (The drop off a move doesn't count: no high-drop boost until you've come
  // back down below mid-face.)
  if (height < 0.45) r.postMove = false;
  const highDropNow = r.postMove ? 0 : topThird * Math.max(0, -Math.sin(r.phi)); // pointing down, high in the pocket
  const dropSteep = Math.max(steep, 0.9 * topThird); // the rounded crest still counts as a steep drop
  const dropBoost = r.postMove ? 1 : 1 + (T.topDropBoost - 1) * topThird;
  if (sinp < 0) r.speed += -sinp * T.drop * dropBoost * dropSteep * dt;
  else r.speed += -sinp * T.climb * steep * dt;
  // In the barrel, the wave drives you: trimming flat or pointing down the
  // line picks up extra speed (fading out as you point up the face)
  // (it only tops you up to just faster than the wave, not beyond)
  // (higher up in the barrel, the top half, it runs a bit faster)
  const trimCap = PEEL_SPEED + T.tubeTrimOver + (T.tubeTrimOverHigh - T.tubeTrimOver) * sstep(0.42, 0.52, height);
  if (r.tube && !r.tube.pullIn && Math.cos(r.phi) > 0 && r.speed < trimCap) {
    r.speed = Math.min(trimCap, r.speed + T.tubeDrive * (1 - sstep(0.0, 0.35, sinp)) * dt);
  }
  // ... and trimming in the barrel settles you at that speed (dropping down
  // the face can still take you past it).
  if (r.tube && !r.tube.pullIn && sinp > -0.2 && r.speed > trimCap) r.speed -= (r.speed - trimCap) * 3 * dt;
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
  if (r.assist || r.floater || r.calm > 0 || r.lipSnap) r.speed = Math.min(r.speed, speedAtStart);
  // The snap scrubs speed on the lip while the board swings and grips.
  // (not while the board first stands up: just while it spins round and grips)
  if ((r.lipSnap && !r.lipSnap.standing) || r.snapGrip) r.speed = Math.min(r.speed, speedAtStart) * (1 - T.lipSnapDrag * dt);
  // Sliding sideways in a slash scrubs speed, and nothing builds it meanwhile.
  else if (r.slide > 0) r.speed = Math.min(r.speed, speedAtStart) * (1 - (r.tube ? T.slashTube.slashDrag : T.slashDrag) * Math.sin(Math.min(r.slide, Math.PI / 2)) * dt);
  r.speed = clamp(r.speed, T.minSpeed, T.maxSpeed);

  // --- move ---
  const cosp = Math.cos(r.phi);
  r.xs += (r.speed * cosp - PEEL_SPEED) * dt;
  // On a heavy wave the water rushes up the face and carries you with it:
  // trimming level drifts you up, so you hold your line pointing a little down.
  const faceLift = (T.faceFlow || 0) * steep * pkSpeed; // (carries as far out as the pocket's speed)
  r.t -= ((r.speed * sinp + faceLift) * dt) / Math.max(0.3, Math.hypot(f.Pt[1], f.Pt[2]));
  r.t = Math.min(r.t, T.tFlats); // ride out onto the flats in front if you don't turn back up
  if (r.lipSnap) r.t += (r.lipSnap.t - r.t) * (1 - Math.exp(-dt * 12)); // the snap holds you just under the lip

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
      lockInput(r);
      r.boost = 1.0; // and the foam can't slow you until you're clear of it
    }
  }

  const ready = r.moveCooldown === 0; // moves need a gap between them
  // Pulling into the barrel: up near the lip close to the curl and turning.
  if (WAVE.tube && !r.tube && !r.assist && !r.lipSnap && !r.floater && !r.slash && r.xs < T.pullInZone && r.xs > -2
    && height > T.pullInHeight && r.time - (r.lastTurnTime ?? -9) < 0.15) {
    enterTube(r, true);
    syncPose(r, frameAt(r.xs, r.t));
    return;
  }

  // --- the top: what happens depends on where you hit it, and whether you're turning ---
  // Climbing up the whitewater from below: once you're high on it you pop
  // up onto it and float, without needing to reach the very top.
  const turningNow = r.time - (r.lastTurnTime ?? -9) < T.turnWindow;
  const highOnFoam = !r.floater && !r.assist && !r.lipSnap && r.t > top && sinp > 0.2 && cosp > -0.15
    && (r.xs < T.curlZone[0] || foamAt(r.xs, r.t) > 0.3) && waveHeightFrac(r.pos[1]) > T.floaterHeight
    && !(turningNow && sinp > 0.55);
  if (highOnFoam && !T.floaters) return wipe(r, 'Over the falls! (too heavy to float)');
  if (highOnFoam) {
    r.floater = { time: 0, t: r.t };
    if (ready) {
      r.events.push({ type: 'move', move: 'floater', speed: r.speed, combo: r.time - (r.lastBottomTurn ?? -9) < T.comboWindow, xs: r.xs });
      r.moveCooldown = T.moveGap;
    }
  }
  if (r.tube && r.t <= top && sinp > 0 && !r.assist && !r.lipSnap) {
    // In the tube the top of the face is the roof: brush it and you're
    // deflected back down; drive hard straight into it and you go over.
    if (sinp > TUNE.roofCrash) return wipe(r, 'Over the falls! (up into the lip)');
    r.t = top;
    r.assist = { dir: -1, target: -0.5, rate: TUNE.snapRate };
    lockInput(r);
  }
  // Snap from just under the lip: climbing with the nose well up the face,
  // turn Right near the top and the snap starts right there, on the face
  // (not up on top of the crest), so the board stands up with its deck
  // showing and spins round to the right.
  if (ready && !r.tube && !r.floater && !r.assist && !r.lipSnap && !r.slash && r.rideDir >= 0
    && r.t > top && r.t <= top + T.snapZone && sinp > T.snapUp
    && r.time - (r.lastTurnTime ?? -9) < T.turnWindow && r.lastTurnDir < 0
    && r.xs >= T.curlZone[0] && foamAt(r.xs, r.t + 0.6) <= 0.3) {
    startLipSnap(r, top, -T.lipExit);
    const combo = r.time - (r.lastBottomTurn ?? -9) < T.comboWindow;
    r.events.push({ type: 'move', move: 'snap', speed: r.speed, combo, xs: r.xs });
    r.moveCooldown = T.moveGap;
  }
  if (!r.floater && !r.assist && !r.lipSnap && r.t <= top && sinp > 0) {
    r.t = top;
    const ph = phaseAt(r.xs);
    const inWhitewater = r.xs < T.curlZone[0] || foamAt(r.xs, r.t + 0.6) > 0.3;
    const turning = r.time - (r.lastTurnTime ?? -9) < T.turnWindow;
    const combo = r.time - (r.lastBottomTurn ?? -9) < T.comboWindow;
    if (inWhitewater && !T.floaters) return wipe(r, 'Over the falls!');
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
      // The 180 off the top only comes up out of a bottom turn, right by the
      // curl, or straight out of a roundhouse (then it's a rebound). Anywhere
      // else turning toward the whitewater at the top is just your own turn
      // carrying you round over the top (a cutback off the top).
      const fromRoundhouse = r.time - (r.lastRoundhouse ?? -9) < T.comboWindow;
      const can180 = r.xs <= T.curlZone[1] && (fromRoundhouse || (combo && !inWhitewater));
      if (towardWhitewater && !can180) {
        // (stay on the top; your turn keeps going until the nose comes round
        // and you head back down)
      } else if (towardWhitewater) {
        r.assist = { dir: 1, target: -Math.PI / 2, rate: T.lip180Rate };
        lockInput(r);
      } else if (r.rideDir >= 0) {
        // Stay on the lip: your line runs along it and the board swings round
        // in place (it keeps pointing where it was, heading = phi - slide).
        startLipSnap(r, top, -(inWhitewater ? T.foamExit : T.lipExit));
        if (inWhitewater) r.boost = 1.0; // a re-entry carries you out of the foam
      } else {
        r.assist = { dir: -1, target: -(inWhitewater ? T.foamExit : T.lipExit), rate: T.snapRate };
        lockInput(r);
        if (inWhitewater) r.boost = 1.0;
      }
      if (ready && !(towardWhitewater && !can180)) {
        const inCurl = !inWhitewater && r.xs <= T.curlZone[1];
        let move;
        if (towardWhitewater) move = fromRoundhouse ? 'rebound' : 'lip180';
        else if (inWhitewater) move = 'reentry';
        else move = sinp > (inCurl ? 0.45 : 0.7) ? 'snap' : 'topTurn'; // (no separate off the lip: it's a snap)
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
  if (ready && !r.assist && !r.lipSnap && !r.floater && cosp < -0.15 && foamAt(r.xs, r.t) > T.foamContact) {
    const hNow = waveHeightFrac(r.pos[1]);
    if (!T.rebounds) return wipe(r, 'Buried by the whitewater! (too heavy to rebound off)');
    if (!r.turnDir) return wipe(r, 'Hit the whitewater straight on! (turn as you hit it)');
    if (hNow < T.reboundMinHeight) return wipe(r, 'Buried by the whitewater! (hit it higher)');
    // Turning Right only spins the 180 from the top third; lower than that
    // it's a plain rebound.
    const left = r.turnDir > 0 || hNow < T.rebound180MinHeight;
    r.assist = { dir: left ? 1 : -1, target: -0.6, rate: left ? T.reboundRate : T.rebound180Rate };
    lockInput(r);
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
    if (h.ny < -0.3 && h.t < t - 0.3 && h.y > pos[1] + 0.05) best = Math.min(best, h.y - pos[1]);
  }
  return best;
}

function checkHazards(r, dt) {
  const ph = phaseAt(r.xs);
  // The foam only takes you if you sit in it.
  if (r.foam > 0.6 && !r.floater && !(r.boost > 0) && !climbingFoam(r)) r.foamTime += dt; // floating on it, carrying out of a move, or climbing it doesn't count
  else r.foamTime = Math.max(0, r.foamTime - dt * 2);
  if (r.foamTime > TUNE.foamLimit) return wipe(r, 'Caught by the whitewater!');
  // The whitewater rolling out across the flats knocks you off at once if you
  // ride into it down there (climbing up into it, nose well up, is a floater
  // from the flats; just out of a move you're carried through).
  if (r.t > TUNE.tBottom - 0.3 && r.foam > 0.5 && !r.floater && !(r.boost > 0) && Math.sin(r.phi) < 0.4) {
    return wipe(r, 'Caught by the whitewater! (it rolls out across the flats)');
  }
  if (r.xs < -25) return wipe(r, 'Caught by the whitewater!');

  if (!WAVE.tube) { r.inBarrel = false; return; }
  // The barrel: once the curl has passed you, you're in the tube, surfing
  // the face inside it as normal. Too deep = pinched; up into the lip = over
  // the falls; way down past the bottom = the lip lands on you; forward out
  // of it = out.
  const T = TUNE;
  if (!r.tube) {
    // Only once you're up on the face (at or above its base), not out on the flats.
    // ... and only once you've come round to face along or up the face, not
    // while you're still pointing down mid bottom turn.
    if (ph > T.tubeEnter && ph < T.tubeCollapse - 0.15 && r.t <= T.tBottom + T.tubeEnterLow && Math.sin(r.phi) > -0.1) {
      // Way up in the lip as it throws: over you go. A bit high: it sucks you in.
      if (r.t < topOfFace(r.xs) - T.tubeTooHigh) return wipe(r, 'Over the falls! (caught up in the lip)');
      r.t = Math.max(r.t, topOfFace(r.xs));
      enterTube(r);
    }
    return;
  }
  const tb = r.tube;
  tb.time += dt;
  r.barrelTime = tb.time;
  const depth = tubeDepth(r);
  tb.depth = Math.max(tb.depth, depth);
  tb.depthSum += depth * dt;
  if (tb.pullIn) return;
  if (ph > T.tubeCollapse) { r.tube = null; r.inBarrel = false; return wipe(r, 'Pinched! (too deep: drop down and drive forward)'); }
  // Up in the top of the barrel the lip grabs you and throws you over.
  if (r.height > T.tubeFallHeight) { r.tube = null; r.inBarrel = false; return wipe(r, 'Over the falls! (too high in the barrel)'); }
  if (r.t > T.tBottom + T.tubeLow) { r.tube = null; r.inBarrel = false; return wipe(r, 'The lip landed on you! (too low)'); }
  if (ph < T.tubeExit) {
    r.events.push({ type: 'barrelExit', time: tb.time, depth: tb.depth, avgDepth: tb.depthSum / Math.max(tb.time, 1e-3) });
    r.tube = null; r.inBarrel = false; r.barrelTime = 0;
  }
}

function enterTube(r, pullIn = false) {
  r.tube = { time: 0, depth: 0, depthSum: 0, pullIn };
  r.inBarrel = true;
  r.barrelTime = 0;
  r.floater = null;
  r.events.push({ type: 'barrelEnter' });
}


// --- Tube riding ---
// Where you are in the tube: 0 at the exit, 1 at the pinch.
export function tubeDepth(r) {
  const T = TUNE;
  return clamp((phaseAt(r.xs) - T.tubeExit) / (T.tubeCollapse - T.tubeExit), 0, 1);
}

// Speed for the HUD: board speed while surfing, ground speed in the air.
export function groundSpeed(r) {
  if (r.mode === 'surf') return r.speed;
  return v3.len(v3.add(r.vel, [PEEL_SPEED, 0, WAVE_SPEED]));
}

useWave(WAVE);
