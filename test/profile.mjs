// Profile the game's main-thread JavaScript in headless Chrome: load a wave, let it settle, record a CPU
// profile, and print where the time goes (self time by function) plus the frame rate and average tick cost.
// Usage: node test/profile.mjs "<query>" [seconds]     e.g. node test/profile.mjs "wave=queens&play&auto" 6
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [query = 'play&auto', secs = '6'] = process.argv.slice(2);
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
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pending = new Map();
ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJS = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true })).result?.result?.value;

await send('Page.enable'); await send('Profiler.enable');
// RETINA=1: a 1440x900 window at 2x, like a MacBook screen
const retina = !!process.env.RETINA;
await send('Emulation.setDeviceMetricsOverride', { width: retina ? 1440 : 1280, height: retina ? 900 : 720, deviceScaleFactor: retina ? 2 : 1, mobile: false });
// GPU time per frame: from each submit until the GPU reports that work done
await send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { window.__gpu = { n: 0, ms: 0 };
  const sub = GPUQueue.prototype.submit;
  GPUQueue.prototype.submit = function (b) { const a = performance.now(); sub.call(this, b);
    this.onSubmittedWorkDone().then(() => { if (window.__gpuOn) { window.__gpu.ms += performance.now() - a; window.__gpu.n++; } }); };
})()` });
await send('Page.navigate', { url: `http://127.0.0.1:8765/?${query}` });
await sleep(3000);
// count frames and time spent inside requestAnimationFrame callbacks
await evalJS(`(() => { window.__pf = { n: 0, busy: 0, t0: performance.now() };
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => raf((t) => { const a = performance.now(); cb(t); window.__pf.busy += performance.now() - a; window.__pf.n++; });
})()`);
await evalJS('window.__gpuOn = true');
await send('Profiler.setSamplingInterval', { interval: 200 });
await send('Profiler.start');
await sleep(Number(secs) * 1000);
const { result } = await send('Profiler.stop');
const pf = await evalJS('JSON.stringify({ ...window.__pf, t1: performance.now(), gpu: window.__gpu.ms / window.__gpu.n, px: [document.querySelector("canvas").width, document.querySelector("canvas").height] })');
const p = JSON.parse(pf);
const prof = result.profile;
const self = new Map(); const byId = new Map(prof.nodes.map((n) => [n.id, n]));
const dts = prof.timeDeltas; let total = 0;
prof.samples.forEach((sid, i) => {
  const n = byId.get(sid), cf = n.callFrame, dt = dts[i] / 1000;
  const key = `${cf.functionName || '(anon)'}  ${cf.url.split('/').pop()}:${cf.lineNumber + 1}`;
  self.set(key, (self.get(key) || 0) + dt); total += dt;
});
const rows = [...self.entries()].filter(([k]) => !k.startsWith('(idle)')).sort((a, b) => b[1] - a[1]).slice(0, 25);
const idle = self.get('(idle)  :0') || 0;
console.log(`${query}: ${(p.n / ((p.t1 - p.t0) / 1000)).toFixed(1)} fps, JS per frame ${(p.busy / p.n).toFixed(2)} ms, GPU per frame ~${p.gpu.toFixed(2)} ms at ${p.px.join('x')}; profile ${total.toFixed(0)} ms, busy ${(total - idle).toFixed(0)} ms`);
for (const [k, v] of rows) console.log(`${v.toFixed(1).padStart(8)} ms  ${(100 * v / (total - idle)).toFixed(1).padStart(5)}%  ${k}`);
ws.close(); chrome.kill(); await sleep(300); rmSync(profile, { recursive: true, force: true });
