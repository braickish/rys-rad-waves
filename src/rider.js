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

import { surface, slice, phaseAt, verticalHits, segmentHit, PEEL_SPEED, WAVE_SPEED, NP, WAVE, setWave, SCALE, controlPoints, crPoint, SHAPE, withShape, RIDE, sectionGrace, breaksAt } from './wave.js';

export const G = 9.8;
// The rider's and board's settings. Wave-specific settings (pocket speeds,
// zones, face limits, airs...) come from the active wave's `tune` and are
// merged in by useWave().
const RIDER_TUNE = {
  feed: 2.0, // how fast the pocket brings you up to speed (1/s)
  heightSpeed: [0.45, 0.75], // the pocket's cruising speed scales with height on the face: base + slope x height (0 bottom, 1 top); per wave
  shoulderReach: 0, // the pocket's speed (and the water flowing up the face) carries this much further out toward the shoulder before it fades (m); per wave
  bleed: 0.9, // how fast extra speed fades / you bog down (1/s)
  climb: 6, // speed lost per second pointing straight up it (m/s^2)
  pump: 4, // m/s^2 while pumping on the face (full on the drop, less otherwise)
  turn: 5.2, // fastest turn rate (rad/s)
  // Shuffling the feet on a shortboard (waves with `shuffle`, 2026-11-18, the user's design): Up/Down move the
  // feet one spot between back (-1), the middle (0, the normal stance) and forward (1), subtly, in `shuffleTime`.
  // Back: sharper turns (radius x`backRadius`, turn limit x`backTurn`), slightly more pivot (`backPivot` of the
  // turn rate stops depending on speed, and turning scrubs `backScrub` of your speed per radian), slightly slower
  // (cruising x`backSpeed`). Forward: helps you accelerate (picks up speed x`fwdFeed`, acceleration cap x`fwdAccel`,
  // cruising x`fwdSpeed`) and turns more rail to rail (radius x`fwdRadius`, turn limit x`fwdTurn`).
  shuffleTime: 0.2,
  backRadius: 0.9, backTurn: 1.1, backPivot: 0.05, backScrub: 0.03, backSpeed: 0.95,
  fwdFeed: 1.25, fwdAccel: 1.15, fwdSpeed: 1.04, fwdRadius: 1.15, fwdTurn: 0.9,
  hardAfter: [0.25, 0.6], // hold a turn this long (s) and you lean into it harder ...
  hardRate: 1.25, // ... a faster top turn rate ...
  hardRadius: 0.7, // ... and a tighter arc
  snapRate: 13,
  checkTurn: 1.3, checkExit: 0.35, checkRate: 4.5, // check turn (where a wave doesn't allow snaps): up to ~75 deg, ending <= ~20 deg down, about a third of a snap's speed
  moveCalm: 0.95,
  moveEase: 0, // after a move (and its calm), speed can build again gradually over this long (s), not all at once; per wave (Raglan)
  moveScrub: { roundhouse: 0.03, slash: 0.25, snap: 0.08, check: 0.05, reentry: 0.08, topTurn: 0.04, lip180: 0.1, floater: 0.05, rebound: 0.1, rebound180: 0.1, revert: 0.05, land: 0.05 }, // speed each move costs // no speeding up for this long after a move (s); 0 = off (?moveaccel)
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
  slashTube: { slashSpin: 4, slashSlideMax: 0.35, slashFollow: 0.4, slashCarve: 0.3, slashDrag: 7.0, scrub: 0.35, lift: 0.35,
    // easier to start in the barrel (2026-11-17, the user): a smaller, shallower drop counts, from
    // higher up, with longer to start the Right turn and less nose-up needed (turning's damped in there)
    slashClimb: 0.15, slashLow: 0.45, slashDropLow: 0.45, slashDropAngle: 0.35, slashDropRecent: 1.6, slashWindow: 0.2 }, // (scrub: up-front speed cost in the barrel; lift: the water lifts you only this much while the board is sideways, it digs in)
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
  // (nested settings a wave changes only part of, e.g. the reef's `slashTube`, merge over the rider's)
  for (const k of ['slashTube']) if (WAVE.tune && WAVE.tune[k]) TUNE[k] = { ...RIDER_TUNE[k], ...WAVE.tune[k] };
  if (ENERGY) Object.assign(TUNE, ENERGY_TUNE);
  // (a longboard's spots as ratios of the same pocket speed, the user, 2026-11-21: the middle is the sweet spot, 1.0x;
  // the nose a touch under, 0.95x, held by the pocket; the tail a real stall, 0.85x). A tail turn's drive goes by its
  // split, both ways: the rail share drives in full, the pivot share `pivotDriveK` of that (no full-drive turns toward
  // the face, `pivotDriveUp`; the user, 2026-11-21: pivot share at 0.5 stalled too much, 0.75: at 50% pivot toward the
  // face that's 0.875x a carve's drive, at 85% away 0.79x)
  if (ENERGY && TUNE.middleSpeed) Object.assign(TUNE, { middleSpeed: 1, tailSpeed: 0.85, noseSpeed: 0.95, pivotDriveUp: undefined, pivotDriveK: 0.75 });
  waveRef = null;
}

// Energy pocket (trial behind ?energy / ENERGY=1, the user, 2026-11-21): one model for every wave instead of a cruising
// speed that grows with height.
// - Holding the pocket = keeping pace with the curl: its cruising speed is 1.0x the local peel speed at any height
//   (`pocketHold`), fading to vLow off the pocket's power. Nothing makes you faster just for being up high.
// - Height is stored energy: real gravity on your own motion over the face, g sin(face) x sin(pointing), so a drop pays
//   sqrt(2 g h) and a climb gives it back. In the wave's frame gravity only works when you move up or down the face.
// - The wave is the engine: the water rushing up the face lifts you for free (`faceFlow`), so pointing down to hold a
//   high line turns that lift into speed above the peel; drag (`bleed`) pulls it back toward the peel.
// - Airs: lift-off physics instead of the 19/21 mph thresholds (Raglan's notes: the board leaves the water over a 3-5 m
//   crest once v^2/R > g, ~12-15 mph; a usable ~0.5 m pop needs ~16-18 mph), since a climb now costs real speed.
export const ENERGY = typeof location !== 'undefined' ? /[?&]energy(&|=|$)/.test(location.search) : !!(globalThis.process && process.env.ENERGY);
const ENERGY_TUNE = { energy: true, pocketHold: 1.0, airSpeedCurl: 7.15, airSpeed: 8.05 }; // (16 / 18 mph)


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

// How much a steep wall is worth at xs, wherever it is along the wave (waves with `wallK`: Trestles, 2026-11-19, the
// user: in the footage of Uppers and Lowers there are long steep sections standing up ahead of the curl before they
// break, and up-and-down carves there should make speed, so you can make the section). By the face's angle at mid
// height (0 at `wallAngles[0]`, full at `[1]`, degrees) and its height against the face at the curl, up to `wallK` of
// the pocket's power. Out where the wave is still fat swell it's ~0; a section about to break stands at ~25-30 deg.
export function wallPower(xs) {
  const W = TUNE.wallK; if (!W) return 0;
  const [a0, a1] = TUNE.wallAngles || [17, 28];
  const faceH = (x) => { const top = topOfFace(x); return { top, h: surface(x, top)[1] - surface(x, TUNE.tBottom)[1] }; };
  const here = faceH(xs), curl = faceH(0);
  const n = frameAt(xs, here.top + (TUNE.tBottom - here.top) * 0.5).n;
  const ang = Math.acos(clamp(n[1], -1, 1)) * 180 / Math.PI;
  return W * sstep(a0, a1, ang) * clamp(here.h / Math.max(0.3, curl.h), 0, 1);
}

// The wave's cruising speed for you from real wave physics and real surfers' speeds (waves with `physPocket`: Trestles;
// the user, 2026-11-19: ground the pocket's speed in real physics and real-world numbers).
// - Staying in the pocket you move along the wave at the peel speed while the wave carries you toward the beach at its
//   own speed c, so over the ground you go c / sin(peel angle) = sqrt(c^2 + peel^2): 1.41 c at a typical 45 deg peel.
// - GPS on surfers: recreational riders' fastest ~33 km/h (21 mph), pros ~40 km/h (25 mph), the fastest recorded
//   45 km/h (28 mph) (Mendez-Villanueva et al. 2006; Farley et al. 2012; the 2024 GNSS review, Sensors 24:3455).
// - c at the break: sqrt(g (depth + height)) ~ 6.5 m/s at Trestles (3 m of water, a ~3 m face; the FUNWAVE/SWASH
//   crests ran 7.5-8 m/s further out in 6-7 m).
// So the pocket's speed over the ground is `ground` x c by height on the face (low, mid, the high line: 1.2 / 1.45 /
// 1.8 c, ~17 / 21 / 26 mph), and the board's speed across the face (what `speed` is: the wave's own shoreward motion
// isn't in it) is the rest: sqrt(ground^2 - c^2). Never below what keeps up with the curl (`hold` x the peel speed).
// Out of the pocket it falls to `vLow` as the pocket's (or a steep wall's) power fades; on the flats too.
export function physCruise(P, height, power, onFace) {
  const c = P.c * WAVE_SPEED / WAVE.waveSpeed; // (sets: c grows with the wave as its speed does, sqrt(size))
  const [g0, g1, g2] = P.ground;
  const g = height < 0.5 ? g0 + (g1 - g0) * sstep(0, 0.5, height) : g1 + (g2 - g1) * sstep(0.5, 1, height);
  const across = c * Math.sqrt(Math.max(0, g * g - 1));
  const pocket = Math.max(across, (P.hold || 1) * PEEL_SPEED);
  return TUNE.vLow + (pocket - TUNE.vLow) * power * onFace;
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
  // e1: level along the wave (the horizontal direction on the face), so a
  // board angle means the same thing everywhere. (It used to be the beach
  // direction laid onto the surface, which tilts up and down wherever the
  // wave changes shape along the beach, e.g. coming out of the barrel.) On
  // flat water there's no level direction on the face, so it blends back to
  // the beach direction.
  const eBeach = v3.norm(v3.rej([1, 0, 0], n));
  let e1 = eBeach;
  const hl = Math.hypot(n[2], n[0]);
  if (hl > 1e-4) {
    let h = [n[2] / hl, 0, -n[0] / hl];
    if (h[0] < 0) h = v3.mul(h, -1);
    const w = sstep(0.05, 0.25, hl);
    e1 = v3.norm(v3.add(v3.mul(eBeach, 1 - w), v3.mul(h, w)));
  }
  const e2 = v3.norm(v3.cross(n, e1)); // straight up the face
  return { P, Pt, Px, n, e1, e2 };
}

// How high you are as a fraction of the full open wave (trough to crest at
// the curl), measured in real height, not position along the surface.
function waveHeightFrac(y) {
  if (!waveRef || waveRef.scale !== SCALE || waveRef.ver !== SHAPE.ver) waveRef = { lo: surface(0.5, TUNE.tBottom)[1], hi: surface(0.5, 4)[1], scale: SCALE, ver: SHAPE.ver };
  return clamp((y - waveRef.lo) / (waveRef.hi - waveRef.lo), 0, 1);
}

