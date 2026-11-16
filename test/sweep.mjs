import { createRider, resetRider, stepRider, TUNE } from '../src/rider.js';
const dt = 1 / 120;
function ride(policy, secs = 20) {
  const r = createRider(); resetRider(r);
  let sumVx = 0, n = 0, i = 0;
  for (; i < secs / dt; i++) { stepRider(r, policy(r), dt); sumVx += r.vel[0]; n++; if (r.mode !== 'surf') break; }
  return { t: i * dt, vx: sumVx / n };
}
function sturns(yHi, yLo, pump) {
  let up = false;
  return (r) => { const vy = r.vel[1];
    if (up && r.pos[1] + vy * 0.35 > yHi) up = false;
    if (!up && r.pos[1] + vy * 0.35 < yLo) up = true;
    return { steer: [1, up ? 0.9 : -0.8], pump: pump && !up }; };
}
const trim = (yT) => (r) => ({ steer: [1, Math.max(-0.6, Math.min(0.6, (yT - r.pos[1]) * 0.8))] });
const base = { ...TUNE };
const rows = [];
for (const flowUp of [0, 0.6]) for (const lift of [1.0, 1.3]) for (const scrub of [0.004, 0.01]) for (const power of [0]) for (const drag of [0.05, 0.08]) {
  Object.assign(TUNE, base, { flowUp, lift, scrub, power, drag });
  const tr = [1.2, 1.8].map((y) => ride(trim(y)));
  const st = [[2.6, 0.9], [3.0, 1.2]].map(([a, b]) => ride(sturns(a, b, false)));
  const sp = [[2.6, 0.9], [3.0, 1.2]].map(([a, b]) => ride(sturns(a, b, true)));
  const f = (xs) => xs.map((x) => `${x.vx.toFixed(1)}/${x.t.toFixed(0)}s`).join(' ');
  rows.push(`flow ${flowUp} lift ${lift} scrub ${scrub} power ${power} drag ${drag} | trim ${f(tr)} | S ${f(st)} | S+pump ${f(sp)}`);
}
console.log(rows.join('\n'));
