// Build a Break: the wave builder prototype (the user, 2026-11-22). A live version of the reef "about" card
// (research/reef-generator/about_map.py): a top-down map of the bay, offshore at the top and the beach at the bottom (so
// a right peels to the map's left), depth bands, the reef blocks you drag about (snapping to a 10 m grid, arms snapping
// onto peaks), the swell, crest lines every 5 s, and the curl from the fast break model (rays.js) coloured by time with
// ticks every 5 s, marked where it sections, backs off or closes out. Circles mean "you can drag this": only the blocks'
// handles are circles (the user, 2026-11-22); the curl's time ticks and the break's peak (a diamond) aren't.
import { buildDepth, makeGrid, defaultCoast, BAY, BAY_DEEP_OFF } from './reef.js';
import { traceRays, analyse } from './rays.js';
import { runPE } from './pewave.js';
import { LOOP, curlAt, defaultLoop, clampLoop, loopInfo, snapEnd, bestLoop, wavePayload, takeoffStart } from './loop.js';
import { encodeBuilt, BUILT_KEY } from '../waves/built.js';
import { BLOCKS, SNAP, ARM_ANGLES, ARM_LENGTHS, ARM_SLOPES, BAR_CRESTS, DEPTHS, SIZES, blockLength, ROTATIONS, reefComponents, newBlock, dynamicPreset, beachPreset, armRot, nearestArm } from './blocks.js';

const canvas = document.getElementById('map'), ctx = canvas.getContext('2d');
// Heights and lengths are shown in feet (the user, 2026-11-22); the model works in metres underneath.
const FT = 3.281, ft = (m) => Math.round(m * FT), ft1 = (m) => (m * FT).toFixed(1);
const VIEW = { x0: 600, x1: 1262 }; // (x' shown: the deep water further out is all alike)
const BANDS = [[-50, 0, '#efe2bd'], [0, 1, '#e3f3d9'], [1, 2, '#9fe6d6'], [2, 3, '#5ccfcc'], [3, 4, '#2fb2c2'], [4, 5, '#1d95b0'],
  [5, 6, '#177b9c'], [6, 8, '#136486'], [8, 10, '#10506f'], [10, 13, '#0d3f5b'], [13, 40, '#0b3049']];
const BAND_RGB = BANDS.map(([a, b, c]) => [a, b, parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]);
const COL = { yellow: [255, 212, 38], pink: [255, 61, 139], red: '#ff4b4b' };

// (reef designs start on deep offshore water: the reef rises out of deep water close in, so it works from small swells to big
// ones; on the research site's shallow shelf a big swell closed out across the bay. The beach break keeps the gentle shelf.)
const reefCoast = () => Object.assign(defaultCoast(), { deep: true });
const state = { blocks: dynamicPreset(), coast: reefCoast(), sel: null, swell: { H: 1.6, T: 15, dir: 0 }, grid: null, rays: null, wave: null, dirty: true, ms: 0,
  loop: { on: false, side: 'right', a: null, b: null, info: null }, hover: null, board: 'shortboard' }; // (loop: a stretch of one side to surf on repeat, loop.js)
let view = null; // the map's placement on the canvas
const depthImg = document.createElement('canvas');

// ---- the model ----
function recompute() {
  const t0 = performance.now();
  state.grid = buildDepth(reefComponents(state.blocks, !!state.coast.deep), makeGrid(state.coast.deep ? { ...BAY, offDepth: BAY_DEEP_OFF } : BAY), state.coast); // (deep offshore water: a deeper bay and shelf)
  state.rays = traceRays(state.grid, state.swell);
  state.wave = analyse(state.rays, state.grid);
  state.ms = performance.now() - t0;
  state.peMs = null; scheduleRefine();
  fitLoop();
  save();
  paintDepth();
  state.dirty = false;
  showResults();
}
// Keep the loop on the ride as the wave changes (a new stretch if it has none, or it no longer fits).
// The design is remembered (in this browser) so coming back from riding it finds it as you left it.
const SAVE_KEY = 'rys-rad-waves-builder';
function save() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify({ blocks: state.blocks, coast: state.coast, swell: state.swell, board: state.board, loop: { on: state.loop.on, side: state.loop.side, a: state.loop.a, b: state.loop.b }})); } catch {}
}
function restore() {
  try {
    const j = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); if (!j || !Array.isArray(j.blocks)) return;
    state.blocks = j.blocks; if (j.coast && Array.isArray(j.coast.pts)) state.coast = j.coast; if (j.board) state.board = j.board; Object.assign(state.swell, j.swell || {}); Object.assign(state.loop, j.loop || {}); 
  } catch {}
}
function fitLoop() {
  const L = state.loop, side = state.wave && state.wave[L.side];
  L.info = null;
  if (!L.on || !side) return;
  let st = L.a == null ? defaultLoop(side) : clampLoop(side, L.a, L.b);
  if (!st) st = defaultLoop(side);
  if (!st) { L.a = L.b = null; return; }
  L.a = st.a; L.b = st.b; L.info = loopInfo(side, L.a, L.b);
}
function paintDepth() {
  // (drawn at 2x the grid with the depth interpolated between cells, so the bands' edges are smooth, not 4 m steps)
  const { M, N, depth } = state.grid, U = 2, w = N * U, h = M * U;
  depthImg.width = w; depthImg.height = h;
  const c = depthImg.getContext('2d'), im = c.createImageData(w, h);
  for (let r = 0; r < h; r++) {
    const fi = Math.min(M - 1.001, Math.max(0, (r + 0.5) / U - 0.5)), i = Math.floor(fi), ti = fi - i;
    for (let q = 0; q < w; q++) {
      const fj = Math.min(N - 1.001, Math.max(0, (q + 0.5) / U - 0.5)), j = Math.floor(fj), tj = fj - j;
      const d = (depth[j * M + i] * (1 - ti) + depth[j * M + i + 1] * ti) * (1 - tj) + (depth[(j + 1) * M + i] * (1 - ti) + depth[(j + 1) * M + i + 1] * ti) * tj;
      const b = BAND_RGB.find((z) => d >= z[0] && d < z[1]) || BAND_RGB[BAND_RGB.length - 1];
      const p = (r * w + q) * 4; im.data[p] = b[2]; im.data[p + 1] = b[3]; im.data[p + 2] = b[4]; im.data[p + 3] = 255;
    }
  }
  c.putImageData(im, 0, 0);
}

