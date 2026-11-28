// POST /functions/v1/contest-notices  (plans/2026-11-27-open-contests.md step 6)
// The Open contests tick asks this (pg_net) when reminder emails are waiting. It claims them (take_notices, as the
// service role) and sends each: round 1 open, your heat closing soon, your heat's results. Anyone may ask: it only
// sends what the database has queued, once each. A failed send goes back in the queue (notice_failed, up to 3 tries).
//
// Env: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (given), RESEND_API_KEY or MAILPIT_URL (_shared/mail.ts), GAME_URL.
import { createClient } from 'npm:@supabase/supabase-js@2.117.3';
import { buildEmail } from '../send-email/emails.js';
import { sendMail } from '../_shared/mail.ts';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const answer = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } });
const GAME = (Deno.env.get('GAME_URL') || 'https://rysradwaves.com/').replace(/\/?$/, '/');
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

const SPOTS: Record<string, string> = { point: 'Raglan', raglanPlus: 'Raglan+', reef: 'Pipe', queens: 'Queens', trestles: 'Trestles', dynamic: 'Dynamic' };
const when = (t: string) => new Date(t).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short' });
const ordinal = (n: number) => n + (n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th');

type Notice = {
  id: string; kind: string; email: string; handle: string | null;
  contest: { code: string; name: string; state: string; spot: string; end_minutes: number | null; end_waves: number | null };
  heat: { id: string; round: number; number: number; window_ends_at: string; final: boolean };
  me: { place: number | null; total: number | null; advanced: boolean | null; surfed: boolean } | null;
  winner: string | null; next: { round: number; window_ends_at: string } | null;
};

export function noticeEmail(n: Notice) {
  const c = n.contest, link = `${GAME}index.html?contest=${encodeURIComponent(c.code)}`;
  const heat = c.end_minutes ? `${Number(c.end_minutes)} minute` : `${c.end_waves} wave`;
  const which = n.heat.final ? 'the final' : `round ${n.heat.round}`;
  return buildEmail({
    kind: `contest_${n.kind}`, email: n.email, contest: c.name, spot: SPOTS[c.spot] || c.spot, heat, which, link,
    closes: when(n.heat.window_ends_at), recap: `${GAME}index.html?recap=${encodeURIComponent(c.code)}&heat=${n.heat.id}`,
    place: n.me?.place ? ordinal(n.me.place) : null, total: n.me?.total != null ? Number(n.me.total).toFixed(2) : null,
    surfed: !!n.me?.surfed, advanced: n.me?.advanced ?? null, winner: n.winner, final: n.heat.final,
    next: n.next ? { round: n.next.round, closes: when(n.next.window_ends_at) } : null,
  });
}

if (import.meta.main) Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return answer(405, { error: 'POST only' });
  let sent = 0, failed = 0;
  for (let round = 0; round < 5; round++) { // (20 a batch, a few batches a call)
    const { data, error } = await db.rpc('take_notices', { n: 20 });
    if (error) { console.error('take_notices', error); return answer(500, { error: 'take_failed' }); }
    const list = (data || []) as Notice[];
    if (!list.length) break;
    for (const n of list) {
      try { await sendMail(n.email, noticeEmail(n), `notice-${n.id}`); sent++; }
      catch (e) { failed++; console.error('contest-notices', n.id, e); await db.rpc('notice_failed', { notice_id: n.id, err: String((e as Error)?.message || e) }); }
    }
  }
  return answer(200, { sent, failed });
});
