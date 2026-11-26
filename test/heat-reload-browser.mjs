// A reload mid-heat (the user, 2026-11-26): you land back in your live heat, your scored waves still on the board, the
// heat's clock carrying on, and you go on from the next wave of the set (not the first again), numbered after the ones
// you rode. npm run db:start first, then: npm run test:heat-reload-browser [shotPrefix]
import { execSync } from 'node:child_process';
import { openBrowser, sleep, root } from './browser-lib.mjs';

const API = process.env.SB_URL || 'http://127.0.0.1:55321';
const PK = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';
const SECRET = process.env.SB_SECRET || JSON.parse(execSync('npx supabase status -o json', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString()).SECRET_KEY;
const H = { apikey: SECRET, authorization: `Bearer ${SECRET}`, 'content-type': 'application/json' };
const post = async (t, body) => { const r = await fetch(`${API}/rest/v1/${t}`, { method: 'POST', headers: { ...H, prefer: 'return=representation' }, body: JSON.stringify(body) }); if (!r.ok) throw new Error(`${t}: ${await r.text()}`); };
const rpcAs = async (tok, fn, args) => { const r = await fetch(`${API}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: PK, authorization: `Bearer ${tok}`, 'content-type': 'application/json' }, body: JSON.stringify(args) }); const t = await r.text(); if (!r.ok) throw new Error(`${fn}: ${t}`); return JSON.parse(t); };
const session = async (email) => {
  const g = await (await fetch(`${API}/auth/v1/admin/generate_link`, { method: 'POST', headers: H, body: JSON.stringify({ type: 'magiclink', email }) })).json();
  return (await fetch(`${API}/auth/v1/verify`, { method: 'POST', headers: { apikey: PK, 'content-type': 'application/json' }, body: JSON.stringify({ type: g.verification_type, token_hash: g.hashed_token }) })).json();
};
const ridesOf = async (heatId) => (await fetch(`${API}/rest/v1/rides?heat_id=eq.${heatId}&select=entrant_id,wave_no,score&order=wave_no`, { headers: H })).json();

// A contest of two, three waves each; you (on autopilot) in the browser.
const stamp = Date.now();
const me = await session(`reload-${stamp}@example.com`), other = await session(`reload-o-${stamp}@example.com`);
await post('profiles', { id: me.user.id, handle: `rl${stamp % 1e7}` });
await post('entitlements', { user_id: me.user.id, kind: 'pro', source: 'grant', expires_at: new Date(Date.now() + 864e5).toISOString(), note: 'test' });
const k = await rpcAs(me.access_token, 'create_contest', { name: 'Reload', wave: 'point', end_waves: 3, max_entrants: 4 });
await rpcAs(me.access_token, 'join_contest', { code: k.code });
await rpcAs(other.access_token, 'join_contest', { code: k.code, nickname: 'Gus' });
const heat = await rpcAs(me.access_token, 'start_contest', { contest_id: k.id });

const b = await openBrowser({ shots: process.argv[2] });
const { check, evaluate, waitFor, go, shot } = b;
await go(`${b.base}index.html`); await sleep(1000);
await evaluate(`localStorage.setItem('rys-rad-waves-auth', ${JSON.stringify(JSON.stringify(me))})`);
await go(`${b.base}index.html?contest=${k.code}&go&auto`);
const seaN = `import('./src/sea.js').then((m) => m.SEA.n)`;
const myWaves = `JSON.stringify(window.__heat ? window.__heat.surfers[0].waves.map((w) => [w.n, w.score]) : null)`;
check(!!(await waitFor(`window.__dbg && window.__dbg.state === 'play' && window.__heat?.live`, 40000)), 'in the live heat');

// Your first wave is scored; then a reload.
let rides = [];
for (let i = 0; i < 90 && !rides.length; i++) { await sleep(1000); rides = await ridesOf(heat.id); }
check(rides.length === 1 && rides[0].wave_no === 1, `wave 1 scored on the server: ${rides[0]?.score}`);
await sleep(1500);
const before = { waves: await evaluate(myWaves), n: await evaluate(seaN), t: await evaluate('window.__heat.time') };
await evaluate('location.reload()');
await sleep(3000);
check(!!(await waitFor(`window.__dbg && window.__dbg.state === 'play' && window.__heat?.live`, 30000)), 'after the reload: back in the live heat, surfing');
const after = { waves: await evaluate(myWaves), n: await evaluate(seaN), t: await evaluate('window.__heat.time') };
check(after.waves === before.waves, `your scored wave is still on the board: ${after.waves}`);
check(after.n === before.n + 1, `the next wave of the set (wave ${after.n}), not the first again (was on ${before.n})`);
check(after.t > before.t, `the heat's clock carried on: ${before.t.toFixed(1)} s, then ${after.t.toFixed(1)} s`);
await shot('after-reload');

// The next wave: saved as wave 2.
for (let i = 0; i < 90 && rides.length < 2; i++) { await sleep(1000); rides = await ridesOf(heat.id); }
check(rides.map((r) => r.wave_no).join(',') === '1,2', `the next wave is wave 2 on the server (${rides.map((r) => `${r.wave_no}: ${r.score}`).join(', ')})`);
await b.done();
