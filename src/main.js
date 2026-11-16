import { createRenderer } from './renderer.js';
import { createRider, resetRider, stepRider, groundSpeed, frameAt, v3 } from './rider.js';
import { PEEL_SPEED, slice, verticalHits } from './wave.js';
import { perspective, lookAt, mul, invert, basis } from './math.js';

const $ = (id) => document.getElementById(id);
const canvas = $('gfx');
const SUN = v3.norm([0.35, 0.5, -0.8]); // behind the wave, so the lip glows
const STEP = 1 / 120;

// ---------- input ----------
const keys = new Set();
const touch = { stick: [0, 0], pump: false, crouch: false };
addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
  keys.add(e.code);
  if (e.code === 'KeyC') camMode = (camMode + 1) % 2;
  if (e.code === 'Space' || e.code === 'Enter') startOrRestart();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

// Autopilot: S-turns between a high and low line. Drives the title-screen
// demo and the ?auto test mode.
const params = new URLSearchParams(location.search);
let autoUp = false;
function autopilot() {
  const y = rider.pos[1] + rider.vel[1] * 0.35;
  if (autoUp && y > 2.6) autoUp = false;
  if (!autoUp && y < 1.1) autoUp = true;
  return { steer: [1, autoUp ? 0.9 : -0.8], pump: !autoUp, crouch: rider.inBarrel || rider.xs < 0 };
}

function readInput() {
  if (params.has('auto')) return autopilot();
  const k = (...c) => c.some((x) => keys.has(x));
  let sx = (k('ArrowRight', 'KeyD') ? 1 : 0) - (k('ArrowLeft', 'KeyA') ? 1 : 0);
  let sy = (k('ArrowUp', 'KeyW') ? 1 : 0) - (k('ArrowDown', 'KeyS') ? 1 : 0);
  if (touch.stick[0] || touch.stick[1]) { sx = touch.stick[0]; sy = touch.stick[1]; }
  return {
    steer: [sx, sy],
    pump: k('Space') || touch.pump,
    crouch: k('ShiftLeft', 'ShiftRight', 'KeyJ') || touch.crouch,
  };
}

// Touch: drag on the left half to steer, buttons on the right.
let stickId = null, stickStart = [0, 0];
canvas.addEventListener('pointerdown', (e) => {
  if (state === 'title' || state === 'over') { startOrRestart(); return; }
  if (e.clientX < innerWidth / 2) { stickId = e.pointerId; stickStart = [e.clientX, e.clientY]; }
});
addEventListener('pointermove', (e) => {
  if (e.pointerId !== stickId) return;
  const dx = (e.clientX - stickStart[0]) / 50, dy = -(e.clientY - stickStart[1]) / 50;
  const l = Math.hypot(dx, dy);
  touch.stick = l < 0.2 ? [0, 0] : [dx / Math.max(1, l), dy / Math.max(1, l)];
});
addEventListener('pointerup', (e) => { if (e.pointerId === stickId) { stickId = null; touch.stick = [0, 0]; } });
for (const [id, prop] of [['btn-pump', 'pump'], ['btn-crouch', 'crouch']]) {
  const b = $(id);
  b.addEventListener('pointerdown', (e) => { e.preventDefault(); touch[prop] = true; if (state !== 'play') startOrRestart(); });
  b.addEventListener('pointerup', () => { touch[prop] = false; });
  b.addEventListener('pointerleave', () => { touch[prop] = false; });
}
if (matchMedia('(pointer: coarse)').matches) document.body.classList.add('touch');

// ---------- game state ----------
let state = 'title'; // title | play | over
let camMode = 0; // 0: classic (from the shoulder), 1: chase
const rider = createRider();
resetRider(rider);
let score = 0, best = 0;
try { best = Number(localStorage.getItem('rys-rad-waves-best')) || 0; } catch {}
let burst = 0, msgTimer = 0, rideTime = 0;
let prevHeading = rider.heading.slice();
let turnSigned = 0, lean = 0;

