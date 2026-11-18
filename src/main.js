import { createRenderer } from './renderer.js';
import { createRider, resetRider, stepRider, groundSpeed, frameAt, v3, TUNE, useWave, tubeDepth } from './rider.js';
import { PEEL_SPEED, slice, verticalHits, WAVE, phaseAt, toWorld, waveDir } from './wave.js';
import { WAVES } from './waves/index.js';
import { SEA, nextWave, stepSea, waveHeightFt, seedSea } from './sea.js';
import { perspective, lookAt, mul, invert } from './math.js';
import { createPose, surferObjects, LOOK } from './surfer.js';

const params = new URLSearchParams(location.search);
// Crumbling wave by default; ?wave=barrel for the barreling one. Must be set
// before the renderer builds the wave mesh.
let savedWave = null;
try { savedWave = localStorage.getItem('rys-rad-waves-wave'); } catch {}
useWave(params.get('wave') || savedWave || 'point');
// The surfer's look: illustrated (default) or the real look (Step 1 toward a realistic body): ?look=real|toon,
// or V in the game; remembered.
try { LOOK.real = localStorage.getItem('rys-rad-waves-look') === 'real'; } catch {}
if (params.has('look')) LOOK.real = params.get('look') === 'real';

const $ = (id) => document.getElementById(id);
const canvas = $('gfx');
const SUN = v3.norm([0.35, 0.5, -0.8]); // behind the wave, so the lip glows
const STEP = 1 / 120;

// ---------- input ----------
const keys = new Set();
const touch = { turn: 0, tilt: 0, crouch: false };
addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
  keys.add(e.code);
  if (e.code === 'KeyC') camMode = (camMode + 1) % 2;
  if (e.code === 'KeyV') { LOOK.real = !LOOK.real; try { localStorage.setItem('rys-rad-waves-look', LOOK.real ? 'real' : 'toon'); } catch {} }
  // On the longboard wave Space walks the board while riding (back -> middle -> front -> middle -> back); otherwise it drops in.
  if (e.code === 'Space' && state === 'play' && WAVE.noseride) { if (!e.repeat) walkPress = 'cycle'; }
  // On waves with `walkKeys` (all of them since 2026-11-18) Up/Down walk the board (Queens) or shuffle the feet (shortboards) instead of steering; Left/Right turn.
  else if (WAVE.walkKeys && state === 'play' && ['ArrowUp', 'KeyW', 'ArrowDown', 'KeyS'].includes(e.code)) { if (!e.repeat) walkPress = e.code === 'ArrowUp' || e.code === 'KeyW' ? 1 : -1; }
  else if (e.code === 'Space' || e.code === 'Enter') startOrRestart();
});
let walkPress = 0; // (a press of Space ('cycle') or a walk button (+1 up / -1 back), handed to the rider once)
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

// Autopilot: works the pocket with S-turns, turning off the top. Drives the title-screen demo
// and the ?auto test mode.
let autoUp = false;
function autopilot() {
  if (rider.tube) { // S-turns, staying off the roof
    if (autoUp && rider.height > 0.3) autoUp = false;
    if (!autoUp && rider.height < 0.08) autoUp = true;
    const a = autoUp ? 0.05 : -0.6; // (angles from level) the water pulls you up: climb gently, point well down to drop
    return { aim: [Math.cos(a), Math.sin(a)] };
  }


  const upTo = WAVE.noseride ? 0.6 : 0.88; // (the longboard turns slowly: come back down sooner)
  if (autoUp && rider.height > upTo) autoUp = false;
  if (!autoUp && rider.height < 0.15) autoUp = true;
  if (Math.cos(rider.phi) < 0) return { aim: [1, -0.3] }; // facing back: turn back down the line
  if (rider.xs < -1) return { aim: [1, 0.6] }; // behind the curl: climb out along the line
  return { tilt: autoUp ? 1 : -1, crouch: rider.inBarrel };
}

