// My Breaks in the real pages (headless Chrome, local Supabase stack; accounts plan task 7):
//   1. signed out, the builder asks you to sign in
//   2. signed in, free: no saving ("comes with Pro")
//   3. Pro: the design this browser remembers is offered as your first break; saved with a thumbnail and its ride
//   4. rename, duplicate, unlisted, edit the copy, delete it
//   5. index.html?break=<id> drops straight into it; signed out, an unlisted link still works, a private one doesn't
//   6. builder.html?break=<id> opens it
// npm run db:start first, then: npm run test:breaks-browser [shotPrefix]
import { execSync } from 'node:child_process';
import { openBrowser, signInOnTitle, sleep, root } from './browser-lib.mjs';

const API = process.env.SB_URL || 'http://127.0.0.1:55321';
const SECRET = process.env.SB_SECRET || JSON.parse(execSync('npx supabase status -o json', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString()).SECRET_KEY;
const H = { apikey: SECRET, authorization: `Bearer ${SECRET}`, 'content-type': 'application/json' };
const grant = async (user_id) => {
  const r = await fetch(`${API}/rest/v1/entitlements`, { method: 'POST', headers: H, body: JSON.stringify({ user_id, kind: 'pro', source: 'grant', expires_at: new Date(Date.now() + 30 * 864e5).toISOString(), note: 'test' }) });
  if (!r.ok) throw new Error(`grant: ${r.status} ${await r.text()}`);
};
const rows = async (uid) => (await fetch(`${API}/rest/v1/breaks?owner=eq.${uid}&select=id,name,visibility,thumb_path,ride,version&order=created_at`, { headers: H })).json();

const b = await openBrowser({ shots: process.argv[2] });
const { check, evaluate, waitFor, shot, go, send } = b;
const panel = `document.getElementById('breaks').innerText`;
const click = (label, scope = '#breaks') => evaluate(`(() => { const x = [...document.querySelectorAll('${scope} button, ${scope} a.btn')].find((e) => e.textContent.trim() === ${JSON.stringify(label)} && !e.disabled); if (x) x.click(); return !!x; })()`);
const items = `document.querySelectorAll('#breaks .bitem').length`;

// 1. Signed out.
await go(`${b.base}builder.html`);
check(/Sign in on the/.test(await waitFor(`/Sign in/.test(${panel}) && ${panel}`, 15000) || ''), 'signed out: sign in to keep your breaks');

// 2. Signed in, free.
const email = `breaks-${Date.now()}@example.com`;
await go(b.base); await signInOnTitle(b, email);
await waitFor(`localStorage.getItem('rys-rad-waves-auth')`, 15000); await sleep(800);
const uid = await evaluate(`JSON.parse(localStorage.getItem('rys-rad-waves-auth')).user.id`);
await go(`${b.base}builder.html`);
check(/comes with Pro/.test(await waitFor(`/Pro/.test(${panel}) && ${panel}`, 15000) || ''), 'free: saving comes with Pro');
check(await evaluate(`[...document.querySelectorAll('#breaks button')].find((e) => /Save/.test(e.textContent))?.disabled`), '... and Save is off');
check(!(await evaluate(`!!document.querySelector('#breaks .offer')`)), '... and no import offer');

// 3. Pro: the import offer.
await grant(uid);
await send('Page.reload');
check(!!(await waitFor(`!!document.querySelector('#breaks .offer')`, 15000)), 'Pro: offered to keep the break you\'ve been building');
await shot('1-offer');
await click('Save it');
await waitFor(`${items} === 1`, 20000);
let R = await rows(uid);
check(R.length === 1 && R[0].name === 'My break' && !!R[0].thumb_path && !!R[0].ride, `saved with a thumbnail and its ride: ${JSON.stringify(R.map((r) => ({ ...r, ride: !!r.ride })))}`);
check(!!(await waitFor(`document.querySelector('#breaks .bitem img')?.naturalWidth > 0`, 10000)), 'the thumbnail shows');
await send('Page.reload');
await waitFor(`${items} === 1`, 15000); await sleep(500);
check(!(await evaluate(`!!document.querySelector('#breaks .offer')`)), 'offered once only');
check(/All saved/.test(await evaluate(panel)), 'All saved');

// 4. Rename, duplicate, unlisted, edit the copy, delete it.
await click('Rename');
await evaluate(`(() => { const i = document.querySelector('#breaks .bitem input'); i.value = 'Bombie Point'; })()`);
await click('OK');
check(!!(await waitFor(`/Bombie Point/.test(${panel})`, 10000)) && (await evaluate(`document.getElementById('break-name').value`)) === 'Bombie Point', 'renamed (the open one too)');
await click('Duplicate');
check(!!(await waitFor(`${items} === 2`, 15000)), 'duplicated');
await click('Unlisted');
await waitFor(`/anyone with the link/.test(${panel})`, 10000);
R = await rows(uid);
const [orig, copy] = R;
check(orig.visibility === 'unlisted' && copy.name === 'Bombie Point (copy)' && copy.visibility === 'private', `unlisted, and the copy private: ${R.map((r) => `${r.name}/${r.visibility}`)}`);
check(await evaluate(`[...document.querySelectorAll('#breaks button')].some((e) => e.textContent === 'Copy link')`), 'a link to copy');
await shot('2-list');
await click('Edit');
await waitFor(`document.getElementById('break-name').value === 'Bombie Point (copy)'`, 10000);
await evaluate(`window.confirm = () => true`);
await evaluate(`[...document.querySelectorAll('#breaks .bitem')].find((e) => /\\(copy\\)/.test(e.innerText)).querySelector('button.danger').click()`);
check(!!(await waitFor(`${items} === 1`, 10000)) && (await rows(uid)).length === 1, 'deleted the copy');
check(/Not saved yet/.test(await evaluate(panel)), '... and its design stays open, unsaved');

// 5. Surf it by link.
await go(`${b.base}index.html?break=${orig.id}`);
check(!!(await waitFor(`/wave=built/.test(location.search) && /built=/.test(location.hash)`, 20000)), 'index.html?break= drops into it');
await sleep(1500);
await shot('3-surf');
await evaluate(`localStorage.removeItem('rys-rad-waves-auth')`);
await go(`${b.base}index.html?break=${orig.id}`);
check(!!(await waitFor(`/wave=built/.test(location.search)`, 20000)), 'signed out: an unlisted link works');
const pr = await fetch(`${API}/rest/v1/breaks?id=eq.${orig.id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ visibility: 'private' }) });
check(pr.ok, `the server can change a break (${pr.status})`);
await go(`${b.base}index.html?break=${orig.id}`);
check(/private/.test(await waitFor(`!document.getElementById('lock-note').hidden && document.getElementById('lock-note').textContent`, 20000) || ''), 'signed out: a private one says so');

// 6. Open it in the builder (made public again; signed out, so a copy to keep).
await fetch(`${API}/rest/v1/breaks?id=eq.${orig.id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ visibility: 'public' }) });
await go(`${b.base}builder.html?break=${orig.id}`);
check(!!(await waitFor(`document.getElementById('breaks') && window.__builder && !/break=/.test(location.search)`, 15000)), 'builder.html?break= opens it');

await b.done();
