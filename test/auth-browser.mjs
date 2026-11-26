// Sign-in on the title screen in the real game (headless Chrome, local Supabase stack; accounts plan task 4):
//   1. "Sign in" opens the email box; "Email me a link" says to check your email
//   2. the link from the local inbox (Mailpit) lands back on the game signed in (the handle picker, the first time)
//   3. a reload keeps the session
//   4. "Sign out" goes back to "Sign in", and stays signed out after a reload
//   5. typing in the email box doesn't drive the surfer (Space doesn't drop in)
// npm run db:start first, then: npm run test:auth-browser [shotPrefix]
import { openBrowser, latestLink, sleep } from './browser-lib.mjs';

const b = await openBrowser({ shots: process.argv[2] });
const { check, evaluate, waitFor, vis, shot, key, go, send } = b;
const base = `${b.base}?wave=raglanPlus`;
const signedIn = `(${vis('acct-who')} || ${vis('acct-handle-form')})`;

// 1. Sign in, ask for a link.
await go(base);
check(!!(await waitFor(vis('acct-open'), 20000)) && (await evaluate(`document.getElementById('acct-open').textContent`)) === 'Log in / Sign up', '"Log in / Sign up" shows on the title screen');
await shot('1-title');
await evaluate(`document.getElementById('acct-open').click()`);
check(!!(await waitFor(vis('acct-email'), 3000)), 'the email box opens');
const email = `rider-${Date.now()}@example.com`;
for (const ch of email) await key(ch, '', ch);
await key(' ', 'Space', ' '); // 5. a space typed in the box doesn't drop in
await sleep(400);
const typed = await evaluate(`document.getElementById('acct-email').value`);
check(typed.startsWith(email) && (await evaluate(vis('acct-email'))), `typing stays in the box ("${typed.trim()}"), no drop-in`);
await evaluate(`(() => { const i = document.getElementById('acct-email'); i.value = i.value.trim(); document.getElementById('acct-form').requestSubmit(); })()`);
const sent = await waitFor(`${vis('acct-msg')} && document.getElementById('acct-msg').textContent`, 8000);
check(/Check .* for your sign-in link/.test(sent || ''), `after sending: "${sent}"`);
await shot('2-sent');

// 2. Follow the link.
const link = await latestLink(email);
check(!!link, 'the link arrives in the local inbox');
await go(link);
check(!!(await waitFor(signedIn, 20000)), 'back on the game signed in');
check(!(await evaluate(vis('acct-open'))) && !(await evaluate(`location.hash.includes('access_token')`)), 'no "Sign in", and the tokens are gone from the address');
check((await evaluate(`document.getElementById('acct-handle').value`)) === email.split('@')[0].replace(/-/g, '_'), 'first time: the handle picker, with a guess from the email');
await shot('3-signed-in');

// 3. Reload keeps it.
await send('Page.reload');
check(!!(await waitFor(signedIn, 20000)), 'still signed in after a reload');

// 4. Sign out (from the handle picker's row: Sign out is in the who row, so make a profile first).
await evaluate(`document.getElementById('acct-handle-form').requestSubmit()`);
check(!!(await waitFor(vis('acct-who'), 8000)), 'the handle saved');
await evaluate(`document.getElementById('acct-out').click()`);
check(!!(await waitFor(`${vis('acct-open')} && !${signedIn}`, 8000)), 'signed out: "Sign in" is back');
await shot('4-signed-out');
await send('Page.reload');
await waitFor(vis('acct-open'), 20000);
await sleep(1500);
check(!(await evaluate(signedIn)) && (await evaluate(`!localStorage.getItem('rys-rad-waves-auth')`)), 'still signed out after a reload');
await b.done();
