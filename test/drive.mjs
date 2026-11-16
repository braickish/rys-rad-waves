// Drive headless Chrome over the DevTools protocol: load the game, collect
// console output, optionally hold keys, and save screenshots.
// Usage: node test/drive.mjs <outPrefix> "<query>" [shotsAtMs,...] [keys timeline JSON]
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [out, query = 'play&auto', shotsArg = '3000', keysArg = '[]'] = process.argv.slice(2);
const shots = shotsArg.split(',').map(Number);
const keyPlan = JSON.parse(keysArg); // [[ms, 'down'|'up', 'ArrowUp'], ...]
const profile = mkdtempSync(join(tmpdir(), 'rrw-'));
const port = 9300 + Math.floor(Math.random() * 500);
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--enable-unsafe-webgpu', `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`,
  '--window-size=1280,720', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 50; i++) {
  try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (targets.length) break; } catch {}
  await sleep(200);
}
const page = targets.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pending = new Map();
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Runtime.consoleAPICalled') console.log(`[console.${m.params.type}]`, m.params.args.map((a) => a.value ?? a.description).join(' '));
  if (m.method === 'Runtime.exceptionThrown') console.log('[exception]', m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  if (m.method === 'Log.entryAdded') console.log(`[log.${m.params.entry.level}]`, m.params.entry.text);
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
const MOBILE = !!process.env.MOBILE; // emulate a phone held upright with touch
if (MOBILE) {
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send('Emulation.setEmitTouchEventsForMouse', { enabled: true, configuration: 'mobile' });
} else {
  // RETINA=1 renders at 2x (1440x900 @2x = 2880x1800), like a MacBook screen.
  const retina = !!process.env.RETINA;
  await send('Emulation.setDeviceMetricsOverride', { width: retina ? 1440 : 1280, height: retina ? 900 : 720, deviceScaleFactor: retina ? 2 : 1, mobile: false });
}
await send('Page.navigate', { url: `http://127.0.0.1:8765/?${query}` });
const t0 = Date.now();
// Key plan entries: [ms, 'down'|'up', key] or touch: [ms, 'touchStart'|'touchMove'|'touchEnd', x, y]
const events = [...keyPlan.map(([ms, type, key, y]) => (type.startsWith('touch') ? { ms, kind: 'touch', type, x: key, y } : { ms, kind: 'key', type, key })), ...shots.map((ms, i) => ({ ms, kind: 'shot', i }))].sort((a, b) => a.ms - b.ms);
const codes = { ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39, Space: 32, ShiftLeft: 16, KeyC: 67 };
for (const e of events) {
  const wait = e.ms - (Date.now() - t0);
  if (wait > 0) await sleep(wait);
  if (e.kind === 'touch') {
    await send('Input.dispatchTouchEvent', { type: e.type, touchPoints: e.type === 'touchEnd' ? [] : [{ x: e.x, y: e.y, id: 1 }] });
  } else if (e.kind === 'key') {
    await send('Input.dispatchKeyEvent', { type: e.type === 'down' ? 'rawKeyDown' : 'keyUp', code: e.key, key: e.key === 'Space' ? ' ' : e.key, windowsVirtualKeyCode: codes[e.key] });
  } else {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    const f = `${out}-${e.i}.png`;
    writeFileSync(f, Buffer.from(r.result.data, 'base64'));
    const st = await send('Runtime.evaluate', { expression: 'JSON.stringify(window.__dbg || null)', returnByValue: true });
    console.log(`shot ${f} @${e.ms}ms dbg=${st.result?.result?.value}`);
  }
}
ws.close(); chrome.kill(); await sleep(300); rmSync(profile, { recursive: true, force: true });