// Heading up the face and down the line (climbing up the whitewater).
function climbingFoam(r) {
  return Math.sin(r.phi) > 0.2 && Math.cos(r.phi) > -0.15;
}

// Where the rideable face tops out at xs (the barrel's roof starts earlier).
export function topOfFace(xs) {
  const s = phaseAt(xs);
  if (!WAVE.tubeReal) return WAVE.faceTop(s);
  // Waves with `tubeReal` (the sim reef) set both lines by real height instead
  // of a fixed place along the curve: on the open face the top is `faceTop`
  // of the way from the trough up to the crest (t 5.3 put you on top of the
  // sim shapes' broad, rounded crest, riding over the curl), and in the
  // barrel the roof line is `top` of the way up the tube.
  const open = faceLineT(s, WAVE.tubeReal.faceTop);
  return open + (tubeLineT(s, WAVE.tubeReal.top) - open) * sstep(-0.3, 0.2, s);
}

// How far down the face a Right turn still counts as a snap (t). `snapBand` waves (Trestles) by real height: the top
// line down to `snapBand` of the face below it (the same top ~quarter as Raglan's snapZone gives there). By place along
// the curve, Trestles' shapes made the zone reach down to a quarter of the way up the face at the curl, so most
// turns up the face were snaps (the user, 2026-11-19).
export function snapZoneT(xs, top) {
  if (!WAVE.snapBand) return top + TUNE.snapZone;
  return Math.max(top, faceLineT(phaseAt(xs), WAVE.tubeReal.faceTop - WAVE.snapBand));
}

// The place along the curve (t) on the open face at `frac` of the way from the
// trough (at tBottom) up to the crest (the highest point), for phase s.
// Tabled per wave at size 1, like tubeLineT.
// (A wave with shape sets, Trestles: tabled per set and blended like the shape itself.)
const blendShapes = (f) => (SHAPE.w > 0 && SHAPE.b !== SHAPE.a ? f(SHAPE.a) + (f(SHAPE.b) - f(SHAPE.a)) * SHAPE.w : f(SHAPE.a));
let faceTables = null;
function faceLineT(s, frac) { return blendShapes((i) => faceLineSet(i, s, frac)); }
function faceLineSet(set, s, frac) {
  if (!faceTables || faceTables.wave !== WAVE) faceTables = { wave: WAVE, rows: new Map() };
  const key = set + ':' + frac;
  let row = faceTables.rows.get(key);
  if (!row) {
    row = withShape(set, () => {
      const out = [];
      const cp = new Float64Array(NP * 2), o = [0, 0];
      // (rows: s -15 to -0.4 every 0.1, the shoulder (it used to start at -0.4, so out on the shoulder the line was
      // read off the wrong shape: on Trestles' gentler shoulder that put the "top" half way up the face, and turns
      // there became snaps and airs), then -0.4 to 2.8 every 0.02)
      for (let i = -146; i <= 160; i++) {
        controlPoints(i < 0 ? -0.4 + i * 0.1 : -0.4 + i * 0.02, cp, 1);
        let crestT = 4, crestY = -1e9;
        for (let t = 2; t <= 6.5; t += 0.01) { const y = crPoint(cp, t, o)[1]; if (y > crestY) { crestY = y; crestT = t; } }
        const lo = crPoint(cp, TUNE.tBottom, o)[1], want = lo + frac * (crestY - lo);
        let line = crestT; for (let t = crestT; t <= TUNE.tBottom; t += 0.01) if (crPoint(cp, t, o)[1] <= want) { line = t; break; }
        out.push(line);
      }
      return out;
    });
    faceTables.rows.set(key, row);
  }
  if (s < -0.4) {
    if (!WAVE.bar) return row[146]; // (Pipe keeps reading its line at s -0.4 out on the shoulder, as it always has: the user wants Pipe unchanged)
    const u = clamp((s + 15) / 0.1, 0, 146), i = Math.min(145, Math.floor(u)); return row[i] + (row[i + 1] - row[i]) * (u - i);
  }
  const u = clamp((s + 0.4) / 0.02, 0, 160), i = Math.min(159, Math.floor(u)) + 146;
  return row[i] + (row[i + 1] - row[i]) * (u - (i - 146));
}

// The place along the curve (t) on the back wall of the tube at `frac` of the
// tube's real height (trough at tBottom to the roof), for phase s. Tabled per
// wave, at size 1 (the shape doesn't depend on the wave's size).
let lineTable = null;
function tubeLineT(s, frac) { return blendShapes((i) => tubeLineSet(i, s, frac)); }
function tubeLineSet(set, s, frac) {
  if (!lineTable || lineTable.wave !== WAVE) lineTable = { wave: WAVE, rows: new Map() };
  const key = set + ':' + frac;
  let row = lineTable.rows.get(key);
  if (!row) {
    row = withShape(set, () => {
      const out = [];
      const cp = new Float64Array(NP * 2), o = [0, 0];
      const yAt = (t) => crPoint(cp, t, o)[1];
      for (let i = 0; i <= 160; i++) {
        controlPoints(-0.4 + i * 0.02, cp, 1);
        // (the lip's tip: the most forward point round the lip. On Trestles only on the lip itself (t 7.5-8.5): while its
        // lip is just pitching the face below bulges further forward, and taking that as the tip put the roof, and so
        // the "top" for snaps and airs, half way down the face. Pipe keeps its wider search.)
        const [t0, t1] = WAVE.bar ? [7.5, 8.5] : [6, 10.5];
        let tip = 7, zt = -1e9; for (let t = t0; t <= t1; t += 0.01) { const z = crPoint(cp, t, o)[0]; if (z > zt) { zt = z; tip = t; } }
        let roofT = tip, roofY = -1e9; for (let t = tip; t <= TUNE.tBottom; t += 0.01) { const y = yAt(t); if (y > roofY) { roofY = y; roofT = t; } }
        const want = yAt(TUNE.tBottom) + frac * (roofY - yAt(TUNE.tBottom));
        let line = TUNE.tBottom; for (let t = roofT; t <= TUNE.tBottom; t += 0.01) if (yAt(t) <= want) { line = t; break; }
        out.push(line);
      }
      return out;
    });
    lineTable.rows.set(key, row);
  }
  const u = clamp((s + 0.4) / 0.02, 0, 160), i = Math.min(159, Math.floor(u));
  return row[i] + (row[i + 1] - row[i]) * (u - i);
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
    rideDir: 1, lock: null, inDir: 0, lipSnap: null, snapGrip: false, roundhouse: null, crouchDepth: 0, barrelCrouch: 0, frontLean: 0, tubeDamp: 0, pivot: 0, foot: 0, footGoal: 0, shuf: 0, shufGoal: 0, walkDir: 1, pivotHeld: false, pivotUp: false, pivotDir: 0, nose: 0, noseTime: 0, noseRisk: 0, onNose: false, ten: 0, tenGoal: 0, tenWait: 0, tenTime: 0, tenDone: false, slash: null, slide: 0, rightHeld: 0, turnDir: 0, turnDirAge: 9, turnHeld: 0, hard: 0, assist: null, bottomCarve: false, floater: null,
    wipeReason: '', wipeTimer: 0, wipeAge: 0, washing: false, falls: null, fallsBoard: null, stepOff: null,
    events: [],
    time: 0,
  };
}

