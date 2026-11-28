// Sending an email (shared by send-email and contest-invite): through Resend (RESEND_API_KEY, the cloud), else the local
// stack's Mailpit (MAILPIT_URL), so the local inbox gets every email. From howdy@rysradwaves.com.
import { FROM } from '../send-email/emails.js';

const RESEND = Deno.env.get('RESEND_API_KEY') ?? '';
const MAILPIT = Deno.env.get('MAILPIT_URL') ?? '';

export async function sendMail(to: string, mail: { subject: string; html: string; text: string }, key: string) {
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
