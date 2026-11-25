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
  const button = w.code
    ? `<p style="margin:18px 0;font:700 30px/1 'Courier New',monospace;letter-spacing:6px;color:#ffd426">${esc(w.code)}</p>`
    : `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0"><tr><td style="background:#00c2c7;border:3px solid #ffffff;border-radius:26px">
        <a href="${esc(e.link)}" style="display:inline-block;padding:12px 28px;font:700 17px Arial,Helvetica,sans-serif;color:#0b1a24;text-decoration:none">${esc(w.button)}</a>
      </td></tr></table>
      <p style="margin:0 0 14px;font:13px/1.5 Arial,Helvetica,sans-serif;color:#9fc1cf">Or paste this into your browser:<br><a href="${esc(e.link)}" style="color:#00c2c7;word-break:break-all">${esc(e.link)}</a></p>`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(w.subject)}</title></head>
<body style="margin:0;padding:0;background:#0b2233">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b2233"><tr><td align="center" style="padding:28px 16px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#0f2c41;border-radius:18px"><tr><td style="padding:26px 24px">
    <p style="margin:0 0 18px;font:700 15px Arial,Helvetica,sans-serif;letter-spacing:1px;color:#ff3d8b">RY'S RAD WAVES</p>
    <h1 style="margin:0 0 12px;font:700 26px/1.2 Arial,Helvetica,sans-serif;color:#ffd426">${esc(w.title)}</h1>
    ${w.lines.map((l) => `<p style="margin:0 0 10px;font:16px/1.5 Arial,Helvetica,sans-serif;color:#eaf6fa">${esc(l)}</p>`).join('\n    ')}
    ${button}
    <p style="margin:0;font:13px/1.5 Arial,Helvetica,sans-serif;color:#9fc1cf">${esc(expiry)} ${esc(ignore)}</p>
  </td></tr></table>
  <p style="margin:16px 0 0;font:12px Arial,Helvetica,sans-serif;color:#6f93a3">Ry's Rad Waves · rysradwaves.com</p>
</td></tr></table>
</body></html>`;
  return { subject: w.subject, html, text };
}
