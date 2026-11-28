// The paywall in the real pages (accounts plan task 9): headless Chrome, the local stack, and (part 4) the Stripe sandbox.
//   1. no ?paywall (as live until sales open): no lock, no buy buttons anywhere
//   2. a visitor taps a locked wave: the Wave Pass sheet (both offers, sign-in first); Escape closes it; on a phone too
//   3. signing in from the sheet: the link brings you back with the sheet open again, now with buy buttons
//   4. buying: the button goes to Stripe Checkout; paying (test card) comes back to the game, a note says the pass is
//      yours, and you're put on the wave you tapped (the webhook through `stripe listen`); the account page then shows
//      Manage billing, which opens Stripe's billing page
//   5. coming back before the webhook: "Unlocking…" until the plan shows it; cancelling: "No charge."
//   6. the builder: a free member gets "Go Pro" (the sheet offers Pro only); the account page offers both
// Needs: npm run db:start; npm run functions:serve; for part 4 the Stripe CLI on the sandbox (as test:stripe).
// SKIP_PAY=1 skips part 4. Then: npm run test:paywall-browser [shotPrefix]
import { execSync, spawn } from 'node:child_process';
import { openBrowser, signInOnTitle, latestLink, sleep, root } from './browser-lib.mjs';
import { payOnCheckout } from './checkout-page.mjs';

