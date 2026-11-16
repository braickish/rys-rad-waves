// The surfer: an articulated figure posed every frame from the rider's state.
// Legs and arms are two-bone IK chains (feet stay planted on the board, hands
// reach for targets). Pose drivers:
//   - knee bend: a relaxed base stance, deeper through turns, compress on the
//     way up the face and extend on the way down when pumping, deep crouch on
//     Shift, tucked in the air
//   - lean: into the turn, harder the faster you turn; in a big turn the
//     inside hand drags toward the water

import { v3 } from './rider.js';
import { basis } from './math.js';

// Illustrated look based on a reference photo: shirtless and tanned, short
// dark-brown hair, blue-grey boardshorts with a black waistband and a small
// red logo, an off-white board (with a soft teal nose so the front reads).
const COL = {
  board: [0.95, 0.93, 0.86], nose: [0.55, 0.84, 0.8], stringer: [0.72, 0.7, 0.66], fin: [0.15, 0.16, 0.2],
  skin: [0.86, 0.6, 0.42], hair: [0.42, 0.29, 0.17], shorts: [0.42, 0.48, 0.6], shortsDark: [0.3, 0.35, 0.46],
  band: [0.08, 0.08, 0.1], logo: [0.85, 0.2, 0.25],
};
const THIGH = 0.46, SHIN = 0.46, UPPER = 0.3, FORE = 0.3;
const MAX_ROLL = 0.95; // furthest the board banks onto a rail (rad, ~55 deg)
const STANCE = [-0.52, -0.02]; // back and front foot along the board (m from its middle; tail is -1, nose +1)
const CHEST_OPEN = 0.45;
const TWIST_WIND = 0.7; // bottom turn: shoulders wind round toward the lip (rad)
const TWIST_UNLOAD = 0.9; // snap: they spring open the other way (rad) // how far the chest turns from the wave toward the nose (rad)

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const add = (...vs) => vs.reduce((a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]);
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

export function createPose() {
  return { knee: 0.3, lean: 0, roll: 0, boardUp: [0, 1, 0] };
}

