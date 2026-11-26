-- Watching a contest (the user, 2026-11-26): anyone with a contest's link or code can follow it from the lobby once it's
-- started, signed in or not, as for joining: the code is the pass (an unlisted contest stays off the lists, but whoever
-- it was shared with can watch). Read-only.
--
-- watch_contest(code) -> jsonb { contest, entrants, heats (with heat_entries), rides, recap }:
--   * contest: what the lobby shows (no host id)
--   * entrants: id, name, guest, seed rank (no user ids)
--   * rides: every scored wave (heat, entrant, wave number, score, when): a live heat's totals are worked out from these,
--     as heat_entries.total is only written when the heat closes
--   * recap: the recap video's path, once the host has made one
-- null when no contest has that code.

create function public.watch_contest(code text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'contest', jsonb_build_object('id', c.id, 'code', c.code, 'name', c.name, 'state', c.state, 'format', c.format,
      'spot', c.spot, 'end_minutes', c.end_minutes, 'end_waves', c.end_waves, 'max_entrants', c.max_entrants,
      'visibility', c.visibility, 'started_at', c.started_at, 'ended_at', c.ended_at),
    'entrants', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name, 'guest', e.guest, 'seed_rank', e.seed_rank,
        'joined_at', e.joined_at) order by e.joined_at) from public.entrants e where e.contest_id = c.id), '[]'),
    'heats', coalesce((select jsonb_agg(jsonb_build_object('id', h.id, 'round', h.round, 'number', h.number, 'seed', h.seed,
        'starts_at', h.starts_at, 'ends_at', h.ends_at, 'state', h.state,
        'heat_entries', coalesce((select jsonb_agg(jsonb_build_object('entrant_id', he.entrant_id, 'jersey', he.jersey, 'place', he.place,
            'total', he.total, 'advanced', he.advanced)) from public.heat_entries he where he.heat_id = h.id), '[]'))
        order by h.round, h.number) from public.heats h where h.contest_id = c.id), '[]'),
    'rides', coalesce((select jsonb_agg(jsonb_build_object('heat_id', r.heat_id, 'entrant_id', r.entrant_id, 'wave_no', r.wave_no,
        'score', r.score, 'caught_at', r.caught_at) order by r.caught_at)
        from public.rides r join public.heats h on h.id = r.heat_id where h.contest_id = c.id), '[]'),
    'recap', (select r.video_path from public.recaps r where r.contest_id = c.id)
  )
  from public.contests c
  where c.code = upper(btrim(watch_contest.code))
$$;
revoke all on function public.watch_contest(text) from public;
grant execute on function public.watch_contest(text) to anon, authenticated;
