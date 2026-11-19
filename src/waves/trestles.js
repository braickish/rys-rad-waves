// Lower Trestles: a right (seen from the beach it peels toward the left), ridden regular foot, on a cobble fan.
// Unlike the other waves it changes as you ride it (the user's idea, 2026-11-17): it starts as a peak, the curl
// runs along the bar at the speed the bar sets at each place (`bar`: sections that go almost at once are places
// where the curl runs very fast), and each section has its own breaking shape.
//
// Where the numbers come from (~/workspace/research/trestles, README there):
// - The shapes (sim-trestles.js) are 2D breaking-wave simulations (BEM) on shore-normal profiles of the real
//   seafloor (USGS CoNED 1 m DEM): the takeoff peak, a middle section, the inside, and a bigger set wave's inside.
//   Each throws a thin lip that lands about half way down the face, so the tube is a small one up on the face
//   (the lip lands on the face and closes it), not Pipe's big tube down to the water: quick, hollow cover-ups
//   high in the pocket. Drop below where the lip lands once it has (`tubeFloor`) and it lands on you.
// - The bar (peel speed and section along the ride) follows FUNWAVE-TVD runs of a 1.5 m, 14-16 s south swell
//   over the fan: the curl peels at ~4-6 m/s with stretches ahead going almost at once (e.g. 64, 24 and 214 m on
//   one wave, the last being the inside). Here those are made rideable: a racing section after the takeoff, a
//   quick hollow bit in the middle, then the inside, which closes out at the end (the ride ends there).
import { KF_TAKEOFF, KF_MID, KF_INSIDE, KF_SETINSIDE } from './sim-trestles.js';
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
  board: 'shortboard',
  // One keyframe set per section (sim-trestles.js), in sim metres; `scale` sizes them (0.8: the takeoff's face
  // ~3.6 m, the middle ~3.4, the inside ~2.5; at the sim's own size the tube was only ~1 m deep).
  keyframes: KF_TAKEOFF,
  shapes: [KF_TAKEOFF, KF_MID, KF_INSIDE, KF_SETINSIDE],
  scale: 0.8, rippleK: 2.0,
  peelSpeed: 6.0, // (before a ride starts; the bar sets it while riding)
  waveSpeed: 5.5,
  // The bar: from the peak (x, m along the wave), the curl's speed (m/s) and the section's shape (a position in
  // `shapes` below: 1.5 = half way from the 2nd to the 3rd); both change smoothly between rows. A ride is ~40 s.
  bar: {
    rows: [
      { x: 0, peel: 6.0, shape: 0 }, // the takeoff peak
      { x: 30, peel: 6.0, shape: 0 },
      { x: 40, peel: 9.0, shape: 0.3 }, // a section ahead goes almost at once: race it (~20 mph: makeable flat out)
      { x: 75, peel: 9.0, shape: 0.8 },
      { x: 92, peel: 6.5, shape: 1 }, // the middle
      { x: 112, peel: 6.5, shape: 1 },
      { x: 118, peel: 8.5, shape: 1 }, // a quick, hollow bit
      { x: 134, peel: 8.5, shape: 1 },
      { x: 140, peel: 6.5, shape: 1 },
      { x: 160, peel: 7.0, shape: 1 },
      { x: 205, peel: 5.5, shape: 2 }, // the inside: smaller, slower, a narrow tube
      { x: 255, peel: 5.0, shape: 2 },
      { x: 2000, peel: 5.0, shape: 2 },
    ],
    shapes: [0, 1, 2], // takeoff, middle, inside
    setShapes: [0, 1, 3], // the biggest wave of a set has its own, heavier inside
    setSize: 1.1,
    // ... and the inside closes out: at 262 m the curl stops and the 70 m ahead of it breaks in place, sweeping along
    // at 60 m/s (all within ~1 s). Caught in it = "The inside closed out!"; past it, the ride ends `end` s later.
    closeout: { at: 262, length: 70, speed: 60, end: 4 },
    leftPeel: 5.0, // the left side of the peak peels away at this speed (m/s)
  },
  // Behind the curl a spot's phase goes by how long ago it broke: `phaseTime` s per unit of phase (the sims take
  // ~0.9 s from the face standing up to the lip landing, ~1 unit), so the tube runs ~6-7 m behind the curl at
  // 6.5 m/s and much longer behind a fast section. Ahead of the curl, `phase.ahead` m per unit; past phase
  // `farFrom` the whitewater lasts `behindFar` times longer (`behind` 1: the time rate above).
  phaseTime: 1.0,
  phase: { ahead: 9, behind: 1, behindFar: 3, farFrom: 1.5 },

  // Whitewater under you: the broken wave behind the tube, and the lower face where the lip lands on it.
  // (the lower face where the lip has landed is only a little foamy: staying low ahead of it is a way round a tube too small to ride)
  foam: (s, t) => Math.max(sstep(1.3, 1.6, s) * sstep(8.5, 9.5, t), sstep(0.9, 1.2, s) * sstep(13.1, 13.5, t) * 0.4),
  foamVisual: (s, t, xs) => {
    const front = sstep(3.5, 5.5, t);
    return Math.max(
      sstep(1.3, 1.9, s) * front * (1 - sstep(10, 40, -xs) * 0.5), // whitewater behind the tube
      Math.exp(-(((t - 13.1) / 0.6) ** 2)) * sstep(0.6, 0.85, s) * (1 - sstep(2.0, 2.8, s)) * 0.95, // where the lip lands on the face
      sstep(4.5, 5.5, t) * (1 - sstep(8.6, 9.3, t)) * sstep(0.2, 0.45, s) * (1 - sstep(1.4, 1.8, s)) * 0.85, // the thrown lip, white and frothy
      Math.exp(-(((t - 4.7) / 0.6) ** 2)) * sstep(-0.9, -0.4, s) * (1 - sstep(0.3, 0.6, s)) * 0.35, // feathering along the crest ahead
    );
  },
  thin: (s, t) => Math.min(1,
    Math.exp(-(((t - 7.5) / 2.0) ** 2)) * sstep(-0.6, 0.1, s) * (1 - sstep(0.2, 0.6, s)) * 1.0 // the lip as it pitches
    + Math.exp(-(((t - 7.0) / 1.4) ** 2)) * sstep(-1.5, -0.3, s) * (1 - sstep(0.3, 0.7, s)) * 0.6), // the wall ahead, under the crest
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
  tubeFloor: { from: 0.75, t: 13.05 }, // (once the lip has landed on the face, below it = the lip lands on you)
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
    curlZone: [-6, 2.5], // behind the curl is the tube, not whitewater
    startXs: 4, // drop in just ahead of the peak
  },
};
