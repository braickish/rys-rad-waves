// Reef Barrel: a hollow right that throws a lip over into a tube. Crouch (or
// balance) in the barrel; the whitewater behind it is a closing tube.
import { KF_PIPE, sstep, withBore, pipeSOf } from './shapes.js';
import { KF_SIM } from './sim-pipe.js';
// The reef's shapes come from the 2D breaking-wave simulation (sim-pipe.js), at 1.2x size (the
// user's pick, 2026-11-17). `?classic` (or CLASSIC=1 in node) brings back the earlier hand-built
// shapes (KF_PIPE) at their old size, for comparison. (`?sim` used to switch the sim shapes on; it's
// the default now and is ignored.)
export const USE_SIM = typeof location !== 'undefined' ? !/[?&]classic(&|=|$)/.test(location.search) : !(globalThis.process && process.env.CLASSIC);
import point from './point.js';
// `?size=1.75` (or SIZE=1.75 in node): the whole reef wave this many times bigger than its base, for trying
// out sizes: its cross-section, its length along the wave (phase lengths, pocket, curl zone,
// whitewater, where you drop in) and its peel speed by sqrt(size), like a bigger set wave.
// Everything about getting caught in the barrel goes by place along the curve, phase and
// real height in the tube, so it scales with it.
const SIZE_K = (() => {
  const v = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('size') : globalThis.process && process.env.SIZE;
  const k = Number(v); return k > 0.2 && k < 5 ? k : USE_SIM ? 1.2 : 1; // (default: 1.2x for the sim shapes)
})();

