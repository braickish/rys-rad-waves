// Your break: a wave from the wave builder (builder.html, DROP IN; the user, 2026-11-22). The builder hands over the
// stretch you chose (the whole ride, or a loop to surf forever) as a profile every 10 m: the curl's speed along the crest,
// where the fast sections are, and the breaker height (src/builder/loop.js wavePayload). The wave is Raglan+'s (its shape,
// its steeper section shape, its shortboard riding), driven by that profile instead of random ridges (wave.js
// `ridges.profile`), sized to the breakers, peeling the way you chose.
// The payload comes in the page's hash (#built=<base64 JSON>, so a link carries the wave) or, failing that, from
// localStorage (the last break you dropped into). With neither, a plain Raglan+-like wall at 17 mph.
import raglanPlus, { KF_SECTION, KF_CRUMBLY } from './raglan-plus.js';
import point from './point.js';
import reef from './reef.js';
import { KF_PIPE, sstep } from './shapes.js';
// (the wave model's shape state and tubeAt, handed over by wave.js once it has them: importing wave.js here would loop,
// since it loads the wave list, which loads this)
export const env = { SHAPE: { a: 0 }, tubeAt: () => 0 };

// The barrel end of the scale (plan step 7): Pipe's classic hand-built barrel (KF_PIPE: the wall stands up, the lip throws
// into a round tube), scaled to the height of Raglan+'s section shape so blending toward it changes the shape, not the size.
const peak = (kf, s0) => Math.max(...kf.find((k) => k.s === s0).p.map((q) => q[1]));
const kTube = peak(KF_SECTION, -0.25) / peak(KF_PIPE, -0.25);
export const KF_TUBE = KF_PIPE.map(({ s, p }) => ({ s, p: p.map(([z, y]) => [z * kTube, y * kTube]) }));
const pipeFaceTop = (s) => 5.3 + (11.9 - 5.3) * sstep(-0.3, 0.2, s); // (Pipe's classic: the rideable face tops out under the roof once the lip throws)

const FALLBACK = { v: 1, mode: 'loop', side: 'left', length: 200, base: 7.6, H: 2.1, profile: [{ s: 0, peel: 7.6, k: 0, H: 2.1 }, { s: 200, peel: 7.6, k: 0, H: 2.1 }] };
export const BUILT_KEY = 'rys-rad-waves-built';
// What the surfer wears by the water's temperature (the user, 2026-11-22: Build a Break's Water slider; looks only), °F:
// [up to, outfit (main.js bodyColors), name]. Usual surf guides' bands.
export const OUTFITS = [[54, 'hood', 'wetsuit + hood'], [63, 'wetsuit', 'wetsuit'], [69, 'shortsleeve', 'short-sleeve wetsuit'], [75, 'topper', 'swimsuit + top'], [Infinity, '', 'swimsuit']];
export const outfitFor = (f) => OUTFITS.find(([max]) => f <= max);

export function readBuilt() {
  try {
    const m = typeof location !== 'undefined' && location.hash.match(/built=([^&]+)/);
    if (m) {
      const data = JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(m[1])))));
      try { localStorage.setItem(BUILT_KEY, JSON.stringify(data)); } catch {}
      return data;
    }
  } catch {}
  try { const j = typeof localStorage !== 'undefined' && localStorage.getItem(BUILT_KEY); if (j) return JSON.parse(j); } catch {}
  return FALLBACK;
}
export const encodeBuilt = (data) => encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(data)))));

// (hidden: not on the title screen's list). Shapes on a scale by how it breaks (plan step 3): crumbly (spilling), Raglan's
// wall (a mild plunge), Raglan+'s section shape (pitching); the profile's `u` (0-2) places each spot on it.
const wave = {
  ...raglanPlus, id: 'built', name: 'Your break', hidden: true,
  shapes: [KF_CRUMBLY, point.keyframes, KF_SECTION, KF_TUBE],
  // Barrel sections (plan step 7): tube riding is on, but only where the shape under you has a tube (wave.js tubeAt; rider.js
  // checkHazards), and only if it's tall enough to fit in (Trestles' rule: otherwise the lip clips you; go around it).
  tube: true, tubeScale: true, tubeMinHeight: 1.3,
  // the face's top, the foam you ride in and the foam and glow you see follow the local shape: Pipe's where it barrels
  faceTop: (s, xs) => { const k = xs === undefined ? 0 : env.tubeAt(xs); return raglanPlus.faceTop(s) * (1 - k) + pipeFaceTop(s) * k; },
  foam: (s, t, xs) => { const k = xs === undefined ? 0 : env.tubeAt(xs); return raglanPlus.foam(s, t) * (1 - k) + reef.foam(s, t) * k; },
  // (the GPU table is built one shape set at a time: the tube set takes Pipe's foam and glow)
  foamVisual: (s, t, xs) => { const k = wave.sizeK || 1; return env.SHAPE.a === 3 ? reef.foamVisual(s, t, xs / k) : raglanPlus.foamVisual(s, t, xs / k); }, // (lengths along the wave by size)
  thin: (s, t) => (env.SHAPE.a === 3 ? reef.thin(s, t) : raglanPlus.thin(s, t)),
  tune: {
    ...raglanPlus.tune,
    // Pipe's tube riding, as Trestles takes it (rider.js stepTube)
    ...Object.fromEntries(['tubeEnter', 'tubeExit', 'tubeCollapse', 'tubeDrive', 'tubeLeanOver', 'tubeLeanDrive', 'tubeTurnDamp',
      'tubeClimbDamp', 'tubeTrimOver', 'tubeTrimOverHigh', 'tubeEnterLow', 'tubeFallHeight', 'tubeTooHigh', 'roofCrash', 'slashTube']
      .map((k) => [k, reef.tune[k]])),
    tubeLow: 0.6,
  },
};

