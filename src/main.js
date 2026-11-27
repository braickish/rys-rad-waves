import { createRenderer } from './renderer.js';
import { createRider, resetRider, stepRider, groundSpeed, frameAt, v3, TUNE, useWave, tubeDepth, airSpeedAt, bigAirSpeedAt } from './rider.js';
import { PEEL_SPEED, slice, verticalHits, WAVE, phaseAt, toWorld, waveDir, stepRide, RIDE, SIZE } from './wave.js';
import { createRideLog, logStep, scoreRide, heatTotal } from './judging.js';
import { WAVES } from './waves/index.js';
import { SEA, nextWave, stepSea, seedSea, goToWave } from './sea.js';
import { canMakeVideo, createVideo, shareVideo, saveVideo, VIDEO } from './video.js';
import { createRecording, recordStep, finishRecording, encodeRecording, decodeRecording, createPlayer, playerStep, playerEnd } from './replay.js';
import { applyBuilt } from './waves/built.js';
import { JERSEYS, parseHeatParam, createHeat, stepHeat, canCatch, addWave, addRivalWave, checkOver, standings, judgeSeed, clockText, you as heatYou } from './heat.js';
import { connectLive } from './live-heat.js';
import { loadRecap, createRecapPlayer } from './recap-player.js';
import { perspective, lookAt, mul, invert } from './math.js';
import { createPose, surferObjects, setBoardStyle, setSurferBody, setSurferStance, currentStanceOf } from './surfer.js';
import { PALETTE, cleanStyling, stylingKey, cleanBody, cleanStance } from './styling.js';
import { loadSkinnedGLB } from './glb.js';
import { createBody } from './body.js';
import { startAccountUI } from './account-ui.js';
import { cachedProfile, onPlan, waveLocked, onAccount, SALES_OPEN, currentUser, initAccount, describeAuthError } from './account.js';
import { myBreaks } from './breaks.js';
import { openPaywall, startPaywall } from './paywall.js';
import { initLobby, leaveLobby } from './lobby.js';