const reef = {
  id: 'reef',
  name: 'Pipe',
  walkKeys: true, shuffle: true, // (Up/Down and up/down swipes shuffle the feet back / middle / forward, rider.js; only Left/Right turn)
  kind: 'barrel',
  keyframes: USE_SIM ? withBore(KF_SIM, { from: 1.3, collapse: 1.65, sOf: pipeSOf }) : KF_PIPE, // (the tube collapsing into lasting whitewater: shapes.js withBore)
  board: 'shortboard', // a 6'6" thruster with plenty of rocker for the steep, hollow face (mesh.js BOARDS)
  scale: 1.75, rippleK: 1.5, // (ripples 1.5x finer, like Queens and Raglan but less: at 2x the distant flats seen from the barrel went grainy) much bigger than the point: a heavy, tall wave
  peelSpeed: 10.5, // peels fast: you have to race it (pointing up costs you more here)
  waveSpeed: 5.0,
  phase: { ahead: 14, behind: 13, behindFar: 22, farFrom: 1.3 }, // (the broken wave behind the closing tube lasts longer: behindFar) // a long tall wall ahead of the curl (like the reference photo); the tube runs further behind it

  foam: (s, t) => ((s > 1.5 && t > 9.5) || (s > 1.6 && t > 4.5) ? 1 : 0), // (from 1.65 the tube has collapsed into a foam wall: its whole front, t 4.5+)
  foamVisual: (s, t, xs) => {
    const front = sstep(3.5, 5.5, t); // the front half of the wave, not the back
    return Math.max(
      sstep(1.25, 1.55, s) * front * (1 - sstep(10, 40, -xs) * 0.5), // whitewater behind the barrel (from as the tube collapses)
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
  // ?sim: the curve's points sit differently (t 11.9 is half way down the back wall there), so the
  // barrel's lines are set by real height in the tube instead (rider.js tubeLineT): the roof line at
  // 92% of the way from the trough to the roof (where 11.9 sits on the normal reef), and over the falls
  // above 80% (looser than the normal reef; t-based, its 0.62 caught you at ~20% of the height here).
  // In the barrel once you're `enterIn` m in under the lip (so it's over you); near the opening
  // (phase below `outBefore`) out once you're less than `exitIn` m in (0.2 m nearer the lip: a gap so
  // it doesn't flick in and out at one spot).
  tubeReal: USE_SIM ? { faceTop: 0.88, top: 0.92, fall: 0.9, enterIn: 0.5, exitIn: 0.3, outBefore: 0.45 } : null, // (faceTop: the open face's top, of the way from trough to crest)
  tube: true,
  // Spray blowing back off the crest: along the tall wall ahead and over the barrel.
  plume: (s) => sstep(-1.3, -0.5, s) * (1 - sstep(1.1, 1.7, s)),
  // Whitewater bursting up where the curtain of the lip lands in front of the tube.
  lipImpact: (s) => sstep(0.4, 0.65, s) * (1 - sstep(1.5, 2.0, s)),

  sea: { set: [0.95, 1.0, 1.15], sections: false },


  tune: {
    ...point.tune,
    // (Raglan's 2026-11-18 turn-drive changes are kept off Pipe for now: these are the values Pipe had)
    bottomDrive: 8, bottomCarveDrive: 1.6, topDrive: 1.6, driveMaxAccel: 0, highDropAccel: 4, roundhouseNoDrive: false,
    topDropBoost: 8, driveRefSpeed: 0, dropTerminal: 0, postMoveDrop: 1, moveEase: 0, // (Raglan's speed-on-speed changes, 2026-11-18, kept off Pipe: the user)
    heightSpeed: [0.45, 0.75], feed: 2.0, maxAccel: 10, // (Raglan's smoother pocket speed, 2026-11-19, kept off Pipe)
    lipSnapDrag: 1.4, slashDrag: 3.2, moveCalm: 0.95, bleed: 0.9, shoulderFade: 1,
    moveScrub: { roundhouse: 0.03, slash: 0.25, snap: 0.08, check: 0.05, reentry: 0.08, topTurn: 0.04, lip180: 0.1, floater: 0.05, rebound: 0.1, rebound180: 0.1, revert: 0.05, land: 0.05 },
    curlZone: [-16, 2.5], // behind the curl is the tube, not whitewater
    airs: false,
    shoulderReach: 6, // the pocket's speed carries this much further out toward the shoulder (m, x size; was 0: the user found the speed died too soon going out)
    startXs: 5, // drop in a little further along: the tall wall stands up well ahead of the curl
    // (water rushing up the face: Raglan's faceFlowK, ~5.7 m/s here (c 12.4), the reference: point ~20 deg down to hold your line)
    floaters: false, rebounds: false, // too heavy: hit the whitewater or the lip next to it and you go over the falls
    // Tube riding (see stepTube in rider.js).
    tubeEnter: 0.12, // the curl has passed you: you're in the tube
    tubeExit: 0.06, // forward of this you're back out on the open face
    tubeCollapse: 1.3, // past this you are pinched: where the lip lands on the trough and the tube closes
    tubeLow: 0.6,
    // Slashes turn less here than on the point (the user, 2026-11-17): the board swings round less far
    // and more slowly, and your own carve turns you less while it slides; in the barrel likewise.
    slashSlideMax: 0.6, slashSpin: 4, slashCarve: 0.3,
    // Snaps only right at the lip and out of the pocket toward the shoulder (the user, 2026-11-17);
    // elsewhere turning Right up high is a check turn (rider.js snapAllowed / startCheckTurn).
    snapShoulder: 4.0, snapNear: 0.8, snapZone: 1.5, // (snapZone: how far below the top a Right turn counts as a snap/check at all; lower down it is just a carve)
    slashTube: { slashSlideMax: 0.26, slashCarve: 0.22 }, // (merged over the rider's slashTube, rider.js useWave)
    tubeDrive: 5.2, // in the barrel, trimming flat or down the line adds this much acceleration (m/s^2) (+15%, the user) ...
    tubeLeanOver: 0.45, tubeLeanDrive: 1.1, // really deep, leaning onto the front foot: up to this much faster (m/s, ~1 mph) and more push (the user: halved from 0.6/1.5, then up a bit to here, 2026-11-17)
    tubeTurnDamp: 0.7, tubeCrouchDamp: 0.35, // in the barrel turning is damped, up to this much (70% slower turns; was 60%, the user, 2026-11-24: a bit more) by about half depth, and holding crouch in there damps what's left by 35% more (~80% in all) (rider.js r.tubeDamp; was 0.45 by 70%)
    tubeClimbDamp: 0.45, // ... and heading up the face is slowed by up to this much (30% going in, 45% deep), so a turn up doesn't suck you into the roof
    tubeTrimOver: 0.29, // ... up to this much faster than the wave peels (m/s) (+15%) ...
    tubeTrimOverHigh: 1.32, // ... or this much in the top half of the barrel (+15%)
    tubeEnterLow: 0.3, // the barrel picks you up even this far below the base of the face (on a bottom turn)
    tubeFallHeight: 0.62, // above this fraction of the face in the barrel (top 3/8), the lip grabs you
    tubeTooHigh: 2.5, // further than this above the roof line as the lip throws = over the falls
    slashLow: 0.3, // the water rushing up the face lifts you fast: the slash window starts a little higher here
    roofCrash: 0.9, // driving into the roof steeper than this (sin of angle) = over the falls // this far below the bottom of the face and the lip lands on you
  },
};

// (applies ?size: lengths along the wave scale with it, peel speed by sqrt)
function sized(w, k) {
  if (k === 1) return w;
  const p = w.phase, fv = w.foamVisual, pk = w.pocket, T = w.tune;
  return {
    ...w,
    sizeK: k, // (the riding camera pulls back with it, main.js)
    scale: w.scale * k,
    peelSpeed: w.peelSpeed * Math.sqrt(k), waveSpeed: w.waveSpeed * Math.sqrt(k),
    phase: { ...p, ahead: p.ahead * k, behind: p.behind * k, behindFar: p.behindFar && p.behindFar * k },
    foamVisual: (s, t, xs) => fv(s, t, xs / k),
    pocket: (xs) => pk(xs / k),
    tune: { ...T, curlZone: T.curlZone.map((x) => x * k), startXs: T.startXs * k, snapShoulder: T.snapShoulder * k, shoulderReach: T.shoulderReach * k },
  };
}

export default sized(reef, SIZE_K);
