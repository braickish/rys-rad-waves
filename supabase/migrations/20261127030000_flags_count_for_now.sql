-- Open contests: flagged waves count for now (2026-11-27). Wiring the scheduler to check-rides showed the ride checks
-- aren't ready to take waves away: on the cloud project every real ride from 2026-11-26 came back flagged (a re-run
-- with today's physics scores it differently: the physics changed since, and rides.sim_version didn't), and longer rides
-- run out of the Edge Function's compute, staying pending. So a flagged wave is only dropped from an Open heat when
-- private.settings has drop_flagged = 'on'; until then checks still run, the host still sees flags, and a heat still
-- waits for its checks (up to the hour).
create function private.drops_flagged()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select coalesce((select value = 'on' from private.settings where key = 'drop_flagged'), false) $$;
revoke all on function private.drops_flagged() from public;

create or replace function private.close_heat_now(hid uuid, by_tick boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  h public.heats;
  c public.contests;
  heats_in_round int;
  through int;
  waiting int;
begin
  select x.contest_id into c.id from public.heats x where x.id = hid;
  if c.id is null then perform private.fail('no_heat', 'P0002'); end if;
  -- (the contest first: two heats of a round closing at once would each think the other still on)
  select * into c from public.contests x where x.id = c.id for update;
  select * into h from public.heats x where x.id = hid for update;
  if h.state <> 'live' then return false; end if;
  if not private.heat_ready(h, c) then
    if by_tick then return false; end if;
    perform private.fail('heat_still_on', '55000');
  end if;
  if c.mode = 'open' then
    if h.ready_at is null then update public.heats x set ready_at = now() where x.id = h.id returning * into h; end if;
    waiting := private.checks_pending(h.id);
    if waiting > 0 and now() < h.ready_at + interval '1 hour' then
      if by_tick then perform private.ask_for_checks(h.id, waiting); return false; end if;
      perform private.fail('checks_pending', '55000');
    end if;
  end if;
  -- who goes through: the top `advance`, but never everyone (1 from a heat of 2); nobody from the final
  select count(*) into heats_in_round from public.heats x where x.contest_id = c.id and x.round = h.round;
  through := case when heats_in_round = 1 then 0
                  else least(c.advance, (select count(*) from public.heat_entries he where he.heat_id = h.id)::int - 1) end;
  with counted as ( -- (an Open heat's flagged waves don't count, once private.settings drop_flagged is on)
    select r.* from public.rides r left join public.ride_checks rc on rc.ride_id = r.id
    where r.heat_id = h.id and not (c.mode = 'open' and rc.status is not distinct from 'flagged' and private.drops_flagged())
  ), best as (
    select he.entrant_id, he.started_at is not null or c.mode = 'live' as showed,
           (array_agg(r.score order by r.score desc) filter (where r.score is not null)) as s
    from public.heat_entries he left join counted r on r.entrant_id = he.entrant_id
    where he.heat_id = h.id
    group by he.entrant_id, he.started_at
  ), scored as (
    select b.entrant_id, coalesce(s[1], 0) + coalesce(s[2], 0) as total,
           rank() over (order by coalesce(s[1], 0) + coalesce(s[2], 0) desc, coalesce(s[1], 0) desc,
                                 coalesce(s[2], 0) desc, coalesce(s[3], 0) desc,
                                 b.showed desc, case when not b.showed then e.seed_rank end) as place
    from best b join public.entrants e on e.id = b.entrant_id
  )
  update public.heat_entries he set total = scored.total, place = scored.place,
         advanced = case when heats_in_round > 1 then scored.place <= through end
    from scored where he.heat_id = h.id and he.entrant_id = scored.entrant_id;
  update public.heats x set state = 'done', closed_at = now() where x.id = h.id;

  if not exists (select 1 from public.heats x where x.contest_id = c.id and x.round = h.round and x.state = 'live') then
    if heats_in_round > 1
       and not exists (select 1 from public.heats x where x.contest_id = c.id and x.round = h.round + 1) then
      -- the next round: who went through, by place, then total, then their first seed
      perform private.build_round(c.id, h.round + 1,
        array(select he.entrant_id from public.heat_entries he
                join public.heats x on x.id = he.heat_id join public.entrants e on e.id = he.entrant_id
               where x.contest_id = c.id and x.round = h.round and he.advanced
               order by he.place, he.total desc, e.seed_rank),
        now() + case when c.mode = 'open' then interval '0' else private.round_break() end);
    elsif heats_in_round = 1 then -- (the final)
      update public.contests x set state = 'done', ended_at = now() where x.id = c.id and x.state = 'running';
    end if;
  end if;
  return true;
end;
$$;
