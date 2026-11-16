import { createRenderer } from './renderer.js';
import { createRider, resetRider, stepRider, groundSpeed, frameAt, v3, TUNE } from './rider.js';
import { PEEL_SPEED, slice, verticalHits, setWaveType } from './wave.js';
import { perspective, lookAt, mul, invert } from './math.js';
import { createPose, surferObjects } from './surfer.js';

const params = new URLSearchParams(location.search);
// Crumbling wave by default; ?wave=barrel for the barreling one. Must be set
// before the renderer builds the wave mesh.
setWaveType(params.get('wave') || 'crumble');

const $ = (id) => document.getElementById(id);
const canvas = $('gfx');
const SUN = v3.norm([0.35, 0.5, -0.8]); // behind the wave, so the lip glows
const STEP = 1 / 120;

// ---------- input ----------
const keys = new Set();
const touch = { turn: 0, pump: false, crouch: false };
addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
  keys.add(e.code);
  if (e.code === 'KeyC') camMode = (camMode + 1) % 2;
  if (e.code === 'Space' || e.code === 'Enter') startOrRestart();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

// Autopilot: works the pocket with S-turns and pumps, turning off the top. Drives the title-screen demo
// and the ?auto test mode.
let autoUp = false;
function autopilot() {
  if (autoUp && rider.t < TUNE.tTop + 1) autoUp = false;
  if (!autoUp && rider.t > 12.6) autoUp = true;
  if (Math.cos(rider.phi) < 0) return { aim: [1, -0.3] }; // facing back: turn back down the line
  if (rider.xs < -1) return { aim: [1, 0.6], pump: true }; // behind the curl: climb out along the line
  return { tilt: autoUp ? 1 : -1, pump: !autoUp, crouch: rider.inBarrel };
}

// Keyboard: Left/Up turn the board to the surfer's left, Right/Down to their
// right. Touch: swipes do exactly the same (swipe left or up = Left, swipe
// right or down = Right), harder the further you swipe.
function readInput() {
  if (params.has('auto')) return autopilot();
  const k = (...c) => c.some((x) => keys.has(x));
  const turn = (k('ArrowLeft', 'KeyA') ? 1 : 0) - (k('ArrowRight', 'KeyD') ? 1 : 0);
  const tilt = (k('ArrowUp', 'KeyW') ? 1 : 0) - (k('ArrowDown', 'KeyS') ? 1 : 0);
  return {
    turn: touch.turn || turn, tilt,
    pump: k('Space') || touch.pump,
    crouch: k('ShiftLeft', 'ShiftRight', 'KeyJ') || touch.crouch,
  };
}

// Touch: swipe anywhere (except the pump button) to steer.
let stickId = null, stickStart = [0, 0];
const SWIPE_PX = 45; // full turn at this far from where the swipe started
// The title and game-over panels cover the canvas, so taps land on them.
for (const id of ['title', 'over']) $(id).addEventListener('pointerdown', (e) => { e.preventDefault(); startOrRestart(); });
canvas.addEventListener('pointerdown', (e) => {
  if (state === 'title' || state === 'over') { startOrRestart(); return; }
  stickId = e.pointerId; stickStart = [e.clientX, e.clientY];
});
addEventListener('pointermove', (e) => {
  if (e.pointerId !== stickId) return;
  let dx = (e.clientX - stickStart[0]) / SWIPE_PX, dy = (e.clientY - stickStart[1]) / SWIPE_PX;
  // The anchor follows the finger once past a full turn, so swiping back the
  // other way responds right away.
  const l = Math.hypot(dx, dy);
  if (l > 1) {
    stickStart = [e.clientX - (dx / l) * SWIPE_PX, e.clientY - (dy / l) * SWIPE_PX];
    dx /= l; dy /= l;
  }
  // Same as the keys: left or up = Left (+1), right or down = Right (-1).
  const v = Math.abs(dx) > Math.abs(dy) ? -dx : -dy;
  touch.turn = Math.abs(v) < 0.2 ? 0 : Math.sign(v) * Math.min(1, Math.abs(v));
});
const endStick = (e) => { if (e.pointerId === stickId) { stickId = null; touch.turn = 0; } };
addEventListener('pointerup', endStick);
addEventListener('pointercancel', endStick);
for (const [id, prop] of [['btn-pump', 'pump']]) {
  const b = $(id);
  b.addEventListener('pointerdown', (e) => { e.preventDefault(); touch[prop] = true; if (state !== 'play') startOrRestart(); });
  b.addEventListener('pointerup', () => { touch[prop] = false; });
  b.addEventListener('pointerleave', () => { touch[prop] = false; });
  b.addEventListener('pointercancel', () => { touch[prop] = false; });
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
let turnSigned = 0, snapSpray = 0, lastMove = '', lastMoveTime = -9;
const pose = createPose();
let lastInput = {};

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
      const [name, base] = table[Math.min(720, e.spins)] || table[0];
      const pts = Math.round(base * (e.big ? 1.5 : 1)); // launched right off the whitewater: bigger air
      score += pts;
      flash(e.big ? `BIG ${name.toUpperCase()}` : name, `${e.backwards ? 'landed backwards  ' : ''}+${pts}`);
    }
    if (e.type === 'move') {
      const MOVES = {
        bottomTurn: ['Bottom turn', 100, 0],
        topTurn: ['Top turn', 150, 0.15],
        offLip: ['Off the lip!', 350, 0.25],
        snap: ['SNAP!', 500, 0.35],
        reentry: ['RE-ENTRY!', 700, 0.4],
        floater: ['FLOATER!', 600, 0.3],
        revert: ['Revert', 150, 0.35],
        lip180: ['180 off the top', 250, 0.3],
        rebound: ['REBOUND!', 500, 0.4],
        rebound180: ['REBOUND 180!', 750, 0.45],
      };
      const [name, base, spray] = MOVES[e.move] || ['Nice', 100, 0];
      // Repeating the same move back to back pays less; linking a bottom
      // turn into a move pays more.
      const repeat = e.move === lastMove && rider.time - lastMoveTime < 1.2;
      lastMove = e.move; lastMoveTime = rider.time;
      const pts = Math.round(base * (e.combo ? 1.5 : 1) * (repeat ? 0.4 : 1));
      score += pts;
      snapSpray = Math.max(snapSpray, spray);
      if (e.move !== 'bottomTurn' || msgTimer <= 0) flash(e.combo ? `${name}` : name, `${e.combo ? 'bottom turn combo  ' : ''}+${pts}`);
    }
    if (e.type === 'wipe') {
      burst = 0.3;
      flash('WIPEOUT!', e.reason);
    }
  }
}

