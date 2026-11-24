// Accounts (plans/2026-11-23-accounts-and-paid-plans.md, task 4): sign in with a magic email link, from the title
// screen. No passwords anywhere (the database strips them). supabase-js loads from a pinned CDN URL only when the
// page starts, after the game, so a slow or blocked CDN never holds up surfing.
//
// Which Supabase: the hosted project, except on 127.0.0.1 / localhost, which uses the local stack (`npm run db:start`).
// `?sb=cloud` / `?sb=local` picks one by hand. Both keys here are publishable (public by design; RLS guards the data).

const SUPABASE_JS = 'https://esm.sh/@supabase/supabase-js@2.117.3';
const CLOUD = { url: 'https://lyttzshnxspdugvonjea.supabase.co', key: 'sb_publishable_jTjfuZ-FNEYF_uGoBnVlBg_uPJQ9TYU' };
const LOCAL = { url: 'http://127.0.0.1:55321', key: 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH' };

function target() {
  const p = new URLSearchParams(location.search).get('sb');
  if (p === 'cloud' || p === 'local') return p === 'cloud' ? CLOUD : LOCAL;
  return /^(127\.0\.0\.1|localhost)$/.test(location.hostname) ? LOCAL : CLOUD;
}

let client = null, session = null;
const listeners = new Set();
const emit = () => { for (const f of listeners) f(session); };

// Starts the client (once). The session is kept in localStorage and refreshed by supabase-js; a magic link lands back
// here with the tokens in the URL hash, which supabase-js reads and then clears.
export async function initAccount() {
  if (client) return client;
  const { createClient } = await import(SUPABASE_JS);
  const { url, key } = target();
  client = createClient(url, key, {
    // implicit flow: the link works even when opened in a different browser than the one that asked for it (a phone's
    // mail app), which the PKCE flow can't do.
    auth: { flowType: 'implicit', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true, storageKey: 'rys-rad-waves-auth' },
  });
  client.auth.onAuthStateChange((_event, s) => { session = s; emit(); });
  session = (await client.auth.getSession()).data.session;
  emit();
  return client;
}

export const onAccount = (f) => { listeners.add(f); f(session); return () => listeners.delete(f); };
export const currentUser = () => session?.user || null;

// Emails a sign-in link that comes back to this page (same waves and options, no hash).
export async function sendMagicLink(email) {
  const c = await initAccount();
  const back = location.origin + location.pathname + location.search;
  const { error } = await c.auth.signInWithOtp({ email, options: { emailRedirectTo: back, shouldCreateUser: true } });
  if (error) throw error;
}

export async function signOut() {
  const c = await initAccount();
  const { error } = await c.auth.signOut();
  if (error) throw error;
}

// Turns auth errors into sentences a person can act on.
export function describeAuthError(e) {
  const m = e?.message || '';
  if (e?.status === 429 || /rate limit|security purposes|seconds/i.test(m)) return 'Too many emails just now. Wait a minute and try again.';
  if (/invalid.*email|email.*invalid/i.test(m)) return "That email doesn't look right.";
  if (!navigator.onLine || /failed to fetch|networkerror|load failed|import/i.test(m)) return "Can't reach the server. Check your connection.";
  return m || 'Something went wrong. Try again.';
}
