// An Open contest end to end in two browsers (plans/2026-11-27-open-contests.md step 3; headless Chrome x2, the local
// stack with Realtime and `supabase functions serve` for the sign-in emails):
//   1. a Pro host opens Compete > Open: the form has who can enter, sign-up, and a window for each round (as many as
//      the size makes); creating it lands in its lobby, invite only
//   2. the host invites a member by username in the lobby; the member opens the link, sees the invite, joins
//   2b. the host invites an email address: the email goes out with the contest's link; signed out, the lobby offers a
//      sign-in link instead of guest entry; signed in with that address, they see their invite and join
//   3. a 1-wave Open contest: the host opens round 1 early; the member taps Surf your heat (one try, said first) and
//      rides alone on their board, on their own clock; the card says the scores come out when the round closes
//   4. the host's lobby shows who has surfed, never the score; the host can't read the member's wave
//   5. the host surfs too; the tick closes the round (once the checks are in): the final's places show
//   6. round recaps: a link on each closed heat, the lobby's button for yours, and the heat's recap on one heat clock
//   7. reminder emails: the results email to each, with the recap link, sent once
// npm run db:start and supabase functions serve first, then: npm run test:open-browser [shotPrefix]
import { execSync } from 'node:child_process';
import { openBrowser, signInOnTitle, latestLink, sleep, root } from './browser-lib.mjs';

