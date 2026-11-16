// Reef Barrel: a hollow right that throws a lip over into a tube. Crouch (or
// balance) in the barrel; the whitewater behind it is a closing tube.
import { KF_BARREL, sstep } from './shapes.js';
import point from './point.js';

export default {
  id: 'reef',
  name: 'Reef Barrel',
  kind: 'barrel',
  keyframes: KF_BARREL,
  scale: 1.25,
  peelSpeed: 6.0,
  waveSpeed: 5.0,
  phase: { ahead: 10, behind: 8.5 },

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
  white: (s) => sstep(0.7, 1.1, s) * (1 - sstep(1.4, 1.8, s)),
  pocket: (xs) => (xs >= 0 ? Math.exp(-((xs / 6) ** 2)) : sstep(-13, -9, xs)),
  // Once the lip has thrown, the face you can ride tops out under the roof.
  faceTop: (s) => (s > 0.1 ? 11.9 : 5.3),
  tube: true,

  tune: { ...point.tune, airs: false },
};
