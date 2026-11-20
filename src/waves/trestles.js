// Lower Trestles: a right (seen from the beach it peels toward the left), ridden regular foot, on a cobble fan.
// Unlike the other waves it changes as you ride it (the user's idea, 2026-11-17), and it is the simulated wave
// throughout (the user: make it feel like the real Trestles any way we can).
//
// Where the numbers come from (~/workspace/research/trestles, README there):
// - When each part breaks: FUNWAVE-TVD runs of a 1.5 m, 16 s south swell over the real cobble fan (USGS CoNED 1 m
//   DEM). For two clean simulated waves, every 2 m along the crest, the time it breaks (trestles-breaks.js): the
//   peak, the left peeling away, the right peeling through its sections, and an inside peak that breaks on its own
//   ahead and peels back to meet the right: that's the closeout that ends the ride. By default at a playable pace
//   (the same layout, the clock 2.5x slower, nothing going faster than 8 m/s along the wave); `?literal` for the
//   sim's own times (the right closes out ~6-9 s after the takeoff).
// - The breaking shapes (sim-trestles.js) are 2D breaking-wave simulations (BEM) on shore-normal profiles of the fan:
//   the takeoff peak, a middle section, the inside, and a bigger set wave's inside, plus the shoulder (the same sims
//   3-15 s before breaking: lower and gentler, but holding up, as FUNWAVE's heights do along the crest). Each throws
//   a thin lip that lands about half way down the face, so the tube is a small one up on the face, not Pipe's big
//   tube down to the water: quick, hollow cover-ups high in the pocket. Drop below where the lip lands once it has
//   (`tubeFloor`) and it lands on you; a tube too small to fit in (`tubeMinHeight`) you have to go around.
import { KF_TAKEOFF, KF_MID, KF_INSIDE, KF_SETINSIDE } from './sim-trestles.js';
import { BREAKS } from './trestles-breaks.js';
import { sstep } from './shapes.js';
import point from './point.js';
import reef from './reef.js';

