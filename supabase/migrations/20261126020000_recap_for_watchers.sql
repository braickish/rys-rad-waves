-- The recap for anyone with a contest's link (the user, 2026-11-26), as watching is (20261126010000): once a contest
-- is over, its recap plays in the game and its page opens for whoever has the code, unlisted or not.
--
-- * watch_contest(code) also gives each ride's log path, and the recap video's path, length and when it was made
-- * ride logs: anyone may read a finished contest's (the recap replays them). Their paths hold the surfer's and the
--   heat's ids, which only the contest's code leads to, so an unlisted contest's logs stay with whoever has its link.
--   A contest still on keeps its logs to the people who could already see them.

create or replace function public.watch_contest(code text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'contest', jsonb_build_object('id', c.id, 'code', c.code, 'name', c.name, 'state', c.state, 'format', c.format,
      'spot', c.spot, 'end_minutes', c.end_minutes, 'end_waves', c.end_waves, 'max_entrants', c.max_entrants,
      'visibility', c.visibility, 'created_at', c.created_at, 'started_at', c.started_at, 'ended_at', c.ended_at),
    'entrants', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name, 'guest', e.guest, 'seed_rank', e.seed_rank,
        'joined_at', e.joined_at) order by e.joined_at) from public.entrants e where e.contest_id = c.id), '[]'),
    'heats', coalesce((select jsonb_agg(jsonb_build_object('id', h.id, 'round', h.round, 'number', h.number, 'seed', h.seed,
        'starts_at', h.starts_at, 'ends_at', h.ends_at, 'state', h.state,
        'heat_entries', coalesce((select jsonb_agg(jsonb_build_object('entrant_id', he.entrant_id, 'jersey', he.jersey, 'place', he.place,
            'total', he.total, 'advanced', he.advanced)) from public.heat_entries he where he.heat_id = h.id), '[]'))
        order by h.round, h.number) from public.heats h where h.contest_id = c.id), '[]'),
    'rides', coalesce((select jsonb_agg(jsonb_build_object('heat_id', r.heat_id, 'entrant_id', r.entrant_id, 'wave_no', r.wave_no,
        'score', r.score, 'caught_at', r.caught_at, 'replay_path', r.replay_path) order by r.caught_at)
        from public.rides r join public.heats h on h.id = r.heat_id where h.contest_id = c.id), '[]'),
    'recap', (select jsonb_build_object('video_path', r.video_path, 'seconds', r.seconds, 'made_at', r.made_at)
              from public.recaps r where r.contest_id = c.id)
  )
  from public.contests c
  where c.code = upper(btrim(watch_contest.code))
$$;

-- (is this heat's contest over?)
create function private.heat_contest_over(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.heats h join public.contests c on c.id = h.contest_id where h.id = hid and c.state = 'done')
$$;
revoke all on function private.heat_contest_over(uuid) from public;
grant execute on function private.heat_contest_over(uuid) to anon, authenticated;

create policy "ride logs: anyone, once the contest is over" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'replays' and private.heat_contest_over(private.path_heat(name)));
