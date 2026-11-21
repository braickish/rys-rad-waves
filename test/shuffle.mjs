// Shortboard feet (rider.js `shuffle`): what back / middle / forward do on Raglan and Pipe.
// For each spot: the turn (degrees turned in 0.4 s from the same moment, and the speed after), cruising
// speed for an S-turning rider, and how fast speed builds from the drop-in. Back should turn sharper and run a
// little slower; forward should accelerate a little quicker and turn wider.
import { createRider, resetRider, stepRider, useWave, groundSpeed } from '../src/rider.js';
const DT = 1 / 120, mph = (v) => v * 2.237;
function ride(id, spot, fn) {
  useWave(id); const r = createRider(); resetRider(r);
  // shuffle to the spot at the start (the middle takes the same first step, so all three start in step: the S-turn rider
  // times its turns off the clock, and a one-frame offset sent the middle down a different line, 3 mph apart with ?energy)
  stepRider(r, spot ? { walk: spot } : {}, DT);
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
      const sp = [];
      for (let i = 0; i < 8 / DT && r.mode !== 'wipe'; i++) { const t = i * DT; stepRider(r, { turn: Math.sin(t * 2.4) > 0.25 ? 1 : Math.sin(t * 2.4) < -0.25 ? -1 : 0 }, DT); sp.push(groundSpeed(r)); }
      return { sp, mode: r.mode, shuf: r.shuf };
    });
    // build-up: speed 1 s after the drop-in, riding straight
    const b = ride(id, spot, (r) => { for (let i = 0; i < 1 / DT; i++) stepRider(r, {}, DT); return mph(groundSpeed(r)); });
    res[name] = { ...turn, sp: s.sp, at1s: b, shuf: s.shuf };
  }
  // S-turn speeds compared over the same stretch: until the first of the three riders wipes out (2026-11-21: a rider
  // that survives longer averaged in seconds the others never rode, e.g. forward 17.7 vs middle 14.3 mph on Raglan
  // with ?energy, where the feet themselves differ by ~1.5 mph)
  const common = Math.min(...Object.values(res).map((x) => x.sp.length));
  for (const [name, x] of Object.entries(res)) {
    x.avg = mph(x.sp.slice(0, common).reduce((a, b) => a + b, 0) / Math.max(1, common));
    rows.push(`${id.padEnd(5)} ${name.padEnd(7)} feet ${String(x.shuf).padStart(2)}  turn ${x.deg.toFixed(0).padStart(3)} deg in 0.4 s (${x.v0.toFixed(1)} -> ${x.v1.toFixed(1)} mph)  S-turns avg ${x.avg.toFixed(1)} mph over ${(common * DT).toFixed(1)} s (rode ${(x.sp.length * DT).toFixed(1)})  1 s after drop-in ${x.at1s.toFixed(1)} mph`);
  }
  const check = (cond, msg) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${id}: ${msg}`); ok &&= cond; };
  check(res.back.deg > res.middle.deg && res.middle.deg > res.forward.deg, 'back turns sharpest, forward widest');
  // (by the speed after the same turn: the S-turn rider wipes out within ~2 s on Raglan, so its average is noise)
  check(res.back.v1 < res.middle.v1, 'back is slower than the middle');
  check(res.forward.at1s >= res.middle.at1s, 'forward builds speed at least as quickly');
  check(res.back.deg < res.middle.deg * 1.4 && res.forward.deg > res.middle.deg * 0.7, 'subtle: turns within ~30-40% of the middle');
  // (by the speed after the same turn from the same moment: the S-turn rider is chaotic, any small change to its turns
  // sends it down another line, so its average moved 3-4 mph from a foot change worth ~1 mph like for like, 2026-11-21)
  check(Math.abs(res.back.v1 - res.middle.v1) < 3 && Math.abs(res.forward.v1 - res.middle.v1) < 3, 'subtle: speeds within 3 mph of the middle (same turn)');
}
console.log(rows.join('\n'));
console.log(ok ? 'all ok' : 'SOME FAILED');
process.exit(ok ? 0 : 1);
