// The sign-in row on the title screen (accounts plan tasks 4-5): "Sign in" opens an email box; the link that arrives
// signs you in on return. The first time, you pick a handle; after that it shows @handle (your page), Account and
// "Sign out". Loads after the game is up.
import { initAccount, onAccount, sendMagicLink, signOut, describeAuthError, myProfile, saveProfile, handleProblem, describeProfileError } from './account.js';

const $ = (id) => document.getElementById(id);

// A first guess at a handle from an email: "Ry.Rad+x@..." -> "ry_rad".
export const handleFromEmail = (email) => {
  let h = String(email || '').split('@')[0].split('+')[0].toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^[^a-z]+|_+$/g, '').slice(0, 20);
  return h.length >= 3 ? h : '';
};

export function startAccountUI() {
  const open = $('acct-open'), form = $('acct-form'), email = $('acct-email'), send = $('acct-send');
  const hForm = $('acct-handle-form'), hInput = $('acct-handle'), hSave = $('acct-handle-save');
  const who = $('acct-who'), name = $('acct-name'), out = $('acct-out'), msg = $('acct-msg');
  const say = (t) => { msg.textContent = t || ''; msg.hidden = !t; };
  let sent = false, shownFor = null;

  const showProfile = (p) => {
    hForm.hidden = true; who.hidden = false;
    name.textContent = `@${p.handle}`; name.href = `profile.html?u=${encodeURIComponent(p.handle)}`;
  };
  const show = async (s) => {
    const user = s?.user, member = user && !user.is_anonymous;
    if (!member) { shownFor = null; who.hidden = true; hForm.hidden = true; open.hidden = !form.hidden || sent; return; }
    open.hidden = true; form.hidden = true; sent = false;
    if (shownFor === user.id) return; // (a token refresh: nothing changed)
    shownFor = user.id;
    let p = null;
    try { p = await myProfile(); } catch (err) { say(describeAuthError(err)); return; }
    if (shownFor !== user.id) return;
    if (p) { say(''); showProfile(p); return; }
    who.hidden = true; hForm.hidden = false; say('');
    if (!hInput.value) hInput.value = handleFromEmail(user.email);
  };

  open.addEventListener('click', () => { open.hidden = true; form.hidden = false; say(''); email.focus(); });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    send.disabled = true;
    try {
      await sendMagicLink(email.value.trim());
      sent = true; form.hidden = true;
      say(`Check ${email.value.trim()} for your sign-in link.`);
    } catch (err) { say(describeAuthError(err)); }
    send.disabled = false;
  });

  // The handle: checked as you type (lowercased for you), saved with "That's me".
  let checkT = 0;
  hInput.addEventListener('input', () => {
    const v = hInput.value.toLowerCase().replace(/[\s-]/g, '_');
    if (v !== hInput.value) hInput.value = v;
    clearTimeout(checkT);
    checkT = setTimeout(async () => { try { say(v ? await handleProblem(v) : ''); } catch {} }, 300);
  });
  hForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearTimeout(checkT);
    hSave.disabled = true;
    try {
      const why = await handleProblem(hInput.value);
      if (why) say(why);
      else { showProfile(await saveProfile({ handle: hInput.value })); say(''); }
    } catch (err) { say(describeProfileError(err)); }
    hSave.disabled = false;
  });

  out.addEventListener('click', async () => {
    try { await signOut(); open.hidden = false; } catch (err) { say(describeAuthError(err)); }
  });

  if (new URLSearchParams(location.search).has('deleted')) { // (back from deleting your account)
    say('Your account is deleted.');
    const u = new URL(location.href); u.searchParams.delete('deleted'); history.replaceState(null, '', u);
  }
  initAccount().then(() => onAccount(show)).catch((err) => { console.warn('accounts unavailable', err); });
}
