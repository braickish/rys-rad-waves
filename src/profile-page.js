// profile.html?u=<handle>: a surfer's public page (accounts plan tasks 5 and 14): who, where they surf from, their
// public breaks (Surf it), and their results in public contests. Your own page links to Account.
import { initAccount, onAccount, profileByHandle, describeAuthError } from './account.js';
import { JERSEYS } from './heat.js';
import { publicBreaks, thumbUrl, surfLink } from './breaks.js';
import { countryName, flag } from './countries.js';
import { WAVE_NAMES } from './contests.js';

const $ = (id) => document.getElementById(id);
const h = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); for (const k of kids) if (k != null) e.append(k); return e; };
const handle = (new URLSearchParams(location.search).get('u') || '').toLowerCase();
const ordinal = (n) => n + (n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th');

try {
  const c = await initAccount();
  const p = handle ? await profileByHandle(handle) : null;
  $('loading').hidden = true;
  if (!p) { $('missing').hidden = false; $('missing-handle').textContent = handle ? `@${handle}` : 'that'; }
  else {
    $('profile').hidden = false;
    $('p-name').textContent = p.display_name || `@${p.handle}`;
    $('p-handle').textContent = `@${p.handle}`;
    $('p-dot').style.background = JERSEYS.find((j) => j.id === p.jersey)?.color || '#888';
    $('p-since').textContent = new Date(p.created_at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    document.title = `${p.display_name || '@' + p.handle} · Ry's Rad Waves`;
    onAccount((s) => { $('edit').hidden = s?.user?.id !== p.id; });
    // where they surf from
    const where = [p.city, p.country && countryName(p.country)].filter(Boolean).join(', ');
    if (where) { $('p-where').hidden = false; $('p-where').textContent = `${flag(p.country)} Surfs from ${where}`.trim(); }
    // public breaks
    const breaks = await publicBreaks(p.id).catch(() => []);
    $('p-breaks-none').hidden = breaks.length > 0;
    for (const b of breaks) {
      const img = thumbUrl(b) ? h('img', { src: thumbUrl(b), alt: '', loading: 'lazy' }) : h('div', { className: 'nothumb' });
      $('p-breaks').append(h('a', { className: 'card', href: surfLink(b.id) }, img, h('b', { textContent: b.name }), h('span', { textContent: 'Surf it →' })));
    }
    // contest results (public contests that are over)
    const { data: results } = await c.rpc('profile_results', { handle: p.handle });
    $('p-results-none').hidden = !!results?.length;
    for (const r of results || []) {
      const how = r.final ? (r.place === 1 ? 'Won' : `${ordinal(r.place)} in the final`) : `Out in round ${r.round}`;
      const when = r.ended_at ? new Date(r.ended_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
      $('p-results').append(h('a', { className: 'result', href: `contest.html?c=${encodeURIComponent(r.code)}` },
        h('span', { className: 'pl', textContent: r.final ? (r.place === 1 ? '🏆' : ordinal(r.place)) : `R${r.round}` }),
        h('b', { textContent: r.name }),
        h('span', { className: 'tot', textContent: Number(r.total).toFixed(2) }),
        h('small', { textContent: `${how} · ${r.spot_name || WAVE_NAMES[r.spot_wave] || ''} · ${r.entrants} surfers · ${when}` })));
    }
  }
} catch (err) {
  $('loading').textContent = describeAuthError(err);
}
