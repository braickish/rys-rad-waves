// Mellow Point: a long, crumbling right. The crest spills foam down the face
// instead of throwing a lip, so there's no barrel; speed lives in the pocket,
// and the moves are snaps, floaters and rebounds off the whitewater.
import { KF_CRUMBLE, sstep } from './shapes.js';

// The spill of foam from the crest down the face (physics and looks share it).
function spill(s, t) {
  const reach = 6 + 7 * sstep(0.0, 0.5, s); // reaches further down the face further behind the curl
  return sstep(-0.15, 0.35, s) * sstep(3.6, 4.6, t) * (1 - sstep(reach - 1.2, reach + 0.6, t));
}
const whitewater = (s, t) => sstep(0.8, 1.4, s) * sstep(3.5, 5.0, t);

export default {
  id: 'point',
  name: 'Mellow Point',
  kind: 'crumble', // no tube
  keyframes: KF_CRUMBLE,
  scale: 1.25,
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
  thin: (s, t) => Math.exp(-(((t - 6.5) / 2.2) ** 2)) * sstep(-1.6, -0.4, s) * (1 - sstep(0.1, 0.6, s)) * 0.7,
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
    drop: 12, topDropBoost: 8, highDropAccel: 4, highDropSoftMax: 2.0,
    curlZone: [-0.5, 2.5],
    foamContact: 0.25, reboundMinHeight: 0.33, rebound180MinHeight: 0.67,
    floaterHeight: 0.55, floaterMax: 1.2, climbFoamDrag: 0.35, foamLimit: 1.0,
    airs: true, floaters: true, rebounds: true, airSpeed: 11.5, airMinSpeed: 6, airCurlZone: 2.5, airBoostZone: 0.6, airBoostUp: 3.0,
    tTop: 5.3, tBottom: 13.9, tFlats: 14.6,
    faceFlow: 3.8, // water flowing up the face (m/s), 2/3 of the reef's: riding level drifts you up
  },
};
