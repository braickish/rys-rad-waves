// All the waves. Add a wave by adding a file here.
import point from './point.js';
import reef from './reef.js';

// Every wave is its own design (no mirrored copies: a left would be its own
// wave, and goofy/regular is a property of the surfer).
export const WAVES = [point, reef];
export const waveById = (id) => WAVES.find((w) => w.id === id)
  // older URLs: ?wave=crumble / ?wave=barrel
  || { crumble: point, barrel: reef }[id] || point;