const API = process.env.SB_URL || 'http://127.0.0.1:55321';
const PK = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';
const SECRET = process.env.SB_SECRET || JSON.parse(execSync('npx supabase status -o json', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString()).SECRET_KEY;
const H = { apikey: SECRET, authorization: `Bearer ${SECRET}`, 'content-type': 'application/json' };
const post = async (table, body) => { const r = await fetch(`${API}/rest/v1/${table}`, { method: 'POST', headers: { ...H, prefer: 'return=representation' }, body: JSON.stringify(body) }); if (!r.ok) throw new Error(`${table}: ${r.status} ${await r.text()}`); return (await r.json())[0]; };
const patch = async (q, body) => { const r = await fetch(`${API}/rest/v1/${q}`, { method: 'PATCH', headers: H, body: JSON.stringify(body) }); if (!r.ok) throw new Error(`${q}: ${r.status} ${await r.text()}`); };
const get = async (q) => (await fetch(`${API}/rest/v1/${q}`, { headers: H })).json();
const rpcAs = async (token, fn, args) => { const r = await fetch(`${API}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: PK, authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(args) }); const j = await r.json(); if (!r.ok) throw new Error(`${fn}: ${JSON.stringify(j)}`); return j; };
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

// 1. The host form.
const host = await member(A, 'ohost', true);
await A.go(`${A.base}?wave=point`);
await A.waitFor(`document.querySelectorAll('#waves button').length > 0 && !document.getElementById('go-compete').classList.contains('locked')`, 30000);
await sleep(1000);
await A.evaluate(`document.getElementById('go-compete').click(); document.getElementById('go-open').click()`);
await A.waitFor(shown('host-open'), 10000);
check((await A.evaluate(txt('step-title'))) === 'Host an Open contest', 'Compete > Open: the Open host form');
check((await A.evaluate(`document.querySelectorAll('#host-rounds select').length`)) === 2, 'up to 8: two rounds, a window each');
await A.evaluate(`const s = document.getElementById('host-size'); s.value = '16'; s.dispatchEvent(new Event('change'))`);
check((await A.evaluate(`[...document.querySelectorAll('#host-rounds span')].map((x) => x.textContent).join(',')`)) === 'Round 1,Round 2,Final', 'up to 16: three, the last the final');
check((await A.evaluate(`[...document.querySelectorAll('#host-rounds select')].every((x) => x.value === '24')`)), '... 24 hours each by default');
await A.waitFor(`document.getElementById('host-name').value`, 10000);
await A.evaluate(`document.querySelector('#host-rounds select').value = '12'; document.getElementById('host-form').requestSubmit()`);
await A.waitFor(`${shown('lobby')} && /Open ·/.test(${txt('lobby-what')})`, 20000);
const code1 = await A.evaluate(`document.getElementById('lobby-code').textContent`);
const c1 = (await get(`contests?code=eq.${code1}&select=mode,entry,round_hours,signup_ends_at`))[0];
check(c1?.mode === 'open' && c1.entry === 'invite' && JSON.stringify(c1.round_hours) === '[12,24,24]', `created: Open, invite only, rounds of 12, 24, 24 hours (${JSON.stringify(c1)})`);
check(/Open · Raglan · 10 min heats · 12 h, 1 day, 1 day rounds/.test(await A.evaluate(txt('lobby-what'))), `the lobby says what it is (${await A.evaluate(txt('lobby-what'))})`);
check(/Sign-up closes in 2[34]h/.test(await A.evaluate(txt('lobby-when'))), 'and when sign-up closes');
check(await A.evaluate(shown('lobby-invite')), 'the host can invite');
await A.shot('1-lobby');

// 2. An invite by username.
const mem = await member(B, 'omem', false);
await A.evaluate(`document.getElementById('lobby-invitee').value = '@${mem.handle}'; document.getElementById('lobby-invite').requestSubmit()`);
check(!!(await A.waitFor(`new RegExp('@${mem.handle} invited').test(${txt('lobby-list')}.replace(/\\s+/g, ' '))`, 10000)), 'invited: on the list');
await B.go(`${B.base}index.html?contest=${code1}`);
check(!!(await B.waitFor(`${shown('lobby-join')} && /invited/.test(${txt('lobby-list')})`, 20000)), 'the member opens the link: their invite, and Join');
await B.evaluate(`document.getElementById('lobby-join').requestSubmit()`);
check(!!(await B.waitFor(`/\\(you\\)/.test(${txt('lobby-list')}) && !/invited/.test(${txt('lobby-list')})`, 20000)), '... joins');
await B.shot('2-joined');

// 2b. An invite by email, to someone signed out.
const friend = `ofriend-${Date.now()}@example.com`;
await A.evaluate(`document.getElementById('lobby-invitee').value = '${friend}'; document.getElementById('lobby-invite').requestSubmit()`);
check(!!(await A.waitFor(`/emailed them the link/.test(${txt('lobby-msg')}) && /${friend.replace(/[.]/g, '\\.')}/.test(${txt('lobby-list')})`, 20000)), `invited by email: emailed, and on the host's list (${await A.evaluate(txt('lobby-msg'))})`);
const MAIL = process.env.MAILPIT_URL || 'http://127.0.0.1:55324';
let inviteMail = null;
for (let i = 0; i < 30 && !inviteMail; i++) {
  const l = await (await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent(`to:"${friend}"`)}`)).json();
  if (l.messages?.length) inviteMail = await (await fetch(`${MAIL}/api/v1/message/${l.messages[0].ID}`)).json();
  else await sleep(300);
}
check(/invited you to surf/.test(inviteMail?.Subject || '') && inviteMail?.Text.includes(`?contest=${code1}`) && inviteMail?.Text.includes(`Sign in with ${friend}`), `the email: who, the contest's link, sign in with this address (${inviteMail?.Subject})`);
const C = await openBrowser({ shots: shots && `${shots}-friend` });
await C.go(`${C.base}index.html?contest=${code1}`);
await C.waitFor(shown('lobby-join'), 20000);
check((await C.evaluate(`document.querySelector('#lobby-join button').textContent`)) === 'Email me a link' && (await C.evaluate(`document.getElementById('lobby-nick').type`)) === 'email', 'signed out: the lobby asks for an email, no guest entry');
await C.evaluate(`document.getElementById('lobby-nick').value = '${friend}'; document.getElementById('lobby-join').requestSubmit()`);
check(!!(await C.waitFor(`/brings you back here/.test(${txt('lobby-msg')})`, 15000)), '... and sends a sign-in link');
const back = await latestLink(friend, 15000, Date.now() - 20000);
check(!!back, 'the sign-in link arrives');
await C.go(back);
await C.waitFor(`localStorage.getItem('rys-rad-waves-auth') && ${shown('lobby')}`, 30000);
const fa = await auth(C);
await post('profiles', { id: fa.user.id, handle: `ofr${Date.now() % 1e7}` });
await C.go(`${C.base}index.html?contest=${code1}`);
check(!!(await C.waitFor(`${shown('lobby-join')} && ${txt('lobby-list')}.includes('(you)') && ${txt('lobby-list')}.includes('invited') && document.querySelector('#lobby-join button').textContent.startsWith('Join as @')`, 20000)), 'signed in with that address: their invite, Join as their handle');
await C.evaluate(`document.getElementById('lobby-join').requestSubmit()`);
check(!!(await C.waitFor(`${txt('lobby-list')}.includes('(you)') && !${txt('lobby-list')}.includes('invited')`, 20000)), '... in');
await C.shot('1-joined');
await C.close();

// 3. A 1-wave Open contest, round 1 opened early.
const c2 = await rpcAs(host.access_token, 'create_contest', { name: 'Open Test', wave: 'point', end_waves: 1, mode: 'open' });
await rpcAs(host.access_token, 'invite_to_contest', { contest_id: c2.id, handle: mem.handle });
await rpcAs(host.access_token, 'join_contest', { code: c2.code });
await rpcAs(mem.access_token, 'join_contest', { code: c2.code });
await A.go(`${A.base}index.html?contest=${c2.code}&auto`);
await A.waitFor(`${shown('lobby-start')} && !document.getElementById('lobby-start').disabled`, 20000);
check((await A.evaluate(txt('lobby-start'))) === 'Open round 1 now', 'the host can open round 1 early');
await A.evaluate(`window.confirm = () => true; document.getElementById('lobby-start').click()`);
check(!!(await A.waitFor(`${shown('lobby-surf')} && /closes in 2[34]h/.test(${txt('lobby-when')})`, 20000)), 'round 1 is open: Surf your heat, and when it closes');
await B.go(`${B.base}index.html?contest=${c2.code}&auto`);
await B.waitFor(shown('lobby-surf'), 20000);
check(/One try/.test(await B.evaluate(txt('lobby-msg'))), `one try, said first (${await B.evaluate(txt('lobby-msg'))})`);
await B.shot('3-surf');
await B.evaluate(`window.confirm = (m) => (window.__asked = m, true); document.getElementById('lobby-surf').click()`);
check(!!(await B.waitFor(`window.__heat && window.__heat.live && window.__dbg && window.__dbg.state === 'play'`, 40000)), 'the member drops in');
check((await B.evaluate(`window.__heat.surfers.map((s) => s.name).join(',')`)) === mem.handle, 'alone on the board');
check(!!(await B.evaluate(`window.__contestHeat.open && Math.abs(Date.parse(window.__contestHeat.startsAt) - Date.now()) < 20000`)), 'the clock runs from their own start');
check(!!(await B.waitFor(`window.__heatFinal === true && /back to the contest/.test(${txt('results-go')})`, 180000)), 'the wave ridden: the card, back to the contest');
check((await B.evaluate(txt('results-title'))) === 'Heat surfed' && /when the round closes/.test(await B.evaluate(txt('results-sub'))), 'Heat surfed: the scores come out when the round closes');
await B.shot('4-surfed');
const heat = (await get(`heats?contest_id=eq.${c2.id}&select=id,heat_entries(entrant_id,started_at,finished_at)`))[0];
const ents = await get(`entrants?contest_id=eq.${c2.id}&select=id,user_id`);
const memEntry = ents.find((e) => e.user_id === mem.user.id).id;
const he = heat.heat_entries.find((x) => x.entrant_id === memEntry);
check(!!he.started_at && !!he.finished_at, 'started and finished on the server');

// 4. The host sees who has surfed, not the score.
await A.waitFor(`new RegExp('${mem.handle}\\\\s*surfed').test(document.getElementById('bracket').innerText)`, 30000);
const card = await A.evaluate(`document.getElementById('bracket').innerText.replace(/\\s+/g, ' ')`);
check(new RegExp(`${mem.handle} surfed`).test(card) && /not yet/.test(card) && !/\d\.\d\d/.test(card), `the host's lobby: who's surfed, no scores (${card})`);
check((await readAs(host.access_token, `rides?heat_id=eq.${heat.id}&select=score`)).length === 0, "the host can't read the member's wave");
await A.shot('5-host-lobby');

// 5. The host surfs; the tick closes the round.
await A.evaluate(`document.getElementById('lobby-surf').click()`);
check(!!(await A.waitFor(`window.__heatFinal === true`, 180000)), 'the host surfs too');
const rideIds = (await get(`rides?heat_id=eq.${heat.id}&select=id`)).map((r) => r.id);
await patch(`ride_checks?ride_id=in.(${rideIds.join(',')})`, { status: 'pending' }); // (the game asks check-rides itself: pending again, to see the wait)
const t1 = tick();
check(t1?.closed === 0, `checks pending: the tick waits (${JSON.stringify(t1)})`);
await patch(`ride_checks?ride_id=in.(${rideIds.join(',')})`, { status: 'ok' });
const t2 = tick();
check(t2?.closed === 1, `checked: the tick closes the final (${JSON.stringify(t2)})`);
check((await get(`contests?id=eq.${c2.id}&select=state`))[0]?.state === 'done', 'the contest is over');
check((await readAs(host.access_token, `rides?heat_id=eq.${heat.id}&select=score`)).length === 2, 'the scores are out');
await A.go(`${A.base}index.html?contest=${c2.code}`);
check(!!(await A.waitFor(`/Won by/.test(${txt('lobby-msg')}) && /\\d\\.\\d\\d/.test(document.getElementById('bracket').innerText)`, 20000)), 'the lobby: the winner and the scores');
await A.shot('6-done');

// 6. Round recaps (step 5): the heat's recap, its sessions told on one heat clock.
const link = await A.evaluate(`document.querySelector('#bracket .heat small a')?.getAttribute('href')`);
check(link === `index.html?recap=${c2.code}&heat=${heat.id}`, `each closed heat: a recap link (${link})`);
await patch(`contests?id=eq.${c2.id}`, { state: 'running' }); // (as if a later round were still on)
await B.go(`${B.base}index.html?contest=${c2.code}`);
check(!!(await B.waitFor(`${shown('lobby-heat-recap')} && document.getElementById('lobby-heat-recap').getAttribute('href') === 'index.html?recap=${c2.code}&heat=${heat.id}'`, 20000)), 'mid-contest: "Watch the recap of your heat" in the lobby');
await B.shot('5-recap-button');
await B.go(`${B.base}index.html?recap=${c2.code}&heat=${heat.id}`);
const rc = await B.waitFor(`window.__recap && JSON.stringify({ id: window.__recap.heat.id, only: window.__recap.heatOnly, n: window.__recap.story.length, at: window.__recap.story.map((s) => s.ride.at) })`, 40000);
const R = rc && JSON.parse(rc);
check(R?.id === heat.id && R.only && R.n === 2, `the heat's recap plays, contest still on (${rc})`);
check(R && R.at.every((t) => t >= 0 && t < 120), `on one heat clock: each wave's time into its surfer's own heat (${R?.at})`);
await sleep(3000); await B.shot('6-recap');
await patch(`contests?id=eq.${c2.id}`, { state: 'done' });

// 7. Reminder emails (step 6): the tick queued the results; contest-notices sends them (locally nothing calls it, so the test does).
const sentRes = await (await fetch(`${API}/functions/v1/contest-notices`, { method: 'POST', headers: { apikey: PK, authorization: `Bearer ${host.access_token}`, 'content-type': 'application/json' }, body: '{}' })).json();
check(sentRes.sent >= 2 && !sentRes.failed, `contest-notices sends what's queued (${JSON.stringify(sentRes)})`);
const MAIL2 = process.env.MAILPIT_URL || 'http://127.0.0.1:55324';
const mailTo = async (addr) => { const l = await (await fetch(`${MAIL2}/api/v1/search?query=${encodeURIComponent(`to:"${addr}" subject:"results are in"`)}`)).json(); return l.messages?.[0] ? (await fetch(`${MAIL2}/api/v1/message/${l.messages[0].ID}`)).json() : null; };
const hm = await mailTo(host.user.email), mm = await mailTo(mem.user.email);
check(!!hm && !!mm, 'the results email reaches both');
check(hm?.Text.includes(`?recap=${c2.code}&heat=${heat.id}`) && /in the final/.test(hm.Text) && /account\.html/.test(hm.Text), `it has their result, the recap link, and how to turn them off (${hm?.Subject})`);
const again = await (await fetch(`${API}/functions/v1/contest-notices`, { method: 'POST', headers: { apikey: PK, authorization: `Bearer ${host.access_token}`, 'content-type': 'application/json' }, body: '{}' })).json();
check(again.sent === 0, 'once each');

await B.close();
await A.done();
