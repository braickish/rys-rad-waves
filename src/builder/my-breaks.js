// My Breaks (accounts plan task 7): the builder's panel for breaks kept in your account. Save (Pro), open, rename,
// duplicate, delete, and who can see each one; `builder.html?break=<id>` opens one (someone else's opens as a copy to
// keep). On first sign-in with Pro, the design this browser remembers is offered as your first saved break.
//
// ui.js hands in the builder: `design()` (what it keeps), `apply(design)`, `ride()` (the payload DROP IN would surf, or
// null), `thumb()` (a Blob of the map).
import { initAccount, onAccount, onPlan, myPlan, currentUser, currentPlan } from '../account.js';
import { myBreaks, getBreak, saveBreak, duplicateBreak, deleteBreak, setThumb, thumbUrl, surfLink, buildLink, describeBreakError, VISIBILITY } from '../breaks.js';

const CUR_KEY = 'rys-rad-waves-builder-break'; // { id, name, visibility, saved: the design's JSON when last saved or opened }
const IMPORT_KEY = 'rys-rad-waves-breaks-imported'; // (users who were offered the import)
const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

export function startMyBreaks(B) {
  const el = document.getElementById('breaks');
  let cur = read(CUR_KEY, { id: null, name: '', visibility: 'private', saved: null });
  let list = null, busy = false, msg = null, renaming = null, uid;
  const setCur = (c) => { cur = c; write(CUR_KEY, cur); };
  const changed = () => !cur.saved || JSON.stringify(B.design()) !== cur.saved;
  const say = (text, bad = false) => { msg = { text, bad }; render(); };
  const pro = () => !!currentPlan().pro;
  const h = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); for (const k of kids) if (k != null) e.append(k); return e; };
  const button = (text, fn, cls = '', disabled = false) => h('button', { textContent: text, className: cls, disabled: disabled || busy, onclick: fn });
  async function act(fn, done) {
    busy = true; msg = null; render();
    try { await fn(); if (done) msg = { text: done, bad: false }; } catch (e) { console.warn('breaks', e); msg = { text: describeBreakError(e), bad: true }; }
    busy = false; await refresh();
  }
  async function refresh() {
    const u = currentUser();
    list = u && !u.is_anonymous ? await myBreaks().catch((e) => { console.warn('breaks', e); return []; }) : null;
    if (cur.id && list && !list.some((b) => b.id === cur.id)) setCur({ ...cur, id: null }); // (deleted elsewhere: keep the design, unsaved)
    render(); offerImport();
  }

  // ---- saving ----
  async function save(asNew) {
    const name = (el.querySelector('#break-name')?.value || '').trim() || cur.name || 'My break';
    await act(async () => {
      const design = B.design(), ride = B.ride();
      const row = await saveBreak(asNew ? null : cur.id, asNew ? { name, design, ride, visibility: 'private' } : { name, design, ride });
      setCur({ id: row.id, name: row.name, visibility: row.visibility, saved: JSON.stringify(design) });
      const blob = await B.thumb().catch(() => null);
      if (blob) await setThumb(row.id, blob).catch((e) => console.warn('thumb', e)); // (a missing thumbnail isn't worth failing the save)
    }, ride0() ? 'Saved.' : 'Saved. (It doesn\'t make a wave you can ride yet.)');
  }
  const ride0 = () => { try { return !!B.ride(); } catch { return false; } };
  async function open(id, ask = true) {
    if (ask && changed() && !confirm('Open another break? Your changes to this one aren\'t saved.')) return;
    await act(async () => {
      const b = await getBreak(id); if (!b) throw new Error('gone');
      B.apply(b.design);
      const mine = b.owner === currentUser()?.id;
      setCur(mine ? { id: b.id, name: b.name, visibility: b.visibility, saved: JSON.stringify(B.design()) } : { id: null, name: `${b.name} (copy)`, visibility: 'private', saved: null });
      if (!mine) msg = { text: `${b.handle ? `@${b.handle}'s` : 'A'} break: save it to keep your own copy.`, bad: false };
    });
  }

  // ---- first sign-in: the design this browser remembers becomes your first break ----
  function offerImport() {
    const u = currentUser(); if (!u || u.is_anonymous || !pro() || !list || list.length || cur.id) return;
    const done = read(IMPORT_KEY, []); if (done.includes(u.id)) return;
    write(IMPORT_KEY, [...done, u.id]);
    el.prepend(h('div', { className: 'offer' },
      h('div', { className: 'note', textContent: 'Keep the break you\'ve been building in your account?' }),
      h('div', { className: 'row' }, button('Save it', () => save(true), 'on'), button('Not now', (e) => e.target.closest('.offer').remove()))));
  }

  // ---- the panel ----
  function render() {
    el.innerHTML = '';
    const u = currentUser();
    if (!u || u.is_anonymous) {
      el.append(h('div', { className: 'note' }, 'Sign in on the ', h('a', { href: 'index.html', textContent: 'title screen' }), ' to keep your breaks in your account.'));
      return;
    }
    const canSave = pro();
    // this break
    const name = h('input', { id: 'break-name', type: 'text', maxLength: 40, placeholder: 'Name your break', value: cur.name || '', autocomplete: 'off' });
    name.oninput = () => { cur.name = name.value; write(CUR_KEY, cur); };
    el.append(h('div', { className: 'row' }, name));
    el.append(h('div', { className: 'row', style: 'margin-top:6px' },
      button(cur.id ? 'Save' : 'Save to my breaks', () => save(!cur.id), 'on', !canSave),
      cur.id ? button('Save as new', () => save(true), '', !canSave) : null));
    const state = h('div', { className: 'note', style: 'margin-top:4px' });
    state.textContent = !canSave ? (list?.length ? 'Your Pro has ended: your breaks are safe, and you can surf and delete them. Saving comes back with Pro.' : 'Saving breaks comes with Pro.')
      : cur.id ? (changed() ? 'Changed since you saved.' : 'All saved.') : 'Not saved yet.';
    el.append(state);
    if (cur.id) {
      const vis = h('div', { className: 'row', style: 'margin-top:6px' });
      for (const [v, label, who] of VISIBILITY) {
        vis.append(button(label, () => act(async () => { const r = await saveBreak(cur.id, { visibility: v }); setCur({ ...cur, visibility: r.visibility }); }), cur.visibility === v ? 'on' : '', !canSave));
        if (cur.visibility === v) vis.title = who;
      }
      el.append(vis, h('div', { className: 'note', style: 'margin-top:2px', textContent: `Who sees it: ${VISIBILITY.find(([v]) => v === cur.visibility)[2]}.` }));
      if (cur.visibility !== 'private') {
        const copy = button('Copy link', async () => { try { await navigator.clipboard.writeText(surfLink(cur.id)); say('Link copied: it drops straight in.'); } catch { prompt('The link:', surfLink(cur.id)); } });
        el.append(h('div', { className: 'row', style: 'margin-top:6px' }, copy));
      }
    }
    if (msg) el.append(h('div', { className: `note ${msg.bad ? 'bad' : ''}`, style: 'margin-top:6px', textContent: msg.text }));
    // the list
    if (!list) { el.append(h('div', { className: 'note', textContent: 'Loading your breaks…' })); return; }
    if (!list.length) return;
    const ul = h('div', { className: 'blist' });
    for (const b of list) {
      const img = thumbUrl(b) ? h('img', { src: thumbUrl(b), alt: '', loading: 'lazy' }) : h('div', { className: 'nothumb' });
      const meta = h('div', { className: 'bmeta' });
      if (renaming === b.id) {
        const inp = h('input', { type: 'text', maxLength: 40, value: b.name });
        const go = () => act(async () => { const r = await saveBreak(b.id, { name: inp.value }); if (cur.id === b.id) setCur({ ...cur, name: r.name }); renaming = null; });
        inp.onkeydown = (e) => { if (e.key === 'Enter') go(); if (e.key === 'Escape') { renaming = null; render(); } };
        meta.append(inp, h('div', { className: 'row' }, button('OK', go, 'on'), button('Cancel', () => { renaming = null; render(); })));
        setTimeout(() => inp.focus(), 0);
      } else {
        meta.append(h('b', { textContent: b.name }), h('span', { className: 'note', textContent: `${VISIBILITY.find(([v]) => v === b.visibility)[1]}${b.id === cur.id ? ' · open now' : ''}` }));
        meta.append(h('div', { className: 'row' },
          b.id === cur.id ? null : button('Edit', () => open(b.id)),
          h('a', { className: 'btn', href: surfLink(b.id), textContent: 'Surf' }),
          button('Rename', () => { renaming = b.id; render(); }, '', !canSave),
          button('Duplicate', () => act(() => duplicateBreak(b.id, `${b.name.slice(0, 33)} (copy)`), 'Duplicated.'), '', !canSave),
          button('Delete', () => { if (confirm(`Delete “${b.name}”? This can't be undone.`)) act(async () => { await deleteBreak(b.id, b.thumb_path); if (cur.id === b.id) setCur({ ...cur, id: null, saved: null }); }, 'Deleted.'); }, 'danger')));
      }
      ul.append(h('div', { className: 'bitem' }, img, meta));
    }
    el.append(h('div', { className: 'note', style: 'margin-top:10px', textContent: `Your breaks (${list.length})` }), ul);
  }

  B.onChange = () => { if (cur.id && !renaming && document.activeElement?.id !== 'break-name') render(); }; // (Changed / All saved)
  render();
  initAccount().then(async () => {
    onAccount((s) => { const who = s?.user?.id || null; if (who !== uid) { uid = who; myPlan().catch(() => {}).finally(refresh); } });
    onPlan(() => render());
    const id = new URLSearchParams(location.search).get('break');
    if (id) { const u = new URL(location.href); u.searchParams.delete('break'); history.replaceState(null, '', u); await open(id, false); }
  }).catch((e) => { console.warn('account', e); el.innerHTML = '<div class="note">Couldn\'t reach your account just now.</div>'; });
  return { link: buildLink };
}
