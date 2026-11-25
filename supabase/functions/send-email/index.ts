// POST /functions/v1/send-email: Supabase Auth's Send Email Hook (accounts plan task 11a). Auth hands this every email it
// would send (sign-in and sign-up links, email changes, codes); it checks the call is Auth's (Standard Webhooks, signed
// with the hook's secret), words the email (emails.js) and sends it through Resend from howdy@rysradwaves.com. That
// takes the game off Supabase's built-in sender and its couple of emails an hour.
//
// Secrets (Supabase secrets in the cloud; supabase/functions/.env locally):
//   SEND_EMAIL_HOOK_SECRET  v1,whsec_... (the hook's, the same as Auth's hook config)
//   RESEND_API_KEY          re_... ; without it, MAILPIT_URL (local only) takes the email instead, so the local
//                           stack's inbox still gets every email
//   AUTH_PUBLIC_URL         where links point (default SUPABASE_URL; locally the API as the browser sees it)
//
// Answers {} when sent; {"error": {"http_code", "message"}} otherwise (Auth shows the person a failure).
import { Webhook } from 'npm:standardwebhooks@1.0.0';
import { crypto as stdCrypto } from 'jsr:@std/crypto@1.0.5';
import { buildEmail, FROM } from './emails.js';

const HOOK_SECRET = (Deno.env.get('SEND_EMAIL_HOOK_SECRET') ?? '').replace(/^v1,whsec_/, '');
const RESEND = Deno.env.get('RESEND_API_KEY') ?? '';
const MAILPIT = Deno.env.get('MAILPIT_URL') ?? '';
const PUBLIC_URL = (Deno.env.get('AUTH_PUBLIC_URL') || Deno.env.get('SUPABASE_URL') || '').replace(/\/$/, '');

const answer = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const fail = (status: number, message: string) => answer(status, { error: { http_code: status, message } });

type User = { email?: string; new_email?: string };
type EmailData = { token?: string; token_hash?: string; token_new?: string; token_hash_new?: string; redirect_to?: string;
  email_action_type: string; site_url?: string };

// Auth's token hash: hex SHA-224 of the address followed by the code. It says which address each link of an email
// change belongs to (Auth's own field names for the pair are the other way round from what you'd guess).
async function tokenHash(address: string, code: string) {
  const d = await stdCrypto.subtle.digest('SHA-224', new TextEncoder().encode(address + code));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const verifyLink = (hash: string, type: string, redirect?: string) =>
  `${PUBLIC_URL}/auth/v1/verify?token=${encodeURIComponent(hash)}&type=${encodeURIComponent(type)}` +
  (redirect ? `&redirect_to=${encodeURIComponent(redirect)}` : '');

// What to send, to whom.
async function messages(user: User, d: EmailData) {
  const type = d.email_action_type;
  if (type === 'email_change') {
    const now = user.email || '', next = user.new_email || '';
    const pairs = [[d.token, d.token_hash], [d.token_new, d.token_hash_new]].filter(([, h]) => h) as [string, string][];
    const out = [];
    for (const [i, [code, hash]] of pairs.entries()) {
      let to = '';
      for (const a of [next, now]) if (a && code && (await tokenHash(a, code)) === hash) to = a;
      if (!to) to = pairs.length === 1 ? next : i === 0 ? next : now; // (as Auth documents it, should the hash not tell)
      if (!to) continue;
      out.push({ to, kind: to === next ? 'email_change_new' : 'email_change_current', link: verifyLink(hash, 'email_change', d.redirect_to) });
    }
    return out;
  }
  if (type === 'reauthentication') return [{ to: user.email || '', kind: 'reauthentication', code: d.token }];
  return [{ to: user.email || '', kind: type, link: verifyLink(d.token_hash || '', type, d.redirect_to) }];
}

async function send(to: string, mail: { subject: string; html: string; text: string }, key: string) {
  if (RESEND) {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${RESEND}`, 'content-type': 'application/json', 'idempotency-key': key },
      body: JSON.stringify({ from: `${FROM.name} <${FROM.email}>`, to: [to], subject: mail.subject, html: mail.html, text: mail.text }),
    });
    if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 300)}`);
    return;
  }
  if (MAILPIT) {
    const r = await fetch(`${MAILPIT.replace(/\/$/, '')}/api/v1/send`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ From: { Email: FROM.email, Name: FROM.name }, To: [{ Email: to }], Subject: mail.subject, HTML: mail.html, Text: mail.text }),
    });
    if (!r.ok) throw new Error(`Mailpit ${r.status}: ${(await r.text()).slice(0, 300)}`);
    return;
  }
  throw new Error('no email sender set up (RESEND_API_KEY)');
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return fail(405, 'POST only');
  if (!HOOK_SECRET) return fail(500, 'SEND_EMAIL_HOOK_SECRET is not set');
  const body = await req.text();
  let data: { user: User; email_data: EmailData };
  try {
    data = new Webhook(HOOK_SECRET).verify(body, Object.fromEntries(req.headers)) as typeof data;
  } catch {
    return fail(401, 'bad signature');
  }
  try {
    const list = await messages(data.user ?? {}, data.email_data ?? ({} as EmailData));
    if (!list.length || list.some((m) => !m.to)) return fail(400, 'no address to send to');
    const id = req.headers.get('webhook-id') ?? crypto.randomUUID();
    for (const m of list) {
      const mail = buildEmail({ kind: m.kind, link: m.link, code: m.code, email: data.user.email, newEmail: data.user.new_email });
      await send(m.to, mail, `${id}-${m.kind}`);
    }
    return answer(200, {});
  } catch (e) {
    console.error('send-email', e);
    return fail(500, "Couldn't send the email. Try again in a minute.");
  }
});
