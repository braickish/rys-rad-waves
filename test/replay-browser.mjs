// Replays in the real game (headless Chrome with WebGPU; accounts plan task 2):
//   1. Ride a judged wave (the autopilot, then the keys), let it end: the ride is recorded.
//   2. "Watch it" on the score sheet, with the CPU slowed 4x so the frames fall differently: the replay rides the same
//      (same steps, end, points, judged score).
//   3. Saved to a file and opened with ?replay=<url> in a fresh page: the same again.
// node test/replay-browser.mjs   (serves the game itself; WAVE=trestles to try another wave)
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

// 1. Ride: the autopilot for 3 s, then the keys (left and right turns) until it ends.
await send('Page.navigate', { url: `${base}?play&auto&judge&wave=${WAVE}&seed=4` });
if (!(await waitFor(`window.__dbg && window.__dbg.state === 'play'`, 20000))) { check(false, 'the game started'); await done(); }
await sleep(3000);
await evaluate('window.__manual = true');
let rec = null;
for (let i = 0; i < 120 && !rec; i++) {
  const k = i % 3 === 0 ? 'ArrowLeft' : 'ArrowRight';
  await key('down', k); await sleep(250 + (i % 4) * 90); await key('up', k); await sleep(120);
  rec = await evaluate('window.__replay && JSON.stringify({ steps: window.__replay.steps, inputs: window.__replay.inputs.length, checks: window.__replay.checks.length, result: window.__replay.result })');
}
if (!rec) { check(false, 'the ride ended and was recorded'); await done(); }
rec = JSON.parse(rec);
check(rec.steps > 0 && rec.result, `recorded: ${rec.steps} steps (${(rec.steps / 120).toFixed(1)} s), ${rec.inputs} input changes, ${rec.checks} checkpoints; ${rec.result.score} points, judged ${rec.result.judged.score}`);

// 2. Watch it, slowed down.
await send('Emulation.setCPUThrottlingRate', { rate: 4 });
await evaluate(`document.querySelector('#judge:not([hidden]) .replay-btns button[data-act=watch], #over:not([hidden]) .replay-btns button[data-act=watch]').click()`);
const r1 = await waitFor('window.__replayResult && JSON.stringify(window.__replayResult)', 120000);
await send('Emulation.setCPUThrottlingRate', { rate: 1 });
const a = r1 && JSON.parse(r1);
check(a && a.same && a.steps === rec.steps && a.drift === 0, `"Watch it" (CPU 4x slower): ${a ? `${a.steps} steps, ${a.score} / ${a.recorded} points, judged ${a.judged} / ${a.recordedJudged}, drift ${a.drift}` : 'never finished'}`);

// 3. Save it and open it by URL in a fresh page.
const text = await evaluate(`(async () => { const m = await import('./src/replay.js'); return m.encodeRecording(window.__replay); })()`);
mkdirSync(join(root, 'test/out'), { recursive: true });
writeFileSync(join(root, 'test/out/replay-e2e.json'), text);
await send('Page.navigate', { url: `${base}?replay=test/out/replay-e2e.json` });
const r2 = await waitFor('window.__replayResult && JSON.stringify(window.__replayResult)', 120000);
const b = r2 && JSON.parse(r2);
check(b && b.same && b.steps === rec.steps, `?replay=<file> in a fresh page: ${b ? `${b.steps} steps, ${b.score} / ${b.recorded} points, judged ${b.judged} / ${b.recordedJudged}, drift ${b.drift}` : 'never finished'} (${(text.length / 1024).toFixed(0)} KB)`);
console.log(fails ? `\n${fails} failed` : '\nreplays match in the browser');
await done();
