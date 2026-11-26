// Surfer styling (accounts plan task 16) in the browser, against the local stack:
//   1. without Pro the account page's Your surfer is locked
//   2. with Pro: pick a wetsuit, trunks, a pattern, a board and a nose; the preview follows; saved
//   3. the game wears it: the demo surfer behind the title, and your ride, whose recording carries it
//   4. that ride's replay, in a fresh page signed out (anyone watching your wave), wears your look too
//   5. a hand-edited look in a recording is cleaned to known colours
// npm run db:start first, then: npm run test:styling-browser [shotPrefix]
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openBrowser, signInOnTitle, sleep, root } from './browser-lib.mjs';

const API = process.env.SB_URL || 'http://127.0.0.1:55321';
const SECRET = process.env.SB_SECRET || JSON.parse(execSync('npx supabase status -o json', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString()).SECRET_KEY;
const H = { apikey: SECRET, authorization: `Bearer ${SECRET}`, 'content-type': 'application/json' };
const post = async (table, body) => { const r = await fetch(`${API}/rest/v1/${table}`, { method: 'POST', headers: { ...H, prefer: 'return=representation' }, body: JSON.stringify(body) }); if (!r.ok) throw new Error(`${table}: ${r.status} ${await r.text()}`); return (await r.json())[0]; };
const get = async (q) => (await fetch(`${API}/rest/v1/${q}`, { headers: H })).json();

const b = await openBrowser({ shots: process.argv[2] });
const { check, evaluate, waitFor, go, shot } = b;
const shown = (id) => `(() => { const e = document.getElementById('${id}'); return !!e && e.offsetParent !== null; })()`;
const LOOK = { suit: 'red', shorts: 'pink', pattern: 'stripes', board: 'yellow', nose: 'teal' };
const KEY = JSON.stringify({ suit: 'red', shorts: 'pink', board: 'yellow', nose: 'teal', pattern: 'stripes' });

// 1. A member without Pro.
await go(`${b.base}?wave=point`);
await signInOnTitle(b, `style-${Date.now()}@example.com`);
await waitFor(`${b.vis('acct-handle-form')} || ${b.vis('acct-who')}`, 20000);
const me = await evaluate(`JSON.parse(localStorage.getItem('rys-rad-waves-auth'))`);
await post('profiles', { id: me.user.id, handle: `st${Date.now() % 1e7}` });
await go(`${b.base}account.html`);
check(!!(await waitFor(`${shown('style-form')} && document.querySelectorAll('#style-rows .swatch').length === 60`, 20000)), 'Your surfer: swatches for wetsuit, trunks, board and nose (14 colours and "the game\'s own" each)');
check(await evaluate(`document.getElementById('style-form').classList.contains('locked') && document.getElementById('style-save').disabled && /Pro/.test(document.getElementById('style-save').textContent)`), 'without Pro: locked, "Styling comes with Pro"');

// 2. With Pro.
await post('entitlements', { user_id: me.user.id, kind: 'pro', source: 'grant', expires_at: new Date(Date.now() + 30 * 864e5).toISOString(), note: 'test' });
await go(`${b.base}account.html`);
await waitFor(`!document.getElementById('style-form').classList.contains('locked') && document.querySelectorAll('#style-rows .swatch').length === 60`, 20000);
for (const [part, id] of Object.entries(LOOK)) {
  if (part === 'pattern') await evaluate(`document.querySelector('.pattern-btn[data-pattern="${id}"]').click()`);
  else await evaluate(`document.querySelector('.swatch[data-part="${part}"][data-id="${id}"]').click()`);
}
check(await evaluate(`/#d9292e/i.test(document.getElementById('style-preview').innerHTML) && /#facc1f/i.test(document.getElementById('style-preview').innerHTML) && /<rect width="4"/.test(document.getElementById('style-preview').innerHTML)`), 'the preview: red suit, yellow board, stripes');
await shot('1-style');
await evaluate(`document.getElementById('style-form').requestSubmit()`);
check(/Saved/.test(await waitFor(`/Saved|Pro|wrong/.test(document.getElementById('style-msg').textContent) && document.getElementById('style-msg').textContent`, 10000) || ''), 'saved');
const [p] = await get(`profiles?id=eq.${me.user.id}&select=styling`);
check(JSON.stringify(p.styling) === JSON.stringify({ nose: 'teal', suit: 'red', board: 'yellow', shorts: 'pink', pattern: 'stripes' }) || Object.entries(LOOK).every(([k, v]) => p.styling[k] === v), `in the database: ${JSON.stringify(p.styling)}`);

// 3. The game wears it.
await go(`${b.base}?wave=point`);
const key = await waitFor(`window.__styleKey && window.__styleKey !== '{}' && window.__styleKey`, 30000);
check(key && Object.entries(LOOK).every(([k, v]) => JSON.parse(key)[k] === v), `the demo surfer behind the title wears it (${key})`);
await go(`${b.base}?wave=point&play&auto`);
const rec = await waitFor(`window.__replay && window.__replay.steps > 0 && JSON.stringify(window.__replay.styling)`, 90000);
check(rec && Object.entries(LOOK).every(([k, v]) => JSON.parse(rec)[k] === v), `the ride's recording carries it: ${rec}`);
await shot('2-ride');
const text = await evaluate(`import('./src/replay.js').then((m) => m.encodeRecording(window.__replay))`);
writeFileSync(join(root, 'test/out/styled.json'), text);

// 4. The replay, in a fresh page, signed out.
await evaluate(`localStorage.removeItem('rys-rad-waves-auth')`);
await go(`${b.base}?replay=test/out/styled.json`);
const rk = await waitFor(`window.__replayResult === undefined && window.__styleKey && window.__styleKey !== '{}' && window.__styleKey`, 30000);
check(rk && Object.entries(LOOK).every(([k, v]) => JSON.parse(rk)[k] === v), `signed out, the replay wears the rider's look (${rk})`);
await sleep(1500); await shot('3-replay');

// 5. A doctored look: unknown colours and parts dropped.
const bad = JSON.parse(text); bad.styling = { suit: '#00ff00', hat: 'red', board: 'yellow', pattern: 'plaid' };
writeFileSync(join(root, 'test/out/styled-bad.json'), JSON.stringify(bad));
await go(`${b.base}?replay=test/out/styled-bad.json`);
check((await waitFor(`window.__styleKey && window.__styleKey`, 30000)) === JSON.stringify({ board: 'yellow' }), 'a hand-edited look: only the known colour is worn');

await b.done();
