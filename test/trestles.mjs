// Trestles: the wave that changes as you ride it (src/waves/trestles.js). Prints the ride along the bar (the curl's
// speed, the section's shape, the tube's height and whether it's big enough to ride), checks the wave's phase has no
// jumps, then rides the whole wave with a pocket-working bot at each set size.
//   node test/trestles.mjs
import { createRider, stepRider, useWave, tubeHeight } from '../src/rider.js';
import { WAVE, PEEL_SPEED, RIDE, SHAPE, phaseAt, surface, setWaveSize, startRide, stepRide } from '../src/wave.js';
const dt = 1 / 120, mph = (v) => Math.round(v * 2.237);
useWave(process.argv[2] || 'trestles'); // (node test/trestles.mjs dynamic: the same checks on Dynamic)

// 1. The bar, on its own.
console.log('-- the ride along the bar (normal size)');
setWaveSize(1); startRide();
const names = ['takeoff', 'middle', 'inside', 'set inside'];
for (let i = 0; i <= 45 / dt; i++) {
  if (i % Math.round(2.5 / dt) === 0) {
    const crest = surface(0.5, 4)[1];
    const sh = SHAPE.w > 0 && SHAPE.b !== SHAPE.a ? `${names[SHAPE.a]}->${names[SHAPE.b]} ${(SHAPE.w * 100).toFixed(0)}%` : names[SHAPE.a];
    console.log(`t ${RIDE.time.toFixed(1).padStart(4)}s  curl ${RIDE.c.toFixed(0).padStart(4)} m  peel ${PEEL_SPEED.toFixed(1).padStart(4)} m/s  ${sh.padEnd(22)} crest ${crest.toFixed(2)} m  tube ${tubeHeight().toFixed(2)} m ${tubeHeight() >= WAVE.tubeMinHeight ? 'rideable' : 'too small'}  phase at 6 m behind ${phaseAt(-6).toFixed(2)}`);
  }
  stepRide(dt);
}
for (const k of WAVE.sea.set) {
  setWaveSize(k); startRide();
  const seen = new Set();
  for (let i = 0; i <= 45 / dt; i++) { seen.add(`${names[SHAPE.a]} ${tubeHeight().toFixed(2)} ${tubeHeight() >= WAVE.tubeMinHeight ? 'ok' : 'small'}`); stepRide(dt); }
  console.log(`size ${k}: tubes`, [...new Set([...seen].filter((x) => !x.includes('->')))].filter((_, i, a) => true).slice(0, 1).join(''), '...', [...seen].pop());
}

// The closeout: the curl stops at bar.closeout.at, and the stretch ahead breaks within ~1 s.
{
  setWaveSize(1); startRide();
  let i = 0; for (; i < 60 / dt && !RIDE.closed; i++) stepRide(dt);
  const c0 = RIDE.c, t0 = RIDE.time;
  for (let k = 0; k < 1.5 / dt; k++) stepRide(dt);
  console.log(`-- closeout at ${t0.toFixed(1)} s, curl ${c0.toFixed(0)} m; 1.5 s later the curl is at ${RIDE.c.toFixed(0)} m (peel ${PEEL_SPEED}), phase 20 / 50 / 69 / 100 m ahead: ${[20, 50, 69, 100].map((x) => phaseAt(x).toFixed(2)).join(' / ')}`);
}

// 2. The phase along the wave: no jumps (a jump is a crease or a step in the water), no NaNs.
{
  setWaveSize(1); startRide();
  let worst = 0, where = '';
  for (let i = 0; i <= 40 / dt; i++) {
    if (i % 60 === 0) {
      let prev = phaseAt(-60);
      for (let x = -60 + 0.25; x <= 60; x += 0.25) {
        const s = phaseAt(x);
        if (!Number.isFinite(s)) throw new Error(`phase NaN at xs ${x}, t ${RIDE.time}`);
        const d = Math.abs(s - prev) / 0.25; if (d > worst) { worst = d; where = `xs ${x.toFixed(2)} at t ${RIDE.time.toFixed(1)} s`; }
        prev = s;
      }
    }
    stepRide(dt);
  }
  console.log(`-- steepest phase change along the wave: ${worst.toFixed(2)} per m (${where})`);
}

// 3. Riding it: the autopilot's pocket bot (S-turns between low and high on the face, back down the line when
// behind the curl), with the sea running.
import { nextWave, stepSea, seedSea, SEA } from '../src/sea.js';
function bot() {
  let up = false;
  return (r) => {
    if (r.tube) { if (up && r.height > 0.68) up = false; if (!up && r.height < 0.5) up = true; const a = up ? 0.05 : -0.2; return { aim: [Math.cos(a), Math.sin(a)] }; }
    if (up && r.height > 0.85) up = false;
    if (!up && r.height < 0.15) up = true;
    if (Math.cos(r.phi) < 0) return { aim: [1, -0.3] };
    if (r.xs < -1) return { aim: [1, 0.6] };
    return { tilt: up ? 1 : -1 };
  };
}
// A racer: trims high and fast along the line (racing the sections), gentle S-turns between 55% and 80% up.
function racer() {
  let up = true;
  return (r) => {
    if (up && r.height > (r.tube ? 0.66 : 0.8)) up = false;
    if (!up && r.height < (r.tube ? 0.5 : 0.55)) up = true;
    const a = up ? 0.25 : -0.2; return { aim: [Math.cos(a), Math.sin(a)] };
  };
}
for (const [label, mk] of [['pocket bot', bot], ['racer', racer]]) {
console.log(`-- riding it (${label})`);
seedSea(1);
for (let w = 0; w < 3; w++) {
  nextWave();
  const r = createRider(); r.xs = WAVE.tune.startXs; r.events = []; stepRider(r, {}, 0);
  const pol = mk(); const ev = []; let i = 0, maxSpeed = 0;
  const marks = [];
  for (; i < 50 / dt; i++) {
    stepSea(dt); stepRider(r, pol(r), dt);
    maxSpeed = Math.max(maxSpeed, r.speed);
    for (const e of r.events) {
      if (e.type === 'barrelEnter') ev.push(`IN@${(i * dt).toFixed(1)}`);
      if (e.type === 'barrelExit') ev.push(`out(${e.time.toFixed(1)}s)`);
      if (e.type === 'move' && e.move !== 'bottomTurn' && e.move !== 'topTurn') ev.push(e.move);
    }
    if (i % Math.round(5 / dt) === 0) marks.push(`${(i * dt).toFixed(0)}s:xs${r.xs.toFixed(0)}/${mph(r.speed)}mph`);
    if (r.mode === 'wipe') break;
  }
  console.log(`wave ${w + 1} (size ${SEA.size}): ${r.mode === 'wipe' ? `WIPE at ${(i * dt).toFixed(1)} s (curl ${RIDE.c.toFixed(0)} m): ${r.wipeReason}` : 'rode 50 s'} | top ${mph(maxSpeed)} mph`);
  console.log('   ', marks.join(' '), '|', ev.slice(0, 14).join(' '));
}
}
