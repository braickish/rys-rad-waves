// The wave builder's blocks (the user, 2026-11-22: snap-together reef pieces, fun and forgiving, but you can still build
// a closeout). Each block is one or more of reefgen's surf-reef components (Mead & Black) with sizes picked so it makes a
// surfable wave on its own; the physics stays the real model (rays.js).
import { slopeOf } from './reef.js';
// Positions in metres in the reef frame (x' toward the beach, y' along it; a right peels toward -y').

export const SNAP = 10; // positions snap to a 10 m grid
export const ARM_ANGLES = [30, 45, 60]; // between the arm's depth contours and straight-in crests: narrower = faster peel
export const ARM_LENGTHS = [150, 212, 280];
// The reef line's slope (plan step 3): the hollowness dial, leaving the peel alone (research/reef-generator's sweep):
// gentle breaks softer, steep pitches. (1:16 and gentler broke into pieces in the ray model.)
export const ARM_SLOPES = [['1:18', 'Gentle'], ['1:10', 'Medium'], ['1:6', 'Steep']];
export const ROTATIONS = [0, 30, 45, 60, 90, 120, 135, 150]; // ridge / channel / sandbar direction, degrees from straight in
export const BAR_CRESTS = [[1.0, 'Shallow'], [1.5, 'Medium'], [2.0, 'Deep']]; // a sandbar's crest depth (m)

export const BLOCKS = {
  peak: { label: 'Peak', blurb: 'A rounded point of reef: focuses the swell into a takeoff peak. Its slope sets how hard the set waves break on it.' },
  arm: { label: 'Arm', blurb: 'A sloping reef line off a peak: its angle sets the peel (30 deg fast, 60 deg mellow), its slope how hollow it breaks (gentle crumbles, steep pitches).' },
  ridge: { label: 'Ridge', blurb: 'A bar laid along an arm: the arm stands up steeper there, a fast section you pump through. Turned across the wave it closes out.' },
  pinnacle: { label: 'Pinnacle', blurb: 'A round bommie: the wave wraps and stands up over it.' },
  ledge: { label: 'Ledge', blurb: 'A sudden wall up from deep water, like Teahupoo: the heaviest wave there is, a thick lip and a round tube breaking below sea level (the fast model over-reads its size).' },
  sandbar: { label: 'Sandbar', blurb: 'A long, gentle mound of sand (1:40): a beach-break peak. Pointing out to sea it makes an A-frame both ways; angled, a right or a left; lined up with the swell, it closes out. Shallower crests peel faster.' },
  channel: { label: 'Channel', blurb: 'Deep water: the wave stops breaking. Ends a ride, or splits a reef in two.' },
};

// The bay floor under everything: a ramp from 13 m to 8.5 m (as Dynamic's). (`floor`: with a coastline, measured from it, reef.js)
export const FLOOR = [{ type: 'ramp', floor: true, start_depth_m: 13, end_depth_m: 8.5, x0_m: 300, length_m: 420 }];
// Deep offshore water (the user, 2026-11-22: big swells, Pipe-like waves): the bay 25 m deep offshore and its shelf down at
// 24 -> 16 m, so a big swell reaches the reef instead of breaking out on the shelf (a 4.5 m swell's set waves break ~10 m deep).
export const FLOOR_DEEP = [{ type: 'ramp', floor: true, start_depth_m: 24, end_depth_m: 16, x0_m: 300, length_m: 420 }];
// A block's Depth (same day): its depths x 0.7 / 1 / 1.8, so a reef can sit deep enough for a big swell to break on it.
// (2026-11-23, the user: Pipe's three reefs, the outer ones far deeper: a slider from DEPTH_RANGE[0] to [1] x, shown as the
// water over the block's top, TOP_DEPTH m at 1x; the three old steps are its marks)
export const DEPTHS = [[0.7, 'Shallow'], [1, 'Medium'], [1.8, 'Deep']];
export const DEPTH_RANGE = [0.5, 5];
export const TOP_DEPTH = { peak: 3.0, arm: 1.0, ridge: 2.6, pinnacle: 2.2, ledge: 1.6, channel: 9 }; // (m at 1x: blockComponents)
// The shallowest a block's top can go (the user, 2026-11-28: every reef piece down to 2 ft over its top; an arm already went
// to 1.6 ft, and still does; a channel is a cut, not a top, so it keeps its range): its smallest Depth factor at a size.
export const SHALLOWEST_M = 0.61; // (2 ft)
export const depthMin = (type, size = 1) => (type === 'channel' ? DEPTH_RANGE[0]
  : Math.min(DEPTH_RANGE[0], SHALLOWEST_M / ((TOP_DEPTH[type] || 3) * size)));
