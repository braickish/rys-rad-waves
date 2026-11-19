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
  peelSpeed: 6.0, // m/s the breaking point runs along the beach
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
    drop: 12, topDropBoost: 8, highDropAccel: 1.5, highDropSoftMax: 2.0, // (highDropAccel 4 -> 1.5: pointing down high in the pocket raised the
    // acceleration cap 5x, so a turn swinging the nose down up there surged +59 mph/s; the user found turns had too much artificial acceleration)
    // Turn drive (2026-11-18, same reason): turns redirect speed more than make it.
    bottomDrive: 7, bottomCarveDrive: 1.5, topDrive: 1.28, // (bottomDrive 6.5 -> 7, the user) // (were 8, 1.6, 1.6 from the rider's settings; 5 / 1.2 left bottom turns making no speed at all)
    driveMaxAccel: 7, // turn drive alone adds at most ~16 mph/s (the overall cap is ~22 when slow)
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
    airs: true, floaters: true, rebounds: true, airSpeed: 11.5, airMinSpeed: 6, airCurlZone: 2.5, airBoostZone: 2.5, airBoostUp: 3.0, // (boost zone 0.6 -> 2.5 m, the same as airCurlZone: the user, 2026-11-18, wanted a bigger zone for the boosted air; 0.6 m was a ~0.1 s window at the curl)
    tTop: 5.3, tBottom: 13.9, tFlats: 14.6,
    shoulderReach: 3.5, shoulderFade: 1.6, // speed carries ~3.5 m further out toward the shoulder before it fades, and fades over a longer stretch (was 2 m and the pocket's own length; the user asked for more speed into the shoulder)
    faceFlow: 3.8, // water flowing up the face (m/s), 2/3 of the reef's: riding level drifts you up
  },
};
