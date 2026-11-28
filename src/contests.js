// Contests from the game (accounts plan task 11): the database's contest functions (migration 20261125010000) in
// JavaScript, guests' anonymous sessions, and a contest's live channel.
//
// The live channel (`contest:<id>`, Supabase Realtime): presence says who's in the lobby now; a "changed" broadcast
// after anyone joins, leaves, starts or cancels tells everyone to read the contest again (the tables stay the truth,
// so a missed message only means the next read catches up; the lobby also reads every 15 s).
import { initAccount, currentUser } from './account.js';
import { standings } from './heat.js';

export const WAVE_NAMES = { point: 'Raglan', raglanPlus: 'Raglan+', reef: 'Pipe', queens: 'Queens', trestles: 'Trestles', dynamic: 'Dynamic' };
// The waves a new contest can be held on (the title screen's list, src/waves/index.js WAVES); older contests keep their names above.
export const CONTEST_WAVES = ['point', 'queens', 'reef'];
// (every heat has 2 to 4 surfers: over 4 runs in heats and a final)
export const SIZES = [['4', 'Up to 4: one heat'], ['8', 'Up to 8: heats and a final'], ['16', 'Up to 16: heats and a final'], ['32', 'Up to 32: heats and a final']];
export const LENGTHS = [['10m', '10 minutes'], ['15m', '15 minutes'], ['20m', '20 minutes'], ['5w', '5 waves'], ['8w', '8 waves'], ['10w', '10 waves']];
const NICK_KEY = 'rys-rad-waves-nickname';
export const savedNickname = () => { try { return localStorage.getItem(NICK_KEY) || ''; } catch { return ''; } };
const keepNickname = (n) => { try { localStorage.setItem(NICK_KEY, n); } catch {} };

// The contest's address: the game page with ?contest=<code>.
export const contestLink = (code) => { const u = new URL('index.html', location.href); u.search = `?contest=${code}`; return u.href; };
export const spotName = (c) => (c.spot_name || c.spot?.name || WAVE_NAMES[c.spot_wave || c.spot?.wave] || 'a wave');
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
export const lengthName = (c) => (c.end_minutes ? plural(Number(c.end_minutes), 'minute') : plural(c.end_waves, 'wave'));
export const heatParam = (c) => (c.end_minutes ? `${Number(c.end_minutes)}m` : `${c.end_waves}w`);

async function rpc(name, args) {
  const c = await initAccount();
  const { data, error } = await c.rpc(name, args);
  if (error) throw error;
  return data;
}

// A session for joining: yours, or a guest's (anonymous), made on the spot.
export async function ensureSession() {
  const c = await initAccount();
  if (currentUser()) return currentUser();
  const { data, error } = await c.auth.signInAnonymously();
  if (error) throw error;
  return data.user;
}

