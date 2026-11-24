// Heats (src/heat.js; accounts plan task 3): the heat's waves, best two, places, ties, needs, the horn, wave-count ends,
// bots. node test/heat.mjs
import * as R from '../src/rider.js';
import * as W from '../src/wave.js';
import * as S from '../src/sea.js';
import { createHeat, stepHeat, canCatch, addWave, checkOver, standings, needFor, compare, parseHeatParam, judgeSeed, clockText, you } from '../src/heat.js';

let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) fails++; };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// The URL option.
check(eq(parseHeatParam('10m'), { minutes: 10 }) && eq(parseHeatParam('5w'), { waves: 5 }) && eq(parseHeatParam('15'), { minutes: 15 }) && parseHeatParam('x') === null, "?heat=10m / 5w / 15 parse; junk doesn't");

// The same seed: the same waves in the same order (sizes, Raglan+'s ridges), whatever order they're visited in.
{
  const waves = (seed, order) => { R.useWave('raglanPlus'); S.seedSea(seed); const o = []; for (const k of order) { S.goToWave(k); o[k] = [S.SEA.size, W.RIDGE.list.map((r) => +r.x.toFixed(3))]; } return o; };
  const a = waves(4242, [0, 1, 2, 3, 4]), b = waves(4242, [3, 0, 4, 2, 1]), c = waves(77, [0, 1, 2, 3, 4]);
  check(eq(a, b), 'the heat seed gives the same 5 waves in any order');
  check(!eq(a, c), 'another seed gives other waves');
}

// Bots: the same seed, the same rivals.
{
  const h1 = createHeat({ seed: 9, end: { minutes: 10 } }), h2 = createHeat({ seed: 9, end: { minutes: 10 } }), h3 = createHeat({ seed: 10, end: { minutes: 10 } });
  const plans = (h) => h.surfers.map((s) => s.plan);
  check(eq(plans(h1), plans(h2)) && !eq(plans(h1), plans(h3)), 'bots: same seed, same schedule and scores; another seed, others');
  const n = h1.surfers.slice(1).map((s) => s.plan.length);
  check(n.every((k) => k >= 6 && k <= 13) && h1.surfers.slice(1).every((s) => s.plan.every((w) => w.at < 600)), `a 10 min heat: bots ride ${n.join(', ')} waves, all before the horn`);
  check(judgeSeed(9, 0) !== judgeSeed(9, 1) && judgeSeed(9, 2) === judgeSeed(9, 2), "judges' seed per wave: different waves, different seeds; the same wave, the same");
}

// Best two, places, ties (best single, then second, then third).
{
  const h = createHeat({ seed: 1, end: { minutes: 10 }, bots: 3 });
  const set = (i, scores) => { h.surfers[i].waves = scores.map((score, n) => ({ n, score, at: n })); h.surfers[i].plan = []; };
  set(0, [5.5, 7.0, 3.2]); set(1, [6.0, 6.5]); set(2, [7.0, 5.5, 1.0]); set(3, [6.25, 6.25, 6.0]);
  const st = standings(h);
  // totals: you 12.5 (7, 5.5, 3.2); bot1 12.5 (6.5, 6); bot2 12.5 (7, 5.5, 1); bot3 12.5 (6.25, 6.25, 6)
  check(st.every((r) => r.total === 12.5), 'all four on 12.50');
  check(eq(st.map((r) => r.surfer.id), ['you', 'bot2', 'bot1', 'bot3']), `tie-break by best wave then the next: ${st.map((r) => `${r.surfer.name} ${r.scores.join('/')}`).join(' > ')}`);
  check(eq(st.map((r) => r.place), [1, 2, 3, 4]), 'places 1-4');
  check(compare({ total: 10, scores: [5, 5] }, { total: 10, scores: [5, 5] }) === 0, 'identical heats tie');
}

