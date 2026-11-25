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
// `index.html?contest=<code>&go` (accounts plan task 11): the lobby's countdown ended; the heat is set up from the
// contest (its wave or its break's ride, its length, the heat's seed, your jersey, no bots) and drops in. Not in it, or
// not started: back to the lobby, which says why.
const code = q.get('contest');
if (code && q.has('go')) {
  q.delete('go');
  let hash = '';
  try {
    const [acct, { contestByCode, readContest, heatParam }, { encodeBuilt }] = await Promise.all([import('./account.js'), import('./contests.js'), import('./waves/built.js')]);
    await acct.initAccount();
    const p = await contestByCode(code), r = p && acct.currentUser() ? await readContest(p.id) : null;
    const mine = r?.entrants.find((e) => e.user_id === acct.currentUser().id);
    if (r?.heat && mine && r.contest.state === 'running') {
      const spot = r.contest.spot;
      q.set('heat', heatParam(r.contest)); q.set('seed', String(r.heat.seed)); q.set('bots', '0'); q.set('judge', '');
      const jersey = r.heat.heat_entries?.find((x) => x.entrant_id === mine.id)?.jersey;
      if (jersey) q.set('jersey', jersey);
      if (spot.wave) { q.set('wave', spot.wave); acct.allowWave(spot.wave); }
      else { q.set('wave', 'built'); hash = `#built=${encodeBuilt(spot.ride)}`; }
      q.set('play', '');
    }
  } catch (e) { console.warn('contest', e); }
  history.replaceState(null, '', `${location.pathname}?${q.toString().replace(/(play|judge)=(&|$)/g, '$1$2')}${hash}`);
}
await import('./main.js');
if (note) { const el = document.getElementById('lock-note'); if (el) { el.textContent = note; el.hidden = false; } }
