-- Open contests, step 2: the scheduler (plans/2026-11-27-open-contests.md). Nothing in an Open contest waits for a
-- browser: every 5 minutes pg_cron runs private.tick_open_contests(), which
--   * closes sign-up: round 1 opens with its window (2 or more in), or the contest is cancelled (fewer than 2)
--   * closes each Open heat that's ready: everyone has finished, run out their horn and its grace, or missed the window
--     (or the latest horn and its grace have passed), and its rides are checked
--   * so builds the next round (close_heat), with its own window, and ends the contest after the final
--
-- Ride checks: in an Open heat a flagged ride doesn't count (nobody's watching). A heat that's ready waits for its
-- rides' checks: the tick asks the check-rides Edge Function (pg_net, one ride a call) and closes the heat once none is
-- pending, or an hour after it was first ready, whichever comes first (a ride still pending then counts as it is).
-- The function's address and key are in private.settings ('functions_url', 'functions_key': the project's public
-- anon key), set on the cloud project by hand; without them (the local stack, the tests) nobody's asked.
--
-- Live contests are unchanged (their screens close their heats, and flags only show to the host).

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create table private.settings (key text primary key, value text not null);
revoke all on private.settings from public, anon, authenticated;

alter table public.heats add column ready_at timestamptz; -- (an Open heat: when the tick first found it ready)

-- ---- Is the heat over? ----
create function private.heat_ready(h public.heats, c public.contests)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select now() > h.ends_at + private.ride_grace()
      or not exists (
        select 1 from public.heat_entries he
        where he.heat_id = h.id and he.finished_at is null
          and (c.end_waves is null
               or (select count(*) from public.rides r where r.heat_id = h.id and r.entrant_id = he.entrant_id) < c.end_waves)
          and not (c.mode = 'open' and
                   case when he.started_at is null then now() >= h.window_ends_at
                        else now() > he.started_at + private.heat_length(c) + private.ride_grace() end))
$$;

