// Energy pocket check (rider.js energy pocket, the user, 2026-11-21: holding the pocket should be 1.0x the peel; extra speed
// from height). For each wave:
//   trim: hold a low / mid / high line near the curl for 6 s (steering only to keep the height): board speed / peel,
//         and how far you drift from the curl
//   drop: from the top, straight down the face: speed at the bottom
//   lip:  from the bottom, straight up into the lip: speed at the top, and what you get (vs the air threshold)
//   bot:  30 s of S-turns in the pocket: average / top speed, airs
//   node test/energy.mjs [wave ...]
import { createRider, stepRider, useWave, TUNE, airSpeedAt } from '../src/rider.js';
import { PEEL_SPEED } from '../src/wave.js';
import { nextWave, stepSea, seedSea } from '../src/sea.js';
const dt = 1 / 120, mph = (v) => (v * 2.237).toFixed(1);
const waves = process.argv.length > 2 ? process.argv.slice(2) : ['point', 'reef', 'queens', 'trestles', 'dynamic'];

function ride(o, policy, secs, until = () => false) {
  seedSea(1); nextWave();
  const r = createRider(); r.xs = o.xs ?? TUNE.startXs ?? 2; r.events = []; stepRider(r, {}, 0);
  Object.assign(r, o); stepRider(r, {}, 0);
  const log = { n: 0, sum: 0, max: 0, airs: 0, big: 0, launch: null, moves: [] };
  let i = 0;
  for (; i < secs / dt; i++) {
    stepSea(dt); stepRider(r, policy(r, i * dt), dt);
    for (const e of r.events) {
      if (e.type === 'launch') { log.airs++; if (e.big) log.big++; }
      if (e.type === 'move' && !/bottomTurn|topTurn/.test(e.move)) log.moves.push(e.move);
    }
    if (r.mode === 'surf') { log.n++; log.sum += r.speed; log.max = Math.max(log.max, r.speed); }
    if (r.mode !== 'surf' || until(r)) break;
  }
  return { r, log, t: i * dt };
}
const aim = (a) => ({ aim: [Math.cos(a), Math.sin(a)] });

for (const w of waves) {
  useWave(w);
  const peel = () => PEEL_SPEED;
  console.log(`-- ${w}${TUNE.energy ? " (energy pocket)" : ""}: air threshold ${mph(airSpeedAt(5))} mph out / ${mph(airSpeedAt(TUNE.curlZone?.[0] ?? 0))} at the curl`);
  // trim at three heights: steer to hold the height, nose along the line
  const trims = [];
  for (const h of [0.25, 0.5, 0.8]) {
    let vs = 0, ps = 0, n = 0;
    const { r, t } = ride({ xs: 1.5, speed: PEEL_SPEED },
      (r, tt) => { if (tt > 2) { vs += r.speed; ps += peel(); n++; } return aim(Math.max(-0.6, Math.min(0.6, 3 * (h - r.height)))); }, 6);
    trims.push(`${h} high (peel ${mph(ps / Math.max(1, n))}) ${n ? (vs / ps).toFixed(2) : '-'}x (${n ? mph(vs / n) : '-'} mph, xs ${r.xs.toFixed(1)}${r.mode !== 'surf' ? ', ' + r.mode : ''}${t < 5.9 ? ' @' + t.toFixed(1) + 's' : ''})`);
  }
  console.log('  trim: ' + trims.join(' | '));
  // the foot spots (longboard tail / middle / nose; shortboard back / middle / forward): trim mid-face in the pocket
  // (speed / peel), and a bottom turn from low on the face pointing down at 1.1x the peel (speed out)
  { const spots = [];
    const lb = !!TUNE.middleSpeed;
    for (const [label, s] of lb ? [['tail', -1], ['middle', 0], ['nose', 1]] : [['back', -1], ['middle', 0], ['forward', 1]]) {
      const at = lb ? { foot: s, footGoal: s } : { shuf: s, shufGoal: s };
      let vs = 0, ps = 0;
      ride({ xs: 1.5, speed: PEEL_SPEED, ...at },
        (r, tt) => { if (tt > 4) { vs += r.speed; ps += peel(); } return aim(Math.max(-0.6, Math.min(0.6, 3 * (0.5 - r.height)))); }, 10);
      let vIn = null;
      const { r } = ride({ xs: 2, speed: PEEL_SPEED * 1.1, ...at },
        (r) => { if (vIn === null) { r.t = TUNE.tBottom - 0.6; r.phi = -0.9; vIn = r.speed; } return { turn: 1 }; }, 2, (r) => Math.sin(r.phi) > 0.5);
      spots.push(`${label} trim ${ps ? (vs / ps).toFixed(2) : '-'}x, bottom turn ${mph(vIn)} -> ${mph(r.speed)}`);
    }
    console.log('  feet: ' + spots.join(' | ')); }
  // drop from the top
  { let v0 = null;
    const { r } = ride({ xs: 2, speed: PEEL_SPEED },
      (r, tt) => { if (tt < 1.5) return aim(3 * (0.92 - r.height)); if (v0 === null) v0 = r.speed; return aim(-1.1); }, 4, (r) => v0 !== null && r.height < 0.08);
    console.log(`  drop: top ${mph(v0)} -> bottom ${mph(r.speed)} mph`); }
  // bottom turn straight up into the lip, at the curl's edge and out on the face
  for (const xs of [1, 4]) {
    let top = null, v0 = null;
    const { r, log } = ride({ xs, speed: PEEL_SPEED },
      (r, tt) => { if (tt < 1.5) return aim(3 * (0.05 - r.height)); if (v0 === null) v0 = r.speed; if (r.height > 0.85 && top === null) top = r.speed; return aim(1.2); }, 4, (r) => r.mode !== 'surf');
    console.log(`  lip at xs ${xs}: bottom ${mph(v0)} -> top ${top === null ? '?' : mph(top)} mph -> ${log.airs ? (log.big ? 'BIG AIR' : 'air') : r.mode === 'surf' ? 'riding (' + (log.moves.join(',') || '-') + ')' : r.mode}`);
  }
  // pocket bot: S-turns near the curl
  { let up = false;
    const { log, t, r } = ride({}, (r) => {
      if (up && r.height > 0.85) up = false;
      if (!up && r.height < 0.15) up = true;
      if (Math.cos(r.phi) < 0) return { aim: [1, -0.3] };
      if (r.xs < -1) return { aim: [1, 0.6] };
      if (r.xs > 6) return { aim: [-0.2, up ? 1 : -1] };
      return { tilt: up ? 1 : -1 };
    }, 30);
    console.log(`  bot: ${r.mode === 'wipe' ? 'wipe at ' + t.toFixed(1) + ' s (' + r.wipeReason + ')' : 'rode ' + t.toFixed(0) + ' s'}; avg ${mph(log.sum / Math.max(1, log.n))} max ${mph(log.max)} mph; airs ${log.airs} (big ${log.big})`); }
}
