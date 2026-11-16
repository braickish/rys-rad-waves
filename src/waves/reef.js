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
  peelSpeed: 10.5, // peels fast: you have to race it (pointing up costs you more here)
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
  faceTop: (s) => 5.3 + (11.9 - 5.3) * sstep(-0.3, 0.2, s), // lowers smoothly as the lip throws
  tube: true,

  sea: { set: [0.95, 1.0, 1.15], sections: false },


  tune: {
    ...point.tune,
    curlZone: [-16, 2.5], // behind the curl is the tube, not whitewater
    airs: false,
    floaters: false, rebounds: false, // too heavy: hit the whitewater or the lip next to it and you go over the falls
    // Tube riding (see stepTube in rider.js).
    tubeEnter: 0.12, // the curl has passed you: you're in the tube
    tubeExit: 0.06, // forward of this you're back out on the open face
    tubeCollapse: 1.3, // past this you are pinched: where the lip lands on the trough and the tube closes
    tubeLow: 0.6,
    tubeEnterLow: 0.3, // the barrel picks you up even this far below the base of the face (on a bottom turn)
    tubeFallHeight: 0.62, // above this fraction of the face in the barrel (top 3/8), the lip grabs you
    pullInZone: 4.0, pullInHeight: 0.4, // up this high on the face, within this far ahead of the curl, and turning: you pull in
    pullInSpeed: 4.5, // ... and stall (the curl catches you up this fast, m/s)
    pullInLine: 13.0, // ... settling here on the face while the barrel comes over you
    tubeTooHigh: 2.5, // further than this above the roof line as the lip throws = over the falls
    roofCrash: 0.9, // driving into the roof steeper than this (sin of angle) = over the falls // this far below the bottom of the face and the lip lands on you
  },
};
