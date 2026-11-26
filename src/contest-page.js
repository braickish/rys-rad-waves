// contest.html?c=<code>: a contest's page (accounts plan task 14): every round and heat, places, totals and each wave's
// score, with ▶ to watch the wave (its ride log from Storage, played in the game). Public contests are open to everyone;
// an unlisted one only to its host and the people in it. The host also sees each wave's score check (task 15): ✓ when
// its log rides to the same score, ⚑ with why when it doesn't.
import { initAccount, describeAuthError, currentUser } from './account.js';
import { contestByCode, readContest, spotName, lengthName } from './contests.js';
import { JERSEYS } from './heat.js';

const $ = (id) => document.getElementById(id);
const h = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); for (const k of kids) if (k != null) e.append(k); return e; };
const code = (new URLSearchParams(location.search).get('c') || '').toUpperCase();
const ordinal = (n) => n + (n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th');
const day = (t) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });

// Why a wave was flagged, in words (src/ride-check.js's codes).
const CHECK_WORDS = {
  score: 'its log rides to a different score', log_score: "its log's own score differs", drift: "the ride doesn't follow its own log",
  wrong_wave: 'ridden on another wave', wrong_break: 'ridden on another break', wrong_sea: "not this heat's waves",
  wrong_judges: "not this wave's judges", settings: 'ridden with unusual settings', wont_run: "its log isn't a ride the game can play",
};

// ▶: a link that plays the wave's ride log in the game (a signed address, good for an hour).
async function watch(c, path) {
  const { data, error } = await c.storage.from('replays').createSignedUrl(path, 3600);
  if (error) throw error;
  location.href = `index.html?replay=${encodeURIComponent(data.signedUrl)}`;
}

