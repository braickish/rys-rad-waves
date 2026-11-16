// All the waves. Add a wave by adding a file here.
import point from './point.js';
import reef from './reef.js';

// A left-hand version of a wave: the same wave, mirrored when it's drawn
// (the physics is identical; see `left` in main.js / renderer.js).
const leftOf = (w) => ({ ...w, id: `${w.id}-left`, name: `${w.name} (left)`, left: true });

export const WAVES = [point, leftOf(point), reef, leftOf(reef)];
export const waveById = (id) => WAVES.find((w) => w.id === id)
  // older URLs: ?wave=crumble / ?wave=barrel
  || { crumble: point, barrel: reef }[id] || point;