const params = new URLSearchParams(location.search);
// Competition judging (?judge; the user, 2026-11-22): every wave scored by a five-judge panel (judging.js), the score sheet
// after each one, the session a heat (best two waves).
// Heats (src/heat.js; accounts plan task 3): ?heat=10m (a timer) or ?heat=5w (a wave count), &bots=N rivals (3; 0-7):
// the waves come from the heat's seed in order, each judged; a WSL-style board at the top left; results at the end.
const HEAT_END = parseHeatParam(params.get('heat'));
const JUDGE = params.has('judge') || !!HEAT_END;
const heat = { scores: [], seen: new Set() }; // (the judges' memory: the session, or the heat in heat mode)
let H = null, heatCaughtAt = 0, sheetTimer = 0, boardKey = '', popTimer = 0;
// A live contest heat (accounts plan task 12): boot.js's window.__contestHeat; `live` is its connection (src/live-heat.js).
const LIVE = window.__contestHeat || null;
let live = null;
let rideLog = null;
// Crumbling wave by default; ?wave=barrel for the barreling one. Must be set
// before the renderer builds the wave mesh.
let savedWave = null;
try { savedWave = localStorage.getItem('rys-rad-waves-wave'); } catch {}
useWave(params.get('wave') || savedWave || 'point');
// The surfer: the skinned MakeHuman body (body.js), the only body since 2026-11-18 (the parts surfer was dropped).
const BODY_FILES = { guy: 'assets/body/guy.glb', girl: 'assets/body/girl.glb' };
const bodies = {}; // which -> { body, loading }
// Colors per vertex (rgb + shine), painted from the bone each vertex follows and its rest-pose position: skin, and
// our own clothes and hair (no clothing or hair assets: the user's call to keep to MakeHuman's core assets and make
// the rest). The guy: boardshorts with a dark waistband, a short haircut. The girl: a teal long-sleeve rash guard
// with darker cuffs, floral bikini bottoms, long light-brown hair. The hairline and eyebrows go by each head's
// measured top and face (headStats).
function dominantBones(m) {
  const out = new Array(m.vertexCount);
  for (let v = 0; v < m.vertexCount; v++) {
    let best = 0, bw = -1;
    for (let k = 0; k < 4; k++) if (m.weights[v * 4 + k] > bw) { bw = m.weights[v * 4 + k]; best = m.joints[v * 4 + k]; }
    out[v] = m.boneNames[best];
  }
  return out;
}
function headStats(m, dom) {
  let top = -1e9, front = -1e9;
  for (let v = 0; v < m.vertexCount; v++) if (dom[v] === 'head') { top = Math.max(top, m.pos[v * 3 + 1]); front = Math.max(front, m.pos[v * 3 + 2]); }
  const capY = top - 0.065;
  let zMin = 1e9, zMax = -1e9, xMax = 0;
  for (let v = 0; v < m.vertexCount; v++) if (dom[v] === 'head' && Math.abs(m.pos[v * 3 + 1] - capY) < 0.015) {
    zMin = Math.min(zMin, m.pos[v * 3 + 2]); zMax = Math.max(zMax, m.pos[v * 3 + 2]); xMax = Math.max(xMax, Math.abs(m.pos[v * 3]));
  }
  // the back of the head, neck and upper back by depth below the top of the head (for long hair lying on it)
  const backAt = (d) => { let mz = 1e9; for (let v = 0; v < m.vertexCount; v++) if (Math.abs(m.pos[v * 3 + 1] - (top - d)) < 0.012 && Math.abs(m.pos[v * 3]) < 0.07) mz = Math.min(mz, m.pos[v * 3 + 2]); return mz; };
  return { top, front, capY, capZ: (zMin + zMax) / 2, capRx: xMax + 0.016, capRz: (zMax - zMin) / 2 + 0.003, backAt };
}
const BODY_LOOKS = {
  guy: { skin: [0.85, 0.56, 0.37, 0.35], hair: [0.3, 0.2, 0.12, 0.25] }, // (tanned, 2026-11-18, the user; the fill light keeps them easy to see)
  girl: { skin: [0.84, 0.55, 0.36, 0.35], // (more tan, 2026-11-18, the user)
    hair: [0.43, 0.29, 0.17, 0.25], hairMid: [0.48, 0.33, 0.2], hairHi: [0.56, 0.39, 0.24] }, // (long brown hair: hana-likeness.jpg, 2026-11-18)
};
const WETSUIT = [0.045, 0.047, 0.055, 0.4];
const TOPPER = [0.06, 0.3, 0.32, 0.3]; // (a dark teal neoprene long-sleeve top: navy matched the blue boardshorts)
// The competition jersey (heats, the user 2026-11-24): a short-sleeve lycra jersey in the heat colour (short sleeves, not
// a vest: the user), over whatever the water calls for (trunks, top, short-sleeve, full suit or hood), from the shoulders
// to just over the waistband, with a darker hem, cuffs and neckline. jersey: '#rrggbb' or null.
const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
// style (task 16, a Pro member's: src/styling.js ids): the suit's colour (any wetsuit or top), and the trunks' (the guy's
// boardshorts; the girl's top and bottoms) colour and pattern.
function bodyColors(m, which, outfit, jersey = null, style = {}) {
  const shade = (rgb, k) => rgb.map((v) => Math.min(1, v * k));
  const SUIT = style.suit ? [...PALETTE[style.suit], 0.4] : null;
  const S0 = style.shorts && PALETTE[style.shorts], S = S0 && [...S0, 0.1];
  const S2 = S0 && [...(S0[0] + S0[1] + S0[2] < 1.2 ? shade(S0.map((v) => v + 0.35), 1) : shade(S0, 0.55)), 0.1], SW = [0.95, 0.95, 0.95, 0.1];
  // (the pattern on a piece of cloth at a point: stripes up and down, or a floral speckle)
  const cloth = (x, y, z) => !S ? null : style.pattern === 'stripes' ? (Math.sin(x * 90 + z * 40) > 0.35 ? S2 : S)
    : style.pattern === 'floral' ? ((f) => (f > 0.45 ? SW : f < -0.55 ? S2 : S))(Math.sin(x * 120 + 0.4) * Math.sin(y * 135 + 1.1) * Math.sin(z * 110)) : S;
  // (a black jersey vanished on a black wetsuit: dark ones go charcoal with light trim)
  const rgb = jersey && hexRgb(jersey), dark = rgb && rgb[0] + rgb[1] + rgb[2] < 0.45;
  const J = rgb && [...(dark ? [0.2, 0.2, 0.22] : rgb), 0.18], Jtrim = J && [...(dark ? [0.72, 0.72, 0.74] : J.slice(0, 3).map((v) => v * 0.55)), 0.18];
  const L = BODY_LOOKS[which], dom = dominantBones(m), hs = headStats(m, dom);
  const shorts = [0.22, 0.33, 0.5, 0.08], band = [0.08, 0.08, 0.1, 0.08];
  const topBlue = [0.6, 0.72, 0.93, 0.12], topLilac = [0.74, 0.68, 0.92, 0.12], topWhite = [0.94, 0.95, 0.98, 0.12];
  const sage = [0.6, 0.66, 0.52, 0.1], cream = [0.93, 0.91, 0.82, 0.1], brown = [0.44, 0.37, 0.27, 0.1];
  const cord = [0.28, 0.2, 0.16, 0.2], cuffBlack = [0.05, 0.05, 0.06, 0.15];
  const backSide = currentStanceOf() === 'regular' ? 'r' : 'l'; // (regular: left foot forward, so the leash is on the right ankle)
  const c = new Float32Array(m.vertexCount * 4);
  const kneeY = m.rest.calf_l.head[1], waistY = m.rest.spine_01.head[1] + 0.02, neckY = m.rest.neck_01.head[1];
  const hipY = m.rest.thigh_l.head[1];
  for (let v = 0; v < m.vertexCount; v++) {
    const bone = dom[v], x = m.pos[v * 3], y = m.pos[v * 3 + 1], z = m.pos[v * 3 + 2];
    let col = L.skin;
    const hipBone = /^(pelvis|spine_01|thigh_[lr]|Root)$/.test(bone) || (bone.startsWith('calf') && y > kneeY + 0.06);
    if (which === 'guy') {
      if (hipBone && y < waistY && y > kneeY + 0.07) col = y > waistY - 0.035 ? band : (cloth(x, y, z) || shorts);
    } else {
      // After the user's reference (hana-likeness.jpg, 2026-11-18): a light-blue floral bralette top with thin
      // straps and a scoop neck, a bare midriff, floral boy-short bottoms (sage, cream and brown), bare arms with a
      // thin bracelet on each wrist, and a black leash cuff on the back ankle. Rest-pose landmarks (girl.glb):
      // bust peak ~0.35 m, waist band ~0.12, the bottoms' legs end just below the crotch.
      const torso = /^(spine_0[23]|clavicle_[lr])$/.test(bone);
      const ax = Math.abs(x), front = z > 0.0;
      const topEdge = front ? (ax < 0.1 ? 0.43 - 0.035 * (1 - ax / 0.1) : 0.41) : 0.37;
      const bottomEdge = front ? 0.29 : 0.3;
      const strap = torso && ax > 0.065 && ax < 0.09 && y >= topEdge && y < 0.53;
      if ((torso && y > bottomEdge && y < topEdge) || strap) {
        col = topBlue;
        const f = Math.sin(x * 170 + 1.3) * Math.sin(y * 190) * Math.sin(z * 150 + 0.7);
        if (f > 0.5) col = topLilac; else if (f < -0.62) col = topWhite;
        col = cloth(x, y, z) || col;
      }
      // the bottoms, by the cut (a Pro choice, task 16): full (the boy-short), classic (a standard bikini: a regular rise,
      // a thin band at the sides, a fuller triangle at the front, the back mostly covered with the leg line a little high
      // at the outer cheeks), or cheeky (a little bikini: a lower rise, a thin string round the hips, a small triangle at
      // the front, and at the back cut high toward the sides, narrowing to a strip down the middle)
      const pv = m.rest.pelvis.head, hipFront = z > pv[2] + 0.01, back = !hipFront, cut = style.cut || 'full', bikini = cut !== 'full'; // ("back": the back and the curve under the cheeks)
      const ax2 = Math.abs(x - pv[0]);
      const backEdge = !back ? -0.05
        : cut === 'cheeky' && ax2 > 0.012 ? -0.03 + 0.11 * Math.min(1, (ax2 - 0.012) / 0.07) ** 0.7
        : cut === 'classic' ? -0.05 + 0.085 * ((u) => u * u * (3 - 2 * u))(Math.min(1, Math.max(0, (ax2 - 0.04) / 0.07))) // (most of the cheeks covered; the leg line rises from about the middle of each toward the outer edge)
        : -0.05;
      const side = ((u) => u * u * (3 - 2 * u))(Math.min(1, Math.max(0, (ax2 - 0.08) / 0.05))); // (0 front and back, 1 on the side of the hip)
      const rise0 = { full: 0.12, classic: 0.1, cheeky: 0.085 }[cut] ?? 0.12, rise = rise0 + 0.012 * side;
      // the band round the hips: ~2.4 cm front and back, taller where it wraps the side of the hip (the mesh's rows aren't
      // level there, and a thinner band broke into a gap between front and back)
      const string = bikini && y > rise - (0.024 + 0.022 * side);
      const t = Math.min(1, Math.max(0, (y + 0.05) / (rise + 0.05)));
      const half = cut === 'cheeky' ? 0.034 + 0.105 * t : 0.05 + 0.12 * t; // (the mesh is ~2 cm a vertex here: narrower and it breaks up)
      const frontCut = bikini && hipFront && !string && ax2 > half;
      if (hipBone && y < rise && (y > backEdge || string) && !frontCut) {
        col = sage;
        const f = Math.sin(x * 120 + 0.4) * Math.sin(y * 135 + 1.1) * Math.sin(z * 110);
        if (f > 0.45) col = cream; else if (f < -0.55) col = brown;
        col = cloth(x, y, z) || col;
      }
      if (bone.startsWith('lowerarm')) { // bracelets
        const hand = m.rest['hand_' + bone.slice(-1)].head, d = Math.hypot(x - hand[0], y - hand[1], z - hand[2]);
        if (d > 0.028 && d < 0.04) col = cord;
      }
      if (bone === 'calf_' + backSide) { // leash cuff
        const ft = m.rest['foot_' + backSide].head, d = y - ft[1];
        if (d > 0.015 && d < 0.075) col = cuffBlack;
      }
    }
    // Outfits by the water's temperature (the user, 2026-11-22; Build a Break's Water slider, looks only): over the swimsuit
    // above, a long-sleeve top ('topper'), a short-sleeve full suit ('shortsleeve': bare forearms and the lower half of the
    // upper arm), a full suit ('wetsuit': Raglan's, the user, 2026-11-18: neck to wrists and ankles, a little sheen so it still
    // shows its shape) or a full suit with a hood ('hood': head and neck too, the face open). Hands and feet stay bare.
    if (outfit === 'wetsuit' || outfit === 'shortsleeve' || outfit === 'hood' || outfit === 'topper') {
      const top = outfit === 'topper';
      const suit = (top ? /^(spine_0[23]|clavicle_[lr]|upperarm_[lr]|lowerarm_[lr])$/ : /^(Root|pelvis|spine_0[123]|clavicle_[lr]|upperarm_[lr]|lowerarm_[lr]|thigh_[lr]|calf_[lr])$/).test(bone)
        || (top && (bone === 'spine_01' || hipBone) && y > waistY - 0.01) // (down to the waistband, all round: a gap of skin showed at the lower back)
        || (bone === 'neck_01' && y < neckY + 0.045);
      let bare = false;
      if (bone.startsWith('lowerarm')) { const h = m.rest['hand_' + bone.slice(-1)].head; bare = outfit === 'shortsleeve' || Math.hypot(x - h[0], y - h[1], z - h[2]) < 0.025; }
      if (bone.startsWith('upperarm') && outfit === 'shortsleeve') { // (sleeves to half way down the upper arm)
        const a = m.rest['upperarm_' + bone.slice(-1)].head, e = m.rest['lowerarm_' + bone.slice(-1)].head;
        const ex = e[0] - a[0], ey = e[1] - a[1], ez = e[2] - a[2];
        bare = ((x - a[0]) * ex + (y - a[1]) * ey + (z - a[2]) * ez) / (ex * ex + ey * ey + ez * ez) > 0.5;
      }
      if (bone.startsWith('calf')) bare = y < m.rest['foot_' + bone.slice(-1)].head[1] + 0.015;
      if (suit && !bare) col = SUIT || (top ? TOPPER : WETSUIT);
    }
    // The jersey's body: everything on the torso below a collar shaped round the neck (2026-11-25, the user: it was
    // splotchy on the chest). The collar sits at the base of the neck, dips in a scoop at the front, and rises out over
    // the shoulders (a fixed height cut across the guy's bigger chest and shoulders, leaving a ragged band of skin);
    // the girl's upper chest follows the neck bone, so that counts too. A thin darker band edges the collar, and a
    // darker hem at the waist.
    if (J && (/^(spine_0[123]|clavicle_[lr]|neck_01)$/.test(bone) || (hipBone && y > waistY - 0.05 && !bone.startsWith('calf') && !bone.startsWith('thigh')))) {
      const nk = m.rest.neck_01.head, ax = Math.abs(x - nk[0]), front = z > nk[2];
      const r = Math.hypot(x - nk[0], z - nk[2]); // (how far out from the neck)
      let collar = nk[1] - 0.015 + 0.14 * Math.min(1, Math.max(0, (r - 0.075) / 0.05));
      if (front && ax < 0.075) collar -= 0.045 * (1 - ax / 0.075); // (the scoop)
      if (y < collar) col = (y < waistY - 0.035 || y > collar - 0.014) ? Jtrim : J;
    }
    if (J && bone.startsWith('upperarm')) { // short sleeves: a little under half way down the upper arm, a darker cuff
      const a = m.rest['upperarm_' + bone.slice(-1)].head, e = m.rest['lowerarm_' + bone.slice(-1)].head;
      const ex = e[0] - a[0], ey = e[1] - a[1], ez = e[2] - a[2];
      const t = ((x - a[0]) * ex + (y - a[1]) * ey + (z - a[2]) * ez) / (ex * ex + ey * ey + ez * ez);
      if (t < 0.45) col = t > 0.39 ? Jtrim : J;
    }
    // hair painted on the scalp: the hairline high at the forehead, above the ears at the sides, low at the nape
    if (outfit === 'hood' && (bone === 'head' || bone === 'neck_01')) {
      // (the hood: all of the head and neck but an oval for the face, from the brow to the chin)
      const zf = z - (hs.front - 0.177), t = hs.top - 0.98;
      const face = zf > 0.1 && y > t + 0.755 && y < t + 0.9 && Math.abs(x) < 0.068 * Math.sqrt(Math.max(0, 1 - ((y - (t + 0.83)) / 0.085) ** 2)) + 0.012;
      if (!face) col = SUIT || WETSUIT;
    } else if (bone === 'head' || bone === 'neck_01') {
      const zf = z - (hs.front - 0.177); // (positions relative to the measured face, like the guy's head it was tuned on)
      const t = hs.top - 0.98;
      const line = t + (zf > 0.08 ? 0.915 : zf > 0 ? 0.86 + (0.915 - 0.86) * (zf / 0.08) : Math.max(which === 'girl' ? 0.74 : 0.79, 0.86 + zf * 1.4));
      if (y > line) col = L.hair;
      if (y > t + 0.872 && y < t + 0.886 && zf > 0.135 && Math.abs(x) > 0.014 && Math.abs(x) < 0.056) col = L.hair; // eyebrows
    }
    c.set(col, v * 4);
  }
  return { colors: c, head: hs };
}
// A little volume of hair over the painted scalp, riding on the head bone (our own: a flattened cap); for the girl
// long hair falling down her back, lighter toward the ends (like the parts surfer's).
function hairObjects(b, mats) {
  const h = b.body.model.rest.head.index, M = Array.from(mats.subarray(h * 16, h * 16 + 16)), hs = b.head, L = BODY_LOOKS[b.which];
  const ell = (cx, cy, cz, rx, ry, rz) => [rx * 2, 0, 0, 0, 0, ry * 2, 0, 0, 0, 0, rz * 2, 0, cx, cy, cz, 1];
  const hood = (params.get('outfit') ?? WAVE.outfit) === 'hood'; // (under a hood: the cap is the hood's crown, black neoprene, and no long hair)
  const out = [{ mesh: 'sphere', model: mul(M, ell(0, hs.capY, hs.capZ, hs.capRx, 0.085, hs.capRz)), color: hood ? WETSUIT.slice(0, 3) : L.hair.slice(0, 3), spec: hood ? 0.4 : 0.25, outline: 0 }];
  if (b.which === 'girl' && !hood) {
    // long, lighter-brown hair falling loose down her back (the user, 2026-11-18; the ponytail is gone): layers lying
    // just behind the measured back of her head, neck and shoulders, wider over the shoulders, lighter toward the
    // ends, and flowing: they lag behind the head's movement on a spring, more the further down they hang.
    const hp = [M[12], M[13], M[14]], dt = b.dt || 1 / 60;
    const st = b.sway ||= { p: hp.slice(), v: [0, 0, 0], off: [0, 0, 0] };
    for (let i = 0; i < 3; i++) {
      const vel = (hp[i] - st.p[i]) / dt; // the head's velocity
      const acc = -60 * st.off[i] - 9 * st.v[i] - (vel - (st.lastVel?.[i] ?? vel)) / dt * 0.6; // spring back, damped, pushed by the head's acceleration
      st.v[i] += acc * dt; st.off[i] += st.v[i] * dt;
      st.off[i] = Math.max(-0.08, Math.min(0.08, st.off[i]));
    }
    st.lastVel = hp.map((x, i) => (x - st.p[i]) / dt); st.p = hp;
    // the top of the hair moves with the head; further down it lies on her upper back (riding the spine_03 bone),
    // so looking down at the board doesn't swing it into her back
    const sp = b.body.model.rest.spine_03.index, MS = Array.from(mats.subarray(sp * 16, sp * 16 + 16));
    const lerpC = (a, c, t) => a.map((x, i) => x + (c[i] - x) * t);
    // a smooth fall in three overlapping, flattened pieces (more, smaller ones read as stacked rolls): over the back
    // of the head, a long sheet down her upper back fanning out over the shoulders, and the lighter ends
    const zAt = (d, rz) => Math.min(hs.backAt(d), hs.capZ - hs.capRz + 0.01) - rz * 0.4;
    const pieces = [ // [bone matrix, depth of center, half width, half height, half depth, color, sway]
      [M, 0.13, hs.capRx * 0.97, 0.12, 0.045, L.hair.slice(0, 3), 0.1],
      [MS, 0.32, 0.135, 0.2, 0.024, lerpC(L.hair.slice(0, 3), L.hairMid, 0.5), 0.5],
      [MS, 0.48, 0.12, 0.1, 0.02, L.hairHi, 1],
    ];
    for (const [B, d, rx, ry, rz, color, k] of pieces) {
      const m4 = mul(B, ell(0, hs.top - d, zAt(d, rz), rx, ry, rz));
      m4[12] += st.off[0] * k; m4[13] += st.off[1] * k * 0.5; m4[14] += st.off[2] * k;
      out.push({ mesh: 'sphere', model: m4, color, spec: 0.3, outline: 0 });
    }
  }
  return out;
}
// Fetch a body (once): both are fetched at start-up (~1 MB each), the current wave's first.
// The girl's shape (the user, 2026-11-25): rounder, fuller buttocks than MakeHuman's. Each cheek's back surface is pushed
// out in a smooth round bump (back, a little down and a little wide), in the rest pose before rigging, so every pose
// carries it; the normals around it are worked out again so the light follows the new shape.
const BUTT = { depth: 0.022, down: 0.006, wide: 0.006, cx: 0.066, cy: 0.005, rx: 0.052, ry: 0.07 };
function shapeGirl(m, k = BUTT) {
  const pv = m.rest.pelvis.head, moved = new Set();
  for (let v = 0; v < m.vertexCount; v++) {
    const x = m.pos[v * 3] - pv[0], y = m.pos[v * 3 + 1], z = m.pos[v * 3 + 2];
    const back = Math.min(1, Math.max(0, (pv[2] - 0.015 - z) / 0.035)); // (only the back surface; 0 at the sides and front)
    if (!back) continue;
    const s = Math.sign(x) || 1;
    const w = back * Math.exp(-(((x - s * k.cx) / k.rx) ** 2 + ((y - k.cy) / k.ry) ** 2));
    if (w < 0.01) continue;
    m.pos[v * 3] += s * k.wide * w; m.pos[v * 3 + 1] -= k.down * w; m.pos[v * 3 + 2] -= k.depth * w;
    moved.add(v);
  }
  // normals again, for the moved vertices (from the triangles they're in)
  const acc = new Float32Array(m.vertexCount * 3), idx = m.index;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b2 = idx[t + 1], c = idx[t + 2];
    if (!moved.has(a) && !moved.has(b2) && !moved.has(c)) continue;
    const P = (i, j) => m.pos[i * 3 + j];
    const ux = P(b2, 0) - P(a, 0), uy = P(b2, 1) - P(a, 1), uz = P(b2, 2) - P(a, 2), wx = P(c, 0) - P(a, 0), wy = P(c, 1) - P(a, 1), wz = P(c, 2) - P(a, 2);
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    for (const i of [a, b2, c]) { acc[i * 3] += nx; acc[i * 3 + 1] += ny; acc[i * 3 + 2] += nz; }
  }
  for (const v of moved) {
    const nx = acc[v * 3], ny = acc[v * 3 + 1], nz = acc[v * 3 + 2], l = Math.hypot(nx, ny, nz);
    if (!l) continue;
    const old = [m.nrm[v * 3], m.nrm[v * 3 + 1], m.nrm[v * 3 + 2]], sgn = nx * old[0] + ny * old[1] + nz * old[2] < 0 ? -1 : 1; // (keep it facing out, as the file's did)
    m.nrm[v * 3] = sgn * nx / l; m.nrm[v * 3 + 1] = sgn * ny / l; m.nrm[v * 3 + 2] = sgn * nz / l;
  }
  return moved.size;
}
window.__shapeGirl = shapeGirl; // (tests)
function loadBody(which) {
  const b = bodies[which] ||= { body: null, loading: null };
  if (!b.body && !b.loading) b.loading = loadSkinnedGLB(BODY_FILES[which]).then((m) => { if (which === 'girl') shapeGirl(m); const bc = bodyColors(m, which); Object.assign(b, { body: createBody(m), model: m, colors: bc.colors, outfits: { ':': bc.colors }, head: bc.head, which }); }).catch((e) => console.error('body', e));
  return b;
}
window.__bodyColors = bodyColors; // (tests: the paint map, test/jersey.mjs)
// The look worn now (task 16): a replay wears the recording's (so you see someone else's wave as they rode it); otherwise
// yours, while you have Pro (as the database lets you save it), and the game's own look without.
let planPro = false, planSeen = false;
onPlan((p) => { planPro = !!p.pro; planSeen = true; });
// Your look loads from your profile (and Pro from your plan) a moment after the game starts; until then the game's own
// surfer showed, then switched: a different-coloured surfer for a second (the user, 2026-11-26). So the look you last wore
// is kept in this browser (with your account's id) and worn straight away while your profile is on its way; signed out,
// it's dropped. With nothing kept yet (a new device) the surfer waits for your look, up to `LOOK_WAIT` ms.
const LOOK_KEY = 'rys-rad-waves-look', LOOK_WAIT = 2500;
let lookKept = null, accountKnown = false;
try { lookKept = JSON.parse(localStorage.getItem(LOOK_KEY) || 'null'); } catch {}
initAccount().then(() => { accountKnown = true; }, () => { accountKnown = true; });
const member = () => { const u = currentUser(); return !!(u && !u.is_anonymous); };
// (your look is known: signed out, or signed in with your profile and plan both read)
const lookKnown = () => accountKnown && (!member() || (!!cachedProfile() && planSeen));
// (the kept look, while yours isn't known yet: only if it's this account's, or before the account has been read)
const keptLook = () => (!lookKept || lookKnown() || (accountKnown && (!member() || lookKept.uid !== currentUser().id)) ? null : lookKept);
function keepLook() {
  if (!lookKnown()) return;
  const want = member() ? { uid: currentUser().id, surfer: cachedProfile()?.surfer || null, stance: cachedProfile()?.stance || null, styling: planPro ? cachedProfile()?.styling || null : null } : null;
  const now = JSON.stringify(want);
  if (JSON.stringify(lookKept) === now) return;
  lookKept = want;
  try { if (want) localStorage.setItem(LOOK_KEY, now); else localStorage.removeItem(LOOK_KEY); } catch {}
}
// Which surfer (male or female): a replay's rider's, else yours (profiles.surfer, free), else the wave's own.
function currentBody() {
  const pick = player ? cleanBody(player.rec.surfer) : cleanBody(cachedProfile()?.surfer ?? keptLook()?.surfer);
  return pick || (WAVE.surfer === 'girl' ? 'girl' : 'guy');
}
// Regular or goofy: a replay's rider's, else yours (profiles.stance, free), else the wave's own.
const currentStance = () => (player ? cleanStance(player.rec.stance) : cleanStance(params.get('stance')) || cleanStance(cachedProfile()?.stance ?? keptLook()?.stance)) || null; // (?stance=regular|goofy: try one, for testing)
function currentStyle() {
  if (player) return cleanStyling(player.rec.styling);
  const kept = keptLook();
  if (kept) return cleanStyling(kept.styling);
  return planPro ? cleanStyling(cachedProfile()?.styling) : {};
}
function wantBody() {
  if (!renderer) return null;
  const which = currentBody();
  setSurferBody(which); window.__bodyWhich = which; // (tests: who's riding)
  setSurferStance(currentStance()); window.__stance = currentStanceOf();
  if (!BODY_FILES[which]) return null; // (not built yet: the parts surfer)
  keepLook();
  // (a new device, your look not known yet: the surfer waits for it rather than showing the game's own and switching)
  if (!player && !lookKnown() && !keptLook() && performance.now() < LOOK_WAIT && !H) return null;
  const b = loadBody(which);
  // (the wave's outfit, e.g. Raglan's wetsuit, painted once per body and outfit)
  // (?outfit=topper|shortsleeve|wetsuit|hood: try a look on any wave, for testing)
  const outfit = params.get('outfit') ?? (WAVE.outfit || ''), jersey = H ? heatYou(H).jersey.color : recap ? recapJersey : null; // (a recap: the heat's jersey on each wave)
  const style = currentStyle(), sk = stylingKey(style) + ':' + currentStanceOf(), key = which + ':' + outfit + ':' + (jersey || '') + ':' + sk; // (the stance moves the leash)
  if (b.body && renderer.bodyShown !== key) {
    b.colors = b.outfits[outfit + ':' + (jersey || '') + ':' + sk] ||= bodyColors(b.model, which, outfit, jersey, style).colors;
    renderer.setBody(b.body.model, b.colors); renderer.bodyShown = key;
    setBoardStyle(style.board && PALETTE[style.board], style.nose && PALETTE[style.nose]);
    window.__styleKey = stylingKey(style); // (tests: the look being worn)
  }
  return b.body ? b : null;
}

