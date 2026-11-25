// Stripe end to end (accounts plan task 8), in the Stripe sandbox against the local stack. Real Checkout sessions from
// the `checkout` function are paid with test cards, and Stripe's own webhooks (forwarded by `stripe listen`) must land
// the right `entitlements` rows:
//   1. checkout turns away the signed out, guests, and return pages that aren't the game's; the webhook bad signatures
//   2. Wave Pass: bought -> counts; can't buy twice; refunded -> stops counting
//   3. Pro (on a Stripe test clock): bought -> counts, to the end of the month; can't buy twice; Manage billing opens;
//      the account can't be deleted while it renews; renews a month on; a failed renewal -> past due from the start
//      of the unpaid month; paid after all -> active; cancelled -> runs to the end, no grace; ended -> ends; then the
//      account can be deleted
//   4. Pro refunded -> stops counting
// Needs: npm run db:start; npm run functions:serve (in another terminal); the Stripe CLI on the sandbox
// (`stripe switch`); supabase/functions/.env with STRIPE_SECRET_KEY (rrw-set-stripe-key --local),
// and STRIPE_WEBHOOK_SECRET (`stripe listen --print-secret`); Google Chrome (to pay on the Checkout page).
// Then: npm run test:stripe
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { openBrowser } from './browser-lib.mjs';
import { payOnCheckout } from './checkout-page.mjs';

const API = process.env.SB_URL || 'http://127.0.0.1:55321';
const KEY = process.env.SB_KEY || 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';
const BACK = 'http://127.0.0.1:8765/?wave=raglan';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) fails++; };
const bail = (msg) => { console.log(`FAIL ${msg}`); process.exit(1); };