// A new Size keeps the block's depths where they are (the user, same day: Size changed the depth too; now it scales the
// lengths alone): the Depth factor that gives the same depths at the new size, within the slider's range.
export const depthForSize = (b, size) => Math.min(DEPTH_RANGE[1], Math.max(depthMin(b.type, size), (b.depth || 1) * (b.size || 1) / size));

// A block's Size (the user, 2026-11-22: reefs for big swells): every length and depth x 1 / 1.5 / 2.5 about its anchor, slopes
// unchanged. Waves scale the same way (Froude: a wave and a reef both 2.5x bigger break alike), so a reef that breaks a 5 ft
// swell well breaks a ~13 ft swell the same way at 2.5x. (Depth still scales the depths alone.) (2026-11-28, the user: Size
// no longer changes the depths: the builder sets the Depth factor to keep them, depthForSize, so it scales the lengths.)
export const SIZES = [[1, '1x'], [1.5, '1.5x'], [2.5, '2.5x']];
// What's behind a Peak or an Arm (plan step 8, stacked reefs; the user, 2026-11-22): a reef flat (as always: the reef top runs
// on ~150 m behind its edge and broken waves die across it) or a lagoon (the reef is a narrow ridge falling back into the
// bay's floor behind its crest, so the broken waves can reform over the deep water and break again on a reef or a bar inside).
export const BACKS = [['flat', 'Reef flat'], ['lagoon', 'Lagoon']];
export const blockLength = (b) => (b.length ?? (b.type === 'ledge' ? 100 : 0)) * (b.size || 1); // (an arm's / ledge's / ridge's ... length on the reef)
export function blockComponents(b) {
  const rad = (d) => d * Math.PI / 180, z = b.size || 1, f = (b.depth || 1) * z; // (z: size, every length and depth; f: depths)
  switch (b.type) {
    // (Slope: the hollowness dial, as the arms'. A lagoon behind: the reef's top runs 20 m behind its edge (an arm's: the width
    // of its slope up to the top, plus 10 m), then falls to the floor over its 40 m fade)
    case 'peak': return [{ type: 'focus', apex: [b.x, b.y], width_m: 220 * z, tip_radius_m: 20 * z, fade_m: 40 * z, convexity: 0.667, depth_m: 3.0 * f, gradient: b.slope || '1:10', ...(b.back === 'lagoon' ? { back_m: 20 * z } : {}) }];
    case 'arm': return [{ type: 'wedge', start: [b.x, b.y], side: b.side, length_m: b.length * z, width_m: 200 * z, back_m: b.back === 'lagoon' ? 2 * f / slopeOf(b.slope || '1:10') + 10 * z : 150 * z, fade_m: 40 * z, gradient: b.slope || '1:10', angle_to_swell_deg: b.angle, depth_m: 3.0 * f, top_depth_m: 1.0 * f }];
    case 'ridge': {
      const ux = Math.cos(rad(b.rot)), uy = Math.sin(rad(b.rot)), h = b.length * z / 2;
      return [{ type: 'ridge', points: [[b.x - ux * h, b.y - uy * h], [b.x + ux * h, b.y + uy * h]], depth_m: 2.6 * f, width_m: 35 * z }]; // (2.6 m crest, a little shallower than the arm's 3 m toe: a section the curl still makes; 1.8 m closed out)
    }
    case 'pinnacle': return [{ type: 'pinnacle', center: [b.x, b.y], radius_m: 38 * z, depth_m: 2.2 * f }];
    case 'ledge': return [{ type: 'ledge', start: [b.x, b.y], side: b.side, length_m: 100 * z, angle_to_swell_deg: b.angle, depth_m: 1.6 * f, step_m: 8.0 * f, face: '1:1', gradient: '1:15', /* (a true ledge, the user, 2026-11-24, after Teahupoo: deep water, then a near-vertical wall; was a 4 m step on a 1:3 face) */ width_m: 40 * z, back_m: 40 * z, fade_m: 40 * z }];
    case 'sandbar': {
      const ux = Math.cos(rad(b.rot)), uy = Math.sin(rad(b.rot)), h = b.length * z / 2;
      return [{ type: 'bar', points: [[b.x - ux * h, b.y - uy * h], [b.x + ux * h, b.y + uy * h]], depth_m: b.crest * z, slope: '1:40' }];
    }
    case 'channel': {
      const ux = Math.cos(rad(b.rot)), uy = Math.sin(rad(b.rot)), h = b.length * z / 2;
      return [{ type: 'channel', points: [[b.x - ux * h, b.y - uy * h], [b.x + ux * h, b.y + uy * h]], depth_m: 9 * f, width_m: 40 * z, fade_m: 20 * z }];
    }
  }
  return [];
}

