// Watching a contest you're not in (the user, 2026-11-26), against the local stack:
//   1. an unlisted contest of three starts; a signed-out visitor opens its link: no Join, "You're watching", the heat
//   2. a surfer scores: the watcher's board fills in (the total, live, before the heat closes)
//   3. a signed-in player who isn't in it watches too (an unlisted contest: read by its code)
//   4. the heat closes: "Won by …" and the final places
// npm run db:start first, then: npm run test:watch-browser [shotPrefix]
import { execSync } from 'node:child_process';
import { openBrowser, sleep, root } from './browser-lib.mjs';

const API = process.env.SB_URL || 'http://127.0.0.1:55321';
const PK = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';
const SECRET = process.env.SB_SECRET || JSON.parse(execSync('npx supabase status -o json', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString()).SECRET_KEY;
const H = { apikey: SECRET, authorization: `Bearer ${SECRET}`, 'content-type': 'application/json' };
const post = async (table, body) => { const r = await fetch(`${API}/rest/v1/${table}`, { method: 'POST', headers: { ...H, prefer: 'return=representation' }, body: JSON.stringify(body) }); if (!r.ok) throw new Error(`${table}: ${r.status} ${await r.text()}`); return (await r.json())[0]; };
const rpcAs = async (token, fn, args) => { const r = await fetch(`${API}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: PK, authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(args) }); const t = await r.text(); if (!r.ok) throw new Error(`${fn}: ${t}`); return t ? JSON.parse(t) : null; };
const session = async (email) => {
  const g = await (await fetch(`${API}/auth/v1/admin/generate_link`, { method: 'POST', headers: H, body: JSON.stringify({ type: 'magiclink', email }) })).json();
  const s = await (await fetch(`${API}/auth/v1/verify`, { method: 'POST', headers: { apikey: PK, 'content-type': 'application/json' }, body: JSON.stringify({ type: g.verification_type, token_hash: g.hashed_token }) })).json();
  return { token: s.access_token, id: s.user.id, raw: s };
};

const b = await openBrowser({ shots: process.argv[2] });
const { check, evaluate, waitFor, go, shot } = b;

// 1. The contest: a host and two more, unlisted, one wave each.
const stamp = Date.now();
const host = await session(`watchhost-${stamp}@example.com`);
await post('profiles', { id: host.id, handle: `wh${stamp % 1e7}` });
await post('entitlements', { user_id: host.id, kind: 'pro', source: 'grant', expires_at: new Date(Date.now() + 864e5).toISOString(), note: 'test' });
const k = await rpcAs(host.token, 'create_contest', { name: 'Watch Me', wave: 'point', end_waves: 1, max_entrants: 4 });
await rpcAs(host.token, 'join_contest', { code: k.code });
const people = [host];
for (const n of ['Mara', 'Tuck']) { const p = await session(`watch-${n.toLowerCase()}-${stamp}@example.com`); await rpcAs(p.token, 'join_contest', { code: k.code, nickname: n }); people.push(p); }
const heat = await rpcAs(host.token, 'start_contest', { contest_id: k.id });
const text = (id) => `(document.getElementById('${id}')?.innerText || '')`;

await go(`${b.base}index.html?contest=${k.code}`);
check(!!(await waitFor(`/You're watching/.test(${text('lobby-msg')}) && document.getElementById('lobby-join').hidden && !document.getElementById('bracket').hidden`, 20000)),
  `signed out, after the start: no Join, "${await evaluate(text('lobby-msg'))}", the heat`);
check(/Mara/.test(await evaluate(text('bracket'))) && /Tuck/.test(await evaluate(text('bracket'))), "the heat's surfers, by name");
check(await evaluate(`['lobby-start', 'lobby-leave', 'lobby-cancel', 'lobby-join'].every((id) => document.getElementById(id).hidden)`), 'a watcher gets no Start, Leave, Cancel or Join');

// 2. Mara scores: the board fills in before the heat closes.
await sleep(Math.max(0, Date.parse(heat.starts_at) - Date.now()) + 1500);
await rpcAs(people[1].token, 'submit_ride', { heat_id: heat.id, wave_no: 1, score: 6.4, judges: Array(5).fill(6.4), caught_s: 2 });
check(!!(await waitFor(`/1\\. Mara\\s*6\\.40/.test(${text('bracket')})`, 25000)), `Mara's 6.40 shows, live, at the top: ${(await evaluate(text('bracket'))).replace(/\s+/g, ' ')}`);
await shot('1-watching');

// 3. Signed in, not in it: watches too.
const other = await session(`watch-other-${stamp}@example.com`);
await evaluate(`localStorage.setItem('rys-rad-waves-auth', ${JSON.stringify(JSON.stringify(other.raw))})`);
await go(`${b.base}index.html?contest=${k.code}`);
check(!!(await waitFor(`/You're watching/.test(${text('lobby-msg')}) && /Mara\\s*6\\.40/.test(${text('bracket')})`, 20000)), 'signed in but not in it: watching, the same board');
check(await evaluate(`document.getElementById('lobby-cancel').hidden && document.getElementById('lobby-start').hidden`), '... and no host buttons');

// 4. The rest ride, the heat closes: the winner.
await rpcAs(people[2].token, 'submit_ride', { heat_id: heat.id, wave_no: 1, score: 7.1, judges: Array(5).fill(7.1), caught_s: 3 });
await rpcAs(people[0].token, 'submit_ride', { heat_id: heat.id, wave_no: 1, score: 3.2, judges: Array(5).fill(3.2), caught_s: 4 });
for (const p of people) await rpcAs(p.token, 'finish_heat', { heat_id: heat.id });
await rpcAs(host.token, 'close_heat', { heat_id: heat.id });
check(!!(await waitFor(`/Won by Tuck/.test(${text('lobby-msg')})`, 25000)), `the heat closes: "${await evaluate(text('lobby-msg'))}"`);
check(/1\. Tuck\s*7\.10[\s\S]*2\. Mara\s*6\.40/.test(await evaluate(text('bracket'))), 'the final places');
await shot('2-done');
await evaluate(`localStorage.removeItem('rys-rad-waves-auth')`);
await b.done();