function startOrRestart() {
  if (state === 'play') return;
  state = 'play';
  resetRider(rider);
  if (params.has('xs')) { rider.xs = Number(params.get('xs')); rider.t = 13.0; rider.pos = frameAt(rider.xs, rider.t).P; }
  score = 0; rideTime = 0;
  $('title').hidden = true;
  $('over').hidden = true;
  flash('Drop in!');
}

function flash(text, sub = '') {
  $('msg').innerHTML = text + (sub ? `<small>${sub}</small>` : '');
  $('msg').classList.remove('pop');
  void $('msg').offsetWidth;
  $('msg').classList.add('pop');
  msgTimer = 1.6;
}

function handleEvents() {
  for (const e of rider.events) {
    if (e.type === 'barrelEnter') flash('In the barrel!');
    if (e.type === 'barrelExit' && e.time > 0.4) {
      const pts = Math.round(e.time * 1000);
      score += pts;
      flash(e.time > 2.5 ? 'DEEP BARREL!' : 'Tubed!', `${e.time.toFixed(1)}s  +${pts}`);
    }
    if (e.type === 'land') {
      const table = { 0: ['Air!', 300], 180: ['Air reverse!', 600], 360: ['Air 360!', 1200], 540: ['Air 540!!', 2000], 720: ['Air 720!!!', 3200] };
      const [name, pts] = table[Math.min(720, e.spins)] || table[0];
      score += pts;
      flash(name, `+${pts}`);
    }
    if (e.type === 'wipe') {
      burst = 0.3;
      flash('WIPEOUT!', e.reason);
    }
  }
}

// ---------- camera ----------
let camPos = [-6, 4, 12], camTarget = [0, 1, 0];
function updateCamera(dt) {
  const p = rider.pos;
  let want, look;
  if (camMode === 0) {
    // From the channel in front of the wave: barrel on the left, shoulder right.
    // Ahead in the channel, looking back up the line into the tube.
    want = [p[0] + 8.5, 2.4 + p[1] * 0.3, p[2] + 11.5];
    look = [p[0] - 2.5, 1.0 + p[1] * 0.5, p[2] - 0.5];
  } else {
    const h = v3.norm([rider.heading[0], 0, rider.heading[2]]);
    const close = rider.inBarrel ? 3.2 : 5.5;
    want = [p[0] - h[0] * close, p[1] + (rider.inBarrel ? 0.9 : 1.6), p[2] - h[2] * close + 0.6];
    look = [p[0] + h[0] * 4, p[1] + 0.6, p[2] + h[2] * 4];
  }
  // Never put the camera inside the water: an odd number of surface
  // crossings above a point means it's underwater (or inside the lip).
  const insideWater = (q) => verticalHits(slice(q[0], 6), q[2]).filter((hit) => hit.y > q[1]).length % 2 === 1;
  for (let i = 0; i < 25 && insideWater(want); i++) want[2] += 0.35;
  const k = 1 - Math.exp(-dt * (rider.mode === 'wipe' ? 1.5 : 5));
  for (let i = 0; i < 3; i++) { camPos[i] += (want[i] - camPos[i]) * k; camTarget[i] += (look[i] - camTarget[i]) * k; }
}