// The direction of an arm's line as a ridge/channel `rot` (degrees from straight in, 0-180), and the nearest arm whose
// line passes within `near` m of (x, y), with that spot on it: ridges snap onto arms, lined up with them.
export const armRot = (a) => ((Math.atan2(a.side * Math.cos(a.angle * Math.PI / 180), Math.sin(a.angle * Math.PI / 180)) * 180 / Math.PI) + 180) % 180;
export function nearestArm(blocks, x, y, near = 35) {
  let best = null;
  for (const a of blocks) {
    if (a.type !== 'arm') continue;
    const r = a.angle * Math.PI / 180, tx = Math.sin(r), ty = a.side * Math.cos(r);
    const L = blockLength(a), s = Math.min(L - 30, Math.max(30, (x - a.x) * tx + (y - a.y) * ty));
    const qx = a.x + tx * s, qy = a.y + ty * s, d = Math.hypot(x - qx, y - qy);
    if (d < near && (!best || d < best.d)) best = { arm: a, d, x: qx, y: qy };
  }
  return best;
}

// Reef edges (the user, 2026-11-24: allow more sudden changes, like a lot of reefs): 'soft' fades every piece in over its own
// `fade_m` (40 m for most, channels 20 m); 'sharp' over a quarter of that (10 m; channels 8), so a ridge, a pinnacle or a ledge
// starts suddenly and the wave changes suddenly there. The builder defaults to sharp (ui.js); called without it (the tests, the
// survey, Dynamic's checks against FUNWAVE) it's soft, as before.
export const EDGE_FADE = { soft: { piece: 1, channel: 1 }, sharp: { piece: 0.25, channel: 0.4 } };
// Sharp is sharp at any Size (the user, 2026-11-28: a 2.5x peak still came out rounded and soft on Sharp): its edge fade
// isn't scaled up with the block (a 2.5x block's was 25 m, not 10), and a peak's tip is a point (5 m), not a 20 m round
// that Size made 50.
export const SHARP_TIP_M = 5;
export const reefComponents = (blocks, deep = false, edges = 'soft') => {
  const k = EDGE_FADE[edges] || EDGE_FADE.soft;
  const comps = blocks.flatMap((b) => blockComponents(b).map((c) => (k === EDGE_FADE.soft ? c : { ...c, z: b.size || 1 })));
  if (k !== EDGE_FADE.soft) for (const c of comps) {
    c.fade_m = c.type === 'channel' ? (c.fade_m ?? 20) / c.z * k.channel : (c.fade_m ?? 40) / c.z * k.piece;
    if (c.type === 'focus') c.tip_radius_m = SHARP_TIP_M;
    delete c.z;
  }
  return [...(deep ? FLOOR_DEEP : FLOOR), ...comps];
};

let nextId = 1;
export function newBlock(type, x, y) {
  const b = { id: nextId++, type, x, y };
  if (type === 'arm') Object.assign(b, { side: -1, angle: 45, length: 212, slope: '1:10' });
  if (type === 'ledge') Object.assign(b, { side: -1, angle: 45 });
  if (type === 'ridge') Object.assign(b, { rot: 135, length: 80 });
  if (type === 'channel') Object.assign(b, { rot: 0, length: 220 });
  if (type === 'sandbar') Object.assign(b, { rot: 0, length: 160, crest: 1.5 }); // (pointing out to sea: an A-frame)
  return b;
}

// Dynamic's reef as blocks (the start: a working wave to change, not an empty bay).
export function dynamicPreset() {
  const p = newBlock('peak', 860, 520);
  const r = newBlock('arm', 860, 520), l = newBlock('arm', 860, 520); l.side = 1;
  return [p, r, l];
}

