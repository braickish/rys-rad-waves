// Queens: a small, peeling right for longboarding, after the reference photo of
// a longboarder noseriding at Queens (braickish/reference-images, queens.jpg):
// a clean, turquoise, waist-to-chest-high wave that crumbles rather than
// throws, with whitewater rolling behind. Much smaller than the point.
// The board is a 9'6" noserider (mesh.js BOARDS.longboard) ridden by a girl in
// a bikini (surfer.js); Space (or the on-screen button) walks to the nose for a
// hang five and back (rider.js noseride). Noseriding in the pocket slows you
// and holds you there; out on the shoulder the nose goes under.
import { KF_CRUMBLE, sstep } from './shapes.js';

// The spill of foam from the crest down the face (a gentle, crumbly lip).
function spill(s, t) {
  const reach = 5.5 + 6 * sstep(0.0, 0.6, s);
  return sstep(-0.1, 0.4, s) * sstep(3.6, 4.6, t) * (1 - sstep(reach - 1.2, reach + 0.6, t));
}
const whitewater = (s, t) => sstep(0.8, 1.4, s) * sstep(3.5, 5.0, t);

export default {
  id: 'queens',
  name: 'Queens',
  kind: 'crumble', // no tube
  keyframes: KF_CRUMBLE,
  scale: 0.42, // ~1.2 m face: about a third of the point's
  sizeK: 0.7, // (the riding camera sits closer on this small wave)
  board: 'longboard',
  surfer: 'girl',
  noseride: true,
  dropknee: true, // (surfer.js: the roundhouse is drawn as a dropknee turn)
  moveNames: { roundhouse: 'DROPKNEE TURN!' },
  turquoise: 0.7, // clear, shallow, sunlit water (shaders.js)
  peelSpeed: 3.0, // a slow, even peel
  waveSpeed: 3.0,
  phase: { ahead: 9, behind: 7 },

  foam: (s, t) => Math.max(spill(s, t), whitewater(s, t)),
  foamVisual: (s, t, xs) => Math.max(
    spill(s, t),
    whitewater(s, t) * (1 - sstep(10, 40, -xs) * 0.5),
    Math.exp(-(((t - 4.8) / 0.7) ** 2)) * sstep(-0.6, -0.1, s) * 0.3,
  ),
  thin: (s, t) => Math.exp(-(((t - 6.5) / 2.2) ** 2)) * sstep(-1.6, -0.4, s) * (1 - sstep(0.1, 0.6, s)) * 0.9,
  lipT: 5.0,
  white: (s) => sstep(-0.1, 0.3, s) * (1 - sstep(1.6, 3.0, s)) * 0.6,
  pocket: (xs) => (xs >= 0 ? Math.exp(-((xs / 5) ** 2)) : sstep(-5, -1, xs)),
  faceTop: () => 5.3,
  tube: false,
  sea: { set: [0.9, 1.0, 1.1], sections: false },

  // A longboard: slower, wider turns and it glides, carrying its speed.
  tune: {
    vPocket: 4.0, vLow: 2.1, vFoam: 1.6, // a small wave: ~9 mph in the pocket (was 4.8: the user found it ran too fast into the shoulder)
    drop: 3.2, topDropBoost: 1.0, highDropAccel: 0.8, highDropSoftMax: 0.4,
    softMax: 5.4, maxSpeed: 6.8, minSpeed: 1.2,
    bleed: 0.55, // glides: extra speed fades slower than a shortboard (rider default 0.9)
    climb: 4.0, // and it carries up the face (6)
    // slower, drawn-out turns than the shortboard (turn rate 2.4 vs 5.2 rad/s), sized to a small wave
    turn: 2.4, minTurn: 0.8, rTop: 1.0, rBottom: 3.0, hardRate: 1.1, hardRadius: 0.85,
    bottomDrive: 1.8, topDrive: 0.4, maxAccel: 3.5, accelTaper: [3.5, 6],
    // Fin pivot (rider.js): hold a turn past `pivotAfter` and she steps back on the tail and the board
    // swings round the fin at `pivotRate` whatever her speed (the rail turn above is slow at ~9 mph),
    // scrubbing `pivotDrag` of her speed per radian. Taps stay gentle rail turns; bottom turns stay on the rail.
    pivotRate: 4.2, pivotAfter: 0.12, pivotStepBack: 0.2, pivotStepForward: 0.3, pivotDrag: 0.2,
    checkTurn: 2.0, checkRate: 7, // the check turn off the top has to bring you back down on a wave this small
    curlZone: [-0.5, 2.0],
    foamContact: 0.25, reboundMinHeight: 0.33, rebound180MinHeight: 0.67,
    floaterHeight: 0.55, floaterMax: 1.2, climbFoamDrag: 0.35, foamLimit: 1.4,
    airs: false, floaters: true, rebounds: true,
    snapShoulder: 1e9, snapNear: 0, // no snaps on a log: turning off the top is a check turn
    slashLow: -1, // no slashes
    // The longboard's roundhouse is a dropknee turn: back knee down, it comes round faster than a
    // normal turn, straight away (no slow, wide start), but it doesn't make speed.
    roundhouseStart: 1, roundhouseHold: 0, roundhouseRamp: 0.05, roundhouseRate: 1.4, roundhouseDeep: 1.5,
    roundhouseMaxRate: 4.0, roundhouseNoDrive: true, roundhouseZone: 3.0, roundhousePocket: 0.65,
    tTop: 5.3, tBottom: 13.9, tFlats: 14.6,
    shoulderReach: 2.0,
    faceFlow: 0.8,
    // Noseriding (rider.js): walking up and back, steering, holding the pocket, pearling.
    noseWalkUp: 1.1, noseWalkBack: 0.8, // seconds to walk to the nose / back
    noseTurnDamp: 0.8, // on the nose you can barely steer
    noseHold: 6, noseUnder: 0.45, // in the pocket the nose trims you to (just under) the curl's speed (1/s, scaled by pocket power), so you stay there
    nosePocket: 0.35, // below this pocket power (out on the shoulder) ...
    nosePearl: 1.1, // ... the nose starts going under; it's gone after about this long (s)
    noseDrag: 0.6, // ... and it drags you (1/s)
  },
};