const $ = (id) => document.getElementById(id);
const canvas = $('gfx');
const SUN = v3.norm([0.35, 0.5, -0.8]); // behind the wave, so the lip glows
const STEP = 1 / 120;

// ---------- input ----------
const keys = new Set();
const touch = { turn: 0, tilt: 0, crouch: false };
addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return; // (typing an email on the title screen)
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
  keys.add(e.code);
  if (vid || !$('video').hidden) { if (e.code === 'Escape') closeVideo(); return; } // (making or showing a video: Space doesn't paddle out under it)
  if (e.code === 'KeyC') camMode = (camMode + 1) % 2;
  if (e.code === 'Escape' && player) { exitReplay(); return; }
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
    const [lo, hi] = WAVE.tubeFloor ? [0.5, 0.68] : [0.08, 0.3]; // (Trestles: the tube is up on the face, above where the lip lands)
    if (autoUp && rider.height > hi) autoUp = false;
    if (!autoUp && rider.height < lo) autoUp = true;
    const a = autoUp ? 0.05 : WAVE.tubeFloor ? -0.2 : -0.6; // (angles from level; a gentle drop in Trestles' small tube) the water pulls you up: climb gently, point well down to drop
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
    stallHold: WAVE.walkKeys && k('ArrowDown', 'KeyS'), // (holding back keeps a stall going, rider.js)
  };
}

