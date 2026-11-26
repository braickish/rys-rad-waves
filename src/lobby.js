// Hosting and joining contests on the title screen (accounts plan task 11), under Compete live:
//   Host a contest  Pro: where (one of the game's waves or a saved break), how long, a name, public or not. The host is
//                   entered too (they can leave and just run it). From the builder, ?host=<break id> opens this with
//                   that break picked.
//   Join            a code, or a contest link (?contest=<code>), opens the lobby.
//   The lobby       the contest, its code to share, who's in and who's here now (presence), and: Join (guests with a
//                   nickname, on an anonymous session made there and then; members as their handle), Leave, and the
//                   host's Start and Cancel. When it starts, everyone in it counts down to the heat's start and
//                   drops in (boot.js `?contest=<code>&go` sets the heat up from the contest).
// Live heats (scores shared as you ride) are task 12; for now the heat runs on each screen on its own, with the
// contest's waves, length and your jersey.
import { initAccount, onAccount, currentUser, myProfile, SALES_OPEN } from './account.js';
import { openPaywall } from './paywall.js';
import { JERSEYS } from './heat.js';
import { myBreaks } from './breaks.js';
import { WAVE_NAMES, CONTEST_WAVES, LENGTHS, SIZES, contestLink, spotName, lengthName, savedNickname, createContest, contestByCode, joinContest,
  leaveContest, startContest, cancelContest, readContest, contestChannel, describeContestError } from './contests.js';

const $ = (id) => document.getElementById(id);
const say = (id, text) => { const e = $(id); e.textContent = text || ''; e.hidden = !text; };
const h = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); for (const k of kids) if (k != null) e.append(k); return e; };
let show = () => {};
let inHeat = false;
let L = null; // the open lobby: { code, id, preview, data, live, present, timers }

