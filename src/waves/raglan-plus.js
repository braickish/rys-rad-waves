// Raglan+ (the user, 2026-11-22): Raglan with random faster sections, kept next to the plain Raglan. Where the reef has
// a ridge the wave stands up steeper and the curl runs faster through it (wave.js `ridges`: one strength per spot along
// the beach drives both, the way a real ridge does: "a local increase in seabed gradient ... a wave section with a
// steeper face and lower peel angles", Mead & Black 2001 on Raglan's reefs, via Scarfe et al. 2002). The ridges are fixed
// to the reef, so ahead of you a section walls up before the curl gets there: your cue to start pumping. Each wave lays
// out its own (swell direction and size light up different parts of the reef), so you don't quite know what's coming.
import point from './point.js';

// The section shape: Raglan's own shape, steeper and a little taller, the lip pitching slightly. Every keyframe's face
// (the crest down to the trough) is drawn in toward the crest (`narrow`: 1 = unchanged), raised (`tall`), and the lip's
// outer points pushed a touch forward (`pitch`, m). Fades out toward the far swell (nothing at s -9, full from -3.5), so
// the steeper wall stands up as the wave nears breaking. Points keep their order (no overhang on the face).
const C = 4, TROUGH = 14; // control point indices (wave.js I.CREST, I.TROUGH)
export function sectionKF(kf, { narrow = 0.66, tall = 1.1, pitch = 0.35 } = {}) {
  return kf.map(({ s, p }) => {
    const k = Math.min(1, Math.max(0, (s + 9) / 5.5)) * (s > 1.2 ? 0.5 : 1); // (the whitewater behind stays closer to plain)
    const n = 1 - (1 - narrow) * k, h = 1 + (tall - 1) * k;
    const z0 = p[C][0], H = Math.max(...p.map((q) => q[1]), 1e-3);
    return { s, p: p.map(([z, y], i) => {
      if (i < C - 1 || i > TROUGH) return [z, y]; // (the back and the far flats stay put)
      let zz = i > C ? z0 + (z - z0) * n : z;
      if (i > C && i <= 8) zz += pitch * k * Math.max(0, y / H) ** 2; // (lip's outer points, high up: a touch forward)
      return [zz, i === TROUGH ? y : y * h];
    }) };
  });
}

export const KF_SECTION = sectionKF(point.keyframes);
// The softer end (built waves, plan step 3): the same transform the other way, the face drawn out (1.45x) and a little lower,
// the lip held back: a crumbly, spilling wall.
export const KF_CRUMBLY = sectionKF(point.keyframes, { narrow: 1.45, tall: 0.92, pitch: -0.15 });

export default {
  ...point,
  id: 'raglanPlus',
  name: 'Raglan+',
  // The curl's base speed between sections: ~17 mph on a normal wave of the set (Raglan's plain walls, the user's
  // 17 mph base); a full ridge runs it `fast` x that (~24.6 mph).
  peelSpeed: 7.6,
  shapes: [point.keyframes, KF_SECTION], // (wave.js: set 1 is the section shape the ridges blend toward)
  // ~3-4 sections in a ride's first 400 m: the first 40-90 m along, then every 70-140 m; each ramps in and out over
  // `width` m either side of its middle (a 30-60 m section, ~3-5 s of curl), at 75-100% strength (~22.5-24.6 mph at the middle on a normal wave).
  ridges: { first: [40, 90], gap: [70, 140], width: [15, 30], strength: [0.75, 1.0], fast: 1.45 },
  tune: {
    ...point.tune,
    // Carving on the steep section ahead of the curl gives speed (Trestles' `wallK`, rider.js wallPower), so pumping
    // through a section is how you make it. By the face's angle at mid height: Raglan's plain wall is ~52 deg there, a
    // full section ~65.
    wallK: 0.65, wallAngles: [55, 63],
  },
};