-- (how many of a heat's rides wait for their check)
create function private.checks_pending(hid uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int from public.rides r join public.ride_checks rc on rc.ride_id = r.id
  where r.heat_id = hid and rc.status = 'pending'
$$;

-- Ask check-rides to check a heat's waiting rides (one a call, up to 10 calls a tick).
create function private.ask_for_checks(hid uuid, n int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  url text := (select value from private.settings where key = 'functions_url');
  k text := (select value from private.settings where key = 'functions_key');
begin
  if url is null or k is null or n <= 0 then return; end if;
  for i in 1..least(n, 10) loop
    perform net.http_post(url := url || '/check-rides', body := jsonb_build_object('heat_id', hid),
                          headers := jsonb_build_object('content-type', 'application/json', 'authorization', 'Bearer ' || k, 'apikey', k));
  end loop;
exception when others then
  raise warning 'ask_for_checks %: %', hid, sqlerrm;
end;
$$;

-- ---- Closing a heat ----
-- private.close_heat_now(heat, by_tick): totals, places, the next round. Not over yet: by_tick returns false, else
-- heat_still_on. An Open heat with checks pending: by_tick asks for them and waits (up to an hour after it was first
-- ready), else checks_pending.
create function private.close_heat_now(hid uuid, by_tick boolean)
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
  with counted as ( -- (an Open heat's flagged waves don't count)
    select r.* from public.rides r left join public.ride_checks rc on rc.ride_id = r.id
    where r.heat_id = h.id and not (c.mode = 'open' and rc.status is not distinct from 'flagged')
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

-- close_heat: anyone in the contest, as before; the work is close_heat_now's.
create or replace function public.close_heat(heat_id uuid)
returns setof public.heat_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  cid uuid := (select x.contest_id from public.heats x where x.id = close_heat.heat_id);
begin
  if cid is null then perform private.fail('no_heat', 'P0002'); end if;
  if not exists (select 1 from public.contests c where c.id = cid
                 and (c.host = auth.uid() or exists (select 1 from public.entrants e where e.contest_id = c.id and e.user_id = auth.uid()))) then
    perform private.fail('not_in_contest', '42501');
  end if;
  perform private.close_heat_now(close_heat.heat_id, false);
  return query select * from public.heat_entries he where he.heat_id = close_heat.heat_id order by he.place, he.jersey;
end;
$$;

-- ---- Round 1 of an Open contest (the host's start, or the end of sign-up) ----
create function private.open_round_one(cid uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.entrants e set seed_rank = r.n
    from (select x.id, row_number() over (order by x.joined_at, x.id) as n from public.entrants x where x.contest_id = cid) r
    where e.id = r.id;
  perform private.build_round(cid, 1, array(select e.id from public.entrants e where e.contest_id = cid order by e.seed_rank), now());
  update public.contests x set state = 'running', started_at = now() where x.id = cid;
end;
$$;

-- ---- The tick ----
-- Returns what it did, for the logs and the tests: { started, cancelled, closed, waiting }.
create function private.tick_open_contests()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c record;
  h record;
  started int := 0;
  cancelled int := 0;
  closed int := 0;
  waiting int := 0;
begin
  -- sign-up over
  for c in select x.id from public.contests x
           where x.mode = 'open' and x.state = 'lobby' and x.signup_ends_at <= now()
           order by x.signup_ends_at for update skip locked loop
    if (select count(*) from public.entrants e where e.contest_id = c.id) >= 2 then
      perform private.open_round_one(c.id); started := started + 1;
    else
      update public.contests x set state = 'cancelled', ended_at = now() where x.id = c.id; cancelled := cancelled + 1;
    end if;
  end loop;
  -- heats over (a round at a time: closing a round's last heat builds the next, which waits for the next tick)
  for h in select x.id from public.heats x join public.contests y on y.id = x.contest_id
           where y.mode = 'open' and y.state = 'running' and x.state = 'live' and x.starts_at <= now()
           order by x.round, x.number loop
    begin
      if private.close_heat_now(h.id, true) then closed := closed + 1; else waiting := waiting + 1; end if;
    exception when others then
      raise warning 'tick_open_contests: heat %: %', h.id, sqlerrm;
    end;
  end loop;
  return jsonb_build_object('started', started, 'cancelled', cancelled, 'closed', closed, 'waiting', waiting);
end;
$$;

revoke all on function private.heat_ready(public.heats, public.contests), private.checks_pending(uuid),
  private.ask_for_checks(uuid, int), private.close_heat_now(uuid, boolean), private.open_round_one(uuid),
  private.tick_open_contests() from public;

-- start_contest: an Open contest's round 1 the same way as the tick's.
create or replace function public.start_contest(contest_id uuid)
returns public.heats
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  c public.contests;
  h public.heats;
begin
  select * into c from public.contests x where x.id = start_contest.contest_id for update;
  if not found or c.host is distinct from uid then perform private.fail('not_host', '42501'); end if;
  if not private.user_has_entitlement(uid, 'pro') then perform private.fail('pro_needed', '42501'); end if;
  if c.state <> 'lobby' then perform private.fail('contest_started', '55000'); end if;
  if not exists (select 1 from public.entrants e where e.contest_id = c.id) then perform private.fail('no_entrants', '55000'); end if;
  if c.mode = 'open' then
    if (select count(*) from public.entrants e where e.contest_id = c.id) < 2 then perform private.fail('need_two', '55000'); end if;
    perform private.open_round_one(c.id);
  else
    update public.entrants e set seed_rank = r.n
      from (select x.id, row_number() over (order by x.joined_at, x.id) as n from public.entrants x where x.contest_id = c.id) r
      where e.id = r.id;
    perform private.build_round(c.id, 1, array(select e.id from public.entrants e where e.contest_id = c.id order by e.seed_rank),
                                now() + interval '10 seconds'); -- (a countdown, so everyone drops in together)
    update public.contests x set state = 'running', started_at = now() where x.id = c.id;
  end if;
  select * into h from public.heats x where x.contest_id = c.id and x.round = 1 order by x.number limit 1;
  return h;
end;
$$;

-- Every 5 minutes.
select cron.schedule('open-contests', '*/5 * * * *', 'select private.tick_open_contests()');
