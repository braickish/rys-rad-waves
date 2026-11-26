// The recap's broadcast graphics (accounts plan task 17), drawn on a 2D canvas: the same drawing goes over the game on
// screen and into each frame of the exported video. Three kinds of frame:
//   title  the contest, the heat, the spot (a card in the middle)
//   wave   a lower third (jersey, name, "Wave 2"; the score once the ride's over; "takes the lead") and the heat's
//          standings at the top left, as they stood before this wave
//   end    the result: places, totals, the winner
import { JERSEYS } from './heat.js';

const C = { ink: '#0b1a24', panel: 'rgba(11,26,36,0.82)', yellow: '#ffd426', pink: '#ff3d8b', teal: '#00c2c7', white: '#ffffff', dim: '#9fc1cf' };
const jerseyColor = (id) => JERSEYS.find((j) => j.id === id)?.color || '#888';
const ease = (t) => Math.min(1, Math.max(0, t)) ** 0.5;

function round(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
function text(ctx, s, x, y, size, color, { font = 'Bungee', weight = '400', align = 'left' } = {}) {
  ctx.font = `${weight} ${size}px ${font}, Arial Black, sans-serif`; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'alphabetic'; ctx.fillText(s, x, y);
}

// frame: { kind, t (s into this frame), contest, heat, seg, standings, final, winner, ended (the ride is over) }
export function drawOverlay(ctx, w, h, f) {
  ctx.clearRect(0, 0, w, h);
  if (!f) return;
  const u = Math.min(w, h) / 720; // (sizes are for 720 high; a phone's upright frame scales by its narrow side)
  const pad = 28 * u;
  const heatLabel = f.heat ? (f.heat.final && f.heat.rounds > 1 ? 'The final' : f.heat.final ? 'The heat' : `Round ${f.heat.round} · Heat ${f.heat.number}`) : '';
  if (f.kind === 'title') {
    const a = ease(f.t / 0.5);
    ctx.globalAlpha = a;
    const cw = Math.min(w - 2 * pad, 640 * u), ch = 190 * u, x = (w - cw) / 2, y = (h - ch) / 2;
    ctx.fillStyle = C.panel; round(ctx, x, y, cw, ch, 22 * u); ctx.fill();
    text(ctx, "RY'S RAD WAVES", w / 2, y + 40 * u, 18 * u, C.pink, { align: 'center' });
    text(ctx, f.contest.name, w / 2, y + 100 * u, 40 * u, C.yellow, { align: 'center' });
    text(ctx, `${heatLabel}${f.contest.place ? ' · ' + f.contest.place : ''}`, w / 2, y + 148 * u, 22 * u, C.white, { font: 'Rubik', weight: '700', align: 'center' });
    ctx.globalAlpha = 1;
    return;
  }
  if (f.kind === 'end') {
    const a = ease(f.t / 0.5), rows = f.final || [];
    ctx.globalAlpha = a;
    const cw = Math.min(w - 2 * pad, 600 * u), rh = 54 * u, ch = 130 * u + rows.length * rh, x = (w - cw) / 2, y = Math.max(pad, (h - ch) / 2);
    ctx.fillStyle = C.panel; round(ctx, x, y, cw, ch, 22 * u); ctx.fill();
    text(ctx, f.winner ? `${f.winner.name} wins!` : 'The result', w / 2, y + 62 * u, 38 * u, C.yellow, { align: 'center' });
    text(ctx, `${f.contest.name} · ${heatLabel}`, w / 2, y + 96 * u, 18 * u, C.dim, { font: 'Rubik', weight: '700', align: 'center' });
    rows.forEach((r, i) => {
      const ry = y + 120 * u + i * rh;
      ctx.fillStyle = i === 0 ? 'rgba(0,194,199,0.25)' : 'rgba(255,255,255,0.06)'; round(ctx, x + 18 * u, ry, cw - 36 * u, rh - 8 * u, 10 * u); ctx.fill();
      text(ctx, String(r.place), x + 40 * u, ry + 33 * u, 22 * u, C.yellow);
      ctx.fillStyle = jerseyColor(r.jersey); round(ctx, x + 72 * u, ry + 10 * u, 14 * u, 26 * u, 3 * u); ctx.fill();
      text(ctx, r.name, x + 100 * u, ry + 32 * u, 22 * u, C.white, { font: 'Rubik', weight: '700' });
      text(ctx, r.total.toFixed(2), x + cw - 36 * u, ry + 33 * u, 24 * u, C.yellow, { align: 'right' });
    });
    ctx.globalAlpha = 1;
    return;
  }
  // wave: the standings before it (top left) and the lower third
  const s = f.seg, st = f.standings || [];
  if (st.length) {
    const bw = 300 * u, rh = 30 * u, x = pad, y = pad;
    ctx.fillStyle = C.panel; round(ctx, x, y, bw, 38 * u + st.length * rh, 14 * u); ctx.fill();
    ctx.fillStyle = C.pink; round(ctx, x, y, bw, 34 * u, [14 * u, 14 * u, 0, 0]); ctx.fill();
    text(ctx, heatLabel.toUpperCase(), x + 14 * u, y + 24 * u, 16 * u, C.white);
    st.forEach((r, i) => {
      const ry = y + 38 * u + i * rh, me = r.id === s.entrant;
      if (me) { ctx.fillStyle = 'rgba(0,194,199,0.28)'; ctx.fillRect(x, ry, bw, rh); }
      ctx.fillStyle = jerseyColor(r.jersey); ctx.fillRect(x + 12 * u, ry + 7 * u, 10 * u, 16 * u);
      text(ctx, r.name, x + 32 * u, ry + 21 * u, 16 * u, C.white, { font: 'Rubik', weight: '700' });
      text(ctx, r.total.toFixed(2), x + bw - 14 * u, ry + 22 * u, 17 * u, C.yellow, { align: 'right' });
    });
  }
  if (s) {
    const slide = ease(f.t / 0.4), lw = Math.min(w - 2 * pad, 560 * u), lh = 92 * u, x = pad - (1 - slide) * (lw + pad), y = h - pad - lh;
    ctx.fillStyle = C.panel; round(ctx, x, y, lw, lh, 16 * u); ctx.fill();
    ctx.fillStyle = jerseyColor(s.jersey); round(ctx, x, y, 16 * u, lh, [16 * u, 0, 0, 16 * u]); ctx.fill();
    text(ctx, s.name, x + 36 * u, y + 44 * u, 30 * u, C.white);
    const sub = `Wave ${s.waveNo}${f.ended && s.tookLead ? ' · takes the lead!' : ''}`;
    text(ctx, sub, x + 38 * u, y + 76 * u, 19 * u, f.ended && s.tookLead ? C.yellow : C.dim, { font: 'Rubik', weight: '700' });
    if (f.ended) {
      const a = ease(f.endT / 0.3);
      ctx.globalAlpha = a;
      const sw = 140 * u; ctx.fillStyle = C.yellow; round(ctx, x + lw - sw - 14 * u, y + 14 * u, sw, lh - 28 * u, 12 * u); ctx.fill();
      text(ctx, s.score.toFixed(2), x + lw - 14 * u - sw / 2, y + lh / 2 + 15 * u, 40 * u, C.ink, { align: 'center' });
      ctx.globalAlpha = 1;
    }
  }
}