// ---------- camera ----------
let camPos = [-6, 4, 12], camTarget = [0, 1, 0], aspectNow = 1.6;
function updateCamera(dt) {
  const p = rider.pos;
  let want, look;
  if (camMode === 0) {
    // From the channel in front of the wave: barrel on the left, shoulder right.
    // Ahead in the channel, looking back up the line into the tube.
    const near = aspectNow < 1 ? 0.7 : 1; // closer on a phone held upright
    want = [p[0] + 6.0 * near, 2.2 + p[1] * 0.35, p[2] + 8.0 * near];
    look = [p[0] - 1.8 * near, 1.0 + p[1] * 0.55, p[2] - 0.5];
  } else if (camMode === 2) {
    // Close-up (testing): beside the rider, toward the beach.
    want = [p[0] + 2.4, p[1] + 1.5, p[2] + 4.2];
    look = [p[0], p[1] + 0.8, p[2]];
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

// ---------- main ----------
let renderer, frameMs = 16;
function showError(msg) {
  const el = $('err');
  if (!el.hidden) return;
  el.textContent = `Something went wrong drawing the game: ${String(msg).split('\n')[0]}`;
  el.hidden = false;
}
window.addEventListener('error', (e) => showError(e.message));
window.addEventListener('unhandledrejection', (e) => showError(e.reason?.message || e.reason));
async function main() {
  try {
    renderer = await createRenderer(canvas);
  } catch (err) {
    console.error(err);
    $('nogpu-detail').textContent = err.message === 'no-webgpu' ? '' : `Error: ${err.message}`;
    $('nogpu').hidden = false;
    $('title').hidden = true;
    return;
  }
  // Show GPU errors on screen (useful on phones, where there's no console).
  renderer.device.addEventListener('uncapturederror', (ev) => showError(ev.error.message));
  renderer.device.lost.then((info) => showError(`GPU device lost: ${info.message}`));
  $('best').textContent = best;
  if (params.has('moveaccel')) TUNE.moveCalm = 0; // compare: the old behavior
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
      lastInput = input;
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
      while (acc >= STEP) { lastInput = autopilot(); stepRider(rider, lastInput, STEP); acc -= STEP; }
      if (rider.mode === 'wipe' && rider.wipeTimer <= 0) resetRider(rider);
    }

    // Turning direction (for lean and spray).
    const n = rider.mode === 'surf' ? frameAt(rider.xs, rider.t).n : [0, 1, 0];
    const turn = v3.dot(v3.cross(prevHeading, rider.heading), n) / Math.max(dt, 1e-3);
    turnSigned += (turn - turnSigned) * Math.min(1, dt * 10);
    prevHeading = rider.heading.slice();

    const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
    aspectNow = aspect;
    updateCamera(dt);
    const proj = perspective(aspect < 1 ? 1.15 : 0.95, aspect, 0.1, 4000);
    const view = lookAt(camPos, camTarget, [0, 1, 0]);
    const vp = mul(proj, view);
    const camRight = [view[0], view[4], view[8]], camUp = [view[1], view[5], view[9]];

    const surfing = rider.mode === 'surf';
    const speed = v3.len(rider.vel);
    snapSpray = Math.max(0, snapSpray - dt);
    const sprayAmt = surfing ? Math.min(1, Math.abs(turnSigned) * 0.3 * Math.min(1, speed / 6) + (rider.pumping ? 0.15 : 0) + (snapSpray > 0 ? 0.9 : 0)) : 0;
    const side = v3.norm(v3.cross(n, rider.heading));
    const sprayDir = v3.norm(v3.add(v3.mul(side, turnSigned > 0 ? -1 : 1), v3.mul(rider.heading, -0.4)));
    burst = Math.max(0, burst - dt);

    renderer.render({
      viewProj: vp, invViewProj: invert(vp), camPos, time, sunDir: SUN, peel: PEEL_SPEED,
      rider: rider.pos, spray: sprayAmt, riderVel: rider.vel, dt, sprayDir, frame,
      burst: burst > 0 ? 1 : 0, camRight, camUp,
    }, surferObjects(pose, rider, {
      n, e2: v3.norm(v3.cross(n, v3.norm(v3.rej([1, 0, 0], n)))), turn: turnSigned,
      pump: !!lastInput.pump && surfing,
    }, dt), { particles: !params.has('noparticles'), outlines: !params.has('nooutline') });

    frameMs = frameMs * 0.95 + (dt * 1000) * 0.05; // smoothed frame time
    window.__dbg = { wind: +(pose.windup || 0).toFixed(2), unl: +(pose.unload || 0).toFixed(2), ms: +frameMs.toFixed(1), phi: +(rider.phi * 57.3).toFixed(0), turn: touch.turn, state, mode: rider.mode, xs: +rider.xs.toFixed(1), y: +rider.pos[1].toFixed(1), score: Math.round(score), reason: rider.wipeReason };
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
