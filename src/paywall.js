// The Wave Pass / Pro sheet, and coming back from Stripe Checkout (accounts plan task 9). One module for every page
// (the game, the builder, the account page): it brings its own markup and styles, so each page only calls
// `openPaywall({ want, why })` and, once as it starts, `startPaywall()`.
//
//   want: 'wave_pass' (a locked wave: both offers, since Pro includes the pass) or 'pro' (building or hosting: Pro only)
//   why:  the line at the top ("Pipe comes with the Wave Pass.")
//   back: where Checkout returns you (default: this page as it is now). The game passes the wave you picked.
//
// Signed out (or an anonymous guest), the sheet asks for your email first. The magic link brings you back to the same
// page with ?buy=<kind>, and the sheet opens again, one tap from paying. Back from Checkout (?checkout=done&bought=<kind>)
// the plan is read again until the webhook has landed it, and a note says it's yours (or, ?checkout=cancel, that
// nothing was charged). Either way the address is cleaned up.
//
// SALES_OPEN (account.js) hides every buy button until payments are live, so nobody pays the Stripe sandbox.
import { initAccount, onAccount, currentUser, currentPlan, myPlan, sendMagicLink, describeAuthError, supabaseTarget, SALES_OPEN } from './account.js';

export const PRICES = { wave_pass: '$5', pro: '$3' };
const OFFERS = {
  wave_pass: { name: 'Wave Pass', price: '$5', per: 'once', line: 'All the waves. For life.', buy: 'Get the Wave Pass' },
  pro: { name: 'Pro', price: '$3', per: 'a month', line: 'Every wave, plus saving your breaks and hosting contests. Cancel any time.', buy: 'Go Pro' },
};

const CSS = `
.pw-back { position: fixed; inset: 0; z-index: 50; background: rgba(5,14,20,.62); display: flex; align-items: flex-end; justify-content: center; }
@media (min-width: 560px) { .pw-back { align-items: center; } }
.pw { --pw-bg: #0f2c41; --pw-ink: #0b1a24; --pw-dim: #9fc1cf; --pw-line: rgba(255,255,255,.16);
  position: relative; width: min(440px, 100%); max-height: 100%; overflow: auto; background: var(--pw-bg); color: #eaf6fa;
  font: 400 15px/1.4 Rubik, system-ui, sans-serif; border-radius: 18px 18px 0 0; padding: 22px 16px 18px; box-shadow: 0 -6px 30px rgba(0,0,0,.4);
  text-align: left; text-shadow: none; }
@media (min-width: 560px) { .pw { border-radius: 18px; padding: 24px 22px 20px; } }
.pw h2 { font: 400 22px/1.1 Bungee, sans-serif; color: #ffd426; margin: 0 34px 6px 0; }
.pw .pw-why { color: var(--pw-dim); margin: 0 0 14px; }
.pw .pw-x { position: absolute; top: 12px; right: 12px; width: 34px; height: 34px; border-radius: 50%; border: 2px solid var(--pw-line);
  background: rgba(255,255,255,.06); color: #eaf6fa; font: 700 16px Rubik, sans-serif; cursor: pointer; padding: 0; }
.pw .pw-offer { border: 2px solid var(--pw-line); border-radius: 14px; padding: 12px 14px; margin-top: 10px; display: grid; grid-template-columns: 1fr auto; gap: 2px 12px; align-items: center; }
.pw .pw-offer.pw-main { border-color: #00c2c7; background: rgba(0,194,199,.1); }
.pw .pw-name { font: 400 16px Bungee, sans-serif; }
.pw .pw-price { font: 400 20px Bungee, sans-serif; color: #ffd426; text-align: right; white-space: nowrap; }
.pw .pw-price small { display: block; font: 500 11px Rubik, sans-serif; color: var(--pw-dim); }
.pw .pw-line { grid-column: 1 / -1; color: var(--pw-dim); font-size: 14px; }
.pw .pw-buy { grid-column: 1 / -1; margin-top: 8px; font: 700 15px Rubik, sans-serif; color: var(--pw-ink); background: #00c2c7; border: 2px solid #fff;
  border-radius: 22px; padding: 10px 16px; cursor: pointer; width: 100%; }
.pw .pw-offer:not(.pw-main) .pw-buy { background: rgba(255,255,255,.08); color: #eaf6fa; border-color: var(--pw-line); }
.pw button:disabled { opacity: .55; cursor: default; }
.pw form { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.pw form input { flex: 1 1 200px; font: 500 15px Rubik, sans-serif; color: var(--pw-ink); background: #fff; border: 2px solid #fff; border-radius: 12px; padding: 9px 12px; min-width: 0; }
.pw form button { font: 700 14px Rubik, sans-serif; color: var(--pw-ink); background: #ffd426; border: 2px solid #fff; border-radius: 20px; padding: 9px 16px; cursor: pointer; }
.pw .pw-ask { font-weight: 700; margin: 16px 0 0; }
.pw .pw-msg { margin: 12px 0 0; font-weight: 700; color: #ff9a9a; }
.pw .pw-msg.pw-good { color: #7fe3a0; }
.pw .pw-small { margin: 14px 0 0; font-size: 12px; color: var(--pw-dim); }
.pw .pw-small a { color: #00c2c7; }
.pw-toast { position: fixed; z-index: 60; top: 14px; left: 50%; transform: translateX(-50%); width: max-content; max-width: calc(100% - 32px);
  background: #0f2c41; color: #eaf6fa; border: 2px solid #00c2c7; border-radius: 14px; padding: 10px 16px; box-shadow: 0 6px 24px rgba(0,0,0,.35);
  font: 700 15px/1.35 Rubik, system-ui, sans-serif; text-align: center; text-shadow: none; }
.pw-toast small { display: block; font-weight: 500; font-size: 13px; color: #9fc1cf; }
`;

