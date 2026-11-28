// Hosting and joining contests on the title screen (accounts plan task 11), under Compete > Live:
//   Host a contest  Pro: where (one of the game's waves or a saved break), how long, a name, public or not. The host is
//                   entered too (they can leave and just run it). From the builder, ?host=<break id> opens this with
//                   that break picked.
//   Join            a code, or a contest link (?contest=<code>), opens the lobby.
//   The lobby       the contest, its code to share, who's in and who's here now (presence), and: Join (guests with a
//                   nickname, on an anonymous session made there and then; members as their handle), Leave, and the
//                   host's Start and Cancel. When it starts, everyone in it counts down to the heat's start and
//                   drops in (boot.js `?contest=<code>&go` sets the heat up from the contest).
// Open contests (plans/2026-11-27-open-contests.md, step 3), under Compete > Open: the same form with who can enter
// (invite by username, or anyone with the link), how long sign-up stays open, and each round's window. The lobby then
// has the host's invites, when sign-up closes, and once it's running "Surf your heat" (one try: boot.js starts your
// clock), who has surfed (never their scores, until the heat closes), and when the round closes.
// Condensed (step 7): one window for every round. The lobby lists your rounds (round 1's heat, then a session for each
// round after), "Surf round N" for the next, and the bracket is played out from them when the window closes.
import { initAccount, onAccount, currentUser, myProfile, SALES_OPEN } from './account.js';
import { openPaywall } from './paywall.js';
import { JERSEYS } from './heat.js';
import { myBreaks } from './breaks.js';
import { WAVE_NAMES, CONTEST_WAVES, watchContest, heatBoard, LENGTHS, SIZES, contestLink, spotName, lengthName, savedNickname, createContest, contestByCode, joinContest,
  leaveContest, startContest, cancelContest, readContest, contestChannel, describeContestError, ROUND_HOURS, SIGNUP_HOURS, roundsFor,
  heatSeconds, RIDE_GRACE_S, timeLeft, inviteToContest, uninvite, readInvites, inviteByEmail, looksLikeEmail } from './contests.js';
import { sendMagicLink } from './account.js';

const $ = (id) => document.getElementById(id);
const say = (id, text) => { const e = $(id); e.textContent = text || ''; e.hidden = !text; };
const h = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); for (const k of kids) if (k != null) e.append(k); return e; };
let show = () => {};
let inHeat = false;
let L = null; // the open lobby: { code, id, preview, data, live, present, timers, invites }
let hostMode = 'live'; // (the host form: a Live contest, or an Open one)