const API = process.env.SB_URL || 'http://127.0.0.1:55321';
const SECRET = process.env.SB_SECRET || JSON.parse(execSync('npx supabase status -o json', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString()).SECRET_KEY;
const grant = async (user_id, kind) => {
  const r = await fetch(`${API}/rest/v1/entitlements`, { method: 'POST', headers: { apikey: SECRET, authorization: `Bearer ${SECRET}`, 'content-type': 'application/json' },
    body: JSON.stringify({ user_id, kind, source: 'grant', expires_at: kind === 'pro' ? new Date(Date.now() + 30 * 864e5).toISOString() : null, note: 'test' }) });
  if (!r.ok) throw new Error(`grant: ${r.status} ${await r.text()}`);
};

const b = await openBrowser({ shots: process.argv[2] });
const { check, evaluate, waitFor, vis, shot, go, text, send, key } = b;
const on = `document.querySelector('#waves button.on')?.textContent`;
const tap = (name) => evaluate(`document.getElementById('home').hidden || document.getElementById('go-surf').click(); [...document.querySelectorAll('#waves button')].find((x) => x.textContent.includes(${JSON.stringify(name)})).click()`);
const sheet = `!!document.getElementById('paywall')`;
const offers = `[...document.querySelectorAll('#paywall .pw-offer')].map((x) => x.id).join(',')`;
const toastText = `document.getElementById('pw-toast')?.textContent || ''`;
const ready = () => waitFor(`${vis('acct-open')} || ${vis('acct-who')} || ${vis('acct-handle-form')}`, 20000);

// 1. As live today.
await go(`${b.base}?wave=reef`);
await ready(); await sleep(800);
check((await evaluate(on)) === 'Pipe' && !(await evaluate(`document.querySelectorAll('#waves button.locked').length`)), 'no paywall: Pipe open');
await go(`${b.base}account.html`); await sleep(1500);
check(!(await evaluate(vis('buy-pass'))) && !(await evaluate(vis('buy-pro'))), 'no paywall: no buy buttons on the account page');

// 2. A visitor taps a locked wave.
await go(`${b.base}?paywall&wave=point`);
await ready(); await sleep(800);
const door = (id) => `(() => { const e = document.getElementById('${id}'); return e.classList.contains('locked') && /🔒/.test(e.textContent); })()`;
check(!!(await waitFor(`${door('go-build')} && ${door('go-compete')} && !document.getElementById('go-surf').classList.contains('locked')`, 15000)), 'not Pro: Build a break and Compete are locked, Free surf isn\'t');
await evaluate(`document.getElementById('go-compete').click()`); await sleep(300);
check((await evaluate(offers)) === 'pw-pro' && /Competing comes with Pro/.test(await evaluate(`document.querySelector('#paywall .pw-why').textContent`)), 'tapping Compete opens the Pro sheet');
check(await evaluate(`!document.getElementById('home').hidden`), '... and stays on the landing');
await key('Escape', 'Escape');
await evaluate(`document.getElementById('go-build').click()`); await sleep(300);
check((await evaluate(offers)) === 'pw-pro' && /^\?/.test(await evaluate('location.search')) && !/builder/.test(await evaluate('location.pathname')), 'tapping Build a break opens the Pro sheet, not the builder');
await key('Escape', 'Escape');
await tap('Pipe'); await sleep(300);
check(await evaluate(sheet), 'tapping Pipe opens the sheet');
check((await evaluate(offers)) === 'pw-wave_pass,pw-pro', `both offers, the pass first (${await evaluate(offers)})`);
check(/Pipe comes with the Wave Pass/.test(await evaluate(`document.querySelector('#paywall .pw-why').textContent`)), 'it says why');
check(await evaluate(vis('pw-email')) && !(await evaluate(`!!document.querySelector('#paywall .pw-buy')`)), 'signed out: email first, no buy buttons');
check(/terms\.html/.test(await evaluate(`document.querySelector('#paywall .pw-small').innerHTML`)), 'links the terms');
check((await evaluate(on)) === 'Raglan', 'still on Raglan');
await shot('1-sheet');
await key('Escape', 'Escape');
check(!(await evaluate(sheet)), 'Escape closes it');
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await tap('Trestles'); await sleep(300);
const fits = await evaluate(`(() => { const r = document.querySelector('#paywall .pw').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight + 1; })()`);
check(fits, 'on a phone the sheet fits the screen');
await shot('2-phone');
await evaluate(`document.querySelector('#paywall .pw-x').click()`);
await send('Emulation.clearDeviceMetricsOverride');

// 3. Signing in from the sheet.
await go(`${b.base}?wave=point`); // (?paywall stays on for the visit)
await ready(); await sleep(500);
await tap('Pipe'); await sleep(300);
const email = `paywall-${Date.now()}@example.com`;
await evaluate(`document.getElementById('pw-email').value = ${JSON.stringify(email)}; document.querySelector('#paywall form').requestSubmit()`);
check(!!(await waitFor(vis('pw-sent'), 8000)), 'the sheet says to check your email');
const link = await latestLink(email);
check(!!link, 'the link arrived');
await go(link);
check(!!(await waitFor(`${sheet} && !!document.querySelector('#paywall .pw-buy')`, 20000)), 'back from the link: the sheet is open again, with buy buttons');
check(/Pipe comes with/.test(await evaluate(`document.querySelector('#paywall .pw-why')?.textContent || ''`)), '... still about Pipe');
check(!/buy=/.test(await evaluate('location.search')), `... and the address is clean (${await evaluate('location.search')})`);
await shot('3-signed-in');
const uid = await evaluate(`JSON.parse(localStorage.getItem('rys-rad-waves-auth')).user.id`);

// 4. Buying, for real, in the sandbox.
if (process.env.SKIP_PAY) console.log('skip buying (SKIP_PAY)');
else {
  const listen = spawn('stripe', ['listen', '--forward-to', `${API}/functions/v1/stripe-webhook`, '--events',
    'checkout.session.completed,checkout.session.async_payment_succeeded,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,invoice.paid,invoice.payment_failed,charge.refunded'],
  { stdio: ['ignore', 'ignore', 'pipe'] });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('stripe listen did not start')), 30000);
    listen.stderr.on('data', (d) => { if (/Ready!/.test(String(d))) { clearTimeout(t); resolve(); } });
  });
  try {
    await evaluate(`document.querySelector('#pw-wave_pass .pw-buy').click()`);
    const there = await waitFor(`location.host === 'checkout.stripe.com' && location.href`, 20000);
    check(!!there, 'Get the Wave Pass goes to Stripe Checkout');
    await sleep(500);
    const landed = await payOnCheckout(b, await evaluate('location.href'), b.base);
    check(/wave=reef/.test(landed), `paid: back on the game, on the wave you tapped (${landed.replace(b.base, '/')}; the page may already have cleaned up ?checkout=)`);
    check(/Wave Pass is yours/.test(await waitFor(`/yours/.test(${toastText}) && ${toastText}`, 40000) || ''), `a note says so: "${await evaluate(toastText)}"`);
    check(!!(await waitFor(`${on} === 'Pipe'`, 5000)), `... and you're on Pipe (${await evaluate(on)})`);
    check(!/checkout|session_id|bought/.test(await evaluate('location.search')), `the address is clean (${await evaluate('location.search')})`);
    await shot('4-bought');
    await go(`${b.base}account.html`);
    check(!!(await waitFor(`${vis('billing')} && ${vis('buy-pro')} && !${vis('buy-pass')}`, 15000)), 'account: Manage billing and Go Pro, no Wave Pass button');
    await evaluate(`document.getElementById('billing').click()`);
    check(!!(await waitFor(`location.host === 'billing.stripe.com'`, 20000)), 'Manage billing opens Stripe\'s billing page');
  } finally { listen.kill(); }
}

