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

const COL = {
  board: [1.0, 0.24, 0.55], nose: [1.0, 0.85, 0.15], stringer: [0.98, 0.95, 0.9], fin: [0.1, 0.1, 0.12], suit: [0.07, 0.08, 0.1],
  top: [0.0, 0.72, 0.78], skin: [0.86, 0.63, 0.46], hair: [0.98, 0.85, 0.35],
};
const THIGH = 0.46, SHIN = 0.46, UPPER = 0.3, FORE = 0.3;
const STANCE = [-0.68, -0.06]; // back and front foot along the board (m from its middle; tail is -1, nose +1)
const CHEST_OPEN = 0.45; // how far the chest turns from the wave toward the nose (rad)

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
function ball(p, r, color, x = [1, 0, 0], y = [0, 1, 0], z = [0, 0, 1], sy = 1) {
  return { mesh: 'sphere', model: basis(x, y, z, r * 2, r * 2 * sy, r * 2, p), color };
}

export function createPose() {
  return { knee: 0.3, lean: 0, boardUp: [0, 1, 0] };
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

  // --- pose drivers ---
  const speed = v3.len(rider.vel);
  const turnAmt = clamp(Math.abs(info.turn) / 3, 0, 1);
  const vUp = v3.dot(rider.vel, info.e2);
  let kneeT = 0.25 + 0.45 * turnAmt + 0.15 * clamp(vUp / 3, 0, 1);
  if (info.pump) kneeT = vUp > 0.3 ? 0.75 : 0.05; // compress going up, extend driving down
  if (rider.crouch) kneeT = 0.92;
  if (rider.mode === 'air') kneeT = 0.7;
  pose.knee += (clamp(kneeT, 0, 1) - pose.knee) * (1 - Math.exp(-dt * 9));
  const leanT = clamp(info.turn * 0.2 * clamp(speed / 5, 0.3, 1.2), -0.8, 0.8); // + = toward L
  pose.lean += (leanT - pose.lean) * (1 - Math.exp(-dt * 8));
  const knee = pose.knee, lean = pose.lean;
  const reach = clamp((Math.abs(lean) - 0.25) / 0.35, 0, 1);

  // --- skeleton ---
  const B = add(p, v3.mul(u, 0.06)); // top of the board
  // Body axis: between board-normal and world-up, leaned into the turn.
  const up0 = v3.norm(add(v3.mul(u, 0.5), [0, 0.5, 0]));
  const bodyUp = v3.norm(rotateAbout(up0, f, -lean));
  // Facing: toward the wave (toe side), opened up toward the nose a bit, so
  // the surfer looks where they're going.
  const chest = v3.norm(v3.rej(v3.add(v3.mul(L, Math.cos(CHEST_OPEN)), v3.mul(f, Math.sin(CHEST_OPEN))), bodyUp));
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
  const shBack = add(neck, v3.mul(across, -0.19), v3.mul(torsoDir, -0.04));
  const shFront = add(neck, v3.mul(across, 0.19), v3.mul(torsoDir, -0.04));

  // Hands: out for balance by default; in a big turn the inside hand drags
  // toward the water and the other rises.
  let handBack = add(shBack, v3.mul(across, -0.5), v3.mul(bodyUp, -0.22), v3.mul(chest, 0.12));
  let handFront = add(shFront, v3.mul(across, 0.48), v3.mul(bodyUp, -0.18), v3.mul(chest, 0.15));
  if (lean > 0) {
    // Turning toward the chest side (frontside bottom turn): back hand trails on the face.
    handBack = lerp3(handBack, add(B, v3.mul(f, mid - 0.1), v3.mul(L, 0.6), v3.mul(u, 0.08)), reach);
    handFront = lerp3(handFront, add(shFront, v3.mul(f, 0.35), v3.mul(bodyUp, 0.25), v3.mul(chest, -0.1)), reach);
  } else {
    // Turning toward the heel side: front hand reaches down behind.
    handFront = lerp3(handFront, add(B, v3.mul(f, mid + 0.2), v3.mul(L, -0.6), v3.mul(u, 0.08)), reach);
    handBack = lerp3(handBack, add(shBack, v3.mul(f, -0.35), v3.mul(bodyUp, 0.25), v3.mul(chest, 0.1)), reach);
  }
  // Arms swing a little with the pump.
  if (info.pump) {
    const swing = vUp > 0.3 ? -0.12 : 0.12;
    handBack = add(handBack, v3.mul(bodyUp, swing));
    handFront = add(handFront, v3.mul(bodyUp, swing));
  }
  const elbowPole = add(v3.mul(bodyUp, -0.7), v3.mul(chest, -0.3));
  const armB = ik(shBack, handBack, UPPER, FORE, elbowPole);
  const armF = ik(shFront, handFront, UPPER, FORE, elbowPole);

  // --- meshes ---
  const objs = [];
  // Board: body, contrasting nose, stringer down the middle, fin under the tail.
  const bc = add(p, v3.mul(u, 0.04));
  objs.push({ mesh: 'board', model: basis(f, u, L, 1, 1, 1, bc), color: COL.board });
  objs.push({ mesh: 'boardNose', model: basis(f, u, L, 1, 1, 1, bc), color: COL.nose });
  objs.push({ mesh: 'box', model: basis(f, u, L, 1.55, 0.072, 0.025, add(bc, v3.mul(f, -0.15))), color: COL.stringer });
  objs.push({ mesh: 'box', model: basis(f, u, L, 0.14, 0.13, 0.012, add(bc, v3.mul(f, -0.82), v3.mul(u, -0.08))), color: COL.fin });
  for (const [hp, leg, foot] of [[hipBack, legB, backFoot], [hipFront, legF, frontFoot]]) {
    objs.push(limb(hp, leg.joint, 0.16, 0.17, f, COL.suit));
    objs.push(limb(leg.joint, foot, 0.13, 0.14, f, COL.suit));
    objs.push({ mesh: 'box', model: basis(f, u, L, 0.12, 0.06, 0.26, add(foot, v3.mul(u, 0.03), v3.mul(chest, 0.04))), color: COL.skin });
  }
  objs.push(limb(hip, neck, 0.36, 0.22, across, COL.top));
  objs.push(limb(add(hip, v3.mul(torsoDir, -0.04)), add(hip, v3.mul(torsoDir, 0.12)), 0.38, 0.24, across, COL.suit));
  objs.push(ball(head, 0.13, COL.skin));
  objs.push(ball(add(head, v3.mul(torsoDir, 0.05), v3.mul(chest, -0.03)), 0.135, COL.hair, across, torsoDir, chest, 0.75));
  for (const [sh, arm] of [[shBack, armB], [shFront, armF]]) {
    objs.push(limb(sh, arm.joint, 0.1, 0.1, chest, COL.top));
    objs.push(limb(arm.joint, arm.end, 0.085, 0.085, chest, COL.skin));
    objs.push(ball(arm.end, 0.055, COL.skin));
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
