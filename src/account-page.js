// account.html: your handle, name and jersey; your email; sign out; delete your account (accounts plan task 5).
// The plan panel buys the Wave Pass or Pro, and opens Stripe's billing page (task 9). Your breaks and contests join it
// later (task 14).
import { initAccount, onAccount, onPlan, SALES_OPEN, currentPlan, myProfile, saveProfile, handleProblem, changeEmail, deleteAccount, signOut, describeAuthError, describeProfileError } from './account.js';
import { JERSEYS } from './heat.js';
import { handleFromEmail } from './account-ui.js';
import { countriesByName, flag } from './countries.js';
import { searchTowns } from './places.js';
import { myContests, cancelContest, spotName, describeContestError } from './contests.js';
import { PALETTE, PATTERNS, PARTS, CUTS, BODIES, hex, cleanStyling, cleanBody } from './styling.js';
import { openPaywall, startPaywall, goToStripe } from './paywall.js';

const $ = (id) => document.getElementById(id);
const hint = (id, text, kind = '') => { const e = $(id); e.textContent = text || ''; e.className = `hint ${kind}`; };
let profile = null, jersey = 'red', user = null;

// Jersey swatches.
for (const j of JERSEYS) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'jersey'; b.style.background = j.color; b.dataset.id = j.id;
  b.setAttribute('role', 'radio'); b.setAttribute('aria-label', j.id);
  b.addEventListener('click', () => { jersey = j.id; drawJerseys(); });
  $('jerseys').appendChild(b);
}
function drawJerseys() { for (const b of $('jerseys').children) { const on = b.dataset.id === jersey; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); } }

// Where you surf from (task 14): a town (picked from the suggestions puts it on the map) and a country.
let place = { city: null, lat: null, lng: null };
for (const c of countriesByName()) $('country').add(new Option(`${flag(c.code)} ${c.name}`, c.code));
const placeHint = () => hint('place-hint', !$('city').value.trim() ? 'Pick your town from the list to put it on the map.'
  : place.lat != null && place.city === $('city').value.trim() ? 'On the map.' : 'Pick your town from the list to put it on the map (or keep it as typed, off the map).', place.lat != null && place.city === $('city').value.trim() ? 'good' : '');
let townT = 0, townAsk = null;
const list = $('city-list');
const closeList = () => { list.hidden = true; list.innerHTML = ''; };
$('city').addEventListener('input', () => {
  clearTimeout(townT); townAsk?.abort(); placeHint();
  const q = $('city').value.trim();
  if (q.length < 2) { closeList(); return; }
  townT = setTimeout(async () => {
    townAsk = new AbortController();
    try {
      const towns = await searchTowns(q, { signal: townAsk.signal });
      list.innerHTML = '';
      for (const t of towns) {
        const b = document.createElement('button');
        b.type = 'button'; b.setAttribute('role', 'option');
        b.innerHTML = `${flag(t.country)} <b></b> <small></small>`;
        b.querySelector('b').textContent = t.name; b.querySelector('small').textContent = [t.region, t.country].filter(Boolean).join(', ');
        b.addEventListener('click', () => { place = { city: t.name, lat: t.lat, lng: t.lng }; $('city').value = t.name; $('country').value = t.country; closeList(); placeHint(); });
        list.append(b);
      }
      list.hidden = !towns.length;
    } catch (e) { if (e.name !== 'AbortError') console.warn('towns', e); }
  }, 250);
});
$('city').addEventListener('keydown', (e) => { if (e.key === 'Escape') closeList(); if (e.key === 'ArrowDown' && !list.hidden) { e.preventDefault(); list.querySelector('button')?.focus(); } });
document.addEventListener('click', (e) => { if (!e.target.closest('.place')) closeList(); });
$('country').addEventListener('change', () => { if (place.lat != null) { place = { city: place.city, lat: null, lng: null }; placeHint(); } }); // (another country: that town's map spot no longer fits)
const placeFields = () => {
  const city = $('city').value.trim() || null, onMap = city && place.lat != null && place.city === city;
  return { city, country: $('country').value || null, lat: onMap ? place.lat : null, lng: onMap ? place.lng : null };
};

