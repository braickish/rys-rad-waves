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
  ledge: { label: 'Ledge', blurb: 'A sudden step up from deep water: a heavy section (the fast model over-reads its size).' },
  sandbar: { label: 'Sandbar', blurb: 'A long, gentle mound of sand (1:40): a beach-break peak. Pointing out to sea it makes an A-frame both ways; angled, a right or a left; lined up with the swell, it closes out. Shallower crests peel faster.' },
  channel: { label: 'Channel', blurb: 'Deep water: the wave stops breaking. Ends a ride, or splits a reef in two.' },
};

// The bay floor under everything: a ramp from 13 m to 8.5 m (as Dynamic's).
export const FLOOR = [{ type: 'ramp', start_depth_m: 13, end_depth_m: 8.5, x0_m: 300, length_m: 420 }];
// Deep offshore water (the user, 2026-11-22: big swells, Pipe-like waves): the bay 25 m deep offshore and its shelf down at
// 24 -> 16 m, so a big swell reaches the reef instead of breaking out on the shelf (a 4.5 m swell's set waves break ~10 m deep).
export const FLOOR_DEEP = [{ type: 'ramp', start_depth_m: 24, end_depth_m: 16, x0_m: 300, length_m: 420 }];
// A block's Depth (same day): its depths x 0.7 / 1 / 1.8, so a reef can sit deep enough for a big swell to break on it.
// (2026-11-23, the user: Pipe's three reefs, the outer ones far deeper: a slider from DEPTH_RANGE[0] to [1] x, shown as the
// water over the block's top, TOP_DEPTH m at 1x; the three old steps are its marks)
export const DEPTHS = [[0.7, 'Shallow'], [1, 'Medium'], [1.8, 'Deep']];
export const DEPTH_RANGE = [0.5, 5];
export const TOP_DEPTH = { peak: 3.0, arm: 1.0, ridge: 2.6, pinnacle: 2.2, ledge: 1.6, channel: 9 }; // (m at 1x: blockComponents)

// A block's Size (the user, 2026-11-22: reefs for big swells): every length and depth x 1 / 1.5 / 2.5 about its anchor, slopes
// unchanged. Waves scale the same way (Froude: a wave and a reef both 2.5x bigger break alike), so a reef that breaks a 5 ft
// swell well breaks a ~13 ft swell the same way at 2.5x. (Depth still scales the depths alone.)
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
    case 'ledge': return [{ type: 'ledge', start: [b.x, b.y], side: b.side, length_m: 100 * z, angle_to_swell_deg: b.angle, depth_m: 1.6 * f, step_m: 4.0 * f, face: '1:3', gradient: '1:15', width_m: 40 * z, back_m: 40 * z, fade_m: 40 * z }];
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

export const reefComponents = (blocks, deep = false) => [...(deep ? FLOOR_DEEP : FLOOR), ...blocks.flatMap(blockComponents)];

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
