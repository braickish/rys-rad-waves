// POST /functions/v1/contest-invite  { invite_id }  (plans/2026-11-27-open-contests.md step 4)
// The host's game calls this after invite_by_email: as the host (their own sign-in), claim_invite_email checks it's their
// invite and not emailed in the last day, and gives what the email says; then it goes out (Resend, or Mailpit locally).
// A failed send gives the claim back (invite_email_failed), so the host can try again.
//
// Env: SUPABASE_URL and SUPABASE_ANON_KEY (given), RESEND_API_KEY or MAILPIT_URL (_shared/mail.ts), GAME_URL (where the
// link points: https://rysradwaves.com/ by default).
import { createClient } from 'npm:@supabase/supabase-js@2.117.3';
import { buildEmail } from '../send-email/emails.js';
import { sendMail } from '../_shared/mail.ts';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const answer = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } });
const GAME = (Deno.env.get('GAME_URL') || 'https://rysradwaves.com/').replace(/\/?$/, '/');

const hours = (h: number) => (h % 24 ? `${h} hours` : h === 24 ? 'a day' : h === 168 ? 'a week' : `${h / 24} days`);
const SPOTS: Record<string, string> = { point: 'Raglan', raglanPlus: 'Raglan+', reef: 'Pipe', queens: 'Queens', trestles: 'Trestles', dynamic: 'Dynamic' };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return answer(405, { error: 'POST only' });
  const auth = req.headers.get('authorization') ?? '';
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    auth: { persistSession: false }, global: { headers: { authorization: auth } },
  });
  const { invite_id } = await req.json().catch(() => ({}));
  if (!invite_id) return answer(400, { error: 'invite_id' });
  const { data: m, error } = await db.rpc('claim_invite_email', { invite_id });
  if (error) return answer(error.code === '42501' ? 403 : 409, { error: error.hint || error.message });
  try {
    const rh: number[] = m.round_hours || [24];
    const closes = m.signup_ends_at ? new Date(m.signup_ends_at).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short' }) : '';
    const mail = buildEmail({
      kind: 'contest_invite', email: m.email, host: m.host, contest: m.name, spot: SPOTS[m.spot] || m.spot,
      heat: m.end_minutes ? `${Number(m.end_minutes)} minute` : `${m.end_waves} wave`,
      rounds: rh.every((x) => x === rh[0]) ? `${hours(rh[0])} a round` : rh.map(hours).join(', then '),
      closes, link: `${GAME}index.html?contest=${encodeURIComponent(m.code)}`,
    });
    await sendMail(m.email, mail, `invite-${invite_id}-${new Date().toISOString().slice(0, 10)}`);
    return answer(200, { sent: true });
  } catch (e) {
    console.error('contest-invite', e);
    await db.rpc('invite_email_failed', { invite_id });
    return answer(500, { error: 'send_failed' });
  }
});
