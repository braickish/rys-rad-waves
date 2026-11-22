// Raglan (was Mellow Point): a long, crumbling point wave. The crest spills foam down the face
// instead of throwing a lip, so there's no barrel; speed lives in the pocket,
// and the moves are snaps, floaters and rebounds off the whitewater.
import { KF_BARREL, KF_CRUMBLE, sstep } from './shapes.js';

// Raglan's shape (raglan-1/2.png in braickish/reference-images, 2026-11-18, the user): a long, even point wall.
// Ahead of the curl the face stays steep and nearly full height a long way down the line (the shoulder holds its
// height), only easing down into swell far out. Behind the curl it crumbles like before (KF_CRUMBLE).
// Blends of the shared sections, so the curve never overhangs and the points stay in order.
const mixKF = (a, b, w, s) => ({ s, p: a.p.map((pa, i) => [pa[0] + (b.p[i][0] - pa[0]) * w, pa[1] + (b.p[i][1] - pa[1]) * w]) });
const SWELL = KF_BARREL[1], BUILD = KF_BARREL[2], STEEP = KF_CRUMBLE[3]; // (a small swell; 2.2 tall and gentle; 2.95 tall and steep, s -0.25)
const KF_RAGLAN = [
  KF_BARREL[0], // flat, far ahead (s -14)
  mixKF(SWELL, BUILD, 0.5, -9), // swell building ~90 m down the line
  mixKF(BUILD, STEEP, 0.3, -6), // a wall standing up (~2.4 tall)
  mixKF(BUILD, STEEP, 0.7, -3.5), // ~35 m out: steep and ~2.7 tall
  mixKF(BUILD, STEEP, 0.9, -1.2), // ~12 m out: nearly the full steep wall
  ...KF_CRUMBLE.slice(3),
];

// The spill of foam from the crest down the face (physics and looks share it).
function spill(s, t) {
  const reach = 6 + 7 * sstep(0.0, 0.5, s); // reaches further down the face further behind the curl
  return sstep(-0.15, 0.35, s) * sstep(3.6, 4.6, t) * (1 - sstep(reach - 1.2, reach + 0.6, t));
}
const whitewater = (s, t) => sstep(0.8, 1.4, s) * sstep(3.5, 5.0, t);

