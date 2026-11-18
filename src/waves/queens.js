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
  walkKeys: true, // (Up/Down and up/down swipes walk the board; only Left/Right turn: the user's trial, this wave only)
  dropknee: true, // (surfer.js: the roundhouse is drawn as a dropknee turn)
  moveNames: { roundhouse: 'DROPKNEE TURN!' },
  turquoise: 0.7, // clear, shallow, sunlit water (shaders.js)
  peelSpeed: 4.8, // an even peel (was 3.0, which made the whole wave feel slow; real ones run ~4.5-6 m/s)
  waveSpeed: 3.9, // shallow-water wave speed at breaking depth for a ~1.2 m wave (sqrt(g*1.5 m))
  rippleK: 2.0, // water ripples this much finer than on the big waves (scaled to the wave: big ripples read as a big wave in slow motion)
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
    vPocket: 5.2, vLow: 2.7, vFoam: 2.1, // ~12 mph in the pocket. (It was cut to 4.0 when she outran the curl on the old 3.0 m/s peel; the peel was the real problem.)
    drop: 3.2, topDropBoost: 1.0, highDropAccel: 0.8, highDropSoftMax: 0.4,
    softMax: 10.0, maxSpeed: 12.0, minSpeed: 1.5, // (raised with middleSpeed so the middle's trim isn't capped)
    bleed: 0.55, // glides: extra speed fades slower than a shortboard (rider default 0.9)
    climb: 4.0, // and it carries up the face (6)
    // slower, drawn-out turns than the shortboard (turn rate 2.4 vs 5.2 rad/s), sized to a small wave
    turn: 2.4, minTurn: 0.8, rTop: 1.0, rBottom: 3.0, hardRate: 1.1, hardRadius: 0.85,
    bottomDrive: 1.8, topDrive: 0.4, maxAccel: 4.5, accelTaper: [3.5, 6],
    // Walking the board (rider.js): tail / middle / nose. From the tail every turn up on the wave pivots
    // round the fin at `pivotRate` whatever her speed, scrubbing `pivotDrag` of her speed per radian, and
    // the tail drags (cruising speed x `tailSpeed`); the middle trims fastest with rail turns.
    pivotRate: 3.2, pivotMax: 0.85, pivotDownRate: 1.15, pivotMaxUp: 0.5, pivotDriveUp: 1.0, // (by direction, the user's idea: turning away from the lip (nose down the face) is quicker and more pivot, 85% at 3.7 rad/s; toward the lip (nose up) more rail, 50% pivot, with a full carve's drive)
     pivotFlats: [0.33, 0.5], pivotDrag: 0, pivotDriveK: 0.5, tailSpeed: 0.8, tailWalk: 0.6, // (the user: pivots too easy, as if slightly too far back, and they should keep a little drive: the tail spot moved forward, the turn there is 70% pivot / 30% rail (pivotMax), pivotRate 3.5 -> 3.2, half a rail carve's drive (pivotDriveK 0.25 -> 0.5); pivotFlats: full pivots ~1.2 m out onto the flats, rail turns by ~2.3 m; tailWalk: s between the tail and the middle)
    foamPush: 4.6, foamPushFeed: 2.5, // in the whitewater from the middle it pushes you along (~10 mph, picked up quickly) instead of dragging you to vFoam, and takes twice foamLimit to catch you (the user's call)
    middleSpeed: 1.6, middleFeed: 2.0, // the middle is the fast spot: 60% higher cruising speed, picked up 2x quicker (the user asked twice for more)
    checkTurn: 2.0, checkRate: 7, // the check turn off the top has to bring you back down on a wave this small
    curlZone: [-0.5, 2.0],
    foamContact: 0.25, reboundMinHeight: 0.33, rebound180MinHeight: 0.67,
    floaterHeight: 0.55, floaterMax: 1.2, climbFoamDrag: 0.35, foamLimit: 1.4,
    airs: false, floaters: false, softFoam: true, rebounds: true, // (no floaters on the longboard, the user's call; the whitewater is soft: climbing it just slows you, turning off its top is a re-entry, otherwise it knocks you off)
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
    noseTurnDamp: 0.55, // on the nose you steer only a little (was 0.8; the user wanted a bit more turn)
    noseHold: 6, noseUnder: 0.8, // (0.45 -> 0.8: the user wanted the nose to slow you a bit more) // in the pocket the nose trims you to (just under) the curl's speed (1/s, scaled by pocket power), so you stay there
    nosePocket: 0.35, // below this pocket power (out on the shoulder) ...
    nosePearl: 1.1, // ... the nose starts going under; it's gone after about this long (s)
    noseDrag: 0.6, // ... and it drags you (1/s)
  },
};
