// Reef wave shapes generated from one cylinder (the user's model, 2026-11-17),
// behind the URL switch `?cyl` (see reef.js). Same 16-point layout as the
// hand-made keyframes (shapes.js): 0-3 back, 4 crest, 5-7 outside of the lip
// (or the back of the crest), 8 the tip (or the top of the face), 9-13 the
// inside of the tube (or down the face), 14 the trough, 15 the open ocean.
//
// The cylinder runs the whole length of the wave. It is smallest at the back
// of the tube and grows at a steady rate going out toward the shoulder (s
// falling), and its back wall moves forward at a steady rate too. The wave
// covers part of its circumference: inside the tube the water wraps right
// round, over the top and down to where the curtain lands; at the opening the
// lip has only been thrown part of the way; ahead of the curl it's the back
// wall up to the crest; out on the shoulder only the lower back arc, and the
// rest is sky. Where the water stops going over the top is the break point.
//
// Angles (phi, degrees) are measured round the cylinder from its bottom:
// 0 = bottom, 90 = the back wall at mid height, 180 = the top, 270 = the front.
import { KF_BARREL } from './shapes.js';

const sstep = (a, b, x) => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u); };
const lerpTab = (tab, s) => { // piecewise-linear lookup in [[s, v], ...] (sorted by s)
  if (s <= tab[0][0]) return tab[0][1];
  for (let i = 1; i < tab.length; i++) if (s <= tab[i][0]) { const [s0, v0] = tab[i - 1], [s1, v1] = tab[i]; return v0 + ((v1 - v0) * (s - s0)) / (s1 - s0); }
  return tab[tab.length - 1][1];
};

export const CYL = {
  R0: 2.0, // half-width of the tube at s 0.8 (the full barrel)
  grow: 0.88, // how much wider per unit of phase going out (and narrower going in)
  aspect: 1.2, // taller than wide
  back0: 1.1, backRate: 0.6, // where the back wall is (z) at s 0.8, and how fast it moves forward going out
  // the trough under the cylinder: deep in the tube, shallower out on the shoulder
  trough: [[-1.6, -0.25], [-0.25, -0.45], [0.8, -0.75], [1.4, -0.7]],
  // the wave's height at the crest
  height: [[-1.6, 2.9], [-1.2, 3.3], [-0.25, 4.05], [0.25, 4.4], [0.8, 4.5], [1.4, 3.7]],
  thick: 0.2, // lip thickness at the tip (thicker toward the top: thickTop)
  thickTop: 0.32,
};

function cylAt(s) {
  const d = 0.8 - s;
  const rz = Math.max(0.9, CYL.R0 + CYL.grow * d);
  const back = CYL.back0 + CYL.backRate * d;
  const yb = lerpTab(CYL.trough, s), H = lerpTab(CYL.height, s);
  // Where the lip goes over, the cylinder is as tall as the wave (it only
  // grows wider); on the open wall it's taller than the wave, so the face is
  // just its lower arc.
  const broken = sstep(-0.15, 0.3, s);
  const ry = ((H - CYL.thickTop - yb) / 2) * broken + rz * CYL.aspect * (1 - broken);
  return { rz, ry, cz: back + rz, cy: yb + ry, yb, H };
}
const onCyl = (c, phi, off = 0) => { const a = (phi * Math.PI) / 180; return [c.cz - (c.rz + off) * Math.sin(a), c.cy - (c.ry + off) * Math.cos(a)]; };

// How far round the cylinder the water goes at phase s.
function phiEnd(c, s) {
  // open wave: the face runs up to just under the crest
  const top = Math.min(0.999, Math.max(-0.999, (c.cy - (c.H - 0.3)) / c.ry));
  const face = (Math.acos(top) * 180) / Math.PI;
  // thrown lip: over the top and round to where the curtain lands
  const lip = 110 + 225 * sstep(-0.1, 0.75, s);
  const k = sstep(-0.35, 0.05, s); // smooth hand-over from one to the other
  return Math.max(face, face * (1 - k) + lip * k);
}

export function cylKeyframe(s) {
  const c = cylAt(s);
  const pe = phiEnd(c, s);
  const broken = sstep(-0.15, 0.3, s); // 0 = open wall, 1 = a thrown lip
  // inside: down the face (open) or round the inside of the tube (broken)
  const inner = [0.95, 0.72, 0.49, 0.27, 0.07].map((w) => onCyl(c, pe * w));
  const tip = onCyl(c, pe, CYL.thick * 0.5);
  // outside of the lip (an offset arc back toward the top) ...
  const tk = (u) => CYL.thick + (CYL.thickTop - CYL.thick) * u;
  // (out[0] next to the tip, out[2] up by the top)
  const lipOut = [0.2, 0.5, 0.8].map((u) => onCyl(c, pe - (pe - Math.min(pe, 175)) * u - 4, tk(u)));
  // ... or, on the open wall, the crest rounding over behind the top of the face
  // (the top of the face is the crest's front; just behind it the crest rounds over and falls away down the back)
  const crestOut = [1, 2, 3].map((k) => [tip[0] - 0.32 * k * (1 + 0.1 * c.rz), tip[1] + [0.1, 0.11, 0.07][k - 1]]);
  const out = lipOut.map((p, i) => [crestOut[i][0] * (1 - broken) + p[0] * broken, crestOut[i][1] * (1 - broken) + p[1] * broken]);
  // the crest / top of the outside, then the back of the wave
  const crestOpen = [tip[0] - 1.5 - 0.3 * c.rz, tip[1] - 0.08];
  const crestLip = [Math.min(out[2][0] - 0.7, c.cz - c.rz - 0.4), Math.max(out[2][1] - 0.1, c.H - 0.2)];
  const crest = [crestOpen[0] * (1 - broken) + crestLip[0] * broken, crestOpen[1] * (1 - broken) + crestLip[1] * broken];
  const trough = onCyl(c, -14);
  const p = [[-40, 0], [-30, 0], [-8, 0.4], [crest[0] - 3.2, crest[1] * 0.6], crest, out[2], out[1], out[0], tip, ...inner, trough, [22, 0]];
  return { s: +s.toFixed(2), p: p.map(([z, y]) => [+z.toFixed(3), +y.toFixed(3)]) };
}

// Dense keyframes from the shoulder to the closing tube, then the broken wave
// behind (as before).
export function buildCylKeyframes() {
  const kf = [KF_BARREL[0], KF_BARREL[1]];
  for (let s = -1.6; s <= 1.4001; s += 0.1) kf.push(cylKeyframe(s));
  kf.push(KF_BARREL[7], KF_BARREL[8], KF_BARREL[9]);
  return kf;
}