// Touch: swipe anywhere to steer.
let stickId = null, stickStart = [0, 0];
const SWIPE_PX = 45; // full turn at this far from where the swipe started
// An up/down swipe has to be near vertical (within ~30 deg of straight up or down: |dy| > VERTICAL x |dx|); anything flatter
// steers (the user, 2026-11-27: steering can wander, up/down should be deliberate; at 45 deg a turn drifting down walked back)
const VERTICAL = 1.7;
// The title and game-over panels cover the canvas, so taps land on them.
$('over').addEventListener('pointerdown', (e) => { e.preventDefault(); startOrRestart(); });
$('judge').addEventListener('pointerdown', (e) => { e.preventDefault(); startOrRestart(); });
$('start').addEventListener('click', (e) => { e.preventDefault(); startOrRestart(); });
// The landing: three ways in. Free surf lists every break (and yours, signed in) with DROP IN; Build a break is a link to
// the builder; Compete live offers Solo (a heat against bots: the waves, then Start heat with its length), and live heats with
// friends later (task 11). A heat is set up as the page loads, so a heat link (?heat=) opens straight on Solo, and Free
// surf from there reloads without it (?menu=surf opens Free surf). A link that lands on a locked wave, or on a saved
// break, opens Free surf.
let step = null;
const STEPS = { surf: 'Free surf', compete: 'Compete live', solo: 'Solo heat', host: 'Host a contest', lobby: 'Contest', join: 'Join a contest' };
function showStep(which) {
  if (step === 'lobby' && which !== 'lobby') leaveLobby();
  step = which;
  $('home').hidden = !!which; $('step').hidden = !which;
  if (!which) return;
  $('step-title').textContent = STEPS[which];
  $('compete-menu').hidden = which !== 'compete' && which !== 'join';
  $('go-solo').hidden = $('go-host').hidden = which === 'join'; // (Join: just the code box, for anyone)
  $('host-form').hidden = which !== 'host';
  $('lobby').hidden = which !== 'lobby';
  $('waves').hidden = which !== 'surf' && which !== 'solo';
  $('my-breaks-wrap').hidden = which !== 'surf' || !$('my-breaks').children.length;
  $('heat-start').hidden = which !== 'solo';
  $('start').hidden = which !== 'surf'; // (Solo has Start heat)
  if (which !== 'surf') $('lock-note').hidden = true;
}
const leaveHeat = () => { const u = new URL(location.href); for (const k of ['heat', 'seed', 'play']) u.searchParams.delete(k); u.searchParams.set('menu', 'surf'); location.href = u; };
// Build a break and Compete live come with Pro (the user, 2026-11-25): without it they show greyed with a lock, and a
// tap opens the Go Pro sheet. Only once sales are open (SALES_OPEN), like the wave locks. Joining a contest stays
// free (the user, 2026-11-25): its link goes straight to the lobby, and "Have a contest code?" opens the code box.
const PRO_DOORS = { 'go-build': ['Build a break', 'Building breaks comes with Pro.'], 'go-compete': ['Compete live', 'Competing live comes with Pro.'] };
let doorsLocked = false;
onPlan((p) => {
  doorsLocked = SALES_OPEN && !p.pro;
  for (const [id, [label]] of Object.entries(PRO_DOORS)) {
    $(id).textContent = (doorsLocked ? '🔒 ' : '') + label;
    $(id).classList.toggle('locked', doorsLocked);
    $(id).setAttribute('aria-disabled', String(doorsLocked));
  }
  $('go-code').hidden = !doorsLocked; // (joining a contest is free: by code here, or by its link)
});
const proDoor = (id, e) => {
  if (!doorsLocked) return false;
  e.preventDefault();
  openPaywall({ want: 'pro', why: PRO_DOORS[id][1] });
  return true;
};
$('go-build').addEventListener('click', (e) => { e.stopPropagation(); proDoor('go-build', e); });
$('go-code').addEventListener('click', (e) => { e.stopPropagation(); showStep('join'); setTimeout(() => $('join-code').focus(), 0); });
$('go-surf').addEventListener('click', (e) => { e.stopPropagation(); if (HEAT_END) leaveHeat(); else showStep('surf'); });
$('go-compete').addEventListener('click', (e) => { e.stopPropagation(); if (!proDoor('go-compete', e)) showStep('compete'); });
$('go-solo').addEventListener('click', (e) => { e.stopPropagation(); showStep('solo'); });
// Start heat (Solo): the length from the dropdown (remembered). A heat is set up as the page loads, so a new length
// reloads with ?heat=<length>&play; the heat that's already set up just starts.
const HEAT_LEN_KEY = 'rys-rad-waves-heat-len';
{
  const sel = $('heat-len');
  const label = (h) => (h.minutes ? `${h.minutes} minute${h.minutes === 1 ? '' : 's'}` : `${h.waves} wave${h.waves === 1 ? '' : 's'}`);
  const same = (v) => JSON.stringify(parseHeatParam(v)) === JSON.stringify(HEAT_END);
  if (HEAT_END && ![...sel.options].some((o) => same(o.value))) sel.add(new Option(`${label(HEAT_END)} ▾`, params.get('heat'))); // (?heat=1m and the like)
  let stored = null; try { stored = localStorage.getItem(HEAT_LEN_KEY); } catch {}
  sel.value = HEAT_END ? [...sel.options].find((o) => same(o.value)).value : [...sel.options].some((o) => o.value === stored) ? stored : '10m';
  sel.addEventListener('change', () => { try { localStorage.setItem(HEAT_LEN_KEY, sel.value); } catch {} });
  for (const ev of ['pointerdown', 'click']) sel.addEventListener(ev, (e) => e.stopPropagation());
  $('start-heat').addEventListener('click', (e) => {
    e.stopPropagation(); e.preventDefault();
    if (same(sel.value)) { startOrRestart(); return; }
    const u = new URL(location.href);
    u.searchParams.set('heat', sel.value); u.searchParams.delete('seed'); u.searchParams.set('play', '');
    location.href = u.href.replace(/play=(&|$)/, 'play$1');
  });
}
$('step-back').addEventListener('click', (e) => { e.stopPropagation(); showStep(['solo', 'host'].includes(step) || (step === 'lobby' && !doorsLocked) ? 'compete' : null); });
for (const id of ['home', 'step']) $(id).addEventListener('pointerdown', (e) => e.stopPropagation());
showStep(HEAT_END ? 'solo' : params.get('menu') === 'surf' || params.has('break') ? 'surf' : null); // (set up as the page starts, so the buttons work before the game has loaded)
initLobby(showStep, { inHeat: !!HEAT_END, joinStep: () => (doorsLocked ? 'join' : 'compete') }); // (Compete live's Host and Join, and the lobby: src/lobby.js; ?contest= and ?host= open them)
if (params.has('menu')) { const u = new URL(location.href); u.searchParams.delete('menu'); history.replaceState(null, '', u); }
startAccountUI();
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
  // Same as the keys: a sideways swipe is Left/Right, an up/down swipe is Up/Down: only a near-vertical one (VERTICAL); the rest
  // steers.
  const dz = (x) => (Math.abs(x) < 0.2 ? 0 : Math.sign(x) * Math.min(1, Math.abs(x)));
  if (Math.abs(dy) <= VERTICAL * Math.abs(dx)) { touch.turn = dz(-dx); touch.tilt = 0; }
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
let turnSigned = 0, snapSpray = 0, vSnapSpray = 0, lastMove = '', lastMoveTime = -9;
const pose = createPose();
let lastInput = {};
// Replays (src/replay.js; accounts plan task 2): every ride is recorded (its wave's address, the inputs each step,
// checkpoints); the last one can be watched again or saved, and ?replay=<url> (or dropping a saved file on the page) plays
// one. While a replay plays, `player` feeds the inputs instead of the keys.
let recording = null, lastRecording = null, player = null;
let replayFrom = null; // ('results': a heat's best wave, watched from the results card; the replay goes back there)
// (the URL options that change the physics: a recording keeps them, and a replay reloads with them if they differ)
const PHYS_PARAMS = ['size', 'map', 'moveaccel', 'nosea', 'ridet'];
const physicsParams = () => { const o = {}; for (const k of PHYS_PARAMS) if (params.has(k)) o[k] = params.get(k); return o; };

// Play a recording: the wave from its address (a built break from its payload), the inputs from the recording.
function startReplay(rec) {
  const want = rec.params || {};
  replayFrom = state === 'results' ? 'results' : null;
  if (PHYS_PARAMS.some((k) => (want[k] ?? null) !== (params.get(k) ?? null))) { // (read at load: reload with the recording's)
    try { sessionStorage.setItem('rys-rad-waves-replay', encodeRecording(rec)); } catch {}
    const u = new URL(location.href);
    for (const k of PHYS_PARAMS) { if (want[k] != null) u.searchParams.set(k, want[k]); else u.searchParams.delete(k); }
    u.searchParams.set('replay', 'session'); u.searchParams.delete('play');
    location.replace(u); return;
  }
  if (rec.built) applyBuilt(rec.built);
  useWave(rec.wave); renderer.rebuildWave();
  seedSea(rec.seed); goToWave(rec.n);
  resetRider(rider);
  if (want.ridet && WAVE.bar) { for (let i = 0; i < Number(want.ridet) * 120; i++) stepRide(1 / 120); resetRider(rider); }
  player = createPlayer(rec); recording = null; sheetTimer = 0;
  score = 0; rideTime = 0; lastMove = ''; lastMoveTime = -9; rideLog = createRideLog();
  state = 'play';
  for (const id of ['title', 'over', 'judge', 'results']) $(id).hidden = true;
  $('replay-badge').hidden = false;
  $('replay-exit').textContent = replayFrom === 'results' ? '✕ Back to results' : '✕ Stop';
  if (!recap) flash('Replay', `${WAVE.name} · ${(rec.steps * rec.step).toFixed(1)}s`); // (a recap has its own graphics)
}
// After a replay: did it ride the same as the recording?
function showReplayEnd(s) {
  if (recap) { player = null; recap.rideEnded(); return; } // (a recap: on to its next wave; a recap's video goes on too)
  if (vid) { player = null; $('replay-badge').hidden = true; vid.ending = true; return; } // (making a video: this frame is its last, tick finishes it)
  const rec = player.rec, e = playerEnd(player, rider), j = rec.result?.judge || { seed: 1, seen: [] };
  const judged = scoreRide(rideLog, { size: (WAVE.sizeK || 1) * SIZE, seed: j.seed, seen: new Set(j.seen) }).score;
  const was = rec.result || {};
  const same = e.sameEnd && s === was.score && judged === was.judged?.score;
  window.__replayResult = { same, score: s, recorded: was.score, judged, recordedJudged: was.judged?.score, drift: e.drift, snaps: player.snaps, steps: e.steps };
  $('over-reason').textContent = same ? 'Replay: the same ride ✓' : `Replay: off by ${e.drift < 1 ? e.drift.toFixed(3) : 'a lot'} (re-synced ${player.snaps}x)`;
  $('over-score').textContent = s;
  $('over-time').textContent = (e.steps * rec.step).toFixed(1);
  $('over-note').textContent = `recorded ${was.score ?? '?'} points · judged ${judged.toFixed(2)} (recorded ${was.judged?.score?.toFixed(2) ?? '?'})`;
  $('replay-badge').hidden = true;
  player = null;
  if (replayFrom === 'results') { // (straight back to the results, with how the replay went)
    replayFrom = null;
    showResults();
    $('results-note').textContent = same ? `Replay: the same ride ✓ · ${judged.toFixed(2)}` : `Replay: off by ${e.drift < 1 ? e.drift.toFixed(3) : 'a lot'}`;
    return;
  }
  showReplayButtons();
  $('over').hidden = false;
}
// Leave a replay part way (the badge's ✕, or Esc): back to the results it came from, or the end card.
function exitReplay() {
  if (vid) { closeVideo(); return; }
  if (!player) return;
  player = null;
  $('replay-badge').hidden = true;
  if (replayFrom === 'results') { replayFrom = null; showResults(); return; }
  state = 'over';
  showReplayButtons();
  $('over').hidden = false;
}
$('replay-badge').addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); exitReplay(); });
// Switch wave (free surf's end card): back to the title on Free surf, the waves to pick from and DROP IN, with the
// demo surfer riding behind as on arrival.
function toWaves() {
  state = 'title'; sheetTimer = 0; player = null;
  for (const id of ['over', 'judge', 'results']) $(id).hidden = true;
  $('replay-badge').hidden = true;
  resetRider(rider);
  $('title').hidden = false;
  showStep('surf');
}
// The replay buttons on the game-over card and the score sheet (the last ride's recording).
function showReplayButtons() {
  for (const b of document.querySelectorAll('.replay-btns')) b.hidden = !lastRecording;
  for (const b of document.querySelectorAll('.replay-btns [data-act="share"]')) b.hidden = !canMakeVideo(); // (no WebCodecs: Save replay only)
  // Free surf (the user, 2026-11-25): Switch wave instead of Save replay; a heat keeps Save replay (its waves are set)
  for (const b of document.querySelectorAll('.replay-btns [data-act="save"]')) b.hidden = !H;
  for (const b of document.querySelectorAll('.replay-btns [data-act="switch"]')) b.hidden = !!H;
}

