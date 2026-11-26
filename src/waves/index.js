// All the waves. Add a wave by adding a file here.
import point from './point.js';
import raglanPlus from './raglan-plus.js';
import built from './built.js';
import reef from './reef.js';
import queens from './queens.js';
import trestles from './trestles.js';
import dynamic from './dynamic.js';

// Every wave is its own design (no mirrored copies: a left is its own wave definition, `dir` says which way it
// peels in the world, and goofy/regular is the surfer's `stance`).
// On the list for now (the user, 2026-11-26): Raglan and Queens free, Pipe with the Wave Pass.
export const WAVES = [point, queens, reef];
// (hidden waves: not on the title screen's list, still reachable by ?wave=: `built` is the wave builder's DROP IN;
// Raglan+, Trestles and Dynamic are off the list for now, still in work)
export const HIDDEN = [built, raglanPlus, trestles, dynamic];
export const waveById = (id) => WAVES.find((w) => w.id === id) || HIDDEN.find((w) => w.id === id)
  // older URLs: ?wave=crumble / ?wave=barrel, ?wave=queensR (Queens's name while it was tried next to the first one),
  // ?wave=peak (Dynamic's first name, Performance Peak)
  || { crumble: point, barrel: reef, queensR: queens, peak: dynamic }[id] || point;
