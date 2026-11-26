// POST /functions/v1/check-rides  { heat_id? }  (accounts plan task 15)
// Rides waiting for their check (a heat's, or any) are ridden again from their logs with the game's own physics
// (src/ride-check.js, shared with the browser and the tests) and marked ok or flagged in ride_checks. Anyone signed in
// can ask (the game asks after each wave it submits); it checks one waiting ride a call and says how many are left.
import { createClient } from 'npm:@supabase/supabase-js@2.117.3';
import { checkRide } from '../../../src/ride-check.js';
import { decodeRecording } from '../../../src/replay.js';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const answer = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } });

// (the same break whatever the order of its keys, and whether the game set it to ride the full wave)
const stable = (v: unknown): string => Array.isArray(v) ? `[${v.map(stable).join(',')}]`
  : v && typeof v === 'object' ? `{${Object.keys(v as object).filter((k) => k !== 'mode').sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(',')}}` : JSON.stringify(v);

async function checkOne(row: { ride_id: string; rides: { wave_no: number; score: number; replay_path: string; heats: { seed: number; contests: { spot: { wave?: string; ride?: unknown } } } } }) {
  const ride = row.rides, heat = ride.heats, spot = heat.contests.spot;
  let verdict: { ok: boolean; score: number | null; drift: number | null; reasons: string[]; error?: string };
  try {
    const { data, error } = await db.storage.from('replays').download(ride.replay_path);
    if (error) throw error;
    const rec = decodeRecording(await data.text());
    verdict = checkRide(rec, { score: ride.score, waveNo: ride.wave_no, heatSeed: heat.seed, wave: spot.wave || 'built' });
    if (!spot.wave && rec.built && stable(rec.built) !== stable(spot.ride)) { verdict.ok = false; verdict.reasons.push('wrong_break'); }
  } catch (e) {
    verdict = { ok: false, score: null, drift: null, reasons: ['wont_run'], error: String((e as Error)?.message || e) };
  }
  const status = verdict.reasons.includes('wont_run') && verdict.error && !/whole ride|version/.test(verdict.error) ? 'error' : verdict.ok ? 'ok' : 'flagged';
  await db.from('ride_checks').update({
    status, score: verdict.score, drift: verdict.drift, reasons: verdict.reasons, note: verdict.error ?? null, checked_at: new Date().toISOString(),
  }).eq('ride_id', row.ride_id);
  return { ride_id: row.ride_id, status, reasons: verdict.reasons };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return answer(405, { error: 'POST only' });
  try {
    const body = await req.json().catch(() => ({}));
    // One ride a call: an Edge Function has about 2 s of CPU, and a long ride re-run (plus starting the function) can
    // take most of it. The answer says how many are still waiting, so the caller asks again (the game after each wave it
    // submits; the contest page's Check now until none are left).
    const pending = () => {
      let q = db.from('ride_checks').select('ride_id, rides!inner(wave_no, score, replay_path, heat_id, heats!inner(seed, contests!inner(spot)))', { count: 'exact' }).eq('status', 'pending');
      if (body.heat_id) q = q.eq('rides.heat_id', body.heat_id);
      return q;
    };
    const { data, error } = await pending().limit(1);
    if (error) throw error;
    const done = [];
    for (const row of data ?? []) done.push(await checkOne(row as never));
    const { count } = await pending().limit(1);
    return answer(200, { checked: done, remaining: count ?? 0 });
  } catch (e) {
    console.error('check-rides', e);
    return answer(500, { error: 'check failed' });
  }
});