// Share video (plans/2026-11-24-share-ride-video.md step 1): the last ride's replay, as it plays, made into an MP4 on the
// device (src/video.js) and handed to the share sheet. While it's made, tick runs one game frame per video frame (a fixed
// 1/30 s, however long the frame takes to draw and encode) and copies each into the video as soon as it's drawn.
let vid = null; // ({ enc, rec, back, ending, p }: the video being made)
let madeVideo = null; // ({ blob, name }: the last one made, for the panel's Share / Save)
const videoPanel = (title, { bar = 0, note = '', ready = false, cancel = '✕ Cancel' } = {}) => {
  $('video').hidden = false;
  $('video-title').textContent = title;
  $('video-bar').style.width = `${Math.round(bar * 100)}%`;
  $('video-bar').parentElement.hidden = ready;
  $('video-note').textContent = note;
  $('video-share').hidden = !ready; $('video-save').hidden = !ready;
  $('video-close').textContent = cancel;
};
// A contest's recap (accounts plan task 17; src/recap-player.js): index.html?recap=<code> rides the final's best waves
// again with broadcast graphics, and makes it a video. The game's own panels and HUD step aside (body.recap).
let recap = null, recapData = null, recapJersey = null;
const RECAP_AFTER = 2.4, RECAP_END = 6;
async function startRecap(code) {
  document.body.classList.add('recap');
  for (const id of ['title', 'over', 'judge', 'results']) $(id).hidden = true;
  $('recap-bar').hidden = false; $('recap-name').textContent = 'Loading the recap…';
  recapData = await loadRecap(code.toUpperCase());
  $('recap-name').textContent = `${recapData.contest.name} · ${recapData.heat.final && recapData.heat.rounds > 1 ? 'the final' : 'the heat'}`;
  $('recap-exit').href = `contest.html?c=${encodeURIComponent(recapData.contest.code)}`;
  recap = createRecapPlayer(recapData, {
    startReplay: (rec) => startReplay(rec),
    setCam: (m) => { camMode = m; },
    setJersey: (id) => { recapJersey = JERSEYS.find((j) => j.id === id)?.color || null; },
    progress: () => (player ? player.step / Math.max(1, player.rec.steps) : 1),
    canvas,
    onDone: () => {
      if (vid?.recap) vid.ending = true;
      $('recap-again').hidden = false;
    },
  });
  window.__recap = recapData; // (tests)
  recap.start();
  if (params.has('make')) startRecapVideo(); // (&make: the lobby's "Make the recap video", for the host)
}
$('recap-again').addEventListener('click', (e) => { e.stopPropagation(); if (recap && !vid) recap.start(); });
$('recap-video').addEventListener('click', (e) => { e.stopPropagation(); startRecapVideo(); });
// The host's recap video goes up with the contest (the recaps bucket, save_recap), for its page and everyone's profile.
async function keepRecap(blob, seconds) {
  const note = $('video-note'), was = note.textContent;
  note.textContent = `${was} · keeping it with the contest…`;
  try {
    const c = await initAccount(), path = `${recapData.contest.id}/recap.mp4`;
    const up = await c.storage.from('recaps').upload(path, blob, { upsert: true, contentType: 'video/mp4' });
    if (up.error) throw up.error;
    const { error } = await c.rpc('save_recap', { contest_id: recapData.contest.id, video_path: path, seconds: +seconds.toFixed(1) });
    if (error) throw error;
    note.textContent = `${was} · kept on the contest page ✓`;
    window.__recapKept = true; // (tests)
  } catch (err) { console.warn('keep recap', err); note.textContent = `${was} · couldn't keep it with the contest (${err.message})`; }
}
// The recap as an MP4 (the share video's encoder, src/video.js): from the top, one frame at a time, graphics and all.
async function startRecapVideo() {
  if (!recap || vid) return;
  videoPanel('Making the recap video…', { note: 'getting the encoder ready' });
  let enc;
  try { enc = await createVideo(canvas, { bitrate: 3.5e6 }); } catch (err) { videoPanel("Couldn't make a video", { note: err.message, cancel: 'Close' }); return; } // (a lower bitrate than a ride's share video: recaps run a minute or more, and are kept)
  if ($('video').hidden) { enc.cancel(); return; }
  const total = recapData.shown.reduce((a, s) => a + s.rec.steps * s.rec.step + RECAP_AFTER, 0) + RECAP_END;
  vid = { enc, rec: null, back: null, ending: false, p: null, total, recap: true };
  recap.start();
  videoPanel('Making the recap video…', { note: `${enc.w}×${enc.h}` });
}

async function startVideo() {
  if (vid || !lastRecording || player) return;
  const back = ['over', 'judge'].find((id) => !$(id).hidden) || 'over';
  const rec = decodeRecording(encodeRecording(lastRecording));
  videoPanel('Making your video…', { note: 'getting the encoder ready' });
  let enc;
  try { enc = await createVideo(canvas); } catch (err) { videoPanel("Couldn't make a video", { note: err.message, cancel: 'Close' }); vid = null; madeVideo = null; $('video').dataset.back = back; return; }
  if ($('video').hidden) { enc.cancel(); return; } // (closed while it got ready)
  vid = { enc, rec, back, ending: false, p: null, total: Math.min(VIDEO.maxSeconds, rec.steps * rec.step) };
  startReplay(rec);
  $('replay-badge').hidden = true;
  for (const id of ['over', 'judge']) $(id).hidden = true;
  videoPanel('Making your video…', { note: `${enc.w}×${enc.h}` });
}
// Called each frame while making one, right after the frame is drawn (the canvas is only readable in this task).
function videoFrame() {
  const v = vid;
  if (!v.recap && v.enc.seconds >= VIDEO.maxSeconds) v.ending = true; // (a long ride: the video stops here)
  v.p = v.enc.capture(v.recap ? recap.overlay : null);
  $('video-bar').style.width = `${Math.min(100, Math.round(100 * v.enc.seconds / v.total))}%`;
  if (v.ending) v.p = v.p.then(() => finishVideo(v));
  return v.p.catch((err) => videoFailed(v, err));
}
async function finishVideo(v) {
  if (vid !== v) return;
  videoPanel('Finishing…', { bar: 1 });
  const blob = await v.enc.finish();
  vid = null; player = null; state = 'over';
  const name = v.recap ? `rys-rad-waves-recap-${params.get('recap')}.mp4` : `rys-rad-waves-${v.rec.wave}-${new Date().toISOString().slice(0, 16).replace(/[:T-]/g, '')}.mp4`;
  madeVideo = { blob, name, title: v.recap ? `${recapData.contest.name} · Ry's Rad Waves` : `My ride at ${WAVE.name} · Ry's Rad Waves` };
  window.__video = { size: blob.size, frames: v.enc.frames, w: v.enc.w, h: v.enc.h, seconds: v.enc.seconds, blob }; // (test/video.mjs)
  $('video').dataset.back = v.back;
  videoPanel('Your video is ready', { ready: true, note: `${v.enc.seconds.toFixed(1)} s · ${(blob.size / 1e6).toFixed(1)} MB`, cancel: '✕ Close' });
  if (v.recap && recapData.contest.host && currentUser()?.id === recapData.contest.host) keepRecap(blob, v.enc.seconds); // (the host's: kept with the contest)
}
function videoFailed(v, err) {
  if (vid !== v) return;
  v.enc.cancel(); vid = null; player = null; state = 'over';
  $('video').dataset.back = v.back;
  videoPanel("Couldn't make a video", { note: err?.message || String(err), cancel: 'Close' });
}
// Cancel (while it's made) or close: back to the card it was made from.
function closeVideo() {
  if (vid) { vid.enc.cancel(); $('video').dataset.back = vid.back; vid = null; player = null; state = 'over'; }
  $('replay-badge').hidden = true;
  $('video').hidden = true;
  const back = $('video').dataset.back || 'over';
  if (state !== 'play') $(back).hidden = false;
}
$('video').addEventListener('pointerdown', (e) => e.stopPropagation());
$('video-close').addEventListener('click', (e) => { e.stopPropagation(); closeVideo(); });
$('video-share').addEventListener('click', async (e) => {
  e.stopPropagation(); if (!madeVideo) return;
  const r = await shareVideo(madeVideo.blob, madeVideo.name, madeVideo.title);
  if (r === 'saved') $('video-note').textContent = 'Saved to your downloads: post it from there';
});
$('video-save').addEventListener('click', (e) => { e.stopPropagation(); if (madeVideo) saveVideo(madeVideo.blob, madeVideo.name); });
function saveReplay() {
  const r = lastRecording; if (!r) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([encodeRecording(r)], { type: 'application/json' }));
  a.download = `rys-rad-waves-${r.wave}-${r.seed}-${r.n}-${new Date().toISOString().slice(0, 16).replace(/[:T-]/g, '')}.json`;
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
for (const b of document.querySelectorAll('.replay-btns button[data-act]')) { // (the end card's and the sheet's; the results card's has its own)
  b.addEventListener('pointerdown', (e) => e.stopPropagation()); // (a tap elsewhere on the card paddles back out)
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    if (b.dataset.act === 'save') saveReplay();
    else if (b.dataset.act === 'share') startVideo();
    else if (b.dataset.act === 'switch') toWaves();
    else if (lastRecording) startReplay(decodeRecording(encodeRecording(lastRecording)));
  });
}
$('results').addEventListener('pointerdown', (e) => { e.preventDefault(); startOrRestart(); });
$('results-watch').addEventListener('pointerdown', (e) => e.stopPropagation());
// "Keep your scores" (a guest's live heat, task 12): an email turns the guest session into an account, same id, so the
// results stay theirs. The link lands on the account page to pick a handle.
for (const ev of ['pointerdown', 'keydown']) $('results-claim').addEventListener(ev, (e) => e.stopPropagation());
$('results-claim').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('claim-email').value.trim(), btn = $('results-claim').querySelector('button');
  btn.disabled = true;
  try {
    const c = await initAccount();
    const { error } = await c.auth.updateUser({ email }, { emailRedirectTo: new URL('account.html', location.href).href });
    if (error) throw error;
    $('claim-msg').textContent = `Check ${email}: the link keeps your scores and signs you in.`;
  } catch (err) { $('claim-msg').textContent = describeAuthError(err); }
  btn.disabled = false;
});
$('board').addEventListener('pointerdown', (e) => { e.stopPropagation(); $('board').classList.toggle('open'); }); // (a phone: tap for every row)
if (HEAT_END) {
  $('heat-note').hidden = false;
  $('heat-note').textContent = `Heat · ${HEAT_END.minutes ? `${HEAT_END.minutes} min` : `${HEAT_END.waves} waves`} · best two waves${params.get('bots') === '0' ? '' : ` · ${params.has('bots') ? Number(params.get('bots')) : 3} rivals`}`;
  $('score').parentElement.hidden = true; $('best').parentElement.hidden = true; // (the board stands in for the points)
  const left = $('score').parentElement.parentElement; // (the board takes the top left; the tube meter sits under it)
  left.classList.add('hud-left'); left.prepend($('board')); left.append($('board-pop'));
}
addEventListener('dragover', (e) => e.preventDefault());
addEventListener('drop', async (e) => {
  e.preventDefault();
  const f = e.dataTransfer?.files?.[0]; if (!f) return;
  try { startReplay(decodeRecording(await f.text())); } catch (err) { showError(`Replay: ${err.message}`); }
});

