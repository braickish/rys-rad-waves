// The lobby in two browsers (accounts plan task 11; headless Chrome x2, the local stack with Realtime):
//   1. a guest (signed out) can't host; a wrong code says so
//   2. a Pro member hosts a contest on Pipe (5 waves) from Compete live and lands in its lobby, entered as their handle
//   3. the guest, without Pro, finds it by code ("Have a contest code?") and by link, sees the preview, joins with a nickname (an anonymous session made then); both
//      lobbies list both surfers, here
//   4. the host starts: both count down and drop into the heat on Pipe, 5 waves, the heat's seed, different jerseys
//   5. the builder's My Breaks has Host on each break; index.html?host=<id> opens the form with it picked
// npm run db:start first, then: npm run test:lobby-browser [shotPrefix]
import { execSync } from 'node:child_process';
import { openBrowser, signInOnTitle, sleep, root } from './browser-lib.mjs';

const API = process.env.SB_URL || 'http://127.0.0.1:55321';
const SECRET = process.env.SB_SECRET || JSON.parse(execSync('npx supabase status -o json', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString()).SECRET_KEY;
const H = { apikey: SECRET, authorization: `Bearer ${SECRET}`, 'content-type': 'application/json' };
const post = async (table, body) => { const r = await fetch(`${API}/rest/v1/${table}`, { method: 'POST', headers: { ...H, prefer: 'return=representation' }, body: JSON.stringify(body) }); if (!r.ok) throw new Error(`${table}: ${r.status} ${await r.text()}`); return (await r.json())[0]; };
const get = async (q) => (await fetch(`${API}/rest/v1/${q}`, { headers: H })).json();

const shots = process.argv[2];
const A = await openBrowser({ shots: shots && `${shots}-host` }); // the host
const B = await openBrowser({ shots: shots && `${shots}-guest` }); // the guest
const check = A.check;
const shown = (id) => `(() => { const e = document.getElementById('${id}'); return !!e && e.offsetParent !== null; })()`;
const ready = (b) => b.waitFor(`document.querySelectorAll('#waves button').length > 0`, 20000);
const listText = `[...document.querySelectorAll('#lobby-list li')].map((li) => li.innerText.replace(/\\s+/g, ' ')).join(' | ')`;
const msg = (id) => `document.getElementById('${id}').textContent`;

// 1. A guest can't host; a wrong code.
await B.go(`${B.base}?wave=point`); await ready(B);
await B.evaluate(`document.getElementById('go-compete').click(); document.getElementById('go-host').click()`);
check(/Log in or sign up below/.test(await B.waitFor(`/Log in/.test(${msg('host-msg')}) && ${msg('host-msg')}`, 15000) || ''), 'signed out: hosting asks you to sign in');
await B.evaluate(`document.getElementById('step-back').click(); document.getElementById('join-code').value = 'ZZZZZZ'; document.getElementById('join-form').requestSubmit()`);
check(/No contest has that code/.test(await B.waitFor(`!document.getElementById('compete-msg').hidden && ${msg('compete-msg')}`, 15000) || ''), 'a wrong code says so');

// 2. The host: a Pro member with a handle.
const email = `host-${Date.now()}@example.com`;
await A.go(`${A.base}?wave=point`);
await signInOnTitle(A, email);
await A.waitFor(`${A.vis('acct-handle-form')} || ${A.vis('acct-who')}`, 20000);
const uid = await A.evaluate(`JSON.parse(localStorage.getItem('rys-rad-waves-auth')).user.id`);
const handle = `host${Date.now() % 1e7}`;
await post('profiles', { id: uid, handle });
await post('entitlements', { user_id: uid, kind: 'pro', source: 'grant', expires_at: new Date(Date.now() + 30 * 864e5).toISOString(), note: 'test' });
const brk = await post('breaks', { owner: uid, name: 'Test Bombie', design: {}, ride: { peaks: [1] }, visibility: 'private' });
await A.go(`${A.base}?wave=point`); await ready(A);
await A.evaluate(`document.getElementById('go-compete').click(); document.getElementById('go-host').click()`);
check(!!(await A.waitFor(`${shown('host-form')} && document.getElementById('host-name').value === '${handle}\\'s contest' && document.querySelectorAll('#host-spot option').length === 7`, 15000)),
  'Host a contest: the form, named for you, the six waves and your break');
await A.evaluate(`document.getElementById('host-spot').value = 'wave:reef'; document.getElementById('host-len').value = '5w'; document.getElementById('host-form').requestSubmit()`);
const code = await A.waitFor(`${shown('lobby')} && /^[A-Z0-9]{6}$/.test(document.getElementById('lobby-code').textContent) && document.getElementById('lobby-code').textContent`, 20000);
check(!!code && (await A.evaluate(`new URLSearchParams(location.search).get('contest')`)) === code, `created: the lobby, code ${code}, in the address`);
check(/Pipe · 5 waves · hosted by @/.test(await A.evaluate(msg('lobby-what'))), `... on Pipe, 5 waves (${await A.evaluate(msg('lobby-what'))})`);
check(!!(await A.waitFor(`new RegExp('${handle} \\\\(you\\\\) here').test(${listText})`, 15000)), `the host is in, and here (${await A.evaluate(listText)})`);
check(await A.evaluate(`${shown('lobby-start')} && ${shown('lobby-cancel')}`), 'the host has Start and Cancel');
await A.shot('1-lobby');

// 3. The guest, without Pro (sales open: ?paywall): Compete live is locked, but "Have a contest code?" finds it.
await B.go(`${B.base}?paywall`); await ready(B);
check(!!(await B.waitFor(`document.getElementById('go-compete').classList.contains('locked') && ${shown('go-code')}`, 15000)), 'without Pro: Compete live locked, "Have a contest code?" offered');
await B.evaluate(`document.getElementById('go-code').click()`);
check(await B.evaluate(`${shown('join-code')} && !${shown('go-solo')} && !${shown('go-host')} && document.getElementById('step-title').textContent === 'Join a contest'`), '... just the code box (no Solo, no Host)');
await B.evaluate(`document.getElementById('join-code').value = 'ZZZZZZ'; document.getElementById('join-form').requestSubmit()`);
check(!!(await B.waitFor(`${shown('join-code')} && /No contest has that code/.test(${msg('compete-msg')})`, 15000)), 'a wrong code: back on the code box, saying so');
await B.evaluate(`document.getElementById('join-code').value = '${code.toLowerCase()}'; document.getElementById('join-form').requestSubmit()`);
check(!!(await B.waitFor(`${shown('lobby')} && /1 of 8 in/.test(${listText})`, 20000)), 'the right code (any case): the lobby');
await B.evaluate(`document.getElementById('step-back').click()`);
check(await B.evaluate(`${shown('go-code')} && !${shown('compete-menu')}`), 'Back from that lobby: the landing, not the locked Compete live');
// ... and by link.
await B.go(`${B.base}index.html?contest=${code}`);
check(!!(await B.waitFor(`${shown('lobby')} && /1 of 8 in/.test(${listText}) && ${shown('lobby-join')}`, 20000)), 'the link opens the lobby: a preview, 1 of 8 in, Join');
await B.evaluate(`document.getElementById('lobby-nick').value = 'Kai'; document.getElementById('lobby-join').requestSubmit()`);
check(!!(await B.waitFor(`/Kai \\(you\\)/.test(${listText}) && new RegExp('${handle}').test(${listText})`, 20000)), `the guest is in: ${await B.evaluate(listText)}`);
check(await B.evaluate(`JSON.parse(localStorage.getItem('rys-rad-waves-auth')).user.is_anonymous === true`), '... on a guest session');
check(!!(await A.waitFor(`/Kai here/.test(${listText})`, 20000)), `the host sees them join, and here: ${await A.evaluate(listText)}`);
check(!!(await B.waitFor(`new RegExp('${handle} here').test(${listText})`, 20000)), `the guest sees the host here: ${await B.evaluate(listText)}`);
check(await B.evaluate(`!${shown('lobby-start')} && ${shown('lobby-leave')}`), 'the guest has Leave, not Start');
await B.shot('2-joined');

// 4. Start.
await A.evaluate(`document.getElementById('lobby-start').click()`);
check(!!(await B.waitFor(`/starts in/.test(${msg('lobby-msg')})`, 20000)), 'the guest counts down');
const inHeat = (b) => b.waitFor(`window.__heat && document.getElementById('title').hidden && location.search.includes('heat=5w') && location.search`, 40000);
const [qa, qb] = await Promise.all([inHeat(A), inHeat(B)]);
check(!!qa && !!qb, `both drop into the heat (${qb})`);
const pa = new URLSearchParams(qa || ''), pb = new URLSearchParams(qb || '');
const [heat] = await get(`heats?contest_id=eq.${(await get(`contests?code=eq.${code}&select=id`))[0]?.id}&select=seed`);
check(pa.get('wave') === 'reef' && pb.get('wave') === 'reef' && pa.get('seed') === String(heat?.seed) && pb.get('seed') === String(heat?.seed),
  `same wave and the heat's seed on both (${pa.get('seed')} / ${pb.get('seed')} / ${heat?.seed})`);
check(pa.get('jersey') && pb.get('jersey') && pa.get('jersey') !== pb.get('jersey') && pb.get('bots') === '0', `their own jerseys (${pa.get('jersey')}, ${pb.get('jersey')}), no bots`);
await sleep(1500); await B.shot('3-heat');

// 5. From the builder.
await A.go(`${A.base}builder.html`);
check(!!(await A.waitFor(`[...document.querySelectorAll('#breaks a')].some((a) => a.textContent === 'Host' && a.getAttribute('href') === 'index.html?host=${brk.id}')`, 20000)), 'My Breaks: Host on your break');
await A.go(`${A.base}index.html?host=${brk.id}`);
check(!!(await A.waitFor(`${shown('host-form')} && document.getElementById('host-spot').value === 'break:${brk.id}'`, 20000)), '?host= opens the form with that break picked');

await B.close();
await A.done();