// The drop-in speed with the energy pocket (the user, 2026-11-21): 1.0x the peel, so you start out keeping pace with the
// curl and the drop's own height (gravity) gets you up to speed, as on a real takeoff. Bar waves (Trestles, the Peak)
// start before the peak breaks (peel 0 then), so theirs is the takeoff's average curl speed over its first 30 m.
export function dropInSpeed() {
  let v = PEEL_SPEED;
  if (WAVE.bar && RIDE.map) { const dt = breaksAt(30) - breaksAt(0); v = dt > 0 ? 30 / dt : TUNE.softMax; }
  return clamp(v, TUNE.vLow, TUNE.softMax);
}
export function resetRider(r) {
  Object.assign(r, createRider());
  if (TUNE.startXs != null) r.xs = TUNE.startXs; // where this wave drops you in
  if (TUNE.energy) r.speed = dropInSpeed(); // (energy pocket: you drop in keeping pace with the curl; the drop adds the rest)
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

function wipe(r, reason, ended = false) { // (ended: the ride ended without a fall: the end of the wave)
  // Wiping out in the barrel (or caught in the lip) throws you in the "washing
  // machine": a longer hold-down (the foam ball screen in main.js).
  r.washing = !!r.tube || reason.includes('caught up in the lip');
  // (a wave with a bar, Trestles: once the inside has closed out, that's the end of the wave whatever got you)
  if (WAVE.bar && RIDE.closed && !ended) reason = 'The inside closed out! (end of the wave)';
  r.mode = 'wipe';
  r.wipeReason = reason;
  r.wipeTimer = 2.2;
  r.wipeAge = 0;
  r.inBarrel = false;
  r.fallsBoard = null;
  r.events.push({ type: 'wipe', reason, ended });
  // Caught up top in the barrel: the lip takes you with it, up and over the
  // falls, before the washing machine.
  if (r.washing && reason.startsWith('Over the falls')) startFalls(r);
}

// Stepping off as the inside closes out (Trestles; the user, 2026-11-19, references closeout-exit-1..4): down in the face
// when it closes out, you stand tall, lift the front foot and step off the side of the board, forward and toward the
// beach, and drop in feet first, upright, to your chest, with a splash. The board carries on beside you, slows and
// drifts (drawn on its own, like going over the falls: r.fallsBoard). The ride ends there, without a wipeout.
const STEP_OFF = { stand: 0.22, step: 0.35 }; // s: standing tall and lifting the front foot; stepping off; then the drop
function startStepOff(r, reason) {
  const fr = frameAt(r.xs, r.t);
  const along = v3.norm([r.heading[0], 0, r.heading[2]]);
  r.stepOff = { time: 0, P: r.pos.slice(), dir: v3.norm(v3.add(v3.mul(along, 0.55), [0, 0, 0.85])), vy: 0, splashed: false };
  r.fallsBoard = {
    xs: r.xs, t: r.t, vxs: r.speed * Math.cos(r.phi), vt: 0,
    yaw: Math.atan2(v3.dot(r.heading, fr.e2), v3.dot(r.heading, fr.e1)), flip: 0, stall: true,
  };
  r.crouch = false;
  const board = r.fallsBoard;
  wipe(r, reason, true);
  r.fallsBoard = board; // (wipe() clears it)
  r.wipeTimer = 2.8;
}
function stepStepOff(r, dt) {
  const so = r.stepOff, b = r.fallsBoard;
  so.time += dt;
  // the board: on along the wave, slowing, drifting round a little and slipping down the face
  if (b) { b.vxs *= Math.exp(-dt * 1.3); b.xs += (b.vxs - PEEL_SPEED) * dt; b.vt += 0.6 * dt; b.t = Math.min(NP - 2.2, b.t + b.vt * dt); b.yaw += dt * 0.5; }
  const prev = r.pos;
  if (so.time < STEP_OFF.stand) {
    // still on it, standing up tall as it glides on
    const fr = frameAt(b.xs, b.t);
    r.pos = fr.P.slice(); so.P = r.pos.slice();
  } else if (so.time < STEP_OFF.stand + STEP_OFF.step) {
    // the step: forward and toward the beach, a little up and over
    const u = (so.time - STEP_OFF.stand) / STEP_OFF.step;
    r.pos = v3.add(so.P, v3.add(v3.mul(so.dir, 0.75 * u), [0, 0.18 * Math.sin(Math.PI * u), 0]));
    so.P1 = r.pos.slice();
  } else {
    // the drop: straight down, feet first, to chest deep (slowing hard once in the water)
    const sl = slice(r.xs);
    const hits = verticalHits(sl, r.pos[2]);
    const water = hits.length ? Math.max(...hits.filter((h) => h.ny > 0).map((h) => h.y), -9) : 0;
    const inWater = r.pos[1] < water;
    so.vy += (inWater ? 0 : -9.8) * dt;
    if (inWater) {
      so.vy *= Math.exp(-dt * 6);
      if (!so.splashed) { so.splashed = true; r.events.push({ type: 'fallsLand' }); } // (the splash)
    }
    const floor = water - 1.15;
    r.pos = v3.add(r.pos, [so.dir[0] * 0.4 * dt, so.vy * dt, so.dir[2] * 0.4 * dt]);
    if (r.pos[1] < floor) { r.pos[1] = floor; so.vy = 0; }
  }
  r.vel = v3.mul(v3.sub(r.pos, prev), 1 / Math.max(dt, 1e-3));
}

// Over the falls: sucked up the face, round under the roof and out to the
// lip's tip (at your spot along the wave), then carried with the tip as it
// throws out and down (the lip further back along the wave is the same water
// later on, so following the tip backward along xs is following it in time)
// until it lands in the flats. The washing machine starts there.
const FALLS_UP = 0.5, FALLS_OVER_MAX = 0.85; // seconds: up to the tip, then down with it
function startFalls(r) {
  const tip = WAVE.lipT;
  let xsLand = r.xs;
  // Where the tip lands: low down near the trough, behind you.
  for (let x = r.xs; x > r.xs - 16; x -= 0.25) {
    xsLand = x;
    if (surface(x, tip)[1] < surface(x, NP - 2)[1] + 0.6) break;
  }
  const over = Math.min(FALLS_OVER_MAX, Math.max(0.15, (r.xs - xsLand) / 9));
  r.falls = { time: 0, xs0: r.xs, t0: r.t, xsLand, over };
  r.wipeTimer += FALLS_UP + over;
  // You come off your board: the lip takes you, not it. The board stalls on
  // the face where you left it, then the water drags it back under the
  // curtain and down toward the trough, flipping over as it goes.
  const fr = frameAt(r.xs, r.t);
  r.fallsBoard = {
    xs: r.xs, t: r.t, vxs: 0, vt: 0,
    yaw: Math.atan2(v3.dot(r.heading, fr.e2), v3.dot(r.heading, fr.e1)), // its heading on the face
    flip: 0, // end over end
  };
}
function stepFallsBoard(r, dt) {
  const b = r.fallsBoard;
  b.vt += 3.0 * dt; // sliding down the face
  b.t = Math.min(NP - 2.2, b.t + b.vt * dt);
  b.vxs += (-0.8 * PEEL_SPEED - b.vxs) * Math.min(1, dt * 1.2); // the water holds it while the curl runs on
  b.xs += b.vxs * dt;
  b.yaw += dt * 1.6;
  b.flip += dt * 6.5;
}
const FALLS_OFF = 0.35; // held this far out from the water (air side)
function stepFalls(r, dt) {
  const f = r.falls;
  f.time += dt;
  if (r.fallsBoard) stepFallsBoard(r, dt);
  let xs, t;
  if (f.time < FALLS_UP) {
    const u = f.time / FALLS_UP, e = u * u * (3 - 2 * u);
    xs = f.xs0; t = f.t0 + (WAVE.lipT - f.t0) * e;
  } else {
    const v = Math.min(1, (f.time - FALLS_UP) / f.over);
    xs = f.xs0 + (f.xsLand - f.xs0) * Math.pow(v, 1.4); t = WAVE.lipT; // speeding up as it falls
  }
  const fr = frameAt(xs, t), prev = r.pos;
  r.xs = xs;
  r.pos = v3.add(fr.P, v3.mul(fr.n, FALLS_OFF));
  r.vel = v3.mul(v3.sub(r.pos, prev), 1 / Math.max(dt, 1e-3));
  if (f.time >= FALLS_UP + f.over) {
    r.falls = null;
    r.wipeAge = 0; // (the tumble in the foam starts now)
    r.events.push({ type: 'fallsLand' });
  }
}

// input: { turn: -1..1 (Left = +1), tilt: -1..1 (Up = +1), aim: [x, y] | null, pump, crouch }
export function stepRider(r, input, dt) {
  r.events.length = 0;
  r.time += dt;
  r.crouch = !!input.crouch || !!r.tube;
  r.pumping = false;
  if (r.mode === 'wipe') {
    r.wipeTimer -= dt; r.wipeAge += dt;
    if (r.falls) stepFalls(r, dt);
    if (r.stepOff) stepStepOff(r, dt);
    return;
  }
  if (r.mode === 'surf') stepSurf(r, input, dt);
  else stepAir(r, input, dt);
  for (const e of r.events) {
    if ((e.type === 'move' && e.move !== 'bottomTurn') || e.type === 'land') {
      // (no calm after a slash: it's a sharper turn, not a pivot off the lip,
      // so carving through it keeps its flow; it still scrubs a little)
      if (e.move !== 'slash' && e.move !== 'roundhouse') r.calm = TUNE.moveCalm; // (a roundhouse flows into the rebound)
      // A move costs a little speed (the board scrubs as it pivots), and any
      // drive still banked from the bottom turn is spent.
      r.speed *= 1 - (e.move === 'slash' && e.tube ? TUNE.slashTube.scrub : (TUNE.moveScrub[e.move || 'land'] || 0));
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
// Snaps: on waves with `snapShoulder` (the reef) only right at the lip
// (`snapNear` below the top) and out of the pocket toward the shoulder
// (`snapShoulder` m ahead of the curl). Elsewhere it's a check turn.
function snapAllowed(r, top) {
  const T = TUNE;
  if (T.snapShoulder == null) return true;
  return r.xs >= T.snapShoulder && r.t <= top + T.snapNear;
}
// Check turn: a quick, modest turn back down (about as much as a slash:
// `checkTurn` rad at most, ending no steeper than `checkExit` down), at
// `checkRate`, then the board's yours again.
function startCheckTurn(r, combo) {
  const T = TUNE;
  r.assist = { dir: -1, target: Math.max(r.phi - T.checkTurn, -T.checkExit), rate: T.checkRate };
  lockInput(r);
  r.roundhouse = null; r.slash = null;
  r.events.push({ type: 'move', move: 'check', speed: r.speed, combo, xs: r.xs });
}

function startLipSnap(r, top, target) {
  r.lipSnap = { t: Math.max(r.t, top + TUNE.snapLine), target, time: 0, standing: true };
  lockInput(r);
  r.slide = -r.phi; r.phi = 0;
  r.roundhouse = null; r.slash = null;
}

// While a move has the board your steering is ignored; as soon as the move
// is done, whatever you're holding takes effect again (even if you never let
// go). (An earlier version kept ignoring a held key until you pressed it
// again; the user preferred just the delay.)
function lockInput(r) { r.lock = { dir: r.inDir }; }

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
  // (the wave's power for speed: the pocket, or a steep wall standing up anywhere along it, whichever is more; moves and
  // zones still go by the pocket alone)
  // (only out of the pocket: there the pocket's own speed is kept as it was, `1 - pk`)
  const wall = T.wallK ? wallPower(r.xs) * (1 - pk) : 0; r.wall = wall;
  const pkDrive = Math.max(pk, wall);
  // (`physPocket` waves: on the face at all, any real slope; out on the flats, 0)
  const steepAny = sstep(0.01, 0.06, 1 - f.n[1]);
  // 0 on flat water, 1 on a steep face; the pocket counts as steep even near
  // the rounded crest (and so does a steep wall: on Trestles' 25-30 deg walls the face's own slope only reads ~0.2).
  // (a wall's power sets how much it's worth, in `pkSpeed` below; here a wall face just counts as steep, fading in out of
  // the pocket, or it would count twice: a 0.6 wall came out worth 0.6 x 0.6 of the pocket)
  // (and the wall by its own angles, `wallAngles`: the pocket's gate, 18-46 deg, lets only ~5% through on a 24 deg wall)
  const faceAng = wall > 0 ? Math.acos(clamp(f.n[1], -1, 1)) * 180 / Math.PI : 0;
  const steep = Math.max(clamp((1 - f.n[1]) / 0.55, 0, 1), 0.85 * pk * sstep(0.05, 0.3, 1 - f.n[1]),
    wall > 0 ? 0.85 * (1 - pk) * sstep(...(T.wallAngles || [17, 28]), faceAng) : 0);
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
    if (r.lock && !busy) r.lock = null; // the move's done: your input counts again
    if (r.lock) input = { crouch: input.crouch, walk: input.walk }; // (walking the board still works during a move)
  }
  const wantsTurn = !!(input.turn || input.tilt || (input.aim && (input.aim[0] || input.aim[1])));
  if (!wantsTurn || Math.sin(r.phi) > 0.5) r.bottomCarve = false;
  else if (r.turnHeld === 0 && !r.turnDir && Math.sin(r.phi) < -0.3 && height < 0.6) r.bottomCarve = true;
  const hard = r.bottomCarve ? 1 : r.hard;
  // (shortboard feet: back = sharper, forward = more rail to rail)
  const sBack = Math.max(0, -r.shuf), sFwd = Math.max(0, r.shuf);
  const shufR = 1 + (T.backRadius - 1) * sBack + (T.fwdRadius - 1) * sFwd, shufT = 1 + (T.backTurn - 1) * sBack + (T.fwdTurn - 1) * sFwd;
  const radius = (T.rTop + (T.rBottom - T.rTop) * low) * (r.bottomCarve ? T.bottomCarveRadius : 1 - (1 - T.hardRadius) * hard) * shufR;
  const rateCap = T.turn * (1 + (T.hardRate - 1) * hard) * shufT;
  let rate = (1 - (T.tubeTurnDamp || 0) * r.tubeDamp) * (1 - (T.noseTurnDamp || 0) * r.nose) * clamp(r.speed / radius, T.minTurn, rateCap); // (damped in the barrel: subtler turns the deeper you are)
  if (sBack > 0) rate += (rateCap * (1 - (T.tubeTurnDamp || 0) * r.tubeDamp) - rate) * T.backPivot * sBack; // (back foot: a little more pivot, less tied to speed)
  // Fin pivot (longboard, `pivotRate`): stepped back on the tail, the board swings round
  // the fin at its own rate, however slow you're going, instead of carving an arc on the rail.
  // (turning away from the lip, nose swinging down the face, it pivots quicker: `pivotDownRate`)
  // (and it swings slower as the board slows: full quickness from `pivotSpeedRef` up, down to `pivotSlowMin` of it
  // nearly stopped; the user, 2026-11-18)
  const pivotSpeedK = T.pivotSpeedRef ? clamp(r.speed / T.pivotSpeedRef, T.pivotSlowMin ?? 0.4, 1) : 1;
  if (T.pivotRate && r.pivot > 0) rate += (T.pivotRate * (r.pivotUp ? 1 : (T.pivotDownRate ?? 1)) * pivotSpeedK - rate) * r.pivot;
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
  // Toward the wall of the wave or away, decided once when a turn starts and kept until you let go (2026-11-18, the
  // user): toward the wall = the swing's first ~25 deg takes the nose further up the face (from straight down
  // either way is toward the wall, from straight up either way away). It used to be re-decided every frame from the
  // nose's heading, so one turn switched halfway. On waves with `wallTurn` a turn from the tail toward the wall is
  // that much slower, wherever she is on the wave (on top of the pivot settings by direction); from the middle and
  // the nose turns are the same both ways.
  const swing = steer ? Math.sign(steer) : input.aim && (input.aim[0] || input.aim[1]) ? Math.sign(wrap(Math.atan2(input.aim[1], input.aim[0]) - r.phi)) : 0;
  if (!swing) r.pivotDir = 0;
  else if (swing !== r.pivotDir) { r.pivotDir = swing; r.pivotUp = Math.sin(r.phi + swing * 0.44) > Math.sin(r.phi); }
  if (swing && r.pivotUp && T.wallTurn) rate *= 1 - (1 - T.wallTurn) * Math.max(0, -r.foot); // (tail turns only)
  // In the pocket, tail turns are slower still (Queens `pocketTurn`, the user, 2026-11-18), more so toward the wall
  // (`pocketWallTurn` on top), fading out with the pocket's power toward the shoulder and the whitewater.
  if (swing && T.pocketTurn) rate *= 1 - Math.max(0, -r.foot) * pk * (T.pocketTurn + (r.pivotUp ? T.pocketWallTurn || 0 : 0));
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
  // --- fin pivot (longboard) ---
  // Walked back to the tail (r.foot -1, the walk buttons below), every turn up on the wave
  // pivots round the fin: the nose lifts and the board swings at `pivotRate` (above),
  // whichever way you're heading, scrubbing speed as it swings (`pivotDrag`) and making none.
  // Out on the flats in front of the wave a turn is on the rail even from the tail. From the
  // middle or further forward, turns are rail turns.
  if (T.pivotRate) {
    // A pivot has to start up on the wave, but once started it carries on until you let go of the turn,
    // even if it swings you down onto the flats (facing the whitewater, a turn down the face used to drop
    // to a slow rail turn partway round).
    // (out on the flats it eases off: full pivots for the first few feet past the bottom of the face,
    // `pivotFlats[0]` in surface units, fading to rail turns by `pivotFlats[1]`)
    const allow = r.tube ? 0 : 1 - sstep(T.pivotFlats[0], T.pivotFlats[1], r.t - T.tBottom);
    if (!d) r.pivotHeld = false;
    else if (allow > 0.5 && r.foot < -0.5) r.pivotHeld = true;
    // Which way: nose swinging up the face toward the lip, or down away from it. Toward the lip it's more of
    // a rail turn that drives (`pivotMaxUp`, `pivotDriveUp`); away from it more of a quick pivot (`pivotMax`,
    // `pivotDownRate`, `pivotDriveK`).
    // Decided once, when the turn starts, and kept until you let go (2026-11-18, the user: it should go by whether the
    // board pivots toward the wall of the wave or away). It used to be re-decided every frame from where the nose was
    // heading, so one pivot switched halfway: heading back and swinging round down the face, the second half (nose
    // coming back up) slowed to the toward-the-wall setting. Toward the wall = the swing's first ~25 deg takes the
    // nose further up the face (from straight down either way is toward the wall, from straight up either way away).
    // (r.pivotUp: toward the wall or away, decided once per turn where the turn starts, above)
    const pmax = r.pivotUp ? (T.pivotMaxUp ?? T.pivotMax ?? 1) : (T.pivotMax ?? 1);
    const pv = (r.pivotHeld && !r.tube ? 1 : allow) * Math.max(0, -r.foot) * pmax; // (the tail spot is just ahead of the very tail, so it's part pivot, part rail)
    r.pivot += (pv - r.pivot) * (1 - Math.exp(-dt / 0.08));
  }
  // --- slash: a Right turn started low on the way up (also in the barrel) ---
  // While it slides, your line keeps carving normally (carrying you on up the
  // face) and the board swings round ahead of it (r.slide); when you let go,
  // or it's swung far enough, the fins grip and your line catches up to the
  // board. The total turn is sharper than a carve, but it's still a turn:
  // nothing is added to your speed.
  r.rightHeld = steer < 0 ? r.rightHeld + dt : 0;
  const inTube = !!r.tube;
  const SG = (key) => (inTube && T.slashTube[key] !== undefined ? T.slashTube[key] : T[key]); // (gentler gates in the barrel)
  if (!r.slash && !r.slide && !r.lipSnap && steer < 0 && r.rightHeld <= SG('slashWindow') && r.moveCooldown === 0 && !r.assist && !r.floater && !r.fakie
    && r.speed > T.slashMinSpeed && height < SG('slashLow')
    && r.time - ((inTube ? r.tubeDropTime : r.steepDropTime) ?? -9) < SG('slashDropRecent') // a real bottom turn, not a little turn in the pocket
    && Math.sin(r.phi) > SG('slashClimb') && Math.cos(r.phi) > -0.5 // on the way up (not cutting back along the wave)
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
    && r.xs > T.roundhouseZone && pk < T.roundhousePocket && Math.cos(r.phi) > 0.2 && !(r.foot < -0.5)) { // (from the tail a cutback is a fin pivot, not a dropknee turn)
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
      d *= T.roundhouseRate || 1; // (a longboard's dropknee turn comes round faster than its normal turns)
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
  // --- walking the board and noseriding (waves with `noseride`: the longboard) ---
  // Three spots along the board (r.foot): -1 the tail (fin pivots, slower), 0 the middle
  // (rail turns, the fastest trim), 1 the nose (hang five). Walk up / walk back (buttons,
  // keys) move one spot per press (`tailWalk` s between the tail and the middle, `noseWalkUp`
  // / `noseWalkBack` between the middle and the nose). On the nose
  // you can barely steer (noseTurnDamp, in `rate` above). In the pocket the
  // nose trims you to the curl's speed, so you slow down and stay there; out
  // on the shoulder (pocket power below nosePocket) it drags and starts going
  // under, and stay out there too long and you pearl.
  if (WAVE.shuffle && !WAVE.noseride) {
    // shortboard: shuffle the feet back / middle / forward (see `shuffleTime` in RIDER_TUNE)
    if (input.walk && input.walk !== 'cycle') r.shufGoal = clamp(r.shufGoal + Math.sign(input.walk), -1, 1);
    const st = dt / T.shuffleTime;
    r.shuf = r.shuf < r.shufGoal ? Math.min(r.shufGoal, r.shuf + st) : Math.max(r.shufGoal, r.shuf - st);
  }
  if (WAVE.noseride) {
    // (Space: 'cycle' walks back -> middle -> front -> middle -> back, turning round at each end)
    if (input.walk === 'cycle') {
      if (r.footGoal >= 1) r.walkDir = -1; else if (r.footGoal <= -1) r.walkDir = 1;
      r.footGoal = clamp(r.footGoal + r.walkDir, -1, 1);
    } else if (input.walk) r.footGoal = clamp(r.footGoal + Math.sign(input.walk), -1, 1);
    if (r.foot < r.footGoal) r.foot = Math.min(r.footGoal, r.foot + dt / (r.foot >= 0 ? T.noseWalkUp : T.tailWalk));
    else if (r.foot > r.footGoal) r.foot = Math.max(r.footGoal, r.foot - dt / (r.foot > 0 ? T.noseWalkBack : T.tailWalk));
    r.nose = Math.max(0, r.foot);
    const n = sstep(0.3, 1, r.nose);
    if (r.nose >= 1 && !r.onNose) { r.onNose = true; r.events.push({ type: 'move', move: 'hang5', speed: r.speed, xs: r.xs }); }
    if (r.onNose) r.noseTime += dt;
    // Hang ten (hang-ten-position.jpg in braickish/reference-images, 2026-11-18, the user's idea): on the nose in
    // the pocket, about mid-way up the wall, she steps the back foot up beside the front one by herself (both feet
    // over the nose, facing it); out of that spot she steps it back to hang five. It has to hold for `tenSettle` s
    // to step up, and stays a little beyond the spot once there (`tenMargin`), so it doesn't flicker at the edges.
    if (T.tenPocket !== undefined) {
      const m = r.tenGoal ? T.tenMargin : 0;
      const spot = r.onNose && r.footGoal >= 1 && r.nose >= 1 && pk >= T.tenPocket - m && height >= T.tenLow - m && height <= T.tenHigh + m;
      r.tenWait = spot ? r.tenWait + dt : 0;
      r.tenGoal = spot && (r.tenGoal || r.tenWait >= T.tenSettle) ? 1 : 0;
      r.ten = r.ten < r.tenGoal ? Math.min(1, r.ten + dt / T.tenStep) : Math.max(0, r.ten - dt / (r.footGoal < 1 ? T.tenStep * 0.6 : T.tenStep));
      if (r.ten >= 1 && !r.tenDone) { r.tenDone = true; r.events.push({ type: 'move', move: 'hang10', speed: r.speed, xs: r.xs }); }
      if (r.ten >= 1) r.tenTime += dt;
    }
    if (r.onNose && r.nose < 0.6) { // walked back
      r.events.push({ type: 'noseride', time: r.noseTime, tenTime: r.tenTime });
      r.onNose = false; r.noseTime = 0; r.tenTime = 0; r.tenDone = false;
    }
    if (n > 0) {
      r.speed += ((T.noseSpeed ? T.noseSpeed * PEEL_SPEED : PEEL_SPEED - (T.noseUnder || 0)) - r.speed) * (1 - Math.exp(-dt * T.noseHold * pk * n)); // (a touch under the curl's speed: the wave adds a little back)
      const out = clamp(1 - pk / T.nosePocket, 0, 1); // 0 in the pocket .. 1 well out on the shoulder
      r.speed *= Math.exp(-dt * T.noseDrag * out * n);
      r.noseRisk = clamp(r.noseRisk + (out > 0 ? out * n / T.nosePearl : -1.5) * dt, 0, 1);
      if (r.noseRisk >= 1) return wipe(r, 'Pearled! (noseride in the pocket, not out on the shoulder)');
    } else r.noseRisk = Math.max(0, r.noseRisk - 1.5 * dt);
  }
  // In the barrel: crouch lower the deeper you are (a compact crouch as you go
  // in, right down to the full barrel stance deep in), and really deep, a
  // slight lean onto the front foot (which drives you forward a little; see
  // the trim drive below). Both build up gradually.
  const tdep = r.tube ? tubeDepth(r) : 0;
  const crouchT = r.tube ? 0.3 + 0.7 * sstep(0.05, 0.55, tdep) : 0;
  r.barrelCrouch += (crouchT - r.barrelCrouch) * (1 - Math.exp(-dt * (crouchT > r.barrelCrouch ? 2.5 : 4)));
  const leanFT = r.tube ? sstep(0.4, 0.85, tdep) : 0;
  r.frontLean += (leanFT - r.frontLean) * (1 - Math.exp(-dt * (leanFT > r.frontLean ? 1.5 : 4)));
  // Turning is damped in the barrel, more the deeper you are (`tubeTurnDamp` at
  // full damping, reached by about half depth): subtle adjustments rather than
  // the full carves of the open face. Eases in and back out. On `tubeReal`
  // waves it starts building 1 m before the barrel's entry point (where the
  // lip has thrown), reaching a quarter of full damping as you go in.
  let dampT = r.tube ? sstep(0, 0.5, tdep) : 0;
  if (WAVE.tubeReal) {
    if (r.tube) dampT = 0.25 + 0.75 * dampT;
    else {
      // within 1 m of the entry point both ways: in under the lip, and along the wave as the curl
      // comes to you (phase.behind is metres per unit of phase behind the curl)
      const ph = phaseAt(r.xs), along = 1 / WAVE.phase.behind;
      if (ph > T.tubeEnter - along && ph < T.tubeCollapse) {
        const inUnder = lipTipZ(r.xs) - r.pos[2]; // how far in under the lip (m; negative = out in front of it)
        dampT = 0.25 * sstep(WAVE.tubeReal.enterIn - 1, WAVE.tubeReal.enterIn, inUnder) * sstep(T.tubeEnter - along, T.tubeEnter, ph);
      }
    }
  }
  r.tubeDamp += (dampT - r.tubeDamp) * (1 - Math.exp(-dt * 3));
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
  const pivotK = 1 - (r.pivot || 0) * (1 - ((r.pivotUp ? T.pivotDriveUp : null) ?? T.pivotDriveK ?? 0)); // (a fin pivot isn't on the rail: only `pivotDriveK` of a carve's drive, `pivotDriveUp` turning toward the lip)
  const carveDrive = (r.bottomCarve ? T.bottomCarveDrive : 1 + 0.35 * hard) * pivotK;
  // Turn drive goes into a buffer that releases smoothly, so speed builds
  // through the turn instead of jumping.
  // A committed bottom turn drives from its very first moment (the nose
  // starting to come round), not only once it's coming up the face.
  // (turning so the nose swings up the face, toward the wave, not further down)
  r.carvingUp = d !== 0 && Math.sign(d) === (Math.cos(r.phi - d) >= 0 ? 1 : -1);
  const driving = r.bottomCarve ? r.carvingUp : Math.sin(r.phi) > sinBefore;
  const turnDrives = !(r.roundhouse && T.roundhouseNoDrive); // (a dropknee turn turns you, it doesn't make speed)
  // (waves with `driveRefSpeed`: above that speed a radian of turn pays less, so drive per second stops growing with
  // speed: turns come round faster when you're fast, and paying per radian made speed build on speed; the user, 2026-11-18)
  const driveK = T.driveRefSpeed ? Math.min(1, T.driveRefSpeed / Math.max(r.speed, 1e-3)) : 1;
  if (turnDrives && driveLow > 0 && driving && d === playerD && !(r.slash && r.slash.released) && !r.slide) r.driveBank += T.bottomDrive * carveDrive * Math.abs(d) * driveLow * (0.4 + 0.6 * pkDrive) * driveK;
  if (turnDrives && high > 0 && d === playerD && !(r.slash && r.slash.released) && !r.slide) r.driveBank += T.topDrive * Math.abs(d) * high * pkDrive * pivotK * driveK;
  // Pivoting on the fin scrubs speed as the board swings (more the faster it swings).
  if (T.pivotRate && r.pivot > 0 && playerD) r.speed *= Math.exp(-T.pivotDrag * r.pivot * Math.abs(playerD)); // (pivotDrag: per radian swung)
  const release = r.driveBank * (1 - Math.exp(-dt / T.driveSmooth));
  // (waves with `driveMaxAccel`: turn drive alone never adds speed faster than this, m/s^2; the rest of the
  // bank is spent, not saved, so it doesn't carry on pushing after the turn)
  r.speed += T.driveMaxAccel ? Math.min(release, T.driveMaxAccel * dt) : release; r.driveBank -= release;
  if (playerD) { r.lastTurnTime = r.time; r.lastTurnDir = Math.sign(playerD); }

  // Track bottom turns (for moves and combos): down low heading down, then up.
  if (sinBefore < -0.3 && height < 0.45) r.bottomArmed = true;
  if (sinBefore < -T.slashDropAngle && height < T.slashDropLow) r.steepDropTime = r.time; // (for the slash: came off the bottom pointing steeply down)
  if (sinBefore < -T.slashTube.slashDropAngle && height < T.slashTube.slashDropLow) r.tubeDropTime = r.time; // (the barrel's gentler version, used for slashes in the tube: the drop can come just before you're in)
  if (r.bottomArmed && Math.sin(r.phi) > 0.3) {
    r.bottomArmed = false;
    if (height < 0.6) { r.lastBottomTurn = r.time; r.events.push({ type: 'move', move: 'bottomTurn', speed: r.speed, xs: r.xs }); }
  }
  if (height > 0.75) r.bottomArmed = false;

  // --- speed ---
  // Cruising speed climbs with height: up near the top of the pocket is fastest.
  // (speed fades a little further out than the pocket itself: shoulderReach)
  const pkReach = r.xs > 0 ? pocketPower(Math.max(0, r.xs - T.shoulderReach) / (T.shoulderFade || 1)) : pk; // (shoulderFade: fades over this many times the pocket's own length)
  const pkSpeed = Math.max(pkReach, wall); // (a steep wall anywhere feeds you too: `wallK`)
  let target = T.vLow + (T.vPocket - T.vLow) * pkSpeed * steep * (T.heightSpeed[0] + T.heightSpeed[1] * height);
  if (T.energy) target = T.vLow + (T.pocketHold * PEEL_SPEED - T.vLow) * pkSpeed * steepAny; // (energy pocket: 1.0x the peel, any height)
  else if (T.physPocket) target = physCruise(T.physPocket, height, pkSpeed, steepAny);
  r.cruise = target; // (the wave's cruising speed for you here, before feet and foam: tests)
  if (r.foot < 0) target *= 1 - (1 - (T.tailSpeed ?? 1)) * -r.foot; // (standing on the tail the board drags: slower than from the middle)
  if (r.foot > 0 && T.noseSpeed) target *= 1 - (1 - T.noseSpeed) * r.foot; // (energy pocket, longboard: on the nose a touch under the middle)
  target *= 1 + (T.backSpeed - 1) * sBack + (T.fwdSpeed - 1) * sFwd; // (shortboard feet: back a little slower, forward a little faster)
  // Trimming from the middle is the fast line: a higher cruising speed that it picks up quicker (`middleSpeed`, `middleFeed`).
  const mid = T.middleSpeed ? 1 - Math.min(1, Math.abs(r.foot)) : 0;
  target *= 1 + ((T.middleSpeed || 1) - 1) * mid;
  const feedK = (1 + ((T.middleFeed || 1) - 1) * mid) * (1 + (T.fwdFeed - 1) * sFwd); // (front foot: picks up speed quicker)
  r.boost = Math.max(0, (r.boost || 0) - dt);
  if (r.boost > 0 && r.boost < 0.85 && foam < 0.2) r.boost = 0; // cleared the foam you bounced off
  if (r.boost > 0) { /* just rebounded: the foam can't slow you for a moment */ }
  else if (r.floater) target = Math.max(target, r.speed); // floating holds your speed
  else target += (T.vFoam + ((T.foamPush ?? T.vFoam) - T.vFoam) * mid - target) * foam * (climbingFoam(r) ? T.climbFoamDrag : 1); // climbing up the whitewater drags less; on a longboard from the middle the whitewater pushes you along (`foamPush`)
  // The pocket only feeds you while you're not climbing: point up the face
  // and you slow down for real.
  const climbing = sstep(0.15, 0.6, Math.sin(r.phi));
  const foamFeed = 1 + ((T.foamPushFeed || 1) - 1) * mid * foam; // (and it picks you up quickly)
  r.speed += (target - r.speed) * (r.speed < target ? T.feed * feedK * foamFeed * (1 - climbing) : T.bleed) * dt;
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
  // (waves with `dropTerminal`: the faster you already go, the less a drop adds, fading to nothing at that speed, like
  // drag growing with speed; and `postMoveDrop`: dropping back down off a move pays only this much)
  const dropDrag = T.dropTerminal ? Math.max(0, 1 - (r.speed / T.dropTerminal) ** 2) : 1;
  let gDv = 0; // (energy pocket: gravity's change, added after the acceleration cap: a drop isn't capped, it's g sin(face))
  if (T.energy) {
    // (pointing down pays only for what goes beyond cancelling the water's lift, so holding a line against it is neutral
    // and trimming in the pocket stays at the peel; climbing costs only your own climb: the lift is the wave's work, free)
    const gSlope = 9.81 * Math.sqrt(Math.max(0, 1 - f.n[1] * f.n[1]));
    const net = sinp < 0 ? Math.min(0, sinp + (T.faceFlow || 0) * steep * pkReach / Math.max(r.speed, 1)) : sinp;
    if (net < 0) gDv = -net * gSlope * dropDrag * (r.postMove ? T.postMoveDrop ?? 1 : 1) * dt;
    else if (!(r.floater && T.floaterSteer)) gDv = -net * gSlope * dt;
  } else if (T.physPocket?.gravity) {
    // (`physPocket.gravity`: real gravity on the slope under the board, both ways: g sin(face angle) x how much you point
    // down / up it, so a drop gains sqrt(2 g x height) and a climb gives it back; drag above `dropTerminal` as before;
    // off a move the drop still pays only `postMoveDrop` until you're back below mid-face)
    const gSlope = 9.81 * Math.sqrt(Math.max(0, 1 - f.n[1] * f.n[1])); // g sin(theta), theta from the face's normal
    if (sinp < 0) r.speed += -sinp * gSlope * dropDrag * (r.postMove ? T.postMoveDrop ?? 1 : 1) * dt;
    else if (!(r.floater && T.floaterSteer)) r.speed -= sinp * gSlope * dt;
  } else if (sinp < 0) r.speed += -sinp * T.drop * dropBoost * dropSteep * dropDrag * (r.postMove ? T.postMoveDrop ?? 1 : 1) * dt;
  else if (!(r.floater && T.floaterSteer)) r.speed += -sinp * T.climb * steep * dt; // (floating on top of the foam you aren't climbing: no climb drag)
  // In the barrel, the wave drives you: trimming flat or pointing down the
  // line picks up extra speed (fading out as you point up the face)
  // (it only tops you up to just faster than the wave, not beyond)
  // (higher up in the barrel, the top half, it runs a bit faster)
  // (deep in, leaning onto the front foot adds a little: `tubeLeanOver` faster, `tubeLeanDrive` more push)
  const trimCap = PEEL_SPEED + T.tubeTrimOver + (T.tubeTrimOverHigh - T.tubeTrimOver) * sstep(0.42, 0.52, height)
    + (T.tubeLeanOver || 0) * r.frontLean;
  if (r.tube && Math.cos(r.phi) > 0 && r.speed < trimCap) {
    r.speed = Math.min(trimCap, r.speed + (T.tubeDrive + (T.tubeLeanDrive || 0) * r.frontLean) * (1 - sstep(0.0, 0.35, sinp)) * dt);
  }
  // ... and trimming in the barrel settles you at that speed (dropping down
  // the face can still take you past it).
  if (r.tube && sinp > -0.2 && r.speed > trimCap) r.speed -= (r.speed - trimCap) * 3 * dt;
  // Stacked moves can't run away with your speed: above softMax it bleeds off.
  const softMax = T.softMax + T.highDropSoftMax * highDropNow; // a drop from high up can run a bit faster
  if (r.speed > softMax) r.speed -= (r.speed - softMax) * T.overBleed * dt;
  // However many things are feeding you speed at once (drop, pocket, turn
  // drive, pump), it never surges: speed builds at most maxAccel.
  // Pointing down high on the wave is allowed to build speed faster.
  const highDrop = highDropNow;
  const accelCap = T.maxAccel * (1 - (1 - T.maxAccelFast) * sstep(T.accelTaper[0], T.accelTaper[1], speedAtStart)) * (1 + T.highDropAccel * highDrop) * (1 + (T.fwdAccel - 1) * sFwd);
  r.speed = Math.min(r.speed, speedAtStart + accelCap * dt);
  r.speed += gDv;
  // During a move, and for a moment after it, you don't speed up at all:
  // the move is a turn of the board, not a boost. (Bottom turns excluded.)
  r.calm = Math.max(0, (r.calm || 0) - dt);
  if (r.assist || r.floater || r.calm > 0 || r.lipSnap || r.snapGrip) { r.speed = Math.min(r.speed, speedAtStart); r.sinceHold = 0; }
  // ... and once the move hands the board back, speed eases back in over `moveEase` instead of switching on at
  // full in one frame (2026-11-18, the user: unnatural acceleration out of moves; coming off a snap's grip the
  // speed went from scrubbing -13 mph/s to building +21 mph/s between two frames).
  else {
    r.sinceHold = (r.sinceHold ?? 9) + dt;
    if (T.moveEase > 0 && r.sinceHold < T.moveEase) r.speed = Math.min(r.speed, speedAtStart + accelCap * sstep(0, T.moveEase, r.sinceHold) * dt);
  }
  // The snap scrubs speed on the lip while the board swings and grips.
  // (not while the board first stands up: just while it spins round and grips)
  if ((r.lipSnap && !r.lipSnap.standing) || r.snapGrip) r.speed = Math.min(r.speed, speedAtStart) * (1 - T.lipSnapDrag * dt);
  // Sliding sideways in a slash scrubs speed, and nothing builds it meanwhile.
  else if (r.slide > 0) r.speed = Math.min(r.speed, speedAtStart) * (1 - (r.tube ? T.slashTube.slashDrag : T.slashDrag) * Math.sin(Math.min(r.slide, Math.PI / 2)) * dt);
  if (sBack > 0) r.speed *= 1 - T.backScrub * sBack * r.turnRate * dt; // (back foot: turning scrubs a little speed)
  r.speed = clamp(r.speed, T.minSpeed, T.maxSpeed);

  // --- move ---
  const cosp = Math.cos(r.phi);
  const dxs = (r.speed * cosp - PEEL_SPEED) * dt;
  r.xs += dxs;
  // Moving along the wave keeps your real height (only pointing up or down
  // the face changes it). The wave's cross-section reshapes along the beach
  // (most of all around the barrel), so staying at the same place in the
  // shape would carry you up and down over a lump that isn't in the water.
  if (Math.abs(f.Pt[1]) > 0.25 * Math.hypot(f.Pt[1], f.Pt[2])) {
    r.t += clamp(-(f.Px[1] * dxs) / f.Pt[1], -0.5, 0.5);
  }
  // On a heavy wave the water rushes up the face and carries you with it:
  // trimming level drifts you up, so you hold your line pointing a little down.
  let faceLift = (T.faceFlow || 0) * steep * pkReach; // (carries as far out as the pocket's speed; not the wall's)
  if (r.tube && (r.slide > 0 || (r.slash && r.slash.released))) faceLift *= T.slashTube.lift; // a barrel slash digs in against the water rushing up
  let rise = r.speed * sinp + faceLift;
  // In the barrel, heading up the face is slowed (`tubeClimbDamp`, more the deeper you are) so a turn
  // up the wall doesn't suck you up into the roof; dropping down isn't.
  if (r.tube && rise > 0) rise *= 1 - (T.tubeClimbDamp || 0) * (0.65 + 0.35 * r.tubeDamp);
  r.t -= (rise * dt) / Math.max(0.3, Math.hypot(f.Pt[1], f.Pt[2]));
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
  if (r.floater && T.floaterSteer) {
    // Free floater (`floaterSteer`, Raglan; 2026-11-18, the user: the old one grabbed the board and steered it): you
    // keep steering the whole time and get a little speed (`floaterBoost`, eased in), with no foam drag while you
    // float. You can't climb above where you got on, but steer down and you come down off the foam straight away;
    // after `floaterSink` s the foam gives way and you sink gently (the board isn't turned for you). It ends once
    // you're clear of the foam, down off it, or turned back toward it; then the usual rules (a moment's grace).
    const fl = r.floater;
    fl.time += dt;
    if (fl.bank === undefined) { fl.bank = T.floaterBoost || 0; fl.h0 = waveHeightFrac(r.pos[1]); }
    const add = fl.bank * (1 - Math.exp(-dt / 0.25));
    r.speed += add; fl.bank -= add;
    if (r.t < fl.t) r.t = fl.t; // (no higher than where you got onto the foam)
    if (fl.time > T.floaterSink) {
      const fs = frameAt(r.xs, r.t);
      r.t += (T.floaterSinkSpeed * Math.min(1, (fl.time - T.floaterSink) / 0.3) * dt) / Math.max(0.3, Math.hypot(fs.Pt[1], fs.Pt[2]));
    }
    const cleared = r.xs > T.curlZone[0] + 0.3 && foamAt(r.xs, top + 0.6) < 0.2;
    const down = waveHeightFrac(frameAt(r.xs, r.t).P[1]) < fl.h0 - T.floaterDrop;
    const back = Math.cos(r.phi) < -0.3;
    if (cleared || down || back || fl.time > T.floaterMax) {
      r.floater = null;
      r.floatCool = 0.6; // (not straight back onto the foam for a moment)
      r.boost = Math.max(r.boost || 0, back ? 0 : 0.8); // the foam can't slow you while you come off it (gone once you're clear)
    }
  } else if (r.floater) {
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
  r.floatCool = Math.max(0, (r.floatCool || 0) - dt);

  const ready = r.moveCooldown === 0; // moves need a gap between them
  // --- the top: what happens depends on where you hit it, and whether you're turning ---
  // Climbing up the whitewater from below: once you're high on it you pop
  // up onto it and float, without needing to reach the very top.
  const turningNow = r.time - (r.lastTurnTime ?? -9) < T.turnWindow;
  const highOnFoam = !r.floater && !r.assist && !r.lipSnap && !(r.floatCool > 0) && r.t > top && sinp > 0.2 && cosp > -0.15
    && (r.xs < T.curlZone[0] || foamAt(r.xs, r.t) > 0.3) && waveHeightFrac(r.pos[1]) > T.floaterHeight
    && !(turningNow && sinp > 0.55)
    && !(T.snapIntoLip > 0 && r.xs >= T.curlZone[0] - T.snapIntoLip && foamAt(r.xs, r.t) <= 0.65); // (on the lip's edge wait for the top: a turn there snaps)
  if (highOnFoam && !T.floaters && !T.softFoam) return wipe(r, 'Over the falls! (too heavy to float)');
  if (highOnFoam && T.floaters) { // (softFoam waves without floaters: you just climb the foam, which slows you)
    r.floater = { time: 0, t: r.t };
    if (ready) {
      r.events.push({ type: 'move', move: 'floater', speed: r.speed, combo: r.time - (r.lastBottomTurn ?? -9) < T.comboWindow, xs: r.xs });
      r.moveCooldown = T.moveGap;
    }
  }
  // In the tube the top of the face is the roof: ride up into it and the lip
  // takes you over the falls. (It used to deflect you back down with a quick
  // pivot unless you drove in steeply; removed 2026-11-17, the user: no
  // automatic turns in the barrel.)
  if (r.tube && r.t <= top && sinp > 0 && !r.assist && !r.lipSnap) return wipe(r, 'Over the falls! (up into the lip)');
  // Snap from just under the lip: climbing with the nose well up the face,
  // turn Right near the top and the snap starts right there, on the face
  // (not up on top of the crest), so the board stands up with its deck
  // showing and spins round to the right.
  if (ready && !r.tube && !r.floater && !r.assist && !r.lipSnap && !r.slash && r.rideDir >= 0
    && r.t > top && r.t <= snapZoneT(r.xs, top) && sinp > T.snapUp
    && r.time - (r.lastTurnTime ?? -9) < T.turnWindow && r.lastTurnDir < 0
    && (r.xs >= T.curlZone[0] && foamAt(r.xs, r.t + 0.6) <= 0.3
      || T.snapIntoLip > 0 && r.xs >= T.curlZone[0] - T.snapIntoLip && foamAt(r.xs, r.t + 0.6) <= 0.65)) { // (snapIntoLip: a bit further into the breaking lip)
    const combo = r.time - (r.lastBottomTurn ?? -9) < T.comboWindow;
    if (snapAllowed(r, top)) {
      startLipSnap(r, top, -T.lipExit);
      r.events.push({ type: 'move', move: 'snap', speed: r.speed, combo, xs: r.xs });
    } else startCheckTurn(r, combo);
    r.moveCooldown = T.moveGap;
  }
  if (!r.tube && !r.floater && !r.assist && !r.lipSnap && r.t <= top && sinp > 0) {
    r.t = top;
    const ph = phaseAt(r.xs);
    const turning = r.time - (r.lastTurnTime ?? -9) < T.turnWindow;
    // Turning as you meet the lip right where it's breaking is still a snap (Raglan `snapIntoLip`, the user,
    // 2026-11-18: those turns were giving floaters): up to that far behind the curl's edge, with a little more foam.
    const onLip = T.snapIntoLip > 0 && r.rideDir >= 0 && r.xs >= T.curlZone[0] - T.snapIntoLip && r.xs <= T.curlZone[0] + 0.5 && foamAt(r.xs, r.t + 0.6) <= 0.65;
    // ... and barely onto the breaking lip, pointing straight up or angled toward the shoulder at all, it's a snap
    // even without a turn (the user's rule, 2026-11-18); angled back toward the whitewater it's the usual moves; right
    // at the curl (not yet on the lip) not turning is still an air.
    // Airs reach a little way into the curl too (`airIntoCurl`, Raglan; the user, 2026-11-18: you can often hit an air
    // right off the whitewater): heading up the face without turning, fast enough, up to that far into the breaking
    // part it's an air (a big one, right by the whitewater) instead of an automatic snap or a floater.
    const airEdge = T.airs && T.airIntoCurl > 0 && !turning && sinp > 0.4 && r.speed > (T.airPopPerSpeed > 0 ? airSpeedAt(r.xs) : T.airMinSpeed)
      && r.xs >= T.curlZone[0] - T.airIntoCurl && r.xs < T.curlZone[0] + 0.5;
    const autoSnap = onLip && r.xs < T.curlZone[0] && cosp >= -0.1 && !airEdge; // (only into the breaking lip: right at the curl, not turning is an air)
    const lipEdge = onLip && (turning || autoSnap);
    const inWhitewater = (r.xs < T.curlZone[0] || foamAt(r.xs, r.t + 0.6) > 0.3) && !lipEdge && !airEdge;
    const combo = r.time - (r.lastBottomTurn ?? -9) < T.comboWindow;
    if (inWhitewater && !T.floaters && !T.softFoam) return wipe(r, 'Over the falls!');
    // (soft whitewater without floaters, the longboard: turn off it for a re-entry, or it knocks you off)
    if (inWhitewater && !T.floaters && T.softFoam && !turning) return wipe(r, 'Knocked off by the whitewater! (turn off the top of it)');
    if (inWhitewater && T.floaters && cosp > -0.15 && !(turning && sinp > 0.55)) {
      // Into the whitewater heading down the line: ride along the top of it.
      r.floater = { time: 0, t: r.t };
      if (ready) {
        r.events.push({ type: 'move', move: 'floater', speed: r.speed, combo, xs: r.xs });
        r.moveCooldown = T.moveGap;
      }
    } else if (turning || autoSnap) {
      // Turning at the lip: the fins release and the board pivots quickly in
      // the direction you're turning, then gravity takes over. Inside the gap
      // after another move it's just a plain turn off the top.
      //  - Turning away from the whitewater (to the surfer's right, nose
      //    swinging down the line): snap / off the lip / re-entry, ending
      //    pointed down the face and forward, away from the whitewater.
      //  - Turning toward the whitewater: only a quick 180, carrying on round
      //    to point straight back down the wave.
      const towardWhitewater = !autoSnap && (r.lastTurnDir || -1) > 0;
      let checkTurned = false;
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
      } else if (r.rideDir >= 0 && !inWhitewater && !snapAllowed(r, top)) {
        // (waves with `snapShoulder`: in the pocket near the curl it's a check turn, not a snap)
        checkTurned = true;
        if (ready) { startCheckTurn(r, combo); r.moveCooldown = T.moveGap; }
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
      if (ready && !checkTurned && !(towardWhitewater && !can180)) {
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
      // (Trestles, a `bar` wave: its top line sits ~88% up the face (the real-height lines), so leave from the crest itself,
      // as on Raglan, where the top is the crest: from below it the pop started under the lip.)
      if (WAVE.bar) { let tc = r.t, yc = -1e9; for (let t = 2; t <= r.t; t += 0.02) { const y = surface(r.xs, t)[1]; if (y > yc) { yc = y; tc = t; } } r.t = tc; }
      f = frameAt(r.xs, r.t);
      r.mode = 'air'; r.airSpin = 0; r.airTime = 0; r.spinArmed = false; r.overTheBack = false;
      r.airAxis = f.n; // spins in the air turn the same way as on the face
      r.airAlong = cosp >= 0 ? 1 : -1; // (which way along the line the board settles, before any spin)
      r.pos = f.P;
      // Near the curl you always get an air (if you're moving); out on the
      // open face you need the speed for it, or you go over the back.
      const nearCurl = r.xs - T.curlZone[0] < T.airCurlZone;
      // Speed-scaled airs (waves with `airPopPerSpeed`, Raglan; the user's design, 2026-11-18): the pop grows with your
      // speed over the threshold where you are (airSpeedAt), so height builds roughly with the square of the extra
      // speed, and a BIG AIR is one that pops at least `bigAirPop` up (no separate next-to-the-whitewater boost).
      const scaled = T.airPopPerSpeed > 0;
      const air = T.airs && !inWhitewater && sinp > 0.4
        && (scaled ? r.speed > airSpeedAt(r.xs) : r.speed > T.airSpeed || (nearCurl && r.speed > T.airMinSpeed));
      // Right next to the whitewater (within ~2 ft) it throws you higher.
      const nearWhitewater = r.xs - T.airBoostZone < T.curlZone[0] || foamAt(r.xs - T.airBoostZone, r.t + 0.6) > 0.3;
      r.launchSpeed = r.speed;
      if (air) {
        const up = scaled ? airPopFor(r.xs, r.speed)
          : T.airPop + Math.max(0, r.speed - T.airSpeed) * 0.3 + (nearWhitewater ? T.airBoostUp : 0);
        const big = scaled ? up >= T.bigAirPop : nearWhitewater;
        r.vel = [r.speed * cosp - PEEL_SPEED, up, 1.2];
        r.events.push({ type: 'launch', big });
        r.bigAir = big;
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
    // (a section's whitewater (Trestles, wave.js sectionGrace): any turn rebounds off it at any height, and hitting
    // it straight on you ride through it, slowed by the foam, instead of being buried)
    const sec = sectionGrace(r.xs);
    if (!T.rebounds) return wipe(r, 'Buried by the whitewater! (too heavy to rebound off)');
    if (!r.turnDir && sec) { /* ride through it */ }
    else if (!r.turnDir) return wipe(r, 'Hit the whitewater straight on! (turn as you hit it)');
    else if (hNow < T.reboundMinHeight && !sec) return wipe(r, 'Buried by the whitewater! (hit it higher)');
    if (r.turnDir) {
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
  let want = v3.norm([along * Math.hypot(r.heading[0], r.heading[2]), r.vel[1] < 0 ? -0.35 : 0.25, r.heading[2]]);
  // (waves with `airLandDown`, Raglan: it settles toward along the line turned by however far you've spun, so a
  // part spin stays where you put it: spin ~90 deg toward the beach and the nose stays pointing down the wave to
  // land. The plain pull toward along the line undid part spins before touchdown.)
  if (TUNE.airLandDown) want = v3.norm(rotate(v3.norm([r.airAlong || 1, r.vel[1] < 0 ? -0.35 : 0.25, 0]), r.airAxis || [0, 0, 1], r.airSpin));
  const kh = 1 - Math.exp(-dt * 3);
  r.heading = v3.norm(v3.add(r.heading, v3.mul(v3.sub(want, r.heading), kh)));

  const sl = slice(r.xs, 10);
  let hit = segmentHit(sl, prev[2], prev[1], r.pos[2], r.pos[1]);
  // (The wave's cross-section changes along the wave, so coming down steeply the step can slip between this frame's
  // and the last frame's cross-sections and fall through the face ("Bad landing!" with no touchdown; found
  // 2026-11-18). Also test the step against the last spot's cross-section, and if you've just ended up under the
  // front face, land there.)
  if (!hit) hit = segmentHit(slice(prev[0], 10), prev[2], prev[1], r.pos[2], r.pos[1]);
  if (!hit && r.vel[1] < 0 && !r.overTheBack) hit = segmentHit(sl, r.pos[2], r.pos[1] + 0.5, r.pos[2], r.pos[1]);
  if (hit && r.vel[2] * hit.nz + r.vel[1] * hit.ny < 0) {
    const half = Math.round(r.airSpin / Math.PI);
    const spinErr = Math.abs(r.airSpin - half * Math.PI);
    r.mode = 'surf';
    r.t = clamp(hit.t, TUNE.tTop, TUNE.tBottom);
    if (hit.nz < -0.05 || r.overTheBack) return wipe(r, r.overTheBack ? 'Went over the back! (turn at the lip)' : 'Landed over the back!');
    const fl = frameAt(r.xs, r.t);
    // Pointing down the wave always lands (`airLandDown` = [deg back toward the whitewater, deg out toward the
    // shoulder] around straight down the face; Raglan [15, 70], the user, 2026-11-18), whatever the spin; you ride
    // off the way the nose points. (Board angle on the face: 0 = along the line toward the shoulder, -90 = straight
    // down, +-180 = back toward the whitewater.)
    const boardAng = Math.atan2(v3.dot(r.heading, fl.e2), v3.dot(r.heading, fl.e1));
    const LD = TUNE.airLandDown;
    const downOK = !!LD && boardAng >= -(Math.PI / 2 + LD[0] / 57.3) && boardAng <= -(Math.PI / 2 - LD[1] / 57.3);
    if (!downOK && spinErr > (TUNE.airLandSpin || 0.9)) return wipe(r, 'Bad landing! (finish the spin)'); // (how far off a whole half-turn you can land: `airLandSpin` rad, 0.9 = ~52 deg)
    // Land travelling the way you were going (along the line, nose... or tail
    // ... down the face). If the board came round backwards, ride it
    // backwards for a moment, then it spins back round to forwards.
    const vt = v3.rej(v3.add(r.vel, [PEEL_SPEED, 0, 0]), fl.n);
    const ph1 = Math.atan2(v3.dot(vt, fl.e2), v3.dot(vt, fl.e1));
    r.phi = downOK ? boardAng : Math.cos(ph1) >= 0 ? -0.35 : Math.PI + 0.35;
    // Backwards = the nose points back along the line, against your travel.
    const noseAlong = v3.dot(r.heading, fl.e1), travelAlong = Math.cos(r.phi);
    r.fakie = !downOK && noseAlong * travelAlong < 0 && Math.abs(noseAlong) > 0.2 ? { time: 0, spin: 0 } : null;
    r.speed = clamp((r.launchSpeed || r.speed) * 0.92, TUNE.minSpeed, TUNE.maxSpeed); // keep most of your takeoff speed
    // Landing in the whitewater (a big air off the curl drifts back ~2-3 m into it): the foam can't slow you or catch
    // you for `airLandFoamGrace` s while you ride out of it (gone once you're clear). (2026-11-18, the user: loosen up
    // landing in the whitewater; at ~20 mph those landings were caught by the foam 1.0 s after touching down.)
    if (TUNE.airLandFoamGrace > 0 && foamAt(r.xs, r.t) > 0.3) r.boost = Math.max(r.boost || 0, TUNE.airLandFoamGrace);
    syncPose(r, frameAt(r.xs, r.t));
    // (a landing pointing down only scores the half-turns you've really done: 135 deg or more counts as a 180)
    const spins = downOK ? Math.floor(Math.abs(r.airSpin) / Math.PI + 0.25) * 180 : Math.abs(half) * 180;
    r.events.push({ type: 'land', spins, airTime: r.airTime, big: !!r.bigAir, backwards: !!r.fakie });
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
  // (a wave with a bar, Trestles: the end of the wave. Only once the curl has met the inside (RIDE.closed) and the
  // whitewater reaches you: in front of it, low on the face or out on the flats, you step off; up in it, it gets you
  // (the user, 2026-11-19: not before the wave has completely broken). A rider out ahead of it all steps off `end` s on.)
  if (WAVE.bar && RIDE.closed && !r.tube) {
    if (ph > 1.3) {
      if (r.height < 0.35 || r.t > TUNE.tBottom - 0.5) return startStepOff(r, 'Stepped off as the inside closed out');
      return wipe(r, 'The inside closed out! (end of the wave)');
    }
    if (RIDE.time - RIDE.closed.time > WAVE.bar.end) return startStepOff(r, 'You rode it to the end of the wave!');
  }
  // The foam only takes you if you sit in it.
  if (r.foam > 0.6 && !r.floater && !(r.boost > 0) && !climbingFoam(r)) r.foamTime += dt; // floating on it, carrying out of a move, or climbing it doesn't count
  else r.foamTime = Math.max(0, r.foamTime - dt * 2);
  const midFoam = TUNE.foamPush ? 1 - Math.min(1, Math.abs(r.foot)) : 0; // (riding the whitewater from the middle of a longboard: it takes twice as long to catch you)
  const secFoam = sectionGrace(r.xs) ? WAVE.bar.sectionFoam || 1 : 1; // (a section's whitewater takes longer to catch you)
  if (r.foamTime > TUNE.foamLimit * (1 + midFoam) * secFoam) return wipe(r, 'Caught by the whitewater!');
  // The whitewater rolling out across the flats knocks you off at once if you
  // ride into it down there (climbing up into it, nose well up, is a floater
  // from the flats; just out of a move you're carried through).
  if (r.t > TUNE.tBottom - 0.3 && r.foam > 0.5 && !r.floater && !(r.boost > 0) && Math.sin(r.phi) < 0.4 && !sectionGrace(r.xs)) {
    return wipe(r, 'Caught by the whitewater! (it rolls out across the flats)');
  }
  if (r.xs < -25) return wipe(r, 'Caught by the whitewater!');
  if (!WAVE.tube) { r.inBarrel = false; return; }
  // The barrel: once the curl has passed you, you're in the tube, surfing
  // the face inside it as normal. Too deep = pinched; up into the lip = over
  // the falls; way down past the bottom = the lip lands on you; forward out
  // of it = out.
  const T = TUNE;
  // (`tubeMinHeight` waves, Trestles: the tube is only there to ride when it's tall enough to fit in (the user, 2026-11-19:
  // it may be too small to ride, and then you have to go around it). Too small, and getting caught in under the lip,
  // above where it lands, means it hits you; low on the face ahead of where it lands, or out ahead, you're clear.)
  if (!r.tube && WAVE.tubeMinHeight && tubeHeight() < WAVE.tubeMinHeight) {
    if (ph > T.tubeEnter + 0.2 && ph < T.tubeCollapse && (!WAVE.tubeFloor || r.t < WAVE.tubeFloor.t) && r.t > topOfFace(r.xs) - 0.5
      && r.pos[2] <= lipTipZ(r.xs) - WAVE.tubeReal.enterIn && !sectionGrace(r.xs)) {
      return wipe(r, 'Clipped by the lip! (the tube was too small to fit in: go around it)');
    }
    return;
  }
  if (!r.tube) {
    // Only once you're up on the face (at or above its base), not out on the flats.
    // ... and only once you've come round to face along or up the face, not
    // while you're still pointing down mid bottom turn.
    // (Waves with `tubeReal`, the sim-shaped reef, have a long low base out in front of the face, so
    // place along the curve isn't enough there: the lip must actually be over you, not still out
    // ahead of you on the flats, or the barrel came on 3-5 m out in front of the lip.)
    if (ph > T.tubeEnter && ph < T.tubeCollapse - 0.15 && r.t <= T.tBottom + T.tubeEnterLow && Math.sin(r.phi) > -0.1
      && (!WAVE.tubeReal || r.pos[2] <= lipTipZ(r.xs) - WAVE.tubeReal.enterIn)) {
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
  if (ph > T.tubeCollapse) { wipe(r, 'Pinched! (too deep: drop down and drive forward)'); r.tube = null; return; }
  // Up in the top of the barrel the lip grabs you and throws you over.
  const tooHigh = WAVE.tubeReal ? r.t < tubeLineT(ph, WAVE.tubeReal.fall) : r.height > T.tubeFallHeight;
  if (tooHigh) { wipe(r, 'Over the falls! (too high in the barrel)'); r.tube = null; return; }
  if (r.t > T.tBottom + T.tubeLow) { wipe(r, 'The lip landed on you! (too low)'); r.tube = null; return; }
  // (`tubeFloor` waves, Trestles: the lip lands half way down the face, so once it has, below where it lands it lands on you)
  if (WAVE.tubeFloor && ph > WAVE.tubeFloor.from && r.t > WAVE.tubeFloor.t) { wipe(r, 'The lip landed on you! (too low)'); r.tube = null; return; }
  // (`tubeReal` waves: near the opening, you're out once you're less than `exitIn` m in under the
  // lip: 0.2 m nearer the lip than where you come in (`enterIn`), so it can't flick in and out right
  // at one spot. Deeper in, a low turn out in front of the curtain doesn't end the barrel.)
  const outFromUnder = WAVE.tubeReal && ph < WAVE.tubeReal.outBefore && r.pos[2] > lipTipZ(r.xs) - WAVE.tubeReal.exitIn;
  if (ph < T.tubeExit || outFromUnder) {
    r.events.push({ type: 'barrelExit', time: tb.time, depth: tb.depth, avgDepth: tb.depthSum / Math.max(tb.time, 1e-3) });
    r.tube = null; r.inBarrel = false; r.barrelTime = 0;
  }
}

function enterTube(r) {
  r.tube = { time: 0, depth: 0, depthSum: 0 };
  r.inBarrel = true;
  r.barrelTime = 0;
  r.floater = null;
  r.events.push({ type: 'barrelEnter' });
}


// The tube's real height (m) once the lip has landed: from where it lands up to the roof, for the wave's current
// shape and size (Trestles changes from section to section; a set wave's tube is bigger).
let _tubeH = { ver: -1, scale: 0, h: 0 };
export function tubeHeight() {
  if (_tubeH.ver !== SHAPE.ver || _tubeH.scale !== SCALE) {
    controlPoints(0.8, _lipCp);
    _tubeH = { ver: SHAPE.ver, scale: SCALE, h: _lipCp[11 * 2 + 1] - _lipCp[8 * 2 + 1] };
  }
  return _tubeH.h;
}

// How far toward the beach the lip reaches at xs (world z of its tip).
const _lipCp = new Float64Array(NP * 2), _lipO = [0, 0];
function lipTipZ(xs) {
  controlPoints(phaseAt(xs), _lipCp);
  let z = -1e9;
  for (let t = 6; t <= 10.5; t += 0.05) z = Math.max(z, crPoint(_lipCp, t, _lipO)[0]);
  return z;
}

// --- Tube riding ---
// Where you are in the tube: 0 at the exit, 1 at the pinch.
export function tubeDepth(r) {
  const T = TUNE;
  return clamp((phaseAt(r.xs) - T.tubeExit) / (T.tubeCollapse - T.tubeExit), 0, 1);
}

// Speed for the HUD: board speed while surfing, ground speed in the air.
// Speed-scaled airs (waves with `airPopPerSpeed`): the air threshold where you are. `airSpeedCurl` at the curl's edge
// (and in the breaking part), easing up to `airSpeed` by `airCurlZone` out: the breaking lip helps throw you, the
// rounder shoulder doesn't. (Physics: the board leaves the water over a crest of radius R once v^2/R > g, ~12-15 mph
// on Raglan's 3-5 m crest; a usable ~0.5 m pop needs ~16-18 mph. 19 at the curl / 21 out on the face: the user's
// call, 2026-11-18.)
export function airSpeedAt(xs) {
  const T = TUNE;
  if (!(T.airSpeedCurl > 0)) return T.airSpeed;
  return T.airSpeedCurl + (T.airSpeed - T.airSpeedCurl) * sstep(0, T.airCurlZone, xs - T.curlZone[0]);
}
// Upward pop (m/s) for an air at xs at this speed, and the speed from which it's a BIG AIR there (for the HUD).
// With `airPopTopSpeed` the pop eases out from `airPopBase` at the threshold to `airPopMax` at that speed (the same
// top speed wherever you are), `airPopEase` setting how fast it rises early on: it keeps building all the way up
// instead of capping early (the user, 2026-11-18: the max should come at ~30 mph). Otherwise it's linear (capped).
const popU = (xs, speed) => clamp((speed - airSpeedAt(xs)) / (TUNE.airPopTopSpeed - airSpeedAt(xs)), 0, 1);
export function airPopFor(xs, speed) {
  const T = TUNE;
  if (T.airPopTopSpeed) return T.airPopBase + (T.airPopMax - T.airPopBase) * (1 - (1 - popU(xs, speed)) ** T.airPopEase);
  return Math.min(T.airPopMax || Infinity, T.airPopBase + T.airPopPerSpeed * Math.max(0, speed - airSpeedAt(xs)));
}
export function bigAirSpeedAt(xs) {
  const T = TUNE;
  if (T.airPopTopSpeed) {
    const f = clamp((T.bigAirPop - T.airPopBase) / (T.airPopMax - T.airPopBase), 0, 1);
    return airSpeedAt(xs) + (1 - (1 - f) ** (1 / T.airPopEase)) * (T.airPopTopSpeed - airSpeedAt(xs));
  }
  return airSpeedAt(xs) + (T.bigAirPop - T.airPopBase) / T.airPopPerSpeed;
}

export function groundSpeed(r) {
  if (r.mode === 'surf') return r.speed;
  return v3.len(v3.add(r.vel, [PEEL_SPEED, 0, WAVE_SPEED]));
}

useWave(WAVE);