// info: { n (surface normal or up), e2 (up the face), turn (signed turn rate,
// + = counterclockwise/left), pumping, crouch, input pump }
export function surferObjects(pose, rider, info, dt) {
  if (rider.mode === 'wipe' && rider.wipeTimer < 1.9) return [];
  const p = rider.pos;
  const f = rider.heading;
  const k = 1 - Math.exp(-dt * 12);

  // Board orientation follows the surface, smoothed.
  for (let i = 0; i < 3; i++) pose.boardUp[i] += (info.n[i] - pose.boardUp[i]) * k;
  const u = v3.norm(v3.rej(pose.boardUp, f));
  const L = v3.norm(v3.cross(u, f)); // rider's left (toward the wave when going right)

  // Rail roll: in a hard turn the board banks onto its inside rail. Harder
  // and faster turns roll it further; holding a turn (leaning harder) more still.
  const speed0 = v3.len(rider.vel);
  // Banks hard even at low speed; a committed turn (held, or a bottom turn
  // started pointing down) always gets well up on the rail.
  const committed = Math.max(rider.hard || 0, rider.bottomCarve ? 1 : 0);
  let rollT = rider.mode === 'surf'
    ? clamp(info.turn * 0.17 * clamp(speed0 / 5, 0.85, 1.4) * (1 + 0.35 * committed), -MAX_ROLL, MAX_ROLL)
    : 0;
  if (rider.mode === 'surf' && committed > 0.5 && Math.abs(info.turn) > 0.3) {
    rollT = Math.sign(rollT) * Math.max(Math.abs(rollT), (rider.bottomCarve ? 0.85 : 0.7) * committed);
  }
  pose.roll = (pose.roll || 0) + (rollT - (pose.roll || 0)) * (1 - Math.exp(-dt * (rider.bottomCarve ? 16 : 10)));
  // Tilt the board's up vector toward the inside of the turn (+ roll = left
  // rail down), so the inside rail digs in.
  const ub = v3.norm(rotateAbout(u, f, -pose.roll));
  const Lb = v3.norm(v3.cross(ub, f));

  // --- pose drivers ---
  const speed = v3.len(rider.vel);
  const turnAmt = clamp(Math.abs(info.turn) / 3, 0, 1);
  const vUp = v3.dot(rider.vel, info.e2);
  let kneeT = 0.25 + 0.45 * turnAmt + 0.15 * clamp(vUp / 3, 0, 1) + 0.2 * (rider.hard || 0);
  if (info.pump) kneeT = vUp > 0.3 ? 0.75 : 0.05; // compress going up, extend driving down
  if (rider.crouch) kneeT = 0.92;
  if (rider.mode === 'air') kneeT = 0.7;
  pose.knee += (clamp(kneeT, 0, 1) - pose.knee) * (1 - Math.exp(-dt * 9));
  let leanT = clamp(info.turn * 0.2 * clamp(speed / 4, 0.8, 1.25) * (1 + 0.3 * committed), -0.85, 0.85); // + = toward L
  if (committed > 0.5 && Math.abs(info.turn) > 0.3) leanT = Math.sign(leanT) * Math.max(Math.abs(leanT), (rider.bottomCarve ? 0.65 : 0.5) * committed);
  pose.lean += (leanT - pose.lean) * (1 - Math.exp(-dt * 8));
  const knee = pose.knee, lean = pose.lean;
  const reach = clamp((Math.abs(lean) - 0.25) / 0.35, 0, 1);

  // --- skeleton ---
  // Up on a rail the board sits a little higher, so it cuts in rather than sinks.
  const railLift = 0.12 * Math.abs(Math.sin(pose.roll));
  const B = add(p, v3.mul(u, 0.06 + railLift)); // top of the board
  // Body axis: between board-normal and world-up, leaned into the turn.
  const up0 = v3.norm(add(v3.mul(u, 0.5), [0, 0.5, 0]));
  const bodyUp = v3.norm(rotateAbout(up0, f, -lean));
  // Facing: toward the wave (toe side), opened up toward the nose a bit, so
  // the surfer looks where they're going.
  // Wind-up and release. A bottom turn winds the shoulders round toward the
  // lip with the front shoulder and arm dropped across the body; a snap
  // springs it all open the other way and throws both arms back over.
  const lowOnFace = rider.mode === 'surf' && rider.t > 10.5;
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
  const backFoot = add(B, v3.mul(f, STANCE[0]));
  const frontFoot = add(B, v3.mul(f, STANCE[1]));
  const mid = (STANCE[0] + STANCE[1]) / 2;
  // Hips drop and slide back over the heels as the knees bend.
  const hipH = 0.92 - 0.44 * knee;
  const hip = add(B, v3.mul(f, mid), v3.mul(bodyUp, hipH), v3.mul(chest, -0.12 * knee));
  const hipBack = add(hip, v3.mul(f, -0.12)), hipFront = add(hip, v3.mul(f, 0.12));
  const kneePole = (s) => add(chest, v3.mul(f, 0.35 * s));
  const legB = ik(hipBack, backFoot, THIGH, SHIN, kneePole(-1));
  const legF = ik(hipFront, frontFoot, THIGH, SHIN, kneePole(1));

  // Torso leans forward (toward the chest side) as you crouch.
  const torsoDir = v3.norm(add(bodyUp, v3.mul(chest, 0.1 + 0.6 * knee)));
  const neck = add(hip, v3.mul(torsoDir, 0.58));
  const head = add(neck, v3.mul(torsoDir, 0.2), v3.mul(chest, 0.03), v3.mul(across, 0.03));
  // Front shoulder drops into a bottom turn; both lift as you spring open.
  const shBack = add(neck, v3.mul(across, -0.19), v3.mul(torsoDir, -0.04 + 0.05 * windup + 0.03 * unload));
  const shFront = add(neck, v3.mul(across, 0.19), v3.mul(torsoDir, -0.04 - 0.1 * windup + 0.03 * unload));

  // Hands: out for balance by default; in a big turn the inside hand drags
  // toward the water and the other rises.
  // Relaxed default (like the reference photo): front arm bent forward at
  // chest height, back arm low and behind, reaching toward the water.
  let handBack = add(shBack, v3.mul(across, -0.36), v3.mul(bodyUp, -0.48), v3.mul(chest, 0.14));
  let handFront = add(shFront, v3.mul(across, 0.26), v3.mul(bodyUp, -0.08), v3.mul(chest, 0.34));
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
  const elbowPole = add(v3.mul(bodyUp, -0.6), v3.mul(chest, -0.2), v3.mul(across, 0.2));
  const armB = ik(shBack, handBack, UPPER, FORE, elbowPole);
  const armF = ik(shFront, handFront, UPPER, FORE, elbowPole);

  // --- meshes ---
  const objs = [];
  // Board: body, contrasting nose, stringer down the middle, fin under the tail.
  // Board (banked onto its rail): body, contrasting nose, stringer, fin.
  const bc = add(p, v3.mul(u, 0.04 + railLift));
  objs.push({ mesh: 'board', model: basis(f, ub, Lb, 1, 1, 1, bc), color: COL.board });
  objs.push({ mesh: 'boardNose', model: basis(f, ub, Lb, 1, 1, 1, bc), color: COL.nose });
  objs.push({ mesh: 'box', model: basis(f, ub, Lb, 1.2, 0.07, 0.012, add(bc, v3.mul(f, -0.12))), color: COL.stringer, outline: 0 });
  // Twin keel fins near the rails at the tail.
  for (const side of [-1, 1]) {
    objs.push({ mesh: 'box', model: basis(f, ub, Lb, 0.2, 0.1, 0.012, add(bc, v3.mul(f, -0.58), v3.mul(Lb, 0.17 * side), v3.mul(ub, -0.065))), color: COL.fin, outline: 0.008 });
  }
  // Legs: boardshorts to just above the knee, then bare legs and feet.
  for (const [hp, leg, foot, logo] of [[hipBack, legB, backFoot, false], [hipFront, legF, frontFoot, true]]) {
    const shortsEnd = lerp3(hp, leg.joint, 0.78);
    objs.push(cyl(hp, shortsEnd, 0.095, 0.1, f, COL.shorts));
    objs.push(cyl(shortsEnd, leg.joint, 0.062, 0.062, f, COL.skin));
    objs.push(ball(leg.joint, 0.064, COL.skin));
    objs.push(cyl(leg.joint, foot, 0.052, 0.055, f, COL.skin));
    objs.push(ball(add(foot, v3.mul(ub, 0.03), v3.mul(chest, 0.04)), 0.07, COL.skin, f, ub, Lb, 0.45));
    if (logo) objs.push({ mesh: 'box', model: basis(f, ub, Lb, 0.05, 0.04, 0.012, add(lerp3(hp, shortsEnd, 0.6), v3.mul(chest, 0.1))), color: COL.logo, outline: 0 });
  }
  // Hips (shorts) and the waistband.
  objs.push(cyl(add(hipBack, v3.mul(f, -0.05)), add(hipFront, v3.mul(f, 0.05)), 0.12, 0.12, torsoDir, COL.shorts));
  // Waistband: just a black band of the shorts, flush with the body (same
  // size as the bottom of the torso), no outline.
  objs.push({ ...cyl(add(hip, v3.mul(torsoDir, 0.08)), add(hip, v3.mul(torsoDir, 0.15)), 0.131, 0.096, across, COL.band), outline: 0 });
  // Bare torso, tapering out to the shoulders.
  // (narrow waist, broad shoulders: a swimmer's V)
  objs.push(cyl(add(hip, v3.mul(torsoDir, 0.1)), add(neck, v3.mul(torsoDir, -0.12)), 0.13, 0.095, across, COL.skin));
  objs.push(cyl(add(neck, v3.mul(torsoDir, -0.3)), add(neck, v3.mul(torsoDir, -0.06)), 0.17, 0.105, across, COL.skin));
  objs.push(cyl(add(shBack, v3.mul(torsoDir, -0.03)), add(shFront, v3.mul(torsoDir, -0.03)), 0.06, 0.06, torsoDir, COL.skin));
  objs.push(cyl(neck, add(neck, v3.mul(torsoDir, 0.1)), 0.045, 0.045, across, COL.skin));
  // Head and short dark hair (a little fringe toward the front).
  objs.push(ball(head, 0.12, COL.skin, across, torsoDir, chest, 1.12));
  objs.push(ball(add(head, v3.mul(torsoDir, 0.06), v3.mul(chest, -0.02)), 0.125, COL.hair, across, torsoDir, chest, 0.72));
  objs.push(ball(add(head, v3.mul(torsoDir, 0.09), v3.mul(chest, 0.07)), 0.07, COL.hair, across, torsoDir, chest, 0.55));
  // Arms: shoulders, upper arm, elbow, forearm, hand (all bare).
  for (const [sh, arm] of [[shBack, armB], [shFront, armF]]) {
    objs.push(ball(sh, 0.06, COL.skin));
    objs.push(cyl(sh, arm.joint, 0.043, 0.043, chest, COL.skin));
    objs.push(ball(arm.joint, 0.04, COL.skin));
    objs.push(cyl(arm.joint, arm.end, 0.036, 0.036, chest, COL.skin));
    objs.push(ball(arm.end, 0.048, COL.skin, across, torsoDir, chest, 1.2));
  }

  if (rider.mode === 'wipe') {
    // Tumble the whole figure around the rider.
    const spin = (2.2 - rider.wipeTimer) * 12;
    const axis = v3.norm(L);
    for (const o of objs) {
      const m = o.model;
      for (let col = 0; col < 3; col++) {
        const v = rotateAbout([m[col * 4], m[col * 4 + 1], m[col * 4 + 2]], axis, spin);
        m[col * 4] = v[0]; m[col * 4 + 1] = v[1]; m[col * 4 + 2] = v[2];
      }
      const t = rotateAbout([m[12] - p[0], m[13] - p[1], m[14] - p[2]], axis, spin);
      m[12] = p[0] + t[0]; m[13] = p[1] + t[1]; m[14] = p[2] + t[2];
    }
  }
  return objs;
}
