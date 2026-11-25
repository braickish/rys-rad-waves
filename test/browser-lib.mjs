// Shared by the account browser tests (auth-browser, profile-browser): the game served from Node, headless Chrome over
// CDP, checks, screenshots, and the local Supabase inbox (Mailpit).
// (python's http.server sometimes stalls a module fetch, and the game never starts: so Node serves the files.)
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, dirname, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MAIL = process.env.MAILPIT_URL || 'http://127.0.0.1:55324';
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.wasm': 'application/wasm' };

export async function openBrowser({ shots } = {}) {
  const webPort = 8800 + Math.floor(Math.random() * 400), cdpPort = 9300 + Math.floor(Math.random() * 500);
  const server = createServer((req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
    try { const body = readFileSync(join(root, path.endsWith('/') ? path + 'index.html' : path)); res.writeHead(200, { 'content-type': TYPES[extname(path) || '.html'] || 'application/octet-stream' }); res.end(body); }
    catch { res.writeHead(404); res.end(); }
  }).listen(webPort, '127.0.0.1');
  const profile = mkdtempSync(join(tmpdir(), 'rrw-'));
  const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
    '--headless=new', '--enable-unsafe-webgpu', `--user-data-dir=${profile}`, `--remote-debugging-port=${cdpPort}`,
    '--window-size=1280,720', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
  let fails = 0, id = 0, ws, targets;
  const pending = new Map();
  const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) fails++; };
  for (let i = 0; i < 50; i++) { try { targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json`)).json(); if (targets.length) break; } catch {} await sleep(200); }
  ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Runtime.consoleAPICalled' && /warn|error/.test(m.params.type)) console.log(`[${m.params.type}]`, m.params.args.map((a) => a.value ?? a.description).join(' '));
    if (m.method === 'Runtime.exceptionThrown') { console.log('[exception]', m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); fails++; }
  });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
  const waitFor = async (expr, ms) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await evaluate(expr); if (v) return v; await sleep(250); } return null; };
  const shot = async (name) => { if (!shots) return; const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(`${shots}-${name}.png`, Buffer.from(r.result.data, 'base64')); };
  const key = async (k, code, text) => { await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, text }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code }); };
  // Typing into the focused field, as a person would (input events and all).
  const type = (text) => send('Input.insertText', { text });
  const go = (url) => send('Page.navigate', { url });
  // Visible: not hidden and laid out.
  const vis = (elId) => `(() => { const e = document.getElementById('${elId}'); return !!e && !e.hidden && e.offsetParent !== null; })()`;
  const text = (elId) => evaluate(`document.getElementById('${elId}')?.textContent`);
  const close = async () => { try { ws.close(); } catch {} chrome.kill(); server.close(); await sleep(300); rmSync(profile, { recursive: true, force: true }); };
  const done = async () => { await close(); console.log(fails ? `${fails} failed` : 'all passed'); process.exit(fails ? 1 : 0); };
  await send('Runtime.enable'); await send('Page.enable');
  for (let i = 0; i < 50; i++) { try { if ((await fetch(`http://127.0.0.1:${webPort}/`)).ok) break; } catch {} await sleep(100); }
  return { base: `http://127.0.0.1:${webPort}/`, send, evaluate, waitFor, shot, key, type, go, vis, text, check, done, close };
}

// The newest sign-in (or confirm) link sent to this address, waiting for it to arrive.
export async function latestLink(email, ms = 10000, after = 0) {
  const t = Date.now();
  while (Date.now() - t < ms) {
    const list = await (await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`)).json();
    const m = list.messages?.find((x) => Date.parse(x.Created) > after);
    if (m) {
      const msg = await (await fetch(`${MAIL}/api/v1/message/${m.ID}`)).json();
      const link = (msg.Text + ' ' + msg.HTML).match(/https?:\/\/[^\s"'<>]+\/auth\/v1\/verify\?[^\s"'<>]+/);
      if (link) return link[0].replace(/&amp;/g, '&');
    }
    await sleep(300);
  }
  return null;
}

// Signs in on the title screen: Sign in, the email, the link.
export async function signInOnTitle(b, email) {
  await b.waitFor(b.vis('acct-open'), 20000);
  await b.evaluate(`document.getElementById('acct-open').click()`);
  await b.waitFor(b.vis('acct-email'), 3000);
  await b.evaluate(`document.getElementById('acct-email').value = ${JSON.stringify(email)}; document.getElementById('acct-form').requestSubmit()`);
  await b.waitFor(`/Check/.test(document.getElementById('acct-msg').textContent)`, 8000);
  const link = await latestLink(email);
  if (link) await b.go(link);
  return link;
}