const ordinal = (n) => n + (n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th');
// A new heat: its seed (?seed=, else random) is the sea's, so its waves come in order from wave 0.
function startHeat() {
  const seed = params.has('seed') ? Number(params.get('seed')) : 1 + Math.floor(Math.random() * 2 ** 30);
  H = LIVE
    ? createHeat({ seed, end: HEAT_END, you: LIVE.name, jersey: params.get('jersey'), rivals: LIVE.entrants.filter((e) => e.id !== LIVE.entrantId) })
    : createHeat({ seed, end: HEAT_END, bots: params.has('bots') ? Number(params.get('bots')) : 3, jersey: params.get('jersey') || cachedProfile()?.jersey });
  if (LIVE && !live) {
    connectLive(LIVE, {
      wave: (w) => { // (anyone's scored wave: yours too, after a reload)
        const mine = w.entrant_id === LIVE.entrantId, s = mine ? heatYou(H) : H.surfers.find((x) => x.id === w.entrant_id);
        if (addRivalWave(H, mine ? 'you' : w.entrant_id, { n: w.wave_no, score: w.score, at: w.caught_s }) && s && !mine) heatPop(s.name, w.score, s.jersey.color);
      },
      closed: ({ entries, rides }) => {
        for (const r of rides) addRivalWave(H, r.entrant_id === LIVE.entrantId ? 'you' : r.entrant_id, { n: r.wave_no, score: Number(r.score) });
        H.mine = (entries || []).find((x) => x.entrant_id === LIVE.entrantId) || null; // (the server's place, and in a bracket whether you went through)
        H.final = true; H.done = true;
        if (state === 'results') showResults();
      },
      note: (code) => flash(code === 'after_horn' ? 'After the horn' : 'Not counted', "that wave didn't count"),
    }).then((l) => { live = l; window.__live = l; }).catch((e) => showError(`Live heat: ${e.message}`));
  }
  window.__heat = H;
  seedSea(H.seed);
  heat.scores = []; heat.seen = new Set();
  boardKey = '';
  // (a built break's loop never ends: a heat rides its full ride, the contests plan)
  if (WAVE.id === 'built' && WAVE.ridges?.loop) { applyBuilt({ ...WAVE.built, mode: 'full' }); useWave('built'); renderer.rebuildWave(); }
  // back in a live heat after a reload: your scored waves are on the board before you can catch another (so the next one
  // is numbered after them), and the sea goes on from the next wave of the set, as it would have without the reload
  const ridden = LIVE?.ridden || [];
  if (ridden.length) { for (const w of ridden) addRivalWave(H, 'you', w); SEA.n = Math.max(...ridden.map((w) => w.n)) - 1; } // (the drop-in's nextWave() then rides wave n: 0-based, the last you rode + 1)
  $('results').hidden = true;
}
// The end of a heat: places, totals, best two; watch your best wave; a new heat.
function showResults() {
  state = 'results';
  sheetTimer = 0;
  const st = standings(H), me = st.find((r) => r.surfer.you), f2 = (x) => x.toFixed(2);
  const waiting = H.live && !H.final; // (a live heat: until the server closes it, the places aren't final)
  if (H.live && live) live.finish();
  const place = H.mine?.place || me.place, round = LIVE?.bracket && !LIVE.final; // (a bracket round before the final)
  $('results-title').textContent = waiting ? 'Waiting…' : round ? (H.mine?.advanced ? "You're through!" : 'Knocked out') : place === 1 ? 'You win!' : `${ordinal(place)} place`;
  $('results').classList.toggle('waiting', waiting);
  $('results-go').innerHTML = !H.live ? '<span class="desk">Space for a new heat</span><span class="mob">Tap for a new heat</span>'
    : waiting ? 'Waiting for the others to finish their waves…'
    : LIVE?.final ? '<span class="desk">Space for the results and the recap</span><span class="mob">Tap for the results and the recap</span>' // (the last heat: the lobby offers the recap)
    : '<span class="desk">Space to go back to the contest</span><span class="mob">Tap to go back to the contest</span>';
  const guest = H.live && H.final && currentUser()?.is_anonymous;
  $('results-claim').hidden = !guest;
  $('results-sub').textContent = `${LIVE?.bracket && LIVE.round > 1 && LIVE.final ? 'Final · ' : LIVE?.bracket && !LIVE.final ? `Round ${LIVE.round} · Heat ${LIVE.heatNo} · ` : ''}${H.end.minutes ? `${H.end.minutes} min heat` : `${H.end.waves} wave heat`} · ${WAVE.name}`;
  $('results-rows').innerHTML = st.map((r) => `<div class="rr${r.surfer.you ? ' you' : ''}"><span class="pl">${r.place}</span><i style="background:${r.surfer.jersey.color}"></i><span class="nm">${r.surfer.name}</span><span class="bt">${r.top.map(f2).join(' + ') || '-'}</span><b>${f2(r.total)}</b></div>`).join('');
  const best = heatYou(H).waves.filter((w) => w.ride).sort((a, b) => b.score - a.score)[0];
  $('results-watch').hidden = !best;
  $('results-note').textContent = '';
  $('results-watch').onclick = (e) => { e.stopPropagation(); if (best) startReplay(decodeRecording(encodeRecording(best.ride))); };
  for (const id of ['over', 'judge', 'title']) $(id).hidden = true;
  $('results').hidden = false;
  window.__heatResults = st.map((r) => ({ name: r.surfer.name, place: r.place, total: r.total }));
  window.__heatFinal = !waiting;
}
// The board (top left, while a heat is on): the clock, one row a surfer by place, your row lit, what each needs.
function drawBoard() {
  const el = $('board');
  el.hidden = !H || state === 'title' || state === 'results';
  if (el.hidden) return;
  const st = standings(H), f2 = (x) => x.toFixed(2), clock = H.done ? 'FINAL' : H.horn ? 'HORN' : clockText(H);
  const key = clock + JSON.stringify(st.map((r) => [r.surfer.id, r.total])) + el.classList.contains('open');
  if (key === boardKey) return;
  boardKey = key;
  const mi = st.findIndex((r) => r.surfer.you);
  $('board-clock').textContent = clock;
  $('board-rows').innerHTML = st.map((r, i) => {
    const need = r.need && !H.done ? (r.need.combo ? 'combo' : `${f2(r.need.score)} ${r.need.for === 'adv' ? 'to adv' : 'to win'}`) : '';
    return `<div class="br${r.surfer.you ? ' you' : ''}${Math.abs(i - mi) > 1 ? ' far' : ''}"><i style="background:${r.surfer.jersey.color}"></i><span class="nm">${r.surfer.name}</span><b>${f2(r.total)}</b><span class="bt">${r.top.map(f2).join(' ')}</span><span class="nd">${need}</span></div>`;
  }).join('');
}
function heatPop(name, sc, color) {
  const el = $('board-pop');
  el.innerHTML = `<i style="background:${color}"></i>${name} <b>${sc.toFixed(2)}</b>`;
  el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
  popTimer = 2.5;
}

function startOrRestart() {
  if (state === 'play' || recap) return; // (a recap plays itself: taps and keys don't start a ride)
  if (HEAT_END) {
    if (H && !H.done && !canCatch(H)) checkOver(H, false); // (the horn has gone, or you've ridden your waves)
    if (H?.live && H.done) { // (a live heat: the results, then back to the contest once they're final)
      if (state !== 'results') showResults();
      else if (H.final) location.href = `index.html?contest=${encodeURIComponent(LIVE.code)}`;
      return;
    }
    if (H && H.done && state !== 'results') { showResults(); return; }
    if (!H || H.done) startHeat();
  }
  state = 'play';
  sheetTimer = 0;
  nextWave(); // the next wave of the set (its own size)
  resetRider(rider);
  if (params.has('xs')) { rider.xs = Number(params.get('xs')); rider.t = 13.0; rider.pos = frameAt(rider.xs, rider.t).P; }
  // (testing airs: ?air=<xs> starts heading straight up into the lip that far from the curl, fast enough for an air)
  if (params.has('air')) { rider.xs = Number(params.get('air')) || 0.5; rider.t = 7.5; rider.phi = 1.35; rider.speed = 13; rider.pos = frameAt(rider.xs, rider.t).P; }
  // (testing a wave with a bar: ?ridet=<s> runs the wave on that long before you drop in, e.g. to see its closeout)
  if (params.has('ridet') && WAVE.bar) { for (let i = 0; i < Number(params.get('ridet')) * 120; i++) stepRide(1 / 120); resetRider(rider); }
  score = 0; rideTime = 0; lastMove = ''; lastMoveTime = -9; // (each ride: its clock starts at 0, so the last ride's move would count as a repeat)
  rideLog = createRideLog(); // (always: the recording keeps the judged score; the sheet shows with ?judge)
  player = null;
  recording = createRecording({ wave: WAVE.id, built: WAVE.id === 'built' ? WAVE.built : null, seed: SEA.seed, n: SEA.n, params: physicsParams(), styling: currentStyle(), surfer: currentBody(), stance: currentStance() || WAVE.stance || 'goofy' });
  $('replay-badge').hidden = true;
  $('title').hidden = true;
  $('over').hidden = true;
  $('judge').hidden = true;
  // (no wave-of-set count or face size: the user, 2026-11-18; sets still vary the waves. A simulated wave (a bar)
  // names which one it is and its swell: the user, 2026-11-19, to compare them)
  const m = WAVE.bar && RIDE.map;
  if (H) { heatCaughtAt = H.time; flash('Drop in!', `wave ${heatYou(H).waves.length + 1}${H.end.waves ? ` of ${H.end.waves}` : ` · ${clockText(H)} left`}`); return; }
  flash('Drop in!', m ? `Wave ${m.wave}${m.swell ? ` · ${m.swell}` : ''}` : '');
}

// The score sheet after a judged wave: the maneuvers in the judges' shorthand, the five scores (the high and low struck out),
// the result and its grade, and the heat so far (best two waves).
function showScoreSheet(judge, counted = true) {
  const res = scoreRide(rideLog, { size: (WAVE.sizeK || 1) * SIZE, seed: judge.seed, seen: heat.seen });
  for (const it of res.items) heat.seen.add(it.key);
  heat.scores.push(res.score);
  const n = heat.scores.length, h = heatTotal(heat.scores), f2 = (x) => x.toFixed(2);
  $('judge-wave').textContent = H ? `Wave ${heatYou(H).waves.length}${counted ? '' : ' · after the horn'}` : `Wave ${n}`;
  $('judge-score').textContent = f2(res.score);
  $('judge-grade').textContent = res.grade;
  $('judge-moves').textContent = res.sheet;
  $('judge-reason').textContent = rider.wipeReason || '';
  $('judge-panel').innerHTML = res.judges.map((j) => `<div class="jd${j.dropped ? ' drop' : ''}"><b>${j.score.toFixed(1)}</b><small>${j.name} · ${j.likes}</small></div>`).join('');
  $('judge-heat').innerHTML = `Heat <b>${f2(h.total)}</b> <small>best two: ${h.top.map(f2).join(' + ')}${n > 2 ? ` · all: ${heat.scores.map(f2).join(', ')}` : ''}</small>`;
  if (H) { // (heat mode: your place and what you need, from the board)
    const st = standings(H), me = st.find((r) => r.surfer.you), b = heatYou(H).waves;
    const need = me.need ? (me.need.combo ? ' · needs a combination' : ` · needs ${f2(me.need.score)} ${me.need.for === 'adv' ? 'to advance' : 'to win'}`) : me.place === 1 ? ' · in the lead' : '';
    $('judge-heat').innerHTML = counted ? `Heat <b>${f2(me.total)}</b> <small>${ordinal(me.place)} of ${st.length}${need}${b.length > 2 ? ` · all: ${b.map((w) => f2(w.score)).join(', ')}` : ''}</small>`
      : `<small>Caught after the horn: it doesn't count</small>`;
    $('judge-go').innerHTML = canCatch(H) ? '<span class="desk">Space to paddle back out</span><span class="mob">Tap to paddle back out</span>' : 'The results';
    sheetTimer = 6; // (the next wave comes by itself after a few seconds; the clock is running)
  }
  $('judge').hidden = false;
}

function flash(text, sub = '') {
  if (H) sub = sub.replace(/\s*\+\d+$/, ''); // (a heat is judged: the arcade points don't count, the move's name stays)
  $('msg').innerHTML = text + (sub ? `<small>${sub}</small>` : '');
  $('msg').classList.remove('pop');
  void $('msg').offsetWidth;
  $('msg').classList.add('pop');
  msgTimer = 1.6;
}

function handleEvents() {
  for (const e of rider.events) {
    if (e.type === 'noseride' && e.time > 0.3) {
      const pts = Math.round(150 + e.time * 250 + (e.tenTime || 0) * 250); // (time on hang ten counts double)
      score += pts;
      flash(e.time > 3 ? 'LONG NOSERIDE!' : 'Noseride', `${e.time.toFixed(1)}s on the nose${e.tenTime > 0.3 ? `, ${e.tenTime.toFixed(1)}s hang ten` : ''}  +${pts}`);
    }
    if (e.type === 'stall') flash('Stall', 'scrubbing speed off the tail');
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
        verticalSnap: ['VERTICAL SNAP!', 800, 0.5],
        hang5: ['HANG FIVE!', 250, 0],
        hang10: ['HANG TEN!', 500, 0],
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
      if (e.move === 'verticalSnap') vSnapSpray = 0.4; // (the big fan off the tail as it comes round: vertical-snap-4)
      if (!quiet) flash(e.combo ? `${name}` : name, `${e.combo ? 'bottom turn combo  ' : ''}+${pts}`);
    }
    if (e.type === 'fallsLand') burst = 0.3; // the lip lands with you in it
    if (e.type === 'wipe') {
      burst = 0.3;
      flash(e.ended ? 'END OF THE WAVE!' : 'WIPEOUT!', e.reason);
    }
  }
}

