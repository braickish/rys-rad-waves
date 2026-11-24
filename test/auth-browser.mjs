// Sign-in on the title screen in the real game (headless Chrome, local Supabase stack; accounts plan task 4):
//   1. "Sign in" opens the email box; "Email me a link" says to check your email
//   2. the link from the local inbox (Mailpit) lands back on the game signed in: your email and "Sign out"
//   3. a reload keeps the session
//   4. "Sign out" goes back to "Sign in", and stays signed out after a reload
//   5. typing in the email box doesn't drive the surfer (Space doesn't drop in)
// npm run db:start first, then: npm run test:auth-browser [shotPrefix]
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, dirname, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MAIL = process.env.MAILPIT_URL || 'http://127.0.0.1:55324';
const shots = process.argv[2];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const webPort = 8800 + Math.floor(Math.random() * 400), cdpPort = 9300 + Math.floor(Math.random() * 500);
// The game's files, served here (python's http.server sometimes stalls a module fetch, and the game never starts).
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.wasm': 'application/wasm' };
const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  try { const body = readFileSync(join(root, path.endsWith('/') ? path + 'index.html' : path)); res.writeHead(200, { 'content-type': TYPES[extname(path) || '.html'] || 'application/octet-stream' }); res.end(body); }
  catch { res.writeHead(404); res.end(); }
}).listen(webPort, '127.0.0.1');
const profile = mkdtempSync(join(tmpdir(), 'rrw-'));
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--enable-unsafe-webgpu', `--user-data-dir=${profile}`, `--remote-debugging-port=${cdpPort}`,
  '--window-size=1280,720', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) fails++; };
let ws;
const done = async () => { try { ws.close(); } catch {} chrome.kill(); server.close(); await sleep(300); rmSync(profile, { recursive: true, force: true }); console.log(fails ? `${fails} failed` : 'all passed'); process.exit(fails ? 1 : 0); };
let targets;
for (let i = 0; i < 50; i++) { try { targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json`)).json(); if (targets.length) break; } catch {} await sleep(200); }
ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pending = new Map();
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
async function latestLink(email, ms = 10000) {
  const t = Date.now();
  while (Date.now() - t < ms) {
    const list = await (await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`)).json();
    if (list.messages?.length) {
      const msg = await (await fetch(`${MAIL}/api/v1/message/${list.messages[0].ID}`)).json();
      const link = (msg.Text + ' ' + msg.HTML).match(/https?:\/\/[^\s"'<>]+\/auth\/v1\/verify\?[^\s"'<>]+/);
      if (link) return link[0].replace(/&amp;/g, '&');
    }
    await sleep(300);
  }
  return null;
}
await send('Runtime.enable'); await send('Page.enable');
for (let i = 0; i < 50; i++) { try { if ((await fetch(`http://127.0.0.1:${webPort}/`)).ok) break; } catch {} await sleep(100); } // (the server is up)
const base = `http://127.0.0.1:${webPort}/?wave=raglanPlus`;
const vis = (id) => `(() => { const e = document.getElementById('${id}'); return !!e && !e.hidden && e.offsetParent !== null; })()`;

// 1. Sign in, ask for a link.
await send('Page.navigate', { url: base });
const shown = await waitFor(vis('acct-open'), 20000);
check(!!shown, '"Sign in" shows on the title screen');
if (!shown) console.log(await evaluate(`JSON.stringify({ url: location.href, titleHidden: document.getElementById('title').hidden, open: document.getElementById('acct-open').hidden, dbg: typeof window.__dbg, ready: document.readyState, res: performance.getEntriesByType('resource').length, last: performance.getEntriesByType('resource').slice(-2).map((r) => r.name.split('/').pop()), sb: performance.getEntriesByType('resource').filter((r) => /esm.sh|supabase/.test(r.name)).length })`));
await shot('1-title');
await evaluate(`document.getElementById('acct-open').click()`);
check(!!(await waitFor(vis('acct-email'), 3000)), 'the email box opens');
const email = `rider-${Date.now()}@example.com`;
for (const ch of email) await key(ch, ch === ' ' ? 'Space' : '', ch);
await key(' ', 'Space', ' '); // 5. a space typed in the box doesn't drop in
await sleep(400);
const typed = await evaluate(`document.getElementById('acct-email').value`);
check(typed.startsWith(email) && (await evaluate(vis('acct-email'))), `typing stays in the box ("${typed.trim()}"), no drop-in`);
await evaluate(`(() => { const i = document.getElementById('acct-email'); i.value = i.value.trim(); document.getElementById('acct-form').requestSubmit(); })()`);
const sent = await waitFor(`${vis('acct-msg')} && document.getElementById('acct-msg').textContent`, 8000);
check(/Check .* for your sign-in link/.test(sent || ''), `after sending: "${sent}"`);
await shot('2-sent');

// 2. Follow the link.
const link = await latestLink(email);
check(!!link, 'the link arrives in the local inbox');
await send('Page.navigate', { url: link });
const who = await waitFor(`${vis('acct-who')} && document.getElementById('acct-name').textContent`, 20000);
check(who === email, `back on the game signed in as ${who}`);
check(!(await evaluate(vis('acct-open'))) && !(await evaluate(`location.hash.includes('access_token')`)), 'no "Sign in", and the tokens are gone from the address');
await shot('3-signed-in');

// 3. Reload keeps it.
await send('Page.reload');
check((await waitFor(`${vis('acct-who')} && document.getElementById('acct-name').textContent`, 20000)) === email, 'still signed in after a reload');

// 4. Sign out.
await evaluate(`document.getElementById('acct-out').click()`);
check(!!(await waitFor(`${vis('acct-open')} && !${vis('acct-who')}`, 8000)), 'signed out: "Sign in" is back');
await shot('4-signed-out');
await send('Page.reload');
await waitFor(vis('acct-open'), 20000);
await sleep(1500);
check(!(await evaluate(vis('acct-who'))) && (await evaluate(`!localStorage.getItem('rys-rad-waves-auth')`)), 'still signed out after a reload');
await done();
