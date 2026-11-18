// The skinned body (?body=mh / B in the game): MakeHuman's CC0 body (assets/body/*.glb, built by
// research/body/scripts/build_surfer.py) driven by the same procedural pose as the parts surfer (surfer.js
// fills pose.J with its joints each frame). Each frame this works out every bone's skinning matrix:
//   S = T(P) * R * T(-H0)
// H0 is the bone's rest head (model space), R its rotation from rest, P where its head goes in the world. A child
// that just rides along (fingers, toes, clavicles) uses its parent's S. The torso, neck and head are placed by
// mapping the rest body frame (left +X, up +Y, forward +Z) onto ours; the arms and legs are re-solved with the
// body's own bone lengths (two-bone IK) to where our pose puts the hands and feet, so the feet stay on the board.
import { v3 } from './rider.js';

const add = (...vs) => vs.reduce((a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const rej = (a, n) => sub(a, mul(n, dot(a, n)));
const lerp = (a, b, t) => add(mul(a, 1 - t), mul(b, t));
// 3x3 rotations as [c0, c1, c2] columns
const frame = (x, y, z) => [x, y, z];
const mulRT = (A, B) => { // A * B^T (both orthonormal column frames): maps B's axes onto A's
  const r = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[j][i] = A[0][i] * B[0][j] + A[1][i] * B[1][j] + A[2][i] * B[2][j];
  return r; // columns
};
const apply = (R, v) => add(mul(R[0], v[0]), mul(R[1], v[1]), mul(R[2], v[2]));
// orthonormal frame from a main axis and a reference roughly perpendicular to it
const aimFrame = (d, ref) => { const y = norm(d); let z = rej(ref, y); if (len(z) < 1e-4) z = rej([0, 0, 1], y); z = norm(z); return frame(cross(y, z), y, z); };
// two-bone IK: joint for root -> target with lengths l1, l2, bending toward pole
function ik(root, target, l1, l2, pole) {
  let d = sub(target, root), dist = len(d);
  const maxD = (l1 + l2) * 0.999;
  if (dist > maxD) { d = mul(d, maxD / dist); dist = maxD; target = add(root, d); }
  dist = Math.max(dist, Math.abs(l1 - l2) + 1e-3);
  const dir = mul(d, 1 / dist), a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  return { joint: add(root, mul(dir, a), mul(norm(rej(pole, dir)), h)), end: target };
}

const J_LEG = 0.92; // (surfer.js THIGH + SHIN)

export function createBody(model) {
  const R0 = model.rest, H = (n) => R0[n].head;
  const n = model.boneNames.length;
  const mats = new Float32Array(n * 16);
  const S = {}; // bone -> { R, t } (x -> R x + t)
  const put = (name, R, P) => { S[name] = { R, t: sub(P, apply(R, H(name))) }; };
  const at = (name, p) => add(apply(S[name].R, p), S[name].t); // where a rest-space point goes under a bone's S
  const ground = Math.min(...Array.from({ length: model.vertexCount }, (_, i) => model.pos[i * 3 + 1]));
  const ankleH = H('foot_l')[1] - ground; // ankle height above the sole
  const L = { thigh: len(sub(H('calf_l'), H('thigh_l'))), shin: len(sub(H('foot_l'), H('calf_l'))),
    upper: len(sub(H('lowerarm_l'), H('upperarm_l'))), fore: len(sub(H('hand_l'), H('lowerarm_l'))) };
  const PLACED = new Set(['Root', 'pelvis', 'spine_01', 'spine_02', 'spine_03', 'clavicle_l', 'clavicle_r', 'neck_01', 'head',
    ...['thigh', 'calf', 'foot', 'ball', 'upperarm', 'lowerarm', 'hand'].flatMap((b) => [b + '_l', b + '_r'])]);
  const riders = model.boneNames.filter((b) => !PLACED.has(b)); // fingers and thumbs
  const REST = frame([1, 0, 0], [0, 1, 0], [0, 0, 1]); // left, up, forward
  const bodyFrame = (up, fwd) => { const u = norm(up), f = norm(rej(fwd, u)); return frame(cross(u, f), u, f); };

  // J: the joints from surfer.js (world space). Returns the skinning matrices (column-major mat4 per bone).
  // Our pose's legs (surfer.js THIGH + SHIN, feet on the deck) are longer than this body's (thigh + shin + the
  // ankle above the sole), so its hips sit lower above the feet by that ratio, and the hands come down with them:
  // otherwise its legs stretch straight trying to reach the board and every crouch is lost.
  const LEG_K = (L.thigh + L.shin + ankleH) / J_LEG;
  function update(J) {
    const front = J.ss > 0 ? 'r' : 'l', back = front === 'r' ? 'l' : 'r'; // goofy: right foot forward; regular: left
    const feetMid = lerp(J.frontFoot, J.backFoot, 0.5);
    const hip = add(feetMid, mul(sub(J.hip, feetMid), LEG_K)), drop = sub(hip, J.hip);
    J = { ...J, hip, armF: { ...J.armF, end: add(J.armF.end, drop), joint: add(J.armF.joint, drop) }, armB: { ...J.armB, end: add(J.armB.end, drop), joint: add(J.armB.joint, drop) },
      shFront: add(J.shFront, drop), shBack: add(J.shBack, drop),
      legF: { ...J.legF, root: add(J.legF.root, drop) }, legB: { ...J.legB, root: add(J.legB.root, drop) } };
    // torso: pelvis and spine bend from the body's up toward the torso's lean
    const torsoAt = (k) => bodyFrame(lerp(J.bodyUp, J.torsoDir, k), J.chest);
    const Rp = mulRT(torsoAt(0.35), REST);
    put('pelvis', Rp, add(J.hip, mul(J.torsoDir, 0.04)));
    put('Root', Rp, at('pelvis', H('Root')));
    for (const [name, parent, k] of [['spine_01', 'pelvis', 0.6], ['spine_02', 'spine_01', 0.85], ['spine_03', 'spine_02', 1]]) put(name, mulRT(torsoAt(k), REST), at(parent, H(name)));
    for (const s of ['l', 'r']) S['clavicle_' + s] = S.spine_03;
    // head up and looking down the line (toward the nose and the wave), however far the torso leans: a real
    // head tipped forward with a crouching torso drops out of sight behind the shoulders
    const headUp = norm(lerp(J.headDir, J.bodyUp, 0.55)), face = add(J.hChest, mul(J.f, 0.6));
    put('neck_01', mulRT(bodyFrame(lerp(J.torsoDir, headUp, 0.5), face), REST), at('spine_03', H('neck_01')));
    put('head', mulRT(bodyFrame(headUp, face), REST), at('neck_01', H('head')));
    // legs: hips from the pelvis, IK to the ankles above our feet, knees toward our knees
    for (const [side, leg, foot, sgn] of [[front, J.legF, J.frontFoot, 1], [back, J.legB, J.backFoot, -1]]) {
      const hipP = at('pelvis', H('thigh_' + side));
      const ankleT = add(foot, mul(J.ub, ankleH));
      const kneeDir = norm(sub(leg.joint, lerp(leg.root, leg.end, 0.5)));
      const s = ik(hipP, ankleT, L.thigh, L.shin, kneeDir);
      put('thigh_' + side, mulRT(aimFrame(sub(s.joint, hipP), kneeDir), aimFrame(sub(H('calf_' + side), H('thigh_' + side)), [0, 0, 1])), hipP);
      put('calf_' + side, mulRT(aimFrame(sub(s.end, s.joint), kneeDir), aimFrame(sub(H('foot_' + side), H('calf_' + side)), [0, 0, 1])), s.joint);
      // foot flat on the deck, toes toward the toe side (front foot angled a little toward the nose)
      const toe = norm(rej(add(J.T, mul(J.f, 0.35 * sgn)), J.ub));
      put('foot_' + side, mulRT(bodyFrame(J.ub, toe), REST), s.end);
      S['ball_' + side] = S['foot_' + side];
    }
    // arms: shoulders ride with the chest, IK to our hands, elbows toward our elbows
    for (const [side, arm, sh] of [[front, J.armF, J.shFront], [back, J.armB, J.shBack]]) {
      const shP = at('spine_03', H('upperarm_' + side));
      const pole = norm(J.elbowPole); // (the pose's steady elbow direction: one worked out from a nearly straight arm flips about)
      const s = ik(shP, arm.end, L.upper, L.fore, pole);
      const inside = mul(pole, -1); // (rest: the elbows point back, the inside of the bend forward)
      put('upperarm_' + side, mulRT(aimFrame(sub(s.joint, shP), inside), aimFrame(sub(H('lowerarm_' + side), H('upperarm_' + side)), [0, 0, 1])), shP);
      put('lowerarm_' + side, mulRT(aimFrame(sub(s.end, s.joint), inside), aimFrame(sub(H('hand_' + side), H('lowerarm_' + side)), [0, 0, 1])), s.joint);
      put('hand_' + side, mulRT(aimFrame(sub(s.end, s.joint), inside), aimFrame(sub(H('middle_01_' + side), H('hand_' + side)), [0, 0, 1])), s.end);
    }
    // everything else (fingers, thumbs) rides with its nearest placed parent
    for (const name of riders) S[name] = S['hand_' + (name.endsWith('_l') ? 'l' : 'r')]; // (every frame: they follow this frame's hand)
    // tumbling in a wipeout: the whole figure turns about J.tumble.axis through J.tumble.c
    const tb = J.tumble;
    model.boneNames.forEach((name, b) => {
      let { R, t } = S[name];
      if (tb) {
        const rot = (v) => { const k = tb.axis, c = Math.cos(tb.spin), s = Math.sin(tb.spin); return add(mul(v, c), mul(cross(k, v), s), mul(k, dot(k, v) * (1 - c))); };
        R = [rot(R[0]), rot(R[1]), rot(R[2])]; t = add(rot(sub(t, tb.c)), tb.c);
      }
      mats.set([R[0][0], R[0][1], R[0][2], 0, R[1][0], R[1][1], R[1][2], 0, R[2][0], R[2][1], R[2][2], 0, t[0], t[1], t[2], 1], b * 16);
    });
    return mats;
  }
  return { update, model, ankleH };
}
