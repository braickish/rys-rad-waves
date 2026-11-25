// The game's auth emails (accounts plan task 11a), worded and laid out here instead of in Supabase's templates. Plain
// JavaScript with no imports, so the send-email Edge Function (Deno) and the tests (Node) share it.
//
// buildEmail({ kind, link, code, email, newEmail }) -> { subject, html, text }
//   kind: 'magiclink' (sign in), 'signup' (the first sign-in), 'email_change_current' / 'email_change_new' (both
//   addresses confirm a change), 'reauthentication' (a code), or anything else (a plain sign-in link).

export const FROM = { email: 'howdy@rysradwaves.com', name: "Ry's Rad Waves" };

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const WORDS = {
  magiclink: (e) => ({
    subject: "Your Ry's Rad Waves sign-in link",
    title: 'Paddle back in',
    lines: ['Tap the button to sign in to Ry\'s Rad Waves.'],
    button: 'Sign in',
  }),
  signup: (e) => ({
    subject: "Welcome to Ry's Rad Waves",
    title: 'Welcome to the lineup',
    lines: ['Tap the button to finish signing up. Then pick a handle: it\'s your name on the board.'],
    button: 'Sign in',
  }),
  email_change_current: (e) => ({
    subject: "Confirm your Ry's Rad Waves email change",
    title: 'Changing your email?',
    lines: [`Someone asked to change the email for your Ry's Rad Waves account from ${e.email} to ${e.newEmail}.`,
      'If that was you, confirm here. The change happens once you\'ve confirmed from both addresses.'],
    button: 'Confirm the change',
    ignore: "If it wasn't you, ignore this email and nothing changes.",
  }),
  email_change_new: (e) => ({
    subject: "Confirm your new Ry's Rad Waves email",
    title: 'Your new email',
    lines: [`Confirm ${e.newEmail} as the email for your Ry's Rad Waves account.`,
      e.email ? `You'll also need to confirm from ${e.email}.` : 'Then it\'s the email you sign in with.'],
    button: 'Confirm this email',
    ignore: "If you didn't ask for this, ignore this email.",
  }),
  reauthentication: (e) => ({
    subject: "Your Ry's Rad Waves code",
    title: 'Your code',
    lines: ['Enter this code in the game:'],
    code: e.code,
  }),
};
const fallback = () => ({ subject: "Your Ry's Rad Waves link", title: 'Your link', lines: ['Tap the button to carry on in Ry\'s Rad Waves.'], button: 'Open the game' });

// The logo from the title screen, as an image (email apps ignore web fonts and text shadows), served with the game.
export const LOGO_URL = 'https://braickish.github.io/rys-rad-waves/assets/email/logo.png';
const INK = '#0b2233', DIM = '#4a6a7a';

export function buildEmail(e) {
  const w = (WORDS[e.kind] || fallback)(e);
  const ignore = w.ignore || "If you didn't ask for this, you can ignore this email.";
  const expiry = w.code ? 'The code works for an hour.' : 'The link works once, and for an hour.';
  const text = [
    w.title, '',
    ...w.lines, '',
    ...(w.code ? [w.code] : [`${w.button}: ${e.link}`]), '',
    expiry, ignore, '',
    "Ry's Rad Waves · rysradwaves.com",
  ].join('\n');
  // One button, as the game's own (Free surf, DROP IN): Bungee capitals, dark on teal, a round pill.
  const action = w.code
    ? `<p style="margin:20px 0;font:700 30px/1 'Courier New',monospace;letter-spacing:6px;color:${INK}">${esc(w.code)}</p>`
    : `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0"><tr><td style="background:#00c2c7;border-radius:28px;box-shadow:3px 3px 0 rgba(0,0,0,.3)">
      <a href="${esc(e.link)}" style="display:inline-block;padding:12px 34px;font-family:Bungee,'Arial Black',Arial,sans-serif;font-size:20px;font-weight:400;letter-spacing:1px;text-transform:uppercase;color:#0b1a24;text-decoration:none">${esc(w.button)}</a>
    </td></tr></table>`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><title>${esc(w.subject)}</title>
<link href="https://fonts.googleapis.com/css2?family=Bungee&display=swap" rel="stylesheet"></head>
<body style="margin:0;padding:0;background:#ffffff">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff"><tr><td align="left" style="padding:28px 20px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px"><tr><td align="left" style="text-align:left">
    <img src="${LOGO_URL}" width="200" alt="Ry's Rad Waves" style="display:block;width:200px;max-width:100%;height:auto;border:0;margin:0 0 22px">
    <h1 style="margin:0 0 12px;font:700 24px/1.25 Arial,Helvetica,sans-serif;color:${INK}">${esc(w.title)}</h1>
    ${w.lines.map((l) => `<p style="margin:0 0 10px;font:16px/1.5 Arial,Helvetica,sans-serif;color:${INK}">${esc(l)}</p>`).join('\n    ')}
    ${action}
    <p style="margin:0 0 24px;font:13px/1.5 Arial,Helvetica,sans-serif;color:${DIM}">${esc(expiry)} ${esc(ignore)}</p>
    <p style="margin:0;font:12px Arial,Helvetica,sans-serif;color:${DIM}">Ry's Rad Waves · rysradwaves.com</p>
  </td></tr></table>
</td></tr></table>
</body></html>`;
  return { subject: w.subject, html, text };
}
