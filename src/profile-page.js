// profile.html?u=<handle>: a surfer's public page (accounts plan task 5). Breaks and contest results fill in later
// (tasks 7 and 14). Your own page links to Account.
import { initAccount, onAccount, profileByHandle, describeAuthError } from './account.js';
import { JERSEYS } from './heat.js';

const $ = (id) => document.getElementById(id);
const handle = (new URLSearchParams(location.search).get('u') || '').toLowerCase();

try {
  await initAccount();
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
  }
} catch (err) {
  $('loading').textContent = describeAuthError(err);
}
