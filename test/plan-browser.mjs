// Plans in the real pages (headless Chrome, local Supabase stack; accounts plan task 6):
//   1. no ?paywall (as live, until payments): every wave open
//   2. ?paywall, a visitor: a link to Trestles lands on Raglan with a note; Queens is free too; the others are locked
//      and stay locked
//   3. signed in, free: still locked; the account page says Free
//   4. a Wave Pass granted (as the database, the way the Stripe webhook will): every wave opens; Wave Pass on the account page
//   5. Pro granted: the account page says Pro until a date
// npm run db:start first, then: npm run test:plan-browser [shotPrefix]
import { execSync } from 'node:child_process';
import { openBrowser, signInOnTitle, sleep, root } from './browser-lib.mjs';

const API = process.env.SB_URL || 'http://127.0.0.1:55321';
// (the local stack's secret key, asked of the CLI: never written into the repo)
const SECRET = process.env.SB_SECRET || JSON.parse(execSync('npx supabase status -o json', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString()).SECRET_KEY;
const grant = async (user_id, kind, days) => {
  const r = await fetch(`${API}/rest/v1/entitlements`, { method: 'POST', headers: { apikey: SECRET, authorization: `Bearer ${SECRET}`, 'content-type': 'application/json' },
    body: JSON.stringify({ user_id, kind, source: 'grant', expires_at: days ? new Date(Date.now() + days * 864e5).toISOString() : null, note: 'test' }) });
  if (!r.ok) throw new Error(`grant: ${r.status} ${await r.text()}`);
};

const b = await openBrowser({ shots: process.argv[2] });
const { check, evaluate, waitFor, vis, shot, go, text, send } = b;
const pickerState = `[...document.querySelectorAll('#waves button')].map((x) => x.textContent).join('|')`;
const lockedCount = `document.querySelectorAll('#waves button.locked').length`;
const on = `document.querySelector('#waves button.on')?.textContent`;

// 1. As live today.
await go(`${b.base}?wave=trestles`);
await waitFor(vis('acct-open'), 20000); await sleep(800);
check((await evaluate(lockedCount)) === 0 && (await evaluate(on)) === 'Trestles', `no paywall: all open, on Trestles (${await evaluate(pickerState)})`);

// 2. A visitor with the paywall.
await go(`${b.base}?paywall&wave=trestles`);
check(!!(await waitFor(`${vis('lock-note')} && document.getElementById('lock-note').textContent`, 20000)), 'a link to a locked wave says so');
check((await evaluate(on)) === 'Raglan' && /wave=point/.test(await evaluate('location.search')), `... and lands on Raglan: ${await text('lock-note')}`);
check((await evaluate(lockedCount)) === 4 && !/🔒 Queens/.test(await evaluate(pickerState)), `Raglan and Queens free, the other four locked: ${await evaluate(pickerState)}`);
await evaluate(`[...document.querySelectorAll('#waves button')].find((x) => /Pipe/.test(x.textContent)).click()`);
await sleep(300);
check((await evaluate(on)) === 'Raglan' && /Pipe comes with a Wave Pass/.test(await text('lock-note')), 'tapping a locked wave keeps you on Raglan and explains');
await shot('1-locked');

// 3. Signed in, free.
const email = `plan-${Date.now()}@example.com`;
await signInOnTitle(b, email);
await waitFor(`${vis('acct-handle-form')} || ${vis('acct-who')}`, 20000);
await sleep(1000);
check((await evaluate(lockedCount)) === 4, 'signed in, free: still locked');
const uid = await evaluate(`JSON.parse(localStorage.getItem('rys-rad-waves-auth')).user.id`);
await go(`${b.base}account.html`);
check(/Free/.test(await waitFor(`/Free|Pass|Pro/.test(document.getElementById('plan-now').textContent) && document.getElementById('plan-now').textContent`, 15000) || ''), `account: "${await text('plan-now')}"`);

// 4. A Wave Pass.
await grant(uid, 'wave_pass');
await go(`${b.base}?paywall&wave=trestles`);
await waitFor(`${vis('acct-handle-form')} || ${vis('acct-who')}`, 20000); await sleep(1200);
check((await evaluate(lockedCount)) === 0 && (await evaluate(on)) === 'Trestles' && (await evaluate(`document.getElementById('lock-note').hidden`)), 'Wave Pass: every wave open, the Trestles link stays on Trestles');
await shot('2-pass');
await go(`${b.base}account.html`);
check(/Wave Pass/.test(await waitFor(`/Pass|Pro/.test(document.getElementById('plan-now').textContent) && document.getElementById('plan-now').textContent`, 15000) || ''), `account: "${await text('plan-now')}"`);

// 5. Pro.
await grant(uid, 'pro', 30);
await send('Page.reload');
check(/Pro.*until/.test(await waitFor(`/Pro/.test(document.getElementById('plan-now').textContent) && document.getElementById('plan-now').textContent`, 15000) || ''), `account: "${await text('plan-now')}"`);
await shot('3-pro');
await b.done();