// ---------- surfer model ----------
const COL = { board: [1.0, 0.24, 0.55], stripe: [1.0, 0.85, 0.15], suit: [0.07, 0.08, 0.1], top: [0.0, 0.72, 0.78], skin: [0.86, 0.63, 0.46], hair: [0.98, 0.85, 0.35] };
function rotateAbout(a, k, ang) {
  const c = Math.cos(ang), s = Math.sin(ang), kd = v3.dot(k, a), kx = v3.cross(k, a);
  return [a[0] * c + kx[0] * s + k[0] * kd * (1 - c), a[1] * c + kx[1] * s + k[1] * kd * (1 - c), a[2] * c + kx[2] * s + k[2] * kd * (1 - c)];
}
let bodyUp = [0, 1, 0], boardUp = [0, 1, 0];
function surferObjects(dt) {
  if (rider.mode === 'wipe' && rider.wipeTimer < 1.9) return [];
  const p = rider.pos;
  const f = rider.heading;
  let n = [0, 1, 0];
  if (rider.mode === 'surf') n = frameAt(rider.xs, rider.t).n;
  const k = 1 - Math.exp(-dt * 12);
  for (let i = 0; i < 3; i++) boardUp[i] += (n[i] - boardUp[i]) * k;
  boardUp = v3.norm(v3.rej(boardUp, f));
  const side = v3.norm(v3.cross(f, boardUp));
  const objs = [];
  const P = (a, b, c) => [p[0] + a[0] + b[0] + c[0], p[1] + a[1] + b[1] + c[1], p[2] + a[2] + b[2] + c[2]];
  objs.push({ mesh: 'sphere', model: basis(f, boardUp, side, 2.1, 0.09, 0.56, P(v3.mul(boardUp, 0.05), [0, 0, 0], [0, 0, 0])), color: COL.board });
  objs.push({ mesh: 'box', model: basis(f, boardUp, side, 1.5, 0.095, 0.06, P(v3.mul(boardUp, 0.05), [0, 0, 0], [0, 0, 0])), color: COL.stripe });

  // Body leans into turns and stays roughly upright.
  const targetUp = v3.norm(v3.add(v3.mul(boardUp, 0.45), [0, 0.55, 0]));
  lean += (Math.max(-0.6, Math.min(0.6, -turnSigned * 0.25)) - lean) * k;
  const wantUp = v3.norm(rotateAbout(targetUp, f, lean));
  for (let i = 0; i < 3; i++) bodyUp[i] += (wantUp[i] - bodyUp[i]) * k;
  const b = v3.norm(v3.rej(bodyUp, f));
  const c = v3.norm(v3.cross(f, b));
  const legH = rider.crouch ? 0.5 : 0.82;
  const base = v3.mul(boardUp, 0.1);
  const at = (along, up, out = 0) => P(base, v3.mul(f, along), v3.add(v3.mul(b, up), v3.mul(c, out)));
  // Legs splay a bit when crouched.
  objs.push({ mesh: 'box', model: basis(f, b, c, 0.16, legH, 0.17, at(-0.3, legH / 2)), color: COL.suit });
  objs.push({ mesh: 'box', model: basis(f, b, c, 0.16, legH, 0.17, at(0.3, legH / 2)), color: COL.suit });
  const torsoLean = rider.crouch ? 0.25 : 0.05;
  const tb = v3.norm(v3.add(b, v3.mul(c, torsoLean)));
  const tc = v3.norm(v3.cross(f, tb));
  objs.push({ mesh: 'box', model: basis(f, tb, tc, 0.4, 0.62, 0.24, at(0, legH + 0.3, torsoLean * 0.3)), color: COL.top });
  objs.push({ mesh: 'sphere', model: basis(f, tb, tc, 0.27, 0.3, 0.27, at(0, legH + 0.78, torsoLean * 0.75)), color: COL.skin });
  objs.push({ mesh: 'sphere', model: basis(f, tb, tc, 0.29, 0.18, 0.29, at(-0.02, legH + 0.88, torsoLean * 0.8)), color: COL.hair });
  // Arms out for balance, tilting with the lean.
  const armUp = rotateAbout(tb, tc, lean * 0.8);
  const armF = v3.norm(v3.cross(armUp, tc));
  objs.push({ mesh: 'box', model: basis(armF, armUp, tc, 1.35, 0.1, 0.1, at(0, legH + 0.48, torsoLean * 0.5)), color: COL.top });
  if (rider.mode === 'wipe') {
    // Tumble.
    const spin = (2.2 - rider.wipeTimer) * 14;
    for (const o of objs) {
      const m = o.model;
      for (let col = 0; col < 3; col++) {
        const v = rotateAbout([m[col * 4], m[col * 4 + 1], m[col * 4 + 2]], side, spin);
        m[col * 4] = v[0]; m[col * 4 + 1] = v[1]; m[col * 4 + 2] = v[2];
      }
    }
  }
  return objs;
}