function fill() {
  $('handle').value = profile?.handle || handleFromEmail(user.email);
  $('display').value = profile?.display_name || '';
  jersey = profile?.jersey || 'red'; drawJerseys();
  style = cleanStyling(profile?.styling); body = cleanBody(profile?.surfer); drawStyle(); lockStyle();
  $('city').value = profile?.city || ''; $('country').value = profile?.country || '';
  place = { city: profile?.city || null, lat: profile?.lat ?? null, lng: profile?.lng ?? null }; placeHint();
  $('email-now').textContent = user.email;
  $('view').hidden = !profile; if (profile) $('view').href = `profile.html?u=${encodeURIComponent(profile.handle)}`;
  $('save').textContent = profile ? 'Save' : 'Make my profile';
  $('delete-word').textContent = profile?.handle || 'delete';
  $('delete-confirm').value = ''; $('delete').disabled = true;
}

// The handle, checked as you type.
let checkT = 0;
$('handle').addEventListener('input', () => {
  const v = $('handle').value.toLowerCase().replace(/[\s-]/g, '_');
  if (v !== $('handle').value) $('handle').value = v;
  clearTimeout(checkT);
  if (v === profile?.handle) { hint('handle-hint', 'Your handle now.'); return; }
  checkT = setTimeout(async () => {
    try { const why = await handleProblem(v); hint('handle-hint', why || `${v} is free.`, why ? 'bad' : 'good'); } catch {}
  }, 300);
});

$('profile-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearTimeout(checkT);
  $('save').disabled = true; hint('save-msg', '');
  try {
    const h = $('handle').value;
    const why = h === profile?.handle ? null : await handleProblem(h);
    if (why) hint('handle-hint', why, 'bad');
    else {
      profile = await saveProfile({ handle: h, display_name: $('display').value.trim() || null, jersey, ...placeFields() });
      fill(); hint('handle-hint', 'Your handle now.'); hint('save-msg', 'Saved.', 'good');
    }
  } catch (err) { hint('save-msg', describeProfileError(err), 'bad'); }
  $('save').disabled = false;
});

$('email-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const to = $('email-new').value.trim();
  $('email-send').disabled = true;
  try { await changeEmail(to); hint('email-msg', `Check both ${user.email} and ${to}: confirm the change from each.`, 'good'); $('email-new').value = ''; }
  catch (err) { hint('email-msg', describeAuthError(err), 'bad'); }
  $('email-send').disabled = false;
});

$('signout').addEventListener('click', async () => { try { await signOut(); } catch (err) { console.warn(err); } location.href = './'; });

$('delete-confirm').addEventListener('input', () => { $('delete').disabled = $('delete-confirm').value.trim().toLowerCase() !== $('delete-word').textContent; });
$('delete-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if ($('delete').disabled) return;
  $('delete').disabled = true;
  try { await deleteAccount(); location.href = './?deleted'; }
  catch (err) {
    // (Pro that still renews has to be cancelled first, so nobody keeps paying for an account that's gone)
    const words = err?.hint === 'pro_renewing' ? 'Cancel Pro first (in Manage billing). Then you can delete your account.' : describeAuthError(err);
    hint('delete-msg', words, 'bad'); $('delete').disabled = false;
  }
});

// Your plan (task 6), and buying it (task 9): the sheet for the Wave Pass or Pro; Manage billing opens Stripe's
// Customer Portal (cards, receipts, cancelling Pro) for anything bought.
$('buy-pass').addEventListener('click', () => openPaywall({ want: 'wave_pass' }));
$('buy-pro').addEventListener('click', () => openPaywall({ want: 'pro' }));
$('billing').addEventListener('click', async () => {
  $('billing').disabled = true; hint('plan-msg', '');
  try { await goToStripe('portal'); } catch (err) {
    hint('plan-msg', err.code === 'no_customer' ? "Your plan was given to you, so there's no billing to manage." : err.message, 'bad');
  }
  $('billing').disabled = false;
});
const day = (t) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
onPlan((p) => {
  $('plan-now').innerHTML = p.pro
    ? (p.grace ? `<b>Pro</b>: your last payment didn't go through. It stays on for a few days while it's sorted out.`
      : `<b>Pro</b> until ${day(p.pro_until)}: every wave, saving your breaks, and hosting contests.`)
    : p.wave_pass ? '<b>Wave Pass</b>: every wave, for life.'
    : '<b>Free</b>: Raglan and Queens, the wave builder to try, and any contest you\'re invited to.';
  $('buy-pass').hidden = !SALES_OPEN || p.wave_pass || p.pro;
  $('buy-pro').hidden = !SALES_OPEN || p.pro;
  $('billing').hidden = !(p.wave_pass || p.pro);
});
startPaywall().catch((e) => console.warn('paywall', e));