// A beach break (plan step 6): one sandbar pointing out to sea on a medium (1:20) beach, an A-frame; a 12 s swell suits it.
export function beachPreset() { return [newBlock('sandbar', 1040, 520)]; }
// Stacked reefs (plan step 8): an outer reef (1.5x, deep) with a lagoon behind it and a smaller reef inside; a ~10 ft 15 s
// swell breaks outside, reforms over the lagoon and breaks again on the inside reef.
export function stackedPreset() {
  const outer = [newBlock('peak', 760, 520), newBlock('arm', 760, 520), Object.assign(newBlock('arm', 760, 520), { side: 1 })];
  for (const b of outer) Object.assign(b, { size: 1.5, depth: 1.8, back: 'lagoon' });
  return [...outer, newBlock('peak', 1000, 520), newBlock('arm', 1000, 520), Object.assign(newBlock('arm', 1000, 520), { side: 1 })];
}
// Pipeline (the user, 2026-11-23: the Pipe wave on Pipeline's real reef, first, second and third reef). Laid out from the 2013
// USACE lidar (research/pipeline-reef: the reef frame, x' = 1250 - metres offshore, y' along the beach, + toward the NE,
// where the Pipe left runs) and the usual figures (First Reef ~60 m out in 1-3 m, Second ~130 m out in 4.5-6 m, Third
// ~300 m out in 9-12 m). First Reef: a steep (1:6) peak 80 m out, its top ~2.4 m down, a left arm (Pipe) and a right
// (Backdoor). Second and Third: broad rounded peaks (Size 1.5x / 2.5x, 5.4 m and 6.75 m down at their apex, against the
// lidar's ~4.5 and ~9 m tops: Third Reef a little shallow so 15 ft breaks out there first) falling back behind (Behind: lagoon), as the lidar's stepped shelf. A channel off the SW side, where the
// swell comes from, is the lidar's deep slot (13-15 m) beside the outer reef: it lenses the swell onto the peak and down the
// left (research/pipeline-reef lens.mjs: without the outer reefs and the channel, First Reef doesn't make a wave at all, the
// shelf closes out). The deep floor (~2.75 m + 1:40 offshore) is close to the lidar's own (2.5 m at 60 m, 8.3 at 200, 10.5
// at 300), on a steep (1:12) beach. Layout from a search over these knobs (research/pipeline-reef sweep.mjs). In the
// builder's model, at 15-16 s from the WNW (dir -10): 5-8 ft breaks on First Reef (barrelling left 120-140 m, peel 24-34
// deg, ridden in Pipe's barrel shapes at ~20-23 mph, and a Backdoor right), 10-11 ft on Second Reef (a barrelling left
// 160-190 m), 15 ft breaks first out on Third Reef (steep, mostly closing out); in between it's a mess, as it is there, and a
// more northerly swell (dir -5) turns First Reef into Backdoor. Smaller than the game's Pipe (~8 m faces): on the real reef
// a wave that big breaks out on the outer reefs (test/pipeline.mjs).
export const PIPELINE = {
  coast: { face: 12, deep: true },
  swell: { H: 1.8, T: 15, dir: -10 }, // (a classic First Reef day)
  reefs: [
    // { x' of the peak's apex, y', size, depth, slope (the peak's), left arm { angle, length, slope }, right arm, back }
    { x: 1170, y: 520, size: 1, depth: 0.8, slope: '1:6', left: { angle: 30, length: 150, slope: '1:6' }, right: { angle: 45, length: 212, slope: '1:6' } },
    { x: 1100, y: 470, size: 1.5, depth: 1.2, back: 'lagoon' }, // (apex 5.4 m: the lidar's and the usual 4.5-6 m; at 0.9, 4 m, First Reef only held to ~6 ft)
    { x: 930, y: 500, size: 2.5, depth: 0.9, back: 'lagoon' },
  ],
  extra: [{ type: 'channel', x: 820, y: 440, rot: 30, length: 400, size: 2.5, depth: 0.4 }],
};
export function pipelinePreset(P = PIPELINE) {
  const extra = (P.extra || []).map((e) => Object.assign(newBlock(e.type, e.x, e.y), e));
  return extra.concat(P.reefs.flatMap((r) => {
    const common = { size: r.size, depth: r.depth, ...(r.back ? { back: r.back } : {}) };
    const arms = [[1, r.left], [-1, r.right]].filter(([, a]) => a).map(([side, a]) => Object.assign(newBlock('arm', r.x, r.y), { side, ...a }, common));
    return [Object.assign(newBlock('peak', r.x, r.y), common, r.slope ? { slope: r.slope } : {}), ...arms];
  }));
}