try {
  const c = await initAccount();
  const preview = code ? await contestByCode(code) : null;
  const d = preview ? await readContest(preview.id) : null;
  $('loading').hidden = true;
  if (!d) {
    $('missing').hidden = false;
    $('missing-why').textContent = !preview ? `There's no contest with the code ${code || 'given'}.` : 'Its results are only for the people in it. Ask the host to make it public.';
  } else {
    const k = d.contest;
    $('contest').hidden = false;
    document.title = `${k.name} · Ry's Rad Waves`;
    $('c-name').textContent = k.name;
    $('c-what').textContent = `${spotName(k)} · ${lengthName(k)} a heat${preview.host_handle ? ` · hosted by @${preview.host_handle}` : ''} · ${d.entrants.length} surfers`;
    const last = d.heats[d.heats.length - 1], win = k.state === 'done' && last?.heat_entries.find((x) => x.place === 1);
    const name = (id) => d.entrants.find((e) => e.id === id)?.name || '?';
    $('c-state').textContent = k.state === 'done' ? `${win ? `🏆 Won by ${name(win.entrant_id)} · ` : ''}${day(k.ended_at || k.created_at)}`
      : k.state === 'running' ? 'On now.' : k.state === 'lobby' ? 'In the lobby, waiting to start.' : 'Cancelled.';
    if (k.state === 'lobby' || k.state === 'running') { $('lobby-link').hidden = false; $('lobby-link').href = `index.html?contest=${k.code}`; }
    // the recap (task 17): its video when the host kept one; anyone can watch it played in the game
    if (k.state === 'done') {
      const { data: rc } = await c.from('recaps').select('video_path, seconds, made_at').eq('contest_id', k.id).maybeSingle();
      const box = h('section', { className: 'panel recap', id: 'recap' }, h('h2', { textContent: 'The recap' }));
      if (rc) {
        const url = c.storage.from('recaps').getPublicUrl(rc.video_path).data.publicUrl + `?v=${Date.parse(rc.made_at)}`;
        box.append(h('video', { src: url, controls: true, playsInline: true, preload: 'metadata', id: 'recap-video' }));
      } else box.append(h('p', { className: 'empty', textContent: currentUser()?.id === k.host ? 'No video yet: watch it in the game and Make video to keep one here.' : 'No video yet.' }));
      box.append(h('p', {}, h('a', { href: `index.html?recap=${encodeURIComponent(k.code)}`, textContent: '▶ Watch the recap in the game', id: 'recap-play' })));
      $('c-rounds').before(box);
    }
    // who's a member (their page) and every wave
    const users = d.entrants.map((e) => e.user_id).filter(Boolean);
    const { data: profiles } = users.length ? await c.from('profiles').select('id, handle').in('id', users) : { data: [] };
    const handleOf = (entrantId) => profiles?.find((p) => p.id === d.entrants.find((e) => e.id === entrantId)?.user_id)?.handle;
    const { data: rides } = d.heats.length ? await c.from('rides').select('heat_id, entrant_id, wave_no, score, replay_path').in('heat_id', d.heats.map((x) => x.id)).order('wave_no') : { data: [] };
    // the host: score checks
    const host = currentUser()?.id === k.host;
    const checks = new Map();
    if (host && rides?.length) {
      const { data } = await c.from('ride_checks').select('ride_id, status, reasons, score, rides!inner(heat_id, entrant_id, wave_no)').in('rides.heat_id', d.heats.map((x) => x.id));
      for (const x of data || []) checks.set(`${x.rides.heat_id}/${x.rides.entrant_id}/${x.rides.wave_no}`, x);
      const n = (st) => [...checks.values()].filter((x) => x.status === st).length;
      const line = h('p', { className: 'hint checks-line', id: 'checks-line' }, `Score checks (only you see these): ${n('ok')} ✓, ${n('flagged')} ⚑ flagged, ${n('pending')} waiting${n('no_log') ? `, ${n('no_log')} with no log` : ''}.`);
      if (n('pending')) {
        const again = h('button', { type: 'button', className: 'quiet wave-btn', textContent: 'Check now' });
        again.addEventListener('click', async () => {
          again.disabled = true;
          for (const hh of d.heats) for (let k = 0; k < 40; k++) { // (one ride a call, until this contest's are done)
            const { data } = await c.functions.invoke('check-rides', { body: { heat_id: hh.id } }).catch(() => ({}));
            again.textContent = `Checking… ${data?.remaining ?? ''}`;
            if (!data?.remaining) break;
          }
          location.reload();
        });
        line.append(' ', again);
      }
      $('c-state').after(line);
    }
    const rounds = [...new Set(d.heats.map((x) => x.round))];
    for (const r of rounds) {
      const heats = d.heats.filter((x) => x.round === r), final = heats.length === 1;
      const sec = h('section', { className: 'panel' }, h('h2', { textContent: final ? (rounds.length > 1 ? 'Final' : 'The heat') : `Round ${r}` }));
      for (const ht of heats) {
        if (!final) sec.append(h('p', { className: 'hint', textContent: `Heat ${ht.number}${ht.state === 'live' ? ' · on now' : ''}` }));
        const rows = [...ht.heat_entries].sort((a, b) => (a.place ?? 99) - (b.place ?? 99));
        const box = h('div', { className: 'heat-table' });
        for (const x of rows) {
          const color = JERSEYS.find((j) => j.id === x.jersey)?.color || '#888', hd = handleOf(x.entrant_id);
          const who = hd ? h('a', { href: `profile.html?u=${encodeURIComponent(hd)}`, textContent: name(x.entrant_id) }) : h('span', { textContent: name(x.entrant_id) });
          const waves = h('div', { className: 'waves-row' });
          for (const w of (rides || []).filter((y) => y.heat_id === ht.id && y.entrant_id === x.entrant_id)) {
            const ck = checks.get(`${ht.id}/${x.entrant_id}/${w.wave_no}`);
            const mark = !ck ? '' : ck.status === 'ok' ? ' ✓' : ck.status === 'flagged' || ck.status === 'error' ? ' ⚑' : '';
            const why = ck && (ck.status === 'flagged' || ck.status === 'error') ? `Flagged: ${ck.reasons.map((r) => CHECK_WORDS[r] || r).join('; ')}${ck.score != null ? ` (it rides to ${Number(ck.score).toFixed(2)})` : ''}` : ck?.status === 'ok' ? 'Checked: its log rides to the same score' : '';
            const b = h('button', { type: 'button', className: `wave-btn${mark === ' ⚑' ? ' flagged' : ''}`, textContent: `${w.replay_path ? '▶ ' : ''}${Number(w.score).toFixed(2)}${mark}`, disabled: !w.replay_path, title: [w.replay_path ? 'Watch this wave' : '', why].filter(Boolean).join(' · ') });
            if (w.replay_path) b.addEventListener('click', () => watch(c, w.replay_path).catch((e) => alert(describeAuthError(e))));
            waves.append(b);
          }
          box.append(h('div', { className: `ht-row${x.advanced === false ? ' out' : ''}` },
            h('span', { className: 'ht-pl', textContent: x.place ? ordinal(x.place) : '' }), h('i', { style: `background:${color}` }),
            h('span', { className: 'ht-name' }, who, x.advanced ? ' ✓' : null), h('b', { textContent: x.total != null ? Number(x.total).toFixed(2) : '' }), waves));
        }
        sec.append(box);
      }
      $('c-rounds').append(sec);
    }
  }
} catch (err) {
  $('loading').hidden = false; $('loading').textContent = describeAuthError(err);
}