// ---------- main ----------
let renderer;
async function main() {
  try {
    renderer = await createRenderer(canvas);
  } catch (err) {
    console.error(err);
    $('nogpu').hidden = false;
    $('title').hidden = true;
    return;
  }
  $('best').textContent = best;
  if (params.has('play')) startOrRestart();
  if (params.has('cam')) camMode = Number(params.get('cam')) || 0;
  let last = performance.now(), acc = 0, frame = 0, time = 0;
  function tick(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt;
    frame++;

    if (state === 'play') {
      const input = readInput();
      acc += dt;
      while (acc >= STEP) {
        stepRider(rider, input, STEP);
        handleEvents();
        acc -= STEP;
      }
      if (rider.mode === 'surf') {
        rideTime += dt;
        score += groundSpeed(rider) * dt * 3;
      }
      if (rider.mode === 'wipe' && rider.wipeTimer <= 0) {
        state = 'over';
        const s = Math.round(score);
        if (s > best) { best = s; try { localStorage.setItem('rys-rad-waves-best', String(best)); } catch {} }
        $('over-score').textContent = s;
        $('over-reason').textContent = rider.wipeReason;
        $('over-time').textContent = rideTime.toFixed(1);
        $('best').textContent = best;
        $('over').hidden = false;
      }
    } else if (state === 'title') {
      // Attract mode: the autopilot surfs behind the title card.
      acc += dt;
      while (acc >= STEP) { stepRider(rider, autopilot(), STEP); acc -= STEP; }
      if (rider.mode === 'wipe' && rider.wipeTimer <= 0) resetRider(rider);
    }

    // Turning direction (for lean and spray).
    const n = rider.mode === 'surf' ? frameAt(rider.xs, rider.t).n : [0, 1, 0];
    const turn = v3.dot(v3.cross(prevHeading, rider.heading), n) / Math.max(dt, 1e-3);
    turnSigned += (turn - turnSigned) * Math.min(1, dt * 10);
    prevHeading = rider.heading.slice();

    updateCamera(dt);
    const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
    const proj = perspective(aspect < 1 ? 1.25 : 0.95, aspect, 0.1, 4000);
    const view = lookAt(camPos, camTarget, [0, 1, 0]);
    const vp = mul(proj, view);
    const camRight = [view[0], view[4], view[8]], camUp = [view[1], view[5], view[9]];

    const surfing = rider.mode === 'surf';
    const speed = v3.len(rider.vel);
    const sprayAmt = surfing ? Math.min(1, Math.abs(turnSigned) * 0.35 * Math.min(1, speed / 6) + (rider.pumping ? 0.15 : 0)) : 0;
    const side = v3.norm(v3.cross(n, rider.heading));
    const sprayDir = v3.norm(v3.add(v3.mul(side, turnSigned > 0 ? -1 : 1), v3.mul(rider.heading, -0.4)));
    burst = Math.max(0, burst - dt);

    renderer.render({
      viewProj: vp, invViewProj: invert(vp), camPos, time, sunDir: SUN, peel: PEEL_SPEED,
      rider: rider.pos, spray: sprayAmt, riderVel: rider.vel, dt, sprayDir, frame,
      burst: burst > 0 ? 1 : 0, camRight, camUp,
    }, surferObjects(dt), { particles: !params.has('noparticles') });

    window.__dbg = { state, mode: rider.mode, xs: +rider.xs.toFixed(1), y: +rider.pos[1].toFixed(1), score: Math.round(score), reason: rider.wipeReason };
    // HUD.
    msgTimer -= dt;
    if (msgTimer <= 0) $('msg').classList.remove('pop');
    $('score').textContent = Math.round(score);
    $('speed').textContent = Math.round(groundSpeed(rider) * 2.237);
    const tube = $('tube');
    tube.style.width = `${Math.min(100, rider.barrelTime * 25)}%`;
    tube.parentElement.classList.toggle('on', rider.inBarrel);
    $('hint').classList.toggle('warn', rider.inBarrel && !rider.crouch);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
main();