// ---- view ----
function layout() {
  const dpr = window.devicePixelRatio || 1, r = canvas.getBoundingClientRect();
  canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const g = state.grid || makeGrid(), Y0 = g.view.y0, Y1 = g.view.y1; // (the map shows `view`; the model runs wider)
  const pad = 14, w = r.width - 2 * pad, h = r.height - 2 * pad - 30 - 44; // (30 above for the swell, 44 below for the scale and the zoom buttons)
  const S = Math.min(w / (Y1 - Y0), h / (VIEW.x1 - VIEW.x0));
  const z = view ? view.z : 1, panX = view ? view.panX : 0, panY = view ? view.panY : 0;
  view = { S, Y0, Y1, left: pad + (w - (Y1 - Y0) * S) / 2, top: pad + 30 + (h - (VIEW.x1 - VIEW.x0) * S) / 2, W: r.width, H: r.height, z, panX, panY };
  view.mw = (Y1 - Y0) * S; view.mh = (VIEW.x1 - VIEW.x0) * S;
  clampPan();
}
// Zoom (the user, 2026-11-22): `z` x about the map's middle, then panned by (panX, panY) screen px; handles, labels and
// line widths keep their size on screen.
const bx = (y) => view.left + (y - view.Y0) * view.S, by = (x) => view.top + (x - VIEW.x0) * view.S;
const px = (y) => view.left + view.mw / 2 + (bx(y) - view.left - view.mw / 2) * view.z - view.panX;
const py = (x) => view.top + view.mh / 2 + (by(x) - view.top - view.mh / 2) * view.z - view.panY;
const toReef = (cx, cy) => {
  const ux = (cx + view.panX - view.left - view.mw / 2) / view.z + view.mw / 2, uy = (cy + view.panY - view.top - view.mh / 2) / view.z + view.mh / 2;
  return { x: VIEW.x0 + uy / view.S, y: view.Y0 + ux / view.S };
};
function clampPan() { // (the zoomed map always covers its frame)
  const mx = view.mw * (view.z - 1) / 2, my = view.mh * (view.z - 1) / 2;
  view.panX = Math.min(mx, Math.max(-mx, view.panX)); view.panY = Math.min(my, Math.max(-my, view.panY));
}
function zoomAt(cx, cy, factor) { // (keep the reef spot under (cx, cy) where it is)
  const before = toReef(cx, cy);
  view.z = Math.min(6, Math.max(1, view.z * factor));
  const ax = px(before.y), ay = py(before.x);
  view.panX += ax - cx; view.panY += ay - cy; clampPan(); draw();
}
const snap = (v) => Math.round(v / SNAP) * SNAP;
// How it breaks, as a colour: crumbly mint -> steep yellow -> pitching orange -> barrelling violet, by xi0 (rays.js BREAK_TYPES)
const XI_STOPS = [[0.3, [189, 245, 230]], [0.7, [255, 212, 38]], [1.2, [255, 122, 47]], [1.8, [193, 59, 255]]];
function xiColor(xi) {
  if (!isFinite(xi)) return 'rgba(255,255,255,.6)';
  if (xi <= XI_STOPS[0][0]) return lerpCol(XI_STOPS[0][1], XI_STOPS[0][1], 0);
  for (let i = 1; i < XI_STOPS.length; i++) if (xi <= XI_STOPS[i][0]) return lerpCol(XI_STOPS[i - 1][1], XI_STOPS[i][1], (xi - XI_STOPS[i - 1][0]) / (XI_STOPS[i][0] - XI_STOPS[i - 1][0]));
  return lerpCol(XI_STOPS[3][1], XI_STOPS[3][1], 0);
}
const lerpCol = (a, b, f) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * f)).join(',')})`;

function draw() {
  if (!view) layout();
  const { S } = view, g = state.grid;
  ctx.clearRect(0, 0, view.W, view.H);
  const mw = (view.Y1 - view.Y0) * S, mh = (VIEW.x1 - VIEW.x0) * S;
  ctx.save();
  roundRect(view.left, view.top, mw, mh, 12); ctx.clip();
  // depth bands (the grid image, cropped to the view)
  const i0 = (VIEW.x0 - g.x0) / g.dx, iN = (VIEW.x1 - VIEW.x0) / g.dx;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(depthImg, (view.Y0 - g.y0) / g.dx * 2, i0 * 2, (view.Y1 - view.Y0) / g.dx * 2, iN * 2, px(view.Y0), py(VIEW.x0), mw * view.z, mh * view.z);
  // crest lines every 5 s (only the bit still unbroken)
  ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1.2;
  for (const c of state.rays.crests) {
    ctx.beginPath(); let pen = false;
    for (let r = 0; r < c.x.length; r++) {
      if (!c.alive[r] || c.x[r] < VIEW.x0) { pen = false; continue; }
      const X = px(c.y[r]), Y = py(c.x[r]);
      if (pen) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); pen = true;
    }
    ctx.stroke();
  }
  // the curl, each way from the peak
  const w = state.wave;
  if (w && state.loop.info) drawLoopBand();
  if (w) for (const side of ['right', 'left']) drawCurl(w[side].curl);
  // blocks
  for (const b of state.blocks) drawBlock(b);
  drawCoast();
  if (w && state.loop.info) drawLoopHandles();
  // where it first breaks (the takeoff): computed, so a diamond, not a circle; always shown (the user, 2026-11-22: it came and
  // went), drawn over the handles, and nudged just above a handle it would sit on (it usually starts right at the Peak)
  if (w) {
    const X = px(w.peak.y), Y = py(w.peak.x);
    const onHandle = state.blocks.some((b) => { const h = handle(b); return Math.hypot(px(h.y) - X, py(h.x) - Y) < 14; });
    if (onHandle) { ctx.strokeStyle = '#ffd426'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(X, Y - 6); ctx.lineTo(X, Y - 12); ctx.stroke(); }
    diamond(X, onHandle ? Y - 19 : Y, 7);
  }
  // labels: beach, swell
  ctx.restore();
  ctx.font = '700 13px Rubik'; ctx.textAlign = 'center'; ctx.fillStyle = '#8a6a2a';
  { const yb = (state.coast.pts[2][1] + state.coast.pts[3][1]) / 2, xb = (state.coast.pts[2][0] + state.coast.pts[3][0]) / 2 + 9, bxp = px(yb), byp = py(xb); if (byp < view.top + mh - 2 && bxp > view.left && bxp < view.left + mw) ctx.fillText('BEACH', bxp, byp); } // (on the sand, between two coastline handles; moves with the zoom)
  drawSwell(view.left + mw / 2, view.top - 14);
  // scale bar
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; const sx = view.left + 6, sy = view.top + mh + 24;
  const sm = [500, 200, 100, 50, 20].find((f) => f / FT * S * view.z <= 170) || 20, sl = sm / FT * S * view.z; // (a round length in feet that fits, as you zoom)
  ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + sl, sy); ctx.moveTo(sx, sy - 5); ctx.lineTo(sx, sy + 5); ctx.moveTo(sx + sl, sy - 5); ctx.lineTo(sx + sl, sy + 5); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.font = '500 12px Rubik'; ctx.fillText(`${sm} ft`, sx + sl + 8, sy + 4);
}
function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function diamond(x, y, r) {
  ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath();
  ctx.fillStyle = '#ffd426'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = '#0b1a24'; ctx.stroke();
}
function dot(x, y, r, fill, stroke, lw = 2) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); if (stroke) { ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.stroke(); } }

function drawCurl(curl) {
  if (curl.length < 2) return;
  ctx.lineCap = 'round';
  // a thin dark casing under the whole line first, so its colour reads against the teal reef
  ctx.strokeStyle = 'rgba(11,26,36,.75)'; ctx.lineWidth = 8.5; ctx.setLineDash([]);
  ctx.beginPath(); curl.forEach((p, k) => (k ? ctx.lineTo(px(p.y), py(p.x)) : ctx.moveTo(px(p.y), py(p.x)))); ctx.stroke();
  let run = 0; // (how far along the line, px: the dashes carry on from segment to segment instead of restarting on each)
  for (let k = 1; k < curl.length; k++) {
    const a = curl[k - 1], b = curl[k], X0 = px(a.y), Y0 = py(a.x), X1 = px(b.y), Y1 = py(b.x);
    ctx.setLineDash([]); ctx.shadowBlur = 0; ctx.lineDashOffset = -run; run += Math.hypot(X1 - X0, Y1 - Y0);
    // (the curl coloured by how it breaks everywhere, the user, 2026-11-22; a closeout dashed in that colour, a fast section
    // thicker and glowing; backing off has no mark of its own)
    ctx.strokeStyle = xiColor((a.xi + b.xi) / 2); ctx.lineWidth = b.kind === 'section' ? 7.5 : 5;
    if (b.kind === 'closeout') ctx.setLineDash([7, 6]);
    else if (b.kind === 'section') { ctx.shadowColor = 'rgba(255,255,255,.9)'; ctx.shadowBlur = 10; }
    ctx.beginPath(); ctx.moveTo(X0, Y0); ctx.lineTo(X1, Y1); ctx.stroke();
  }
  ctx.setLineDash([]); ctx.shadowBlur = 0; ctx.lineDashOffset = 0;
}
// The loop: a wide teal band under its stretch of the curl, round handles at each end (you drag them along the curl).
function loopPath(a, b) { const c = state.wave[state.loop.side].curl, pts = [curlAt(c, a)]; for (const p of c) if (p.s > a && p.s < b) pts.push(p); pts.push(curlAt(c, b)); return pts; }
function drawLoopBand() {
  const L = state.loop, pts = loopPath(L.a, L.b);
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // (dark under a bright edge: the reef's own colours are teal, so a teal band disappeared on it; amber edge = rough seam)
  const path = () => { ctx.beginPath(); pts.forEach((p, k) => (k ? ctx.lineTo(px(p.y), py(p.x)) : ctx.moveTo(px(p.y), py(p.x)))); };
  ctx.strokeStyle = L.info.seam.ok ? '#00c2c7' : '#ffaa28'; ctx.lineWidth = 28; path(); ctx.stroke();
  ctx.strokeStyle = 'rgba(11,34,51,.82)'; ctx.lineWidth = 23; path(); ctx.stroke();
  ctx.restore();
}
function loopEnds() { const L = state.loop, c = state.wave[L.side].curl; return [curlAt(c, L.a), curlAt(c, L.b)]; }
function drawLoopHandles() {
  const L = state.loop, [A, B] = loopEnds();
  for (const p of [A, B]) dot(px(p.y), py(p.x), 7, '#00c2c7', '#0b1a24', 2.5);
  const out = L.side === 'right' ? -1 : 1, lx = px(B.y) + out * 14, ly = py(B.x) + 24; // (by the far end, clear of the arm's label)
  ctx.font = '400 13px Bungee'; ctx.textAlign = 'center'; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(11,26,36,.9)'; ctx.fillStyle = '#00c2c7';
  const txt = `↻ LOOP ${ft(L.info.length)} ft`; ctx.strokeText(txt, lx, ly); ctx.fillText(txt, lx, ly);
}
function drawSwell(cx, cy) {
  const a = state.swell.dir * Math.PI / 180; // (the swell's heading on the map: straight down, turned the way the waves travel: rays.js th0 = -dir, + toward +y' (the map's right) for a negative dir; canvas rotations turn clockwise. It was the wrong way round: the user, 2026-11-22)
  ctx.save(); ctx.translate(cx - 70, cy); ctx.rotate(a);
  ctx.fillStyle = '#eaf6fa'; ctx.beginPath(); ctx.moveTo(-6, -12); ctx.lineTo(6, -12); ctx.lineTo(6, 2); ctx.lineTo(12, 2); ctx.lineTo(0, 14); ctx.lineTo(-12, 2); ctx.lineTo(-6, 2); ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.font = '400 15px Bungee'; ctx.fillStyle = '#fff'; ctx.textAlign = 'left';
  ctx.fillText(`SWELL ${ft1(state.swell.H)} ft · ${state.swell.T} s${state.swell.dir ? ` · ${state.swell.dir > 0 ? '+' : ''}${state.swell.dir}°` : ''}`, cx - 50, cy + 6);
}
function blockLabel(b) {
  if (b.type === 'arm') return `${b.side < 0 ? 'RIGHT' : 'LEFT'} ARM ${b.angle}°`;
  if (b.type === 'ledge') return `LEDGE ${b.angle}°`;
  return BLOCKS[b.type].label.toUpperCase();
}
// Where a block's handle sits: arms and ledges at their far end, on their line (their start is often on a peak, which has
// its own handle there), everything else at its position.
function handle(b) {
  if (b.type !== 'arm' && b.type !== 'ledge') return { x: b.x, y: b.y };
  // (on the feature, the user, 2026-11-22: at the arm's far end, on its line; its start is the peak's own handle)
  const a = b.angle * Math.PI / 180, L = blockLength(b);
  return { x: b.x + Math.sin(a) * L, y: b.y + b.side * Math.cos(a) * L };
}
// The coastline's handles (plan step 5): round, on the waterline; you drag them in and out. Its name shows on hover.
function drawCoast() {
  const on = state.hover === 'coast' || (drag && drag.coast != null);
  for (const [x, y] of state.coast.pts) dot(px(y), py(x), on ? 7 : 6, '#efe2bd', '#0b1a24', 2);
  if (on) { const [x, y] = state.coast.pts[2]; ctx.font = '400 12px Bungee'; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(11,26,36,.8)'; ctx.fillStyle = '#efe2bd'; ctx.strokeText('COASTLINE', px(y), py(x) - 14); ctx.fillText('COASTLINE', px(y), py(x) - 14); }
}
function hitCoast(cx, cy) { let best = -1, bd = 14; state.coast.pts.forEach(([x, y], k) => { const d = Math.hypot(px(y) - cx, py(x) - cy); if (d < bd) { bd = d; best = k; } }); return best; }
function drawBlock(b) {
  const X = px(b.y), Y = py(b.x), on = state.sel === b, hov = state.hover === b, show = on || hov;
  // its shape and name only when selected or under the pointer (the user: they covered the curl's colours)
  ctx.lineWidth = on ? 2.5 : 1.5; ctx.strokeStyle = on ? '#ffd426' : 'rgba(255,255,255,.7)'; ctx.setLineDash(on ? [] : [4, 4]);
  if (!show) { /* just the handle */ }
  else if (b.type === 'arm' || b.type === 'ledge') {
    const a = b.angle * Math.PI / 180, L = blockLength(b);
    const ex = b.x + Math.sin(a) * L, ey = b.y + b.side * Math.cos(a) * L;
    ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(px(ey), py(ex)); ctx.stroke();
  } else if (b.type === 'ridge' || b.type === 'channel' || b.type === 'sandbar') {
    const r = b.rot * Math.PI / 180, h = blockLength(b) / 2, ux = Math.cos(r), uy = Math.sin(r);
    ctx.beginPath(); ctx.moveTo(px(b.y - uy * h), py(b.x - ux * h)); ctx.lineTo(px(b.y + uy * h), py(b.x + ux * h)); ctx.stroke();
  }
  ctx.setLineDash([]);
  const hp = handle(b), HX = px(hp.y), HY = py(hp.x);
  dot(HX, HY, on ? 8 : 6, on ? '#ffd426' : '#fff', '#0b1a24', 2);
  if (!show) return;
  ctx.font = '400 12px Bungee'; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(11,26,36,.8)'; ctx.fillStyle = on ? '#ffd426' : '#fff';
  let lx = HX, ly = HY - 14;
  if (b.type === 'arm' || b.type === 'ledge') { lx = HX + b.side * 14; ly = HY + 4; ctx.textAlign = b.side < 0 ? 'right' : 'left'; } // (out to the side)
  ctx.strokeText(blockLabel(b), lx, ly); ctx.fillText(blockLabel(b), lx, ly);
}

// ---- interaction ----
let drag = null;
function hit(cx, cy) {
  let best = null, bd = 16;
  for (const b of state.blocks) { const h = handle(b), d = Math.hypot(px(h.y) - cx, py(h.x) - cy); if (d < bd) { bd = d; best = b; } }
  return best;
}
function hitLoop(cx, cy) {
  if (!state.loop.info) return null;
  const [A, B] = loopEnds();
  if (Math.hypot(px(A.y) - cx, py(A.x) - cy) < 14) return 'a';
  if (Math.hypot(px(B.y) - cx, py(B.x) - cy) < 14) return 'b';
  return null;
}
// Zoom and pan (the user, 2026-11-22): the wheel (and a trackpad pinch) zooms about the pointer; two fingers pinch; drag the
// water (not a handle) to pan.
const pointers = new Map(); let pinch = null;
const local = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
canvas.addEventListener('wheel', (e) => { e.preventDefault(); const p = local(e); zoomAt(p.x, p.y, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015))); }, { passive: false });
canvas.addEventListener('pointerdown', (e) => {
  pointers.set(e.pointerId, local(e));
  if (pointers.size === 2) { // (a second finger: pinch, dropping whatever the first one was dragging)
    const [a, b] = [...pointers.values()];
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) }; drag = null; canvas.setPointerCapture(e.pointerId); return;
  }
  const r0 = canvas.getBoundingClientRect(), lh = hitLoop(e.clientX - r0.left, e.clientY - r0.top);
  if (lh) { drag = { loop: lh }; canvas.setPointerCapture(e.pointerId); return; }
  { const r1 = canvas.getBoundingClientRect(), ck = hitCoast(e.clientX - r1.left, e.clientY - r1.top); if (ck >= 0 && !hit(e.clientX - r1.left, e.clientY - r1.top)) { drag = { coast: ck }; state.sel = null; showSel(); canvas.setPointerCapture(e.pointerId); return; } }
  const r = canvas.getBoundingClientRect(), cx = e.clientX - r.left, cy = e.clientY - r.top, b = hit(cx, cy);
  state.sel = b; showSel();
  if (b) {
    const p = toReef(cx, cy);
    // a peak drags the arms attached to it
    const kids = b.type === 'peak' ? state.blocks.filter((q) => q !== b && (q.type === 'arm' || q.type === 'ledge') && q.x === b.x && q.y === b.y) : [];
    drag = { b, dx: b.x - p.x, dy: b.y - p.y, kids };
    canvas.setPointerCapture(e.pointerId);
  } else { drag = { pan: true, sx: cx, sy: cy, px0: view.panX, py0: view.panY }; canvas.setPointerCapture(e.pointerId); } // (the water: pan)
  draw();
});
canvas.addEventListener('pointermove', (e) => {
  const r = canvas.getBoundingClientRect(), cx = e.clientX - r.left, cy = e.clientY - r.top;
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: cx, y: cy });
  if (pinch && pointers.size >= 2) {
    const [a, b] = [...pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
    zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / Math.max(1, pinch.d)); pinch.d = d; return;
  }
  if (drag && drag.coast != null) { // (a coastline handle: in and out only, 10 m snap, kept inside the bay)
    const p = toReef(cx, cy), nx = Math.min(1240, Math.max(700, snap(p.x)));
    if (nx !== state.coast.pts[drag.coast][0]) { state.coast.pts[drag.coast][0] = nx; state.dirty = true; schedule(); }
    return;
  }
  if (drag && drag.pan) { view.panX = drag.px0 - (cx - drag.sx); view.panY = drag.py0 - (cy - drag.sy); clampPan(); draw(); return; }
  if (!drag) { const h = hit(cx, cy) || (hitCoast(cx, cy) >= 0 ? 'coast' : null); canvas.style.cursor = h || hitLoop(cx, cy) || view.z > 1 ? 'grab' : 'default'; if (h !== state.hover) { state.hover = h; draw(); } return; }
  if (drag.loop) { // (a loop end: to the nearest spot on the curl, 10 m snap, the loop at least LOOP.min long, inside the ride)
    const L = state.loop, side = state.wave[L.side];
    let best = null; for (let s = 0; s <= side.ride; s += 2) { const q = curlAt(side.curl, s), d = Math.hypot(px(q.y) - cx, py(q.x) - cy); if (!best || d < best.d) best = { s, d }; }
    // (snaps to a nearby spot where the seam is smooth: the end matching the start, loop.js snapEnd)
    const sn = snapEnd(side, drag.loop, best.s, drag.loop === 'a' ? L.b : L.a);
    if (drag.loop === 'a') L.a = sn.s; else L.b = sn.s;
    L.info = loopInfo(side, L.a, L.b); save(); showRide(); draw(); return;
  }
  const p = toReef(cx, cy), b = drag.b;
  let nx = snap(p.x + drag.dx), ny = snap(p.y + drag.dy);
  nx = Math.min(VIEW.x1 - 40, Math.max(VIEW.x0 + 20, nx)); ny = Math.min(view.Y1 - 20, Math.max(view.Y0 + 20, ny));
  // arms and ledges snap onto a nearby peak, on the side you're dragging toward
  if (b.type === 'arm') {
    const pk = state.blocks.find((q) => q.type === 'peak' && Math.hypot(q.x - nx, q.y - ny) < 40);
    if (pk) { b.side = p.y < pk.y ? -1 : 1; nx = pk.x; ny = pk.y; } // (the side you're dragging toward)
  }
  // ridges snap onto an arm, lined up along it
  if (b.type === 'ridge') {
    const on = nearestArm(state.blocks, nx, ny);
    if (on) { b.rot = armRot(on.arm); nx = Math.round(on.x); ny = Math.round(on.y); if (state.sel === b) showSel(); }
  }
  if (nx !== b.x || ny !== b.y) {
    for (const k of drag.kids) { k.x += nx - b.x; k.y += ny - b.y; }
    b.x = nx; b.y = ny; state.dirty = true; schedule();
  }
});
const endDrag = (e) => { pointers.delete(e.pointerId); if (pointers.size < 2) pinch = null; drag = null; };
canvas.addEventListener('pointerleave', () => { if (state.hover) { state.hover = null; draw(); } });
canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag);

let queued = false;
// The height model (pewave.js, ~0.3 s) refines the wave once you stop changing it: heights, where the set waves break and
// how it breaks (plan step 4). While you drag, the rays alone keep the curl live.
let refineTimer = null;
function scheduleRefine() { clearTimeout(refineTimer); refineTimer = setTimeout(() => { if (drag) return scheduleRefine(); refine(); }, 300); }
function refine() {
  if (!state.rays || (state.wave && state.wave.right && state.wave.right.refined)) return;
  const t0 = performance.now();
  const pe = runPE(state.grid, state.swell);
  state.wave = analyse(state.rays, state.grid, { pe });
  state.peMs = performance.now() - t0;
  fitLoop(); showResults(); draw();
}
function schedule() { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; if (state.dirty) recompute(); draw(); }); }

// ---- panel ----
const $ = (id) => document.getElementById(id);
for (const type of Object.keys(BLOCKS)) {
  const btn = document.createElement('button'); btn.className = 'add'; btn.textContent = BLOCKS[type].label;
  btn.onclick = () => {
    // a new block lands somewhere sensible: an arm on the first peak, otherwise near the middle of the reef
    const pk = state.blocks.find((q) => q.type === 'peak');
    let b;
    if (type === 'arm' && pk) b = Object.assign(newBlock('arm', pk.x, pk.y), { side: state.blocks.some((q) => q.type === 'arm' && q.side < 0 && q.x === pk.x) ? 1 : -1 });
    else if (type === 'ridge' && state.blocks.some((q) => q.type === 'arm')) { // (onto the middle of an arm, lined up with it)
      const a = state.blocks.find((q) => q.type === 'arm'), r = a.angle * Math.PI / 180, L = blockLength(a) * 0.55;
      b = Object.assign(newBlock('ridge', Math.round(a.x + Math.sin(r) * L), Math.round(a.y + a.side * Math.cos(r) * L)), { rot: armRot(a) });
    } else b = newBlock(type, snap(type === 'channel' ? 950 : type === 'sandbar' ? 1040 : 900), snap((view.Y0 + view.Y1) / 2 + (Math.random() - 0.5) * 120)); // (a sandbar near the beach, in ~3 m of water)
    state.blocks.push(b); state.sel = b; state.dirty = true; showSel(); schedule();
  };
  $('palette').appendChild(btn);
}
function opt(label, values, cur, fmt, set) {
  const wrap = document.createElement('div'); wrap.className = 'row'; wrap.style.alignItems = 'center';
  const l = document.createElement('span'); l.textContent = label; l.style.cssText = 'font-size:13px;color:var(--dim);width:70px';
  wrap.appendChild(l);
  for (const v of values) {
    const b = document.createElement('button'); b.textContent = fmt(v); if (v === cur) b.className = 'on';
    b.onclick = () => { set(v); state.dirty = true; showSel(); schedule(); };
    wrap.appendChild(b);
  }
  return wrap;
}
function showSel() {
  const el = $('sel'); el.innerHTML = '';
  const b = state.sel; if (!b) { el.innerHTML = '<div class="note">Tap a block on the map to move or change it.</div>'; return; }
  const h = document.createElement('h2'); h.textContent = blockLabel(b); el.appendChild(h);
  const p = document.createElement('div'); p.className = 'blurb'; p.textContent = BLOCKS[b.type].blurb; el.appendChild(p);
  if (b.type === 'arm' || b.type === 'ledge') {
    el.appendChild(opt('Side', [-1, 1], b.side, (v) => (v < 0 ? 'Right' : 'Left'), (v) => { b.side = v; }));
    el.appendChild(opt('Angle', ARM_ANGLES, b.angle, (v) => `${v}°`, (v) => { b.angle = v; }));
  }
  if (b.type === 'arm') el.appendChild(opt('Length', ARM_LENGTHS, b.length, (v) => `${ft(v * (b.size || 1))} ft`, (v) => { b.length = v; }));
  if (b.type === 'arm' || b.type === 'peak') el.appendChild(opt('Slope', ARM_SLOPES.map(([g]) => g), b.slope || '1:10', (v) => ARM_SLOPES.find(([g]) => g === v)[1], (v) => { b.slope = v; }));
  if (b.type === 'ridge' || b.type === 'channel' || b.type === 'sandbar') {
    el.appendChild(opt('Turn', ROTATIONS, b.rot, (v) => `${v}°`, (v) => { b.rot = v; }));
    el.appendChild(opt('Length', b.type === 'ridge' ? [50, 80, 120] : b.type === 'sandbar' ? [100, 160, 240] : [140, 220, 320], b.length, (v) => `${ft(v * (b.size || 1))} ft`, (v) => { b.length = v; }));
  }
  el.appendChild(opt('Size', SIZES.map(([z]) => z), b.size || 1, (v) => SIZES.find(([z]) => z === v)[1], (v) => { b.size = v; if (b.type === 'peak') for (const q of state.blocks) if ((q.type === 'arm' || q.type === 'ledge') && q.x === b.x && q.y === b.y) q.size = v; })); // (a peak's size goes to its arms too)
  if (b.type !== 'sandbar') el.appendChild(opt('Depth', DEPTHS.map(([f]) => f), b.depth || 1, (v) => DEPTHS.find(([f]) => f === v)[1], (v) => { b.depth = v; })); // (deeper reefs for big swells)
  if (b.type === 'sandbar') el.appendChild(opt('Crest', BAR_CRESTS.map(([d]) => d), b.crest, (v) => BAR_CRESTS.find(([d]) => d === v)[1], (v) => { b.crest = v; }));
  const del = document.createElement('button'); del.className = 'danger'; del.textContent = 'Remove'; del.style.marginTop = '8px';
  del.onclick = () => { state.blocks = state.blocks.filter((q) => q !== b); state.sel = null; state.dirty = true; showSel(); schedule(); };
  el.appendChild(del);
}
const mph = (v) => (v * 2.237).toFixed(0);
function rideStretch() { // (what DROP IN rides: the loop, or the whole ride from just past the peak)
  const L = state.loop, side = state.wave && state.wave[L.side];
  if (!side) return null;
  if (L.on) return L.info ? { a: L.a, b: L.b } : null;
  return takeoffStart(side); // (from where the curl can be followed: past an at-once peak, loop.js)
}
function dropIn() {
  if (state.dirty) recompute();
  clearTimeout(refineTimer); refine(); // (the wave you ride is always the refined one)
  const L = state.loop, st = rideStretch(); if (!st) return;
  const data = wavePayload(state.wave[L.side], L.side, L.on ? 'loop' : 'full', st.a, st.b, state.swell, state.board);
  try { localStorage.setItem(BUILT_KEY, JSON.stringify(data)); } catch {}
  save();
  location.href = `index.html?wave=built&play#built=${encodeBuilt(data)}`;
}
function showRide() {
  const el = $('ride'), L = state.loop; el.innerHTML = '';
  const row = (items) => { const r = document.createElement('div'); r.className = 'row'; r.style.marginTop = '8px'; items.forEach((i) => r.appendChild(i)); el.appendChild(r); return r; };
  const btn = (label, on, fn, cls = '') => { const b = document.createElement('button'); b.textContent = label; b.className = (on ? 'on ' : '') + cls; b.onclick = fn; return b; };
  row([btn('Full ride', !L.on, () => { L.on = false; fitLoop(); save(); showRide(); draw(); }), btn('↻ Loop', L.on, () => { L.on = true; fitLoop(); save(); showRide(); draw(); })]).style.marginTop = '0';
  row(['right', 'left'].map((sd) => btn(sd === 'right' ? 'Right' : 'Left', L.side === sd, () => { L.side = sd; L.a = L.b = null; fitLoop(); save(); showRide(); draw(); })));
  const note = document.createElement('div'); note.className = 'note'; note.style.marginTop = '8px'; el.appendChild(note);
  const side = state.wave && state.wave[L.side];
  if (!L.on) {
    note.textContent = side && rideStretch() ? `The whole ${L.side}, from the takeoff until it ends (${ft(side.ride)} ft). Or loop your favourite stretch to surf it forever, like Queens or Raglan.` : '';
  } else {
    const I = L.info;
    if (!I) note.innerHTML = `<span class="bad">The ${L.side} is too short to loop (it needs ${ft(LOOP.min + 2 * LOOP.edge)} ft).</span>`;
    else {
      note.innerHTML = `Drag the round ends along the curl (they snap to where the seam is smooth).<br><b style="color:var(--text)">${ft(I.length)} ft · ${I.seconds.toFixed(0)} s a lap</b>`
        + ` · curl ${mph(I.vMin) === mph(I.vMax) ? mph(I.vMin) : `${mph(I.vMin)}–${mph(I.vMax)}`} mph along the reef · ${I.sections ? `${I.sections} fast section${I.sections > 1 ? 's' : ''}` : 'no sections'}<br>`
        + (I.closes ? '<span class="bad">It closes out inside the loop.</span> ' : '')
        + (I.seam.ok ? '<span style="color:var(--teal)">Seam: smooth</span> (the end runs back into the start)'
          : `<span style="color:#ffaa28">Seam: rough</span>: the end is ${(Math.max(I.seam.dv, I.seam.dH) * 100).toFixed(0)}% off the start in ${I.seam.dv > LOOP.seamSpeed ? 'speed' : 'height'}; it'll be blended, but try Best loop`);
      row([btn('★ Best loop', false, () => { const bl = bestLoop(side); if (bl) { L.a = bl.a; L.b = bl.b; L.info = loopInfo(side, L.a, L.b); save(); showRide(); draw(); } else { note.innerHTML += '<br><span class="bad">No stretch here has a smooth seam.</span>'; } })]);
    }
  }
  // the board (the user, 2026-11-22): a gun for big waves, suggested from ~10 ft
  const big = side && side.H * 3.281 >= 10;
  const br = row([btn('Shortboard', state.board === 'shortboard', () => { state.board = 'shortboard'; save(); showRide(); }), btn('Gun', state.board === 'gun', () => { state.board = 'gun'; save(); showRide(); })]);
  br.insertBefore(Object.assign(document.createElement('span'), { textContent: 'Board', style: 'font-size:13px;color:var(--dim);width:70px;align-self:center' }), br.firstChild);
  if (big && state.board !== 'gun') { const n = document.createElement('div'); n.className = 'note'; n.style.marginTop = '4px'; n.textContent = `These are ~${ft(side.H)} ft waves: a gun holds the speed they need.`; el.appendChild(n); }
  const go = btn('DROP IN', false, dropIn, 'go'); go.disabled = !rideStretch();
  const r = row([go]); r.style.marginTop = '12px';
}
function showResults() {
  const w = state.wave, el = $('res');
  if (!w) { el.innerHTML = '<span class="bad">Nothing breaks: the swell rolls in to the beach.</span>'; return; }
  const line = (name, s) => {
    if (!s || s.ride < 20 || !isFinite(s.peelAll)) return `<div><span class="side">${name}</span> <span class="bad">no ride: it ${s ? s.end : 'never breaks'}</span></div>`; // (a side that closes out straight away has no peel to show)
    const bad = s.bandAll === 'closeout' ? ' bad' : '';
    return `<div><span class="side">${name}</span> ${ft(s.ride)} ft · ${s.seconds.toFixed(0)} s · peels ${s.peelAll.toFixed(0)}° overall <span class="${bad}">(${s.bandAll})</span>${isFinite(s.peelFast) ? ` · fastest ${s.peelFast.toFixed(0)}°` : ''}${isFinite(s.curlSpeed) ? ` · curl ~${(s.curlSpeed * 2.237).toFixed(0)} mph` : ''}`
      + ` · ~${ft(s.H)} ft waves<br><span class="end">breaks ${s.how} (ξ ${s.xi.toFixed(2)}) · then it ${s.end}</span></div>`;
  };
  el.innerHTML = line('Right', w.right) + line('Left', w.left);
  showRide();
  const refined = state.wave.right && state.wave.right.refined;
  $('stats').textContent = `rays ${state.ms.toFixed(0)} ms · ${refined ? `heights refined (${state.peMs.toFixed(0)} ms)` : 'refining heights…'} · ${state.rays.n} rays · ${state.grid.M}×${state.grid.N} cells of ${ft(state.grid.dx)} ft`;
}
const SWELL_CTL = [['H', 'H', (v) => `${ft1(v)} ft`], ['T', 'T', (v) => `${v} s`], ['D', 'dir', (v) => `${v > 0 ? '+' : ''}${v}°`]];
for (const [id, key, fmt] of SWELL_CTL) {
  const input = $(id), out = $(id + 'v');
  input.addEventListener('input', () => { state.swell[key] = Number(input.value); out.textContent = fmt(state.swell[key]); state.dirty = true; schedule(); });
}
// Every swell slider and its number from the current state (the user, 2026-11-22: after a reload the direction slider showed
// 0 while the map said otherwise: the labels were set before the saved design was restored, and a browser can put back stale
// slider values when it restores the page from its back/forward cache).
function syncSwell() { for (const [id, key, fmt] of SWELL_CTL) { $(id).value = state.swell[key]; $(id + 'v').textContent = fmt(state.swell[key]); } }
window.addEventListener('pageshow', () => { syncSwell(); draw(); });
// The coast panel: the beach face's slope (the Skeleton Bay research: it sets the hollowness, not the peel), and straighten.
const BEACH = [[12, 'Steep 1:12'], [20, 'Medium 1:20'], [35, 'Gentle 1:35'], [66.7, 'Flat 1:67']];
function showCoast() {
  const el = $('coast'); el.innerHTML = '';
  const row = document.createElement('div'); row.className = 'row';
  for (const [f, label] of BEACH) { const b = document.createElement('button'); b.textContent = label; if (Math.abs(state.coast.face - f) < 0.1) b.className = 'on'; b.onclick = () => { state.coast.face = f; state.dirty = true; showCoast(); schedule(); }; row.appendChild(b); }
  el.appendChild(row);
  const off = document.createElement('div'); off.className = 'row'; off.style.marginTop = '6px';
  const lab = document.createElement('span'); lab.textContent = 'Offshore'; lab.style.cssText = 'font-size:13px;color:var(--dim);width:70px;align-self:center'; off.appendChild(lab);
  for (const [deep, label] of [[false, 'Shelf'], [true, 'Deep']]) { const b = document.createElement('button'); b.textContent = label; if (!!state.coast.deep === deep) b.className = 'on'; b.onclick = () => { state.coast.deep = deep; state.dirty = true; showCoast(); schedule(); }; off.appendChild(b); }
  el.appendChild(off);
  const note2 = document.createElement('div'); note2.className = 'note'; note2.textContent = 'Deep offshore water and Deep reef blocks let a big swell break on your reef instead of out on the shelf.'; note2.style.marginTop = '4px'; el.appendChild(note2);
  const st = document.createElement('button'); st.textContent = 'Straighten'; st.style.marginTop = '6px';
  st.onclick = () => { const face = state.coast.face, deep = state.coast.deep; state.coast = defaultCoast(); state.coast.face = face; state.coast.deep = deep; state.dirty = true; schedule(); };
  el.appendChild(st);
}
function showZoom() { // (the map's corner: zoom out / in / fit)
  const el = $('colorby'); el.innerHTML = '';
  for (const [label, fn] of [['−', () => zoomAt(view.left + view.mw / 2, view.top + view.mh / 2, 1 / 1.5)], ['+', () => zoomAt(view.left + view.mw / 2, view.top + view.mh / 2, 1.5)], ['Fit', () => { view.z = 1; view.panX = view.panY = 0; draw(); }]]) {
    const b = document.createElement('button'); b.textContent = label; b.onclick = fn; el.appendChild(b);
  }
}
$('beach').onclick = () => {
  state.coast = defaultCoast(); state.coast.face = 20; showCoast(); state.blocks = beachPreset(); state.sel = null;
  state.swell.T = 12; syncSwell(); state.loop.a = state.loop.b = null; state.dirty = true; showSel(); schedule();
};
$('reset').onclick = () => { state.coast = reefCoast(); showCoast(); state.blocks = dynamicPreset(); state.sel = null; state.dirty = true; showSel(); schedule(); };
$('clear').onclick = () => { state.blocks = []; state.sel = null; state.dirty = true; showSel(); schedule(); };
window.addEventListener('resize', () => { layout(); draw(); });

restore();
{ const dq = new URLSearchParams(location.search).get('dir'); if (dq != null) { state.swell.dir = Number(dq); $('D').value = dq; $('Dv').textContent = `${dq > 0 ? '+' : ''}${dq}°`; } } // (?dir=: testing)
if (new URLSearchParams(location.search).get('preset') === 'beach') { state.coast = defaultCoast(); state.coast.face = 20; state.blocks = beachPreset(); state.swell.T = 12; $('T').value = 12; $('Tv').textContent = '12 s'; } // (?preset=beach: testing)
{ const q = new URLSearchParams(location.search).get('loop'); if (q) { state.loop.on = true; state.loop.side = q === 'left' ? 'left' : 'right'; } } // (?loop=right|left: start looped, for testing)
syncSwell();
recompute(); layout(); showSel(); showZoom(); showCoast();
{ const zq = Number(new URLSearchParams(location.search).get('zoom')); if (zq > 1 && state.wave) zoomAt(px(state.wave.peak.y), py(state.wave.peak.x), zq); } // (?zoom=2.5: open zoomed on the peak, for testing)
draw();
document.fonts?.ready.then(() => draw());
window.__builder = state; // (tests)
