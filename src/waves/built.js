// Your break: a wave from the wave builder (builder.html, DROP IN; the user, 2026-11-22). The builder hands over the
// stretch you chose (the whole ride, or a loop to surf forever) as a profile every 10 m: the curl's speed along the crest,
// where the fast sections are, and the breaker height (src/builder/loop.js wavePayload). The wave is Raglan+'s (its shape,
// its steeper section shape, its shortboard riding), driven by that profile instead of random ridges (wave.js
// `ridges.profile`), sized to the breakers, peeling the way you chose.
// The payload comes in the page's hash (#built=<base64 JSON>, so a link carries the wave) or, failing that, from
// localStorage (the last break you dropped into). With neither, a plain Raglan+-like wall at 17 mph.
import raglanPlus from './raglan-plus.js';

const FALLBACK = { v: 1, mode: 'loop', side: 'left', length: 200, base: 7.6, H: 2.1, profile: [{ s: 0, peel: 7.6, k: 0, H: 2.1 }, { s: 200, peel: 7.6, k: 0, H: 2.1 }] };
export const BUILT_KEY = 'rys-rad-waves-built';

export function readBuilt() {
  try {
    const m = typeof location !== 'undefined' && location.hash.match(/built=([^&]+)/);
    if (m) {
      const data = JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(m[1])))));
      try { localStorage.setItem(BUILT_KEY, JSON.stringify(data)); } catch {}
      return data;
    }
  } catch {}
  try { const j = typeof localStorage !== 'undefined' && localStorage.getItem(BUILT_KEY); if (j) return JSON.parse(j); } catch {}
  return FALLBACK;
}
export const encodeBuilt = (data) => encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(data)))));

const wave = { ...raglanPlus, id: 'built', name: 'Your break', hidden: true }; // (hidden: not on the title screen's list)

// Set the wave from a builder payload (at load from the hash / localStorage; tests and a later in-game swap call it too,
// then useWave('built')).
export function applyBuilt(data) {
  delete wave.dir; delete wave.stance;
  Object.assign(wave, {
    built: data,
    // size: the breakers' height against Raglan's (its ~3.5 m face at scale 1.25 is a ~3.5 m breaker), within reason
    scale: raglanPlus.scale * Math.min(1.6, Math.max(0.45, data.H / 3.5)),
    peelSpeed: data.base, // (what trimming holds: the plain wall's pace, wave.js holdPeel)
    ...(data.side === 'right' ? { dir: -1, stance: 'regular' } : {}), // (a right peels the other way; ridden frontside, regular foot)
    ridges: { profile: data.profile, length: data.length, loop: data.mode === 'loop', fast: 1 },
  });
  return wave;
}
applyBuilt(readBuilt());
export default wave;
