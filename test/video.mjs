// Share video (plans/2026-11-24-share-ride-video.md step 1) in the real game (headless Chrome with WebGPU):
//   1. Ride a judged wave (the autopilot, then the keys) until it ends.
//   2. "Share video" on the score sheet: the replay is made into an MP4 on the page (WebCodecs + Mediabunny).
//   3. The MP4 is the ride: the right number of frames at 30 fps, the canvas's size (even), and a browser <video> plays it
//      (its length, its size, and a frame from the middle that isn't blank). Saved to test/out/ride.mp4 to look at.
// node test/video.mjs   (serves the game itself; WAVE=trestles to try another wave; MOBILE=1 a phone held upright)
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const WAVE = process.env.WAVE || 'raglanPlus';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const webPort = 8800 + Math.floor(Math.random() * 400), cdpPort = 9300 + Math.floor(Math.random() * 500);
const server = spawn('python3', ['-m', 'http.server', String(webPort), '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
const profile = mkdtempSync(join(tmpdir(), 'rrw-'));
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--enable-unsafe-webgpu', `--user-data-dir=${profile}`, `--remote-debugging-port=${cdpPort}`,
  '--window-size=1280,720', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) fails++; };
const done = async () => { try { ws.close(); } catch {} chrome.kill(); server.kill(); await sleep(300); rmSync(profile, { recursive: true, force: true }); process.exit(fails ? 1 : 0); };

let targets;
for (let i = 0; i < 50; i++) { try { targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json`)).json(); if (targets.length) break; } catch {} await sleep(200); }
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pending = new Map();
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') console.log('[exception]', m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
const waitFor = async (expr, ms) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await evaluate(expr); if (v) return v; await sleep(250); } return null; };
const key = (type, code) => send('Input.dispatchKeyEvent', { type: type === 'down' ? 'rawKeyDown' : 'keyUp', code, key: code, windowsVirtualKeyCode: { ArrowLeft: 37, ArrowRight: 39 }[code] });
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
const base = `http://127.0.0.1:${webPort}/`;

// 1. Ride.
if (process.env.MOBILE) await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
await send('Page.navigate', { url: `${base}?play&auto&judge&wave=${WAVE}&seed=4` });
if (!(await waitFor(`window.__dbg && window.__dbg.state === 'play'`, 20000))) { check(false, 'the game started'); await done(); }
await sleep(3000);
await evaluate('window.__manual = true');
let rec = null;
for (let i = 0; i < 120 && !rec; i++) {
  const k = i % 3 === 0 ? 'ArrowLeft' : 'ArrowRight';
  await key('down', k); await sleep(250 + (i % 4) * 90); await key('up', k); await sleep(120);
  rec = await evaluate('window.__replay && JSON.stringify({ steps: window.__replay.steps, step: window.__replay.step })');
}
if (!rec) { check(false, 'the ride ended and was recorded'); await done(); }
rec = JSON.parse(rec);
const secs = rec.steps * rec.step;
check(true, `rode ${secs.toFixed(1)} s`);

// 2. Share video.
const shown = await waitFor(`!!document.querySelector('#judge:not([hidden]) .replay-btns:not([hidden]) button[data-act=share]:not([hidden]), #over:not([hidden]) .replay-btns:not([hidden]) button[data-act=share]:not([hidden])')`, 5000);
check(!!shown, 'the end card has a Share video button');
const t0 = Date.now();
await evaluate(`document.querySelector('#judge:not([hidden]) button[data-act=share], #over:not([hidden]) button[data-act=share]').click()`);
const v = JSON.parse(await waitFor(`window.__video && JSON.stringify({ ...window.__video, blob: undefined, title: document.getElementById('video-title').textContent, share: !document.getElementById('video-share').hidden })`, 240000) || 'null');
if (!v) { console.log(await evaluate(`document.getElementById('video').innerText`)); check(false, 'the video was made'); await done(); }
const took = (Date.now() - t0) / 1000;
const cw = await evaluate(`[document.getElementById('gfx').width, document.getElementById('gfx').height]`);
check(v.share && /ready/.test(v.title), `made in ${took.toFixed(1)} s (${(secs / took).toFixed(1)}x real time): "${v.title}", ${v.w}x${v.h}, ${v.frames} frames, ${(v.size / 1e6).toFixed(2)} MB`);
const want = Math.min(90, secs) * 30;
check(Math.abs(v.frames - want) <= 2, `${v.frames} frames for a ${secs.toFixed(2)} s ride at 30 fps (want ~${want.toFixed(0)})`);
check(v.w % 2 === 0 && v.h % 2 === 0 && Math.abs(v.w / v.h - cw[0] / cw[1]) < 0.01, `${v.w}x${v.h}: even, the canvas's shape (${cw[0]}x${cw[1]})`);

// 3. Plays in a <video>.
const p = JSON.parse(await evaluate(`(async () => {
  const el = document.createElement('video'); el.muted = true; el.src = URL.createObjectURL(window.__video.blob);
  await new Promise((r, j) => { el.onloadeddata = r; el.onerror = () => j(new Error('video error ' + el.error?.code)); });
  el.currentTime = el.duration / 2; await new Promise((r) => { el.onseeked = r; });
  const c = document.createElement('canvas'); c.width = 64; c.height = 64; const g = c.getContext('2d'); g.drawImage(el, 0, 0, 64, 64);
  const d = g.getImageData(0, 0, 64, 64).data; let m = 0, sd = 0; for (let i = 0; i < d.length; i += 4) m += d[i] + d[i + 1] + d[i + 2]; m /= d.length / 4 * 3;
  for (let i = 0; i < d.length; i += 4) sd += ((d[i] + d[i + 1] + d[i + 2]) / 3 - m) ** 2; sd = Math.sqrt(sd / (d.length / 4));
  const shots = [];
  for (const f of [0.1, 0.5, 0.9]) { el.currentTime = el.duration * f; await new Promise((r) => { el.onseeked = r; }); const k = document.createElement('canvas'); k.width = 640; k.height = Math.round(640 * el.videoHeight / el.videoWidth); k.getContext('2d').drawImage(el, 0, 0, k.width, k.height); shots.push(k.toDataURL('image/png').split(',')[1]); }
  const b64 = await new Promise((r) => { const f = new FileReader(); f.onload = () => r(f.result.split(',')[1]); f.readAsDataURL(window.__video.blob); });
  return JSON.stringify({ dur: el.duration, w: el.videoWidth, h: el.videoHeight, mean: m, sd, b64, shots });
})()`) || 'null');
if (p) { mkdirSync(join(root, 'test/out'), { recursive: true }); writeFileSync(join(root, 'test/out/ride.mp4'), Buffer.from(p.b64, 'base64')); p.shots.forEach((b, i) => writeFileSync(join(root, `test/out/ride-frame-${i}.png`), Buffer.from(b, 'base64'))); }
check(p && Math.abs(p.dur - v.frames / 30) < 0.1 && p.w === v.w && p.h === v.h, `a <video> plays it: ${p ? `${p.dur.toFixed(2)} s, ${p.w}x${p.h}` : 'it did not'}`);
check(p && p.sd > 8 && p.mean > 20, `the middle frame has a picture (mean ${p?.mean.toFixed(0)}, spread ${p?.sd.toFixed(0)}) · test/out/ride.mp4, ride-frame-0..2.png`);
await evaluate(`document.getElementById('video-close').click()`);
check(await evaluate(`document.getElementById('video').hidden && (!document.getElementById('judge').hidden || !document.getElementById('over').hidden)`), 'Close goes back to the end card');
console.log(fails ? `\n${fails} failed` : '\nthe ride makes a video');
await done();
