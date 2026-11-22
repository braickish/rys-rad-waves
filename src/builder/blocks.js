// The wave builder's blocks (the user, 2026-11-22: snap-together reef pieces, fun and forgiving, but you can still build
// a closeout). Each block is one or more of reefgen's surf-reef components (Mead & Black) with sizes picked so it makes a
// surfable wave on its own; the physics stays the real model (rays.js).
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

export function blockComponents(b) {
  const rad = (d) => d * Math.PI / 180;
  switch (b.type) {
    case 'peak': return [{ type: 'focus', apex: [b.x, b.y], width_m: 220, convexity: 0.667, depth_m: 3.0, gradient: b.slope || '1:10' }]; // (Slope: the hollowness dial, as the arms')
    case 'arm': return [{ type: 'wedge', start: [b.x, b.y], side: b.side, length_m: b.length, gradient: b.slope || '1:10', angle_to_swell_deg: b.angle, depth_m: 3.0, top_depth_m: 1.0 }];
    case 'ridge': {
      const ux = Math.cos(rad(b.rot)), uy = Math.sin(rad(b.rot)), h = b.length / 2;
      return [{ type: 'ridge', points: [[b.x - ux * h, b.y - uy * h], [b.x + ux * h, b.y + uy * h]], depth_m: 2.6, width_m: 35 }]; // (2.6 m crest, a little shallower than the arm's 3 m toe: a section the curl still makes; 1.8 m closed out)
    }
    case 'pinnacle': return [{ type: 'pinnacle', center: [b.x, b.y], radius_m: 38, depth_m: 2.2 }];
    case 'ledge': return [{ type: 'ledge', start: [b.x, b.y], side: b.side, length_m: 100, angle_to_swell_deg: b.angle, depth_m: 1.6, step_m: 4.0, face: '1:3', gradient: '1:15', width_m: 40, back_m: 40, fade_m: 40 }];
    case 'sandbar': {
      const ux = Math.cos(rad(b.rot)), uy = Math.sin(rad(b.rot)), h = b.length / 2;
      return [{ type: 'bar', points: [[b.x - ux * h, b.y - uy * h], [b.x + ux * h, b.y + uy * h]], depth_m: b.crest, slope: '1:40' }];
    }
    case 'channel': {
      const ux = Math.cos(rad(b.rot)), uy = Math.sin(rad(b.rot)), h = b.length / 2;
      return [{ type: 'channel', points: [[b.x - ux * h, b.y - uy * h], [b.x + ux * h, b.y + uy * h]], depth_m: 9, width_m: 40, fade_m: 20 }];
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
    const s = Math.min(a.length - 30, Math.max(30, (x - a.x) * tx + (y - a.y) * ty));
    const qx = a.x + tx * s, qy = a.y + ty * s, d = Math.hypot(x - qx, y - qy);
    if (d < near && (!best || d < best.d)) best = { arm: a, d, x: qx, y: qy };
  }
  return best;
}

export const reefComponents = (blocks) => [...FLOOR, ...blocks.flatMap(blockComponents)];

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
