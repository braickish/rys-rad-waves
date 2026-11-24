// Heat mode in the real game (headless Chrome; accounts plan task 3). The autopilot surfs:
//   1. ?heat=1m: the board shows (clock, 4 rows), waves are judged and added, the sheet paddles back out by itself, the
//      horn goes, the wave being ridden still counts, then the results card. "Watch your best wave" replays it the same.
//   2. ?heat=2w: two waves, then the results; the bots' waves all in.
// node test/heat-browser.mjs [shotPrefix]   (serves the game itself; WAVE=... to pick the wave)
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const WAVE = process.env.WAVE || 'raglanPlus', shots = process.argv[2];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const webPort = 8800 + Math.floor(Math.random() * 400), cdpPort = 9300 + Math.floor(Math.random() * 500);
const server = spawn('python3', ['-m', 'http.server', String(webPort), '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
const profile = mkdtempSync(join(tmpdir(), 'rrw-'));
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--enable-unsafe-webgpu', `--user-data-dir=${profile}`, `--remote-debugging-port=${cdpPort}`,
  '--window-size=1280,720', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) fails++; };
let ws;
const done = async () => { try { ws.close(); } catch {} chrome.kill(); server.kill(); await sleep(300); rmSync(profile, { recursive: true, force: true }); process.exit(fails ? 1 : 0); };
let targets;
for (let i = 0; i < 50; i++) { try { targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json`)).json(); if (targets.length) break; } catch {} await sleep(200); }
ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pending = new Map();
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') { console.log('[exception]', m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); fails++; }
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
const waitFor = async (expr, ms) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await evaluate(expr); if (v) return v; await sleep(250); } return null; };
const shot = async (name) => { if (!shots) return; const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(`${shots}-${name}.png`, Buffer.from(r.result.data, 'base64')); };
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
const base = `http://127.0.0.1:${webPort}/`;
const H = (expr) => evaluate(`(() => { const h = window.__heat; return h && (${expr}); })()`);

// 1. A one-minute heat.
await send('Page.navigate', { url: `${base}?play&auto&heat=1m&seed=5&wave=${WAVE}` });
check(!!(await waitFor(`window.__heat && !document.getElementById('board').hidden`, 20000)), 'the heat starts at DROP IN and the board shows');
await sleep(2500);
const rows = await evaluate(`document.querySelectorAll('#board-rows .br').length`), clock = await evaluate(`document.getElementById('board-clock').textContent`);
check(rows === 4 && /^0:5\d$/.test(clock), `board: ${rows} rows, clock ${clock}`);
await shot('1-board');
const sheet = await waitFor(`!document.getElementById('judge').hidden && document.getElementById('judge-heat').textContent`, 90000);
check(!!sheet, `a wave judged: "${sheet}"`);
await shot('2-sheet');
const firstWaves = await H('h.surfers[0].waves.length');
const back = await waitFor(`window.__dbg.state === 'play'`, 9000);
check(back && firstWaves >= 1, `the sheet paddled back out by itself (${firstWaves} wave in)`);
const res = await waitFor(`window.__heatResults && JSON.stringify(window.__heatResults)`, 180000);
check(!!res, `the horn, then the results: ${res}`);
const me = await H(`JSON.stringify({ waves: h.surfers[0].waves.map((w) => ({ score: w.score, at: +w.at.toFixed(1) })), horn: h.horn, time: +h.time.toFixed(1) })`);
const m = JSON.parse(me);
check(m.horn && m.waves.length >= 1 && m.waves.every((w) => w.at < 60), `your waves, all caught before the horn: ${m.waves.map((w) => `${w.score}@${w.at}s`).join(', ')} (heat over at ${m.time} s)`);
await shot('3-results');
// Watch your best wave: the same ride again.
await evaluate(`document.getElementById('results-watch').click()`);
const rp = await waitFor('window.__replayResult && JSON.stringify(window.__replayResult)', 120000);
const r = rp && JSON.parse(rp);
const bestScore = Math.max(...m.waves.map((w) => w.score));
check(r && r.same && r.judged === bestScore, `"Watch your best wave": ${r ? `judged ${r.judged} (best ${bestScore}), same ride: ${r.same}` : 'never finished'}`);
const back1 = await waitFor(`!document.getElementById('results').hidden && document.getElementById('results-note').textContent`, 5000);
check(!!back1, `the replay ends back on the results: "${back1}"`);
await shot('4-back');
// Again, and leave part way with Esc: the results card is gone while it plays, and comes back.
await evaluate(`window.__replayResult = null; document.getElementById('results-watch').click()`);
await sleep(1500);
const during = await evaluate(`JSON.stringify({ results: document.getElementById('results').hidden, badge: document.getElementById('replay-badge').hidden, exit: document.getElementById('replay-exit').textContent, state: window.__dbg.state })`);
const d = JSON.parse(during);
check(d.results && !d.badge && d.exit === '✕ Back to results' && d.state === 'play', `while it plays: results hidden, the badge says "${d.exit}"`);
await shot('5-during');
await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', code: 'Escape', key: 'Escape', windowsVirtualKeyCode: 27 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', code: 'Escape', key: 'Escape', windowsVirtualKeyCode: 27 });
check(!!(await waitFor(`!document.getElementById('results').hidden && document.getElementById('replay-badge').hidden`, 3000)), 'Esc part way: back to the results');
// And the badge's ✕ does the same.
await evaluate(`document.getElementById('results-watch').click()`);
await sleep(1000);
await evaluate(`document.getElementById('replay-badge').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))`);
check(!!(await waitFor(`!document.getElementById('results').hidden && document.getElementById('replay-badge').hidden`, 3000)), '"✕ Back to results" part way: back to the results');

// 2. A two-wave heat.
await send('Page.navigate', { url: `${base}?play&auto&heat=2w&seed=8&wave=${WAVE}` });
const res2 = await waitFor(`window.__heatResults && JSON.stringify(window.__heatResults)`, 240000);
const w2 = await H(`JSON.stringify(h.surfers.map((s) => s.waves.length))`);
check(!!res2 && w2 === '[2,2,2,2]', `2-wave heat: results after your 2nd wave, everyone's 2 in (${w2}): ${res2}`);
console.log(fails ? `\n${fails} failed` : '\nheat mode ok');
await done();
