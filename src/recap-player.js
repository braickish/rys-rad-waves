// The recap player (accounts plan task 17, step 1): index.html?recap=<code> rides a contest's final again, the waves
// worth showing (src/recap.js) one after another from their logs, with broadcast graphics (src/recap-overlay.js) and
// camera cuts. main.js lends it the game (`game`): startReplay, the camera, and when a replay ends. Time runs on the
// game's frames (step(dt)), so the exported video (one frame at a time) comes out the same as what you watch.
//
//   title  over the first wave's opening seconds: the contest, the heat, the spot
//   wave   each shown wave: the standings before it, the lower third, the score when it's over (and the new standings)
//   end    the result, after the last wave
import { initAccount } from './account.js';
import { contestByCode, contestFor, WAVE_NAMES } from './contests.js';
import { decodeRecording } from './replay.js';
import { buildRecap } from './recap.js';
import { drawOverlay } from './recap-overlay.js';

const TITLE = 3.2, AFTER = 2.4, END = 6; // seconds: the title card, the score after a ride, the result

// Everything a recap needs: the contest, its story, and the shown waves' ride logs (signed links to Storage).
// heatId: that heat's recap, once it's closed (an Open contest's round: the contest can still be on).
export async function loadRecap(code, heatId = null) {
  const c = await initAccount();
  const p = await contestByCode(code);
  if (!p) throw new Error('No contest has that code.');
  const d = await contestFor(p); // (anyone with the code: the people in it, or watching)
  if (!d) throw new Error("Couldn't load that contest.");
  const ht = heatId && d.heats.find((x) => x.id === heatId);
  if (heatId && !ht) throw new Error('No such heat in this contest.');
  if (ht ? ht.state !== 'done' : d.contest.state !== 'done') throw new Error(ht ? "This heat isn't over yet." : "This contest isn't over yet.");
  const recap = buildRecap({ contest: d.contest, entrants: d.entrants, heats: d.heats, rides: d.rides, heatId });
  recap.heatOnly = !!heatId;
  if (!recap?.shown.length) throw new Error('This contest has no ride logs to show.');
  recap.contest.place = d.contest.spot?.name || WAVE_NAMES[d.contest.spot?.wave] || '';
  recap.contest.id = d.contest.id; recap.contest.host = d.contest.host; // (the host keeps the recap's video with the contest)
  for (const s of recap.shown) {
    const { data, error: e } = await c.storage.from('replays').createSignedUrl(s.ride.replay_path, 3600);
    if (e) throw e;
    s.rec = decodeRecording(await (await fetch(data.signedUrl)).text());
  }
  return recap;
}

// game: { startReplay(rec), setCam(mode), progress() (0..1 through the replay), canvas, onDone() }
export function createRecapPlayer(recap, game) {
  const overlay = document.createElement('canvas');
  overlay.className = 'recap-overlay';
  document.body.append(overlay);
  const ctx = overlay.getContext('2d');
  let i = -1, phase = 'idle', t = 0, total = 0, endT = 0, done = false, frame = null;
  const before = (k) => (k > 0 ? recap.story[recap.story.indexOf(recap.shown[k]) - 1]?.standings : null)
    || recap.final.map((r) => ({ ...r, total: 0, place: 1 }));
  function next() {
    i++;
    if (i >= recap.shown.length) { phase = 'end'; t = 0; return; }
    phase = 'ride'; t = 0;
    game.setCam(0);
    game.setJersey?.(recap.shown[i].jersey); // (each surfer in their heat jersey, as on the graphics)
    game.startReplay(recap.shown[i].rec);
  }
  function resize() {
    const r = game.canvas.getBoundingClientRect(), k = Math.min(2, devicePixelRatio || 1);
    const w = Math.round(r.width * k), h = Math.round(r.height * k);
    if (overlay.width !== w || overlay.height !== h) { overlay.width = w; overlay.height = h; }
  }
  return {
    overlay,
    get done() { return done; },
    get seconds() { return total; },
    start() { i = -1; done = false; total = 0; next(); },
    // a replay ended (main.js showReplayEnd)
    rideEnded() { if (phase === 'ride') { phase = 'after'; endT = 0; } },
    step(dt) {
      if (phase === 'idle' || done) return;
      t += dt; total += dt;
      if (phase === 'ride') {
        // the camera: from the channel, and on a longer ride a cut to the front-on close-up through its middle
        const p = game.progress(), long = (recap.shown[i].rec.steps || 0) * (recap.shown[i].rec.step || 1 / 120) > 7;
        game.setCam(long && p > 0.4 && p < 0.65 ? 4 : 0);
      }
      if (phase === 'after') { endT += dt; if (endT > AFTER) next(); }
      if (phase === 'end' && t > END) { done = true; game.onDone?.(); }
    },
    // the graphics for this frame, drawn on the overlay (and handed to the video)
    draw() {
      resize();
      const seg = recap.shown[i];
      if (phase === 'end' || done) frame = { kind: 'end', t, contest: recap.contest, heat: recap.heat, final: recap.final, winner: recap.winner };
      else if (i === 0 && phase === 'ride' && t < TITLE) frame = { kind: 'title', t, contest: recap.contest, heat: recap.heat };
      else if (seg) {
        const ended = phase === 'after';
        frame = { kind: 'wave', t: i === 0 ? t - TITLE : t, contest: recap.contest, heat: recap.heat, seg, ended, endT,
          standings: ended ? recap.story[recap.story.indexOf(seg)].standings : before(i) };
      }
      drawOverlay(ctx, overlay.width, overlay.height, frame);
      return overlay;
    },
    close() { overlay.remove(); },
  };
}
