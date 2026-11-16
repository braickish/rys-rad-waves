// Reef Barrel: a hollow right that throws a lip over into a tube. Crouch (or
// balance) in the barrel; the whitewater behind it is a closing tube.
import { KF_PIPE, sstep } from './shapes.js';
import point from './point.js';

export default {
  id: 'reef',
  name: 'Reef Barrel',
  kind: 'barrel',
  keyframes: KF_PIPE,
  scale: 1.75, // much bigger than the point: a heavy, tall wave
  peelSpeed: 8.5, // peels fast: you have to race it
  waveSpeed: 5.0,
  phase: { ahead: 8, behind: 13 }, // pitches sooner ahead of the curl; the tube runs further behind it

  foam: (s, t) => (s > 1.5 && t > 9.5 ? 1 : 0),
  foamVisual: (s, t, xs) => {
    const front = sstep(3.5, 5.5, t); // the front half of the wave, not the back
    return Math.max(
      sstep(1.4, 2.0, s) * front * (1 - sstep(10, 40, -xs) * 0.5), // whitewater behind the barrel
      Math.exp(-(((t - 8.2) / 0.8) ** 2)) * sstep(0.6, 1.2, s) * (1 - sstep(1.7, 2.5, s)) * 0.45, // the lip
      sstep(13.6, 14.3, t) * sstep(0.9, 1.3, s) * (1 - sstep(3, 6, s)) * 0.55, // where it lands
    );
  },
  thin: (s, t) => Math.min(1,
    Math.exp(-(((t - 8) / 2.4) ** 2)) * sstep(-0.6, 0.1, s) * (1 - sstep(1.2, 1.8, s)) * 1.1
    + Math.exp(-(((t - 9.5) / 2.5) ** 2)) * sstep(-1.6, -0.3, s) * (1 - sstep(0.3, 0.8, s)) * 0.45),
  lipT: 8,
  // Whitewater spray and mist: where the tube closes and behind it, not inside it.
  white: (s) => sstep(1.1, 1.4, s) * (1 - sstep(2.0, 2.8, s)),
  pocket: (xs) => (xs >= 0 ? Math.exp(-((xs / 6) ** 2)) : sstep(-13, -9, xs)),
  // Once the lip has thrown, the face you can ride tops out under the roof.
  faceTop: (s) => (s > 0.1 ? 11.9 : 5.3),
  tube: true,

  sea: { set: [0.95, 1.0, 1.15], sections: false },


  tune: {
    ...point.tune,
    airs: false,
    floaters: false, rebounds: false, // too heavy: hit the whitewater or the lip next to it and you go over the falls
    // Tube riding (see stepTube in rider.js).
    tubeEnter: 0.2, // phase where the lip has thrown far enough to be in the tube
    pullInZone: 3.0, // within this far ahead of the curl (m) ...
    pullInHeight: 0.5, // ... and this high on the face, turning pulls you into the barrel
    pullInSpeed: 4.5, // while pulling in, the curl catches you up this fast (m/s)
    tubeExit: 0.12, // ... and where you're back out on the open face
    tubeCollapse: 1.0, // too deep past this phase (~13 m behind the curl) and the barrel pinches you
    tubeLine: 13.4, tubeLineRange: 0.3, // the line through the tube (surface position), and how far Left/Right move it
    lineRate: 1.6, lineDrift: 0.25, // how fast Left/Right move you up/down; how much the wave nudges you on its own
    tubeFunnel: 0.55, // room above/below shrinks by this much (of 1) from the exit to the pinch
    tubeCruise: -1.5, // with no input you drift deeper (m/s relative to the peel)
    wiggleDrive: 2.5, wiggleDecay: 0.8, // up-and-down wiggles drive you forward; the drive fades over this long (s)
  },
};