// Set the wave from a builder payload (at load from the hash / localStorage; tests and a later in-game swap call it too,
// then useWave('built')).
const baseTune = wave.tune;
// The gun (the user, 2026-11-22: the wave scales but the surfer doesn't, so big waves get the board real big-wave surfers
// use): a long, narrow board that holds more speed and glides, keeps accelerating at speed, and turns in wide, slower arcs;
// no airs, slower snaps. Against the shortboard: turn radii x1.7-1.8, top turn rate 0.7x, the speed where drag bites 32 ->
// 40 mph (hard cap 39 -> 49), extra speed fades half as fast, drops slow down later.
const GUN = {
  rTop: 2.3, rBottom: 8.2, turn: 3.6, minTurn: 1.2, hardRadius: 0.8, snapRate: 8, checkRate: 3.5,
  softMax: 18, maxSpeed: 22, overBleed: 1.0, bleed: 0.4, maxAccelFast: 0.45, accelTaper: [9, 18], dropTerminal: 22,
  airs: false,
};
export function applyBuilt(data) {
  delete wave.dir; delete wave.stance;
  // Size, with no cap (the user, 2026-11-22): k = the breakers' height against Raglan's (its ~3.5 m face at scale 1.25 is a
  // ~3.5 m breaker). The cross-section scales by k and so does everything measured along the wave or across the pocket, as
  // Pipe's ?size does (reef.js sized): how fast the shape changes along the wave (phase), the pocket's reach, the foam drawn
  // behind, the curl zone, the shoulder's reach, where you drop in, the air and snap zones, and the camera's distance. The
  // curl's and the wave's speeds already come from the builder's physics, so they don't.
  const k = Math.max(0.05, data.H / 3.5), T = baseTune, p = raglanPlus.phase;
  Object.assign(wave, {
    built: data,
    sizeK: k, // (the riding camera pulls back with it, main.js)
    scale: raglanPlus.scale * k,
    phase: { ...p, ahead: p.ahead * k, behind: p.behind * k },
    // (the pocket: Raglan+'s, which ends at the curl; where the shape has a tube, Pipe's, which carries on in behind the curl:
    // in a barrel you ride behind the curl, and on Raglan+'s pocket the wave fed you nothing there; the user, 2026-11-22:
    // hard to make it back out of the tube)
    pocket: (xs) => { const a = raglanPlus.pocket(xs / k), tk = env.tubeAt(xs); return tk > 0 ? a + (reef.pocket(xs / k) - a) * tk : a; },
    board: data.board === 'gun' ? 'gun' : raglanPlus.board, // (the board you chose at DROP IN)
    outfit: data.water != null ? outfitFor(data.water)[1] : raglanPlus.outfit, // (what the water's temperature calls for; older links: Raglan's wetsuit)
    tune: { ...T, curlZone: T.curlZone.map((x) => x * k), startXs: 4 * k, shoulderReach: T.shoulderReach * k, snapIntoLip: T.snapIntoLip * k,
      airCurlZone: T.airCurlZone * k, airBoostZone: T.airBoostZone * k, airIntoCurl: T.airIntoCurl * k, ...(data.board === 'gun' ? GUN : {}) },
    peelSpeed: data.base, // (what trimming holds: the plain wall's pace, wave.js holdPeel)
    waveSpeed: data.c ?? raglanPlus.waveSpeed, // (the wave's speed toward the shore at breaking, from the builder)
    ...(data.side === 'right' ? { dir: -1, stance: 'regular' } : {}), // (a right peels the other way; ridden frontside, regular foot)
    ridges: { profile: data.profile, length: data.length, loop: data.mode === 'loop', fast: 1 },
  });
  return wave;
}
applyBuilt(readBuilt());
export default wave;
