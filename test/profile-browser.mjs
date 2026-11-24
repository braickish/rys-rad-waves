// Profiles in the real pages (headless Chrome, local Supabase stack; accounts plan task 5):
//   1. first sign-in on the title screen asks for a handle (a guess from the email); a reserved one and a look-alike of
//      a taken one are refused with a reason; a good one shows @handle, Account and Sign out
//   2. @handle opens profile.html?u=: name, jersey, since, the empty sections, "Edit your profile" (it's yours)
//   3. account.html: change the name, jersey and handle; the page shows them; the old handle is free again
//   4. a visitor (signed out) sees the page without "Edit"; an unknown handle says there's no one
//   5. deleting the account (type your handle) signs out, says so on the title, and the page is gone
// npm run db:start first, then: npm run test:profile-browser [shotPrefix]
import { openBrowser, signInOnTitle, sleep } from './browser-lib.mjs';

const b = await openBrowser({ shots: process.argv[2] });
const { check, evaluate, waitFor, vis, shot, go, text, type } = b;
const stamp = Date.now().toString(36);
const setVal = (id, v) => evaluate(`(() => { const e = document.getElementById('${id}'); e.focus(); e.value = ''; })()`).then(() => type(v));
const submit = (id) => evaluate(`document.getElementById('${id}').requestSubmit()`);

// Someone else holds a handle first (so a look-alike can be refused).
const other = `taken_${stamp}`;
await go(`${b.base}?wave=raglanPlus`);
await signInOnTitle(b, `other-${stamp}@example.com`);
await waitFor(vis('acct-handle-form'), 20000);
await setVal('acct-handle', other); await submit('acct-handle-form');
check(!!(await waitFor(vis('acct-who'), 8000)), `another surfer takes @${other}`);
await evaluate(`document.getElementById('acct-out').click()`);
await waitFor(vis('acct-open'), 8000);

// 1. Your first sign-in.
const email = `Ry.Rad-${stamp}@example.com`;
await signInOnTitle(b, email);
check(!!(await waitFor(vis('acct-handle-form'), 20000)), 'first sign-in: "Pick a handle"');
const guess = await evaluate(`document.getElementById('acct-handle').value`);
check(guess === `ry_rad_${stamp}`, `the guess from the email: ${guess}`);
await shot('1-pick');
await setVal('acct-handle', 'adm1n'); await submit('acct-handle-form');
check(/reserved/.test(await waitFor(`${vis('acct-msg')} && document.getElementById('acct-msg').textContent`, 5000) || ''), `adm1n refused: "${await text('acct-msg')}"`);
await setVal('acct-handle', other.replace('_', '').replace('a', '4').replace('t', 'T'));
await sleep(800);
check((await evaluate(`document.getElementById('acct-handle').value`)) === other.replace('_', '').replace('a', '4').toLowerCase(), 'typing is lowercased');
await setVal('acct-handle', other.replace('_', '')); await submit('acct-handle-form');
check(/taken/.test(await waitFor(`/taken/.test(document.getElementById('acct-msg').textContent) && document.getElementById('acct-msg').textContent`, 5000) || ''), `a look-alike of @${other} refused`);
const mine = `ry_${stamp}`;
await setVal('acct-handle', mine); await submit('acct-handle-form');
check((await waitFor(`${vis('acct-who')} && document.getElementById('acct-name').textContent`, 8000)) === `@${mine}`, `saved: @${mine} · Account · Sign out`);
await shot('2-who');

// 2. Your page.
await evaluate(`document.getElementById('acct-name').click()`);
check(!!(await waitFor(`location.pathname.endsWith('profile.html') && ${vis('profile')}`, 15000)), 'the @handle link opens your page');
check((await text('p-name')) === `@${mine}` && (await text('p-handle')) === `@${mine}`, 'no name yet: the handle stands in');
check(/\d{4}/.test(await text('p-since')) && (await evaluate(`document.querySelectorAll('.empty').length`)) === 2, `since ${await text('p-since')}, breaks and results empty for now`);
check(!!(await waitFor(vis('edit'), 5000)), '"Edit your profile" (it\'s yours)');

// 3. Account.
await evaluate(`document.getElementById('edit').click()`);
check(!!(await waitFor(`location.pathname.endsWith('account.html') && ${vis('signed-in')} && document.getElementById('handle').value`, 15000)), 'account page');
check((await text('email-now')) === email.toLowerCase(), `your email: ${await text('email-now')}`);
await shot('3-account');
const mine2 = `ry_rips_${stamp}`;
await setVal('display', 'Ry Rad'); await setVal('handle', mine2);
check(/free/.test(await waitFor(`/free|taken/.test(document.getElementById('handle-hint').textContent) && document.getElementById('handle-hint').textContent`, 5000) || ''), `the new handle checks as free`);
await evaluate(`document.querySelector('.jersey[data-id="teal"]').click()`);
await submit('profile-form');
check(/Saved/.test(await waitFor(`document.getElementById('save-msg').textContent`, 8000) || ''), 'saved');
await go(`${b.base}profile.html?u=${mine2}`);
await waitFor(vis('profile'), 15000);
check((await text('p-name')) === 'Ry Rad' && (await evaluate(`getComputedStyle(document.getElementById('p-dot')).backgroundColor`)) === 'rgb(0, 194, 199)', 'the page shows the name and the teal jersey');
await shot('4-profile');

// 4. A visitor; an unknown handle; the old handle free again.
await evaluate(`localStorage.setItem('keep', localStorage.getItem('rys-rad-waves-auth')); localStorage.removeItem('rys-rad-waves-auth')`);
await go(`${b.base}profile.html?u=${mine2}`);
await waitFor(vis('profile'), 15000); await sleep(800);
check(!(await evaluate(vis('edit'))), 'a visitor sees it, without "Edit"');
await go(`${b.base}profile.html?u=${mine}`);
check(!!(await waitFor(vis('missing'), 15000)), `the old handle @${mine} has no page now`);
await evaluate(`localStorage.setItem('rys-rad-waves-auth', localStorage.getItem('keep'))`);

// 5. Delete.
await go(`${b.base}account.html`);
await waitFor(`${vis('signed-in')} && document.getElementById('handle').value`, 15000);
check((await text('delete-word')) === mine2 && (await evaluate(`document.getElementById('delete').disabled`)), 'delete: type your handle first');
await setVal('delete-confirm', mine2);
check(!(await evaluate(`document.getElementById('delete').disabled`)), '... then it can be pressed');
await submit('delete-form');
check(/deleted/.test(await waitFor(`${vis('acct-msg')} && document.getElementById('acct-msg').textContent`, 15000) || ''), `back on the title: "${await text('acct-msg')}"`);
check(!!(await waitFor(vis('acct-open'), 5000)), 'signed out');
await go(`${b.base}profile.html?u=${mine2}`);
check(!!(await waitFor(vis('missing'), 15000)), 'the page is gone');
await b.done();
