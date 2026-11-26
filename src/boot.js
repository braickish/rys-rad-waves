// The game page's entry. `index.html?break=<id>` (accounts plan task 7) surfs a saved break: its ride is fetched first and
// handed to the game the way the builder's DROP IN does (?wave=built&play#built=...). Every other link starts the game at
// once (supabase-js is only loaded here for a break link). `&pick` (Free surf's list of your breaks) loads it without
// dropping in.
const q = new URLSearchParams(location.search), id = q.get('break');
let note = null;
if (id && !/built=/.test(location.hash)) {
  try {
    const [{ getBreak }, { encodeBuilt }] = await Promise.all([import('./breaks.js'), import('./waves/built.js')]);
    const b = await getBreak(id);
    if (b?.ride) {
      q.set('wave', 'built');
      if (q.has('pick')) q.delete('pick'); else q.set('play', ''); // (?pick: picked from Free surf's list, so it waits for DROP IN)
      history.replaceState(null, '', `${location.pathname}?${q.toString().replace(/play=(&|$)/, 'play$1')}#built=${encodeBuilt(b.ride)}`);
    } else note = b ? `“${b.name}” doesn't make a wave you can ride yet.` : "That break is private, or it's gone.";
  } catch (e) { console.warn('break', e); note = "Couldn't load that break. Check your connection."; }
}
// `index.html?contest=<code>&go` (accounts plan tasks 11-12): the lobby's countdown ended; the heat is set up from the
// contest (its wave or its break's ride, its length, the heat's seed, your jersey, no bots) and drops in, live
// (window.__contestHeat: the heat, your entry, everyone in it, for src/live-heat.js). A reload in the heat
// (`?contest=<code>&heat=...`) rejoins it. Not in it, not started, or over: back to the lobby, which says why.
const code = q.get('contest');
if (code && (q.has('go') || q.has('heat'))) {
  q.delete('go');
  let hash = location.hash, live = false;
  try {
    const [acct, { contestByCode, readContest, heatParam }, { encodeBuilt }] = await Promise.all([import('./account.js'), import('./contests.js'), import('./waves/built.js')]);
    await acct.initAccount();
    const p = await contestByCode(code), r = p && acct.currentUser() ? await readContest(p.id) : null;
    const mine = r?.entrants.find((e) => e.user_id === acct.currentUser().id);
    if (r?.heat && mine && r.heat.state === 'live') {
      const spot = r.contest.spot, entries = r.heat.heat_entries || [];
      q.set('heat', heatParam(r.contest)); q.set('seed', String(r.heat.seed)); q.set('bots', '0'); q.set('judge', '');
      const jersey = entries.find((x) => x.entrant_id === mine.id)?.jersey;
      if (jersey) q.set('jersey', jersey);
      if (spot.wave) { q.set('wave', spot.wave); acct.allowWave(spot.wave); }
      else { q.set('wave', 'built'); hash = `#built=${encodeBuilt(spot.ride)}`; }
      q.set('play', '');
      live = true;
      window.__contestHeat = {
        code, contestId: r.contest.id, heatId: r.heat.id, entrantId: mine.id, name: mine.name, startsAt: r.heat.starts_at, endsAt: r.heat.ends_at,
        bracket: r.contest.format === 'bracket', round: r.heat.round, heatNo: r.heat.number, final: r.final,
        entrants: entries.map((x) => ({ id: x.entrant_id, jersey: x.jersey, name: r.entrants.find((e) => e.id === x.entrant_id)?.name || '?' })),
        // your waves already scored in it (a reload mid-heat): you carry on from the next wave of the set, not the first
        ridden: r.rides.filter((x) => x.heat_id === r.heat.id && x.entrant_id === mine.id).map((x) => ({ n: x.wave_no, score: Number(x.score), at: (Date.parse(x.caught_at) - Date.parse(r.heat.starts_at)) / 1000 })),
      };
    }
  } catch (e) { console.warn('contest', e); }
  if (!live) { for (const k of ['heat', 'seed', 'bots', 'judge', 'jersey', 'play']) q.delete(k); hash = ''; } // (to the lobby)
  history.replaceState(null, '', `${location.pathname}?${q.toString().replace(/(play|judge)=(&|$)/g, '$1$2')}${hash}`);
}
await import('./main.js');
if (note) { const el = document.getElementById('lock-note'); if (el) { el.textContent = note; el.hidden = false; } }
