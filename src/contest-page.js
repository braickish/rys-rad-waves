// contest.html?c=<code>: a contest's page (accounts plan task 14): every round and heat, places, totals and each wave's
// score, with ▶ to watch the wave (its ride log from Storage, played in the game). Public contests are open to everyone;
// an unlisted one only to its host and the people in it.
import { initAccount, describeAuthError } from './account.js';
import { contestByCode, readContest, spotName, lengthName } from './contests.js';
import { JERSEYS } from './heat.js';

const $ = (id) => document.getElementById(id);
const h = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); for (const k of kids) if (k != null) e.append(k); return e; };
const code = (new URLSearchParams(location.search).get('c') || '').toUpperCase();
const ordinal = (n) => n + (n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th');
const day = (t) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });

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
    // who's a member (their page) and every wave
    const users = d.entrants.map((e) => e.user_id).filter(Boolean);
    const { data: profiles } = users.length ? await c.from('profiles').select('id, handle').in('id', users) : { data: [] };
    const handleOf = (entrantId) => profiles?.find((p) => p.id === d.entrants.find((e) => e.id === entrantId)?.user_id)?.handle;
    const { data: rides } = d.heats.length ? await c.from('rides').select('heat_id, entrant_id, wave_no, score, replay_path').in('heat_id', d.heats.map((x) => x.id)).order('wave_no') : { data: [] };
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
            const b = h('button', { type: 'button', className: 'wave-btn', textContent: `${w.replay_path ? '▶ ' : ''}${Number(w.score).toFixed(2)}`, disabled: !w.replay_path, title: w.replay_path ? 'Watch this wave' : '' });
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
