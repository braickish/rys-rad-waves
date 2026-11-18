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
import { WAVE } from './wave.js';
import { BOARDS } from './mesh.js';

// Illustrated look based on a reference photo: shirtless and tanned, short
// dark-brown hair, blue-grey boardshorts with a black waistband and a small
// red logo, an off-white board (with a soft teal nose so the front reads).
const COL = {
  board: [0.95, 0.93, 0.86], nose: [0.55, 0.84, 0.8], stringer: [0.72, 0.7, 0.66], fin: [0.15, 0.16, 0.2],
  skin: [0.86, 0.6, 0.42], hair: [0.42, 0.29, 0.17], shorts: [0.42, 0.48, 0.6], shortsDark: [0.3, 0.35, 0.46],
  band: [0.08, 0.08, 0.1], logo: [0.85, 0.2, 0.25],
};
// The girl on the longboard wave (WAVE.surfer === 'girl'): fair, tanned skin,
// long blonde hair, a light blue bikini (after the Queens reference photo).
const GIRL = { skin: [0.93, 0.7, 0.52], hair: [0.95, 0.82, 0.52], bikini: [0.6, 0.84, 0.95] };
const THIGH = 0.46, SHIN = 0.46, UPPER = 0.3, FORE = 0.3;
const MAX_ROLL = 0.95; // furthest the board banks onto a rail (rad, ~55 deg)
const CHEST_OPEN = 0.45;
const TWIST_WIND = 0.7; // bottom turn: shoulders wind round toward the lip (rad)
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
  objs.push({ mesh: `board-${name}`, model: basis(f, ub, Lb, 1, 1, 1, bc), color: B.colors ? B.colors.deck : COL.board });
  objs.push({ mesh: `boardNose-${name}`, model: basis(f, ub, Lb, 1, 1, 1, bc), color: B.colors ? B.colors.nose : COL.nose });
  // (stringer in short pieces so it follows the rocker)
  const rk = (x) => B.rocker(x / B.half);
  const n = 8, sl = B.stringer[0] / n;
  for (let i = 0; i < n; i++) {
    const x = B.stringer[1] - B.stringer[0] / 2 + sl * (i + 0.5);
    const th = B.thick(x / B.half);
    objs.push({ mesh: 'box', model: basis(f, ub, Lb, sl * 1.02, th * 1.6, 0.012, add(bc, v3.mul(f, x), v3.mul(ub, rk(x)))), color: COL.stringer, outline: 0 });
  }
  for (const [along, acr, h, len] of B.fins) {
    const bottom = rk(along) - B.thick(along / B.half) * 0.8;
    objs.push({ mesh: 'box', model: basis(f, ub, Lb, len, h, 0.012, add(bc, v3.mul(f, along), v3.mul(Lb, acr), v3.mul(ub, bottom - h * 0.5))), color: COL.fin, outline: 0.008 });
  }
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
  if (rider.mode === 'wipe' && !rider.falls && rider.wipeAge > 0.3) return [];
  const p = rider.pos;
  const f = rider.heading;
  const k = 1 - Math.exp(-dt * 12);

  // Board orientation follows the surface, smoothed.
  for (let i = 0; i < 3; i++) pose.boardUp[i] += (info.n[i] - pose.boardUp[i]) * k;
  let u = v3.norm(v3.rej(pose.boardUp, f));
  // A longboard sits mostly level on a steep face, its wave-side rail cut into the wave, instead of
  // lying flat along the face (`faceTilt`: how much of the face's slope the board takes).
  const ft = boardShape().faceTilt;
  if (ft !== undefined && rider.mode === 'surf') u = v3.norm(v3.add(v3.mul(v3.norm(v3.rej([0, 1, 0], f)), 1 - ft), v3.mul(u, ft)));
  const L = v3.norm(v3.cross(u, f)); // rider's left (toward the wave when going right)

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
  // Noseriding (rider.js): nr walks 0 (normal stance) -> 1 (on the nose).
  const nr = rider.mode === 'surf' ? rider.nose || 0 : 0;
  // Dropknee turn (the longboard's roundhouse): the back knee drops toward the deck.
  const dk = WAVE.dropknee ? rh : 0;
  // Walking the longboard (rider.js r.foot): tl 0 (middle) -> 1 (back on the tail); pv how much she's
  // pivoting on the fin (on the tail and up on the wave).
  const tl = rider.mode === 'surf' ? sstepS(0, 1, -(rider.foot || 0)) : 0;
  const pv = rider.mode === 'surf' ? sstepS(0, 1, rider.pivot || 0) : 0;
  const onNose = sstepS(0.6, 1, nr);
  const girl = WAVE.surfer === 'girl';
  const C = girl ? { ...COL, skin: GIRL.skin, hair: GIRL.hair, shorts: GIRL.bikini } : COL;
  let rollT = rider.mode === 'surf'
    ? clamp(info.turn * 0.17 * clamp(speed0 / 5, 0.85, 1.4) * (1 + 0.35 * committed), -MAX_ROLL, MAX_ROLL)
    : 0;
  if (rider.mode === 'surf' && committed > 0.5 && Math.abs(info.turn) > 0.3) {
    rollT = Math.sign(rollT) * Math.max(Math.abs(rollT), (rider.bottomCarve ? 0.85 : 0.7) * committed);
  }
  // Roundhouse: up on the rail more and more as it comes round (past the usual limit).
  if (rh > 0.01 && Math.abs(info.turn) > 0.2) rollT = Math.sign(rollT || info.turn) * Math.max(Math.abs(rollT), 0.7 + 0.5 * rh);
  rollT *= 1 - 0.55 * pv; // (pivoting on the fin, not up on the rail)
  rollT *= boardShape().rollK ?? 1; // (a wide longboard barely goes up on its rail)
  pose.roll = (pose.roll || 0) + (rollT - (pose.roll || 0)) * (1 - Math.exp(-dt * (rider.bottomCarve ? 16 : 10)));
  // Tilt the board's up vector toward the inside of the turn (+ roll = left
  // rail down), so the inside rail digs in.
  let ub = v3.norm(rotateAbout(u, f, -pose.roll));
  let Lb = v3.norm(v3.cross(ub, f));
  // Pearling (noseriding out on the shoulder): the nose dips under.
  let bf = f;
  const dip = rider.mode === 'surf' ? 0.32 * (rider.noseRisk || 0) : 0;
  if (dip > 0) { bf = v3.norm(rotateAbout(f, Lb, dip)); ub = v3.norm(rotateAbout(ub, Lb, dip)); } // (+: nose down, tail up)
  // Pivoting (pivot-turn.jpg in braickish/reference-images): her weight right back sinks the
  // tail into the water and the nose stands well up out of it; the board tips about a point just
  // ahead of the back foot, so the middle rises and the tail goes under.
  // (a little nose lift just standing on the tail; up to ~29 deg swinging round in a pivot)
  const tipT = 0.12 * tl + 0.38 * pv * clamp(Math.abs(info.turn) / 2.5, 0, 1);
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
  // In the tube: a compact, athletic crouch going in, right down deep in the barrel.
  if (bc > 0.01) kneeT = Math.max(kneeT, inB * (0.42 + 0.58 * deep));
  if (nr > 0.01) kneeT = kneeT * (1 - nr) + 0.22 * nr; // standing tall and relaxed walking up and on the nose
  if (rider.mode === 'air') kneeT = 0.7;
  // Going over the falls (off the board): curled up in a ball, knees to chest.
  const tuck = rider.falls ? clamp(rider.falls.time / 0.3, 0, 1) : 0;
  if (tuck > 0) kneeT = 1;
  // Roundhouse: lower and lower as it comes round, right down at full depth.
  if (rh > 0.01) kneeT = Math.max(kneeT, 0.45 + 0.65 * rh);
  if (tl > 0.01) kneeT = kneeT * (1 - 0.6 * tl) + 0.3 * 0.6 * tl; // (on the tail: fairly upright, knees softly bent)
  pose.knee += (clamp(kneeT, 0, 1) - pose.knee) * (1 - Math.exp(-dt * 9));
  let leanT = clamp(info.turn * 0.2 * clamp(speed / 4, 0.8, 1.25) * (1 + 0.3 * committed), -0.85, 0.85); // + = toward L
  if (committed > 0.5 && Math.abs(info.turn) > 0.3) leanT = Math.sign(leanT) * Math.max(Math.abs(leanT), (rider.bottomCarve ? 0.65 : 0.5) * committed);
  if (rh > 0.01 && Math.abs(info.turn) > 0.3) leanT = Math.sign(leanT) * Math.max(Math.abs(leanT), 0.5 + 0.35 * rh); // deeper into the roundhouse
  leanT *= 1 - 0.5 * pv; // (pivoting: standing over the tail, not laid over on a rail)
  pose.lean += (leanT - pose.lean) * (1 - Math.exp(-dt * 8));
  const knee = pose.knee, lean = pose.lean;
  const reach = clamp((Math.abs(lean) - 0.25) / 0.35, 0, 1);

  // --- skeleton ---
  // Up on a rail the board sits a little higher, so it cuts in rather than sinks.
  const railLift = 0.12 * Math.abs(Math.sin(pose.roll));
  const B = add(p, v3.mul(u, 0.06 + railLift), tipUp); // top of the board
  // Body axis: between board-normal and world-up, leaned into the turn.
  const up0 = v3.norm(add(v3.mul(u, 0.5), [0, 0.5, 0]));
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
  const twist = TWIST_WIND * windup - TWIST_UNLOAD * unload; // + = front shoulder round toward the wave
  const chest0 = v3.norm(v3.rej(v3.add(v3.mul(L, Math.cos(CHEST_OPEN)), v3.mul(f, Math.sin(CHEST_OPEN))), bodyUp));
  const chest = v3.norm(rotateAbout(chest0, bodyUp, twist));
  const across = v3.norm(v3.cross(chest, bodyUp)); // shoulder line, roughly toward the nose

  // Stance toward the tail: back foot just ahead of the fin, front foot about
  // the middle of the board.
  const STANCE = boardShape().stance; // back and front foot along the board (m from its middle)
  const bs = boardShape(); // (feet sit on the deck, which rises with the rocker)
  // Walking to the nose: the feet shuffle up the board one after the other
  // (back foot first), each lifting as it steps, to the hang-five stance.
  let st = dk > 0.01 ? [STANCE[0] + 0.22 * dk, STANCE[1]] : STANCE, lift = [0, 0]; // (dropknee: the back foot comes up behind the front)
  if (tl > 0.001 && bs.tailStance) st = [st[0] + (bs.tailStance[0] - st[0]) * tl, st[1] + (bs.tailStance[1] - st[1]) * tl]; // (on the tail: back foot just ahead of the fin, front foot stepped back close behind it)
  if (nr > 0.001 && bs.noseStance) {
    const NS = bs.noseStance, a = sstepS(0, 0.55, nr), b = sstepS(0.4, 1, nr);
    st = [STANCE[0] + (NS[0] - STANCE[0]) * a, STANCE[1] + (NS[1] - STANCE[1]) * b];
    lift = [0.12 * Math.sin(Math.PI * Math.min(1, nr / 0.55)) * (nr < 0.55 ? 1 : 0), 0.12 * Math.sin(Math.PI * Math.max(0, Math.min(1, (nr - 0.4) / 0.6)))];
  }
  // (along the board as drawn: when the nose dips the feet go down with it)
  const du = dip > 0 || tip > 0 ? v3.norm(rotateAbout(u, Lb, dip - tip)) : u;
  let backFoot = add(B, v3.mul(bf, st[0]), v3.mul(du, bs.rocker(st[0] / bs.half) + lift[0]));
  let frontFoot = add(B, v3.mul(bf, st[1]), v3.mul(du, bs.rocker(st[1] / bs.half) + lift[1]));
  const mid = (st[0] + st[1]) / 2;
  // Hips drop and slide back over the heels as the knees bend.
  // (deep in the barrel the hips sink further, and leaning onto the front foot moves them forward)
  const hipH = (0.92 - 0.44 * knee - 0.1 * deep - 0.12 * dk) * (1 - 0.4 * tuck);
  const hip = add(B, v3.mul(bf, mid + 0.1 * fl), v3.mul(bodyUp, hipH), v3.mul(chest, -0.12 * knee));
  const hipBack = add(hip, v3.mul(f, -0.12)), hipFront = add(hip, v3.mul(f, 0.12));
  // (deep in the barrel the back knee drops in toward the deck, pointing at the front foot)
  const kd = Math.max(deep, dk); // (barrel stance or dropknee: the back knee drops toward the deck)
  const kneePole = (s) => add(chest, v3.mul(f, 0.15 * s + (s < 0 ? 0.55 * kd : 0)), v3.mul(bodyUp, 0.2 - (s < 0 ? 0.35 * kd : 0)));
  if (tuck > 0) {
    // feet pulled in under the hips, in front, heels to the backside
    const tf = (sgn) => add(hip, v3.mul(bodyUp, -0.18), v3.mul(chest, 0.22), v3.mul(f, 0.1 * sgn));
    backFoot = lerp3(backFoot, tf(-1), tuck);
    frontFoot = lerp3(frontFoot, tf(1), tuck);
  }
  const legB = ik(hipBack, backFoot, THIGH, SHIN, kneePole(-1));
  const legF = ik(hipFront, frontFoot, THIGH, SHIN, kneePole(1));

  // Torso leans forward (toward the chest side) as you crouch.
  const torsoDir0 = v3.norm(add(bodyUp, v3.mul(chest, 0.1 + 0.6 * knee + 0.35 * inB + 0.45 * deep), v3.mul(f, 0.1 * deep + 0.22 * fl))); // leaning into the tube (and onto the front foot)
  const torsoDir = v3.norm(lerp3(torsoDir0, v3.norm(add(v3.mul(bodyUp, 0.45), chest)), tuck)); // (folded over the knees in a tuck)
  const neck = add(hip, v3.mul(torsoDir, 0.58));
  const headDir = v3.norm(lerp3(torsoDir, bodyUp, 0.5 * deep)); // head up, looking down the line, in the barrel stance
  const head = add(neck, v3.mul(headDir, 0.2), v3.mul(chest, 0.03), v3.mul(across, 0.03));
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
  // Barrel stance: both hands low in front, by the knees.
  if (deep > 0.01) {
    handFront = lerp3(handFront, add(legF.joint, v3.mul(chest, 0.2), v3.mul(f, 0.1), v3.mul(bodyUp, -0.04)), 0.85 * deep);
    handBack = lerp3(handBack, add(lerp3(legB.joint, legF.joint, 0.45), v3.mul(chest, 0.24), v3.mul(bodyUp, 0.04)), 0.85 * deep);
  }
  if (lean > 0) {
    // Turning toward the chest side (frontside bottom turn): back hand trails on the face.
    handBack = lerp3(handBack, add(B, v3.mul(f, mid - 0.1), v3.mul(L, 0.6), v3.mul(u, 0.08)), reach);
    handFront = lerp3(handFront, add(shFront, v3.mul(f, 0.35), v3.mul(bodyUp, 0.25), v3.mul(chest, -0.1)), reach);
  } else {
    // Turning toward the heel side: front hand reaches down behind.
    handFront = lerp3(handFront, add(B, v3.mul(f, mid + 0.2), v3.mul(L, -0.6), v3.mul(u, 0.08)), reach);
    handBack = lerp3(handBack, add(shBack, v3.mul(f, -0.35), v3.mul(bodyUp, 0.25), v3.mul(chest, 0.1)), reach);
  }
  // Bottom turn: front arm low and across the body toward the inside of the
  // turn (the wave side), leading the turn; back arm low behind.
  if (windup > 0.01) {
    handFront = lerp3(handFront, add(B, v3.mul(f, mid + 0.3), v3.mul(L, 0.42), v3.mul(u, 0.32 + 0.3 * (1 - knee))), windup);
    handBack = lerp3(handBack, add(B, v3.mul(f, mid - 0.45), v3.mul(L, 0.25), v3.mul(u, 0.35)), windup * 0.8);
  }
  // Snap: like a spring unloading, both arms swing across the body (at about
  // chest height) toward the tail and the open side, turning the shoulders,
  // and with them the board.
  if (unload > 0.01) {
    handFront = lerp3(handFront, add(neck, v3.mul(across, -0.12), v3.mul(chest, 0.32), v3.mul(bodyUp, -0.12)), unload);
    handBack = lerp3(handBack, add(shBack, v3.mul(across, -0.38), v3.mul(chest, -0.12), v3.mul(bodyUp, -0.1)), unload);
  }
  // Arms swing a little with the pump.
  if (info.pump) {
    const swing = vUp > 0.3 ? -0.12 : 0.12;
    handBack = add(handBack, v3.mul(bodyUp, swing));
    handFront = add(handFront, v3.mul(bodyUp, swing));
  }
  // On the nose (after the turning poses, so it wins): arms out wide for balance, a little raised (the reference photo).
  if (nr > 0.01) {
    const w = Math.max(onNose, 0.5 * Math.sin(Math.PI * nr));
    handBack = lerp3(handBack, add(shBack, v3.mul(across, -0.55), v3.mul(bodyUp, 0.05), v3.mul(chest, 0.05)), w);
    handFront = lerp3(handFront, add(shFront, v3.mul(across, 0.55), v3.mul(bodyUp, 0.12), v3.mul(chest, 0.05)), w);
  }
  // Pivoting on the tail: arms out for balance, the front one reaching forward and low, the back one out behind.
  if (tl > 0.01) {
    const w = Math.max(0.5 * tl, 0.85 * pv);
    handBack = lerp3(handBack, add(shBack, v3.mul(across, -0.45), v3.mul(bodyUp, -0.05), v3.mul(chest, 0.15)), w);
    handFront = lerp3(handFront, add(shFront, v3.mul(across, 0.5), v3.mul(bodyUp, -0.12), v3.mul(chest, 0.2)), w);
  }
  if (tuck > 0) {
    // arms wrapped round the shins
    handBack = lerp3(handBack, add(lerp3(legB.joint, backFoot, 0.4), v3.mul(chest, 0.08)), tuck);
    handFront = lerp3(handFront, add(lerp3(legF.joint, frontFoot, 0.4), v3.mul(chest, 0.08)), tuck);
  }
  const elbowPole = add(v3.mul(bodyUp, -0.6), v3.mul(chest, -0.2), v3.mul(across, 0.2));
  const armB = ik(shBack, handBack, UPPER, FORE, elbowPole);
  const armF = ik(shFront, handFront, UPPER, FORE, elbowPole);

  // --- meshes ---
  const objs = [];
  // Board (banked onto its rail). Going over the falls you've come off it:
  // it's drawn on its own where the wave has taken it (rider.fallsBoard).
  if (!rider.falls) objs.push(...boardObjects(bf, ub, Lb, add(p, v3.mul(u, 0.04 + railLift), tipUp)));
  // Legs: boardshorts to just above the knee, then bare legs and feet.
  for (const [hp, leg, foot, logo] of [[hipBack, legB, backFoot, false], [hipFront, legF, frontFoot, true]]) {
    if (girl) {
      // bare legs, slimmer
      objs.push(ball(hp, 0.095, C.skin));
      objs.push(cyl(hp, leg.joint, 0.078, 0.082, f, C.skin));
      objs.push(ball(leg.joint, 0.058, C.skin));
      objs.push(cyl(leg.joint, foot, 0.048, 0.05, f, C.skin));
      objs.push(ball(add(foot, v3.mul(ub, 0.03), v3.mul(chest, 0.04)), 0.065, C.skin, f, ub, Lb, 0.45));
      continue;
    }
    const shortsEnd = lerp3(hp, leg.joint, 0.78);
    objs.push(ball(hp, 0.105, COL.shorts)); // hip joint, so the thigh meets the hips cleanly
    objs.push(cyl(hp, shortsEnd, 0.1, 0.105, f, COL.shorts));
    objs.push(cyl(shortsEnd, leg.joint, 0.062, 0.062, f, COL.skin));
    objs.push(ball(leg.joint, 0.064, COL.skin));
    objs.push(cyl(leg.joint, foot, 0.052, 0.055, f, COL.skin));
    objs.push(ball(add(foot, v3.mul(ub, 0.03), v3.mul(chest, 0.04)), 0.07, COL.skin, f, ub, Lb, 0.45));
    if (logo) objs.push({ mesh: 'box', model: basis(f, ub, Lb, 0.05, 0.04, 0.012, add(lerp3(hp, shortsEnd, 0.6), v3.mul(chest, 0.1))), color: COL.logo, outline: 0 });
  }
  // Hips (shorts) and the waistband.
  // Pelvis: a rounded block of boardshorts joining both thighs.
  if (girl) {
    // Bikini bottoms, a slim waist and torso, narrower shoulders, a bikini top,
    // and long blonde hair down her back.
    objs.push(ball(add(hip, v3.mul(torsoDir, 0.02)), 0.14, C.shorts, across, torsoDir, chest, 0.7));
    objs.push(cyl(add(hip, v3.mul(torsoDir, 0.08)), add(neck, v3.mul(torsoDir, -0.12)), 0.115, 0.09, across, C.skin));
    objs.push({ mesh: 'sphere', model: basis(across, torsoDir, chest, 0.36, 0.32, 0.21, add(neck, v3.mul(torsoDir, -0.17))), color: C.skin });
    objs.push({ mesh: 'sphere', model: basis(across, torsoDir, chest, 0.3, 0.11, 0.2, add(neck, v3.mul(torsoDir, -0.22), v3.mul(chest, 0.025))), color: C.shorts });
    objs.push(cyl(neck, add(neck, v3.mul(torsoDir, 0.1)), 0.04, 0.04, across, C.skin));
    objs.push(ball(head, 0.11, C.skin, across, torsoDir, chest, 1.12));
    objs.push(ball(add(head, v3.mul(torsoDir, 0.05), v3.mul(chest, -0.03)), 0.12, C.hair, across, torsoDir, chest, 0.8));
    objs.push(ball(add(head, v3.mul(torsoDir, -0.1), v3.mul(chest, -0.09)), 0.1, C.hair, across, torsoDir, chest, 1.3));
    objs.push(ball(add(head, v3.mul(torsoDir, -0.28), v3.mul(chest, -0.1)), 0.085, C.hair, across, torsoDir, chest, 1.5));
  } else {
  objs.push(ball(add(hip, v3.mul(torsoDir, 0.02)), 0.16, COL.shorts, across, torsoDir, chest, 0.85));
  // Waistband: just a black band of the shorts, flush with the body (same
  // size as the bottom of the torso), no outline.
  objs.push({ ...cyl(add(hip, v3.mul(torsoDir, 0.08)), add(hip, v3.mul(torsoDir, 0.15)), 0.131, 0.096, across, COL.band), outline: 0 });
  // Bare torso, tapering out to the shoulders.
  // (narrow waist, broad shoulders: a swimmer's V)
  objs.push(cyl(add(hip, v3.mul(torsoDir, 0.1)), add(neck, v3.mul(torsoDir, -0.12)), 0.13, 0.11, across, COL.skin));
  // Chest and shoulders: one rounded shape, broad across the shoulders.
  objs.push({ mesh: 'sphere', model: basis(across, torsoDir, chest, 0.44, 0.36, 0.24, add(neck, v3.mul(torsoDir, -0.17))), color: COL.skin });
  objs.push(cyl(neck, add(neck, v3.mul(torsoDir, 0.1)), 0.045, 0.045, across, COL.skin));
  // Head and short dark hair (a little fringe toward the front).
  objs.push(ball(head, 0.12, COL.skin, across, torsoDir, chest, 1.12));
  objs.push(ball(add(head, v3.mul(torsoDir, 0.06), v3.mul(chest, -0.02)), 0.125, COL.hair, across, torsoDir, chest, 0.72));
  objs.push(ball(add(head, v3.mul(torsoDir, 0.09), v3.mul(chest, 0.07)), 0.07, COL.hair, across, torsoDir, chest, 0.55));
  }
  // Arms: shoulders, upper arm, elbow, forearm, hand (all bare).
  for (const [sh, arm] of [[shBack, armB], [shFront, armF]]) {
    const k = girl ? 0.85 : 1;
    objs.push(ball(sh, 0.06 * k, C.skin));
    objs.push(cyl(sh, arm.joint, 0.043 * k, 0.043 * k, chest, C.skin));
    objs.push(ball(arm.joint, 0.04 * k, C.skin));
    objs.push(cyl(arm.joint, arm.end, 0.036 * k, 0.036 * k, chest, C.skin));
    objs.push(ball(arm.end, 0.048 * k, C.skin, across, torsoDir, chest, 1.2));
  }

  if (rider.mode === 'wipe') {
    // Tumble the whole figure (curled up going over the falls: round its middle).
    const spin = rider.falls ? rider.falls.time * 6 : rider.wipeAge * 12; // slower going over the falls
    const axis = v3.norm(L);
    const c = rider.falls ? add(hip, v3.mul(torsoDir, 0.12), v3.mul(chest, 0.1)) : p;
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
  if (rider.falls && fb) {
    const fr = frameAt(fb.xs, fb.t);
    const bf0 = v3.norm(add(v3.mul(fr.e1, Math.cos(fb.yaw)), v3.mul(fr.e2, Math.sin(fb.yaw))));
    const bL0 = v3.norm(v3.cross(fr.n, bf0));
    const bf = rotateAbout(bf0, bL0, fb.flip), bu = rotateAbout(fr.n, bL0, fb.flip);
    objs.push(...boardObjects(bf, bu, bL0, add(fr.P, v3.mul(fr.n, 0.25))));
  }
  return objs;
}