// Keyboard: Left/Up turn the board to the surfer's left, Right/Down to their
// right. Touch: swipes do exactly the same (swipe left or up = Left, swipe
// right or down = Right), harder the further you swipe.
function readInput() {
  if (params.has('auto') && !window.__manual) { const walk = walkPress; walkPress = 0; return { ...autopilot(), walk }; } // (tests set __manual to take over; Space still walks the board)
  const k = (...c) => c.some((x) => keys.has(x));
  const turn = (k('ArrowLeft', 'KeyA') ? 1 : 0) - (k('ArrowRight', 'KeyD') ? 1 : 0);
  const tilt = WAVE.walkKeys ? 0 : (k('ArrowUp', 'KeyW') ? 1 : 0) - (k('ArrowDown', 'KeyS') ? 1 : 0); // (Up/Down walk the board on walkKeys waves)
  const walk = walkPress; walkPress = 0;
  // (The rider works along the wave, where turning up the face is a left turn going ahead. On a right (WAVE.dir
  // -1) up the face is the surfer's right, so the surfer's Left / Right go to the rider the other way round.)
  const d = waveDir();
  return {
    turn: d * (touch.turn || turn), tilt: d * (touch.tilt || tilt),
    crouch: k('ShiftLeft', 'ShiftRight', 'KeyJ') || touch.crouch,
    walk,
  };
}

