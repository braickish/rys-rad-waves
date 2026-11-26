// Contests from the game (accounts plan task 11): the database's contest functions (migration 20261125010000) in
// JavaScript, guests' anonymous sessions, and a contest's live channel.
//
// The live channel (`contest:<id>`, Supabase Realtime): presence says who's in the lobby now; a "changed" broadcast
// after anyone joins, leaves, starts or cancels tells everyone to read the contest again (the tables stay the truth,
// so a missed message only means the next read catches up; the lobby also reads every 15 s).
import { initAccount, currentUser } from './account.js';

export const WAVE_NAMES = { point: 'Raglan', raglanPlus: 'Raglan+', reef: 'Pipe', queens: 'Queens', trestles: 'Trestles', dynamic: 'Dynamic' };
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

export const createContest = ({ name, wave, breakId, length, size = 8, visibility }) => {
  const [n, unit] = [parseFloat(length), length.slice(-1)];
  return rpc('create_contest', { name, wave: wave || null, break_id: breakId || null,
    end_minutes: unit === 'm' ? n : null, end_waves: unit === 'w' ? n : null, max_entrants: Number(size) || 8, visibility: visibility || 'unlisted' });
};
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
export async function readContest(id) {
  const c = await initAccount();
  const [{ data: contest, error }, { data: entrants }, { data: heats }] = await Promise.all([
    c.from('contests').select('*').eq('id', id).maybeSingle(),
    c.from('entrants').select('id, user_id, name, guest, joined_at, seed_rank').eq('contest_id', id).order('joined_at'),
    c.from('heats').select('id, round, number, seed, starts_at, ends_at, state, heat_entries(entrant_id, jersey, place, total, advanced)')
      .eq('contest_id', id).order('round').order('number'),
  ]);
  if (error) throw error;
  if (!contest) return null;
  const all = heats || [];
  const me = (entrants || []).find((e) => e.user_id === currentUser()?.id);
  const mine = me ? all.filter((h) => h.heat_entries.some((x) => x.entrant_id === me.id)) : [];
  const heat = mine[mine.length - 1] || null;
  const inRound = (r) => all.filter((h) => h.round === r).length;
  return { contest, entrants: entrants || [], heats: all, heat, final: !!heat && inRound(heat.round) === 1, rounds: Math.max(0, ...all.map((h) => h.round)) };
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
};
export function describeContestError(e) {
  const code = e?.hint || e?.message;
  if (WORDS[code]) return WORDS[code];
  if (/anonymous/i.test(e?.message || '')) return "Guests can't join just now. Sign in with your email instead.";
  if (!navigator.onLine || /failed to fetch|networkerror|load failed/i.test(e?.message || '')) return "Can't reach the server. Check your connection.";
  return e?.message || 'Something went wrong. Try again.';
}