let joinStep = () => 'compete'; // (where the code box is: Compete, or for players without Pro the Join step)
export function initLobby(showStep, { inHeat: heat = false, joinStep: js } = {}) {
  show = showStep; inHeat = heat; if (js) joinStep = js;
  for (const id of ['host-form', 'lobby', 'join-form', 'open-soon']) for (const ev of ['pointerdown', 'click', 'keydown']) $(id).addEventListener(ev, (e) => e.stopPropagation());
  $('go-host').addEventListener('click', (e) => { e.stopPropagation(); openHost(null, 'live'); });
  $('go-open').addEventListener('click', (e) => { e.stopPropagation(); openHost(null, 'open'); });
  $('host-size').addEventListener('change', drawRounds);
  $('host-format').addEventListener('change', drawRounds);
  $('lobby-invite').addEventListener('submit', (e) => { e.preventDefault(); invite(); });
  $('lobby-surf').addEventListener('click', surf);
  $('join-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const code = $('join-code').value.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) { say('compete-msg', 'A contest code is 6 letters and numbers.'); return; }
    openLobby(code);
  });
  $('join-code').addEventListener('input', () => { $('join-code').value = $('join-code').value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
  $('host-form').addEventListener('submit', (e) => { e.preventDefault(); create(); });
  $('lobby-join').addEventListener('submit', (e) => { e.preventDefault(); join(); });
  $('lobby-start').addEventListener('click', () => act(() => startContest(L.id)));
  $('lobby-leave').addEventListener('click', () => act(() => leaveContest(L.id)));
  $('lobby-cancel').addEventListener('click', () => { if (confirm('Cancel this contest for everyone?')) act(() => cancelContest(L.id)); });
  $('lobby-share').addEventListener('click', share);
  const q = new URLSearchParams(location.search);
  if (q.get('contest') && !inHeat) openLobby(q.get('contest').toUpperCase());
  else if (q.get('host')) openHost(q.get('host'));
}

// Leaving the lobby or the host form (Back).
export function leaveLobby() {
  if (!L) return;
  L.live?.close(); clearInterval(L.poll); clearInterval(L.count); L = null;
  const u = new URL(location.href); u.searchParams.delete('contest'); history.replaceState(null, '', u);
}

// ---- Hosting ----
async function openHost(breakId, mode = 'live') {
  hostMode = mode;
  show('host'); say('host-msg', '');
  $('step-title').textContent = mode === 'open' ? 'Host an Open contest' : 'Host a contest';
  $('host-open').hidden = mode !== 'open';
  $('host-create').textContent = mode === 'open' ? 'Create Open contest' : 'Create contest';
  const signup = $('host-signup');
  if (!signup.options.length) { for (const [v, label] of SIGNUP_HOURS) signup.add(new Option(label, v)); signup.value = '24'; }
  const spot = $('host-spot');
  spot.innerHTML = '';
  const waves = h('optgroup', { label: 'Waves' });
  for (const id of CONTEST_WAVES) waves.append(new Option(WAVE_NAMES[id], `wave:${id}`));
  spot.append(waves);
  const len = $('host-len');
  if (!len.options.length) for (const [v, label] of LENGTHS) len.add(new Option(label, v));
  const size = $('host-size');
  if (!size.options.length) { for (const [v, label] of SIZES) size.add(new Option(label, v)); size.value = '8'; }
  drawRounds();
  {
    const u = new URL(location.href); u.searchParams.delete('host'); history.replaceState(null, '', u);
  }
  try {
    await initAccount();
    const user = currentUser();
    if (!user || user.is_anonymous) { say('host-msg', 'Log in or sign up below to host a contest.'); return; }
    const p = await myProfile().catch(() => null);
    if (!$('host-name').value) $('host-name').value = p ? `${p.handle}'s contest`.slice(0, 40) : 'My contest';
    const mine = await myBreaks().catch(() => []);
    if (mine.length) {
      const g = h('optgroup', { label: 'Your breaks' });
      for (const b of mine) g.append(new Option(b.name, `break:${b.id}`));
      spot.append(g);
    }
    if (breakId) spot.value = `break:${breakId}`;
  } catch (e) { say('host-msg', describeContestError(e)); }
}

// A window for each round the contest could have (from its size), 24 hours by default; the last one is the final.
function drawRounds() {
  const condensed = $('host-format').value === 'condensed'; // (Condensed: one window for them all)
  const box = $('host-rounds'), n = condensed ? 1 : roundsFor(Number($('host-size').value) || 8);
  const kept = [...box.querySelectorAll('select')].map((x) => x.value);
  box.innerHTML = '';
  $('host-rounds-label').textContent = condensed ? 'Every round surfed within' : 'Each round lasts';
  if (condensed) {
    const sel = h('select', { ariaLabel: 'The window' });
    for (const [v, label] of ROUND_HOURS) sel.add(new Option(label, v));
    sel.value = kept[0] || '24';
    box.append(h('span', { textContent: 'The window' }), sel);
    return;
  }
  for (let r = 1; r <= n; r++) {
    const sel = h('select', { ariaLabel: `Round ${r}` });
    for (const [v, label] of ROUND_HOURS) sel.add(new Option(label, v));
    sel.value = kept[r - 1] || '24';
    box.append(h('span', { textContent: n === 1 ? 'The heat' : r === n ? 'Final' : `Round ${r}` }), sel);
  }
}

async function create() {
  const [kind, id] = $('host-spot').value.split(':');
  $('host-create').disabled = true; say('host-msg', '');
  try {
    const c = await createContest({ name: $('host-name').value.trim(), wave: kind === 'wave' ? id : null, breakId: kind === 'break' ? id : null,
      length: $('host-len').value, size: $('host-size').value, visibility: $('host-public').checked ? 'public' : 'unlisted',
      ...(hostMode === 'open' ? { mode: 'open', format: $('host-format').value, entry: $('host-entry').value, signupHours: Number($('host-signup').value),
        roundHours: [...$('host-rounds').querySelectorAll('select')].map((x) => Number(x.value)) } : {}) });
    const p = await myProfile().catch(() => null);
    await joinContest(c.code, p ? null : savedNickname() || 'Host'); // (the host surfs too, as their handle; Leave to just run it)
    await openLobby(c.code);
  } catch (e) {
    if ((e?.hint || e?.message) === 'pro_needed' && SALES_OPEN) openPaywall({ want: 'pro', why: 'Hosting contests comes with Pro.' });
    say('host-msg', describeContestError(e));
  }
  $('host-create').disabled = false;
}

// ---- The lobby ----
async function openLobby(code) {
  leaveLobby();
  show('lobby'); say('lobby-msg', ''); say('compete-msg', '');
  $('lobby-name').textContent = '…'; $('lobby-what').textContent = ''; $('lobby-code').textContent = code; $('lobby-list').innerHTML = '';
  for (const id of ['lobby-join', 'lobby-start', 'lobby-leave', 'lobby-cancel', 'lobby-recap']) $(id).hidden = true;
  const u = new URL(location.href); u.searchParams.set('contest', code); history.replaceState(null, '', u);
  const me = (L = { code, present: [] });
  try {
    await initAccount();
    me.preview = await contestByCode(code);
    if (L !== me) return;
    if (!me.preview) { leaveLobby(); show(joinStep()); say('compete-msg', describeContestError({ hint: 'no_contest' })); return; }
    me.id = me.preview.id;
    await refresh();
    await connect();
    me.poll = setInterval(() => refresh().catch(() => {}), 15000);
  } catch (e) { if (L === me) say('lobby-msg', describeContestError(e)); }
}

// The live channel (again after joining: presence is by user, and a guest's session is new).
async function connect() {
  const me = L; if (!me) return;
  me.live?.close();
  const again = () => refresh().catch(() => {});
  const live = await contestChannel(me.id, { change: again, score: again, finished: again, presence: (ids) => { me.present = ids; render(); } }).catch((e) => { console.warn('live', e); return null; });
  if (L !== me) { live?.close(); return; }
  me.live = live;
}

async function refresh() {
  const me = L; if (!me) return;
  const [preview, read] = await Promise.all([contestByCode(me.code), currentUser() ? readContest(me.id).catch(() => null) : null]);
  if (L !== me) return;
  // not in it (nor hosting) once it's started: watch it (read-only, by its code)
  const uid = currentUser()?.id, inIt = read && (read.contest.host === uid || read.entrants.some((e) => e.user_id === uid));
  const data = !inIt && preview && preview.state !== 'lobby' ? await watchContest(me.code).catch(() => read) : read;
  if (L !== me) return;
  me.preview = preview || me.preview; me.data = data;
  me.invites = me.preview?.mode === 'open' && me.preview.state === 'lobby' && read ? await readInvites(me.id).catch(() => []) : [];
  if (L !== me) return;
  render();
}

function render() {
  const me = L; if (!me?.preview) return;
  const p = me.preview, d = me.data, uid = currentUser()?.id;
  const contest = d?.contest, state = contest?.state || p.state;
  const isHost = !!uid && !!contest && contest.host === uid; // (a watcher's view has no host id)
  const mine = uid ? d?.entrants.find((e) => e.user_id === uid) : undefined; // (a watcher's view has no user ids)
  $('lobby-name').textContent = p.name;
  const open = p.mode === 'open';
  $('lobby-what').textContent = `${open ? 'Open · ' : ''}${spotName(p)} · ${open ? `${p.end_minutes ? `${Number(p.end_minutes)} min` : `${p.end_waves} wave`} heats · ${p.open_format === 'condensed' ? `every round in ${roundsText(p.round_hours).replace(' a round', '')}` : roundsText(p.round_hours)}` : lengthName(p)}${p.host_handle ? ` · hosted by @${p.host_handle}` : ''}`;
  // who's in
  const list = $('lobby-list'); list.innerHTML = '';
  if (d) {
    for (const e of d.entrants) {
      const here = me.present.includes(e.user_id);
      list.append(h('li', { className: here ? '' : 'away' }, h('span', { textContent: e.name + (e.user_id === uid ? ' (you)' : '') }), h('span', { className: 'here', textContent: here ? 'here' : 'away' })));
    }
    for (const i of (me.invites || []).filter((x) => !x.accepted_at)) {
      const who = i.handle ? `@${i.handle}` : i.email; // (an invite by email: the host sees the address; the invitee, their own)
      const row = h('li', { className: 'away' }, h('span', { textContent: `${who}${i.user_id === uid || (i.email && i.email === currentUser()?.email?.toLowerCase()) ? ' (you)' : ''}` }), h('span', { className: 'here', textContent: 'invited' }));
      if (isHost) row.append(h('button', { type: 'button', className: 'lobby-x', textContent: 'Uninvite', onclick: () => act(() => uninvite(i.id)) }));
      list.append(row);
    }
    if (!d.entrants.length && !me.invites?.length) list.append(h('li', {}, h('span', { textContent: 'Nobody yet' })));
  } else list.append(h('li', {}, h('span', { textContent: `${p.entrants} of ${p.max_entrants} in` })));
  // what you can do
  const lobby = state === 'lobby';
  $('lobby-join').hidden = !lobby || !!mine || (d?.entrants.length ?? p.entrants) >= p.max_entrants;
  if (!$('lobby-join').hidden) {
    const user = currentUser(), member = user && !user.is_anonymous;
    me.signIn = open && !member; // (no guests in Open: your email, and a sign-in link back here)
    $('lobby-nick').type = me.signIn ? 'email' : 'text';
    $('lobby-nick').placeholder = me.signIn ? 'Your email' : 'Your nickname';
    $('lobby-nick').autocomplete = me.signIn ? 'email' : 'nickname';
    const nick = $('lobby-nick');
    const handle = member && me.handle;
    nick.hidden = !!handle;
    if (!handle && !nick.value && !me.signIn) nick.value = savedNickname();
    $('lobby-join').querySelector('button').textContent = me.signIn ? 'Email me a link' : handle ? `Join as @${handle}` : 'Join';
    if (member && me.handle === undefined) { me.handle = null; myProfile().then((pr) => { me.handle = pr?.handle || null; render(); }).catch(() => {}); }
  }
  $('lobby-invite').hidden = !(open && lobby && isHost && p.entry === 'invite');
  $('lobby-start').textContent = open ? 'Open round 1 now' : 'Start';
  $('lobby-start').hidden = !(lobby && isHost);
  const count = d?.entrants.length ?? p.entrants;
  $('lobby-start').disabled = count < 2; // (a heat is 2 to 4 surfers: the host can't start alone, the user 2026-11-26)
  $('lobby-leave').hidden = !(lobby && mine);
  $('lobby-cancel').hidden = !(isHost && (lobby || state === 'running'));
  $('lobby-recap').hidden = state !== 'done';
  clearInterval(me.count); me.count = null;
  $('lobby-surf').hidden = true; say('lobby-when', ''); $('lobby-heat-recap').hidden = true;
  // once it's started: the heats (a bracket: every round), instead of the list of who's in
  const heats = d?.heats || [];
  list.hidden = heats.length > 0;
  drawBracket(d, mine, open);
  if (open && (lobby || state === 'running')) { renderOpen(me, d, p, mine, isHost, lobby, count); return; }
  if (state === 'running') {
    const my = d?.heat, entry = my?.heat_entries.find((x) => x.entrant_id === mine?.id);
    if (mine && my?.state === 'live' && !inHeat) countdown(my.starts_at);
    else if (mine && my?.state === 'done' && entry?.advanced) say('lobby-msg', "You're through! The next round starts once every heat of this one is done.");
    else if (mine && my?.state === 'done') say('lobby-msg', "You're out. The rest is on: watch the bracket here.");
    else if (!mine) say('lobby-msg', "This contest has already started, so it's too late to join. You're watching: the scores fill in as they come.");
  } else if (state === 'done') {
    // the recap (task 17): watch it in the game, the host makes its video, and the contest's page with every wave
    const enc = encodeURIComponent(me.code);
    $('lobby-recap-play').href = `index.html?recap=${enc}`;
    $('lobby-recap-make').href = `index.html?recap=${enc}&make`; $('lobby-recap-make').hidden = !isHost;
    $('lobby-results').href = `contest.html?c=${enc}`;
    const last = heats[heats.length - 1], win = last?.heat_entries.find((x) => x.place === 1);
    const name = win && d.entrants.find((e) => e.id === win.entrant_id)?.name;
    say('lobby-msg', name ? `Won by ${name}${win.entrant_id === mine?.id ? ' (you!)' : ''}.` : 'This contest is over.');
  } else if (state === 'cancelled') say('lobby-msg', 'The host cancelled this contest.');
  else if (lobby && !me.msgKept) say('lobby-msg', mine ? (isHost ? (count < 2 ? 'Share the link. You can start once someone else joins. Wait until everyone\'s in: once it starts, nobody else can join.' : 'Wait until everyone\'s in before you start: once it starts, nobody else can join.') : 'You\'re in. Waiting for the host to start.') : '');
}

// The heats, round by round: who's in each (by place once it's done), their totals, who went through.
function drawBracket(d, mine, open = false) {
  const el = $('bracket'), heats = d?.heats || [];
  el.innerHTML = ''; el.hidden = !heats.length;
  if (!heats.length) return;
  const name = (id) => d.entrants.find((e) => e.id === id)?.name || '?';
  const rounds = [...new Set(heats.map((x) => x.round))];
  for (const r of rounds) {
    const inRound = heats.filter((x) => x.round === r), final = inRound.length === 1;
    const box = h('div', { className: 'heats' });
    for (const ht of inRound) {
      const hidden = open && ht.state !== 'done'; // (an Open heat's scores stay hidden until it closes)
      const rows = (hidden ? ht.heat_entries.map((x) => ({ ...x, total: null, place: null, advanced: null })) : heatBoard(ht, d.rides))
        .sort((a, b) => (a.place ?? 99) - (b.place ?? 99) || a.jersey.localeCompare(b.jersey));
      const when = ht.state === 'done' ? 'done' : hidden ? (ht.window_ends_at && Date.parse(ht.window_ends_at) > Date.now() ? `closes in ${timeLeft(Date.parse(ht.window_ends_at) - Date.now())}` : 'closing')
        : Date.parse(ht.starts_at) > Date.now() ? 'starting soon' : 'on now';
      const label = h('small', { textContent: final ? when : `Heat ${ht.number} · ${when}` });
      if (open && ht.state === 'done' && (!d.watching || d.contest?.state === 'done') && d.rides.some((r) => r.heat_id === ht.id && r.replay_path)) // (an Open round's heat: its recap, step 5)
        label.append(h('a', { href: `index.html?recap=${encodeURIComponent(d.contest?.code || L.code)}&heat=${ht.id}`, textContent: '▶ recap' }));
      const card = h('div', { className: `heat${rows.some((x) => x.entrant_id === mine?.id) ? ' yours' : ''}` }, label);
      for (const x of rows) {
        const color = JERSEYS.find((j) => j.id === x.jersey)?.color || '#888';
        card.append(h('div', { className: `row${x.advanced === false ? ' out' : ''}${x.entrant_id === mine?.id ? ' me' : ''}` },
          h('i', { style: `background:${color}` }), h('span', { textContent: `${x.place ? `${x.place}. ` : ''}${name(x.entrant_id)}${x.advanced ? ' ✓' : ''}` }),
          h('b', { textContent: hidden ? surfStatus(ht, x, d.contest) : x.total != null ? Number(x.total).toFixed(2) : '–' })));
      }
      box.append(card);
    }
    el.append(h('div', {}, h('h3', { textContent: final ? (rounds.length > 1 ? 'Final' : 'The heat') : `Round ${r}` }), box));
  }
}

// ---- Open contests ----
const roundsText = (hrs = []) => {
  const n = (x) => (x % 24 ? `${x} h` : x === 24 ? '1 day' : `${x / 24} days`);
  return hrs.length && hrs.every((x) => x === hrs[0]) ? `${n(hrs[0])} a round` : hrs.map(n).join(', ') + ' rounds';
};
// Where you are in an Open heat: not started, on (until your horn and its grace), or done.
function myOpenHeat(ht, entry, c) {
  if (!ht || !entry) return null;
  if (entry.finished_at) return 'done';
  if (entry.started_at) return Date.now() < Date.parse(entry.started_at) + (heatSeconds(c) + RIDE_GRACE_S) * 1000 ? 'on' : 'done';
  return ht.state === 'live' && Date.parse(ht.window_ends_at) > Date.now() ? 'ready' : 'missed';
}
const surfStatus = (ht, x, c) => ({ done: 'surfed', on: 'surfing', ready: 'not yet', missed: 'missed it' }[myOpenHeat(ht, x, c)] || '');

function renderOpen(me, d, p, mine, isHost, lobby, count) {
  if (lobby) {
    const closes = Date.parse(p.signup_ends_at);
    say('lobby-when', closes > Date.now() ? `Sign-up closes in ${timeLeft(closes - Date.now())}. Round 1 opens then.` : 'Sign-up has closed: round 1 opens in a few minutes.');
    if (me.msgKept) return;
    say('lobby-msg', mine ? (isHost ? (p.entry === 'invite' ? 'Invite people by their username. ' : 'Share the link: anyone can sign up. ') + (count < 2 ? 'You can open round 1 early once someone else is in.' : 'Or open round 1 now.')
      : "You're in. You'll surf your heat any time in round 1's window.")
      : p.entry === 'invite' && !me.invites?.some((i) => i.user_id === currentUser()?.id || (i.email && i.email === currentUser()?.email?.toLowerCase())) ? 'This contest is invite only.' : 'Join to surf: Open contests need an account (free).');
    return;
  }
  const my = d?.heat, entry = my?.heat_entries.find((x) => x.entrant_id === mine?.id), c = d?.contest || p;
  // your latest closed heat: its recap is where you first see how the others surfed it (step 5)
  const closed = mine && [...(d?.heats || [])].reverse().find((x) => x.state === 'done' && x.heat_entries.some((e) => e.entrant_id === mine.id));
  if (closed && d.rides.some((r) => r.heat_id === closed.id && r.replay_path)) {
    $('lobby-heat-recap').href = `index.html?recap=${encodeURIComponent(L.code)}&heat=${closed.id}`;
    $('lobby-heat-recap').textContent = `▶ Watch the recap of your ${closed.round > 1 || d.heats.some((x) => x.round > 1) ? `round ${closed.round} ` : ''}heat`;
    $('lobby-heat-recap').hidden = false;
  }
  const where = my ? (d.final ? (d.rounds > 1 ? 'The final' : 'Your heat') : `Round ${my.round}, heat ${my.number}`) : '';
  const left = my?.window_ends_at ? timeLeft(Date.parse(my.window_ends_at) - Date.now()) : '';
  if (me.msgKept) return;
  if (!mine) { say('lobby-msg', d?.condensed || c.open_format === 'condensed' ? 'This contest has started. The bracket is played out when its window closes.' : 'This contest has started. Each round\'s scores show here when it closes.'); return; }
  if (d.condensed) { renderCondensed(me, d, mine, c, left); return; }
  if (my?.state === 'done') {
    say('lobby-msg', entry?.advanced ? "You're through! The next round opens as soon as every heat of this one has closed." : "You're out. Follow the rest of the bracket here.");
    return;
  }
  const st = myOpenHeat(my, entry, c);
  if (st === 'ready') {
    say('lobby-when', `${where} · closes in ${left}`);
    $('lobby-surf').textContent = 'Surf your heat'; $('lobby-surf').hidden = false;
    say('lobby-msg', `One try: once you start, your ${lengthName(c)} heat runs even if you leave. Nobody sees your scores until the round closes.`);
  } else if (st === 'on') {
    $('lobby-surf').textContent = 'Back to your heat'; $('lobby-surf').hidden = false;
    say('lobby-msg', `Your heat is on: ${timeLeft(Date.parse(entry.started_at) + heatSeconds(c) * 1000 - Date.now())} to the horn.`);
  } else if (st === 'done') say('lobby-msg', `You've surfed your heat. The results come out when the round closes (in ${left} at the latest).`);
  else say('lobby-msg', 'You missed the window for this heat.');
}

// Condensed: your rounds, in order, and the next to surf. The bracket waits for the window (or for everyone's last round).
function renderCondensed(me, d, mine, c, left) {
  const roundName = (r) => (r === d.rounds && d.rounds > 1 ? 'the final' : d.rounds > 1 ? `round ${r}` : 'your heat');
  const cap = (s) => s[0].toUpperCase() + s.slice(1);
  const short = (r) => (r === d.rounds && d.rounds > 1 ? 'Final' : `Round ${r}`);
  const marks = d.path.map((x) => `${short(x.round)}${myOpenHeat(x, x.heat_entries.find((e) => e.entrant_id === mine.id), c) === 'done' ? ' ✓' : ''}`);
  const my = d.heat, st = myOpenHeat(my, my?.heat_entries.find((x) => x.entrant_id === mine.id), c);
  say('lobby-when', `${marks.join(' · ')} · closes in ${left}`);
  me.fresh = st === 'ready';
  if (st === 'ready') {
    $('lobby-surf').textContent = `Surf ${roundName(my.round)}`; $('lobby-surf').hidden = false;
    say('lobby-msg', `One try for each round, in order: ${d.rounds} in this window, ${lengthName(c)} each. When it closes the bracket is played out from them, so a round you don't get through to doesn't count. Nobody sees scores until then.`);
  } else if (st === 'on') {
    $('lobby-surf').textContent = `Back to ${roundName(my.round)}`; $('lobby-surf').hidden = false;
    say('lobby-msg', `${cap(roundName(my.round))} is on: ${timeLeft(Date.parse(my.heat_entries.find((x) => x.entrant_id === mine.id).started_at) + heatSeconds(c) * 1000 - Date.now())} to the horn.`);
  } else if (st === 'done') say('lobby-msg', `You've surfed every round. The bracket is played out when the window closes (in ${left} at the latest), or once everyone has surfed theirs.`);
  else say('lobby-msg', 'The window has closed: the bracket is being played out.');
}

function surf() {
  const me = L; if (!me) return;
  const c = me.data?.contest || me.preview;
  if (($('lobby-surf').textContent === 'Surf your heat' || (me.data?.condensed && me.fresh))
      && !confirm(`One try: once you start, your ${lengthName(c)} heat runs even if you leave or reload. Ready?`)) return;
  location.href = `${contestLink(me.code)}&go${new URLSearchParams(location.search).has('auto') ? '&auto' : ''}`;
}

async function invite() {
  const me = L; if (!me) return;
  const who = $('lobby-invitee').value.trim();
  if (!who) return;
  me.msgKept = true;
  const btn = $('lobby-invite').querySelector('button'); btn.disabled = true;
  try {
    if (looksLikeEmail(who)) {
      const r = await inviteByEmail(me.id, who);
      say('lobby-msg', r.already ? `${who.toLowerCase()} is invited (emailed in the last day already).` : `Invited ${who.toLowerCase()}: we've emailed them the link.`);
    } else {
      await inviteToContest(me.id, who);
      say('lobby-msg', `Invited @${who.replace(/^@/, '').toLowerCase()}. Send them the link.`);
    }
    $('lobby-invitee').value = ''; me.live?.changed(); await refresh();
  } catch (e) { say('lobby-msg', describeContestError(e)); }
  btn.disabled = false;
}

// Everyone in it drops in together at the heat's start.
function countdown(startsAt) {
  const me = L, at = Date.parse(startsAt);
  const tick = () => {
    const s = Math.ceil((at - Date.now()) / 1000);
    if (s > 0) { say('lobby-msg', `Your heat starts in ${s}…`); return; }
    clearInterval(me.count);
    location.href = `${contestLink(me.code)}&go${new URLSearchParams(location.search).has('auto') ? '&auto' : ''}`; // (&auto: the tests' autopilot rides along)
  };
  tick(); me.count = setInterval(tick, 250);
}

async function join() {
  const me = L; if (!me) return;
  const btn = $('lobby-join').querySelector('button');
  btn.disabled = true; me.msgKept = false;
  if (me.preview?.mode === 'open' && (!currentUser() || currentUser().is_anonymous)) { // (no guests in Open: an account, free)
    me.msgKept = true;
    const email = $('lobby-nick').value.trim();
    if (!looksLikeEmail(email)) say('lobby-msg', 'Open contests need an account: put in your email for a sign-in link (free).');
    else {
      try { await sendMagicLink(email); say('lobby-msg', `Check ${email}: the link signs you in and brings you back here to join.`); }
      catch (e) { say('lobby-msg', describeContestError(e)); }
    }
    btn.disabled = false; return;
  }
  try {
    const nick = $('lobby-nick').hidden ? null : $('lobby-nick').value.trim();
    await joinContest(me.code, nick);
    await connect(); // (present as you now; a guest's session is new)
    me.live?.changed();
    await refresh();
  } catch (e) { me.msgKept = true; say('lobby-msg', describeContestError(e)); }
  btn.disabled = false;
}

async function act(fn) {
  const me = L; if (!me) return;
  me.msgKept = false;
  for (const id of ['lobby-start', 'lobby-leave', 'lobby-cancel']) $(id).disabled = true;
  try { await fn(); me.live?.changed(); await refresh(); }
  catch (e) { me.msgKept = true; say('lobby-msg', describeContestError(e)); }
  for (const id of ['lobby-start', 'lobby-leave', 'lobby-cancel']) $(id).disabled = false;
  render();
}

async function share() {
  const url = contestLink(L.code);
  try {
    if (navigator.share && matchMedia('(pointer: coarse)').matches) { await navigator.share({ title: `Ry's Rad Waves: ${L.preview?.name || 'a contest'}`, url }); return; }
    await navigator.clipboard.writeText(url); L.msgKept = true; say('lobby-msg', 'Link copied.');
  } catch { prompt('The contest link:', url); }
}

// (signing in or out changes what the lobby shows)
onAccount(() => { if (L?.id) refresh().catch(() => {}); });
