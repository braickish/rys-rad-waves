// Trestles' pocket speed from physics and real surfers' speeds (rider.js physCruise, the wave's `physPocket`; the user,
// 2026-11-19). Rides each simulated wave with two bots (the pocket bot: S-turns low/high near the curl; the racer: a high
// line down the wave) and reports board speed across the face (what the HUD shows) and speed over the ground (adding the
// wave's own shoreward motion c, what a surfer's GPS measures), plus the airs and moves they get. OLD=1: the pocket model
// before (Raglan's vPocket x heightSpeed), for comparison. GPS on surfers: recreational max ~21 mph, pros ~25, record 28.
//   node test/pocketspeed.mjs
import { createRider, stepRider, useWave, TUNE, frameAt } from '../src/rider.js';
import { WAVE, RIDE, WAVE_SPEED } from '../src/wave.js';
import { nextWave, stepSea, seedSea } from '../src/sea.js';
const dt = 1 / 120, mph = (v) => (v * 2.237).toFixed(1);
useWave('trestles');
if (process.env.OLD) TUNE.physPocket = null;
const C = TUNE.physPocket ? TUNE.physPocket.c : 6.5;
function bot() {
  let up = false;
  return (r) => {
    if (up && r.height > 0.85) up = false;
    if (!up && r.height < 0.15) up = true;
    if (Math.cos(r.phi) < 0) return { aim: [1, -0.3] };
    if (r.xs < -1) return { aim: [1, 0.6] };
    if (r.xs > 6) return { aim: [-0.2, up ? 1 : -1] }; // (too far out: turn back toward the curl)
    return { tilt: up ? 1 : -1 };
  };
}
function racer() {
  let up = true;
  return (r) => {
    if (up && r.height > 0.8) up = false;
    if (!up && r.height < 0.55) up = true;
    const a = up ? 0.25 : -0.2; return { aim: [Math.cos(a), Math.sin(a)] };
  };
}
// speed over the ground: the board's velocity on the face (along e1 and up e2), its horizontal part, plus the wave
// carrying you toward the beach at c (scaled with the wave's speed for sets)
function ground(r) {
  const f = frameAt(r.xs, r.t);
  const v = [0, 1, 2].map((i) => r.speed * (Math.cos(r.phi) * f.e1[i] + Math.sin(r.phi) * f.e2[i]));
  const c = C * WAVE_SPEED / WAVE.waveSpeed;
  return Math.hypot(v[0], v[2] + c); // (+z toward the beach in the wave's frame)
}
for (const [label, mk] of [['pocket bot', bot], ['racer', racer]]) {
  seedSea(1);
  console.log(`-- ${label}${process.env.OLD ? ' (old pocket model)' : ''}`);
  for (let w = 0; w < 3; w++) {
    nextWave();
    const r = createRider(); r.xs = TUNE.startXs; r.events = []; stepRider(r, {}, 0);
    const pol = mk(); let n = 0, sb = 0, sg = 0, mb = 0, mg = 0, near = 0, airs = 0, big = 0; const moves = {};
    let i = 0;
    for (; i < 40 / dt; i++) {
      stepSea(dt); stepRider(r, pol(r), dt);
      for (const e of r.events) {
        if (e.type === 'air') { airs++; if (e.big) big++; }
        if (e.type === 'move' && e.move !== 'bottomTurn' && e.move !== 'topTurn') moves[e.move] = (moves[e.move] || 0) + 1;
      }
      if (r.mode === 'surf') {
        const g = ground(r); n++; sb += r.speed; sg += g; mb = Math.max(mb, r.speed); mg = Math.max(mg, g);
        if (r.xs > -2 && r.xs < 6) near++;
      }
      if (r.mode === 'wipe') break;
    }
    console.log(`wave ${RIDE.map.wave}: ${r.mode === 'wipe' ? `wipe at ${(i * dt).toFixed(1)} s (${r.wipeReason})` : 'rode 40 s'}; board avg ${mph(sb / n)} max ${mph(mb)} mph; ground avg ${mph(sg / n)} max ${mph(mg)} mph; ${(100 * near / Math.max(1, n)).toFixed(0)}% near the curl; airs ${airs} (big ${big}); ${Object.entries(moves).map(([k, v]) => `${k} ${v}`).join(', ') || 'no moves'}`);
  }
}
