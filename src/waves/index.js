// All the waves. Add a wave by adding a file here.
import point from './point.js';
import reef from './reef.js';

export const WAVES = [point, reef];
export const waveById = (id) => WAVES.find((w) => w.id === id)
  // older URLs: ?wave=crumble / ?wave=barrel
  || { crumble: point, barrel: reef }[id] || point;