// Setup checks.
const env = Object.fromEntries(readFileSync(new URL('../supabase/functions/.env', import.meta.url), 'utf8')
  .split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
if (!env.STRIPE_SECRET_KEY?.startsWith('sk_test_')) bail('STRIPE_SECRET_KEY (sk_test_) missing from supabase/functions/.env (rrw-set-stripe-key --local)');
const status = JSON.parse(execFileSync('npx', ['supabase', 'status', '-o', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
const SERVICE = status.SECRET_KEY;
const fnUp = await fetch(`${API}/functions/v1/checkout`, { method: 'OPTIONS' }).catch(() => null);
if (!fnUp?.ok) bail(`the functions aren't served at ${API}/functions/v1 (npm run functions:serve)`);

// The Stripe CLI (server-side test actions: clocks, refunds, cancelling). Its errors come back as JSON.
// (the same API version as the functions, so the shapes match)
const sc = (...args) => {
  const extra = args[0] === 'delete' ? ['--confirm'] : []; // (delete asks "are you sure?" otherwise)
  const j = JSON.parse(execFileSync('stripe', [...args, ...extra, '--stripe-version', '2025-08-27.basil'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
  if (j.error) throw new Error(`stripe ${args.slice(0, 2).join(' ')}: ${j.error.message}`);
  return j;
};
const account = execFileSync('stripe', ['config', '--list'], { encoding: 'utf8' });
if (!/sandbox/i.test(account)) bail('the Stripe CLI is not on a sandbox (stripe switch)');

// Paying on the Checkout page as a player would (test/checkout-page.mjs).
const browser = await openBrowser({ shots: process.env.SHOTS });
await browser.send('Page.enable');
await browser.send('Runtime.enable');
await browser.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1600, deviceScaleFactor: 1, mobile: false });
// Where Checkout sends you back: the test's own server (the address is what counts).
const RETURN = `${browser.base}css/pages.css?wave=raglan`; // (any real file; a missing one shows Chrome's error page, which hides the address)
const pay = (url) => payOnCheckout(browser, url, browser.base);
const card = async (token) => sc('post', '/v1/payment_methods', '-d', 'type=card', '-d', `card[token]=${token}`).id;

// Webhooks: Stripe -> stripe listen -> the local function.
const listen = spawn('stripe', ['listen', '--forward-to', `${API}/functions/v1/stripe-webhook`,
  '--events', 'checkout.session.completed,checkout.session.async_payment_succeeded,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,invoice.paid,invoice.payment_failed,charge.refunded'],
{ stdio: ['ignore', 'ignore', 'pipe'] });
await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('stripe listen did not start')), 30000);
  listen.stderr.on('data', (d) => { if (/Ready!/.test(String(d))) { clearTimeout(t); resolve(); } });
});
const clocks = [];
const done = async () => {
  listen.kill();
  await browser.close();
  for (const c of clocks) { try { sc('delete', `/v1/test_helpers/test_clocks/${c}`); } catch { /* gone */ } }
};

// Players.
async function player(name) {
  const email = `${name}-${Date.now()}@example.com`;
  const r = await fetch(`${API}/auth/v1/admin/generate_link`, {
    method: 'POST', headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'magiclink', email, redirect_to: BACK }),
  });
  const link = (await r.json()).action_link;
  const hop = await fetch(link, { redirect: 'manual' });
  const token = new URLSearchParams((hop.headers.get('location') || '').split('#')[1] || '').get('access_token');
  const me = JSON.parse(atob(token.split('.')[1]));
  return { email, token, id: me.sub };
}
const rest = (path, { token, body, method = body ? 'POST' : 'GET', key = KEY } = {}) => fetch(`${API}/rest/v1/${path}`, {
  method, headers: { apikey: key, authorization: `Bearer ${token ?? key}`, 'content-type': 'application/json' },
  body: body ? JSON.stringify(body) : undefined,
});
const plan = async (p) => (await rest('rpc/my_plan', { token: p.token, body: {} })).json();
const rows = async (p, kind) => (await (await rest(`entitlements?select=*&kind=eq.${kind}&order=id`, { token: p.token })).json());
const checkout = (body, token) => fetch(`${API}/functions/v1/checkout`, {
  method: 'POST', headers: { apikey: KEY, 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(body),
});
async function until(what, f, ms = 60000) {
  const t = Date.now();
  let last;
  while (Date.now() - t < ms) { last = await f(); if (last) return last; await sleep(700); }
  check(false, `timed out waiting: ${what}`);
  return null;
}
const periodEnd = (subId) => sc('get', `/v1/subscriptions/${subId}`).items.data[0].current_period_end;
const near = (iso, unixSeconds, slackS = 120) => !!iso && Math.abs(new Date(iso).getTime() / 1000 - unixSeconds) <= slackS;

try {
  // 1. Turned away.
  check((await checkout({ kind: 'wave_pass', return_to: BACK })).status === 401, 'checkout: signed out -> 401');
  const guest = await (await fetch(`${API}/auth/v1/signup`, { method: 'POST', headers: { apikey: KEY, 'content-type': 'application/json' }, body: '{}' })).json();
  check((await checkout({ kind: 'wave_pass', return_to: BACK }, guest.access_token)).status === 403, 'checkout: a guest -> 403');
  const w = await player('pass');
  check((await checkout({ kind: 'wave_pass', return_to: 'https://evil.example/' }, w.token)).status === 400, 'checkout: a return page elsewhere -> 400');
  check((await checkout({ kind: 'gold', return_to: BACK }, w.token)).status === 400, 'checkout: an unknown kind -> 400');
  check((await checkout({ kind: 'portal', return_to: BACK }, w.token)).status === 404, 'Manage billing before buying -> 404');
  const forged = await fetch(`${API}/functions/v1/stripe-webhook`, { method: 'POST', headers: { 'stripe-signature': 't=1,v1=bad' }, body: '{"type":"checkout.session.completed"}' });
  check(forged.status === 400, `webhook: a forged event -> 400 (${forged.status})`);

  // 2. Wave Pass.
  let r = await checkout({ kind: 'wave_pass', return_to: RETURN }, w.token);
  let j = await r.json();
  check(r.ok && /^https:\/\/checkout\.stripe\.com\//.test(j.url), `checkout: Wave Pass -> Stripe Checkout (${r.status})`);
  const ws = sc('get', `/v1/checkout/sessions/${j.id}`);
  check(ws.amount_total === 500 && ws.mode === 'payment' && ws.metadata.user_id === w.id, `... $5, one payment, for this player`);
  check(ws.success_url.startsWith(`${RETURN}&checkout=done&session_id=`), `... back to the same page after: ${ws.success_url}`);
  const landed = await pay(j.url);
  check(landed.includes('checkout=done&session_id=cs_'), `paid on the Checkout page; back to the game: ${landed}`);
  check(!!await until('the Wave Pass', async () => (await plan(w)).wave_pass), 'paid: the Wave Pass counts');
  const [pass] = await rows(w, 'wave_pass');
  check(pass?.source === 'stripe' && pass.expires_at === null && pass.external_id?.startsWith('pi_'), `... for life, from Stripe (${pass?.external_id})`);
  check((await checkout({ kind: 'wave_pass', return_to: BACK }, w.token)).status === 409, "can't buy it twice -> 409");
  sc('refunds', 'create', '--payment-intent', pass.external_id);
  check(!!await until('the refund', async () => (await rows(w, 'wave_pass'))[0]?.status === 'refunded'), 'refunded: marked refunded');
  check(!(await plan(w)).wave_pass, '... and it stops counting');

  // 3. Pro, on a test clock so months can pass.
  const p = await player('pro');
  const T0 = Math.floor(Date.now() / 1000);
  const clock = sc('post', '/v1/test_helpers/test_clocks', '-d', `frozen_time=${T0}`, '-d', 'name=rrw test');
  clocks.push(clock.id);
  const cus = sc('post', '/v1/customers', '-d', `email=${p.email}`, '-d', `test_clock=${clock.id}`, '-d', `metadata[user_id]=${p.id}`);
  check((await rest('rpc/stripe_link_customer', { key: SERVICE, body: { uid: p.id, customer: cus.id } })).ok, 'a customer on a test clock');
  const advance = async (to) => {
    sc('post', `/v1/test_helpers/test_clocks/${clock.id}/advance`, '-d', `frozen_time=${to}`);
    await until('the clock', async () => sc('get', `/v1/test_helpers/test_clocks/${clock.id}`).status === 'ready', 120000);
  };

  r = await checkout({ kind: 'pro', return_to: RETURN }, p.token);
  j = await r.json();
  check(r.ok && /checkout\.stripe\.com/.test(j.url), `checkout: Pro -> Stripe Checkout (${r.status})`);
  await pay(j.url);
  const bought = await until('Pro', async () => { const x = (await rows(p, 'pro'))[0]; return x?.status === 'active' && x; });
  const sub = sc('get', `/v1/subscriptions/${bought?.external_id}`);
  check(sub.customer === cus.id && near(bought?.expires_at, sub.items.data[0].current_period_end), `paid: Pro to the end of the month (${bought?.expires_at})`);
  check((await plan(p)).pro, '... my_plan says Pro');
  check((await checkout({ kind: 'pro', return_to: BACK }, p.token)).status === 409, "can't buy Pro twice -> 409");
  r = await checkout({ kind: 'portal', return_to: BACK }, p.token);
  check(r.ok && /billing\.stripe\.com/.test((await r.json()).url), `Manage billing -> the Customer Portal (${r.status})`);
  r = await rest('rpc/delete_my_account', { token: p.token, body: {} });
  check(!r.ok && /cancel Pro first/.test(await r.text()), "can't delete the account while Pro renews");

  // Renews.
  const end1 = sub.items.data[0].current_period_end;
  await advance(end1 + 2 * 3600);
  const renewed = await until('the renewal', async () => { const x = (await rows(p, 'pro'))[0]; return near(x?.expires_at, end1 + 30 * 86400, 2 * 86400) && x; }, 120000);
  check(renewed?.status === 'active', `renewed: a month on (${renewed?.expires_at})`);
  const end2 = periodEnd(sub.id);

  // The next renewal fails: the card is taken off the account (Managed Payments won't let the API swap a
  // subscription's card; players do that in the portal), so there's nothing to charge.
  for (const pm of sc('get', `/v1/customers/${cus.id}/payment_methods`).data) sc('post', `/v1/payment_methods/${pm.id}/detach`);
  await advance(end2 + 2 * 3600);
  const failed = await until('past due', async () => { const x = (await rows(p, 'pro'))[0]; return x?.status === 'past_due' && x; }, 120000);
  check(near(failed?.expires_at, end2), `a failed renewal: past due from the start of the unpaid month (${failed?.expires_at})`);

  // Paid after all, with a new card.
  const good = sc('post', `/v1/payment_methods/${await card('tok_visa')}/attach`, '-d', `customer=${cus.id}`);
  // (Managed Payments invoices are paid with no options: the customer's default card)
  sc('post', `/v1/customers/${cus.id}`, '-d', `invoice_settings[default_payment_method]=${good.id}`);
  sc('post', `/v1/invoices/${sc('get', `/v1/subscriptions/${sub.id}`).latest_invoice}/pay`);
  const end3 = periodEnd(sub.id);
  check(!!await until('paid again', async () => { const x = (await rows(p, 'pro'))[0]; return x?.status === 'active' && near(x.expires_at, end3); }),
    'paid after all: active to the end of that month');

  // Cancelled at the end of the month.
  sc('post', `/v1/subscriptions/${sub.id}`, '-d', 'cancel_at_period_end=true');
  const cancelled = await until('cancelled', async () => { const x = (await rows(p, 'pro'))[0]; return x?.status === 'canceled' && x; });
  check(near(cancelled?.expires_at, end3), `cancelled: Pro runs to the end of the month (${cancelled?.expires_at})`);

  // Ended now.
  sc('delete', `/v1/subscriptions/${sub.id}`);
  const ended = await until('ended', async () => { const x = (await rows(p, 'pro'))[0]; return x && new Date(x.expires_at).getTime() / 1000 < end3 - 86400 && x; });
  const endedAt = sc('get', `/v1/subscriptions/${sub.id}`).ended_at;
  check(ended?.status === 'canceled' && near(ended?.expires_at, endedAt), `ended: Pro ends when the subscription did (${ended?.expires_at})`);
  r = await rest('rpc/delete_my_account', { token: p.token, body: {} });
  check(r.ok, `then the account can be deleted (${r.status})`);

  // 4. A refunded Pro month.
  const q = await player('refund');
  j = await (await checkout({ kind: 'pro', return_to: RETURN }, q.token)).json();
  await pay(j.url);
  const qPro = await until('Pro', async () => { const x = (await rows(q, 'pro'))[0]; return x?.status === 'active' && x; });
  const invPaid = sc('get', '/v1/invoice_payments', '-d', `invoice=${sc('get', `/v1/subscriptions/${qPro?.external_id}`).latest_invoice}`);
  sc('refunds', 'create', '--payment-intent', invPaid.data[0].payment.payment_intent);
  check(!!await until('the Pro refund', async () => (await rows(q, 'pro'))[0]?.status === 'refunded'), 'a refunded Pro month: marked refunded');
  check(!(await plan(q)).pro, '... and Pro stops counting');
  sc('delete', `/v1/subscriptions/${qPro.external_id}`);
  await sleep(3000);
  check((await rows(q, 'pro'))[0]?.status === 'refunded', '... and stays refunded when the subscription ends');
} catch (e) {
  check(false, e.stack || String(e));
} finally {
  await done();
}
console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);
