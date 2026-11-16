// Pocket surfing check. Speed should come from staying in and around the
// pocket: run out onto the shoulder and you bog down until the curl catches
// up; a rider who works the pocket can keep going indefinitely.
// xs is distance ahead of the curl (m). Pocket ~ 0..5, barrel < 0, shoulder > 8.
import { createRider, resetRider, stepRider, groundSpeed } from '../src/rider.js';
import { phaseAt } from '../src/wave.js';
const dt = 1 / 120;
export function ride(policy, { secs = 25, xs } = {}) {
  const r = createRider(); resetRider(r);
  if (xs !== undefined) { r.xs = xs; }
  let sumXs = 0, maxXs = -99, minXs = 99, n = 0, i = 0, inPocket = 0, barrel = 0;
  const speeds = [];
  for (; i < secs / dt; i++) {
    stepRider(r, policy(r, i * dt), dt);
    if (r.mode === 'wipe') break;
    sumXs += r.xs; n++; maxXs = Math.max(maxXs, r.xs); minXs = Math.min(minXs, r.xs);
    if (r.xs > -2 && r.xs < 6) inPocket++;
    if (r.inBarrel) barrel++;
    if (i % 120 === 0) speeds.push(Math.round(groundSpeed(r) * 2.237));
  }
  return { t: i * dt, meanXs: sumXs / n, maxXs, minXs, pocketPct: Math.round((100 * inPocket) / n), barrel: barrel * dt, reason: r.mode === 'wipe' ? r.wipeReason : 'still riding', speeds };
}
const alt = (period, a, b) => (t) => (Math.floor(t / period) % 2 ? b : a);
// A player rocking Left/Right: Left (CCW) noses up the face, Right noses down.
const carveLR = (period, pump) => (r, t) => { const up = alt(period, 1, -1)(t); return { turn: up}; };
const tiltUD = (period, pump) => (r, t) => { const up = alt(period, 1, -1)(t); return { tilt: up}; };
// A decent surfer bot: S-turns in the pocket, cuts back when it gets ahead of
// it, straightens and pumps when it gets too deep.
const pocketBot = () => {
  let up = false;
  return (r) => {
    const y = r.pos[1] + r.vel[1] * 0.3;
    if (up && y > 2.6) up = false;
    if (!up && y < 1.0) up = true;
    if (r.xs > 6) return { aim: [-0.6, up ? 0.8 : -0.5] }; // cutback toward the curl
    if (r.xs < -1) return { aim: [1, up ? 0.5 : -0.6], pump: !up, crouch: r.inBarrel };
    return { tilt: up ? 0.9 : -0.8, pump: !up, crouch: r.inBarrel };
  };
};
const cases = [
  ['Left/Right carving 0.35s', carveLR(0.35, false)],
  ['Left/Right carving 0.35s + pump', carveLR(0.35, true)],
  ['Left/Right carving 0.6s + pump', carveLR(0.6, true)],
  ['Up/Down 0.8s', tiltUD(0.8, false)],
  ['Up/Down 0.8s + pump', tiltUD(0.8, true)],
  ['straight down the line, no pump', () => ({ tilt: -0.1 })],
  ['straight down the line + pump', () => ({ tilt: -0.15})],
  ['trim high in the pocket (y~2)', (r) => ({ tilt: Math.max(-0.5, Math.min(0.5, (2.0 - r.pos[1]) * 0.8)) })],
  ['trim high in the pocket + pump', (r) => ({ tilt: Math.max(-0.5, Math.min(0.5, (2.0 - r.pos[1]) * 0.8))})],
  ['pocket bot', pocketBot()],
];
if (import.meta.url === `file://${process.argv[1]}`) {
  for (const [name, p] of cases) {
    const o = ride(p);
    console.log(`${name.padEnd(34)} ${o.t.toFixed(1).padStart(5)}s  xs mean ${o.meanXs.toFixed(1).padStart(5)} max ${o.maxXs.toFixed(1).padStart(5)}  in pocket ${String(o.pocketPct).padStart(3)}%  barrel ${o.barrel.toFixed(1)}s  ${o.reason}`);
  }
  // Out on the shoulder going fast: how quickly do you bog down?
  const sh = ride(() => ({ tilt: 0 }), { xs: 12, secs: 6 });
  console.log(`start on shoulder (xs=12) straight    mph each second: ${sh.speeds.join(' ')}  final xs ${sh.maxXs.toFixed(1)}→ ${sh.reason}`);
}