// Open contests (plans/2026-11-27-open-contests.md): mode 'open', a window for each round (hours), invite or open
// entry, and how long sign-up stays open (hours).
// Condensed (step 7): format 'condensed', one window (roundHours: [hours]) for every round.
export const createContest = ({ name, wave, breakId, length, size = 8, visibility, mode = 'live', format = 'rounds', roundHours, entry, signupHours }) => {
  const [n, unit] = [parseFloat(length), length.slice(-1)];
  const open = mode === 'open' ? { mode, open_format: format, round_hours: roundHours, entry, signup_hours: signupHours } : {};
  return rpc('create_contest', { name, wave: wave || null, break_id: breakId || null,
    end_minutes: unit === 'm' ? n : null, end_waves: unit === 'w' ? n : null, max_entrants: Number(size) || 8, visibility: visibility || 'unlisted', ...open });
};
// The choices for an Open contest's windows (hours).
export const ROUND_HOURS = [['6', '6 hours'], ['12', '12 hours'], ['24', '24 hours'], ['48', '2 days'], ['72', '3 days'], ['168', 'A week']];
export const SIGNUP_HOURS = [['1', '1 hour'], ['6', '6 hours'], ['12', '12 hours'], ['24', '24 hours'], ['48', '2 days'], ['72', '3 days']];
// How many rounds a contest of up to n has (heats of 2 to 4, the top 2 through: 4 → 1, 8 → 2, 16 → 3, 32 → 4).
export const roundsFor = (n) => (n <= 4 ? 1 : 1 + roundsFor(Math.ceil(n / 4) * 2));
// A heat's length in seconds (a waves heat: its time limit, as the database's private.heat_length).
export const heatSeconds = (c) => (c.end_minutes ? Number(c.end_minutes) * 60 : c.end_waves * 180);
export const RIDE_GRACE_S = 120; // (private.ride_grace: a wave caught before the horn can still come in this long after)
// "5h 20m", "12m", "40s"
export function timeLeft(ms) {
  const s = Math.max(0, Math.round(ms / 1000)), d = Math.floor(s / 86400), hr = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return s >= 2 * 86400 ? `${d}d ${hr}h` : s >= 3600 ? `${Math.floor(s / 3600)}h ${m}m` : m ? `${m}m` : `${s}s`; // (hours up to 2 days: "24h 0m", not "1d 0h")
}
export const inviteToContest = (id, handle) => rpc('invite_to_contest', { contest_id: id, handle: handle.replace(/^@/, '') });
export const looksLikeEmail = (s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.trim());
// An invite by email: the invite, then the email (the contest-invite Edge Function, as you). Says whether it went.
export async function inviteByEmail(id, email) {
  const inv = await rpc('invite_by_email', { contest_id: id, email: email.trim() });
  const c = await initAccount();
  const { data, error } = await c.functions.invoke('contest-invite', { body: { invite_id: inv.id } });
  if (error) {
    let code = null; try { code = (await error.context?.json?.())?.error; } catch {}
    if (code === 'emailed_already') return { invite: inv, sent: false, already: true };
    throw Object.assign(new Error(code || 'send_failed'), { hint: code || 'send_failed' });
  }
  return { invite: inv, sent: !!data?.sent };
}
export const uninvite = (inviteId) => rpc('uninvite', { invite_id: inviteId });
// The host's invites (with who), or yours.
export async function readInvites(id) {
  const c = await initAccount();
  const { data, error } = await c.from('invites').select('id, user_id, email, accepted_at, emailed_at').eq('contest_id', id).order('invited_at');
  if (error) throw error;
  const ids = data.map((i) => i.user_id).filter(Boolean);
  const { data: who } = ids.length ? await c.from('profiles').select('id, handle').in('id', ids) : { data: [] };
  return data.map((i) => ({ ...i, handle: i.user_id ? who?.find((p) => p.id === i.user_id)?.handle || '?' : null }));
}
// Your one try at an Open heat: starts your clock (again: the same start).
export const startMyHeat = (heatId) => rpc('start_my_heat', { heat_id: heatId });
export const contestByCode = async (code) => (await rpc('contest_by_code', { code }))?.[0] || null;
export async function joinContest(code, nickname) {
  await ensureSession();
  const e = await rpc('join_contest', { code, nickname: nickname || null });
  if (nickname) keepNickname(nickname);
  return e;
}
export const leaveContest = (id) => rpc('leave_contest', { contest_id: id });
export const startContest = (id) => rpc('start_contest', { contest_id: id });
export const cancelContest = (id) => rpc('cancel_contest', { contest_id: id });

