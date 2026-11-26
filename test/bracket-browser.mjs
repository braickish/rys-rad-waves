// A bracket in the browser (accounts plan task 13; headless Chrome, the local stack with Realtime). A Pro host and four
// guests (the guests are scripted through the database's own functions, as their game would call them):
//   1. 5 surfers in a contest of up to 16: round 1 is two heats (seeds 1, 4, 5 and 2, 3), shown as a bracket in the lobby
//      (every heat 2 to 4; the top 2 of a heat of 3 through, only the winner of a heat of 2)
//   2. the host rides their round-1 heat (the autopilot); the guests post their waves and finish
//   3. the last heat closes: "You're through!", and back in the lobby the bracket has the final, with who went through
//      and who's out
//   4. the host counts down and drops into the final (of 3), with the two others who went through
// npm run db:start first, then: npm run test:bracket-browser [shotPrefix]
import { execSync } from 'node:child_process';
import { openBrowser, signInOnTitle, sleep, root } from './browser-lib.mjs';

const API = process.env.SB_URL || 'http://127.0.0.1:55321';
const PK = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';
const SECRET = process.env.SB_SECRET || JSON.parse(execSync('npx supabase status -o json', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString()).SECRET_KEY;
const H = { apikey: SECRET, authorization: `Bearer ${SECRET}`, 'content-type': 'application/json' };
const post = async (table, body) => { const r = await fetch(`${API}/rest/v1/${table}`, { method: 'POST', headers: { ...H, prefer: 'return=representation' }, body: JSON.stringify(body) }); if (!r.ok) throw new Error(`${table}: ${r.status} ${await r.text()}`); return (await r.json())[0]; };
const get = async (q) => (await fetch(`${API}/rest/v1/${q}`, { headers: H })).json();
const rpcAs = async (token, fn, args) => { const r = await fetch(`${API}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: PK, authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(args) }); const t = await r.text(); if (!r.ok) throw new Error(`${fn}: ${t}`); return t ? JSON.parse(t) : null; };
const guestSession = async () => (await (await fetch(`${API}/auth/v1/signup`, { method: 'POST', headers: { apikey: PK, 'content-type': 'application/json' }, body: '{}' })).json()).access_token;

const A = await openBrowser({ shots: process.argv[2] });
const { check } = A;
const shown = (id) => `(() => { const e = document.getElementById('${id}'); return !!e && e.offsetParent !== null; })()`;
const bracketText = `document.getElementById('bracket').innerText.replace(/\\s+/g, ' ')`;

// The host (seed 1) and four guests (seeds 2-5).
await A.go(`${A.base}?wave=point`);
await signInOnTitle(A, `bhost-${Date.now()}@example.com`);
await A.waitFor(`${A.vis('acct-handle-form')} || ${A.vis('acct-who')}`, 20000);
const host = await A.evaluate(`JSON.parse(localStorage.getItem('rys-rad-waves-auth'))`);
const handle = `bh${Date.now() % 1e7}`;
await post('profiles', { id: host.user.id, handle });
await post('entitlements', { user_id: host.user.id, kind: 'pro', source: 'grant', expires_at: new Date(Date.now() + 30 * 864e5).toISOString(), note: 'test' });
const contest = await rpcAs(host.access_token, 'create_contest', { name: 'Bracket Test', wave: 'point', end_waves: 1, max_entrants: 16 });
await rpcAs(host.access_token, 'join_contest', { code: contest.code });
const guests = [];
for (const name of ['Mara', 'Tuck', 'Noa', 'Juno']) { const token = await guestSession(); await rpcAs(token, 'join_contest', { code: contest.code, nickname: name }); guests.push({ name, token }); await sleep(30); }
check(contest.format === 'bracket', `a contest of up to 16 is a bracket (${contest.code})`);

// 1. Start, from the lobby.
await A.go(`${A.base}index.html?contest=${contest.code}&auto`);
await A.waitFor(`${shown('lobby-start')} && !document.getElementById('lobby-start').disabled && /Juno/.test(document.getElementById('lobby-list').innerText)`, 20000);
await A.evaluate(`document.getElementById('lobby-start').click()`);
check(/Round 1.*Heat 1.*Heat 2/.test(await A.waitFor(`/Heat 2/.test(${bracketText}) && ${bracketText}`, 15000) || ''), `the lobby shows round 1's two heats: ${await A.evaluate(bracketText)}`);
const heats = await get(`heats?contest_id=eq.${contest.id}&round=eq.1&select=id,number,starts_at,heat_entries(entrant_id)&order=number`);
const ents = await get(`entrants?contest_id=eq.${contest.id}&select=id,name,seed_rank`);
const seedsOf = (ht) => ht.heat_entries.map((x) => ents.find((e) => e.id === x.entrant_id).seed_rank).sort().join(',');
check(heats.length === 2 && seedsOf(heats[0]) === '1,4,5' && seedsOf(heats[1]) === '2,3', `snake seeding: heat 1 ${seedsOf(heats[0])}, heat 2 ${seedsOf(heats[1])}`);
await A.shot('1-round1');

// 2. The guests ride (on the server's clock): low scores in the host's heat (Noa 1.5, Juno 1), Mara and Tuck 5 and 4.
const scores = { Mara: 5, Tuck: 4, Noa: 1.5, Juno: 1 };
await sleep(Math.max(0, Date.parse(heats[0].starts_at) - Date.now()) + 3000);
for (const g of guests) {
  const e = ents.find((x) => x.name === g.name), ht = heats.find((x) => x.heat_entries.some((y) => y.entrant_id === e.id));
  await rpcAs(g.token, 'submit_ride', { heat_id: ht.id, wave_no: 1, score: scores[g.name], judges: Array(5).fill(scores[g.name]), caught_s: 1 });
  await rpcAs(g.token, 'finish_heat', { heat_id: ht.id });
}
await rpcAs(guests[0].token, 'close_heat', { heat_id: heats[1].id }); // (heat 2 is done; the round waits for heat 1)
check((await get(`heats?contest_id=eq.${contest.id}&round=eq.2&select=id`)).length === 0, 'heat 2 closed; no final while heat 1 is on');

// 3. The host rides; their heat closes last and the final is built.
const res = await A.waitFor(`window.__heatFinal === true && document.getElementById('results-title').textContent`, 180000);
check(res === "You're through!", `the host's results: "${res}" (${await A.evaluate(`document.getElementById('results-sub').textContent`)})`);
check(/Round 1 · Heat 1/.test(await A.evaluate(`document.getElementById('results-sub').textContent`)), '... round 1, heat 1');
await A.shot('2-through');
const final = await get(`heats?contest_id=eq.${contest.id}&round=eq.2&select=id,starts_at,heat_entries(entrant_id)`);
const finalNames = final[0]?.heat_entries.map((x) => ents.find((e) => e.id === x.entrant_id).name).sort().join(',');
check(final.length === 1 && finalNames === [handle, 'Mara', 'Noa'].sort().join(','), `the final (Mara alone from the heat of 2): ${finalNames}`);
await A.evaluate(`document.getElementById('results').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))`);
const br = await A.waitFor(`${shown('bracket')} && /Final/.test(${bracketText}) && ${bracketText}`, 20000);
check(!!br && /Noa ✓/.test(br) && /Mara ✓/.test(br) && /Tuck/.test(br) && !/Tuck ✓/.test(br) && !/Juno ✓/.test(br), `back in the lobby: the bracket with the final, who went through and who's out: ${br}`);
check(await A.evaluate(`[...document.querySelectorAll('#bracket .row.out')].some((r) => /Juno/.test(r.textContent))`), '... Juno greyed out');
await A.shot('3-bracket');

// 4. Into the final.
check(/Your heat starts in/.test(await A.waitFor(`/starts in/.test(document.getElementById('lobby-msg').textContent) && document.getElementById('lobby-msg').textContent`, 15000) || ''), 'the host counts down to the final');
check(!!(await A.waitFor(`window.__contestHeat && window.__contestHeat.final && window.__contestHeat.round === 2 && window.__heat && window.__heat.surfers.length === 3`, 60000)), 'and drops into the final with the other two');

await A.done();
