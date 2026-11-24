// The camera never goes inside the wave (the user, 2026-11-24: on Pipe the barrel view could still end up inside the wave).
// Rides Pipe with the autopilot in headless Chrome (the default view, and the chase view, C, on the seed that showed it:
// high in the mouth of the barrel the last-resort spot behind your head was inside the lip) and checks the camera every frame
// against the water: never in it, and in the barrel view never nearer than 0.3 m (TUBE_CAM_ROOM is 0.35).
// node test/camera-water.mjs   (serves the game itself; one Chrome at a time: several at once start too slowly)
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SECS = Number(process.env.SECS || 45);
const runs = ['wave=reef&seed=4&cam=1', 'wave=reef&seed=1', 'wave=reef&seed=2&size=0.8'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) fails++; };

async function ride(query) {
  const webPort = 8800 + Math.floor(Math.random() * 400), cdpPort = 9300 + Math.floor(Math.random() * 500);
  const server = spawn('python3', ['-m', 'http.server', String(webPort), '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
  const profile = mkdtempSync(join(tmpdir(), 'rrw-'));
  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--enable-unsafe-webgpu', `--user-data-dir=${profile}`, `--remote-debugging-port=${cdpPort}`, '--window-size=1280,720', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
  let targets; for (let i = 0; i < 50; i++) { try { targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json`)).json(); if (targets.length) break; } catch {} await sleep(200); }
  const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener('open', r));
  let id = 0; const pending = new Map();
  ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } if (m.method === 'Runtime.exceptionThrown') { console.log('[exception]', m.params.exceptionDetails.exception?.description); fails++; } });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
  const space = async () => { await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', code: 'Space', key: ' ', windowsVirtualKeyCode: 32 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'Space', key: ' ', windowsVirtualKeyCode: 32 }); };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:${webPort}/?play&auto&${query}` });
  for (let i = 0; i < 120 && !(await evaluate('!!(window.__dbg && window.__dbg.state === "play")')); i++) await sleep(250);
  await evaluate(`(async () => {
    const W = await import('./src/wave.js');
    const inWater = (q) => W.verticalHits(W.slice(q[0], 6), q[2]).filter((h) => h.y > q[1]).length % 2 === 1;
    const dist = (q) => { const sl = W.slice(q[0], 6); let b = Infinity; for (let i = 0; i < sl.count - 1; i++) { const az = sl.z[i], ay = sl.y[i], dz = sl.z[i + 1] - az, dy = sl.y[i + 1] - ay; const u = Math.max(0, Math.min(1, ((q[2] - az) * dz + (q[1] - ay) * dy) / (dz * dz + dy * dy || 1))); b = Math.min(b, Math.hypot(q[2] - az - dz * u, q[1] - ay - dy * u)); } return b; };
    window.__cam = { frames: 0, view: 0, wet: 0, close: 0, minView: null, first: null };
    const loop = () => {
      const d = window.__dbg;
      if (d && d.state === 'play' && d.mode === 'surf') {
        const C = window.__cam, w = inWater(d.cam), dd = dist(d.cam);
        C.frames++; if (d.view) { C.view++; C.minView = C.minView === null ? dd : Math.min(C.minView, dd); }
        if (w) C.wet++; if (d.view && dd < 0.3) C.close++;
        if ((w || (d.view && dd < 0.3)) && !C.first) C.first = { inWater: w, dist: +dd.toFixed(2), view: d.view, depth: d.depth, h: d.h, cam: d.cam, pos: d.pos };
      }
      requestAnimationFrame(loop);
    };
    loop();
  })()`);
  const t0 = Date.now();
  while (Date.now() - t0 < SECS * 1000) { await sleep(500); const s = await evaluate('window.__dbg && window.__dbg.state'); if (s === 'over' || s === 'judge') await space(); }
  const C = JSON.parse(await evaluate('JSON.stringify(window.__cam)'));
  ws.close(); chrome.kill(); server.kill(); await sleep(300); rmSync(profile, { recursive: true, force: true });
  return C;
}
for (const q of runs) {
  const C = await ride(q);
  check(C.frames > 1000 && C.view > 50, `${q}: rode ${C.frames} frames, ${C.view} in the barrel view`);
  check(C.wet === 0 && C.close === 0, `${q}: camera in the water ${C.wet} frames, nearer than 0.3 m in the barrel ${C.close}; nearest in the barrel ${C.minView === null ? '-' : C.minView.toFixed(2)} m${C.first ? `; first: ${JSON.stringify(C.first)}` : ''}`);
}
console.log(fails ? `\n${fails} failed` : '\nthe camera stays out of the water');
process.exit(fails ? 1 : 0);