// Touch: swipe anywhere to steer.
let stickId = null, stickStart = [0, 0];
const SWIPE_PX = 45; // full turn at this far from where the swipe started
// The title and game-over panels cover the canvas, so taps land on them.
$('over').addEventListener('pointerdown', (e) => { e.preventDefault(); startOrRestart(); });
$('start').addEventListener('click', (e) => { e.preventDefault(); startOrRestart(); });
// The walk buttons (longboard wave): walk up toward the nose / back toward the tail, one spot per press.
$('walk-up').addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); walkPress = 1; });
$('walk-back').addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); walkPress = -1; });
canvas.addEventListener('pointerdown', (e) => {
  if (state === 'title' || state === 'over') { startOrRestart(); return; }
  stickId = e.pointerId; stickStart = [e.clientX, e.clientY]; swipeWalked = false;
});
let swipeWalked = false; // (walkKeys waves: one walk step per up/down swipe)
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
  // Same as the keys: a sideways swipe is Left/Right, an up/down swipe is
  // Up/Down (whichever way you swiped most).
  const dz = (x) => (Math.abs(x) < 0.2 ? 0 : Math.sign(x) * Math.min(1, Math.abs(x)));
  if (Math.abs(dx) > Math.abs(dy)) { touch.turn = dz(-dx); touch.tilt = 0; }
  else if (WAVE.walkKeys) { touch.turn = 0; touch.tilt = 0; if (!swipeWalked && Math.abs(dy) > 0.5 && state === 'play') { walkPress = dy < 0 ? 1 : -1; swipeWalked = true; } } // (a swipe up / down walks one step)
  else { touch.tilt = dz(-dy); touch.turn = 0; }
});
const endStick = (e) => { if (e.pointerId === stickId) { stickId = null; touch.turn = 0; touch.tilt = 0; } };
addEventListener('pointerup', endStick);
addEventListener('pointercancel', endStick);
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
  nextWave(); // the next wave of the set (its own size)
  resetRider(rider);
  if (params.has('xs')) { rider.xs = Number(params.get('xs')); rider.t = 13.0; rider.pos = frameAt(rider.xs, rider.t).P; }
  score = 0; rideTime = 0;
  $('title').hidden = true;
  $('over').hidden = true;
  flash('Drop in!', SEA.enabled && SEA.waveInSet > 0 ? `wave ${SEA.waveInSet} of ${SEA.setSize} · ${Math.round(waveHeightFt())} ft face` : '');
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
    if (e.type === 'noseride' && e.time > 0.3) {
      const pts = Math.round(150 + e.time * 250);
      score += pts;
      flash(e.time > 3 ? 'LONG NOSERIDE!' : 'Noseride', `${e.time.toFixed(1)}s on the nose  +${pts}`);
    }
    if (e.type === 'barrelEnter') flash('In the barrel!', 'drop from high to drive forward · stay off the roof');
    if (e.type === 'barrelExit' && e.time > 0.4) {
      // Time in the tube, more the deeper you got.
      const avg = e.avgDepth || 0; // 0 at the exit .. 1 at the pinch
      const pts = Math.round(e.time * 600 * (1 + avg * 3));
      score += pts;
      flash(avg > 0.5 ? 'DEEP BARREL!' : 'Tubed!', `${e.time.toFixed(1)}s, ${Math.round(avg * 100)}% deep  +${pts}`);
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
        snap: ['SNAP!', 500, 0.35],
        hang5: ['HANG FIVE!', 250, 0],
        check: ['CHECK TURN', 200, 0.25],
        reentry: ['RE-ENTRY!', 700, 0.4],
        floater: ['FLOATER!', 600, 0.3],
        revert: ['Revert', 150, 0.35],
        lip180: ['180 off the top', 250, 0.3],
        rebound: ['REBOUND!', 500, 0.4],
        rebound180: ['REBOUND 180!', 750, 0.45],
        slash: ['SLASH!', 400, 0.6],
        roundhouse: ['ROUNDHOUSE!', 450, 0.5],
      };
      // Bottom and top turns aren't called out as moves: they just add points.
      const quiet = e.move === 'bottomTurn' || e.move === 'topTurn';
      let [name, base, spray] = MOVES[e.move] || ['Nice', 100, 0];
      if (WAVE.moveNames && WAVE.moveNames[e.move]) name = WAVE.moveNames[e.move]; // (e.g. the longboard's dropknee turn)
      if (e.move === 'slash' && e.tube) { name = 'BARREL SLASH!'; base = 650; }
      // Repeating the same move back to back pays less; linking a bottom
      // turn into a move pays more.
      const repeat = !quiet && e.move === lastMove && rider.time - lastMoveTime < 1.2;
      if (!quiet) { lastMove = e.move; lastMoveTime = rider.time; }
      const pts = Math.round(base * (e.combo ? 1.5 : 1) * (repeat ? 0.4 : 1));
      score += pts;
      snapSpray = Math.max(snapSpray, spray);
      if (!quiet) flash(e.combo ? `${name}` : name, `${e.combo ? 'bottom turn combo  ' : ''}+${pts}`);
    }
    if (e.type === 'fallsLand') burst = 0.3; // the lip lands with you in it
    if (e.type === 'wipe') {
      burst = 0.3;
      flash('WIPEOUT!', e.reason);
    }
  }
}