// ---------- camera ----------
let camPos = [-6, 4, 12], camTarget = [0, 1, 0], aspectNow = 1.6, camPeel = PEEL_SPEED; // (camPeel: the smoothed peel speed the camera eases in)
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
  } else if (camMode === 4) {
    // Barrel view (testing): in the middle of the tube `?camx=` m behind the curl (default 7, where the barrel camera sits
    // with the surfer a couple of metres in), looking out along the wave, as the barrel camera does; no surfer needed.
    const back = params.has('camx') ? Number(params.get('camx')) : 7;
    const c = tubeCenter(-back, 1.5 * (WAVE.sizeK || 1));
    want = c ? [-back, params.has('camy') ? Number(params.get('camy')) : c.y, c.z] : [-back, 2, 2];
    look = [want[0] + 12, want[1] - 0.3, want[2]];
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
  } else if (camMode === 4) {
    // Front-on close-up (testing, ?cam=4): ahead of the surfer down the line, a little toward the beach, looking back at them,
    // like a photo from inside the barrel (the stall references).
    const h = v3.norm([rider.heading[0], 0, rider.heading[2]]);
    want = [p[0] + h[0] * 3.2, p[1] + 1.0, p[2] + h[2] * 3.2 + 1.2];
    look = [p[0], p[1] + 0.6, p[2]];
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
  // (The camera eases toward its shot in a frame moving at a smoothed peel speed: the peel frame itself jumps speed on
  // Trestles (the curl stalls and runs), and easing in it turned each jump into a lurch of the whole view sideways. With
  // a steady peel, the other waves, it's the same as before.)
  camPeel += (PEEL_SPEED - camPeel) * (1 - Math.exp(-dt / 1.5));
  camPos[0] -= (PEEL_SPEED - camPeel) * dt; camTarget[0] -= (PEEL_SPEED - camPeel) * dt;
  const k = 1 - Math.exp(-dt * (rider.falls ? 4 : rider.mode === 'wipe' ? 1.5 : shot === 'tube' ? 9 : 5)); // close behind in the barrel view
  for (let i = 0; i < 3; i++) { camPos[i] += (want[i] - camPos[i]) * k; camTarget[i] += (look[i] - camTarget[i]) * k; }
  // The barrel view stays in the air inside the barrel (the user, 2026-11-23: it could end up looking from inside the water,
  // or out the back of a closed barrel): wherever smoothing, easing in, or holding its last spot left it, the camera must be
  // in air, at least TUBE_CAM_ROOM from the water (closer, the near clip shows through the surface), with a clear view of you
  // (behind a closed barrel the water is in the way). If not, it comes in toward you along the tube to the first spot that
  // is, and failing that sits just behind your head. (Out of an open-ended section the open air with a clear view counts.)
  if (shot === 'tube') {
    const eye = [p[0], p[1] + 0.9, p[2]];
    if (!tubeCamOK(camPos, eye)) {
      let safe = null;
      for (let back = Math.min(TUBE_CAM_BACK, Math.max(0.5, p[0] - camPos[0])); back >= 0.5 && !safe; back -= 0.5) {
        const c = tubeCenter(p[0] - back, p[1] + TUBE_CAM_UP), q = c && [p[0] - back, c.y, c.z];
        if (q && tubeCamOK(q, eye)) safe = q;
      }
      camPos = safe || nearestAirSpot(p, eye);
    }
  } else if (!tubeCamAir(camPos)) {
    // (the other views: the shot's own spot was moved out of the water above, but easing toward it could still carry the
    // camera through the lip: riding high behind the curl, the chase view trailed into it on Pipe, 2026-11-24)
    camPos = nearestAirSpot(p, [p[0], p[1] + 0.9, p[2]], camPos);
  }
}
// The last resort (the user, 2026-11-24: on Pipe the barrel view could still end up inside the wave): with nowhere in the
// tube to sit, it used to go just behind your head, unchecked; high in the mouth of Pipe's barrel, under its thick lip,
// that was 0.7-0.95 m inside the lip. Now the first spot near the head, then out toward the open face, that's in air
// with room and a view of you; failing all of them, straight out from where it is until it's out of the water.
function nearestAirSpot(p, eye, from = [p[0] - 0.6, p[1] + 1.0, p[2]]) {
  for (const out of [0, 0.6, 1.2, 2, 3, 4.5]) for (const back of [0.6, 1.2, 2]) for (const up of [1.0, 0.6, 0.3]) {
    const q = [p[0] - back, p[1] + up, p[2] + out];
    if (tubeCamOK(q, eye)) return q;
  }
  const q = from.slice();
  for (let i = 0; i < 40 && !tubeCamAir(q); i++) q[2] += 0.35;
  return q;
}
function tubeCamAir(q) { return !insideWaterAt(q) && distToSlice(slice(q[0], 6), q[2], q[1]) >= TUBE_CAM_ROOM; }
const TUBE_CAM_ROOM = 0.35;
function tubeCamOK(q, eye) {
  if (insideWaterAt(q)) return false;
  if (distToSlice(slice(q[0], 6), q[2], q[1]) < TUBE_CAM_ROOM) return false;
  return clearView(q, eye);
}

