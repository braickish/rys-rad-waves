// The sign-in row on the title screen (accounts plan task 4): "Sign in" opens an email box; the link that arrives
// signs you in on return; signed in, it shows your email and "Sign out". Loads after the game is up.
import { initAccount, onAccount, sendMagicLink, signOut, describeAuthError } from './account.js';

const $ = (id) => document.getElementById(id);

export function startAccountUI() {
  const open = $('acct-open'), form = $('acct-form'), email = $('acct-email'), send = $('acct-send');
  const who = $('acct-who'), name = $('acct-name'), out = $('acct-out'), msg = $('acct-msg');
  const say = (t) => { msg.textContent = t || ''; msg.hidden = !t; };
  let sent = false;

  const show = (s) => {
    const user = s?.user;
    who.hidden = !user || user.is_anonymous;
    if (user && !user.is_anonymous) { name.textContent = user.email; open.hidden = true; form.hidden = true; say(''); sent = false; }
    else { open.hidden = !form.hidden || sent; }
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
  out.addEventListener('click', async () => {
    try { await signOut(); open.hidden = false; } catch (err) { say(describeAuthError(err)); }
  });

  initAccount().then(() => onAccount(show)).catch((err) => { console.warn('accounts unavailable', err); });
}