// Your surfer (task 16, Pro): swatches for the wetsuit, trunks, board and nose (a striped swatch: the game's own), the
// trunks' pattern, and a flat little preview. Saved to profiles.styling; worn in your rides while you have Pro.
const DEFAULTS = { suit: [0.045, 0.047, 0.055], shorts: [0.22, 0.33, 0.5], board: [0.95, 0.93, 0.86], nose: [0.55, 0.84, 0.8] };
let style = {}, body = null;
function drawPreview() {
  const c = (k) => hex(style[k] ? PALETTE[style[k]] : DEFAULTS[k]);
  const stripes = style.pattern === 'stripes', floral = style.pattern === 'floral', girl = body === 'girl';
  const pp = (d) => `<path d="${d}" fill="${c('shorts')}"/><path d="${d}" fill="url(#pp)"/>`;
  $('style-preview').innerHTML = `
    <defs><pattern id="pp" width="8" height="8" patternUnits="userSpaceOnUse">${stripes ? `<rect width="4" height="8" fill="rgba(255,255,255,.45)"/>` : floral ? `<circle cx="2" cy="2" r="1.6" fill="#fff"/><circle cx="6" cy="6" r="1.2" fill="rgba(0,0,0,.35)"/>` : ''}</pattern></defs>
    ${girl ? '<path d="M48 14 q12 -12 24 0 l4 30 h-32 z" fill="#8a5a33"/>' : ''}
    <circle cx="60" cy="24" r="11" fill="#d9915e"/>
    ${girl
      ? `<path d="M46 40 h28 l4 34 h-36 z" fill="#d9915e"/>${pp('M45 46 h30 v10 h-30 z')}<path d="M42 74 h36 l-3 12 h-30 z" fill="#d9915e"/>${pp('M42 74 h36 l-8 12 h-20 z')}<path d="M45 86 h12 v32 h-12 z M63 86 h12 v32 h-12 z" fill="#d9915e"/>`
      : `<path d="M44 40 h32 l6 34 h-44 z" fill="${c('suit')}"/>${pp('M38 74 h44 l-4 22 h-36 z')}<path d="M44 96 h12 v22 h-12 z M64 96 h12 v22 h-12 z" fill="${c('suit')}"/>`}
    <ellipse cx="60" cy="132" rx="50" ry="9" fill="${c('board')}" stroke="rgba(0,0,0,.35)"/>
    <path d="M92 124.6 A50 9 0 0 1 110 132 A50 9 0 0 1 92 139.4 Q97 132 92 124.6 z" fill="${c('nose')}"/>`;
}
function drawStyle() {
  const rows = $('style-rows'); rows.innerHTML = '';
  // Which surfer: free for everyone, saved straight away (profiles.surfer).
  const br = document.createElement('div'); br.className = 'style-row body-row';
  br.innerHTML = '<b>Surfer</b><div class="row"></div>';
  for (const [id, label] of BODIES) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = `pattern-btn${body === id ? ' on' : ''}`; b.textContent = label; b.dataset.body = id;
    b.addEventListener('click', async () => {
      if (!profile) { hint('style-msg', 'Make your profile first (above).', 'bad'); return; }
      body = id; drawStyle();
      try { profile = await saveProfile({ surfer: id }); hint('style-msg', `Saved: you surf as ${label.toLowerCase()}.`, 'good'); }
      catch (err) { hint('style-msg', describeProfileError(err), 'bad'); }
    });
    br.querySelector('.row').append(b);
  }
  if (!body) br.append(Object.assign(document.createElement('p'), { className: 'hint', textContent: "Until you pick, each wave has its own surfer." }));
  rows.append(br);
  for (const [k, label] of PARTS) {
    const row = document.createElement('div'); row.className = 'style-row';
    row.innerHTML = `<b>${label}</b><div class="swatches" role="radiogroup" aria-label="${label}"></div>`;
    const box = row.querySelector('.swatches');
    for (const id of [null, ...Object.keys(PALETTE)]) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = `swatch${id ? '' : ' default'}${(style[k] || null) === id ? ' on' : ''}`; b.dataset.part = k; b.dataset.id = id || '';
      if (id) b.style.background = hex(PALETTE[id]);
      b.setAttribute('role', 'radio'); b.setAttribute('aria-label', id || 'the game\'s own'); b.title = id || 'the game\'s own';
      b.addEventListener('click', () => { if (id) style[k] = id; else delete style[k]; drawStyle(); });
      box.append(b);
    }
    rows.append(row);
    if (k === 'shorts') {
      const pr = document.createElement('div'); pr.className = 'style-row pattern-row';
      pr.innerHTML = '<b>Pattern</b><div class="row"></div>';
      for (const p of PATTERNS) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = `pattern-btn${(style.pattern || 'solid') === p ? ' on' : ''}`; b.textContent = p[0].toUpperCase() + p.slice(1); b.dataset.pattern = p;
        b.addEventListener('click', () => { if (p === 'solid') delete style.pattern; else style.pattern = p; drawStyle(); });
        pr.querySelector('.row').append(b);
      }
      rows.append(pr);
      if (body === 'girl') { // the bikini's cut (Pro)
        const cr = document.createElement('div'); cr.className = 'style-row pattern-row';
        cr.innerHTML = '<b>Bikini cut</b><div class="row"></div>';
        for (const [id, label] of CUTS) {
          const b = document.createElement('button');
          b.type = 'button'; b.className = `pattern-btn${(style.cut || 'full') === id ? ' on' : ''}`; b.textContent = label; b.dataset.cut = id;
          b.addEventListener('click', () => { if (id === 'full') delete style.cut; else style.cut = id; drawStyle(); });
          cr.querySelector('.row').append(b);
        }
        rows.append(cr);
      }
    }
  }
  drawPreview();
}
const styleLocked = () => !currentPlan().pro;
function lockStyle() {
  const locked = styleLocked();
  $('style-form').classList.toggle('locked', locked);
  $('style-save').textContent = locked ? (SALES_OPEN ? 'Go Pro to style your surfer' : 'Styling comes with Pro') : 'Save';
  $('style-save').disabled = locked && !SALES_OPEN;
}
onPlan(lockStyle);
$('style-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (styleLocked()) { openPaywall({ want: 'pro', why: 'Styling your surfer comes with Pro.' }); return; }
  if (!profile) { hint('style-msg', 'Make your profile first (above).', 'bad'); return; }
  $('style-save').disabled = true;
  try { profile = await saveProfile({ styling: cleanStyling(style) }); hint('style-msg', 'Saved. Your surfer wears it from your next ride.', 'good'); }
  catch (err) { hint('style-msg', describeProfileError(err), 'bad'); }
  $('style-save').disabled = false;
});