// The surfer as placed in the world: position, heading and velocity (the rest of the rider is along the wave).
function worldRider() {
  if (waveDir() > 0) return rider;
  return { ...rider, pos: toWorld(rider.pos), heading: toWorld(rider.heading), vel: toWorld(rider.vel), wallPt: rider.wallPt && toWorld(rider.wallPt) };
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
    const first = WAVE.surfer === 'girl' ? 'girl' : 'guy';
    await loadBody(first).loading; // (the surfer is there from the first frame)
    loadBody(first === 'girl' ? 'guy' : 'girl');
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
  const pickWave = (id) => {
    useWave(id);
    nextWave();
    renderer.rebuildWave();
    resetRider(rider);
    try { localStorage.setItem('rys-rad-waves-wave', id); } catch {}
    const u = new URL(location.href); u.searchParams.set('wave', id); if (id !== 'built') u.searchParams.delete('break'); history.replaceState(null, '', u);
    drawPicker();
  };
  // Your saved breaks (signed in), as pills under the game's own. A tap reloads with ?break=<id>&pick: boot.js fetches
  // its ride and the page opens on Free surf with it picked, ready for DROP IN.
  let saved = [];
  const onBreak = () => (WAVE.id === 'built' && params.get('break')) || null; // (the saved break you're on, if any)
  const card = (label, on, extra = '') => {
    const b = document.createElement('button');
    b.className = (on ? 'on' : '') + extra;
    if (label instanceof Node) b.append(label); else b.textContent = label;
    b.addEventListener('pointerdown', (e) => { e.stopPropagation(); });
    return b;
  };
  const drawPicker = () => {
    picker.innerHTML = '';
    for (const w of WAVES) {
      const locked = waveLocked(w.id); // (the Wave Pass's soft gate, accounts plan task 6: off until payments are live)
      const b = card((locked ? '🔒 ' : '') + w.name, w.id === WAVE.id, locked ? ' locked' : '');
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        if (waveLocked(w.id)) { lockNote(w); return; }
        $('lock-note').hidden = true; wanted = null;
        pickWave(w.id);
      });
      picker.appendChild(b);
    }
    // (the builder's DROP IN, or someone's shared break: the wave you're on, with a way back to the builder)
    const mine = saved.find((b) => b.id === onBreak());
    if (WAVE.hidden && !mine) picker.appendChild(card(WAVE.name, true));
    if (WAVE.id === 'built') {
      const e = card('✎ Edit this break', false, ' edit');
      e.addEventListener('click', (ev) => { ev.stopPropagation(); location.href = mine ? `builder.html?break=${mine.id}` : 'builder.html'; });
      picker.appendChild(e);
    }
    const list = $('my-breaks'); list.innerHTML = '';
    for (const br of saved) {
      const kids = document.createDocumentFragment();
      kids.append(Object.assign(document.createElement('span'), { textContent: br.name }));
      const b = card(kids, br.id === onBreak());
      b.dataset.id = br.id;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        if (br.id === onBreak()) return;
        location.href = new URL(`index.html?break=${encodeURIComponent(br.id)}&pick`, location.href).href;
      });
      list.appendChild(b);
    }
    $('my-breaks-wrap').hidden = step !== 'surf' || !saved.length;
  };
  onAccount((s) => {
    const member = s?.user && !s.user.is_anonymous;
    if (!member) { if (saved.length) { saved = []; drawPicker(); } return; }
    myBreaks().then((l) => { saved = l || []; drawPicker(); }).catch((e) => console.warn('breaks', e));
  });
  drawPicker();
  // The plan arrives after the page (signing in reads it again): lock the picker, and a locked wave you're on goes back
  // to Raglan, the free demo wave (on the title screen only; a replay shows whatever it recorded).
  // A locked wave opens the Wave Pass sheet (src/paywall.js, accounts plan task 9). Checkout comes back to this page
  // with that wave in the address; until the plan shows the pass you wait on Raglan, then you're put on it.
  let wanted = null; // (the locked wave you asked for)
  const why = (w) => `${w.name} comes with the Wave Pass.`;
  const lockNote = (w) => {
    wanted = w.id;
    if (openPaywall({ want: 'wave_pass', why: why(w), back: wantedBack() })) { $('lock-note').hidden = true; return; }
    $('lock-note').hidden = false; $('lock-note').textContent = why(w);
  };
  onPlan(() => {
    if (state === 'title' && waveLocked(WAVE.id) && !params.has('replay')) {
      const was = WAVE; wanted = was.id; pickWave('point');
      $('lock-note').hidden = false; $('lock-note').textContent = `${why(was)} You're on Raglan, free for everyone.`;
      if (!HEAT_END) showStep('surf'); // (where the note is)
    } else if (state === 'title' && wanted && !waveLocked(wanted) && WAVES.some((w) => w.id === wanted)) {
      const id = wanted; wanted = null; $('lock-note').hidden = true; pickWave(id);
    } else drawPicker();
  });
  const wantedBack = () => { if (!wanted) return undefined; const u = new URL(location.href); u.searchParams.set('wave', wanted); return u.href; };
  startPaywall({
    why: (kind) => (kind === 'wave_pass' && wanted ? why(WAVES.find((w) => w.id === wanted)) : ''),
    back: (kind) => (kind === 'wave_pass' ? wantedBack() : undefined),
  }).catch((e) => console.warn('paywall', e));
  if (params.has('play') && !params.has('replay')) startOrRestart();
  if (params.has('replay')) { // (?replay=<url of a saved recording>; 'session': one handed over by a reload, startReplay)
    const src = params.get('replay');
    try {
      const text = src === 'session' ? sessionStorage.getItem('rys-rad-waves-replay') : await (await fetch(src)).text();
      if (!text) throw new Error('nothing to play');
      startReplay(decodeRecording(text));
    } catch (err) { showError(`Replay: ${err.message}`); }
  }
  if (params.has('cam')) camMode = Number(params.get('cam')) || 0;
  if (params.has('recap')) startRecap(params.get('recap')).catch((err) => showError(`Recap: ${err.message}`));
  let last = performance.now(), acc = 0, frame = 0, time = 0, flow = 0;
  function tick(now) {
    const dt = vid ? 1 / VIDEO.fps : Math.min(0.05, (now - last) / 1000); // (making a video: one video frame of ride per frame drawn)
    last = now;
    time += dt;
    flow += PEEL_SPEED * dt; // (the water texture flows with the peel; added up so a change of speed doesn't jump it)
    frame++;

    if (state === 'play') {
      const input = player ? null : readInput();
      if (input) lastInput = input;
      acc += dt;
      const ended = () => (rider.mode === 'wipe' && rider.wipeTimer <= 0) || (player && player.done);
      while (acc >= STEP) {
        const inp = player ? (lastInput = playerStep(player, rider)) : input;
        if (recording) recordStep(recording, inp, rider);
        stepSea(STEP);
        stepRider(rider, inp, STEP);
        if (!player) input.walk = 0; // (a press counts once, not once per physics step this frame)
        handleEvents();
        logStep(rideLog, rider, STEP, PEEL_SPEED);
        for (const e of SEA.events) {
          if (e.type === 'section') flash(e.kind === 'closeout' ? 'Section closing out ahead!' : "It's throwing ahead!", e.kind === 'closeout' ? 'race it, or float over it' : 'get in there');
        }
        acc -= STEP;
        if (ended()) { acc = 0; break; } // (the ride ends on this step, not at the end of the frame: a replay ends on the same one)
      }
      if (rider.mode === 'surf') rideTime += dt; // (only moves score, not just riding)
      if (ended() && player) { state = 'over'; showReplayEnd(Math.round(score)); }
      else if (ended()) {
        state = 'over';
        const s = Math.round(score);
        // (the recording: the points, and the judged score with the context the sheet scores it in, so a replay can check both)
        const judge = { seed: H ? judgeSeed(H.seed, heatYou(H).waves.length) : heat.scores.length + 1, seen: [...heat.seen] };
        const jr = scoreRide(rideLog, { size: (WAVE.sizeK || 1) * SIZE, seed: judge.seed, seen: new Set(judge.seen) });
        lastRecording = window.__replay = finishRecording(recording, rider, { score: s, judged: { score: jr.score }, judge, mode: rider.mode, reason: rider.wipeReason, time: +rideTime.toFixed(2) });
        recording = null;
        showReplayButtons();
        $('over-note').textContent = '';
        if (s > best) { best = s; try { localStorage.setItem('rys-rad-waves-best', String(best)); } catch {} }
        $('over-score').textContent = s;
        $('over-reason').textContent = rider.wipeReason;
        $('over-time').textContent = rideTime.toFixed(1);
        $('best').textContent = best;
        const counted = H ? addWave(H, { score: jr.score, at: heatCaughtAt, ride: lastRecording }) : true;
        if (H?.live && counted) live?.submit({ n: heatYou(H).waves.length, score: jr.score, judges: jr.judges.map((j) => j.score), caughtS: heatCaughtAt,
          sheet: { sheet: jr.sheet, grade: jr.grade }, recording: encodeRecording(lastRecording) });
        if (H && counted) heatPop(heatYou(H).name, jr.score, heatYou(H).jersey.color);
        if (JUDGE) showScoreSheet(judge, counted); else $('over').hidden = false;
      }
    }
    if (H && !H.done && !player && state !== 'title' && state !== 'results') {
      if (H.live) H.time = Math.max(0, live ? live.clock() : 0); // (the server's clock)
      for (const e of stepHeat(H, H.live ? 0 : dt)) {
        if (e.type === 'score') heatPop(e.surfer.name, e.score, e.surfer.jersey.color);
        if (e.type === 'horn') flash('HORN!', state === 'play' ? 'this wave still counts' : 'the heat is over');
      }
    }
    if (sheetTimer > 0 && state === 'over' && !player) { sheetTimer -= dt; if (sheetTimer <= 0) startOrRestart(); }
    if (H) { drawBoard(); popTimer -= dt; if (popTimer <= 0) $('board-pop').classList.remove('pop'); }
    if (state === 'title') {
      // Attract mode: the autopilot surfs behind the title card.
      acc += dt;
      while (acc >= STEP) { stepSea(STEP); lastInput = autopilot(); stepRider(rider, lastInput, STEP); acc -= STEP; }
      if (rider.mode === 'wipe' && rider.wipeTimer <= 0) { if (WAVE.bar) nextWave(); resetRider(rider); } // (Trestles: the demo starts again from the peak)
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
    snapSpray = Math.max(0, snapSpray - dt); vSnapSpray = Math.max(0, vSnapSpray - dt);
    // (a vertical snap's fan goes past 1: the shader throws the extra higher and harder)
    const sprayAmt = (surfing ? Math.min(1, Math.abs(turnSigned) * 0.3 * Math.min(1, speed / 6) + (rider.pumping ? 0.15 : 0) + (snapSpray > 0 ? 0.5 : 0)) + (vSnapSpray > 0 ? 1.5 : 0) : 0) * Math.min(1, WAVE.scale / 1.25); // (less on small waves)
    const side = v3.norm(v3.cross(n, rider.heading));
    const sprayDir = v3.norm(v3.add(v3.mul(side, turnSigned > 0 ? -1 : 1), v3.mul(rider.heading, -0.4)));
    burst = Math.max(0, burst - dt);

    const body = wantBody(); // (the skinned body, once loaded; until then, and for a body not built yet, the parts)
    // (until its model has loaded only the board is drawn: the bodies are fetched at start-up, see main())
    const objs = surferObjects(pose, worldRider(), {
      n: toWorld(n), e2: toWorld(v3.norm(v3.cross(n, v3.norm(v3.rej([1, 0, 0], n))))), turn: turnSigned * waveDir(), // (turning left along the wave is turning right in the world on a right)
      pump: false,
    }, dt);
    const bodyMats = body && pose.J ? body.body.update(pose.J) : null;
    if (bodyMats) { body.dt = dt; objs.push(...hairObjects(body, bodyMats)); }
    renderer.render({
      viewProj: vp, invViewProj: invert(vp), camPos: camW, time, sunDir: SUN, peel: PEEL_SPEED, flow, flowDev: PEEL_SPEED - camPeel,
      rider: rider.pos, spray: sprayAmt, riderVel: rider.vel, dt, sprayDir, frame,
      hand: rider.handDrag > 0.01 && pose.handTouch && rider.mode === 'surf' ? [...toWorld(pose.handTouch), rider.handDrag] : null, // (a hand dragging in the face: white where it cuts the water; the pose is in the world, the shader wants the peel frame)
      burst: burst > 0 ? 1 : 0, camRight, camUp,
    }, objs, { particles: !params.has('noparticles'), outlines: !params.has('nooutline'), look: true, body: bodyMats, shadow: !!bodyMats });

    frameMs = frameMs * 0.95 + (dt * 1000) * 0.05; // smoothed frame time
    window.__dbg = { hd: +(rider.handDrag || 0).toFixed(2), stall: +(rider.stallK || 0).toFixed(2), view: tubeView, cam: camPos.map((x) => +x.toFixed(2)), pos: rider.pos.map((x) => +x.toFixed(2)), rt: +rider.t.toFixed(2), tube: !!rider.tube, wave: WAVE.id, wind: +(pose.windup || 0).toFixed(2), unl: +(pose.unload || 0).toFixed(2), ms: +frameMs.toFixed(1), phi: +(rider.phi * 57.3).toFixed(0), turn: touch.turn, tilt: touch.tilt, depth: rider.tube ? +tubeDepth(rider).toFixed(2) : null, state, mode: rider.mode, xs: +rider.xs.toFixed(1), y: +rider.pos[1].toFixed(1), score: Math.round(score), reason: rider.wipeReason, slash: !!rider.slash, slide: +(rider.slide * 57.3).toFixed(0), shuf: +(rider.shuf || 0).toFixed(2), pivot: +(rider.pivot || 0).toFixed(2), pivotUp: !!rider.pivotUp, foot: rider.foot, h: +(rider.height || 0).toFixed(2), ten: +(rider.ten || 0).toFixed(2), pk: +(rider.pocket || 0).toFixed(2) };
    // HUD.
    msgTimer -= dt;
    if (msgTimer <= 0) $('msg').classList.remove('pop');
    $('hint').hidden = state !== 'play' || !!player; // (not during a replay)
    const walking = state === 'play' && WAVE.noseride && rider.mode === 'surf';
    $('walk-up').hidden = !walking || rider.footGoal >= 1; // (gone once you're all the way up on the nose ...)
    $('walk-back').hidden = !walking || rider.footGoal <= -1; // (... or all the way back on the tail)
    $('hint-nose').hidden = !WAVE.noseride;
    for (const el of document.querySelectorAll('.hint-std')) el.hidden = !!WAVE.walkKeys;
    for (const el of document.querySelectorAll('.hint-walk')) el.hidden = !WAVE.walkKeys;
    for (const el of document.querySelectorAll('.hint-lb')) el.hidden = !WAVE.noseride; // (longboard: walk; shortboard: shuffle the feet)
    for (const el of document.querySelectorAll('.hint-sb')) el.hidden = !!WAVE.noseride;
    $('score').textContent = Math.round(score);
    window.__speedMph = Math.round(groundSpeed(rider) * 2.237);
    // Speed readout (back on screen, the user, 2026-11-18): it glows neon pink while your speed would give a BIG AIR
    // right where you are (with speed-scaled airs; otherwise once you're fast enough to air there at all).
    $('speed').textContent = Math.floor(groundSpeed(rider) * 2.237); // (whole mph rounded down, so the number never reads past the point the glow starts)
    $('speed').classList.toggle('air', !!TUNE.airs && rider.mode === 'surf' && rider.speed >= (TUNE.airPopPerSpeed > 0 ? bigAirSpeedAt(rider.xs) : airSpeedAt(rider.xs)));
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
    if (recap) { recap.step(dt); recap.draw(); } // (the recap's director and graphics, on the game's own time)
    arriving(now);
    if (vid && !vid.p) videoFrame().then(() => { if (vid) vid.p = null; requestAnimationFrame(tick); }); // (the next frame once the encoder's ready for it)
    else requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
// The veil over a link straight into a ride (index.html: the landing screen kept out of sight while the game loads): lifted on
// the ride's first frame, or, if the link lands on the title after all (a locked wave, an error), after a
// moment there, so the title's never left hidden.
let arriveFrames = 0, arriveAt = null;
function arriving(now) {
  const h = document.documentElement;
  if (!h.classList.contains('arriving') || h.classList.contains('arrived')) return;
  if (arriveAt == null) arriveAt = now;
  if (state !== 'title' || recap) arriveFrames++;
  if (arriveFrames >= 1 || now - arriveAt > 1500) { // (the ride's first frame: your wave fades in through the sky's colour)
    h.classList.add('arrived');
    setTimeout(() => h.classList.remove('arriving', 'arrived'), 700);
  }
}
main();
