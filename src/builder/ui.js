// Build a Break: the wave builder prototype (the user, 2026-11-22). A live version of the reef "about" card
// (research/reef-generator/about_map.py): a top-down map of the bay, offshore at the top and the beach at the bottom (so
// a right peels to the map's left), depth bands, the reef blocks you drag about (snapping to a 10 m grid, arms snapping
// onto peaks), the swell, crest lines every 5 s, and the curl from the fast break model (rays.js) coloured by time with
// ticks every 5 s, marked where it sections, backs off or closes out. Circles mean "you can drag this": only the blocks'
// handles are circles (the user, 2026-11-22); the curl's time ticks and the break's peak (a diamond) aren't.
import { buildDepth, makeGrid } from './reef.js';
import { traceRays, analyse } from './rays.js';
import { LOOP, curlAt, defaultLoop, clampLoop, loopInfo } from './loop.js';
import { BLOCKS, SNAP, ARM_ANGLES, ARM_LENGTHS, ROTATIONS, reefComponents, newBlock, dynamicPreset, armRot, nearestArm } from './blocks.js';

const canvas = document.getElementById('map'), ctx = canvas.getContext('2d');
const VIEW = { x0: 600, x1: 1262 }; // (x' shown: the deep water further out is all alike)
const BANDS = [[-50, 0, '#efe2bd'], [0, 1, '#e3f3d9'], [1, 2, '#9fe6d6'], [2, 3, '#5ccfcc'], [3, 4, '#2fb2c2'], [4, 5, '#1d95b0'],
  [5, 6, '#177b9c'], [6, 8, '#136486'], [8, 10, '#10506f'], [10, 13, '#0d3f5b'], [13, 40, '#0b3049']];
const BAND_RGB = BANDS.map(([a, b, c]) => [a, b, parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]);
const COL = { yellow: [255, 212, 38], pink: [255, 61, 139], red: '#ff4b4b' };

const state = { blocks: dynamicPreset(), sel: null, swell: { H: 1.6, T: 15, dir: 0 }, grid: null, rays: null, wave: null, dirty: true, ms: 0,
  loop: { on: false, side: 'right', a: null, b: null, info: null } }; // (loop: a stretch of one side to surf on repeat, loop.js)
let view = null; // the map's placement on the canvas
const depthImg = document.createElement('canvas');

// ---- the model ----
function recompute() {
  const t0 = performance.now();
  state.grid = buildDepth(reefComponents(state.blocks), makeGrid());
  state.rays = traceRays(state.grid, state.swell);
  state.wave = analyse(state.rays, state.grid);
  state.ms = performance.now() - t0;
  fitLoop();
  paintDepth();
  state.dirty = false;
  showResults();
}
// Keep the loop on the ride as the wave changes (a new stretch if it has none, or it no longer fits).
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
  const g = state.grid || makeGrid(), Y0 = g.y0, Y1 = g.y0 + g.N * g.dx;
  const pad = 14, w = r.width - 2 * pad, h = r.height - 2 * pad - 30 - 26; // (30 above for the swell, 26 below for the scale)
  const S = Math.min(w / (Y1 - Y0), h / (VIEW.x1 - VIEW.x0));
  view = { S, Y0, Y1, left: pad + (w - (Y1 - Y0) * S) / 2, top: pad + 30 + (h - (VIEW.x1 - VIEW.x0) * S) / 2, W: r.width, H: r.height };
}
const px = (y) => view.left + (y - view.Y0) * view.S;
const py = (x) => view.top + (x - VIEW.x0) * view.S;
const toReef = (cx, cy) => ({ x: VIEW.x0 + (cy - view.top) / view.S, y: view.Y0 + (cx - view.left) / view.S });
const snap = (v) => Math.round(v / SNAP) * SNAP;
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
  ctx.drawImage(depthImg, 0, i0 * 2, g.N * 2, iN * 2, view.left, view.top, mw, mh);
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
  if (w) for (const side of ['right', 'left']) drawCurl(w[side].curl, w.peak.t, side === 'right' ? 1 : -1);
  // the peak
  // (where it first breaks: computed, so a diamond, not a circle; only when it's clear of a block's handle, which it
  // usually sits right on)
  if (w && !state.blocks.some((b) => { const h = handle(b); return Math.hypot(px(h.y) - px(w.peak.y), py(h.x) - py(w.peak.x)) < 14; })) diamond(px(w.peak.y), py(w.peak.x), 8);
  // blocks
  for (const b of state.blocks) drawBlock(b);
  if (w && state.loop.info) drawLoopHandles();
  // labels: beach, swell
  ctx.restore();
  ctx.font = '700 13px Rubik'; ctx.textAlign = 'center'; ctx.fillStyle = '#8a6a2a';
  ctx.fillText('BEACH', view.left + mw / 2, view.top + mh - 10);
  drawSwell(view.left + mw / 2, view.top - 14);
  // scale bar
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; const sx = view.left + 6, sy = view.top + mh + 16;
  ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + 100 * S, sy); ctx.moveTo(sx, sy - 5); ctx.lineTo(sx, sy + 5); ctx.moveTo(sx + 100 * S, sy - 5); ctx.lineTo(sx + 100 * S, sy + 5); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.font = '500 12px Rubik'; ctx.fillText('100 m', sx + 100 * S + 8, sy + 4);
}
function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function diamond(x, y, r) {
  ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath();
  ctx.fillStyle = '#ffd426'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = '#0b1a24'; ctx.stroke();
}
function dot(x, y, r, fill, stroke, lw = 2) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); if (stroke) { ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.stroke(); } }