export default {
  id: 'point',
  name: 'Raglan',
  walkKeys: true, shuffle: true, // (Up/Down and up/down swipes shuffle the feet back / middle / forward, rider.js; only Left/Right turn)
  kind: 'crumble', // no tube
  keyframes: KF_RAGLAN,
  green: 1, // cold, green water (shaders.js)
  outfit: 'wetsuit', // cold water: a black full wetsuit (main.js)
  scale: 1.25, rippleK: 2.0, // (ripples 2x finer than the base, like Queens: real ripples are set by the wind, not the wave's size; at 1 they read as coarse blotches; the user asked)
  // m/s the breaking point runs along the beach: ~18.6 mph on a normal wave of the set (17.6 / 19.9 on the small / big
  // ones). Was 6.0 (13 mph): a slow, easy peel, ~57 deg, more Whale Bay than Indicators. The user, 2026-11-22: Raglan
  // felt oddly slow; the main walls on a good swell probably run ~17-21 mph (c / tan(peel angle), ~45-50 deg, c ~9 m/s).
  peelSpeed: 8.3,
  waveSpeed: 5.0, // m/s the wave moves toward shore
  phase: { ahead: 10, behind: 8.5 }, // metres per unit of phase ahead of / behind the curl

  // How much foam is under you (the physics).
  foam: (s, t) => Math.max(spill(s, t), whitewater(s, t)),
  // How much foam to draw: the same foam, fading a little far behind, plus
  // feathering along the crest just ahead of the curl.
  foamVisual: (s, t, xs) => Math.max(
    spill(s, t),
    whitewater(s, t) * (1 - sstep(10, 40, -xs) * 0.5),
    Math.exp(-(((t - 4.8) / 0.7) ** 2)) * sstep(-0.6, -0.1, s) * 0.35,
  ),
  // Thin water that glows when backlit (top of the steepening face).
  // (all along the steep wall ahead, not just by the curl: the reference's lit emerald wall)
  thin: (s, t) => Math.exp(-(((t - 6.5) / 2.2) ** 2)) * sstep(-6.5, -3.0, s) * (1 - sstep(0.1, 0.6, s)) * 0.7,
  // Where spray comes off (surface coordinate), and how active the whitewater is.
  lipT: 5.0,
  white: (s) => sstep(-0.1, 0.3, s) * (1 - sstep(1.6, 3.0, s)),
  // How much power the wave has at xs (distance ahead of the curl).
  pocket: (xs) => (xs >= 0 ? Math.exp(-((xs / 6) ** 2)) : sstep(-6, -1, xs)),
  // Top of the rideable face (surface coordinate) at a phase.
  faceTop: () => 5.3,
  tube: false,

  // Sets and sections (src/sea.js).
  sea: {
    set: [0.9, 1.0, 1.15], // sizes of the waves in a set, relative to normal
    sections: false, // (closeout sections were tried; off for now)
  },

  // Settings that belong to this wave (merged over the rider's settings).
  tune: {
    vPocket: 14, vLow: 4.5, vFoam: 3,
    // Smoother pocket speed (2026-11-19, the user: the speed boost high in the pocket felt unrealistic): the cruising
    // speed depends less on height (was 0.45 + 0.75 x height: ~21 mph low, ~26 at 60% up), the pocket pulls you up to
    // it more gently (feed 2.0 -> 1.0), and speed builds at most ~13 mph/s instead of ~22 (maxAccel 10 -> 6).
    heightSpeed: [0.7, 0.35], feed: 1.0, maxAccel: 6,
    drop: 12, topDropBoost: 2, highDropAccel: 0, highDropSoftMax: 2.0, // (highDropAccel 4 -> 1.5 -> 0, topDropBoost 8 -> 2: pointing down high in
    // the pocket used to multiply the drop 8x and raise the acceleration cap, so a turn off the top surged; the user found turns had too much
    // artificial acceleration and wants the speed down the wave to come from the wave itself)
    // Turn drive (2026-11-18, same reason): turns redirect speed more than make it.
    bottomDrive: 5.75, bottomCarveDrive: 1.5, topDrive: 0.3, // (bottomDrive 5 -> 5.75 and driveMaxAccel 4 -> 5, 2026-11-18, the user: bottom turns need just a tad more speed; a bottom turn now adds ~1-2 mph at 25-27 mph) (2026-11-18 second pass, the user: top and bottom turns still accelerated: bottomDrive 7 -> 5, topDrive 1.28 -> 0.3, driveMaxAccel 7 -> 4; a bottom turn at 20 mph now adds ~2 mph, at 27 about none) // (were 8, 1.6, 1.6 from the rider's settings)
    // Speed building on speed (2026-11-18, the user: as you go faster it all builds on each other; and the snap sped
    // back up dropping down): a turn's drive per radian falls off above `driveRefSpeed` (~20 mph), a drop adds less
    // the faster you go (nothing by `dropTerminal`, ~38 mph), and the drop off a move pays `postMoveDrop` of a normal one.
    driveRefSpeed: 9, dropTerminal: 17, postMoveDrop: 0, // (off a snap the wave alone brings your speed back: the user)
    moveEase: 0.4, // and once a move hands the board back, speed eases back in over 0.4 s instead of switching on at once
    driveMaxAccel: 5, // turn drive alone adds at most ~11 mph/s
    roundhouseNoDrive: true, // a roundhouse turns you without making speed (moves don't add speed; was +5 mph)
    // Snaps and slashes (2026-11-18, the user: they dropped too much speed and held you for a moment after): the snap
    // scrubs half as much on the lip, the slash less, and the no-speeding-up pause after a move is 0.25 s (was 0.95),
    // so the drop off the lip takes over straight away.
    lipSnapDrag: 0.7, slashDrag: 2.2, moveCalm: 0.25,
    moveScrub: { roundhouse: 0.03, slash: 0.15, snap: 0.06, check: 0.05, reentry: 0.08, topTurn: 0.04, lip180: 0.1, floater: 0.05, rebound: 0.1, rebound180: 0.1, revert: 0.05, land: 0.05 },
    bleed: 0.65, // extra speed fades a little slower (rider default 0.9)
    curlZone: [-0.5, 2.5],
    snapIntoLip: 1.0, // turning at the lip, a snap reaches 1 m further into the breaking lip before it's a floater (the user, 2026-11-18)
    foamContact: 0.25, reboundMinHeight: 0.33, rebound180MinHeight: 0.67,
    floaterHeight: 0.55, floaterMax: 1.2, climbFoamDrag: 0.35, foamLimit: 1.0,
    // Free floaters (2026-11-18, the user: the floater grabbed the board and steered it): you keep steering, a little speed
    // (`floaterBoost` m/s, ~2 mph), after `floaterSink` s the foam gives way at `floaterSinkSpeed` m/s, and it ends once
    // you're `floaterDrop` (fraction of the wave height) below where you got on. Airs landing in the whitewater get
    // `airLandFoamGrace` s before the foam can slow or catch you.
    floaterSteer: true, floaterBoost: 0.9, floaterSink: 0.6, floaterSinkSpeed: 1.2, floaterDrop: 0.15, airLandFoamGrace: 1.5,
    airLandSpin: 1.1, // airs land up to ~63 deg off a whole half-turn (rider default 0.9, ~52 deg; the user, 2026-11-18: slightly easier to land)
    airs: true, floaters: true, rebounds: true, airSpeed: 9.39, airSpeedCurl: 8.49, // (airs from 19 mph at the curl's edge, easing up to 21 mph by airCurlZone out; was
    // 24 on the open face and ~13 near the curl. The user, 2026-11-18; see airSpeedAt in rider.js for the physics.)
    // Speed-scaled airs (the user's design): pop = airPopBase + airPopPerSpeed x (speed over the threshold there) m/s up,
    // capped at airPopMax: ~0.5 m above the lip at the threshold, ~3 m at 28 mph on the open face (higher at the curl,
    // where the threshold is lower). BIG AIR (1.5x points) pops at least bigAirPop (~2 m up); the HUD speed glows pink
    // when your speed would give one where you are. The old next-to-the-whitewater boost no longer applies.
    airPopBase: 5.7, airPopPerSpeed: 1.4, airPopMax: 8.3, bigAirPop: 6.5, airPopTopSpeed: 13.41, airPopEase: 1.6, // (airPopMax 9.5 -> 8.3: height capped at 3.5 m above the lip, the user, 2026-11-18) (airPopTopSpeed/Ease: the pop eases out to airPopMax at 30 mph everywhere instead of rising in a line and capping at ~25-27; measured ~2 m at 22-23 mph, ~2.5 at 25, ~3 at 27, ~3.3 at 29, 3.5 from ~30; the user, 2026-11-18) (airPopBase 3.2 -> 5.7: heights start scaling ~4 mph earlier, 22 mph ~1.5-2 m, 24 ~2.2-3 m; the user, 2026-11-18: 28-30 mph was hard to reach)
    airLandDown: [15, 70], // an air landing with the nose pointing down the face always lands: 15 deg back toward the whitewater to 70 deg out toward the shoulder (the user, 2026-11-18)
    airMinSpeed: 6, airCurlZone: 2.5, airBoostZone: 2.5, airIntoCurl: 0.6, airBoostUp: 3.0, // (airIntoCurl: airs reach 0.6 m into the breaking curl, the user, 2026-11-18) // (boost zone 0.6 -> 2.5 m, the same as airCurlZone: the user, 2026-11-18, wanted a bigger zone for the boosted air; 0.6 m was a ~0.1 s window at the curl)
    tTop: 5.3, tBottom: 13.9, tFlats: 14.6,
    shoulderReach: 3.5, shoulderFade: 1.6, // speed carries ~3.5 m further out toward the shoulder before it fades, and fades over a longer stretch (was 2 m and the pocket's own length; the user asked for more speed into the shoulder)
    idleDecay: 0.45, idleDelay: 2, // after 2 s with no key and no change of direction you lose ~1 mph every second (the user, 2026-11-22; shortboards: Pipe, Trestles and Dynamic inherit it)
    faceFlowK: 0.46, // water flowing up the face: 0.46 x the wave's speed, measured live (rider.js faceFlow; ~4.3 m/s here, c 9.4)
  },
};
