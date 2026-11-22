// All the waves. Add a wave by adding a file here.
import point from './point.js';
import raglanPlus from './raglan-plus.js';
import reef from './reef.js';
import queens from './queens.js';
import trestles from './trestles.js';
import dynamic from './dynamic.js';

// Every wave is its own design (no mirrored copies: a left is its own wave definition, `dir` says which way it
// peels in the world, and goofy/regular is the surfer's `stance`).
export const WAVES = [point, raglanPlus, reef, queens, trestles, dynamic];
export const waveById = (id) => WAVES.find((w) => w.id === id)
  // older URLs: ?wave=crumble / ?wave=barrel, ?wave=queensR (Queens's name while it was tried next to the first one),
  // ?wave=peak (Dynamic's first name, Performance Peak)
  || { crumble: point, barrel: reef, queensR: queens, peak: dynamic }[id] || point;
