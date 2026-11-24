// Sign-in against the local Supabase stack (accounts plan task 4), straight through the Auth API (no browser):
//   1. a magic link arrives in the local inbox (Mailpit), and following it signs you in (tokens in the redirect)
//   2. the session works (the user is fetched with it) and refreshes
//   3. sign-out ends it (the refresh token stops working)
//   4. passwords never work: a password sign-up stores none, and password sign-in fails
//   5. anonymous sign-in works (contest guests)
// npm run db:start first, then: npm run test:auth
const API = process.env.SB_URL || 'http://127.0.0.1:55321';
const KEY = process.env.SB_KEY || 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';
const MAIL = process.env.MAILPIT_URL || 'http://127.0.0.1:55324';
const BACK = 'http://127.0.0.1:8765/?wave=raglanPlus';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) fails++; };

const auth = (path, { method = 'POST', body, token } = {}) => fetch(`${API}/auth/v1/${path}`, {
  method, redirect: 'manual',
  headers: { apikey: KEY, 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
  body: body ? JSON.stringify(body) : undefined,
});

// The newest email to this address, as its text (waits for it to arrive).
async function latestLink(email, ms = 10000) {
  const t = Date.now();
  while (Date.now() - t < ms) {
    const list = await (await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`)).json();
    if (list.messages?.length) {
      const msg = await (await fetch(`${MAIL}/api/v1/message/${list.messages[0].ID}`)).json();
      const link = (msg.Text + ' ' + msg.HTML).match(/https?:\/\/[^\s"'<>]+\/auth\/v1\/verify\?[^\s"'<>]+/);
      if (link) return link[0].replace(/&amp;/g, '&');
    }
    await sleep(300);
  }
  return null;
}

const health = await fetch(`${API}/auth/v1/health`, { headers: { apikey: KEY } }).catch(() => null);
if (!health?.ok) { console.log(`FAIL the local stack isn't up at ${API} (npm run db:start)`); process.exit(1); }

// 1. Magic link.
const email = `surfer-${Date.now()}@example.com`;
const otp = await auth('otp', { body: { email, create_user: true } });
check(otp.ok, `a magic link is requested (${otp.status})`);
const link = await latestLink(email);
check(!!link, `the link arrives: ${link?.slice(0, 70)}...`);
const u = new URL(link);
u.searchParams.set('redirect_to', BACK);
const hop = await fetch(u, { redirect: 'manual' });
const loc = hop.headers.get('location') || '';
const hash = new URLSearchParams(loc.split('#')[1] || '');
check(hop.status === 303 || hop.status === 302, `following it redirects (${hop.status})`);
check(loc.startsWith(BACK) && !!hash.get('access_token') && !!hash.get('refresh_token'), `back to the game with a session: ${loc.split('#')[0]}`);

// 2. The session works and refreshes.
const access = hash.get('access_token'), refresh = hash.get('refresh_token');
const me = await (await auth('user', { method: 'GET', token: access })).json();
check(me.email === email && !me.is_anonymous, `signed in as ${me.email}`);
const re = await auth('token?grant_type=refresh_token', { body: { refresh_token: refresh } });
const reJ = await re.json();
check(re.ok && !!reJ.access_token, 'the session refreshes');

// 3. Sign-out.
const out = await auth('logout', { token: reJ.access_token });
check(out.status === 204, `sign-out (${out.status})`);
const after = await auth('token?grant_type=refresh_token', { body: { refresh_token: reJ.refresh_token } });
check(!after.ok, `after sign-out the session can't refresh (${after.status})`);

// 4. No passwords.
const pwEmail = `pw-${Date.now()}@example.com`;
await auth('signup', { body: { email: pwEmail, password: 'Secret-pass-123' } });
const pw = await auth('token?grant_type=password', { body: { email: pwEmail, password: 'Secret-pass-123' } });
check(!pw.ok, `password sign-in fails (${pw.status})`);
const pw2 = await auth('token?grant_type=password', { body: { email: pwEmail, password: '' } });
check(!pw2.ok, `an empty password fails too (${pw2.status})`);

// 5. Anonymous.
const anon = await auth('signup', { body: {} });
const anonJ = await anon.json();
check(anon.ok && anonJ.user?.is_anonymous === true, `anonymous sign-in (${anon.status})`);

console.log(fails ? `${fails} failed` : 'all passed');
process.exit(fails ? 1 : 0);
