// A Condensed Open contest end to end (plans/2026-11-27-open-contests.md step 7; headless Chrome x2 and three surfers
// by the API, the local stack and `supabase functions serve`):
//   1. the host form: Format, Condensed: one window for every round; created, the lobby says so
//   2. five in (two rounds: heats of 3 and 2, then a final of 3); the host opens it
//   3. the member surfs round 1 (Surf round 1, one try), then the final's session (Surf the final), each alone, each
//      its own card; then "You've surfed every round"
//   4. the others surf theirs; one who goes out in round 1 surfs a great final session
//   5. the window closes and the checks are in: one tick plays out the whole bracket; the out surfer's final session
//      doesn't count and nobody sees it
//   6. the final's recap, on one heat clock; the results emails: where you went out, or the final
// npm run db:start and supabase functions serve first, then: npm run test:condensed-browser [shotPrefix]
import { execSync } from 'node:child_process';
import { openBrowser, signInOnTitle, sleep, root } from './browser-lib.mjs';

const API = process.env.SB_URL || 'http://127.0.0.1:55321';
const PK = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';
const SECRET = process.env.SB_SECRET || JSON.parse(execSync('npx supabase status -o json', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString()).SECRET_KEY;
const H = { apikey: SECRET, authorization: `Bearer ${SECRET}`, 'content-type': 'application/json' };
const post = async (table, body) => { const r = await fetch(`${API}/rest/v1/${table}`, { method: 'POST', headers: { ...H, prefer: 'return=representation' }, body: JSON.stringify(body) }); if (!r.ok) throw new Error(`${table}: ${r.status} ${await r.text()}`); return (await r.json())[0]; };
const patch = async (q, body) => { const r = await fetch(`${API}/rest/v1/${q}`, { method: 'PATCH', headers: H, body: JSON.stringify(body) }); if (!r.ok) throw new Error(`${q}: ${r.status} ${await r.text()}`); };
const get = async (q) => (await fetch(`${API}/rest/v1/${q}`, { headers: H })).json();
const rpcAs = async (token, fn, args) => { const r = await fetch(`${API}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: PK, authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(args) }); const j = await r.json().catch(() => null); if (!r.ok) throw new Error(`${fn}: ${JSON.stringify(j)}`); return j; };
const readAs = async (token, q) => (await fetch(`${API}/rest/v1/${q}`, { headers: { apikey: PK, authorization: `Bearer ${token}` } })).json();
const tick = () => JSON.parse(execSync(`npx supabase db query "select private.tick_open_contests() as t" -o json`, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().replace(/^[^{[]*/, '')).rows?.[0]?.t;

const shots = process.argv[2];
const A = await openBrowser({ shots: shots && `${shots}-host` });
const B = await openBrowser({ shots: shots && `${shots}-member` });
const check = A.check;
const shown = (id) => `(() => { const e = document.getElementById('${id}'); return !!e && e.offsetParent !== null; })()`;
const auth = (b) => b.evaluate(`JSON.parse(localStorage.getItem('rys-rad-waves-auth'))`);
const txt = (id) => `document.getElementById('${id}').innerText`;
const member = async (b, kind, pro) => {
  const email = `${kind}-${Date.now()}@example.com`;
  await b.go(`${b.base}?wave=point`);
  await signInOnTitle(b, email);
  await b.waitFor(`${b.vis('acct-handle-form')} || ${b.vis('acct-who')}`, 20000);
  const a = await auth(b), handle = `${kind}${Date.now() % 1e7}`;
  await post('profiles', { id: a.user.id, handle });
  if (pro) await post('entitlements', { user_id: a.user.id, kind: 'pro', source: 'grant', expires_at: new Date(Date.now() + 30 * 864e5).toISOString(), note: 'test' });
  return { ...a, handle };
};
// a surfer with no browser: an account by the admin API, signed in by its magic link (no passwords here)
const apiSurfer = async (kind) => {
  const email = `${kind}-${Date.now()}@example.com`;
  const r = await fetch(`${API}/auth/v1/admin/generate_link`, { method: 'POST', headers: H, body: JSON.stringify({ type: 'magiclink', email }) });
  const l = await r.json();
  if (!r.ok) throw new Error(`generate_link: ${r.status} ${JSON.stringify(l)}`);
  // (the link, followed: its redirect carries the session in the fragment)
  const go = await fetch(l.action_link || l.properties?.action_link, { redirect: 'manual' });
  const frag = new URLSearchParams((go.headers.get('location') || '').split('#')[1] || '');
  const token = frag.get('access_token');
  if (!token) throw new Error(`sign in: ${go.status} ${go.headers.get('location')}`);
  const t = { access_token: token, user: await (await fetch(`${API}/auth/v1/user`, { headers: { apikey: PK, authorization: `Bearer ${token}` } })).json() };
  const handle = `${kind}${Date.now() % 1e7}`;
  await post('profiles', { id: t.user.id, handle });
  return { ...t, handle, email };
};
// their heat or session in a round: start it, one wave, done
const surfApi = async (s, cid, round, score) => {
  const ent = (await get(`entrants?contest_id=eq.${cid}&user_id=eq.${s.user.id}&select=id`))[0].id;
  const hs = await get(`heats?contest_id=eq.${cid}&round=eq.${round}&select=id,heat_entries!inner(entrant_id)&heat_entries.entrant_id=eq.${ent}`);
  const hid = hs[0].id;
  await rpcAs(s.access_token, 'start_my_heat', { heat_id: hid });
  if (score != null) await rpcAs(s.access_token, 'submit_ride', { heat_id: hid, wave_no: 1, score, judges: [score, score, score, score, score], caught_s: 0 });
  await rpcAs(s.access_token, 'finish_heat', { heat_id: hid });
};

// 1. The host form.
const host = await member(A, 'chost', true);
await A.go(`${A.base}?wave=point`);
await A.waitFor(`document.querySelectorAll('#waves button').length > 0 && !document.getElementById('go-compete').classList.contains('locked')`, 30000);
await sleep(1000);
await A.evaluate(`document.getElementById('go-compete').click(); document.getElementById('go-open').click()`);
await A.waitFor(shown('host-open'), 10000);
await A.evaluate(`const f = document.getElementById('host-format'); f.value = 'condensed'; f.dispatchEvent(new Event('change'))`);
check((await A.evaluate(`document.querySelectorAll('#host-rounds select').length`)) === 1 && /Every round surfed within/.test(await A.evaluate(txt('host-rounds-label'))), 'Condensed: one window for every round');
await A.waitFor(`document.getElementById('host-name').value`, 10000);
await A.evaluate(`document.querySelector('#host-rounds select').value = '12'; document.getElementById('host-form').requestSubmit()`);
await A.waitFor(`${shown('lobby')} && /Open ·/.test(${txt('lobby-what')})`, 20000);
const code1 = await A.evaluate(`document.getElementById('lobby-code').textContent`);
const c1 = (await get(`contests?code=eq.${code1}&select=open_format,round_hours`))[0];
check(c1?.open_format === 'condensed' && JSON.stringify(c1.round_hours) === '[12]', `created: Condensed, a 12 hour window (${JSON.stringify(c1)})`);
check(/every round in 12 h/.test(await A.evaluate(txt('lobby-what'))), `the lobby says so (${await A.evaluate(txt('lobby-what'))})`);
await A.shot('1-lobby');

// 2. Five in, opened.
const mem = await member(B, 'cmem', false);
const xs = [await apiSurfer('cx1'), await apiSurfer('cx2'), await apiSurfer('cx3')];
const c = await rpcAs(host.access_token, 'create_contest', { name: 'Condensed Test', wave: 'point', end_waves: 1, mode: 'open', open_format: 'condensed', entry: 'open' });
for (const s of [host, mem, ...xs]) { await rpcAs(s.access_token, 'join_contest', { code: c.code }); await sleep(20); } // (seeds by joining order: host 1, member 2, x1 3, x2 4, x3 5)
await A.go(`${A.base}index.html?contest=${c.code}`);
await A.waitFor(`${shown('lobby-start')} && !document.getElementById('lobby-start').disabled`, 20000);
await A.evaluate(`window.confirm = () => true; document.getElementById('lobby-start').click()`);
await A.waitFor(shown('lobby-surf'), 20000);
const heats = await get(`heats?contest_id=eq.${c.id}&select=round,number,session_of&order=round,number`);
check(heats.filter((h) => h.round === 1).length === 2 && heats.filter((h) => h.round === 2 && h.session_of).length === 5, `round 1's two heats, and a final session each (${heats.length} heats)`);

// 3. The member surfs round 1, then the final's session.
await B.go(`${B.base}index.html?contest=${c.code}&auto`);
await B.waitFor(shown('lobby-surf'), 20000);
check((await B.evaluate(txt('lobby-surf'))) === 'Surf round 1' && /Round 1 · Final · closes in/.test(await B.evaluate(txt('lobby-when'))), `Surf round 1; your rounds and the window (${await B.evaluate(txt('lobby-when'))})`);
check(/One try for each round, in order/.test(await B.evaluate(txt('lobby-msg'))), 'one try each, in order, said first');
await B.shot('3-lobby');
await B.evaluate(`window.confirm = () => true; document.getElementById('lobby-surf').click()`);
check(!!(await B.waitFor(`window.__heat && window.__heat.live && window.__dbg && window.__dbg.state === 'play'`, 40000)), 'drops in to round 1');
check((await B.evaluate(`window.__heat.surfers.length`)) === 1, '... alone on the board');
check(!!(await B.waitFor(`window.__heatFinal === true && /back to the contest/.test(${txt('results-go')})`, 180000)), 'the wave ridden: the card');
check((await B.evaluate(txt('results-title'))) === 'Round 1 surfed' && /Round 1 of 2/.test(await B.evaluate(txt('results-sub'))) && /played out when the window closes/.test(await B.evaluate(txt('results-sub'))),
  `Round 1 surfed, of 2; played out at the close (${await B.evaluate(txt('results-sub'))})`);
await B.shot('4-round1');
await B.go(`${B.base}index.html?contest=${c.code}&auto`);
check(!!(await B.waitFor(`${shown('lobby-surf')} && ${txt('lobby-surf')} === 'Surf the final' && /Round 1 ✓ · Final/.test(${txt('lobby-when')})`, 20000)), 'back in the lobby: round 1 ✓, Surf the final');
await B.evaluate(`window.confirm = () => true; document.getElementById('lobby-surf').click()`);
check(!!(await B.waitFor(`window.__heatFinal === true && window.__contestHeat?.round === 2`, 180000)), "surfs the final's session");
check((await B.evaluate(txt('results-title'))) === 'Final surfed', 'Final surfed');
await B.go(`${B.base}index.html?contest=${c.code}`);
check(!!(await B.waitFor(`/surfed every round/.test(${txt('lobby-msg')}) && ${txt('lobby-surf')} !== 'Surf the final'`, 20000)), "the lobby: you've surfed every round");
await B.shot('5-all-surfed');

// 4. The others. Heat 1 (seeds 1, 4, 5): host 5, x2 4, x3 9: host and x3 through. Heat 2 (seeds 2, 3): x1 doesn't show.
await surfApi(host, c.id, 1, 5); await surfApi(xs[1], c.id, 1, 4); await surfApi(xs[2], c.id, 1, 9); await surfApi(xs[0], c.id, 1, null);
await surfApi(host, c.id, 2, 3); await surfApi(xs[2], c.id, 2, 2);
await surfApi(xs[1], c.id, 2, 9.9); // (out in round 1: this won't count)
const t1 = tick();
check(t1?.waiting >= 1 && (await get(`contests?id=eq.${c.id}&select=state`))[0].state === 'running', `x1 could still surf the final's session: waiting (${JSON.stringify(t1)})`);

// 5. The window closes, the checks are in: played out.
await patch(`heats?contest_id=eq.${c.id}`, { window_ends_at: new Date(Date.now() - 1000).toISOString() });
const rideIds = (await get(`rides?select=id,heats!inner(contest_id)&heats.contest_id=eq.${c.id}`)).map((r) => r.id);
await patch(`ride_checks?ride_id=in.(${rideIds.join(',')})`, { status: 'ok' });
const t2 = tick();
const final = (await get(`heats?contest_id=eq.${c.id}&round=eq.2&session_of=is.null&select=id,state,heat_entries(entrant_id,place,total)`))[0];
check((await get(`contests?id=eq.${c.id}&select=state`))[0].state === 'done' && final?.state === 'done', `one tick plays out the whole bracket (${JSON.stringify(t2)})`);
const ents = await get(`entrants?contest_id=eq.${c.id}&select=id,user_id`), entOf = (s) => ents.find((e) => e.user_id === s.user.id).id;
const fin = Object.fromEntries(final.heat_entries.map((x) => [x.entrant_id, Number(x.total)]));
check(fin[entOf(host)] === 3 && fin[entOf(xs[2])] === 2 && entOf(mem) in fin && !(entOf(xs[1]) in fin), `the final: from the finalists' sessions (${JSON.stringify(final.heat_entries)})`);
check((await readAs(host.access_token, `rides?entrant_id=eq.${entOf(xs[1])}&select=score`)).length === 1, "the out surfer's final session: nobody sees it");
await A.go(`${A.base}index.html?contest=${c.code}`);
check(!!(await A.waitFor(`/Won by/.test(${txt('lobby-msg')}) && /Final/.test(document.getElementById('bracket').innerText) && /Round 1/.test(document.getElementById('bracket').innerText)`, 20000)), 'the lobby: the winner, round 1 and the final');
check(!/9\.9/.test(await A.evaluate(`document.getElementById('bracket').innerText`)), '... and no sign of the 9.9');
await A.shot('6-done');

// 6. The final's recap; the results emails.
await B.go(`${B.base}index.html?recap=${c.code}&heat=${final.id}`);
const rc = await B.waitFor(`window.__recap && JSON.stringify({ id: window.__recap.heat.id, n: window.__recap.story.length, at: window.__recap.story.map((s) => s.ride.at) })`, 40000);
const R = rc && JSON.parse(rc);
check(R?.id === final.id && R.n === 3 && R.at.every((t) => t >= 0 && t < 180), `the final's recap: three sessions on one heat clock (${rc})`);
const sent = await (await fetch(`${API}/functions/v1/contest-notices`, { method: 'POST', headers: { apikey: PK, authorization: `Bearer ${host.access_token}`, 'content-type': 'application/json' }, body: '{}' })).json();
// (sent: the results, and any "round 1 is open" the local cron's own tick queued while the test ran)
const MAIL = process.env.MAILPIT_URL || 'http://127.0.0.1:55324';
const results = async (addr) => (await (await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent(`to:"${addr}" subject:"results are in"`)}`)).json()).messages || [];
const counts = await Promise.all([host.user.email, mem.user.email, ...xs.map((x) => x.email)].map(async (a) => (await results(a)).length));
check(sent.sent >= 5 && !sent.failed && counts.every((n) => n === 1), `results: one each, all five (${JSON.stringify(sent)}, ${counts})`);
const outMail = await (async () => { const m = (await results(xs[1].email))[0]; return m && (await fetch(`${MAIL}/api/v1/message/${m.ID}`)).json(); })();
check(/played out: you went out in round 1/.test(outMail?.Text || ''), `the out surfer's email: where they went out (${outMail?.Subject})`);

await B.close();
await A.done();