// The contest as an entrant or host reads it: the row, its entrants (in joining order), every heat (by round and number,
// with who's in each, their jerseys and results), and yours: the latest heat you're in. null when you can't read it
// (not in it, and it isn't public).
// Condensed (step 7): `heats` is the bracket; `path` is yours while it runs: your round 1 heat, then your session for each
// round after (heats.session_of: you), and `heat` the one to surf next (or the last).
export async function readContest(id) {
  const c = await initAccount();
  const [{ data: contest, error }, { data: entrants }, { data: heats }] = await Promise.all([
    c.from('contests').select('*').eq('id', id).maybeSingle(),
    c.from('entrants').select('id, user_id, name, guest, joined_at, seed_rank').eq('contest_id', id).order('joined_at'),
    c.from('heats').select('id, round, number, seed, starts_at, ends_at, window_ends_at, state, session_of, heat_entries(entrant_id, jersey, place, total, advanced, started_at, finished_at)')
      .eq('contest_id', id).order('round').order('number'),
  ]);
  if (error) throw error;
  if (!contest) return null;
  const all = (heats || []).filter((h) => !h.session_of), sessions = (heats || []).filter((h) => h.session_of);
  const me = (entrants || []).find((e) => e.user_id === currentUser()?.id);
  const mine = me ? all.filter((h) => h.heat_entries.some((x) => x.entrant_id === me.id)) : [];
  let heat = mine[mine.length - 1] || null;
  const inRound = (r) => all.filter((h) => h.round === r).length;
  const condensed = contest.mode === 'open' && contest.open_format === 'condensed';
  const rounds = Math.max(0, ...(heats || []).map((h) => h.round));
  const path = condensed && me && contest.state === 'running'
    ? [...mine.filter((h) => h.round === 1), ...sessions.filter((h) => h.session_of === me.id)].sort((a, b) => a.round - b.round) : [];
  if (path.length) {
    const yet = (h) => { const x = h.heat_entries.find((e) => e.entrant_id === me.id); return h.state === 'live' && !x?.finished_at && (!x?.started_at || Date.now() < Date.parse(x.started_at) + heatSeconds(contest) * 1000); };
    heat = path.find(yet) || path[path.length - 1];
  }
  // the scored waves, so a live heat's totals show before it closes (heat_entries.total is written at the close)
  const ids = [...all, ...sessions.filter((h) => h.session_of === me?.id)].map((h) => h.id);
  const { data: rides } = ids.length ? await c.from('rides').select('heat_id, entrant_id, wave_no, score, caught_at, replay_path').in('heat_id', ids) : { data: [] };
  return { contest, entrants: entrants || [], heats: all, rides: rides || [], heat, condensed, path,
    final: !!heat && (path.length ? heat.round === rounds : inRound(heat.round) === 1), rounds };
}

// Watching a contest you're not in (the lobby, once it's started): anyone with the code, signed in or not, read-only.
// The same shape as readContest, with no heat of your own. null: no contest has that code.
export async function watchContest(code) {
  const c = await initAccount();
  const { data, error } = await c.rpc('watch_contest', { code });
  if (error) throw error;
  if (!data) return null;
  return { ...data, watching: true, heat: null, final: false, rounds: Math.max(0, ...data.heats.map((h) => h.round)) };
}

// A contest for whoever's looking (its page, its recap): the full read for its host and the people in it, else watching
// it by its code (anyone with the link). null: no such contest, or nothing to show.
export async function contestFor(preview) {
  const uid = currentUser()?.id;
  const r = uid ? await readContest(preview.id).catch(() => null) : null;
  if (r && (r.contest.host === uid || r.entrants.some((e) => e.user_id === uid))) return r;
  return (await watchContest(preview.code).catch(() => null)) || r;
}

// A heat's standings as they stand: the closed totals and places once it's done, else worked out from its scored waves
// (best two, the heat engine's tie-breaks). [{ entrant_id, jersey, total, place, advanced }]
export function heatBoard(heat, rides = []) {
  if (heat.state === 'done') return heat.heat_entries.map((x) => ({ ...x, total: x.total == null ? null : Number(x.total) }));
  const h = { advance: 0, surfers: heat.heat_entries.map((x) => ({ id: x.entrant_id, jersey: x.jersey, waves: rides.filter((r) => r.heat_id === heat.id && r.entrant_id === x.entrant_id).map((r) => ({ score: Number(r.score) })) })) };
  return standings(h).map((r) => ({ entrant_id: r.surfer.id, jersey: r.surfer.jersey, total: r.surfer.waves.length ? r.total : null, place: r.surfer.waves.length ? r.place : null, advanced: null }));
}

// Contests you host or entered (your account page, task 14), newest first: [{ ...contest, hosting, entered }].
export async function myContests() {
  const c = await initAccount(), uid = currentUser()?.id;
  if (!uid) return [];
  const { data: mine } = await c.from('entrants').select('contest_id').eq('user_id', uid);
  const ids = (mine || []).map((e) => e.contest_id);
  const or = ids.length ? `host.eq.${uid},id.in.(${ids.join(',')})` : `host.eq.${uid}`;
  const { data, error } = await c.from('contests').select('id, code, name, state, visibility, host, spot, end_minutes, end_waves, created_at, ended_at').or(or).order('created_at', { ascending: false }).limit(100);
  if (error) throw error;
  return data.map((k) => ({ ...k, hosting: k.host === uid, entered: ids.includes(k.id) }));
}

