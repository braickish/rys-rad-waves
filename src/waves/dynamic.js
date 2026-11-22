// Dynamic (first named Performance Peak; renamed 2026-11-21, the user): the first designed reef (2026-11-21; the user's reef generator spec: build reefs from Mead & Black's
// components instead of surveys of real breaks). An A-frame on a tropical reef; we ride its right, regular foot.
//
// Where the numbers come from (~/workspace/research/reef-generator, README there):
// - The reef (2026-11-22, the user swapped in the design sweep's best): reefgen.py, recipes/sweep_combo_shelf_eased_grad10.json
//   (run sw_combo_shelf_eased_grad10): the A-frame with a 1:10 reef line (was 1:15) and a shelf eased into the right arm
//   from 40 m. FUNWAVE (1.6 m 15 s straight in): median curl 204 m (the old reef 122), peel ~29 deg, bigger and steeper
//   breakers (1.86 m, H/h 0.81).
// - When each part breaks (dynamic-breaks.js): FUNWAVE's own breaking flag at the sim's own pace, exactly as Trestles (the
//   same bar: wave.js). Waves 159 and 261 rotate; 313 and 437 (a ~4-5 m/s crawl over the shelf, then ~60 m at once)
//   caught the racer bot every time, so they're left out.
// - The breaking shapes: borrowed from Trestles (sim-trestles.js, the same breaker size, ~2.3 m) until the reef has
//   its own 2D breaking-wave (BEM) runs.
import trestles from './trestles.js';
import { BREAKS } from './dynamic-breaks.js';

export default {
  ...trestles,
  id: 'dynamic',
  name: 'Dynamic',
  outfit: '', // warm water: boardshorts
  green: 0, // clear tropical water over reef
  bar: {
    ...trestles.bar,
    fadeEnd: 4, // (the right just stops breaking: you step off this many s after the curl reaches its end; the user, 2026-11-21)
    maps: BREAKS,
    use: BREAKS.map((m) => m.wave), // every simulated wave, one per ride
  },
};
