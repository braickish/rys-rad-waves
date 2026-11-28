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
// An Open contest invite (plans/2026-11-27-open-contests.md step 4): e.host, e.contest, e.spot, e.heat ("10 minute"),
// e.rounds ("a day"), e.closes ("Sun 29 Nov"), e.email, e.link.
WORDS.contest_invite = (e) => ({
  subject: `${e.host ? `@${e.host}` : 'Someone'} invited you to surf ${e.contest}`,
  title: "You're invited to a contest",
  lines: [`${e.host ? `@${e.host}` : 'A surfer'} invited you to ${e.contest}, an Open contest at ${e.spot} in Ry's Rad Waves.`,
    `Surf your ${e.heat} heat whenever you like while each round is open (${e.rounds}): nobody has to be online at the same time.`,
    ...(e.closes ? [`Sign-up closes ${e.closes}.`] : [])],
  button: 'Join the contest',
  expiry: `Sign in with ${e.email} to join. It's free.`,
  ignore: 'Not for you? Ignore this email.',
});
// Open contest reminders (step 6, the contest-notices Edge Function): e.contest, e.spot, e.heat ("10 minute"), e.which
// ("round 1", "the final"), e.closes, e.link (the lobby), e.recap, and for results e.place, e.total, e.surfed,
// e.advanced, e.winner, e.final, e.next ({ round, closes }).
const OFF = 'You get these because you entered an Open contest. Turn them off on your account page: rysradwaves.com/account.html';
WORDS.contest_round_open = (e) => ({
  subject: `${e.contest}: round 1 is open`,
  title: 'Your heat is open',
  lines: [`Round 1 of ${e.contest} at ${e.spot} is open. Surf your ${e.heat} heat any time before ${e.closes}.`,
    'One try: once you start, your heat runs to the horn. Nobody sees anyone\'s scores until the round closes.'],
  button: 'Surf your heat', expiry: '', ignore: OFF,
});
WORDS.contest_closing_soon = (e) => ({
  subject: `${e.contest}: your heat closes soon`,
  title: 'Last call',
  lines: [`You haven't surfed your heat in ${e.which} of ${e.contest} yet. The window closes ${e.closes}.`,
    'Miss it and you score nothing for the heat.'],
  button: 'Surf your heat', expiry: '', ignore: OFF,
});
WORDS.contest_results = (e) => {
  const lead = !e.surfed ? `You didn't surf your heat in ${e.which}, so it counted as 0.`
    : e.final ? (e.place === '1st' ? `You won ${e.contest}! ${e.total} in the final.` : `You came ${e.place} in the final with ${e.total}.`)
    : e.advanced ? `You're through! ${e.place} in your heat with ${e.total}.` : `You're out: ${e.place} in your heat with ${e.total}.`;
  return {
    subject: e.final ? `${e.contest}: the results are in` : `${e.contest}: ${e.which} results`,
    title: e.final ? (e.winner ? `${e.winner} wins` : 'The results') : `${e.which[0].toUpperCase()}${e.which.slice(1)} is done`,
    lines: [lead,
      'Watch the recap: everyone\'s waves from your heat, side by side, as if you\'d all surfed it together.',
      ...(e.next ? [`Round ${e.next.round} is open now: surf your heat before ${e.next.closes}.`] : [])],
    button: 'Watch the recap', link2: e.next ? { text: `Surf round ${e.next.round}`, href: e.link } : null,
    expiry: '', ignore: OFF,
  };
};
const fallback = () => ({ subject: "Your Ry's Rad Waves link", title: 'Your link', lines: ['Tap the button to carry on in Ry\'s Rad Waves.'], button: 'Open the game' });

// The logo from the title screen, as an image (email apps ignore web fonts and text shadows), served with the game.
export const LOGO_URL = 'https://rysradwaves.com/assets/email/logo.png';
const INK = '#0b2233', DIM = '#4a6a7a';

export function buildEmail(e) {
  const w = (WORDS[e.kind] || fallback)(e);
  if (e.kind === 'contest_results' && e.recap) e = { ...e, link: e.recap }; // (the results email's button: the recap)
  const ignore = w.ignore || "If you didn't ask for this, you can ignore this email.";
  const expiry = w.expiry ?? (w.code ? 'The code works for an hour.' : 'The link works once, and for an hour.');
  const text = [
    w.title, '',
    ...w.lines, '',
    ...(w.code ? [w.code] : [`${w.button}: ${e.link}`]), ...(w.link2 ? [`${w.link2.text}: ${w.link2.href}`] : []), '',
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
    ${w.link2 ? `<p style="margin:0 0 20px;font:700 16px Arial,Helvetica,sans-serif"><a href="${esc(w.link2.href)}" style="color:#0b7a80">${esc(w.link2.text)} →</a></p>` : ''}
    <p style="margin:0 0 24px;font:13px/1.5 Arial,Helvetica,sans-serif;color:${DIM}">${esc(expiry)} ${esc(ignore)}</p>
    <p style="margin:0;font:12px Arial,Helvetica,sans-serif;color:${DIM}">Ry's Rad Waves · rysradwaves.com</p>
  </td></tr></table>
</td></tr></table>
</body></html>`;
  return { subject: w.subject, html, text };
}