let joinStep = () => 'compete'; // (where the code box is: Compete live, or for players without Pro the Join step)
export function initLobby(showStep, { inHeat: heat = false, joinStep: js } = {}) {
  show = showStep; inHeat = heat; if (js) joinStep = js;
  for (const id of ['host-form', 'lobby', 'join-form']) for (const ev of ['pointerdown', 'click', 'keydown']) $(id).addEventListener(ev, (e) => e.stopPropagation());
  $('go-host').addEventListener('click', (e) => { e.stopPropagation(); openHost(); });
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
async function openHost(breakId) {
  show('host'); say('host-msg', '');
  const spot = $('host-spot');
  spot.innerHTML = '';
  const waves = h('optgroup', { label: 'Waves' });
  for (const id of CONTEST_WAVES) waves.append(new Option(WAVE_NAMES[id], `wave:${id}`));
  spot.append(waves);
  const len = $('host-len');
  if (!len.options.length) for (const [v, label] of LENGTHS) len.add(new Option(label, v));
  const size = $('host-size');
  if (!size.options.length) { for (const [v, label] of SIZES) size.add(new Option(label, v)); size.value = '8'; }
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

async function create() {
  const [kind, id] = $('host-spot').value.split(':');
  $('host-create').disabled = true; say('host-msg', '');
  try {
    const c = await createContest({ name: $('host-name').value.trim(), wave: kind === 'wave' ? id : null, breakId: kind === 'break' ? id : null,
      length: $('host-len').value, size: $('host-size').value, visibility: $('host-public').checked ? 'public' : 'unlisted' });
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
  for (const id of ['lobby-join', 'lobby-start', 'lobby-leave', 'lobby-cancel']) $(id).hidden = true;
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
  const live = await contestChannel(me.id, { change: () => refresh().catch(() => {}), presence: (ids) => { me.present = ids; render(); } }).catch((e) => { console.warn('live', e); return null; });
  if (L !== me) { live?.close(); return; }
  me.live = live;
}

async function refresh() {
  const me = L; if (!me) return;
  const [preview, data] = await Promise.all([contestByCode(me.code), currentUser() ? readContest(me.id) : null]);
  if (L !== me) return;
  me.preview = preview || me.preview; me.data = data;
  render();
}

function render() {
  const me = L; if (!me?.preview) return;
  const p = me.preview, d = me.data, uid = currentUser()?.id;
  const contest = d?.contest, state = contest?.state || p.state;
  const isHost = !!contest && contest.host === uid;
  const mine = d?.entrants.find((e) => e.user_id === uid);
  $('lobby-name').textContent = p.name;
  $('lobby-what').textContent = `${spotName(p)} · ${lengthName(p)}${p.host_handle ? ` · hosted by @${p.host_handle}` : ''}`;
  // who's in
  const list = $('lobby-list'); list.innerHTML = '';
  if (d) {
    for (const e of d.entrants) {
      const here = me.present.includes(e.user_id);
      list.append(h('li', { className: here ? '' : 'away' }, h('span', { textContent: e.name + (e.user_id === uid ? ' (you)' : '') }), h('span', { className: 'here', textContent: here ? 'here' : 'away' })));
    }
    if (!d.entrants.length) list.append(h('li', {}, h('span', { textContent: 'Nobody yet' })));
  } else list.append(h('li', {}, h('span', { textContent: `${p.entrants} of ${p.max_entrants} in` })));
  // what you can do
  const lobby = state === 'lobby';
  $('lobby-join').hidden = !lobby || !!mine || (d?.entrants.length ?? p.entrants) >= p.max_entrants;
  if (!$('lobby-join').hidden) {
    const user = currentUser(), member = user && !user.is_anonymous;
    const nick = $('lobby-nick');
    const handle = member && me.handle;
    nick.hidden = !!handle;
    if (!handle && !nick.value) nick.value = savedNickname();
    $('lobby-join').querySelector('button').textContent = handle ? `Join as @${handle}` : 'Join';
    if (member && me.handle === undefined) { me.handle = null; myProfile().then((pr) => { me.handle = pr?.handle || null; render(); }).catch(() => {}); }
  }
  $('lobby-start').hidden = !(lobby && isHost);
  const count = d?.entrants.length ?? p.entrants;
  $('lobby-start').disabled = count < 2; // (a heat is 2 to 4 surfers: the host can't start alone, the user 2026-11-26)
  $('lobby-leave').hidden = !(lobby && mine);
  $('lobby-cancel').hidden = !(isHost && (lobby || state === 'running'));
  clearInterval(me.count); me.count = null;
  // once it's started: the heats (a bracket: every round), instead of the list of who's in
  const heats = d?.heats || [];
  list.hidden = heats.length > 0;
  drawBracket(d, mine);
  if (state === 'running') {
    const my = d?.heat, entry = my?.heat_entries.find((x) => x.entrant_id === mine?.id);
    if (mine && my?.state === 'live' && !inHeat) countdown(my.starts_at);
    else if (mine && my?.state === 'done' && entry?.advanced) say('lobby-msg', "You're through! The next round starts once every heat of this one is done.");
    else if (mine && my?.state === 'done') say('lobby-msg', "You're out. The rest is on: watch the bracket here.");
    else if (!mine) say('lobby-msg', "This contest has already started, so it's too late to join this one. Ask the host to start another.");
  } else if (state === 'done') {
    const last = heats[heats.length - 1], win = last?.heat_entries.find((x) => x.place === 1);
    const name = win && d.entrants.find((e) => e.id === win.entrant_id)?.name;
    say('lobby-msg', name ? `Won by ${name}${win.entrant_id === mine?.id ? ' (you!)' : ''}.` : 'This contest is over.');
  } else if (state === 'cancelled') say('lobby-msg', 'The host cancelled this contest.');
  else if (lobby && !me.msgKept) say('lobby-msg', mine ? (isHost ? (count < 2 ? 'Share the link. You can start once someone else joins.' : 'Share the link. Start when everyone\'s in.') : 'You\'re in. Waiting for the host to start.') : '');
}

// The heats, round by round: who's in each (by place once it's done), their totals, who went through.
function drawBracket(d, mine) {
  const el = $('bracket'), heats = d?.heats || [];
  el.innerHTML = ''; el.hidden = !heats.length;
  if (!heats.length) return;
  const name = (id) => d.entrants.find((e) => e.id === id)?.name || '?';
  const rounds = [...new Set(heats.map((x) => x.round))];
  for (const r of rounds) {
    const inRound = heats.filter((x) => x.round === r), final = inRound.length === 1;
    const box = h('div', { className: 'heats' });
    for (const ht of inRound) {
      const rows = [...ht.heat_entries].sort((a, b) => (a.place ?? 99) - (b.place ?? 99) || a.jersey.localeCompare(b.jersey));
      const when = ht.state === 'done' ? 'done' : Date.parse(ht.starts_at) > Date.now() ? 'starting soon' : 'on now';
      const card = h('div', { className: `heat${rows.some((x) => x.entrant_id === mine?.id) ? ' yours' : ''}` }, h('small', { textContent: final ? when : `Heat ${ht.number} · ${when}` }));
      for (const x of rows) {
        const color = JERSEYS.find((j) => j.id === x.jersey)?.color || '#888';
        card.append(h('div', { className: `row${x.advanced === false ? ' out' : ''}${x.entrant_id === mine?.id ? ' me' : ''}` },
          h('i', { style: `background:${color}` }), h('span', { textContent: `${x.place ? `${x.place}. ` : ''}${name(x.entrant_id)}${x.advanced ? ' ✓' : ''}` }),
          x.total != null ? h('b', { textContent: Number(x.total).toFixed(2) }) : null));
      }
      box.append(card);
    }
    el.append(h('div', {}, h('h3', { textContent: final ? (rounds.length > 1 ? 'Final' : 'The heat') : `Round ${r}` }), box));
  }
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
