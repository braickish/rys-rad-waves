// Shortboard feet (rider.js `shuffle`): what back / middle / forward do on Raglan and Pipe.
// For each spot: the turn (degrees turned in 0.4 s from the same moment, and the speed after), cruising
// speed for an S-turning rider, and how fast speed builds from the drop-in. Back should turn sharper and run a
// little slower; forward should accelerate a little quicker and turn wider.
import { createRider, resetRider, stepRider, useWave, groundSpeed } from '../src/rider.js';
const DT = 1 / 120, mph = (v) => v * 2.237;
function ride(id, spot, fn) {
  useWave(id); const r = createRider(); resetRider(r);
  // shuffle to the spot at the start
  if (spot) stepRider(r, { walk: spot }, DT);
  return fn(r);
}
let ok = true;
const rows = [];
for (const id of ['point', 'reef']) {
  const res = {};
  for (const [name, spot] of [['back', -1], ['middle', 0], ['forward', 1]]) {
    // turn: ride level for 0.8 s, then hold Left (up the face) for 0.4 s
    const turn = ride(id, spot, (r) => {
      for (let i = 0; i < 0.8 / DT; i++) stepRider(r, {}, DT);
      const p0 = r.phi, v0 = groundSpeed(r);
      for (let i = 0; i < 0.4 / DT; i++) stepRider(r, { turn: 1 }, DT);
      return { deg: (r.phi - p0) * 57.3, v0: mph(v0), v1: mph(groundSpeed(r)) };
    });
    // S-turns for 8 s: average speed
    const s = ride(id, spot, (r) => {
      let sum = 0, n = 0;
      for (let i = 0; i < 8 / DT && r.mode !== 'wipe'; i++) { const t = i * DT; stepRider(r, { turn: Math.sin(t * 2.4) > 0.25 ? 1 : Math.sin(t * 2.4) < -0.25 ? -1 : 0 }, DT); sum += groundSpeed(r); n++; }
      return { avg: mph(sum / n), mode: r.mode, shuf: r.shuf };
    });
    // build-up: speed 1 s after the drop-in, riding straight
    const b = ride(id, spot, (r) => { for (let i = 0; i < 1 / DT; i++) stepRider(r, {}, DT); return mph(groundSpeed(r)); });
    res[name] = { ...turn, avg: s.avg, at1s: b, shuf: s.shuf };
    rows.push(`${id.padEnd(5)} ${name.padEnd(7)} feet ${String(s.shuf).padStart(2)}  turn ${turn.deg.toFixed(0).padStart(3)} deg in 0.4 s (${turn.v0.toFixed(1)} -> ${turn.v1.toFixed(1)} mph)  S-turns avg ${s.avg.toFixed(1)} mph  1 s after drop-in ${b.toFixed(1)} mph`);
  }
  const check = (cond, msg) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${id}: ${msg}`); ok &&= cond; };
  check(res.back.deg > res.middle.deg && res.middle.deg > res.forward.deg, 'back turns sharpest, forward widest');
  check(res.back.avg < res.middle.avg, 'back is slower than the middle');
  check(res.forward.at1s >= res.middle.at1s, 'forward builds speed at least as quickly');
  check(res.back.deg < res.middle.deg * 1.4 && res.forward.deg > res.middle.deg * 0.7, 'subtle: turns within ~30-40% of the middle');
  check(Math.abs(res.back.avg - res.middle.avg) < 3 && Math.abs(res.forward.avg - res.middle.avg) < 3, 'subtle: speeds within 3 mph of the middle');
}
console.log(rows.join('\n'));
console.log(ok ? 'all ok' : 'SOME FAILED');
process.exit(ok ? 0 : 1);
