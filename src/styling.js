// Surfer styling (accounts plan task 16, Pro): the wetsuit's colour, the trunks' (or bikini's) colour, pattern and cut, and
// the board's deck and nose. Kept in profiles.styling as ids from the lists below (the database checks them, and that
// you have Pro), worn in your rides while you have Pro, and carried in each ride's recording, so a replay of your wave
// shows it to anyone. Empty: the game's own look.
export const PALETTE = {
  black: [0.045, 0.047, 0.055], charcoal: [0.2, 0.21, 0.23], white: [0.94, 0.95, 0.96], navy: [0.08, 0.13, 0.32],
  blue: [0.18, 0.4, 0.85], sky: [0.5, 0.76, 0.95], teal: [0.0, 0.66, 0.68], green: [0.16, 0.6, 0.3],
  yellow: [0.98, 0.8, 0.12], orange: [0.98, 0.5, 0.12], red: [0.85, 0.16, 0.18], pink: [1.0, 0.3, 0.58],
  purple: [0.5, 0.3, 0.8], sand: [0.9, 0.82, 0.62],
};
export const PATTERNS = ['solid', 'stripes', 'floral'];
export const PARTS = [['suit', 'Wetsuit'], ['shorts', 'Trunks / Bikini'], ['board', 'Board'], ['nose', 'Nose']];
// The bikini's cut (a female surfer): full (the boy-short), classic (a standard bikini), or cheeky (higher at the back,
// more of the butt showing).
export const CUTS = [['full', 'Full'], ['classic', 'Classic'], ['cheeky', 'Cheeky']];
// Which surfer (free for everyone: profiles.surfer, not styling): null is each wave's own.
export const BODIES = [['guy', 'Male'], ['girl', 'Female']];
export const cleanBody = (b) => (b === 'guy' || b === 'girl' ? b : null);
// Regular (left foot forward) or goofy (right foot forward): free too (profiles.stance); null is each wave's own (frontside).
export const STANCES = [['regular', 'Regular'], ['goofy', 'Goofy']];
export const cleanStance = (s) => (s === 'regular' || s === 'goofy' ? s : null);
export const hex = (rgb) => '#' + rgb.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');

// Only known ids, whatever came in (an old recording, a hand-made link): anything else is the game's own look.
export function cleanStyling(s) {
  const out = {};
  if (!s || typeof s !== 'object') return out;
  for (const [k] of PARTS) if (PALETTE[s[k]]) out[k] = s[k];
  if (PATTERNS.includes(s.pattern) && s.pattern !== 'solid') out.pattern = s.pattern;
  if (s.cut === 'classic' || s.cut === 'cheeky') out.cut = s.cut;
  return out;
}
export const stylingKey = (s) => JSON.stringify(cleanStyling(s));
