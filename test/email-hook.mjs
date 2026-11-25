// The send-email hook (accounts plan task 11a), against the local stack (the hook on, no Resend key, so emails land
// in Mailpit):
//   1. it refuses a call that isn't signed, or is signed with another secret
//   2. signed as Auth would: a sign-in, a first sign-in, a code, each worded as the game's, from howdy@, with a working
//      verify link that keeps where to come back to
//   3. an email change sends one email to each address, each with its own link, whichever way round Auth names them
//   4. the words escape what they show (an address can't inject HTML)
//   5. for real, in the browser: signing in, then changing your email on the account page, confirmed from both
// npm run db:start first, then: npm run test:email-hook
import { createHmac, createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { openBrowser, signInOnTitle, latestLink, sleep, root } from './browser-lib.mjs';
import { buildEmail } from '../supabase/functions/send-email/emails.js';

const API = process.env.SB_URL || 'http://127.0.0.1:55321';
const MAIL = process.env.MAILPIT_URL || 'http://127.0.0.1:55324';
const FN = `${API}/functions/v1/send-email`;
const env = Object.fromEntries(readFileSync(join(root, 'supabase/functions/.env'), 'utf8').split('\n').filter((l) => l.includes('='))
  .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const SECRET = env.SEND_EMAIL_HOOK_SECRET;
let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) fails++; };
if (!SECRET) { console.log('FAIL SEND_EMAIL_HOOK_SECRET missing from supabase/functions/.env'); process.exit(1); }