// Your contests (task 14): hosted or entered, newest first; open ones to their lobby (and the host can cancel), the rest
// to their page.
const STATE_WORDS = { lobby: 'In the lobby', running: 'On now', done: 'Over', cancelled: 'Cancelled' };
async function drawContests() {
  const list = await myContests().catch((e) => { console.warn('contests', e); return []; });
  const el = $('my-contests'); el.innerHTML = '';
  $('my-contests-none').hidden = list.length > 0;
  for (const k of list) {
    const open = k.state === 'lobby' || k.state === 'running';
    const a = document.createElement('a');
    a.className = 'result'; a.href = open ? `index.html?contest=${k.code}` : `contest.html?c=${k.code}`;
    a.innerHTML = '<span class="pl"></span><b></b><span class="tot"></span><small></small>';
    a.querySelector('.pl').textContent = k.state === 'done' ? '✓' : k.state === 'cancelled' ? '✕' : '●';
    a.querySelector('b').textContent = k.name;
    a.querySelector('.tot').textContent = k.code;
    a.querySelector('small').textContent = `${STATE_WORDS[k.state]} · ${k.hosting ? (k.entered ? 'hosting and surfing' : 'hosting') : 'surfed'} · ${spotName(k)} · ${new Date(k.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}${k.visibility === 'public' ? ' · public' : ''}`;
    el.append(a);
    if (k.hosting && open) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'quiet'; b.textContent = `Cancel ${k.name}`; b.style.justifySelf = 'start';
      b.addEventListener('click', async () => { if (!confirm(`Cancel “${k.name}” for everyone?`)) return; try { await cancelContest(k.id); drawContests(); } catch (e) { alert(describeContestError(e)); } });
      el.append(b);
    }
  }
}

try {
  await initAccount();
  let shownFor;
  onAccount(async (s) => {
    const u = s?.user && !s.user.is_anonymous ? s.user : null;
    $('loading').hidden = true;
    $('signed-out').hidden = !!u; $('signed-in').hidden = !u;
    if (!u) { shownFor = null; return; }
    user = u;
    if (shownFor === u.id && u.email === $('email-now').textContent) return;
    shownFor = u.id;
    try { profile = await myProfile(); fill(); } catch (err) { hint('save-msg', describeAuthError(err), 'bad'); }
    drawContests();
  });
} catch (err) { $('loading').textContent = describeAuthError(err); }
