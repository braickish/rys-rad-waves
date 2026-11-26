// The surfer: an articulated figure posed every frame from the rider's state.
// Legs and arms are two-bone IK chains (feet stay planted on the board, hands
// reach for targets). Pose drivers:
//   - knee bend: a relaxed base stance, deeper through turns, compress on the
//     way up the face and extend on the way down when pumping, deep crouch on
//     Shift, tucked in the air
//   - lean: into the turn, harder the faster you turn; in a big turn the
//     inside hand drags toward the water

import { v3, frameAt } from './rider.js';
import { basis } from './math.js';
import { WAVE, toWorld } from './wave.js';
import { BOARDS } from './mesh.js';

// Illustrated look based on a reference photo: shirtless and tanned, short
// dark-brown hair, blue-grey boardshorts with a black waistband and a small
// red logo, an off-white board (with a soft teal nose so the front reads).
const COL = {
  board: [0.95, 0.93, 0.86], nose: [0.55, 0.84, 0.8], stringer: [0.72, 0.7, 0.66], fin: [0.15, 0.16, 0.2],
  logo: [0.85, 0.2, 0.25],
};
// A Pro member's board (task 16; src/styling.js): its deck and nose colours, over every board's own. null: as built.
let boardStyle = null;
export const setBoardStyle = (deck, nose) => { boardStyle = deck || nose ? { deck, nose } : null; };
// Which body is riding ('guy' | 'girl'; the player's pick, else the wave's): a few poses are the girl's own.
let bodyWhich = null;
export const setSurferBody = (w) => { bodyWhich = w; };
// Regular or goofy (the player's pick, else the wave's): which foot is forward. On a wave that peels the other way, the
// surfer rides backside (the chest away from the wave); the body is built from the toe side either way.
let stanceWhich = null;
export const setSurferStance = (st) => { stanceWhich = st === 'regular' || st === 'goofy' ? st : null; };
export const currentStanceOf = () => stanceWhich || WAVE.stance || 'goofy';
// The surfer's body is the skinned one (body.js), posed from the joints worked out here (pose.J); this file
// draws only the board. (The parts surfer, made of spheres and cylinders, was dropped 2026-11-18, the user's call.)
const THIGH = 0.46, SHIN = 0.46, UPPER = 0.3, FORE = 0.3;
const MAX_ROLL = 0.95; // furthest the board banks onto a rail (rad, ~55 deg)
const CHEST_OPEN = 0.45;
const NOSE_OPEN = 0.8, TEN_OPEN = 1.3; // (on the nose: hang five, hang ten)
const TWIST_WIND = 0.7; // bottom turn: shoulders wind round toward the lip (rad)
// Backside (backside-1..3 in braickish/reference-images; the user, 2026-11-26: the hips and shoulders turned to the face too
// much, too soon): through the bottom turn the chest stays open to the beach, the back to the wave, and the rail does the
// turning; the shoulders come round toward the face only as the nose comes up out of the turn, and less.
const TWIST_WIND_BACK = 0.3; // (rad, ~17 deg)
const TWIST_UNLOAD = 0.9; // snap: they spring open the other way (rad) // how far the chest turns from the wave toward the nose (rad)

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const add = (...vs) => vs.reduce((a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]);
const boardShape = () => BOARDS[WAVE.board] || BOARDS.fish;
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export function rotateAbout(a, k, ang) {
  const c = Math.cos(ang), s = Math.sin(ang), kd = v3.dot(k, a), kx = v3.cross(k, a);
  return [a[0] * c + kx[0] * s + k[0] * kd * (1 - c), a[1] * c + kx[1] * s + k[1] * kd * (1 - c), a[2] * c + kx[2] * s + k[2] * kd * (1 - c)];
}

// Two-bone IK: joint position for a chain root -> target, bending toward pole.
function ik(root, target, l1, l2, pole) {
  let d = v3.sub(target, root);
  let dist = v3.len(d);
  const maxD = (l1 + l2) * 0.999;
  if (dist > maxD) { d = v3.mul(d, maxD / dist); dist = maxD; target = add(root, d); }
  dist = Math.max(dist, Math.abs(l1 - l2) + 1e-3);
  const dir = v3.mul(d, 1 / dist);
  const a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const p = v3.norm(v3.rej(pole, dir));
  return { joint: add(root, v3.mul(dir, a), v3.mul(p, h)), end: target };
}

// A box stretched between two points.
function limb(a, b, w, d, ref, color) {
  const dir = v3.sub(b, a);
  const len = v3.len(dir) || 1e-3;
  const y = v3.mul(dir, 1 / len);
  const x = v3.norm(v3.rej(ref, y));
  const z = v3.cross(x, y);
  return { mesh: 'box', model: basis(x, y, z, w, len, d, lerp3(a, b, 0.5)), color };
}
// A rounded limb segment: a cylinder between two points (radius r, or rx/rz).
function cyl(a, b, rx, rz, ref, color) {
  const dir = v3.sub(b, a);
  const len = v3.len(dir) || 1e-3;
  const y = v3.mul(dir, 1 / len);
  const x = v3.norm(v3.rej(ref, y));
  const z = v3.cross(x, y);
  return { mesh: 'cyl', model: basis(x, y, z, rx * 2, len, rz * 2, lerp3(a, b, 0.5)), color };
}
function ball(p, r, color, x = [1, 0, 0], y = [0, 1, 0], z = [0, 0, 1], sy = 1) {
  return { mesh: 'sphere', model: basis(x, y, z, r * 2, r * 2 * sy, r * 2, p), color };
}

// The board: body, contrasting nose, stringer down the middle, fins under the
// tail. f = toward the nose, ub = deck up, Lb = across, bc = its center.
export function boardObjects(f, ub, Lb, bc) {
  const B = boardShape(), name = WAVE.board && BOARDS[WAVE.board] ? WAVE.board : 'fish';
  const objs = [];
  objs.push({ mesh: `board-${name}`, model: basis(f, ub, Lb, 1, 1, 1, bc), color: boardStyle?.deck || (B.colors ? B.colors.deck : COL.board) });
  objs.push({ mesh: `boardNose-${name}`, model: basis(f, ub, Lb, 1, 1, 1, bc), color: boardStyle?.nose || (B.colors ? B.colors.nose : COL.nose) });
  if (B.colors && B.colors.rail) objs.push({ mesh: `boardRail-${name}`, model: basis(f, ub, Lb, 1, 1, 1, bc), color: B.colors.rail });
  // (stringer in short pieces so it follows the rocker)
  const rk = (x) => B.rocker(x / B.half);
  const n = 8, sl = B.stringer[0] / n;
  for (let i = 0; i < n; i++) {
    const x = B.stringer[1] - B.stringer[0] / 2 + sl * (i + 0.5);
    const th = B.thick(x / B.half);
    objs.push({ mesh: 'box', model: basis(f, ub, Lb, sl * 1.02, th * 1.6, 0.012, add(bc, v3.mul(f, x), v3.mul(ub, rk(x)))), color: COL.stringer, outline: -0.018 }); // (no ink, fills out with the board up close)
  }
  for (const [along, acr, h, len] of B.fins) {
    const bottom = rk(along) - B.thick(along / B.half) * 0.8;
    objs.push({ mesh: 'box', model: basis(f, ub, Lb, len, h, 0.012, add(bc, v3.mul(f, along), v3.mul(Lb, acr), v3.mul(ub, bottom - h * 0.5))), color: COL.fin, outline: 0.008 });
  }
  {
    // Graphics: an oval logo up toward the nose and, on the shortboards, a dark traction pad on the tail.
    const deck = (x) => rk(x) + B.thick(x / B.half) * 0.97;
    const lx = B.half * 0.42;
    objs.push({ mesh: 'sphere', model: basis(f, ub, Lb, 0.2, 0.008, 0.085, add(bc, v3.mul(f, lx), v3.mul(ub, deck(lx)))), color: B.colors ? [0.97, 0.97, 0.94] : COL.logo, outline: 0, spec: 0.7 });
    if (!B.colors) {
      const px = -B.half * 0.8;
      objs.push({ mesh: 'box', model: basis(f, ub, Lb, 0.28, 0.01, B.width(px / B.half) * 1.6, add(bc, v3.mul(f, px), v3.mul(ub, deck(px)))), color: [0.16, 0.17, 0.2], outline: 0, spec: 0.05 });
    }
  }
  for (const o of objs) if (o.spec === undefined) o.spec = 0.7; // (a glassed board)
  return objs;
}