// ---------- camera ----------
let camPos = [-6, 4, 12], camTarget = [0, 1, 0], aspectNow = 1.6;
// Is there open air all the way from a to b? (no water surface crossed)
function clearView(a, b) {
  for (let k = 1; k < 16; k++) {
    const f = k / 16, q = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
    if (verticalHits(slice(q[0], 6), q[2]).filter((hit) => hit.y > q[1]).length % 2 === 1) return false;
  }
  return true;
}
// The most open spot inside the tube (as far from the water as it can get),
// used to lift the barrel view into the middle of the tube.
const TUBE_CAM_MIN_ROOM = 0.7; // at least this far from any water (m)
function airWithRoof(sl, z, y) {
  const above = verticalHits(sl, z).filter((h) => h.y > y);
  if (above.length % 2 === 1 || !above.length) return false; // in the water, or open sky
  return above.reduce((a, b) => (b.y < a.y ? b : a)).ny < 0; // the nearest water above is the roof
}
function distToSlice(sl, z, y) {
  let best = Infinity;
  for (let i = 0; i < sl.count - 1; i++) {
    const az = sl.z[i], ay = sl.y[i], dz = sl.z[i + 1] - az, dy = sl.y[i + 1] - ay;
    const u = Math.max(0, Math.min(1, ((z - az) * dz + (y - ay) * dy) / (dz * dz + dy * dy || 1)));
    best = Math.min(best, Math.hypot(z - az - dz * u, y - ay - dy * u));
  }
  return best;
}
// The most open point inside the tube at xs (a little favoring the rider's
// height), or null if there's no room in the tube there.
function tubeCenter(xs, nearY) {
  const sl = slice(xs, 6);
  let zMin = Infinity, zMax = -Infinity, yMin = Infinity, yMax = -Infinity;
  for (let i = 0; i < sl.count; i++) {
    if (sl.y[i] < -4) continue;
    zMin = Math.min(zMin, sl.z[i]); zMax = Math.max(zMax, sl.z[i]);
    yMin = Math.min(yMin, sl.y[i]); yMax = Math.max(yMax, sl.y[i]);
  }
  let best = null;
  const N = 28;
  for (let a = 0; a <= N; a++) for (let b = 0; b <= N; b++) {
    const z = zMin + ((zMax - zMin) * a) / N, y = yMin + ((yMax - yMin) * b) / N;
    if (!airWithRoof(sl, z, y)) continue;
    const room = distToSlice(sl, z, y);
    if (room < TUBE_CAM_MIN_ROOM) continue;
    const score = nearY === Infinity
      ? Math.min(room, 1.4) + 0.3 * y // up toward the top of the tube, keeping some room
      : Math.min(room, 2.2) - 0.35 * Math.abs(y - nearY); // roomy enough, then as level with the surfer as it can be
    if (!best || score > best.score) best = { z, y, room, score };
  }
  return best;
}

