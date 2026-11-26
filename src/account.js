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
export const supabaseTarget = () => target();

let starting = null; // (one client, however many callers ask at once)
export function initAccount() { return (starting ||= startClient().catch((e) => { starting = null; throw e; })); } // (a failed start can be tried again)
async function startClient() {
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

// Emails a sign-in link that comes back to this page (same waves and options, no hash), or to `back`.
export async function sendMagicLink(email, back = location.origin + location.pathname + location.search) {
  const c = await initAccount();
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

// ---- Profiles (task 5) ----
// A member's public profile: { id, handle, display_name, jersey, created_at, country, city, lat, lng } (the place: task 14). Anonymous guests have none.
export const JERSEY_IDS = ['red', 'white', 'blue', 'yellow', 'green', 'black', 'pink', 'teal'];
const PROFILE_COLS = 'id, handle, display_name, jersey, created_at, country, city, lat, lng, styling, surfer, stance';
let mine = null; // (your profile once read: the game takes your jersey from it)
export const cachedProfile = () => (mine && mine.id === session?.user?.id ? mine : null);

export async function myProfile() {
  const c = await initAccount(), uid = session?.user?.id;
  if (!uid || session.user.is_anonymous) return null;
  const { data, error } = await c.from('profiles').select(PROFILE_COLS).eq('id', uid).maybeSingle();
  if (error) throw error;
  return (mine = data);
}

export async function profileByHandle(handle) {
  const c = await initAccount();
  const { data, error } = await c.from('profiles').select(PROFILE_COLS).eq('handle', String(handle || '').toLowerCase()).maybeSingle();
  if (error) throw error;
  return data;
}

// Makes yours, or changes it (only the fields given).
export async function saveProfile(fields) {
  const c = await initAccount(), uid = session?.user?.id;
  if (!uid) throw new Error('Sign in first.');
  const row = Object.fromEntries(Object.entries(fields).filter(([k]) => ['handle', 'display_name', 'jersey', 'country', 'city', 'lat', 'lng', 'styling', 'surfer', 'stance'].includes(k)));
  const existing = await myProfile();
  const q = existing ? c.from('profiles').update(row).eq('id', uid) : c.from('profiles').insert({ id: uid, ...row });
  const { data, error } = await q.select(PROFILE_COLS).single();
  if (error) throw error;
  return (mine = data);
}

// null when the handle is free for you, else a sentence saying why not.
const HANDLE_WORDS = {
  short: 'At least 3 characters.', long: '20 characters at most.', chars: 'Lowercase letters, numbers and _ only.',
  start: 'Start with a letter.', reserved: "That one's reserved.", blocked: 'Keep it clean: pick another handle.', taken: "That's taken (or looks too like one that is).",
};
export async function handleProblem(handle) {
  const c = await initAccount();
  const { data, error } = await c.rpc('handle_problem', { h: handle });
  if (error) throw error;
  return data ? HANDLE_WORDS[data] || data : null;
}

// Sends a confirmation link to the new address (and, with secure email change, to the old one too).
export async function changeEmail(email) {
  const c = await initAccount();
  const { error } = await c.auth.updateUser({ email }, { emailRedirectTo: location.origin + location.pathname });
  if (error) throw error;
}

export async function deleteAccount() {
  const c = await initAccount();
  const { error } = await c.rpc('delete_my_account');
  if (error) throw error;
  await c.auth.signOut({ scope: 'local' }); // (the user is gone on the server; drop the session here)
}

// Profile errors in words (a handle taken between checking and saving, a bad jersey...).
export function describeProfileError(e) {
  if (e?.code === '23505') return HANDLE_WORDS.taken;
  if (e?.code === '23514') {
    const m = e.message || '';
    if (/display_name_blocked/.test(m)) return 'Keep it clean: pick another name.';
    if (/city_blocked/.test(m)) return 'Keep it clean: pick another town name.';
    if (/styling_bad/.test(m)) return "That option isn't available yet. Try again later."; // (an option the database doesn't know yet: a migration not pushed)
    if (/styling/.test(m)) return 'Styling your surfer comes with Pro.';
    if (/handle_blocked/.test(m)) return HANDLE_WORDS.blocked;
    if (/jersey/.test(m)) return 'Pick a jersey from the list.';
    if (/display_name/.test(m)) return 'Names are 1 to 30 characters.';
    return "That handle can't be used.";
  }
  return describeAuthError(e);
}

// ---- Your plan (task 6) ----
// { wave_pass, pro, pro_until, grace }, from the database (my_plan). Signed out or a guest: all false.
//
// The wave lock is a soft gate (the plan): the picker locks every wave but the free ones until you have a Wave Pass.
// SALES_OPEN turns on the lock and every buy button (src/paywall.js) together. It stays false until Stripe has live
// keys, so nobody loses a wave before they can buy one, or pays the sandbox. `?paywall` turns it on to try it (and
// stays on for the visit, since Checkout and the sign-in link come back without it).
const LIVE = true; // (live since 2026-11-26: the live Stripe keys are in Supabase secrets; false hides the buy buttons again)
const TRY = (() => {
  try {
    if (new URLSearchParams(location.search).has('paywall')) sessionStorage.setItem('rys-rad-waves-paywall', '1');
    return sessionStorage.getItem('rys-rad-waves-paywall') === '1';
  } catch { return new URLSearchParams(location.search).has('paywall'); }
})();
export const SALES_OPEN = LIVE || TRY;
export const PAYWALL = SALES_OPEN; // (the wave lock)
export const FREE_WAVES = ['point', 'queens', 'built']; // (Raglan, the demo wave; Queens (the user, 2026-11-24); and your own break from the builder)
const NO_PLAN = { wave_pass: false, pro: false, pro_until: null, grace: false };
let plan = NO_PLAN, planKnown = false, planFor;
const planListeners = new Set();

export async function myPlan() {
  const c = await initAccount();
  const who = session?.user?.id || null;
  if (!who) plan = NO_PLAN;
  else {
    const { data, error } = await c.rpc('my_plan');
    if (error) throw error;
    plan = { ...NO_PLAN, ...data };
  }
  planKnown = true; planFor = who;
  for (const f of planListeners) f(plan);
  return plan;
}
// Calls f with your plan now (if known) and whenever it changes (signing in or out reads it again).
export const onPlan = (f) => { planListeners.add(f); if (planKnown) f(plan); return () => planListeners.delete(f); };
export const currentPlan = () => plan;
// The contest pass (task 11): a contest's wave is open to everyone in it, for its heat (boot.js allows it).
const passWaves = new Set();
export const allowWave = (id) => passWaves.add(id);
export const waveLocked = (id) => PAYWALL && !FREE_WAVES.includes(id) && !passWaves.has(id) && !plan.wave_pass;

// (read the plan again when the user changes; a timeout because supabase-js mustn't be awaited inside its own
// auth callback)
onAccount((s) => { const who = s?.user?.id || null; if (client && who !== planFor) setTimeout(() => myPlan().catch((e) => console.warn('plan', e)), 0); });