export function createPose() {
  return { knee: 0.3, lean: 0, roll: 0, boardUp: [0, 1, 0] };
}

// info: { n (surface normal or up), e2 (up the face), turn (signed turn rate,
// + = counterclockwise/left), pumping, crouch, input pump }
const sstepS = (a, b, x) => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u); };

export function surferObjects(pose, rider, info, dt) {
  // Gone under once the tumble's started (riding the lip over the falls you
  // stay in view the whole way down).
  pose.J = null; // (set below once the pose is worked out; stays null while the figure is hidden)
  if (rider.mode === 'wipe' && !rider.falls && !rider.stepOff && rider.wipeAge > 0.3) return [];
  if (rider.stepOff && rider.stepOff.time > 1.6) return []; // (stepped off: once you've dropped in, you and the board go from view, the user)
  const p = rider.pos;
  let f = rider.heading;
  const k = 1 - Math.exp(-dt * 12);
  // Vertical snap (vertical-snap-1..5, the user, 2026-11-25; rider.vSnap: time since it started): vsUp while the board
  // stands up over the lip and swings round (weight on the back foot, tail sunk in the lip, nose out over it), vsLand as
  // it comes back down (a hard compress).
  const vt = rider.mode === 'surf' && rider.vSnap != null ? rider.vSnap : -1;
  const vsUp = vt >= 0 ? sstepS(0, 0.08, vt) * (1 - sstepS(0.3, 0.45, vt)) : 0;
  const vsLand = vt >= 0 ? sstepS(0.35, 0.5, vt) * (1 - sstepS(0.7, 0.9, vt)) : 0;
  // ... and while it's up, the board and surfer stand up vertical (the user, 2026-11-25: up under the lip the crest rounds
  // over nearly flat, so following the water there laid the board on top of the wave, its whole deck to the sky). The
  // face's frame tips forward about the line along the wave until the face is vertical: the board stands straight up
  // with its deck out to sea, tail in the lip and nose over it, and swings round in that vertical plane.
  let n = info.n;
  if (vsUp > 0.001) {
    const ax = v3.norm(v3.cross([0, 1, 0], n)); // (horizontal, along the wave)
    const a = Math.asin(clamp(n[1], -1, 1)) * vsUp; // (how far from vertical the face is, eased in and out)
    const s1 = v3.norm(rotateAbout(n, ax, a)), s2 = v3.norm(rotateAbout(n, ax, -a));
    const sg = Math.abs(s1[1]) < Math.abs(s2[1]) ? 1 : -1; // (whichever way tips the normal down to level)
    n = sg > 0 ? s1 : s2;
    f = v3.norm(rotateAbout(f, ax, sg * a));
  }

  // Board orientation follows the surface, smoothed.
  for (let i = 0; i < 3; i++) pose.boardUp[i] += (n[i] - pose.boardUp[i]) * k;
  let u = v3.norm(v3.rej(pose.boardUp, f));
  // A longboard sits mostly level on a steep face, its wave-side rail cut into the wave, instead of
  // lying flat along the face (`faceTilt`: how much of the face's slope the board takes).
  const ft = boardShape().faceTilt;
  if (ft !== undefined && rider.mode === 'surf') u = v3.norm(v3.add(v3.mul(v3.norm(v3.rej([0, 1, 0], f)), 1 - ft), v3.mul(u, ft)));
  const L = v3.norm(v3.cross(u, f)); // rider's left
  // Stance (the player's, else WAVE.stance): goofy (right foot forward, the default) faces their left, regular (left foot forward)
  // their right. T is the toe side, where the chest faces: toward the wave riding frontside (goofy on a left,
  // regular on a right). The body is built from it (front / back foot, shoulder and arm), not flipped.
  const ss = currentStanceOf() === 'regular' ? -1 : 1;
  const T = v3.mul(L, ss);
  // Frontside (the chest to the wave: each wave's own stance) or backside (the player picked the other foot forward, so the
  // wave is on the heel side). `fs` points the moves that lead toward the wave (the bottom turn's wind-up) at it either way.
  const fs = currentStanceOf() === (WAVE.stance || 'goofy') ? 1 : -1;
  const W = v3.mul(T, fs); // (toward the wave, across the board)

  // Air phases (see the air pose below).
  const flying = rider.mode === 'air' && !rider.overTheBack;
  if (flying && !pose.airVy0) pose.airVy0 = Math.max(1, rider.vel[1]);
  if (!flying && pose.airVy0) { pose.airVy0 = 0; if (rider.mode === 'surf') pose.landAge = 0; }
  pose.landAge = (pose.landAge ?? 9) + dt;
  const sAir = flying ? rider.vel[1] / pose.airVy0 : 0;
  const aStretch = flying ? sstepS(0.4, 0.8, sAir) : 0;
  const aTuck = flying ? sstepS(0.75, 0.3, sAir) * (1 - sstepS(-0.1, -0.5, sAir)) : 0;
  const aReach = flying ? sstepS(-0.1, -0.5, sAir) : 0;
  const aLand = rider.mode === 'surf' ? 1 - sstepS(0.12, 0.5, pose.landAge) : 0;
  // Rail roll: in a hard turn the board banks onto its inside rail. Harder
  // and faster turns roll it further; holding a turn (leaning harder) more still.
  const speed0 = v3.len(rider.vel);
  // Banks hard even at low speed; a committed turn (held, or a bottom turn
  // started pointing down) always gets well up on the rail.
  const committed = Math.max(rider.hard || 0, rider.bottomCarve ? 1 : 0);
  const rh = rider.mode === 'surf' ? rider.crouchDepth || 0 : 0; // roundhouse depth
  // In the barrel (rider.js): bc builds from a compact crouch going in to the
  // full barrel stance deep in (`deep`, like the barrel-stance reference: back
  // knee down toward the deck, chest over the front thigh, hands low by the
  // knees, head up looking down the line); fl, really deep, a slight lean
  // onto the front foot.
  const bc = rider.mode === 'surf' ? rider.barrelCrouch || 0 : 0;
  const inB = clamp(bc / 0.3, 0, 1), deep = sstepS(0.3, 1, bc);
  const fl = rider.mode === 'surf' ? rider.frontLean || 0 : 0;
  const tt = rider.mode === 'surf' ? rider.tubeTight || 0 : 0; // (a small tube: tucked tighter still, rider.js)
  // Noseriding (rider.js): nr walks 0 (normal stance) -> 1 (on the nose).
  const nr = rider.mode === 'surf' ? rider.nose || 0 : 0;
  // Dropknee turn (the longboard's roundhouse): the back knee drops toward the deck.
  const dk = WAVE.dropknee ? rh : 0;
  // Walking the longboard (rider.js r.foot): tl 0 (middle) -> 1 (back on the tail); pv how much she's
  // pivoting on the fin (on the tail and up on the wave).
  const tl = rider.mode === 'surf' ? sstepS(0, 1, -(rider.foot || 0)) : 0;
  const pv = rider.mode === 'surf' ? sstepS(0, 1, rider.pivot || 0) : 0;
  const onNose = sstepS(0.6, 1, nr);
  // Hang ten (rider.js r.ten, 0 hang five -> 1 hang ten): the back foot steps up beside the front one.
  const ten = rider.mode === 'surf' ? sstepS(0, 1, rider.ten || 0) : 0;
  const girl = (bodyWhich || WAVE.surfer) === 'girl';
  // Faster, further over (the user, 2026-11-25): from ~15 mph up to ~27 mph the board goes higher on its rail and the
  // body lays over further, until in a fast bottom turn the inside hand is almost in the water.
  const fast = rider.mode === 'surf' ? sstepS(6.5, 12, speed0) * (1 - Math.min(1, 2 * (rider.barrelCrouch || 0))) : 0; // (not in the tube)
  const maxRoll = MAX_ROLL + 0.25 * fast;
  let rollT = rider.mode === 'surf'
    ? clamp(info.turn * 0.17 * clamp(speed0 / 5, 0.85, 1.4) * (1 + 0.35 * committed) * (1 + 0.3 * fast), -maxRoll, maxRoll)
    : 0;
  if (rider.mode === 'surf' && committed > 0.5 && Math.abs(info.turn) > 0.3) {
    rollT = Math.sign(rollT) * Math.max(Math.abs(rollT), ((rider.bottomCarve ? 0.85 : 0.7) + 0.3 * fast) * committed);
  }
  // Roundhouse: up on the rail more and more as it comes round (past the usual limit).
  if (rh > 0.01 && Math.abs(info.turn) > 0.2) rollT = Math.sign(rollT || info.turn) * Math.max(Math.abs(rollT), 0.7 + 0.5 * rh);
  rollT *= 1 - 0.55 * pv; // (pivoting on the fin, not up on the rail)
  rollT *= 1 - 0.5 * ten; // (hang ten: both feet on the nose, the board stays flatter)
  rollT *= boardShape().rollK ?? 1; // (a wide longboard barely goes up on its rail)
  pose.roll = (pose.roll || 0) + (rollT - (pose.roll || 0)) * (1 - Math.exp(-dt * (rider.bottomCarve ? 16 : 10)));
  // Tilt the board's up vector toward the inside of the turn (+ roll = left
  // rail down), so the inside rail digs in.
  let ub = v3.norm(rotateAbout(u, f, -pose.roll));
  let Lb = v3.norm(v3.cross(ub, f));
  // Pearling (noseriding out on the shoulder): the nose dips under.
  let bf = f;
  const dip0 = rider.mode === 'surf' ? 0.32 * (rider.noseRisk || 0) : 0;
  // Coming down from an air the nose drops toward the water (air-4/5 in the references), smoothed so it eases
  // back level through the landing.
  pose.airPitch = (pose.airPitch || 0) + (0.2 * aReach - (pose.airPitch || 0)) * (1 - Math.exp(-dt * 8));
  const dip = dip0 + pose.airPitch;
  if (dip > 0) { bf = v3.norm(rotateAbout(f, Lb, dip)); ub = v3.norm(rotateAbout(ub, Lb, dip)); } // (+: nose down, tail up)
  // Pivoting (pivot-turn.jpg in braickish/reference-images): her weight right back sinks the
  // tail into the water and the nose stands well up out of it; the board tips about a point just
  // ahead of the back foot, so the middle rises and the tail goes under.
  // (a little nose lift just standing on the tail; up to ~15 deg swinging round in a pivot away from the wave, ~10 deg
  // toward it. It was up to ~27 deg; 2026-11-18, the user: the board lifted too much, mostly in the away pivot.)
  const tipT = 0.08 * tl + 0.2 * pv * clamp(Math.abs(info.turn) / 2.5, 0, 1);
  pose.tip = (pose.tip || 0) + (tipT - (pose.tip || 0)) * (1 - Math.exp(-dt * 10));
  const tip = pose.tip;
  if (tip > 0) { bf = v3.norm(rotateAbout(bf, Lb, -tip)); ub = v3.norm(rotateAbout(ub, Lb, -tip)); }
  const tipUp = v3.mul(u, 0.75 * boardShape().half * Math.sin(tip));

  // --- pose drivers ---
  const speed = v3.len(rider.vel);
  const turnAmt = clamp(Math.abs(info.turn) / 3, 0, 1);
  const vUp = v3.dot(rider.vel, info.e2);
  let kneeT = 0.25 + 0.45 * turnAmt + 0.15 * clamp(vUp / 3, 0, 1) + 0.2 * (rider.hard || 0);
  if (info.pump) kneeT = vUp > 0.3 ? 0.75 : 0.05; // compress going up, extend driving down
  if (rider.crouch && !rider.tube) kneeT = 0.85;
  const tailStall = (rider.stallK || 0) * (1 - (rider.handDrag || 0)); // (by a steep face the stall is a hand in it, below, not sitting back)
  if (tailStall > 0.01) kneeT = Math.max(kneeT, 0.35 + 0.35 * tailStall); // (the stall: knees bent, sitting back on the tail)
  // The hand-drag stall (frontside-barrel-stall / backside-barrel-stall in braickish/reference-images, 2026-11-23): a deep
  // crouch, the torso fairly upright, head up down the line. Frontside (the wave on the toe side): the back hand out to the
  // side into the face about shin height, nearly straight; the front hand low by the front knee over the rail. Backside
  // (the wave behind you): a deeper squat, knees wide, hips low and the chest open; the back hand reaching behind, by the
  // tail, into the face; the front arm out forward at about shoulder height, down the line.
  const hd = rider.mode === 'surf' && rider.wallPt ? rider.handDrag || 0 : 0;
  const fsDrag = v3.dot(T, info.e2) >= 0 ? 1 : 0; // (frontside: the toe side facing up the face, toward the wave)
  const hdF = hd * fsDrag, hdB = hd * (1 - fsDrag);
  if (hd > 0.01) kneeT = Math.max(kneeT, 0.95 * hd);
  // In the tube: a compact, athletic crouch going in, right down deep in the barrel.
  if (bc > 0.01) kneeT = Math.max(kneeT, Math.min(1, inB * (0.42 + 0.58 * deep + 0.15 * tt)));
  if (nr > 0.01) kneeT = kneeT * (1 - nr) + 0.22 * nr; // standing tall and relaxed walking up and on the nose
  if (ten > 0.01) kneeT = kneeT * (1 - ten) + 0.18 * ten; // (hang ten: tall, knees soft)
  // A longboarder stands more upright than on a shortboard (the user, 2026-11-18), unless all the way back on the tail.
  const upr = WAVE.noseride && rider.mode === 'surf' ? 1 - sstepS(0.5, 1, tl) : 0;
  kneeT *= 1 - 0.4 * upr;
  if (rider.mode === 'air') kneeT = 0.7;
  // Airs (air-1..air-7.jpg in braickish/reference-images, 2026-11-18): a pose sequence through the flight, timed by
  // the vertical speed (s = 1 leaving the lip, 0 at the top, below 0 coming down), so short and big airs both play
  // it through. Stretch: tall off the lip, legs extended. Tuck: knees up, folded over them at the top. Reach: coming
  // down, the hips sit back and the front leg reaches for the dropping nose. Absorb: a quick deep crouch on landing.
  if (flying) {
    kneeT = 0.6;
    kneeT += (1 - kneeT) * aTuck;
    kneeT += (0.75 - kneeT) * aReach;
    kneeT += (0.22 - kneeT) * aStretch;
  }
  if (aLand > 0.01) kneeT += (0.95 - kneeT) * aLand;
  if (vsUp > 0.01) kneeT = Math.max(kneeT, 0.6 * vsUp); // (low, weight on the back foot: vertical-snap-3)
  // (backside bottom turn: sunk down low on the heels, so the front hand reaches the water: backside-2; the wind-up as of
  // the last frame, set below)
  if (fs < 0 && rider.mode === 'surf' && (pose.windup || 0) > 0.01) kneeT = Math.max(kneeT, 0.9 * pose.windup * (1 - 0.6 * sstepS(0.35, 0.9, Math.sin(rider.phi || 0))));
  if (vsLand > 0.01) kneeT = Math.max(kneeT, 0.9 * vsLand); // (compressed coming back down: vertical-snap-5)
  // Going over the falls (off the board): curled up in a ball, knees to chest.
  const tuck = rider.falls ? clamp(rider.falls.time / 0.3, 0, 1) : 0;
  if (tuck > 0) kneeT = 1;
  // Roundhouse: lower and lower as it comes round, right down at full depth.
  if (rh > 0.01) kneeT = Math.max(kneeT, 0.45 + 0.65 * rh);
  if (tl > 0.01) kneeT = kneeT * (1 - 0.6 * tl) + 0.3 * 0.6 * tl; // (on the tail: fairly upright, knees softly bent)
  // Stepping off at the closeout (closeout-exit-1..4): standing tall, knees nearly straight.
  const so = rider.stepOff ? rider.stepOff.time : -1;
  if (so >= 0) kneeT = 0.1;
  pose.knee += (clamp(kneeT, 0, 1) - pose.knee) * (1 - Math.exp(-dt * (flying || aLand > 0.01 ? 16 : 9))); // (quicker through an air and its landing)
  const maxLean = 0.85 + 0.35 * fast; // (~49 deg, up to ~69 deg fast)
  let leanT = clamp(info.turn * 0.2 * clamp(speed / 4, 0.8, 1.25) * (1 + 0.3 * committed) * (1 + 0.45 * fast), -maxLean, maxLean); // + = toward L (the rider's left, whatever the stance)
  if (committed > 0.5 && Math.abs(info.turn) > 0.3) leanT = Math.sign(leanT) * Math.max(Math.abs(leanT), ((rider.bottomCarve ? 0.65 : 0.5) + (rider.bottomCarve ? 0.5 : 0.3) * fast) * committed);
  if (rh > 0.01 && Math.abs(info.turn) > 0.3) leanT = Math.sign(leanT) * Math.max(Math.abs(leanT), 0.5 + 0.35 * rh); // deeper into the roundhouse
  leanT *= 1 - 0.5 * pv; // (pivoting: standing over the tail, not laid over on a rail)
  leanT *= 1 - 0.6 * ten; // (hang ten: feet side by side, she stays upright over them rather than leaning out)
  if (so >= 0) leanT = 0;
  pose.lean += (leanT - pose.lean) * (1 - Math.exp(-dt * 8));
  const knee = pose.knee, lean = pose.lean;
  const reach = clamp((Math.abs(lean) - 0.25) / 0.35, 0, 1);

  // --- skeleton ---
  // Up on a rail the board sits a little higher, so it cuts in rather than sinks.
  const railLift = 0.12 * Math.abs(Math.sin(pose.roll));
  const B = add(p, v3.mul(u, 0.06 + railLift), tipUp); // top of the board
  // Body axis: between board-normal and world-up, leaned into the turn.
  const up0 = so >= 0 ? [0, 1, 0] : v3.norm(add(v3.mul(u, 0.5), [0, 0.5, 0])); // (stepping off: upright)
  const bodyUp = v3.norm(rotateAbout(up0, f, -lean));
  // Facing: toward the wave (toe side), opened up toward the nose a bit, so
  // the surfer looks where they're going.
  // Wind-up and release. A bottom turn winds the shoulders round toward the
  // lip with the front shoulder and arm dropped across the body; a snap
  // springs it all open the other way and throws both arms back over.
  const lowOnFace = rider.mode === 'surf' && rider.height < 0.4;
  const windT = rider.mode === 'surf' && !(rider.unload > 0) && rider.carvingUp && (rider.bottomCarve || lowOnFace) ? 1 : 0;
  pose.windup = (pose.windup || 0) + (windT - (pose.windup || 0)) * (1 - Math.exp(-dt * 9));
  const unloadT = rider.unload > 0 ? 1 : 0;
  pose.unload = (pose.unload || 0) + (unloadT - (pose.unload || 0)) * (1 - Math.exp(-dt * (unloadT ? 22 : 6)));
  const windup = pose.windup, unload = pose.unload;
  // (backside: the wind-up comes in only as the nose comes up the face out of the turn, `bsLate`)
  const bsLate = fs < 0 && rider.mode === 'surf' ? sstepS(0.35, 0.9, Math.sin(rider.phi || 0)) : 1;
  const wind = fs > 0 ? TWIST_WIND * windup : TWIST_WIND_BACK * windup * bsLate;
  const twist = (wind - TWIST_UNLOAD * unload) * ss * fs; // + = front shoulder round toward the toe side (toward the wave: backside, the heel side)
  // On the longboard's nose the hips and chest turn further toward the nose (2026-11-18, the user: so stepping into
  // a hang ten and back is a short move), and in the hang ten she faces the nose nearly square.
  const open = CHEST_OPEN + (NOSE_OPEN - CHEST_OPEN) * onNose + (TEN_OPEN - NOSE_OPEN) * ten;
  // (backside: the toe side taken across the leaned body first, so sitting back on the heels in a bottom turn doesn't swing
  // the chest round toward the nose: it stays open to the beach, backside-1 and -2)
  const Tc = fs < 0 ? v3.norm(v3.rej(T, bodyUp)) : T;
  const chest0 = v3.norm(v3.rej(v3.add(v3.mul(Tc, Math.cos(open)), v3.mul(f, Math.sin(open))), bodyUp));
  const chest = v3.norm(rotateAbout(chest0, bodyUp, twist));
  const across = v3.mul(v3.norm(v3.cross(chest, bodyUp)), ss); // shoulder line, roughly toward the nose (front shoulder)

  // Stance toward the tail: back foot just ahead of the fin, front foot about
  // the middle of the board.
  const STANCE = boardShape().stance; // back and front foot along the board (m from its middle)
  const bs = boardShape(); // (feet sit on the deck, which rises with the rocker)
  // Walking to the nose: the feet shuffle up the board one after the other
  // (back foot first), each lifting as it steps, to the hang-five stance.
  let st = dk > 0.01 ? [STANCE[0] + 0.22 * dk, STANCE[1]] : STANCE, lift = [0, 0]; // (dropknee: the back foot comes up behind the front)
  // Walking back to the tail, stepping like the walk to the nose: the front foot cross-steps back past the
  // back foot first, then the back foot steps back onto the tail, each lifting as it steps (the other way
  // round walking back up). (Back foot first put her in the splits.)
  const wt = rider.mode === 'surf' ? Math.max(0, -(rider.foot || 0)) : 0;
  if (wt > 0.001 && bs.tailStance) {
    const TS = bs.tailStance, a = sstepS(0.4, 1, wt), b = sstepS(0, 0.55, wt);
    st = [st[0] + (TS[0] - st[0]) * a, st[1] + (TS[1] - st[1]) * b];
    lift = [0.12 * Math.sin(Math.PI * Math.max(0, Math.min(1, (wt - 0.4) / 0.6))), 0.12 * Math.sin(Math.PI * Math.min(1, wt / 0.55)) * (wt < 0.55 ? 1 : 0)];
  }
  if (nr > 0.001 && bs.noseStance) {
    const NS = bs.noseStance, a = sstepS(0, 0.55, nr), b = sstepS(0.4, 1, nr);
    st = [STANCE[0] + (NS[0] - STANCE[0]) * a, STANCE[1] + (NS[1] - STANCE[1]) * b];
    lift = [0.12 * Math.sin(Math.PI * Math.min(1, nr / 0.55)) * (nr < 0.55 ? 1 : 0), 0.12 * Math.sin(Math.PI * Math.max(0, Math.min(1, (nr - 0.4) / 0.6)))];
  }
  // Hang ten (hang-ten-position.jpg): the back foot steps up (lifting as it goes) to beside the front foot, which
  // eases a little forward, both toes over the nose, feet side by side across the board (`side`, below).
  let side = 0;
  if (ten > 0.001 && bs.tenStance) {
    const TT = bs.tenStance;
    st = [st[0] + (TT[0] - st[0]) * ten, st[1] + (TT[1] - st[1]) * sstepS(0.5, 1, ten)];
    lift[0] += 0.1 * Math.sin(Math.PI * ten);
    side = bs.tenSide * ten;
  }
  // Shortboard feet (rider.shuf, rider.js): a subtle shuffle, both feet sliding along the board in two little
  // steps (the leading foot lifts first, then the other), 15 cm between spots: back 10 cm behind the board's
  // stance, the middle 5 cm ahead of it, forward 20 cm ahead (2026-11-18, the user: middle +5, forward +10 cm).
  // Where you stand doesn't change the riding (rider.js keeps its back / middle / forward effects).
  // Each foot steps on its own (2026-11-18, the user: it should look like a real shuffle): toward the new spot the
  // leading foot (going back the back foot, going forward the front foot) lifts ~6 cm, moves and lands, then the
  // other foot does the same. pose.shuf = [back foot, front foot] in spots (-1 back, 0 middle, 1 forward).
  if (WAVE.shuffle && !WAVE.noseride && rider.mode === 'surf') {
    const goal = rider.shufGoal ?? 0, ps = pose.shuf ||= [goal, goal];
    const STEP = 0.13; // (s for one foot's step)
    const lead = goal < ps[0] || goal < ps[1] ? 0 : 1, trail = 1 - lead; // (going back the back foot leads)
    const go = (i) => { ps[i] += Math.sign(goal - ps[i]) * Math.min(Math.abs(goal - ps[i]), dt / STEP); };
    if (ps[lead] !== goal) go(lead);
    else go(trail);
    const at = (x) => 0.05 + 0.15 * x; // (m along the board from the stance: back -10, middle +5, forward +20 cm)
    st = [st[0] + at(ps[0]), st[1] + at(ps[1])];
    lift = [lift[0] + 0.06 * Math.sin(Math.PI * (ps[0] - Math.floor(ps[0]))), lift[1] + 0.06 * Math.sin(Math.PI * (ps[1] - Math.floor(ps[1])))];
  } else if (pose.shuf) pose.shuf = null;
  // (along the board as drawn: when the nose dips the feet go down with it)
  const du = dip > 0 || tip > 0 ? v3.norm(rotateAbout(u, Lb, dip - tip)) : u;
  // (side by side in a hang ten: the front foot on the side of its own hip facing the nose, -T, the back foot +T)
  const Tb = v3.mul(Lb, ss);
  let backFoot = add(B, v3.mul(bf, st[0]), v3.mul(du, bs.rocker(st[0] / bs.half) + lift[0]), v3.mul(Tb, side));
  let frontFoot = add(B, v3.mul(bf, st[1]), v3.mul(du, bs.rocker(st[1] / bs.half) + lift[1]), v3.mul(Tb, -side));
  const mid = (st[0] + st[1]) / 2;
  // Hips drop and slide back over the heels as the knees bend.
  // (deep in the barrel the hips sink further, and leaning onto the front foot moves them forward)
  const hipH = (0.92 - 0.44 * knee - 0.1 * deep - 0.08 * tt - 0.12 * dk - 0.15 * hdB) * (1 - 0.4 * tuck) * (1 - 0.22 * aTuck); // (an air's tuck: knees up toward the chest; a backside hand-drag stall squats lower)
  const hip = add(B, v3.mul(bf, mid + 0.1 * fl - 0.08 * aReach - 0.12 * tailStall), v3.mul(bodyUp, hipH), v3.mul(chest, -0.12 * knee)); // (an air's reach: hips back over the tail, the front leg straightens)
  const hipAx = ten > 0.001 ? v3.norm(lerp3(f, v3.mul(T, -1), ten)) : f; // (hips square to the nose in a hang ten)
  const hipBack = add(hip, v3.mul(hipAx, -0.12)), hipFront = add(hip, v3.mul(hipAx, 0.12));
  // (deep in the barrel the back knee drops in toward the deck, pointing at the front foot)
  const kd = Math.max(deep, dk); // (barrel stance or dropknee: the back knee drops toward the deck)
  const kneePole = (s) => add(chest, v3.mul(f, 0.15 * s + (s < 0 ? 0.55 * kd : 0)), v3.mul(bodyUp, 0.2 - (s < 0 ? 0.35 * kd : 0)));
  if (tuck > 0) {
    // feet pulled in under the hips, in front, heels to the backside
    const tf = (sgn) => add(hip, v3.mul(bodyUp, -0.18), v3.mul(chest, 0.22), v3.mul(f, 0.1 * sgn));
    backFoot = lerp3(backFoot, tf(-1), tuck);
    frontFoot = lerp3(frontFoot, tf(1), tuck);
  }
  if (so >= 0) {
    // Stepping off: the front foot lifts as you stand tall, then both feet come together under the hips for the drop,
    // feet first (the references: legs straight down, together).
    frontFoot = add(frontFoot, v3.mul(bodyUp, 0.22 * sstepS(0.04, 0.22, so)), v3.mul(f, 0.15 * sstepS(0.04, 0.22, so)));
    const k = sstepS(0.22, 0.5, so);
    const tf = (sgn) => add(hip, v3.mul(bodyUp, -0.86), v3.mul(f, 0.06 * sgn));
    backFoot = lerp3(backFoot, tf(-1), k);
    frontFoot = lerp3(frontFoot, tf(1), k);
  }
  const legB = ik(hipBack, backFoot, THIGH, SHIN, kneePole(-1));
  const legF = ik(hipFront, frontFoot, THIGH, SHIN, kneePole(1));

  // Torso leans forward (toward the chest side) as you crouch.
  const torsoDir0 = v3.norm(add(bodyUp, v3.mul(chest, (0.1 + 0.6 * knee) * (1 - 0.45 * upr) + 0.35 * inB + 0.45 * deep + 0.2 * tt), v3.mul(f, 0.1 * deep + 0.22 * fl))); // leaning into the tube (and onto the front foot)
  const torsoDir1 = v3.norm(add(lerp3(torsoDir0, v3.norm(add(v3.mul(bodyUp, 0.45), chest)), 0.65 * aTuck), v3.mul(f, -0.15 * aReach))); // (an air: folded over the knees at the top, upright and back over the tail coming down)
  const torsoDir2 = v3.norm(lerp3(torsoDir1, v3.norm(add(v3.mul(bodyUp, 0.45), chest)), tuck)); // (folded over the knees in a tuck)
  const torsoDir = hd > 0.01 ? v3.norm(lerp3(torsoDir2, v3.norm(add(bodyUp, v3.mul(chest, 0.95 * hdF - 0.12 * hdB), v3.mul(f, -0.12 * hdB))), 0.85 * hd)) : torsoDir2; // (a hand-drag stall: frontside leaning out over the toe rail toward the wave, backside upright and open, back toward the tail)
  const neck = add(hip, v3.mul(torsoDir, 0.58));
  const headDir = v3.norm(lerp3(torsoDir, bodyUp, 0.5 * deep)); // head up, looking down the line, in the barrel stance
  const head = add(neck, v3.mul(headDir, 0.2), v3.mul(chest, 0.03), v3.mul(across, 0.03));
  // Round parts (hips, chest, head, hair, hands) are spheres stretched on the axes across / along the torso /
  // toward the chest. Leaning the torso forward tips those last two toward each other and shears the spheres
  // flat. Ordinary riding leans up to ~0.57 (dot of torso and chest); the deep barrel stance leaned further and
  // squashed the chest and head, so the shear is capped there (SHEAR_MAX) and riding looks exactly as before.
  // The head tips up off the torso in the barrel stance (headDir): the head, hair and neck follow it (they used
  // to follow the torso, so the head lifted off the end of the neck, which showed as a skinny strip).
  const SHEAR_MAX = 0.6;
  const capShear = (up, max = SHEAR_MAX) => {
    const c = v3.dot(chest, up), cc = Math.min(c, max);
    if (c <= cc) return chest;
    const ortho = v3.norm(v3.rej(chest, up));
    return v3.norm(add(v3.mul(ortho, Math.sqrt(1 - cc * cc)), v3.mul(up, cc)));
  };
  const tChest = capShear(torsoDir), hUp = headDir, hChest = capShear(headDir, SHEAR_MAX * (1 - deep)), hAcross = across; // (the head squares up as the barrel stance builds: upright, looking down the line)
  const neckTop = add(neck, v3.mul(headDir, 0.1)); // (up into the head, whichever way it's tipped)
  // Front shoulder drops into a bottom turn; both lift as you spring open.
  const shW = girl ? 0.16 : 0.19; // (narrower shoulders for the girl)
  const shBack = add(neck, v3.mul(across, -shW), v3.mul(torsoDir, -0.04 + 0.05 * windup + 0.03 * unload));
  const shFront = add(neck, v3.mul(across, shW), v3.mul(torsoDir, -0.04 - 0.1 * windup + 0.03 * unload));

  // Hands: out for balance by default; in a big turn the inside hand drags
  // toward the water and the other rises.
  // Relaxed default (like the reference photo): front arm bent forward at
  // chest height, back arm low and behind, reaching toward the water.
  let handBack = add(shBack, v3.mul(across, -0.36), v3.mul(bodyUp, -0.48), v3.mul(chest, 0.14));
  let handFront = add(shFront, v3.mul(across, 0.26), v3.mul(bodyUp, -0.08), v3.mul(chest, 0.34));
  const handBack0 = handBack, handFront0 = handFront; // (the usual spots, relative to the shoulders: a backside bottom turn keeps them)
  // Longboard, standing in the middle (stance for longboard.jpg in braickish/reference-images, 2026-11-18): relaxed
  // and upright, the front arm hanging nearly straight down by her side, the back arm bent at the elbow with the
  // hand out a little to the side at about hip height. Turns still move the arms from here (below); walking to the
  // nose or the tail blends into those poses.
  const lbMid = WAVE.noseride && rider.mode === 'surf' ? (1 - Math.min(1, nr * 1.5)) * (1 - tl) : 0;
  if (lbMid > 0.01) {
    handFront = lerp3(handFront, add(shFront, v3.mul(bodyUp, -0.56), v3.mul(chest, 0.06), v3.mul(across, 0.03)), lbMid);
    handBack = lerp3(handBack, add(shBack, v3.mul(across, -0.3), v3.mul(bodyUp, -0.36), v3.mul(chest, 0.14)), lbMid);
  }
  // Barrel stance: both hands low in front, by the knees.
  if (deep > 0.01) {
    handFront = lerp3(handFront, add(legF.joint, v3.mul(chest, 0.2), v3.mul(f, 0.1), v3.mul(bodyUp, -0.04)), 0.85 * deep);
    handBack = lerp3(handBack, add(lerp3(legB.joint, legF.joint, 0.45), v3.mul(chest, 0.24), v3.mul(bodyUp, 0.04)), 0.85 * deep);
  }
  if (lean * ss > 0) {
    // Turning toward the chest side (frontside bottom turn): back hand trails on the face.
    handBack = lerp3(handBack, add(B, v3.mul(f, mid - 0.1), v3.mul(T, 0.6), v3.mul(u, 0.08)), reach);
    handFront = lerp3(handFront, add(shFront, v3.mul(f, 0.35), v3.mul(bodyUp, 0.25), v3.mul(chest, -0.1)), reach);
  } else {
    // Turning toward the heel side: front hand reaches down behind.
    handFront = lerp3(handFront, add(B, v3.mul(f, mid + 0.2), v3.mul(T, -0.6), v3.mul(u, 0.08)), reach);
    handBack = lerp3(handBack, add(shBack, v3.mul(f, -0.35), v3.mul(bodyUp, 0.25), v3.mul(chest, 0.1)), reach);
  }
  // Bottom turn: front arm low and across the body toward the inside of the
  // turn (the wave side), leading the turn; back arm low behind. (Frontside; backside keeps the hands put, below.)
  if (windup > 0.01 && fs > 0) {
    handFront = lerp3(handFront, add(B, v3.mul(f, mid + 0.3), v3.mul(W, 0.42), v3.mul(u, 0.32 + 0.3 * (1 - knee))), windup);
    handBack = lerp3(handBack, add(B, v3.mul(f, mid - 0.45), v3.mul(W, 0.25), v3.mul(u, 0.35)), windup * 0.8);
  }
  // Fast and laid right over (the user, 2026-11-25): the inside hand reaches down until it's almost touching the water,
  // just outside the inside rail (on the water's surface, `info.n`, a few cm above it).
  pose.skim = (pose.skim || 0) + (fast * reach * sstepS(0.3, 0.8, committed) - (pose.skim || 0)) * (1 - Math.exp(-dt * 6)); // (eased: the bottom-turn flag flips at once)
  const skim = pose.skim;
  if (skim > 0.01) {
    const inside = v3.norm(v3.rej(v3.mul(L, Math.sign(lean) || 1), info.n)); // (+ lean = toward L)
    const water = add(p, v3.mul(inside, 0.55), v3.mul(info.n, 0.06));
    if (lean * ss > 0) handBack = lerp3(handBack, add(water, v3.mul(f, mid - 0.15)), 0.9 * skim);
    else handFront = lerp3(handFront, add(water, v3.mul(f, mid + 0.15)), 0.9 * skim);
  }
  // Backside bottom turn (the user, 2026-11-26): both hands stay in their usual spots relative to the shoulders, no reach
  // for the water, no swing back toward the heels; the chest stays open and the knees bend (above). (Not in the barrel.)
  if (fs < 0 && windup > 0.01) {
    const w = windup * (1 - deep);
    handBack = lerp3(handBack, handBack0, w); handFront = lerp3(handFront, handFront0, w);
  }
  // Snap: like a spring unloading, both arms swing across the body (at about
  // chest height) toward the tail and the open side, turning the shoulders,
  // and with them the board.
  if (unload > 0.01) {
    handFront = lerp3(handFront, add(neck, v3.mul(across, -0.12), v3.mul(chest, 0.32), v3.mul(bodyUp, -0.12)), unload);
    handBack = lerp3(handBack, add(shBack, v3.mul(across, -0.38), v3.mul(chest, -0.12), v3.mul(bodyUp, -0.1)), unload);
  }
  // Vertical snap: the back arm thrown high overhead as the shoulders lead round (vertical-snap-2..4).
  if (vsUp > 0.01) handBack = lerp3(handBack, add(shBack, v3.mul(bodyUp, 0.6), v3.mul(across, -0.15), v3.mul(chest, -0.05)), 0.9 * vsUp);
  // Arms swing a little with the pump.
  if (info.pump) {
    const swing = vUp > 0.3 ? -0.12 : 0.12;
    handBack = add(handBack, v3.mul(bodyUp, swing));
    handFront = add(handFront, v3.mul(bodyUp, swing));
  }
  // On the nose (after the turning poses, so it wins; nose-ride-position.jpg, 2026-11-18): the front arm reaching
  // low and forward toward the nose, the back arm raised high behind her, bent, the hand above her head.
  if (nr > 0.01) {
    const w = Math.max(onNose, 0.5 * Math.sin(Math.PI * nr));
    handBack = lerp3(handBack, add(shBack, v3.mul(across, -0.24), v3.mul(bodyUp, 0.4), v3.mul(chest, -0.06)), w);
    handFront = lerp3(handFront, add(shFront, v3.mul(across, 0.26), v3.mul(bodyUp, -0.48), v3.mul(chest, 0.16)), w);
  }
  // Hang ten (hang-ten-position.jpg): arms out wide to the sides for balance, elbows soft, the front hand a little
  // lower and forward, the back hand about shoulder height.
  if (ten > 0.01) {
    handFront = lerp3(handFront, add(shFront, v3.mul(across, 0.46), v3.mul(bodyUp, -0.22), v3.mul(chest, 0.12)), ten);
    handBack = lerp3(handBack, add(shBack, v3.mul(across, -0.44), v3.mul(bodyUp, -0.02), v3.mul(chest, 0.06)), ten);
  }
  // Walking the board (walking-position.jpg, 2026-11-18): while she steps up or back, upright, the front arm reaching
  // forward and down, the back arm bent with the elbow back and the hand up by her chest.
  if (WAVE.noseride && rider.mode === 'surf') {
    const walkingNow = Math.abs((rider.foot || 0) - (rider.footGoal || 0)) > 1e-3 ? 1 : 0;
    pose.walkW = (pose.walkW || 0) + (walkingNow - (pose.walkW || 0)) * (1 - Math.exp(-dt / 0.12));
    const w = pose.walkW;
    if (w > 0.01) {
      handFront = lerp3(handFront, add(shFront, v3.mul(across, 0.32), v3.mul(bodyUp, -0.42), v3.mul(chest, 0.12)), w);
      handBack = lerp3(handBack, add(shBack, v3.mul(across, -0.12), v3.mul(bodyUp, -0.12), v3.mul(chest, 0.1)), w);
    }
  } else pose.walkW = 0;
  // Pivoting on the tail: arms out for balance, the front one reaching forward and low, the back one out behind.
  if (tl > 0.01) {
    const w = Math.max(0.5 * tl, 0.85 * pv);
    handBack = lerp3(handBack, add(shBack, v3.mul(across, -0.45), v3.mul(bodyUp, -0.05), v3.mul(chest, 0.15)), w);
    handFront = lerp3(handFront, add(shFront, v3.mul(across, 0.5), v3.mul(bodyUp, -0.12), v3.mul(chest, 0.2)), w);
  }
  // Airs (the references): stretching off the lip the back arm goes up high and the front arm out low; tucked at the
  // top the front arm reaches out toward the nose and the back hand drops to the rail by the knees; coming down both
  // arms go out wide, the back one high; landing, crouched, the back arm up and the front one forward.
  if (flying || aLand > 0.01) {
    const at = (sh, a, u, c) => add(sh, v3.mul(across, a), v3.mul(bodyUp, u), v3.mul(chest, c));
    handBack = lerp3(handBack, at(shBack, -0.3, 0.45, -0.1), aReach);
    handFront = lerp3(handFront, at(shFront, 0.5, 0.05, 0.1), aReach);
    handBack = lerp3(handBack, add(lerp3(legB.joint, backFoot, 0.5), v3.mul(chest, 0.12)), aTuck);
    handFront = lerp3(handFront, at(shFront, 0.55, 0.08, 0.1), aTuck);
    handBack = lerp3(handBack, at(shBack, -0.38, 0.42, -0.08), aStretch);
    handFront = lerp3(handFront, at(shFront, 0.3, -0.4, 0.2), aStretch);
    handBack = lerp3(handBack, at(shBack, -0.25, 0.4, 0), aLand);
    handFront = lerp3(handFront, at(shFront, 0.35, -0.2, 0.3), aLand);
  }
  if (tuck > 0) {
    // arms wrapped round the shins
    handBack = lerp3(handBack, add(lerp3(legB.joint, backFoot, 0.4), v3.mul(chest, 0.08)), tuck);
    handFront = lerp3(handFront, add(lerp3(legF.joint, frontFoot, 0.4), v3.mul(chest, 0.08)), tuck);
  }
  // The hand-drag stall (see the drivers above; last, so it wins over the other arm poses: the feet are on the back spot, the
  // tail pivot's arms-out would take it otherwise): the back hand into the face, fingers just in the water at rider.wallPt
  // (frontside out to the side about shin height, backside behind by the tail); the front hand low by the front knee over the
  // rail (frontside), or out forward at shoulder height down the line (backside).
  // (the touch placed off the board, where the water is whatever the face: the board lies on the face, so just off its rail
  // at deck level is the face; frontside beside the back foot on the toe side, backside behind the tail on the heel side;
  // pose.handTouch: where it cuts the water, for the white there, main.js)
  pose.handTouch = null;
  if (hd > 0.01) {
    // (the water nearest the back shoulder: the shoulder dropped onto the face, the deck's plane; on a steep face that's beside
    // you on the wave side, about an arm's length away, as in the photos; a little behind, more so backside, by the tail)
    const off = v3.dot(v3.sub(shBack, B), du), onFace = v3.sub(shBack, v3.mul(du, off + 0.02));
    const touch = add(onFace, v3.mul(bf, -(0.12 * hdF + 0.3 * hdB) / Math.max(hd, 1e-3)));
    pose.handTouch = touch;
    handBack = lerp3(handBack, touch, hd);
    if (hdF > 0.01) handFront = lerp3(handFront, add(legF.joint, v3.mul(chest, 0.12), v3.mul(T, 0.12), v3.mul(f, 0.06), v3.mul(bodyUp, -0.06)), hdF);
    if (hdB > 0.01) handFront = lerp3(handFront, add(shFront, v3.mul(f, 0.55), v3.mul(T, 0.12), v3.mul(bodyUp, -0.04)), hdB);
  }
  // Smooth the hands (2026-11-18, the user: the arms moved jerkily): the poses above switch between hand spots
  // quickly (turn direction, wind-up, snap, barrel stance), so each hand eases toward its spot with a ~0.07 s time
  // constant, measured from its shoulder in the body's frame (so riding fast doesn't make it lag). Tumbling and
  // tucked over the falls they follow at once.
  {
    const lf = v3.cross(bodyUp, chest), loc = (p, sh) => { const d = v3.sub(p, sh); return [v3.dot(d, lf), v3.dot(d, bodyUp), v3.dot(d, chest)]; };
    const world = (l, sh) => add(sh, v3.mul(lf, l[0]), v3.mul(bodyUp, l[1]), v3.mul(chest, l[2]));
    const tb = loc(handBack, shBack), tf = loc(handFront, shFront);
    const snapNow = rider.mode !== 'surf' && rider.mode !== 'air' || tuck > 0 || !pose.hands;
    const kH = snapNow ? 1 : 1 - Math.exp(-dt / 0.07);
    if (snapNow) pose.hands = { b: tb, f: tf };
    for (let i = 0; i < 3; i++) { pose.hands.b[i] += (tb[i] - pose.hands.b[i]) * kH; pose.hands.f[i] += (tf[i] - pose.hands.f[i]) * kH; }
    handBack = world(pose.hands.b, shBack); handFront = world(pose.hands.f, shFront);
  }
  const elbowPole = add(v3.mul(bodyUp, -0.6), v3.mul(chest, -0.2), v3.mul(across, 0.2));
  // (a hand-drag stall: the back shoulder drops and reaches toward the touch, up to 0.35 m, so the hand meets the water)
  let shBackArm = shBack;
  if (hd > 0.01 && pose.handTouch) { const toT = v3.sub(pose.handTouch, shBack), dT = v3.len(toT); if (dT > 0.57) shBackArm = add(shBack, v3.mul(toT, Math.min(0.35, dT - 0.57) * hd / dT)); }
  const armB = ik(shBackArm, handBack, UPPER, FORE, elbowPole);
  const armF = ik(shFront, handFront, UPPER, FORE, elbowPole);
  // (the skinned body's elbows, body.js: each points back, out to its own side and a little down. The shared
  // elbowPole above points mostly down, so an arm hanging down lined up with it and its elbow flipped about.)
  const elbowOut = (s) => v3.norm(add(v3.mul(across, 0.55 * s), v3.mul(chest, -0.6), v3.mul(bodyUp, -0.25)));

  // The joints, for the skinned body (body.js), which is posed from them.
  pose.J = { ss, ten, bodyUp, torsoDir, chest, hip, headDir, hChest, ub, f, T,
    legF: { root: hipFront, ...legF }, legB: { root: hipBack, ...legB }, frontFoot, backFoot,
    armF, armB, shFront, shBack: shBackArm, poleF: elbowOut(1), poleB: elbowOut(-1), dt, tumble: null,
    lookDown: WAVE.noseride && rider.mode === 'surf' ? 0.55 : 0 }; // (the longboarder watches her feet and the nose: the references)

  // --- meshes ---
  const objs = [];
  // Board (banked onto its rail). Going over the falls you've come off it:
  // it's drawn on its own where the wave has taken it (rider.fallsBoard).
  if (!rider.falls && !rider.stepOff) objs.push(...boardObjects(bf, ub, Lb, add(p, v3.mul(u, 0.04 + railLift), tipUp)));
  if (rider.mode === 'wipe' && !rider.stepOff) {
    // Tumble the whole figure (curled up going over the falls: round its middle).
    const spin = rider.falls ? rider.falls.time * 6 : rider.wipeAge * 12; // slower going over the falls
    const axis = v3.norm(L);
    const c = rider.falls ? add(hip, v3.mul(torsoDir, 0.12), v3.mul(chest, 0.1)) : p;
    pose.J.tumble = { axis, spin, c };
    for (const o of objs) {
      const m = o.model;
      for (let col = 0; col < 3; col++) {
        const v = rotateAbout([m[col * 4], m[col * 4 + 1], m[col * 4 + 2]], axis, spin);
        m[col * 4] = v[0]; m[col * 4 + 1] = v[1]; m[col * 4 + 2] = v[2];
      }
      const t = rotateAbout([m[12] - c[0], m[13] - c[1], m[14] - c[2]], axis, spin);
      m[12] = c[0] + t[0]; m[13] = c[1] + t[1]; m[14] = c[2] + t[2];
    }
  }
  // The board you came off, on its own in the water.
  const fb = rider.fallsBoard;
  if ((rider.falls || rider.stepOff) && fb) {
    const fr = frameAt(fb.xs, fb.t);
    const bf0 = v3.norm(add(v3.mul(fr.e1, Math.cos(fb.yaw)), v3.mul(fr.e2, Math.sin(fb.yaw))));
    const bL0 = v3.norm(v3.cross(fr.n, bf0));
    const bf = rotateAbout(bf0, bL0, fb.flip), bu = rotateAbout(fr.n, bL0, fb.flip);
    const W = toWorld; // (the board's spot on the wave, placed in the world; its own left from the placed vectors)
    const wf = W(bf), wu = W(bu);
    objs.push(...boardObjects(wf, wu, v3.norm(v3.cross(wu, wf)), W(add(fr.P, v3.mul(fr.n, 0.25)))));
  }
  return objs;
}
