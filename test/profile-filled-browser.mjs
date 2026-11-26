// The profile filled in (accounts plan task 14) in the browser, against the local stack (and Open-Meteo's geocoder):
//   1. account: typing a town suggests real ones; a pick fills the country and puts it on the map; saved
//      a typed town (no pick) saves off the map; a rude town name is refused
//   2. the public page: where they surf from, their public breaks (Surf it; not the private one), their results in a
//      public contest that's over
//   3. the contest page: the heat, places, totals, each wave; ▶ opens the wave's replay in the game
//   4. the map: a dot for the town, the country counted
//   5. account: Your contests lists it
// npm run db:start first, then: npm run test:profile-filled-browser [shotPrefix]
import { execSync } from 'node:child_process';
import { openBrowser, signInOnTitle, sleep, root } from './browser-lib.mjs';

const API = process.env.SB_URL || 'http://127.0.0.1:55321';
const PK = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';
const SECRET = process.env.SB_SECRET || JSON.parse(execSync('npx supabase status -o json', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString()).SECRET_KEY;
const H = { apikey: SECRET, authorization: `Bearer ${SECRET}`, 'content-type': 'application/json' };
const post = async (table, body) => { const r = await fetch(`${API}/rest/v1/${table}`, { method: 'POST', headers: { ...H, prefer: 'return=representation' }, body: JSON.stringify(body) }); if (!r.ok) throw new Error(`${table}: ${r.status} ${await r.text()}`); return (await r.json())[0]; };
const get = async (q) => (await fetch(`${API}/rest/v1/${q}`, { headers: H })).json();
const rpcAs = async (token, fn, args) => { const r = await fetch(`${API}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: PK, authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(args) }); const t = await r.text(); if (!r.ok) throw new Error(`${fn}: ${t}`); return t ? JSON.parse(t) : null; };
const guestSession = async () => { const j = await (await fetch(`${API}/auth/v1/signup`, { method: 'POST', headers: { apikey: PK, 'content-type': 'application/json' }, body: '{}' })).json(); return { token: j.access_token, id: j.user.id }; };

const b = await openBrowser({ shots: process.argv[2] });
const { check, evaluate, waitFor, go, shot } = b;
const shown = (id) => `(() => { const e = document.getElementById('${id}'); return !!e && e.offsetParent !== null; })()`;

// A Pro member with a handle.
await go(`${b.base}?wave=point`);
await signInOnTitle(b, `where-${Date.now()}@example.com`);
await waitFor(`${b.vis('acct-handle-form')} || ${b.vis('acct-who')}`, 20000);
const me = await evaluate(`JSON.parse(localStorage.getItem('rys-rad-waves-auth'))`);
const handle = `wh${Date.now() % 1e7}`;
await post('profiles', { id: me.user.id, handle });
await post('entitlements', { user_id: me.user.id, kind: 'pro', source: 'grant', expires_at: new Date(Date.now() + 30 * 864e5).toISOString(), note: 'test' });

// 1. Where you surf from.
await go(`${b.base}account.html`);
await waitFor(`${shown('profile-form')} && document.getElementById('handle').value === '${handle}'`, 20000);
check((await evaluate(`document.getElementById('country').options.length`)) === 251, 'a country picker: 250 countries (and "Country")');
await evaluate(`document.getElementById('city').focus()`); await b.type('Ragla');
const sug = await waitFor(`!document.getElementById('city-list').hidden && document.getElementById('city-list').innerText`, 15000);
check(/Raglan/.test(sug || '') && /NZ/.test(sug || ''), `typing suggests real towns: ${(sug || '').replace(/\n/g, ' | ')}`);
await shot('1-suggest');
await evaluate(`[...document.querySelectorAll('#city-list button')].find((x) => /NZ/.test(x.textContent)).click()`);
check(await evaluate(`document.getElementById('city').value === 'Raglan' && document.getElementById('country').value === 'NZ' && /On the map/.test(document.getElementById('place-hint').textContent)`), 'a pick fills the town and New Zealand, "On the map."');
await evaluate(`document.getElementById('profile-form').requestSubmit()`);
await waitFor(`/Saved/.test(document.getElementById('save-msg').textContent)`, 10000);
let [p] = await get(`profiles?id=eq.${me.user.id}&select=city,country,lat,lng`);
check(p.city === 'Raglan' && p.country === 'NZ' && Math.abs(p.lat + 37.8) < 0.05 && Math.abs(p.lng - 174.88) < 0.05, `saved: ${JSON.stringify(p)}`);
await evaluate(`document.getElementById('city').value = 'Shit Point'; document.getElementById('city').dispatchEvent(new Event('input')); document.getElementById('profile-form').requestSubmit()`);
check(/Keep it clean/.test(await waitFor(`/clean/.test(document.getElementById('save-msg').textContent) && document.getElementById('save-msg').textContent`, 10000) || ''), 'a rude town name is refused');
await go(`${b.base}account.html`);
await waitFor(`document.getElementById('city').value === 'Raglan'`, 15000);
check(await evaluate(`/On the map/.test(document.getElementById('place-hint').textContent)`), 'reopened: still Raglan, on the map');

// The public page's makings: a public break and a private one; a public contest, over (the member and a guest, one wave each).
await post('breaks', { owner: me.user.id, name: 'Open Bombie', design: {}, ride: { peaks: [1] }, visibility: 'public' });
await post('breaks', { owner: me.user.id, name: 'Secret Slab', design: {}, ride: { peaks: [2] }, visibility: 'private' });
const k = await rpcAs(me.access_token, 'create_contest', { name: 'Raglan Open', wave: 'point', end_waves: 1, max_entrants: 4, visibility: 'public' });
await rpcAs(me.access_token, 'join_contest', { code: k.code });
const g = await guestSession();
await rpcAs(g.token, 'join_contest', { code: k.code, nickname: 'Kai' });
const heat = await rpcAs(me.access_token, 'start_contest', { contest_id: k.id });
await sleep(Math.max(0, Date.parse(heat.starts_at) - Date.now()) + 1500);
// (a ride log for the member's wave, in their own folder: what the game uploads)
const logPath = `${me.user.id}/${heat.id}/1.json`;
const up = await fetch(`${API}/storage/v1/object/replays/${logPath}`, { method: 'POST', headers: { apikey: PK, authorization: `Bearer ${me.access_token}`, 'content-type': 'application/json' }, body: JSON.stringify({ v: 1, wave: 'point', test: true }) });
check(up.ok, `the member's ride log uploaded (${up.status})`);
await rpcAs(me.access_token, 'submit_ride', { heat_id: heat.id, wave_no: 1, score: 8.25, judges: [8, 8.5, 8, 8.5, 8], caught_s: 1, replay_path: logPath });
await rpcAs(g.token, 'submit_ride', { heat_id: heat.id, wave_no: 1, score: 6.1, judges: [6, 6, 6.5, 6, 6], caught_s: 1 });
await rpcAs(me.access_token, 'finish_heat', { heat_id: heat.id });
await rpcAs(g.token, 'finish_heat', { heat_id: heat.id });
await rpcAs(me.access_token, 'close_heat', { heat_id: heat.id });

// 2. The public page (signed out: anyone's view).
await evaluate(`localStorage.removeItem('rys-rad-waves-auth')`);
await go(`${b.base}profile.html?u=${handle}`);
check(/Surfs from Raglan, New Zealand/.test(await waitFor(`${shown('p-where')} && document.getElementById('p-where').textContent`, 20000) || ''), `where they surf from: "${await evaluate(`document.getElementById('p-where').textContent`)}"`);
const cards = await waitFor(`document.querySelectorAll('#p-breaks .card').length && [...document.querySelectorAll('#p-breaks .card')].map((x) => x.innerText.replace(/\\n/g, ' ') + ' ' + x.getAttribute('href')).join(' | ')`, 15000);
check(/Open Bombie/.test(cards || '') && /Surf it/.test(cards || '') && /index\.html\?break=/.test(cards || '') && !/Secret Slab/.test(cards || ''), `public breaks, with Surf it (not the private one): ${cards}`);
const res = await waitFor(`document.querySelectorAll('#p-results .result').length && document.getElementById('p-results').innerText.replace(/\\n/g, ' ')`, 15000);
check(/Raglan Open/.test(res || '') && /Won/.test(res || '') && /8\.25/.test(res || ''), `contest results: ${res}`);
await shot('2-profile');

// 3. The contest page.
await evaluate(`document.querySelector('#p-results .result').click()`);
const page = await waitFor(`${shown('contest')} && document.getElementById('contest').innerText.replace(/\\n/g, ' ')`, 20000);
check(/Raglan Open/.test(page || '') && /Won by/.test(page || '') && /1st/.test(page || '') && /Kai/.test(page || ''), `the contest page: ${page}`);
check(await evaluate(`[...document.querySelectorAll('.wave-btn')].some((x) => /▶ 8\\.25/.test(x.textContent) && !x.disabled) && [...document.querySelectorAll('.wave-btn')].some((x) => /^6\\.10$/.test(x.textContent) && x.disabled)`),
  'each wave: ▶ where there\'s a replay, just the score where there isn\'t');
await shot('3-contest');
await evaluate(`[...document.querySelectorAll('.wave-btn')].find((x) => /▶/.test(x.textContent)).click()`);
const to = await waitFor(`/replay=/.test(location.search) && decodeURIComponent(new URLSearchParams(location.search).get('replay'))`, 15000);
check(!!to && /\/storage\/v1\/object\/sign\/replays\//.test(to), '▶ opens the game with the wave\'s replay (a signed link)');
check(!!to && (await fetch(to)).ok, '... which loads');
check(/isn't a whole ride/.test(await waitFor(`!document.getElementById('err').hidden && document.getElementById('err').textContent`, 15000) || ''), '(the test\'s stand-in log isn\'t a ride: the game says so instead of breaking)');

// 4. The map.
await go(`${b.base}map.html`);
check(!!(await waitFor(`window.__mapDots >= 1 && document.querySelectorAll('#map .dot').length >= 1`, 30000)), `the map: dots for towns (${await evaluate('window.__mapDots')})`);
check(/New Zealand/.test(await evaluate(`document.getElementById('m-countries').innerText`)), '... and New Zealand counted');
check(await evaluate(`[...document.querySelectorAll('#map .dot title')].some((t) => /Raglan, New Zealand/.test(t.textContent))`), '... Raglan among them');
await shot('4-map');

// 5. Your contests (signed in again).
const myEmail = (await (await fetch(`${API}/auth/v1/admin/users/${me.user.id}`, { headers: H })).json()).email;
await go(`${b.base}?wave=point`);
await signInOnTitle(b, myEmail);
await waitFor(`${b.vis('acct-who')}`, 20000);
await go(`${b.base}account.html`);
const mine = await waitFor(`document.querySelectorAll('#my-contests .result').length && document.getElementById('my-contests').innerText.replace(/\\n/g, ' ')`, 20000);
check(/Raglan Open/.test(mine || '') && /Over · hosting and surfing/.test(mine || ''), `Your contests: ${mine}`);

await b.done();
