// Reef Barrel: a hollow right that throws a lip over into a tube. Crouch (or
// balance) in the barrel; the whitewater behind it is a closing tube.
import { KF_PIPE, sstep } from './shapes.js';
import { KF_SIM } from './sim-pipe.js';
// `?sim` (or SIM=1 in node): shapes from the 2D breaking-wave simulation (sim-pipe.js), for comparison.
export const USE_SIM = typeof location !== 'undefined' ? /[?&]sim(&|=|$)/.test(location.search) : !!(globalThis.process && process.env.SIM);
import point from './point.js';

export default {
  id: 'reef',
  name: 'Reef Barrel',
  kind: 'barrel',
  keyframes: USE_SIM ? KF_SIM : KF_PIPE,
  board: 'shortboard', // a 6'6" thruster with plenty of rocker for the steep, hollow face (mesh.js BOARDS)
  scale: 1.75, // much bigger than the point: a heavy, tall wave
  peelSpeed: 10.5, // peels fast: you have to race it (pointing up costs you more here)
  waveSpeed: 5.0,
  phase: { ahead: 14, behind: 13, behindFar: 22, farFrom: 1.3 }, // (the broken wave behind the closing tube lasts longer: behindFar) // a long tall wall ahead of the curl (like the reference photo); the tube runs further behind it

  foam: (s, t) => (s > 1.5 && t > 9.5 ? 1 : 0),
  foamVisual: (s, t, xs) => {
    const front = sstep(3.5, 5.5, t); // the front half of the wave, not the back
    return Math.max(
      sstep(1.4, 2.0, s) * front * (1 - sstep(10, 40, -xs) * 0.5), // whitewater behind the barrel
      Math.exp(-(((t - 8.1) / 0.7) ** 2)) * sstep(0.45, 0.75, s) * (1 - sstep(1.7, 2.5, s)) * 0.95, // the lip crashing onto the water
      sstep(13.6, 14.3, t) * sstep(0.9, 1.3, s) * (1 - sstep(3, 6, s)) * 0.55, // where it lands
      sstep(4.0, 5.2, t) * (1 - sstep(8.6, 9.3, t)) * sstep(0.05, 0.3, s) * (1 - sstep(1.4, 1.8, s)) * 0.9, // the thrown lip: white and frothy across its outside and the curtain
      Math.exp(-(((t - 4.7) / 0.6) ** 2)) * sstep(-0.9, -0.4, s) * (1 - sstep(0.3, 0.6, s)) * 0.35, // feathering along the crest of the wall ahead
    );
  },
  thin: (s, t) => Math.min(1,
    // the lip as it pitches: light glowing through it
    Math.exp(-(((t - 8) / 2.4) ** 2)) * sstep(-0.6, 0.1, s) * (1 - sstep(0.2, 0.6, s)) * 1.1 // (glows while it pitches; once thrown it's white water, not glass)
    // the wall ahead of the curl: a narrower band just under the crest than the
    // lip's, fading out down the face and toward the shoulder quickly (it used
    // to reach half way down the wall, taller than the lip's glow)
    + Math.exp(-(((t - 7.2) / 1.3) ** 2)) * sstep(-0.9, -0.3, s) * (1 - sstep(0.3, 0.7, s)) * 0.65),
  lipT: 8,
  // Whitewater spray and mist: where the tube closes and behind it, not inside it.
  white: (s) => sstep(1.1, 1.4, s) * (1 - sstep(2.0, 2.8, s)),
  pocket: (xs) => (xs >= 0 ? Math.exp(-((xs / 6) ** 2)) : sstep(-13, -9, xs)),
  // Once the lip has thrown, the face you can ride tops out under the roof.
  faceTop: (s) => 5.3 + (11.9 - 5.3) * sstep(-0.3, 0.2, s), // lowers smoothly as the lip throws
  tube: true,
  // Spray blowing back off the crest: along the tall wall ahead and over the barrel.
  plume: (s) => sstep(-1.3, -0.5, s) * (1 - sstep(1.1, 1.7, s)),
  // Whitewater bursting up where the curtain of the lip lands in front of the tube.
  lipImpact: (s) => sstep(0.4, 0.65, s) * (1 - sstep(1.5, 2.0, s)),

  sea: { set: [0.95, 1.0, 1.15], sections: false },


  tune: {
    ...point.tune,
    curlZone: [-16, 2.5], // behind the curl is the tube, not whitewater
    airs: false,
    shoulderReach: 0, // (the reef keeps its own feel)
    startXs: 5, // drop in a little further along: the tall wall stands up well ahead of the curl
    faceFlow: 5.7, // water rushing up the face (m/s): point a little down to hold your line
    floaters: false, rebounds: false, // too heavy: hit the whitewater or the lip next to it and you go over the falls
    // Tube riding (see stepTube in rider.js).
    tubeEnter: 0.12, // the curl has passed you: you're in the tube
    tubeExit: 0.06, // forward of this you're back out on the open face
    tubeCollapse: 1.3, // past this you are pinched: where the lip lands on the trough and the tube closes
    tubeLow: 0.6,
    tubeDrive: 4.5, // in the barrel, trimming flat or down the line adds this much acceleration (m/s^2) ...
    tubeTrimOver: 0.25, // ... up to this much faster than the wave peels (m/s): 24 mph here ...
    tubeTrimOverHigh: 1.15, // ... or this much in the top half of the barrel: 26 mph
    tubeEnterLow: 0.3, // the barrel picks you up even this far below the base of the face (on a bottom turn)
    tubeFallHeight: 0.62, // above this fraction of the face in the barrel (top 3/8), the lip grabs you
    tubeTooHigh: 2.5, // further than this above the roof line as the lip throws = over the falls
    slashLow: 0.3, // the water rushing up the face lifts you fast: the slash window starts a little higher here
    roofCrash: 0.9, // driving into the roof steeper than this (sin of angle) = over the falls // this far below the bottom of the face and the lip lands on you
  },
};
