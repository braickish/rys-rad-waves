// All the waves. Add a wave by adding a file here.
import point from './point.js';
import reef from './reef.js';
import queens from './queens.js';
import trestles from './trestles.js';
import peak from './peak.js';

// Every wave is its own design (no mirrored copies: a left is its own wave definition, `dir` says which way it
// peels in the world, and goofy/regular is the surfer's `stance`).
export const WAVES = [point, reef, queens, trestles, peak];
export const waveById = (id) => WAVES.find((w) => w.id === id)
  // older URLs: ?wave=crumble / ?wave=barrel, and ?wave=queensR (Queens's name while it was tried next to the first one)
  || { crumble: point, barrel: reef, queensR: queens }[id] || point;
