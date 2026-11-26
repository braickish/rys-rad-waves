// The recap's story (src/recap.js; accounts plan task 17): the final picked, waves in the order caught, standings after
// each, lead changes, and which waves are shown. node test/recap.mjs
import { buildRecap, recapHeat, MAX_SHOWN } from '../src/recap.js';

let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) fails++; };
const t0 = Date.parse('2026-11-25T10:00:00Z');
const at = (s) => new Date(t0 + s * 1000).toISOString();

// A bracket: two heats in round 1, a final of three.
const heats = [
  { id: 'h1', round: 1, number: 1, heat_entries: [] }, { id: 'h2', round: 1, number: 2, heat_entries: [] },
  { id: 'f', round: 2, number: 1, heat_entries: [{ entrant_id: 'a', jersey: 'red' }, { entrant_id: 'b', jersey: 'blue' }, { entrant_id: 'c', jersey: 'yellow' }] },
];
const entrants = [{ id: 'a', name: 'Kai' }, { id: 'b', name: 'Mara' }, { id: 'c', name: 'Tuck' }];
const ride = (e, n, score, s, log = true) => ({ heat_id: 'f', entrant_id: e, wave_no: n, score: String(score), caught_at: at(s), replay_path: log ? `${e}/f/${n}.json` : null });
// Kai leads early, Mara takes the lead, Kai takes it back on his last wave
const rides = [
  ride('a', 1, 6.5, 10), ride('b', 1, 5.0, 20), ride('c', 1, 3.2, 25), ride('b', 2, 7.9, 60),
  ride('a', 2, 4.0, 70), ride('c', 2, 4.1, 80, false), ride('a', 3, 8.2, 120), ride('h1-noise', 1, 9, 5),
];
rides[rides.length - 1].heat_id = 'h1';

check(recapHeat(heats).id === 'f', 'the final is the heat told');
check(recapHeat([heats[0], heats[1]]).id === 'h2', 'no final yet: the last heat');
const r = buildRecap({ contest: { name: 'Bombie Bash', code: 'ABCDEF', spot: { wave: 'point' } }, entrants, heats, rides });
check(r.story.length === 7 && r.story.every((s) => s.ride.heat_id === 'f'), `only the final's waves, in order (${r.story.length})`);
check(r.story.map((s) => s.name).join(',') === 'Kai,Mara,Tuck,Mara,Kai,Tuck,Kai', 'caught in order');
check(r.story.filter((s) => s.tookLead).map((s) => `${s.name}@${s.score}`).join(' ') === 'Kai@6.5 Mara@7.9 Kai@8.2', `lead changes: ${r.story.filter((s) => s.tookLead).map((s) => `${s.name}@${s.score}`).join(' ')}`);
check(r.story[3].standings[0].name === 'Mara' && r.story[3].standings[0].total === 12.9, 'after Mara\'s 7.9 she leads on 12.90');
check(r.final.map((x) => `${x.place}.${x.name} ${x.total}`).join(' ') === '1.Kai 14.7 2.Mara 12.9 3.Tuck 7.3', `final standings: ${r.final.map((x) => `${x.place}.${x.name} ${x.total}`).join(' ')}`);
check(r.winner.name === 'Kai' && r.winner.jersey === 'red', 'Kai wins, in red');
check(r.shown.map((s) => `${s.name}${s.waveNo}`).join(',') === 'Kai1,Mara2,Kai3', `shown: everyone's best and the lead changes, with a log (Tuck's best has none): ${r.shown.map((s) => `${s.name}${s.waveNo}`).join(',')}`);
check(r.heat.final && r.heat.rounds === 2, 'a bracket\'s final');

// Many waves: at most MAX_SHOWN, keeping lead changes and the best.
const lots = [];
for (let i = 1; i <= 10; i++) lots.push(ride(i % 2 ? 'a' : 'b', Math.ceil(i / 2), 3 + i * 0.5, i * 30));
const r2 = buildRecap({ contest: { name: 'X', code: 'X' }, entrants, heats, rides: lots });
check(r2.shown.length <= MAX_SHOWN && r2.shown.every((s, i, a) => !i || a[i - 1].ride.caught_at <= s.ride.caught_at), `at most ${MAX_SHOWN} shown, still in order (${r2.shown.length})`);
check(!buildRecap({ contest: {}, entrants, heats: [], rides: [] }), 'no heats: no recap');

console.log(fails ? `\n${fails} failed` : '\nrecap ok');
process.exit(fails ? 1 : 0);