// Standard Webhooks, as Auth signs: base64 HMAC-SHA256 of "<id>.<timestamp>.<body>" with the secret's bytes.
const sign = (body, secret = SECRET) => {
  const id = `msg_${randomUUID()}`, ts = String(Math.floor(Date.now() / 1000));
  const key = Buffer.from(secret.replace(/^v1,whsec_/, ''), 'base64');
  const sig = createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest('base64');
  return { 'webhook-id': id, 'webhook-timestamp': ts, 'webhook-signature': `v1,${sig}` };
};
const call = (payload, headers) => fetch(FN, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(payload) });
const hook = (payload) => { const body = JSON.stringify(payload); return fetch(FN, { method: 'POST', headers: { 'content-type': 'application/json', ...sign(body) }, body }); };
const inbox = async (to, ms = 8000) => {
  const t = Date.now();
  while (Date.now() - t < ms) {
    const list = await (await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`)).json();
    if (list.messages?.length) return Promise.all(list.messages.map(async (m) => (await fetch(`${MAIL}/api/v1/message/${m.ID}`)).json()));
    await sleep(250);
  }
  return [];
};
const hash = (addr, code) => createHash('sha224').update(addr + code).digest('hex');
const stamp = Date.now();

// 1. Signatures.
const sample = { user: { email: `x-${stamp}@example.com` }, email_data: { email_action_type: 'magiclink', token: '123456', token_hash: 'abc', redirect_to: 'http://127.0.0.1/' } };
check((await call(sample, {})).status === 401, 'no signature: refused');
const other = `v1,whsec_${Buffer.from('not the secret, not at all..!!').toString('base64')}`;
const body = JSON.stringify(sample);
check((await fetch(FN, { method: 'POST', headers: { 'content-type': 'application/json', ...sign(body, other) }, body })).status === 401, 'signed with another secret: refused');
check((await inbox(sample.user.email, 1500)).length === 0, '... and nothing was sent');

// 2. Each kind.
for (const [kind, subject] of [['magiclink', "Your Ry's Rad Waves sign-in link"], ['signup', "Welcome to Ry's Rad Waves"]]) {
  const to = `${kind}-${stamp}@example.com`;
  const r = await hook({ user: { email: to }, email_data: { email_action_type: kind, token: '111111', token_hash: `hash-${kind}`, redirect_to: 'http://127.0.0.1:8765/?wave=reef' } });
  check(r.status === 200, `${kind}: sent (${r.status})`);
  const [m] = await inbox(to);
  check(m?.Subject === subject && m?.From?.Address === 'howdy@rysradwaves.com', `${kind}: "${m?.Subject}" from ${m?.From?.Address}`);
  const link = (m?.Text || '').match(/https?:\/\/\S+\/auth\/v1\/verify\?\S+/)?.[0] || '';
  const u = link ? new URL(link) : null;
  check(u?.origin === API && u.searchParams.get('token') === `hash-${kind}` && u.searchParams.get('type') === kind && u.searchParams.get('redirect_to') === 'http://127.0.0.1:8765/?wave=reef',
    `${kind}: the link verifies at ${u?.origin} and comes back to the page`);
  check(/<a href="http:\/\/127\.0\.0\.1:55321\/auth\/v1\/verify\?/.test(m?.HTML || ''), `${kind}: the HTML has the button`);
}
{
  const to = `code-${stamp}@example.com`;
  await hook({ user: { email: to }, email_data: { email_action_type: 'reauthentication', token: '424242' } });
  const [m] = await inbox(to);
  check(/424242/.test(m?.Text || '') && !/verify\?/.test(m?.Text || ''), 'reauthentication: the code, no link');
}

// 3. An email change: each address gets its own link, found by the token hash whichever way the fields are named.
for (const swapped of [false, true]) {
  const now = `old-${swapped}-${stamp}@example.com`, next = `new-${swapped}-${stamp}@example.com`;
  const forNew = ['111222', hash(next, '111222')], forNow = ['333444', hash(now, '333444')];
  const [a, b] = swapped ? [forNow, forNew] : [forNew, forNow];
  const r = await hook({ user: { email: now, new_email: next }, email_data: { email_action_type: 'email_change', token: a[0], token_hash: a[1], token_new: b[0], token_hash_new: b[1], redirect_to: 'http://127.0.0.1/account.html' } });
  check(r.status === 200, `email change${swapped ? ' (fields the other way)' : ''}: sent`);
  const [mo] = await inbox(now), [mn] = await inbox(next);
  check(new URL((mo?.Text.match(/https?:\/\/\S+verify\?\S+/) || ['http://x'])[0]).searchParams.get('token') === forNow[1] && /Changing your email/.test(mo?.Text || ''),
    '... the old address gets its own link, and "Changing your email?"');
  check(new URL((mn?.Text.match(/https?:\/\/\S+verify\?\S+/) || ['http://x'])[0]).searchParams.get('token') === forNew[1] && /Your new email/.test(mn?.Text || ''),
    '... the new address gets its own, and "Your new email"');
}
{
  const next = `claim-${stamp}@example.com`; // (a guest adding an email: only the new address)
  await hook({ user: { email: '', new_email: next }, email_data: { email_action_type: 'email_change', token: '555666', token_hash: hash(next, '555666'), redirect_to: 'http://127.0.0.1/' } });
  const [m] = await inbox(next);
  check(/Your new email/.test(m?.Text || '') && /Then it's the email you sign in with/.test(m?.Text || ''), 'a guest adding an email: one email, to the new address');
}

// 4. Escaping.
const evil = buildEmail({ kind: 'email_change_current', link: 'http://x/?a=1&b="2"', email: '<b>a@x</b>', newEmail: 'b@x' });
check(!/<b>a@x<\/b>/.test(evil.html) && /&lt;b&gt;a@x&lt;\/b&gt;/.test(evil.html) && /a=1&amp;b=&quot;2&quot;/.test(evil.html), 'addresses and links are escaped in the HTML');

// 5. In the browser: sign in, then change the email on the account page and confirm from both addresses.
const b = await openBrowser({ shots: process.argv[2] });
b.check = (ok, msg) => check(ok, msg);
const first = `change-${stamp}@example.com`, second = `changed-${stamp}@example.com`;
await b.go(`${b.base}?wave=point`);
const signInLink = await signInOnTitle(b, first);
check(!!signInLink, 'browser: the sign-in email came through the hook');
check(!!(await b.waitFor(`${b.vis('acct-handle-form')} || ${b.vis('acct-who')}`, 20000)), '... and its link signs you in');
await b.go(`${b.base}account.html`);
await b.waitFor(b.vis('email-form'), 20000);
const sentAt = Date.now() - 1000;
await b.evaluate(`document.getElementById('email-new').value = ${JSON.stringify(second)}; document.getElementById('email-form').requestSubmit()`);
check(/Check both/.test(await b.waitFor(`/Check/.test(document.getElementById('email-msg').textContent) && document.getElementById('email-msg').textContent`, 10000) || ''), 'account: "check both"');
const l1 = await latestLink(first, 10000, sentAt), l2 = await latestLink(second, 10000, sentAt);
check(!!l1 && !!l2 && l1 !== l2, 'one link to each address');
await b.go(l1); await sleep(1500);
await b.go(l2); await sleep(1500);
await b.go(`${b.base}account.html`);
check(!!(await b.waitFor(`document.getElementById('email-now').textContent === ${JSON.stringify(second)}`, 15000)), `confirmed from both: the email is now ${await b.text('email-now')}`);
await b.close();

console.log(fails ? `${fails} failed` : 'all passed');
process.exit(fails ? 1 : 0);