// Needs.
{
  check(eq(needFor([6.0, 4.0], 13.5), { score: 7.51 }), 'best two 6 + 4 vs a 13.50 lead: needs 7.51');
  check(eq(needFor([3.0, 1.0], 14.0), { combo: true }), 'best two 3 + 1 vs 14.00: combination (needs over 10)');
  check(eq(needFor([], 7.3), { score: 7.31 }), 'no waves vs 7.30: needs 7.31');
  check(eq(needFor([8.0, 7.0], 15.0), { score: 7.01 }), 'tied on 15.00 (8 + 7): needs 7.01 to pass');
  const h = createHeat({ seed: 1, end: { minutes: 10 }, bots: 3, advance: 2 });
  const set = (i, scores) => { h.surfers[i].waves = scores.map((score, n) => ({ n, score, at: n })); h.surfers[i].plan = []; };
  set(0, [4.0, 3.0]); set(1, [8.0, 7.5]); set(2, [6.0, 5.0]); set(3, [9.5, 0.4]);
  const st = standings(h), by = Object.fromEntries(st.map((r) => [r.surfer.id, r]));
  // 1st bot1 15.5, 2nd bot2 11.0, 3rd bot3 9.9, 4th you 7.0; top 2 advance: needs vs 11.0
  check(by.bot1.need === null && by.bot2.need === null, 'advancing places need nothing');
  check(eq(by.bot3.need, { score: 1.51, for: 'adv' }) && eq(by.you.need, { score: 7.01, for: 'adv' }), `to advance: Tuck ${by.bot3.need.score}, you ${by.you.need.score} (vs 11.00)`);
  h.advance = 0;
  const one = standings(h), byId = (id) => one.find((r) => r.surfer.id === id);
  check(eq(byId('you').need, { combo: true, for: 'win' }) && eq(byId('bot2').need, { score: 9.51, for: 'win' }), `one round, vs 15.50 to win: you a combination (4 + 11.51), Mara ${byId('bot2').need.score}`);
}

// The horn: a wave caught before it counts, even if scored after; one caught after doesn't.
{
  const h = createHeat({ seed: 3, end: { minutes: 1 }, bots: 0 });
  stepHeat(h, 50);
  check(canCatch(h), '50 s into a 1 min heat: you can catch one');
  const caught = h.time;
  const ev = stepHeat(h, 15); // (the horn goes while you ride)
  check(ev.some((e) => e.type === 'horn') && !checkOver(h, true), 'the horn sounds mid-ride; the heat waits for your wave');
  check(addWave(h, { score: 6.2, at: caught }) && you(h).waves.length === 1, 'the wave caught at 50 s counts (scored at 65 s)');
  check(checkOver(h, false), 'and then the heat is over');
  const h2 = createHeat({ seed: 3, end: { minutes: 1 }, bots: 0 });
  stepHeat(h2, 61);
  check(!canCatch(h2) && !addWave(h2, { score: 9, at: 61 }) && you(h2).waves.length === 0, "a wave caught after the horn doesn't count");
  check(clockText(createHeat({ end: { minutes: 10 }, bots: 0 })) === '10:00' && clockText(h2) === '0:00', 'clock reads 10:00 at the start, 0:00 at the horn');
}

// Wave count: ends after your Nth; the bots' remaining waves come in.
{
  const h = createHeat({ seed: 5, end: { waves: 3 }, bots: 2 });
  stepHeat(h, 20);
  for (let i = 0; i < 3; i++) { check(canCatch(h), `wave ${i + 1} of 3: can catch (${clockText(h)})`); addWave(h, { score: 5 + i, at: h.time }); stepHeat(h, 25); }
  check(!canCatch(h) && checkOver(h, false), 'after 3 waves: no more, the heat is over');
  check(h.surfers.slice(1).every((s) => s.waves.length === 3), "the bots' 3 waves are all in");
  const st = standings(h);
  check(st.find((r) => r.surfer.you).total === 13, `your total: best two of 5 / 6 / 7 = ${st.find((r) => r.surfer.you).total}`);
}

// A whole timed heat, stepped: bots' scores arrive over time, in order, all before the horn.
{
  const h = createHeat({ seed: 12, end: { minutes: 10 } });
  let got = 0, last = 0, horn = 0;
  for (let t = 0; t < 700; t++) for (const e of stepHeat(h, 1)) { if (e.type === 'score') { got++; check.ok = e.surfer.waves.at(-1).at >= last; } if (e.type === 'horn') horn++; }
  checkOver(h, false);
  const planned = createHeat({ seed: 12, end: { minutes: 10 } }).surfers.reduce((a, s) => a + s.plan.length, 0);
  check(got === planned && horn === 1 && h.done, `10 min heat stepped: ${got} bot scores came in, one horn, over`);
}
console.log(fails ? `\n${fails} failed` : '\nheats ok');
process.exit(fails ? 1 : 0);
