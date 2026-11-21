// Dynamic (first named Performance Peak; renamed 2026-11-21, the user): the first designed reef (2026-11-21; the user's reef generator spec: build reefs from Mead & Black's
// components instead of surveys of real breaks). An A-frame on a tropical reef; we ride its right, regular foot.
//
// Where the numbers come from (~/workspace/research/reef-generator, README there):
// - The reef: reefgen.py, recipes/performance_peak.json: a ramp, a pointed focus (the takeoff peak) and two 1:15
//   wedges at 60 deg to the swell, shallowing from 3.0 to 1.9 m along their length so the shoulder, which loses
//   height to the peak, keeps breaking.
// - When each part breaks (peak-breaks.js): FUNWAVE-TVD on that reef, 1.6 m 15 s straight in, FUNWAVE's own breaking
//   flag at the sim's own pace, exactly as Trestles (the same bar: wave.js). Peel angle ~35 deg: an advanced wave.
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
