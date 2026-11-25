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
await import('./main.js');
if (note) { const el = document.getElementById('lock-note'); if (el) { el.textContent = note; el.hidden = false; } }
