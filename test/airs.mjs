// Air audit: launch straight up off the lip at different distances from the
// curl (xs, metres along the wave; the whitewater starts at curlZone[0]) and
// report what you get: an air or not, boosted ("BIG") or not, and how high.
// usage: node test/airs.mjs [speed m/s]
import { createRider, stepRider, TUNE } from '../src/rider.js';
const dt = 1 / 120, speed = +(process.argv[2] || 13);
console.log(`speed ${(speed * 2.237).toFixed(0)} mph, whitewater from xs ${TUNE.curlZone?.[0]}, boost zone ${TUNE.airBoostZone} m`);
for (const xs of [-1.2, -1, -0.8, -0.6, -0.4, 0, 0.3, 0.6, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 8]) {
  const r = createRider(); Object.assign(r, { xs, t: 7.5, phi: 1.35, speed }); r.events = []; stepRider(r, {}, 0);
  let launch = null, lipY = 0, peak = -1e9, out = 'no air', land = null, xLaunch = 0;
  for (let i = 0; i < 4 / dt; i++) {
    const before = r.mode;
    stepRider(r, {}, dt);
    for (const e of r.events) {
      if (e.type === 'launch') { launch = e; lipY = r.pos[1]; xLaunch = r.xs; }
      if (e.type === 'move' && !launch && out === 'no air') out = e.move;
      if (e.type === 'land') land = e;
    }
    if (r.mode === 'air' && before !== 'air' && !launch) { out = 'over the back'; break; }
    if (r.mode === 'air') peak = Math.max(peak, r.pos[1]);
    if (r.mode === 'wipe') { out = out === 'no air' ? 'WIPE ' + r.wipeReason : out; break; }
    if (land || (launch && r.mode === 'surf')) break;
  }
  if (launch) out = `${launch.big ? 'BIG AIR' : 'air    '} at xs ${xLaunch.toFixed(1)}, ${(peak - lipY).toFixed(2)} m above the lip, ${land ? 'landed' : r.mode}`;
  console.log(`start xs ${String(xs).padStart(4)}: ${out}`);
}
