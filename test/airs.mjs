// Air audit: launch straight up off the lip at different distances from the
// curl (xs, metres along the wave; the whitewater starts at curlZone[0]) and
// report what you get: an air or not, boosted ("BIG") or not, how high, where
// you land (how much foam), and what happens in the 2.5 s after landing with
// no input (still riding, or which wipeout).
// usage: node test/airs.mjs [speed m/s] [phi deg]
import { createRider, stepRider, foamAt, TUNE } from '../src/rider.js';
const dt = 1 / 120, speed = +(process.argv[2] || 13), phi = (+(process.argv[3] || 77)) / 57.3;
console.log(`speed ${(speed * 2.237).toFixed(0)} mph, heading ${(phi * 57.3).toFixed(0)} deg, whitewater from xs ${TUNE.curlZone?.[0]}, boost zone ${TUNE.airBoostZone} m`);
let landed = 0, kept = 0;
for (const xs of [-1.2, -1, -0.8, -0.6, -0.4, 0, 0.3, 0.6, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 8]) {
  const r = createRider(); Object.assign(r, { xs, t: 7.5, phi, speed }); r.events = []; stepRider(r, {}, 0);
  let launch = null, lipY = 0, peak = -1e9, out = 'no air', land = null, xLaunch = 0, xLand = 0, foamLand = 0, after = 0, airT = 0;
  for (let i = 0; i < 7 / dt; i++) {
    const before = r.mode;
    stepRider(r, {}, dt);
    for (const e of r.events) {
      if (e.type === 'launch') { launch = e; lipY = r.pos[1]; xLaunch = r.xs; }
      if (e.type === 'move' && !launch && out === 'no air') out = e.move;
      if (e.type === 'land') { land = e; xLand = r.xs; foamLand = foamAt(r.xs, r.t); airT = e.airTime; }
    }
    if (r.mode === 'air' && before !== 'air' && !launch) { out = 'over the back'; break; }
    if (r.mode === 'air') peak = Math.max(peak, r.pos[1]);
    if (land) after += dt;
    if (r.mode === 'wipe') break;
    if (land && after > 2.5) break;
    if (!launch && out !== 'no air' && i * dt > 1.5) break;
  }
  if (launch) {
    const fate = r.mode === 'wipe' ? `WIPE ${land ? `${after.toFixed(2)}s after landing` : 'in the air'}: ${r.wipeReason}` : 'still riding 2.5s later';
    out = `${launch.big ? 'BIG AIR' : 'air    '} off xs ${xLaunch.toFixed(1).padStart(4)}, ${(peak - lipY).toFixed(1)} m up, ${airT.toFixed(2)}s`
      + (land ? `, lands xs ${xLand.toFixed(1).padStart(4)} foam ${foamLand.toFixed(2)} -> ${fate}` : ` -> ${fate}`);
    if (land) { landed++; if (r.mode !== 'wipe') kept++; }
  } else if (r.mode === 'wipe' && out === 'no air') out = 'WIPE ' + r.wipeReason;
  console.log(`start xs ${String(xs).padStart(4)}: ${out}`);
}
console.log(`airs landed ${landed}, still riding after ${kept}`);