// The live channel. on.change() when someone says the contest changed; on.presence(ids) with the user ids here now;
// in a live heat (task 12) on.score(payload) when someone's wave is scored and on.finished() when someone's done.
export async function contestChannel(id, on) {
  const c = await initAccount();
  const me = currentUser()?.id;
  const ch = c.channel(`contest:${id}`, { config: { presence: { key: me || 'watcher' }, broadcast: { self: false } } });
  ch.on('broadcast', { event: 'changed' }, () => on.change?.());
  ch.on('broadcast', { event: 'score' }, ({ payload }) => on.score?.(payload));
  ch.on('broadcast', { event: 'finished' }, () => on.finished?.());
  ch.on('presence', { event: 'sync' }, () => on.presence?.(Object.keys(ch.presenceState())));
  await new Promise((resolve) => ch.subscribe((status) => { if (status === 'SUBSCRIBED') resolve(); }));
  if (me) await ch.track({ at: Date.now() });
  return {
    changed: () => ch.send({ type: 'broadcast', event: 'changed', payload: {} }),
    send: (event, payload = {}) => ch.send({ type: 'broadcast', event, payload }),
    close: () => c.removeChannel(ch),
  };
}

// Database errors (their message is a short code) in words.
const WORDS = {
  sign_in: 'Sign in with your email to host a contest.',
  pro_needed: 'Hosting contests comes with Pro.',
  too_many_contests: 'You have 3 contests open: finish or cancel one first.',
  contest_name_blocked: 'Keep the name clean.',
  one_spot: 'Pick a wave or one of your breaks.',
  no_such_wave: "That wave isn't in the game.",
  no_such_break: "That break isn't yours, or it's gone.",
  break_not_rideable: "That break doesn't make a wave you can ride yet: open it in the builder.",
  no_contest: 'No contest has that code. Check it and try again.',
  contest_started: 'This contest has already started.',
  contest_full: 'This contest is full.',
  bad_name: 'Pick a nickname: letters and numbers, up to 20.',
  name_blocked: 'Keep it clean: pick another nickname.',
  name_taken: 'Someone in this contest already has that name.',
  not_host: 'Only the host can do that.',
  no_entrants: 'Nobody has joined yet.',
  not_host_or_over: 'This contest is already over.',
  heat_still_on: 'Waiting for the others to finish.',
  after_horn: 'Caught after the horn: it doesn\'t count.',
  too_late: 'That wave came in too late to count.',
  heat_over: 'The heat is over.',
  account_needed: 'Open contests need an account: sign up free with your email, then join.',
  invite_only: 'This contest is invite only. Ask the host to invite your username.',
  signup_over: 'Sign-up for this contest has closed.',
  need_two: 'You need at least 2 in to start.',
  no_such_surfer: 'Nobody has that username.',
  not_open: 'That only works in an Open contest.',
  too_many_invites: "That's as many invites as a contest can have.",
  window_closed: 'The window for this heat has closed.',
  heat_done: "You've already surfed this heat.",
  heat_not_started: "This heat hasn't opened yet.",
  surf_in_order: 'Surf your rounds in order: finish the one before first.',
  checks_pending: 'Checking the waves: results soon.',
  bad_round_hours: 'Pick how long each round lasts.',
  bad_signup_hours: 'Pick how long sign-up stays open.',
  bad_email: "That doesn't look like an email address.",
  emailed_already: 'They were emailed in the last day already.',
  too_many_emails: "That's enough invite emails for today. Try again tomorrow.",
  send_failed: "Couldn't send the email. Try again in a minute.",
};
export function describeContestError(e) {
  const code = e?.hint || e?.message;
  if (WORDS[code]) return WORDS[code];
  if (/anonymous/i.test(e?.message || '')) return "Guests can't join just now. Sign in with your email instead.";
  if (!navigator.onLine || /failed to fetch|networkerror|load failed/i.test(e?.message || '')) return "Can't reach the server. Check your connection.";
  return e?.message || 'Something went wrong. Try again.';
}