export default {
  id: 'trestles',
  name: 'Trestles',
  dir: -1, // a right: peels toward -x in the world (wave.js toWorld)
  stance: 'regular', // left foot forward, frontside on this right
  walkKeys: true, shuffle: true,
  kind: 'barrel',
  board: 'perf511', // a 5'11" performance shortboard (mesh.js BOARDS; the user, 2026-11-19)
  outfit: 'wetsuit', // a black full wetsuit (the user; the reference photo, trestles.jpg)
  green: 0.55, // muted grey-green, jade water, as in the reference photo (shaders.js; Raglan's is 1, bottle green)
  // One keyframe set per section (sim-trestles.js), in sim metres; `scale` sizes them (0.8: the takeoff's face
  // ~3.6 m, the middle ~3.4, the inside ~2.5; at the sim's own size the tube was only ~1 m deep).
  keyframes: KF_TAKEOFF,
  shapes: [KF_TAKEOFF, KF_MID, KF_INSIDE, KF_SETINSIDE],
  scale: 0.8, rippleK: 2.0,
  peelSpeed: 6.0, // (before a ride starts; the bar sets it while riding)
  waveSpeed: 5.5,
  // The bar: the simulated waves' break maps (trestles-breaks.js, from FUNWAVE: when each spot along the wave breaks;
  // each ride is the next one), and which section's shape the wave has where the curl is (`shapeRows`: x m from the
  // peak, shape = a position in `shapes` below, 1.5 = half way from the 2nd to the 3rd).
  bar: {
    maps: BREAKS,
    // (taking turns, one per ride (the user, 2026-11-19): 747, the cleanest right in lowers_s205_t16 (1.5 m 16 s from
    // 205°; its longest stretch going at once ~24 m); 336 from s195_t16_sp15_g3 (from 195°: 216 m, ~18 m at once); 420
    // from s205_t14_sp15_g3 (a 14 s period: slow and long, ~14 m at once). 545, 1139 and 1170 are in the data too: ?map=<wave>)
    use: [747, 336, 420],
    shapeRows: [
      { x: 0, shape: 0 }, // the takeoff peak
      { x: 40, shape: 0 },
      { x: 90, shape: 1 }, // the middle
      { x: 140, shape: 1 },
      { x: 190, shape: 2 }, // the inside: smaller, a narrow tube
      { x: 2000, shape: 2 },
    ],
    shapes: [0, 1, 2], // takeoff, middle, inside
    setShapes: [0, 1, 3], // the biggest wave of a set has its own, heavier inside
    setSize: 1.1,
    edgePeel: 6, // past the ends of a map the wave keeps peeling outward at this speed (m/s)
    frameMax: 25, // the frame chases the curl at up to this speed (a stretch the sim breaks at once, ?literal)
    lead: 1.5, // a ride starts this many s before the peak breaks: you drop in as it stands up
    end: 12, // (a rider out ahead of the closeout altogether steps off this many s after it, rider.js checkHazards)
  },
  // A spot's phase is the time since it broke there, `phaseTime` s per unit of phase (the sims take ~0.9 s from the face
  // standing up to the lip landing, ~1 unit); past phase `farFrom` the whitewater lasts `behindFar` times longer
  // (`behind` 1: the time rate above).
  phaseTime: 1.0,
  phase: { behind: 1, behindFar: 3, farFrom: 1.5 },

  // Whitewater under you: the broken wave behind the tube, and the lower face where the lip lands on it.
  // (the lower face where the lip has landed is only a little foamy: staying low ahead of it is a way round a tube too small to ride)
  foam: (s, t) => Math.max(sstep(1.3, 1.6, s) * sstep(8.5, 9.5, t), sstep(0.9, 1.2, s) * sstep(12.1, 12.5, t) * 0.4),
  foamVisual: (s, t, xs) => {
    const front = sstep(3.5, 5.5, t);
    return Math.max(
      sstep(1.3, 1.9, s) * front * (1 - sstep(10, 40, -xs) * 0.5), // whitewater behind the tube
      Math.exp(-(((t - 12.1) / 0.6) ** 2)) * sstep(0.6, 0.85, s) * (1 - sstep(2.0, 2.8, s)) * 0.95, // where the lip lands on the face
      sstep(4.5, 5.5, t) * (1 - sstep(8.6, 9.3, t)) * sstep(0.2, 0.45, s) * (1 - sstep(1.4, 1.8, s)) * 0.85, // the thrown lip, white and frothy
      Math.exp(-(((t - 4.7) / 0.6) ** 2)) * sstep(-0.9, -0.4, s) * (1 - sstep(0.3, 0.6, s)) * 0.35, // feathering along the crest ahead
    );
  },
  // Light through thin water: a narrow band right round the lip as it pitches, and a faint one just under the crest
  // along the wall ahead (2026-11-19, the user: the first, wide bands made a thick aqua slab of the lip).
  thin: (s, t) => Math.min(1,
    Math.exp(-(((t - 7.8) / 0.8) ** 2)) * sstep(-0.5, 0.0, s) * (1 - sstep(0.15, 0.45, s)) * 0.6
    + Math.exp(-(((t - 6.6) / 0.6) ** 2)) * sstep(-1.2, -0.3, s) * (1 - sstep(0.0, 0.4, s)) * 0.3),
  lipT: 8,
  white: (s) => sstep(1.0, 1.4, s) * (1 - sstep(2.2, 3.0, s)),
  pocket: (xs) => (xs >= 0 ? Math.exp(-((xs / 6) ** 2)) : sstep(-8, -4, xs)),
  faceTop: (s) => 5.3 + (11.5 - 5.3) * sstep(-0.3, 0.2, s),
  // Barrel lines by real height (rider.js tubeLineT), as on Pipe; the tube is small, so you're in once 0.35 m in
  // under the lip.
  tubeReal: { faceTop: 0.88, top: 0.92, fall: 0.9, enterIn: 0.35, exitIn: 0.2, outBefore: 0.45 },
  // The tube is only rideable when it's tall enough to fit in (the user: it may be too small, and then you go around it):
  // ~1.4 m on the takeoff and middle sections (rideable), ~1.1 m on the inside (not), ~1.35 m on a set wave's inside.
  tubeMinHeight: 1.3,
  tubeFloor: { from: 0.75, t: 12.05 }, // (point 12: where the lip lands, sim-trestles.js)
  snapBand: 0.25, // (a Right turn counts as a snap from the top line down to a quarter of the face below it, by real height: rider.js snapZoneT) // (once the lip has landed on the face, below it = the lip lands on you)
  tube: true,
  plume: (s) => sstep(-1.0, -0.4, s) * (1 - sstep(1.1, 1.7, s)) * 0.7,
  lipImpact: (s) => sstep(0.6, 0.85, s) * (1 - sstep(1.6, 2.1, s)),

  sea: { set: [0.9, 1.0, 1.15], sections: false },

  tune: {
    ...point.tune, // Raglan's shortboard feel (speed, turns, moves, airs)
    // ... with Pipe's tube riding (rider.js stepTube)
    ...Object.fromEntries(['tubeEnter', 'tubeExit', 'tubeCollapse', 'tubeDrive', 'tubeLeanOver', 'tubeLeanDrive', 'tubeTurnDamp',
      'tubeClimbDamp', 'tubeTrimOver', 'tubeTrimOverHigh', 'tubeEnterLow', 'tubeFallHeight', 'tubeTooHigh', 'roofCrash', 'slashTube']
      .map((k) => [k, reef.tune[k]])),
    tubeLow: 0.6,
    curlZone: [-0.5, 2.5], // (as Raglan: the airs, snaps-into-the-lip and whitewater edge measure from here; at Pipe's -6 every air
    // rule sat 6 m behind the curl, so the pocket got the open face's higher threshold and smaller pop: the user, 2026-11-19.
    // The tube doesn't use it: you're in by the tube rules, rider.js stepTube.)
    startXs: 4, // drop in just ahead of the peak
    // A steep wall standing up anywhere along the wave feeds speed like the pocket does, up to `wallK` of it (rider.js
    // wallPower; the user, 2026-11-19: up-and-down carves on a steep section ahead should make speed, so you can make
    // it). Mid-face angle 17 deg (the fat shoulder) -> 0, 28 deg (a section about to break) -> full.
    wallK: 0.65, wallAngles: [17, 28],
    // The pocket's cruising speed from wave physics and surfers' GPS speeds (rider.js physCruise): c 6.5 m/s at the break,
    // over the ground 1.2 / 1.45 / 1.8 c low / mid / high on the face (~17 / 21 / 26 mph; GPS: recreational max ~21,
    // pros ~25, record 28), and never slower than 1.03 x the peel (you can hold the pocket). The HUD shows the board's
    // speed across the face (sqrt(ground^2 - c^2): ~10 / 15 / 22 mph), as on every wave.
    // (`gravity`: real g sin(slope) for drops and climbs instead of the arcade `drop`/`climb`; built, off for now: climbing
    // then costs real speed (a bottom turn from 20 mph reaches the lip at ~18) and the Raglan air thresholds (19-21 mph)
    // stop airs. Physics would set those by lift-off over the crest, sqrt(g R): ~7 / 15 / 18 / 20 mph at 1 / 2 / 4 / 8 m
    // out on wave 747. Waiting on the user, 2026-11-19.)
    physPocket: { c: 6.5, ground: [1.2, 1.45, 1.8], hold: 1.03, gravity: false },
  },
};
