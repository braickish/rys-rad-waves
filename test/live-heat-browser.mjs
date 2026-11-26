// A live heat end to end in two browsers (accounts plan task 12; headless Chrome x2, the local stack with Realtime):
//   1. a Pro host makes a 1-wave contest on Raglan and enters it; a guest joins by link with a nickname
//   2. the host starts; both drop in on the same heat and ride their wave (the autopilot)
//   3. each wave goes to the server with its replay in Storage, and onto the other's board
//   4. when both have finished, the heat closes: both results cards agree, final, with the server's places and totals
//   5. the guest keeps their scores: an email, the link, and the same account (no longer a guest) still owns the entry
// npm run db:start first, then: npm run test:live-heat-browser [shotPrefix]
import { execSync } from 'node:child_process';
import { openBrowser, signInOnTitle, latestLink, sleep, root } from './browser-lib.mjs';

const API = process.env.SB_URL || 'http://127.0.0.1:55321';
const PK = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';
const SECRET = process.env.SB_SECRET || JSON.parse(execSync('npx supabase status -o json', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString()).SECRET_KEY;
const H = { apikey: SECRET, authorization: `Bearer ${SECRET}`, 'content-type': 'application/json' };
const post = async (table, body) => { const r = await fetch(`${API}/rest/v1/${table}`, { method: 'POST', headers: { ...H, prefer: 'return=representation' }, body: JSON.stringify(body) }); if (!r.ok) throw new Error(`${table}: ${r.status} ${await r.text()}`); return (await r.json())[0]; };
const get = async (q) => (await fetch(`${API}/rest/v1/${q}`, { headers: H })).json();
const rpcAs = async (token, fn, args) => { const r = await fetch(`${API}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: PK, authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(args) }); const j = await r.json(); if (!r.ok) throw new Error(`${fn}: ${JSON.stringify(j)}`); return j; };

const shots = process.argv[2];
const A = await openBrowser({ shots: shots && `${shots}-host` });
const B = await openBrowser({ shots: shots && `${shots}-guest` });
const check = A.check;
const shown = (id) => `(() => { const e = document.getElementById('${id}'); return !!e && e.offsetParent !== null; })()`;
const auth = (b) => b.evaluate(`JSON.parse(localStorage.getItem('rys-rad-waves-auth'))`);

// 1. The host and the contest (1 wave, so a heat is one ride each).
const email = `livehost-${Date.now()}@example.com`;
await A.go(`${A.base}?wave=point`);
await signInOnTitle(A, email);
await A.waitFor(`${A.vis('acct-handle-form')} || ${A.vis('acct-who')}`, 20000);
const hostAuth = await auth(A);
const handle = `live${Date.now() % 1e7}`;
await post('profiles', { id: hostAuth.user.id, handle });
await post('entitlements', { user_id: hostAuth.user.id, kind: 'pro', source: 'grant', expires_at: new Date(Date.now() + 30 * 864e5).toISOString(), note: 'test' });
const contest = await rpcAs(hostAuth.access_token, 'create_contest', { name: 'Live Test', wave: 'point', end_waves: 1 });
await rpcAs(hostAuth.access_token, 'join_contest', { code: contest.code });
check(/^[A-Z0-9]{6}$/.test(contest.code), `a 1-wave contest on Raglan: ${contest.code}`);

await B.go(`${B.base}index.html?contest=${contest.code}&auto`);
await B.waitFor(`${shown('lobby-join')}`, 20000);
await B.evaluate(`document.getElementById('lobby-nick').value = 'Kai'; document.getElementById('lobby-join').requestSubmit()`);
check(!!(await B.waitFor(`/Kai \\(you\\)/.test(document.getElementById('lobby-list').innerText)`, 20000)), 'the guest joins');
const guestAuth = await auth(B);

// 2. Start: both drop in and ride.
await A.go(`${A.base}index.html?contest=${contest.code}&auto`);
await A.waitFor(`${shown('lobby-start')} && !document.getElementById('lobby-start').disabled && /Kai/.test(document.getElementById('lobby-list').innerText)`, 20000);
await A.evaluate(`document.getElementById('lobby-start').click()`);
const riding = (b) => b.waitFor(`window.__heat && window.__heat.live && window.__dbg && window.__dbg.state === 'play'`, 40000);
const [ra, rb] = await Promise.all([riding(A), riding(B)]);
check(!!ra && !!rb, 'both drop into the live heat and ride');
check((await B.evaluate(`window.__heat.surfers.map((s) => s.name).join(',')`)) === `Kai,${handle}`, `the guest's board: themselves and the host (${await B.evaluate(`window.__heat.surfers.map((s) => s.name).join(',')`)})`);
check(Math.abs((await A.evaluate('window.__heat.time')) - (await B.evaluate('window.__heat.time'))) < 1.5, 'both heat clocks run together (the server\'s)');
await sleep(2000); await B.shot('1-riding');

// 3-4. Each rides their wave; the heat closes once both are done.
const final = (b) => b.waitFor(`window.__heatFinal === true && window.__heatResults`, 180000);
const [fa, fb] = await Promise.all([final(A), final(B)]);
check(!!fa && !!fb, 'both results cards are final');
const byName = (l) => JSON.stringify([...(l || [])].sort((a, b) => a.place - b.place || a.name.localeCompare(b.name))); // (tied surfers: each screen lists itself first)
const ja = byName(fa), jb = byName(fb);
check(ja === jb, `both screens agree: ${jb}`);
const [heat] = await get(`heats?contest_id=eq.${contest.id}&select=id,state,heat_entries(entrant_id,place,total)`);
const ents = await get(`entrants?contest_id=eq.${contest.id}&select=id,name,user_id`);
const server = heat.heat_entries.map((e) => ({ name: ents.find((x) => x.id === e.entrant_id).name, place: e.place, total: Number(e.total) })).sort((a, b) => a.place - b.place || a.name.localeCompare(b.name));
const screen = (fb || []).map((r) => ({ name: r.name, place: r.place, total: r.total })).sort((a, b) => a.place - b.place || a.name.localeCompare(b.name));
check(heat.state === 'done' && JSON.stringify(server) === JSON.stringify(screen), `the server's places and totals: ${JSON.stringify(server)}`);
const rides = await get(`rides?heat_id=eq.${heat.id}&select=entrant_id,wave_no,score,replay_path`);
check(rides.length === 2 && rides.every((r) => r.wave_no === 1 && r.replay_path), `one wave each, with a replay path (${rides.map((r) => `${r.score} ${r.replay_path ? 'log' : 'no log'}`).join(', ')})`);
const log = rides[0] && await fetch(`${API}/storage/v1/object/replays/${rides[0].replay_path}`, { headers: { apikey: SECRET, authorization: `Bearer ${SECRET}` } });
check(log?.ok && /"wave":"point"/.test(await log.text()), 'the replay is in Storage');
// The score checks (task 15): the game asked the server to ride each wave again from its log; both pass.
let checks = [];
for (let i = 0; i < 40; i++) { checks = await get(`ride_checks?select=status,reasons,drift,score,rides!inner(heat_id)&rides.heat_id=eq.${heat.id}`); if (checks.length === 2 && checks.every((x) => x.status !== 'pending')) break; await sleep(500); }
check(checks.length === 2 && checks.every((x) => x.status === 'ok'), `score checks: both waves ride to the same score on the server (${checks.map((x) => `${x.status} ${x.score} drift ${Number(x.drift).toFixed(3)}`).join('; ')})`);
const hostScore = rides.find((r) => ents.find((e) => e.id === r.entrant_id).name === handle)?.score;
check(Number(await B.evaluate(`window.__heat.surfers.find((s) => s.rival).waves[0]?.score`)) === Number(hostScore), `the host's wave reached the guest's board (${hostScore})`);
check(/back to the contest/.test(await B.evaluate(`document.getElementById('results-go').textContent`)), 'the card says: back to the contest');
await B.shot('2-results');

// 5. The guest keeps their scores; the host isn't asked.
check(!(await A.evaluate(shown('results-claim'))) && (await B.evaluate(shown('results-claim'))), '"Keep your scores" for the guest, not the host');
const claim = `kai-${Date.now()}@example.com`;
const sent = Date.now() - 1000;
await B.evaluate(`document.getElementById('claim-email').value = ${JSON.stringify(claim)}; document.getElementById('results-claim').requestSubmit()`);
check(/Check/.test(await B.waitFor(`/Check|wrong|Too many/.test(document.getElementById('claim-msg').textContent) && document.getElementById('claim-msg').textContent`, 10000) || ''), 'the claim email is on its way');
const link = await latestLink(claim, 10000, sent);
check(!!link, 'the link arrived');
await B.go(link);
await B.waitFor(`/account\\.html/.test(location.pathname)`, 15000); await sleep(1500);
const users = await (await fetch(`${API}/auth/v1/admin/users/${guestAuth.user.id}`, { headers: H })).json();
check(users.email === claim && users.is_anonymous === false, `the guest is now an account with that email (${users.email}, anonymous: ${users.is_anonymous})`);
check((await get(`entrants?user_id=eq.${guestAuth.user.id}&select=name`))[0]?.name === 'Kai', '... still owning their entry and its results');
check(!!(await B.waitFor(`${shown('profile-form')} && document.getElementById('save').textContent === 'Make my profile'`, 15000)), '... and lands on the account page to make a profile');

await B.close();
await A.done();