function drawCurl(curl, t0, inward) { // (inward: which way the time labels go, toward the middle of the reef)
  if (curl.length < 2) return;
  const span = 25;
  ctx.lineCap = 'round';
  for (let k = 1; k < curl.length; k++) {
    const a = curl[k - 1], b = curl[k], X0 = px(a.y), Y0 = py(a.x), X1 = px(b.y), Y1 = py(b.x);
    ctx.setLineDash([]); ctx.shadowBlur = 0;
    if (b.kind === 'closeout') { ctx.strokeStyle = COL.red; ctx.lineWidth = 6; }
    else if (b.kind === 'backoff') { ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 3; ctx.setLineDash([5, 5]); }
    else {
      ctx.strokeStyle = lerpCol(COL.yellow, COL.pink, Math.min(1, (b.t - t0) / span));
      ctx.lineWidth = b.kind === 'section' ? 7 : 4.5;
      if (b.kind === 'section') { ctx.shadowColor = '#ff3d8b'; ctx.shadowBlur = 12; }
    }
    ctx.beginPath(); ctx.moveTo(X0, Y0); ctx.lineTo(X1, Y1); ctx.stroke();
  }
  ctx.setLineDash([]); ctx.shadowBlur = 0;
  // a tick across the line every 5 s of the curl's time (not dots: circles are for things you can drag)
  for (let tt = 5, k = 1; k < curl.length; k++) {
    while (k < curl.length && curl[k].t - t0 >= tt) {
      const p = curl[k], q = curl[k - 1], X = px(p.y), Y = py(p.x);
      let ux = X - px(q.y), uy = Y - py(q.x); const l = Math.hypot(ux, uy) || 1; ux /= l; uy /= l;
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#0b1a24'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(X - uy * 8, Y + ux * 8); ctx.lineTo(X + uy * 8, Y - ux * 8); ctx.stroke();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(X - uy * 7, Y + ux * 7); ctx.lineTo(X + uy * 7, Y - ux * 7); ctx.stroke();
      if (Math.hypot(px(p.y) - px(curl[0].y), py(p.x) - py(curl[0].x)) < 34) { tt += 5; continue; } // (no label crowding the peak)
      ctx.font = 'bold 12px Rubik'; ctx.fillStyle = '#fff'; ctx.textAlign = inward > 0 ? 'left' : 'right';
      const lx = px(p.y) + inward * 9, ly = py(p.x) + 4;
      ctx.strokeStyle = '#0b1a24'; ctx.lineWidth = 3; ctx.strokeText(`${tt} s`, lx, ly); ctx.fillText(`${tt} s`, lx, ly);
      tt += 5;
    }
  }
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
  const txt = `↻ LOOP ${L.info.length.toFixed(0)} m`; ctx.strokeText(txt, lx, ly); ctx.fillText(txt, lx, ly);
}
function drawSwell(cx, cy) {
  const a = -state.swell.dir * Math.PI / 180; // (the swell's heading on the map: straight down, turned by its direction)
  ctx.save(); ctx.translate(cx - 70, cy); ctx.rotate(a);
  ctx.fillStyle = '#eaf6fa'; ctx.beginPath(); ctx.moveTo(-6, -12); ctx.lineTo(6, -12); ctx.lineTo(6, 2); ctx.lineTo(12, 2); ctx.lineTo(0, 14); ctx.lineTo(-12, 2); ctx.lineTo(-6, 2); ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.font = '400 15px Bungee'; ctx.fillStyle = '#fff'; ctx.textAlign = 'left';
  ctx.fillText(`SWELL ${state.swell.H.toFixed(1)} m · ${state.swell.T} s${state.swell.dir ? ` · ${state.swell.dir > 0 ? '+' : ''}${state.swell.dir}°` : ''}`, cx - 50, cy + 6);
}
function blockLabel(b) {
  if (b.type === 'arm') return `${b.side < 0 ? 'RIGHT' : 'LEFT'} ARM ${b.angle}°`;
  if (b.type === 'ledge') return `LEDGE ${b.angle}°`;
  return BLOCKS[b.type].label.toUpperCase();
}
// Where a block's handle sits: arms and ledges half way along their line (their start is often on a peak, which has its
// own handle there), everything else at its position.
function handle(b) {
  if (b.type !== 'arm' && b.type !== 'ledge') return { x: b.x, y: b.y };
  const a = b.angle * Math.PI / 180, L = (b.type === 'arm' ? b.length : 100) / 2;
  return { x: b.x + Math.sin(a) * L, y: b.y + b.side * Math.cos(a) * L };
}
function drawBlock(b) {
  const X = px(b.y), Y = py(b.x), on = state.sel === b;
  // a hint of its shape
  ctx.lineWidth = on ? 2.5 : 1.5; ctx.strokeStyle = on ? '#ffd426' : 'rgba(11,26,36,.55)'; ctx.setLineDash(on ? [] : [4, 4]);
  if (b.type === 'arm' || b.type === 'ledge') {
    const a = b.angle * Math.PI / 180, L = b.type === 'arm' ? b.length : 100;
    const ex = b.x + Math.sin(a) * L, ey = b.y + b.side * Math.cos(a) * L;
    ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(px(ey), py(ex)); ctx.stroke();
  } else if (b.type === 'ridge' || b.type === 'channel') {
    const r = b.rot * Math.PI / 180, h = b.length / 2, ux = Math.cos(r), uy = Math.sin(r);
    ctx.beginPath(); ctx.moveTo(px(b.y - uy * h), py(b.x - ux * h)); ctx.lineTo(px(b.y + uy * h), py(b.x + ux * h)); ctx.stroke();
  }
  ctx.setLineDash([]);
  const hp = handle(b), HX = px(hp.y), HY = py(hp.x);
  dot(HX, HY, on ? 8 : 6, on ? '#ffd426' : '#fff', '#0b1a24', 2);
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
canvas.addEventListener('pointerdown', (e) => {
  const r0 = canvas.getBoundingClientRect(), lh = hitLoop(e.clientX - r0.left, e.clientY - r0.top);
  if (lh) { drag = { loop: lh }; canvas.setPointerCapture(e.pointerId); return; }
  const r = canvas.getBoundingClientRect(), cx = e.clientX - r.left, cy = e.clientY - r.top, b = hit(cx, cy);
  state.sel = b; showSel();
  if (b) {
    const p = toReef(cx, cy);
    // a peak drags the arms attached to it
    const kids = b.type === 'peak' ? state.blocks.filter((q) => q !== b && (q.type === 'arm' || q.type === 'ledge') && q.x === b.x && q.y === b.y) : [];
    drag = { b, dx: b.x - p.x, dy: b.y - p.y, kids };
    canvas.setPointerCapture(e.pointerId);
  }
  draw();
});
canvas.addEventListener('pointermove', (e) => {
  const r = canvas.getBoundingClientRect(), cx = e.clientX - r.left, cy = e.clientY - r.top;
  if (!drag) { canvas.style.cursor = hit(cx, cy) || hitLoop(cx, cy) ? 'grab' : 'default'; return; }
  if (drag.loop) { // (a loop end: to the nearest spot on the curl, 10 m snap, the loop at least LOOP.min long, inside the ride)
    const L = state.loop, side = state.wave[L.side];
    let best = null; for (let s = 0; s <= side.ride; s += 2) { const q = curlAt(side.curl, s), d = Math.hypot(px(q.y) - cx, py(q.x) - cy); if (!best || d < best.d) best = { s, d }; }
    const v = Math.round(best.s / LOOP.snap) * LOOP.snap;
    if (drag.loop === 'a') L.a = Math.max(0, Math.min(v, L.b - LOOP.min)); else L.b = Math.min(Math.floor(side.ride / LOOP.snap) * LOOP.snap, Math.max(v, L.a + LOOP.min));
    L.info = loopInfo(side, L.a, L.b); showRide(); draw(); return;
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
const endDrag = () => { drag = null; };
canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag);

let queued = false;
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
      const a = state.blocks.find((q) => q.type === 'arm'), r = a.angle * Math.PI / 180, L = a.length * 0.55;
      b = Object.assign(newBlock('ridge', Math.round(a.x + Math.sin(r) * L), Math.round(a.y + a.side * Math.cos(r) * L)), { rot: armRot(a) });
    } else b = newBlock(type, snap(type === 'channel' ? 950 : 900), snap((view.Y0 + view.Y1) / 2 + (Math.random() - 0.5) * 120));
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
  if (b.type === 'arm') el.appendChild(opt('Length', ARM_LENGTHS, b.length, (v) => `${v} m`, (v) => { b.length = v; }));
  if (b.type === 'ridge' || b.type === 'channel') {
    el.appendChild(opt('Turn', ROTATIONS, b.rot, (v) => `${v}°`, (v) => { b.rot = v; }));
    el.appendChild(opt('Length', b.type === 'ridge' ? [50, 80, 120] : [140, 220, 320], b.length, (v) => `${v} m`, (v) => { b.length = v; }));
  }
  const del = document.createElement('button'); del.className = 'danger'; del.textContent = 'Remove'; del.style.marginTop = '8px';
  del.onclick = () => { state.blocks = state.blocks.filter((q) => q !== b); state.sel = null; state.dirty = true; showSel(); schedule(); };
  el.appendChild(del);
}
const mph = (v) => (v * 2.237).toFixed(0);
function showRide() {
  const el = $('ride'), L = state.loop; el.innerHTML = '';
  const mode = document.createElement('div'); mode.className = 'row';
  for (const [on, label] of [[false, 'Full ride'], [true, '↻ Loop']]) {
    const b = document.createElement('button'); b.textContent = label; if (L.on === on) b.className = 'on';
    b.onclick = () => { L.on = on; fitLoop(); showRide(); draw(); }; mode.appendChild(b);
  }
  el.appendChild(mode);
  const note = document.createElement('div'); note.className = 'note'; note.style.marginTop = '8px';
  if (!L.on) { note.textContent = 'Ride it from the takeoff until it ends, or loop your favourite stretch to surf it forever, like Queens or Raglan.'; el.appendChild(note); return; }
  const sides = document.createElement('div'); sides.className = 'row'; sides.style.marginTop = '8px';
  for (const sd of ['right', 'left']) {
    const b = document.createElement('button'); b.textContent = sd === 'right' ? 'Right' : 'Left'; if (L.side === sd) b.className = 'on';
    b.onclick = () => { L.side = sd; L.a = L.b = null; fitLoop(); showRide(); draw(); }; sides.appendChild(b);
  }
  el.appendChild(sides);
  const I = L.info;
  if (!I) { note.innerHTML = `<span class="bad">The ${L.side} is too short to loop (it needs ${LOOP.min + 2 * LOOP.edge} m).</span>`; el.appendChild(note); return; }
  note.innerHTML = `Drag the round ends along the curl.<br><b style="color:var(--text)">${I.length.toFixed(0)} m · ${I.seconds.toFixed(0)} s a lap</b>`
    + ` · curl ${mph(I.vMin) === mph(I.vMax) ? mph(I.vMin) : `${mph(I.vMin)}–${mph(I.vMax)}`} mph along the reef · ${I.sections ? `${I.sections} fast section${I.sections > 1 ? 's' : ''}` : 'no sections'}<br>`
    + (I.closes ? '<span class="bad">It closes out inside the loop.</span> ' : '')
    + (I.seam.ok ? '<span style="color:var(--teal)">Seam: smooth</span> (the end runs back into the start)'
      : `<span style="color:#ffaa28">Seam: rough</span>: the end is ${(I.seam.dv * 100).toFixed(0)}% ${I.seam.dv > LOOP.seamSpeed ? 'off in speed' : ''}${I.seam.dv > LOOP.seamSpeed && I.seam.dH > LOOP.seamHeight ? ' and ' : ''}${I.seam.dH > LOOP.seamHeight ? `${(I.seam.dH * 100).toFixed(0)}% off in height` : ''} from the start; move an end to where they match`);
  el.appendChild(note);
}
function showResults() {
  const w = state.wave, el = $('res');
  if (!w) { el.innerHTML = '<span class="bad">Nothing breaks: the swell rolls in to the beach.</span>'; return; }
  const line = (name, s) => {
    if (!s || s.ride < 20) return `<div><span class="side">${name}</span> <span class="bad">no ride: it ${s ? s.end : 'never breaks'}</span></div>`;
    const bad = s.band === 'closeout' ? ' bad' : '';
    return `<div><span class="side">${name}</span> ${s.ride.toFixed(0)} m · ${s.seconds.toFixed(0)} s · peels ${s.peel.toFixed(0)}° <span class="${bad}">(${s.band})</span>`
      + ` · ~${(s.H * 3.28).toFixed(0)} ft<br><span class="end">then it ${s.end}</span></div>`;
  };
  el.innerHTML = line('Right', w.right) + line('Left', w.left);
  showRide();
  $('stats').textContent = `model ${state.ms.toFixed(0)} ms · ${state.rays.n} rays · ${state.grid.M}×${state.grid.N} cells of ${state.grid.dx} m`;
}
for (const [id, key, fmt] of [['H', 'H', (v) => `${v.toFixed(1)} m`], ['T', 'T', (v) => `${v} s`], ['D', 'dir', (v) => `${v > 0 ? '+' : ''}${v}°`]]) {
  const input = $(id), out = $(id + 'v');
  const set = () => { state.swell[key] = Number(input.value); out.textContent = fmt(state.swell[key]); state.dirty = true; schedule(); };
  input.addEventListener('input', set); out.textContent = fmt(Number(input.value));
}
$('reset').onclick = () => { state.blocks = dynamicPreset(); state.sel = null; state.dirty = true; showSel(); schedule(); };
$('clear').onclick = () => { state.blocks = []; state.sel = null; state.dirty = true; showSel(); schedule(); };
window.addEventListener('resize', () => { layout(); draw(); });

{ const q = new URLSearchParams(location.search).get('loop'); if (q) { state.loop.on = true; state.loop.side = q === 'left' ? 'left' : 'right'; } } // (?loop=right|left: start looped, for testing)
recompute(); layout(); showSel(); draw();
document.fonts?.ready.then(() => draw());
window.__builder = state; // (tests)