// 5. Back before the webhook, and cancelling (a second player).
await go(`${b.base}account.html`); await sleep(1000);
await evaluate(`document.getElementById('signout').click()`); await sleep(1500);
const email2 = `paywall2-${Date.now()}@example.com`;
await go(`${b.base}?wave=point`);
await signInOnTitle(b, email2);
await ready(); await sleep(1000);
const uid2 = await evaluate(`JSON.parse(localStorage.getItem('rys-rad-waves-auth')).user.id`);
check(uid2 && uid2 !== uid, 'a second player');
await go(`${b.base}?wave=trestles&checkout=done&bought=wave_pass&session_id=cs_test_x`);
check(/Unlocking/.test(await waitFor(`/Unlocking/.test(${toastText}) && ${toastText}`, 15000) || ''), 'back before the webhook: "Unlocking…"');
check((await evaluate(on)) === 'Raglan', '... waiting on Raglan');
await grant(uid2, 'wave_pass'); // (as the webhook would)
check(!!(await waitFor(`/yours/.test(${toastText})`, 15000)), 'then the pass shows up');
check(!!(await waitFor(`${on} === 'Trestles'`, 5000)), `... and you're put on Trestles (${await evaluate(on)})`);
await go(`${b.base}?wave=point`);
check(!!(await waitFor(`document.getElementById('go-compete').classList.contains('locked')`, 15000)), 'a Wave Pass alone: Compete stays locked (it\'s Pro)');
await go(`${b.base}?wave=point&checkout=cancel`);
check(/No charge/.test(await waitFor(`/No charge/.test(${toastText}) && ${toastText}`, 15000) || ''), 'cancelled: "No charge."');

// 6. The builder and the account page, for a free member (a third player).
await go(`${b.base}account.html`); await sleep(1000);
await evaluate(`document.getElementById('signout').click()`); await sleep(1500);
await go(`${b.base}?wave=point`);
await signInOnTitle(b, `paywall3-${Date.now()}@example.com`);
await ready(); await sleep(800);
await go(`${b.base}builder.html`);
const goPro = `[...document.querySelectorAll('#breaks button')].find((x) => /Go Pro/.test(x.textContent))`;
check(!!(await waitFor(`!!${goPro}`, 20000)), 'builder: a free member sees Go Pro');
await evaluate(`${goPro}.click()`); await sleep(300);
check((await evaluate(offers)) === 'pw-pro', `... which offers Pro only (${await evaluate(offers)})`);
check(/Saving your breaks comes with Pro/.test(await evaluate(`document.querySelector('#paywall .pw-why')?.textContent || ''`)), '... and says why');
await shot('5-builder');
await go(`${b.base}account.html`);
check(!!(await waitFor(`${vis('buy-pass')} && ${vis('buy-pro')} && !${vis('billing')}`, 15000)), 'account, free: both buy buttons, no billing');
await evaluate(`document.getElementById('buy-pro').click()`); await sleep(300);
check((await evaluate(offers)) === 'pw-pro', 'Go Pro there opens the Pro sheet');
await shot('6-account');
await grant(await evaluate(`JSON.parse(localStorage.getItem('rys-rad-waves-auth')).user.id`), 'pro');
await go(`${b.base}?wave=point`);
check(!!(await waitFor(`!document.getElementById('go-compete').classList.contains('locked') && document.getElementById('go-compete').textContent === 'Compete' && document.getElementById('go-build').textContent === 'Build a break' && document.querySelectorAll('#waves button').length > 0`, 15000)), 'Pro: both open');
await evaluate(`document.getElementById('go-compete').click()`);
check(await evaluate(`!document.getElementById('compete-menu').hidden && !document.getElementById('paywall')`), '... and Compete opens its menu');

await b.done();