let lastShot = '';
// Barrel view: on when you're in the barrel and off when you come out of it, at
// the same point (2026-11-17, the user; it used to stay on until you were
// TUBE_VIEW_OUT out on the shoulder). The barrel itself only ends once you're
// properly out from under the lip (rider.js), and after any switch the view
// holds for VIEW_HOLD before it can switch again, so it can't flick back and
// forth right at the lip.
// tubeBlend eases the camera up into the tube and back down.
const VIEW_HOLD = 1.0; // (s) (the user's pick; with the 0.2 m gap between where the barrel starts and ends, rider.js)
let viewHold = 0;
const TUBE_CAM_BACK = 5.5, TUBE_CAM_UP = 1.5; // barrel view: this far behind and above the surfer (m)
let tubeView = false, tubeBlend = 0, camBack = TUBE_CAM_BACK, camBackWant = TUBE_CAM_BACK, lastTubeSpot = null;
function insideWaterAt(q) { return verticalHits(slice(q[0], 6), q[2]).filter((hit) => hit.y > q[1]).length % 2 === 1; }
function updateTubeView(dt) {
  if (!WAVE.tube || rider.mode !== 'surf' || state === 'title') { tubeView = false; tubeBlend = 0; viewHold = 0; return; }
  viewHold = Math.max(0, viewHold - dt);
  if (!tubeView && rider.tube && viewHold === 0) { tubeView = true; viewHold = VIEW_HOLD; }
  else if (tubeView && !rider.tube && viewHold === 0) { tubeView = false; viewHold = VIEW_HOLD; }
  const inTube = rider.tube ? 1 : 0;
  tubeBlend += (inTube - tubeBlend) * (1 - Math.exp(-dt * 3));
}
function updateCamera(dt) {
  updateTubeView(dt);
  let shot = 'surf';
  const p = rider.pos;
  let want, look;
  if (camMode === 3) {
    // Channel photo (testing): fixed out in the channel, looking at the curl
    // and the barrel side-on, like a photo from the channel.
    const sc = WAVE.scale / 1.75;
    want = [8 * sc, 2.0 * sc, 34 * sc];
    look = [0, 3.0 * sc, 3];
    shot = 'photo';
  } else if (tubeView && camMode !== 2) {
    // The barrel view: right behind the surfer, looking out along the wave.
    // In the tube it rises into the middle of the tube (the most open spot
    // there); coming out it eases back down to just behind you, and it only
    // slides in closer if water would be in the way. Everything moves
    // smoothly (it used to pick between fixed distances and jump).
    const eye = [p[0], p[1] + 0.9, p[2]];
    let w = [p[0] - TUBE_CAM_BACK, p[1] + TUBE_CAM_UP, p[2] + 0.3];
    if (tubeBlend > 0.01) {
      // Pinned inside the tube TUBE_CAM_BACK behind the surfer, about
      // TUBE_CAM_UP above them (the most open spot near that height). Deep
      // in the back of the barrel there may be no tube that far back (it's
      // pinched shut), or no clear view: then it looks closer and closer
      // along the inside of the tube, and if there's still nowhere it holds
      // its last spot inside the tube rather than popping out the back.
      let spot = null;
      for (let back = camBackWant; back >= 1.5 && !spot; back -= 0.5) {
        const c = tubeCenter(p[0] - back, p[1] + TUBE_CAM_UP);
        const s = c && [p[0] - back, c.y, c.z];
        if (s && clearView(s, eye)) { spot = s; camBackWant = back; }
      }
      camBackWant = spot ? Math.min(TUBE_CAM_BACK, camBackWant + dt * 1.5) : camBackWant;
      if (spot) {
        camBack += (p[0] - spot[0] - camBack) * (1 - Math.exp(-dt * 6));
        lastTubeSpot = [spot[0] - p[0], spot[1] - p[1], spot[2] - p[2]];
        spot[0] = p[0] - camBack;
      } else if (lastTubeSpot) spot = [p[0] + lastTubeSpot[0], p[1] + lastTubeSpot[1], p[2] + lastTubeSpot[2]];
      if (spot) w = [spot[0], w[1] + (spot[1] - w[1]) * tubeBlend, w[2] + (spot[2] - w[2]) * tubeBlend];
    } else {
      camBack = camBackWant = TUBE_CAM_BACK; lastTubeSpot = null;
      for (let i = 0; i < 10 && (insideWaterAt(w) || !clearView(w, eye)); i++) {
        w = [w[0] + (p[0] - 2.0 - w[0]) * 0.25, w[1] + (p[1] + 1.1 - w[1]) * 0.25, w[2] + (p[2] + 0.2 - w[2]) * 0.25];
      }
    }
    want = w;
    // (aimed out along the tube; from up near the roof it tips down toward
    // the surfer so they sit a little above the middle of the frame, clear
    // of the depth meter)
    const drop = Math.max(0, w[1] - p[1] - TUBE_CAM_UP);
    look = [p[0] + 6 - drop * 1.2, p[1] + 0.4 - drop * 0.35, p[2] + (p[2] - w[2]) * 0.4];
    shot = 'tube';
  } else if (camMode === 0) {
    // From the channel, out in front of the surfer: balanced, so you see the
    // shoulder coming up ahead (right) and the part that's already broken
    // behind you (left) about equally, the surfer a little left of center
    // (more room ahead).
    // On a phone held upright the narrow screen shows far less from side to side: the camera sits 30% further
    // out and aims 2 m ahead of the surfer, so she's in the left third with the shoulder in view (2026-11-18, the
    // user: it was 25% closer, and you lost the view of the shoulder).
    const portrait = aspectNow < 1;
    const near = portrait ? 1.3 : 1;
    const g = WAVE.sizeK || 1; // (further out for a bigger wave: ?size)
    want = [p[0] + 4.0 * near * g, 3.8 * g + p[1] * 0.35, p[2] + 14 * near * g];
    const ahead = portrait ? 2 : 0;
    look = [p[0] + (-0.3 * near + ahead) * g, 1.0 * g + p[1] * 0.55, p[2] - 0.5];
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
  // Never put the camera inside the water.
  if (shot !== 'tube') for (let i = 0; i < 25 && insideWaterAt(want); i++) want[2] += 0.35;
  // Changing shot in or out of the tube is a cut, not a slow pan (a pan
  // would drift through the water).
  if (shot !== lastShot && (shot.startsWith('tube') || lastShot.startsWith('tube'))) {
    camPos = want.slice(); camTarget = look.slice();
  }
  lastShot = shot;
  const k = 1 - Math.exp(-dt * (rider.falls ? 4 : rider.mode === 'wipe' ? 1.5 : shot === 'tube' ? 9 : 5)); // close behind in the barrel view
  for (let i = 0; i < 3; i++) { camPos[i] += (want[i] - camPos[i]) * k; camTarget[i] += (look[i] - camTarget[i]) * k; }
  // Smoothing must never carry the camera into the water.
  if (shot === 'tube' && insideWaterAt(camPos)) camPos = want.slice();
}

// The surfer as placed in the world: position, heading and velocity (the rest of the rider is along the wave).
function worldRider() {
  if (waveDir() > 0) return rider;
  return { ...rider, pos: toWorld(rider.pos), heading: toWorld(rider.heading), vel: toWorld(rider.vel) };
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
  if (params.has('nosea')) SEA.enabled = false; // a single fixed wave (testing)
  if (params.has('seed')) seedSea(Number(params.get('seed')));
  nextWave();
  // Wave picker on the title screen.
  const picker = $('waves');
  const drawPicker = () => {
    picker.innerHTML = '';
    for (const w of WAVES) {
      const b = document.createElement('button');
      b.textContent = w.name;
      b.className = w.id === WAVE.id ? 'on' : '';
      b.addEventListener('pointerdown', (e) => { e.stopPropagation(); });
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        useWave(w.id);
        nextWave();
        renderer.rebuildWave();
        resetRider(rider);
        try { localStorage.setItem('rys-rad-waves-wave', w.id); } catch {}
        const u = new URL(location.href); u.searchParams.set('wave', w.id); history.replaceState(null, '', u);
        drawPicker();
      });
      picker.appendChild(b);
    }
  };
  drawPicker();
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
        stepSea(STEP);
        stepRider(rider, input, STEP);
        input.walk = 0; // (a press counts once, not once per physics step this frame)
        handleEvents();
        for (const e of SEA.events) {
          if (e.type === 'section') flash(e.kind === 'closeout' ? 'Section closing out ahead!' : "It's throwing ahead!", e.kind === 'closeout' ? 'race it, or float over it' : 'get in there');
        }
        acc -= STEP;
      }
      if (rider.mode === 'surf') rideTime += dt; // (only moves score, not just riding)
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
      while (acc >= STEP) { stepSea(STEP); lastInput = autopilot(); stepRider(rider, lastInput, STEP); acc -= STEP; }
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
    // (The shots are worked out along the wave; on a right they're placed in the world peeling the other way.)
    const camW = toWorld(camPos);
    const view = lookAt(camW, toWorld(camTarget), [0, 1, 0]);
    const vp = mul(proj, view);
    const camRight = [view[0], view[4], view[8]], camUp = [view[1], view[5], view[9]];

    const surfing = rider.mode === 'surf';
    const speed = v3.len(rider.vel);
    snapSpray = Math.max(0, snapSpray - dt);
    const sprayAmt = (surfing ? Math.min(1, Math.abs(turnSigned) * 0.3 * Math.min(1, speed / 6) + (rider.pumping ? 0.15 : 0) + (snapSpray > 0 ? 0.5 : 0)) : 0) * Math.min(1, WAVE.scale / 1.25); // (less on small waves)
    const side = v3.norm(v3.cross(n, rider.heading));
    const sprayDir = v3.norm(v3.add(v3.mul(side, turnSigned > 0 ? -1 : 1), v3.mul(rider.heading, -0.4)));
    burst = Math.max(0, burst - dt);

    renderer.render({
      viewProj: vp, invViewProj: invert(vp), camPos: camW, time, sunDir: SUN, peel: PEEL_SPEED,
      rider: rider.pos, spray: sprayAmt, riderVel: rider.vel, dt, sprayDir, frame,
      burst: burst > 0 ? 1 : 0, camRight, camUp,
    }, surferObjects(pose, worldRider(), {
      n: toWorld(n), e2: toWorld(v3.norm(v3.cross(n, v3.norm(v3.rej([1, 0, 0], n))))), turn: turnSigned * waveDir(), // (turning left along the wave is turning right in the world on a right)
      pump: false,
    }, dt), { particles: !params.has('noparticles'), outlines: !params.has('nooutline'), look: LOOK.real });

    frameMs = frameMs * 0.95 + (dt * 1000) * 0.05; // smoothed frame time
    window.__dbg = { view: tubeView, cam: camPos.map((x) => +x.toFixed(2)), pos: rider.pos.map((x) => +x.toFixed(2)), rt: +rider.t.toFixed(2), tube: !!rider.tube, wave: WAVE.id, wind: +(pose.windup || 0).toFixed(2), unl: +(pose.unload || 0).toFixed(2), ms: +frameMs.toFixed(1), phi: +(rider.phi * 57.3).toFixed(0), turn: touch.turn, tilt: touch.tilt, depth: rider.tube ? +tubeDepth(rider).toFixed(2) : null, state, mode: rider.mode, xs: +rider.xs.toFixed(1), y: +rider.pos[1].toFixed(1), score: Math.round(score), reason: rider.wipeReason, slash: !!rider.slash, slide: +(rider.slide * 57.3).toFixed(0), shuf: +(rider.shuf || 0).toFixed(2) };
    // HUD.
    msgTimer -= dt;
    if (msgTimer <= 0) $('msg').classList.remove('pop');
    $('hint').hidden = state !== 'play';
    const walking = state === 'play' && WAVE.noseride && rider.mode === 'surf';
    $('walk-up').hidden = !walking || rider.footGoal >= 1; // (gone once you're all the way up on the nose ...)
    $('walk-back').hidden = !walking || rider.footGoal <= -1; // (... or all the way back on the tail)
    $('hint-nose').hidden = !WAVE.noseride;
    for (const el of document.querySelectorAll('.hint-std')) el.hidden = !!WAVE.walkKeys;
    for (const el of document.querySelectorAll('.hint-walk')) el.hidden = !WAVE.walkKeys;
    for (const el of document.querySelectorAll('.hint-lb')) el.hidden = !WAVE.noseride; // (longboard: walk; shortboard: shuffle the feet)
    for (const el of document.querySelectorAll('.hint-sb')) el.hidden = !!WAVE.noseride;
    $('score').textContent = Math.round(score);
    $('speed').textContent = Math.round(groundSpeed(rider) * 2.237);
    const tube = $('tube');
    tube.style.width = `${Math.min(100, rider.barrelTime * 25)}%`;
    tube.parentElement.classList.toggle('on', rider.inBarrel);
    // Barrel depth meter: exit on the left, the pinch on the right.
    const bm = $('balance');
    bm.hidden = !rider.tube;
    if (rider.tube) {
      const d = tubeDepth(rider);
      const h = Math.max(-0.1, Math.min(1.05, rider.height)); // 0 bottom of the face .. 1 the roof
      $('balance-needle').style.left = `${d * 100}%`;
      $('balance-needle').style.top = `${94 - h * 88}%`; // up = higher on the face
      bm.classList.toggle('danger', d > 0.85 || h > 0.85);
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
main();
