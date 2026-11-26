// Cloud breaks (plans/2026-11-23-accounts-and-paid-plans.md, task 7): your builder designs saved to your account, in
// the `breaks` table (supabase/migrations/20261124040000_breaks.sql), with a map thumbnail in Storage. Saving and
// changing need Pro (the database enforces it); reading, surfing and deleting your own don't, so a lapsed Pro keeps
// everything.
import { initAccount, currentUser, supabaseTarget } from './account.js';

const COLS = 'id, name, visibility, thumb_path, version, created_at, updated_at';
export const VISIBILITY = [['private', 'Private', 'only you'], ['unlisted', 'Unlisted', 'anyone with the link'], ['public', 'Public', 'anyone, on your profile']];

const me = () => { const u = currentUser(); if (!u || u.is_anonymous) throw new Error('signed_out'); return u; };

// Your breaks, newest first (no designs: just what the list shows).
export async function myBreaks() {
  const c = await initAccount(); const u = me();
  const { data, error } = await c.from('breaks').select(COLS).eq('owner', u.id).order('updated_at', { ascending: false });
  if (error) throw error;
  return data;
}

// Someone's public breaks, newest first (for their page, task 14).
export async function publicBreaks(owner) {
  const c = await initAccount();
  const { data, error } = await c.from('breaks').select(COLS).eq('owner', owner).eq('visibility', 'public').order('updated_at', { ascending: false }).limit(60);
  if (error) throw error;
  return data;
}

// One break, whole: yours, or anyone's unlisted or public one. null if it's private or gone.
export async function getBreak(id) {
  const c = await initAccount();
  const { data, error } = await c.rpc('get_break', { break_id: id });
  if (error) throw error;
  return data?.[0] || null;
}

// Saves a new break (id: null) or changes yours. `fields`: any of name, design, ride, visibility. Returns the row.
export async function saveBreak(id, fields) {
  const c = await initAccount(); me();
  const q = id ? c.from('breaks').update(fields).eq('id', id) : c.from('breaks').insert(fields);
  const { data, error } = await q.select(COLS).single();
  if (error) throw error;
  return data;
}

export async function duplicateBreak(id, name) {
  const b = await getBreak(id); if (!b) throw new Error('gone');
  const row = await saveBreak(null, { name, design: b.design, ride: b.ride, visibility: 'private' });
  if (b.thumb_path) { // (its own copy of the thumbnail, so deleting one doesn't take the other's)
    const c = await initAccount(), to = `${me().id}/${row.id}.webp`;
    const { error } = await c.storage.from('breaks').copy(b.thumb_path, to);
    if (!error) return saveBreak(row.id, { thumb_path: to });
  }
  return row;
}

export async function deleteBreak(id, thumbPath) {
  const c = await initAccount(); me();
  const { error } = await c.from('breaks').delete().eq('id', id);
  if (error) throw error;
  if (thumbPath) await c.storage.from('breaks').remove([thumbPath]); // (best effort: an orphaned thumbnail is harmless)
}

// Puts a thumbnail (a Blob) up for a break and records it. Pro only (Storage's policies).
export async function setThumb(id, blob) {
  const c = await initAccount(), path = `${me().id}/${id}.${blob.type === 'image/png' ? 'png' : blob.type === 'image/jpeg' ? 'jpg' : 'webp'}`; // (Safari can't make webp)
  const { error } = await c.storage.from('breaks').upload(path, blob, { upsert: true, contentType: blob.type || 'image/webp' });
  if (error) throw error;
  return saveBreak(id, { thumb_path: path });
}
export const thumbUrl = (b) => (b?.thumb_path ? `${supabaseTarget().url}/storage/v1/object/public/breaks/${b.thumb_path}?v=${b.version}` : null);

// The game's link to surf a break, and the builder's to open it.
export const surfLink = (id) => new URL(`index.html?break=${id}`, location.href).href;
export const buildLink = (id) => new URL(`builder.html?break=${id}`, location.href).href;

// Sentences for what went wrong.
export function describeBreakError(e) {
  const m = `${e?.message || ''} ${e?.code || ''}`;
  if (/signed_out/.test(m)) return 'Sign in to save your breaks.';
  if (/42501|row-level security|permission/i.test(m)) return 'Saving breaks comes with Pro.';
  if (/break_name_blocked/.test(m)) return 'Pick another name for it.';
  if (/break_name_length/.test(m)) return 'Give it a name (up to 40 letters).';
  if (/too_many_breaks/.test(m)) return 'You have 200 breaks: delete one to save another.';
  if (/Failed to fetch|NetworkError|network/i.test(m)) return "Can't reach the server. Check your connection.";
  return 'Something went wrong. Try again.';
}