const h = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); for (const k of kids) if (k != null) e.append(k); return e; };
let styled = false;
const style = () => { if (styled) return; styled = true; document.head.append(h('style', { textContent: CSS })); };
// (pages live side by side, so terms.html sits next to whichever page opened the sheet)
const page = (name) => new URL(name, location.href).href;
const has = (plan, kind) => (kind === 'pro' ? plan.pro : plan.wave_pass);

// Opens Stripe: Checkout to buy `kind`, or the Customer Portal (kind 'portal'). Resolves only on an error (the page
// is leaving otherwise); throws with a sentence to show.
export async function goToStripe(kind, back = location.href) {
  const c = await initAccount();
  const session = (await c.auth.getSession()).data.session;
  if (!session) throw new Error('Sign in first.');
  const u = new URL(back);
  for (const k of ['buy', 'checkout', 'session_id', 'bought', 'paywall_test']) u.searchParams.delete(k);
  if (kind !== 'portal') u.searchParams.set('bought', kind);
  let r, body = {};
  try {
    r = await fetch(`${supabaseTarget().url}/functions/v1/checkout`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${session.access_token}`, apikey: supabaseTarget().key },
      body: JSON.stringify({ kind, return_to: u.href }),
    });
    body = await r.json().catch(() => ({}));
  } catch { throw new Error("Can't reach the server. Check your connection."); }
  if (r.ok && body.url) { location.assign(body.url); return new Promise(() => {}); }
  const words = {
    have_wave_pass: 'You already have the Wave Pass.', have_pro: 'You already have Pro.',
    guest: 'Sign in with your email to buy.', signed_out: 'Sign in first.',
    no_customer: "There's no billing here yet: nothing's been bought on this account.",
  }[body.code];
  const e = new Error(words || body.error || 'Something went wrong. Try again.');
  e.code = body.code;
  throw e;
}

let open = null; // (the sheet showing, if any: { el, render })

export function closePaywall() { if (!open) return; open.el.remove(); open.off?.(); open = null; document.removeEventListener('keydown', onKey); }
const onKey = (e) => { if (e.key === 'Escape') closePaywall(); };

export function openPaywall({ want = 'wave_pass', why = '', back } = {}) {
  if (!SALES_OPEN) return false;
  style(); closePaywall();
  const plan = currentPlan();
  if (has(plan, want) || (want === 'wave_pass' && plan.pro)) return false;
  const kinds = want === 'pro' || plan.wave_pass ? ['pro'] : ['wave_pass', 'pro'];
  let msg = null, busy = false, sent = null;
  const sheet = h('div', { className: 'pw', role: 'dialog', ariaModal: 'true', ariaLabel: OFFERS[want].name });
  const el = h('div', { className: 'pw-back', id: 'paywall' }, sheet);
  el.addEventListener('pointerdown', (e) => { e.stopPropagation(); if (e.target === el) closePaywall(); });
  el.addEventListener('click', (e) => e.stopPropagation()); // (the game starts a ride on a click on the title screen)

  async function buy(kind) {
    busy = true; msg = null; render();
    try { await goToStripe(kind, back || location.href); }
    catch (e) {
      busy = false; msg = { text: e.message };
      if (/^have_/.test(e.code)) { await myPlan().catch(() => {}); msg = { text: e.message, good: true }; }
      render();
    }
  }
  async function signIn(email) {
    busy = true; msg = null; render();
    try {
      const u = new URL(back || location.href); u.searchParams.set('buy', want);
      history.replaceState(null, '', location.pathname + location.search); // (the link comes back to this address...)
      await sendMagicLink(email, u.href); // (...with ?buy=, so the sheet opens again once you're in)
      sent = email;
    } catch (e) { msg = { text: describeAuthError(e) }; }
    busy = false; render();
  }

  function render() {
    const user = currentUser(), member = user && !user.is_anonymous;
    sheet.innerHTML = '';
    sheet.append(h('button', { className: 'pw-x', type: 'button', textContent: '✕', ariaLabel: 'Close', onclick: closePaywall }));
    sheet.append(h('h2', { textContent: want === 'pro' ? 'Go Pro' : 'Wave Pass' }));
    if (why) sheet.append(h('p', { className: 'pw-why', textContent: why }));
    for (const k of kinds) {
      const o = OFFERS[k];
      const box = h('div', { className: `pw-offer ${k === kinds[0] ? 'pw-main' : ''}`, id: `pw-${k}` },
        h('div', { className: 'pw-name', textContent: o.name }),
        h('div', { className: 'pw-price' }, o.price, h('small', { textContent: o.per })),
        h('div', { className: 'pw-line', textContent: o.line }));
      if (member) box.append(h('button', { className: 'pw-buy', type: 'button', textContent: `${o.buy} · ${o.price}${k === 'pro' ? '/mo' : ''}`, disabled: busy, onclick: () => buy(k) }));
      sheet.append(box);
    }
    if (!member) {
      if (sent) sheet.append(h('p', { className: 'pw-msg pw-good', id: 'pw-sent', textContent: `Check ${sent} for your sign-in link. It brings you right back here.` }));
      else {
        sheet.append(h('p', { className: 'pw-ask', textContent: 'First, sign in with your email (no password).' }));
        const input = h('input', { type: 'email', id: 'pw-email', required: true, autocomplete: 'email', placeholder: 'you@example.com', ariaLabel: 'Email' });
        const form = h('form', { onsubmit: (e) => { e.preventDefault(); signIn(input.value.trim()); } }, input, h('button', { type: 'submit', textContent: 'Email me a link', disabled: busy }));
        sheet.append(form);
      }
    }
    if (msg) sheet.append(h('p', { className: `pw-msg ${msg.good ? 'pw-good' : ''}`, id: 'pw-msg', textContent: msg.text }));
    sheet.append(h('p', { className: 'pw-small' },
      'Prices include tax. Paid securely through Stripe; your receipt comes from Link. ',
      h('a', { href: page('terms.html'), target: '_blank', textContent: 'Terms' }), ' · ',
      h('a', { href: page('privacy.html'), target: '_blank', textContent: 'Privacy' })));
  }

  render();
  document.body.append(el);
  document.addEventListener('keydown', onKey);
  const off = onAccount(() => { if (open?.el === el) render(); }); // (signing in elsewhere, or the session arriving)
  open = { el, render, off };
  return true;
}

// A note across the top for a few seconds.
export function toast(text, small = '', ms = 6000) {
  style();
  document.querySelector('.pw-toast')?.remove();
  const t = h('div', { className: 'pw-toast', id: 'pw-toast', role: 'status' }, text, small ? h('small', { textContent: small }) : null);
  document.body.append(t);
  if (ms) setTimeout(() => t.remove(), ms);
  return t;
}

const DONE = {
  wave_pass: ['The Wave Pass is yours.', 'Every wave is open, for life.'],
  pro: ["You're Pro.", 'Every wave, saving your breaks, and hosting contests.'],
};

// Once per page load: picks up ?buy= (back from a sign-in link) and ?checkout= (back from Stripe).
// `onBought(kind)` runs when the plan shows what you bought (the game uses it to put you on the wave you wanted).
// `why(kind)` and `back(kind)` give the reopened sheet its line and where Checkout returns to.
export async function startPaywall({ onBought, why, back } = {}) {
  const q = new URLSearchParams(location.search);
  const checkout = q.get('checkout'), bought = q.get('bought'), buy = q.get('buy');
  if (!checkout && !buy) return;
  const clean = new URL(location.href);
  for (const k of ['buy', 'checkout', 'session_id', 'bought']) clean.searchParams.delete(k);
  history.replaceState(null, '', clean);
  await initAccount();

  if (buy === 'wave_pass' || buy === 'pro') { // (signed in from the sheet: open it again, once the session is here)
    if (!currentUser()) await new Promise((r) => { const off = onAccount((s) => { if (s) { setTimeout(() => off(), 0); r(); } }); setTimeout(r, 5000); });
    await myPlan().catch(() => {});
    openPaywall({ want: buy, why: why?.(buy) || '', back: back?.(buy) });
    return;
  }
  if (checkout === 'cancel') { toast('No charge.', 'Checkout was cancelled.'); return; }
  if (checkout !== 'done') return;
  const kind = bought === 'pro' ? 'pro' : 'wave_pass';
  // The webhook usually lands before the browser is back, but not always: ask again for a while.
  const t = toast('Thanks! Unlocking…', '', 0);
  for (let i = 0; i < 40; i++) {
    const plan = await myPlan().catch(() => currentPlan());
    if (has(plan, kind)) { t.remove(); toast(...DONE[kind]); onBought?.(kind); return; }
    await new Promise((r) => setTimeout(r, i < 10 ? 1000 : 3000));
  }
  t.remove();
  toast('Your payment went through.', "It's taking a while to show up here: reload in a minute. If it still isn't there, write to howdy@rysradwaves.com.", 20000);
}
