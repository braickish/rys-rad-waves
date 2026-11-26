// A contest's recap in the browser (accounts plan task 17, step 1), against the local stack:
//   1. a public contest on Raglan, three surfers, two waves each, ridden for real: each wave is a genuine ride log made
//      with the game's physics here in Node (as the game records it), uploaded to Storage and submitted as that surfer
//   2. signed out, index.html?recap=<code> loads it (an unlisted contest: anyone with the link): the final's story, the waves worth showing, their logs
//   3. it plays: the title card over the first wave, each shown wave with its lower third and the standings, the
//      score when it's over, then the result; the game's own HUD and panels stay out of the way
//   4. Make video: an MP4 of the whole recap, graphics and all
// npm run db:start first, then: npm run test:recap-browser [shotPrefix]
import { execSync } from 'node:child_process';
import { openBrowser, sleep, root } from './browser-lib.mjs';
import * as R from '../src/rider.js';
import * as W from '../src/wave.js';
import * as S from '../src/sea.js';
import { createRideLog, logStep, scoreRide } from '../src/judging.js';
import { createRecording, recordStep, finishRecording, encodeRecording } from '../src/replay.js';
import { judgeSeed } from '../src/heat.js';

const API = process.env.SB_URL || 'http://127.0.0.1:55321';
const PK = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';
const SECRET = process.env.SB_SECRET || JSON.parse(execSync('npx supabase status -o json', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString()).SECRET_KEY;
const H = { apikey: SECRET, authorization: `Bearer ${SECRET}`, 'content-type': 'application/json' };
const post = async (table, body) => { const r = await fetch(`${API}/rest/v1/${table}`, { method: 'POST', headers: { ...H, prefer: 'return=representation' }, body: JSON.stringify(body) }); if (!r.ok) throw new Error(`${table}: ${r.status} ${await r.text()}`); return (await r.json())[0]; };
const rpcAs = async (token, fn, args) => { const r = await fetch(`${API}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: PK, authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(args) }); const t = await r.text(); if (!r.ok) throw new Error(`${fn}: ${t}`); return t ? JSON.parse(t) : null; };
const session = async (email) => {
  const g = await (await fetch(`${API}/auth/v1/admin/generate_link`, { method: 'POST', headers: H, body: JSON.stringify({ type: 'magiclink', email }) })).json();
  const s = await (await fetch(`${API}/auth/v1/verify`, { method: 'POST', headers: { apikey: PK, 'content-type': 'application/json' }, body: JSON.stringify({ type: g.verification_type, token_hash: g.hashed_token }) })).json();
  return { token: s.access_token, id: s.user.id, raw: s };
};

// A wave of a heat, ridden by a pocket bot with its own rhythm, recorded and judged as the game does.
function ride(heatSeed, waveNo, style) {
  R.useWave('point'); S.seedSea(heatSeed); for (let k = 0; k < waveNo; k++) S.nextWave();
  const r = R.createRider(); R.resetRider(r);
  const rec = createRecording({ wave: 'point', built: null, seed: S.SEA.seed, n: S.SEA.n, params: {}, styling: {}, surfer: 'guy', stance: 'goofy' }), log = createRideLog();
  let up = false;
  for (let i = 0; i < 120 * 14; i++) {
    const y = r.pos[1]; if (up && y > style.hi) up = false; if (!up && y < style.lo) up = true;
    const inp = r.xs > 6 ? { aim: [-0.6, up ? 0.8 : -0.5] } : r.xs < -1 ? { aim: [1, up ? 0.5 : -0.6], pump: !up } : { tilt: up ? 0.9 : -0.8, pump: !up };
    recordStep(rec, inp, r); S.stepSea(1 / 120); R.stepRider(r, inp, 1 / 120); logStep(log, r, 1 / 120, W.PEEL_SPEED);
    if (r.mode === 'wipe' && r.wipeTimer <= 0) break;
  }
  const judge = { seed: judgeSeed(heatSeed, waveNo - 1), seen: [] };
  const score = scoreRide(log, { size: (W.WAVE.sizeK || 1) * W.SIZE, seed: judge.seed, seen: new Set() }).score;
  finishRecording(rec, r, { score: 0, judged: { score }, judge });
  return { text: encodeRecording(rec), score };
}

const b = await openBrowser({ shots: process.argv[2] });
const { check, evaluate, waitFor, go, shot } = b;

// 1. The contest.
const stamp = Date.now();
const host = await session(`recaphost-${stamp}@example.com`);
await post('profiles', { id: host.id, handle: `rh${stamp % 1e7}` });
await post('entitlements', { user_id: host.id, kind: 'pro', source: 'grant', expires_at: new Date(Date.now() + 30 * 864e5).toISOString(), note: 'test' });
const k = await rpcAs(host.token, 'create_contest', { name: 'Recap Classic', wave: 'point', end_waves: 2, max_entrants: 4, visibility: 'unlisted' }); // (unlisted: the recap is for anyone with the link)
const people = [{ ...host, name: null, style: { hi: 2.6, lo: 1.0 } }];
await rpcAs(host.token, 'join_contest', { code: k.code });
for (const [n, style] of [['Mara', { hi: 2.2, lo: 0.8 }], ['Tuck', { hi: 3.0, lo: 1.3 }]]) {
  const p = await session(`recap-${n.toLowerCase()}-${stamp}@example.com`);
  await rpcAs(p.token, 'join_contest', { code: k.code, nickname: n });
  people.push({ ...p, name: n, style });
}
const heat = await rpcAs(host.token, 'start_contest', { contest_id: k.id });
await sleep(Math.max(0, Date.parse(heat.starts_at) - Date.now()) + 1500);
let caught = 2;
for (const wave of [1, 2]) for (const p of people) {
  const { text, score } = ride(heat.seed, wave, p.style);
  const path = `${p.id}/${heat.id}/${wave}.json`;
  const up = await fetch(`${API}/storage/v1/object/replays/${path}`, { method: 'POST', headers: { apikey: PK, authorization: `Bearer ${p.token}`, 'content-type': 'application/json' }, body: text });
  if (!up.ok) throw new Error(`upload ${up.status} ${await up.text()}`);
  await rpcAs(p.token, 'submit_ride', { heat_id: heat.id, wave_no: wave, score, judges: Array(5).fill(score), caught_s: caught++, replay_path: path });
}
for (const p of people) await rpcAs(p.token, 'finish_heat', { heat_id: heat.id });
await rpcAs(host.token, 'close_heat', { heat_id: heat.id });
check(true, `an unlisted contest, three surfers, two real waves each: ${k.code}`);

// The lobby, signed out, once it's over: the recap links (no Make video: that's the host's).
await go(`${b.base}index.html?contest=${k.code}`);
check(!!(await waitFor(`!document.getElementById('lobby-recap').hidden && /recap=${k.code}$/.test(document.getElementById('lobby-recap-play').href) && document.getElementById('lobby-recap-make').hidden && /contest\\.html\\?c=${k.code}/.test(document.getElementById('lobby-results').href)`, 20000)),
  'the lobby, signed out, after the final: "▶ Watch the recap" and "All the results", no "Make the recap video"');
await shot('0-lobby');

// 2-3. The recap, signed out.
await go(`${b.base}index.html?recap=${k.code}`);
const r = await waitFor(`window.__recap && JSON.stringify({ shown: window.__recap.shown.length, story: window.__recap.story.length, winner: window.__recap.winner?.name })`, 40000);
const rc = r && JSON.parse(r);
check(rc && rc.story === 6 && rc.shown >= 3 && rc.shown <= 6 && rc.winner, `loaded: 6 waves in the story, ${rc?.shown} shown, won by ${rc?.winner}`);
check(await evaluate(`document.body.classList.contains('recap') && document.getElementById('title').hidden && getComputedStyle(document.querySelector('.hud')).display === 'none' && !!document.querySelector('.recap-overlay')`), 'the game\'s HUD and panels step aside; the graphics canvas is up');
check(!!(await waitFor(`window.__dbg && window.__dbg.state === 'play'`, 15000)), 'the first wave plays');
await sleep(1200); await shot('1-title');
await sleep(2600); await shot('2-wave');
check(!!(await waitFor(`window.__dbg && window.__dbg.state === 'over'`, 30000)), 'the wave ends');
await sleep(600); await shot('3-score');
check(!!(await waitFor(`!document.getElementById('recap-again').hidden`, 180000)), 'every shown wave, then the result: "Watch again"');
await shot('4-result');
check(await evaluate(`document.getElementById('over').hidden && document.getElementById('judge').hidden`), 'no end-of-ride cards along the way');

// 4. The host makes the video, and it's kept with the contest: the lobby offers it.
await evaluate(`localStorage.setItem('rys-rad-waves-auth', ${JSON.stringify(JSON.stringify(host.raw))})`);
await go(`${b.base}index.html?contest=${k.code}`);
check(!!(await waitFor(`!document.getElementById('lobby-recap-make').hidden && /recap=${k.code}&make$/.test(document.getElementById('lobby-recap-make').href)`, 20000)), 'the host\'s lobby: "Make the recap video"');
await evaluate(`document.getElementById('lobby-recap-make').click()`); // (&make: the video starts by itself)
const v = await waitFor(`window.__video && JSON.stringify({ seconds: window.__video.seconds, frames: window.__video.frames, size: window.__video.size })`, 400000);
const vv = v && JSON.parse(v);
check(vv && vv.seconds > 15 && vv.size > 100000, `Make video: ${vv?.seconds?.toFixed(1)} s, ${vv?.frames} frames, ${(vv?.size / 1e6).toFixed(1)} MB`);
check(!!(await waitFor('window.__recapKept === true', 60000)), `the host's video is kept with the contest (${await evaluate(`document.getElementById('video-note').textContent`)})`);
const [kept] = await (await fetch(`${API}/rest/v1/recaps?contest_id=eq.${k.id}&select=video_path,seconds`, { headers: H })).json();
const pub = await fetch(`${API}/storage/v1/object/public/recaps/${kept?.video_path}`);
check(kept?.video_path === `${k.id}/recap.mp4` && pub.ok && /video\/mp4/.test(pub.headers.get('content-type') || ''), `in the recaps bucket, public: ${kept?.video_path} (${pub.status})`);

// 5. Signed out: the contest page plays it, the host's profile links it.
await evaluate(`localStorage.removeItem('rys-rad-waves-auth')`);
await go(`${b.base}contest.html?c=${k.code}`);
check(!!(await waitFor(`!!document.getElementById('recap-video') && /recap\\.mp4/.test(document.getElementById('recap-video').src) && !!document.getElementById('recap-play')`, 20000)), 'the contest page: the recap video, and "Watch the recap in the game"');
check(!!(await waitFor(`document.getElementById('recap-video').readyState >= 1 && document.getElementById('recap-video').duration > 15`, 20000)), `... which loads (${await evaluate(`document.getElementById('recap-video').duration`)} s)`);
await shot('5-contest');
await fetch(`${API}/rest/v1/contests?id=eq.${k.id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ visibility: 'public' }) }); // (profiles list public contests)
const handle = (await (await fetch(`${API}/rest/v1/profiles?id=eq.${host.id}&select=handle`, { headers: H })).json())[0].handle;
await go(`${b.base}profile.html?u=${handle}`);
check(/▶ recap/.test(await waitFor(`document.getElementById('p-results').innerText.length > 0 && document.getElementById('p-results').innerText`, 20000) || ''), "the host's profile: the result, with its recap");
await b.done();
