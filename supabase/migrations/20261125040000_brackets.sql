-- Brackets (accounts plan task 13; the live contests plan's phase 5).
--
-- A contest of up to 8 is one heat (format 'single'). Bigger (16 or 32: format 'bracket') runs in rounds: heats of 3 or
-- 4 (as even as the numbers allow), the top `advance` (2) of each heat through, until a final of 4 or fewer. Every heat
-- of a round runs at the same time with the round's own seed (the same waves). The database builds each round when the
-- last heat of the one before closes, with a short break to look at the bracket, so nothing depends on who's still online.
-- Seeding: round 1 by who joined first; later rounds by place in their heat, then total, then the first round's seed;
-- either way spread across the heats in snake order (1st, 2nd, 3rd... down the heats and back), so the best don't meet
-- early. Someone who leaves scores nothing more; their heat still closes after the grace.

create function private.round_seed(contest_seed int, rnd int)
returns int
language sql
immutable
set search_path = ''
as $$ select (((contest_seed::bigint + rnd::bigint * 7919) % 2147483646) + 1)::int $$;

-- The break between rounds (to see who went through).
create function private.round_break()
returns interval
language sql
immutable
set search_path = ''
as $$ select interval '30 seconds' $$;

-- A round's heats from its surfers (best seed first), starting at `starts`.
create function private.build_round(cid uuid, rnd int, ids uuid[], starts timestamptz)
returns void
language plpgsql
set search_path = ''
as $$
declare
  c public.contests;
  n int := coalesce(array_length(ids, 1), 0);
  k int;
  s int;
  hids uuid[] := '{}';
  hid uuid;
begin
  select * into c from public.contests x where x.id = cid;
  if n = 0 then return; end if;
  k := case when c.format = 'single' or n <= 4 then 1 else ceil(n / 4.0)::int end;
  s := private.round_seed(c.seed, rnd);
  for i in 1..k loop
    insert into public.heats (contest_id, round, number, seed, starts_at, ends_at)
    values (cid, rnd, i, s, starts, starts + coalesce(c.end_minutes * interval '1 minute', c.end_waves * interval '3 minutes'))
    returning id into hid;
    hids := hids || hid;
  end loop;
  -- snake order, then jerseys drawn from the round's seed, all different within a heat (the user, 2026-11-24)
  with seeded as (select e, (o - 1)::int as r from unnest(ids) with ordinality as u(e, o)),
  placed as (select e, case when (r / k) % 2 = 0 then r % k else k - 1 - r % k end as h from seeded),
  numbered as (select e, h, row_number() over (partition by h order by md5(s::text || e::text)) as jn from placed),
  jerseys as (select jersey, row_number() over (order by md5(s::text || jersey)) as jn
              from unnest(array['red', 'white', 'blue', 'yellow', 'green', 'black', 'pink', 'teal']) as jersey)
  insert into public.heat_entries (heat_id, entrant_id, jersey)
  select hids[numbered.h + 1], numbered.e, jerseys.jersey from numbered join jerseys using (jn);
end;
$$;
revoke all on function private.round_seed(int, int), private.round_break(), private.build_round(uuid, int, uuid[], timestamptz) from public;

-- ---- create_contest: up to 32; over 8 is a bracket ----
create or replace function public.create_contest(
  name text, wave text default null, break_id uuid default null,
  end_minutes numeric default null, end_waves int default null,
  max_entrants int default 8, visibility text default 'unlisted'
)
returns public.contests
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  b record;
  s jsonb;
  c public.contests;
begin
  if not private.is_member(uid) then perform private.fail('sign_in', '42501'); end if;
  if not private.user_has_entitlement(uid, 'pro') then perform private.fail('pro_needed', '42501'); end if;
  if (select count(*) from public.contests x where x.host = uid and x.state in ('lobby', 'running')) >= 3 then
    perform private.fail('too_many_contests', '23514');
  end if;
  name := btrim(coalesce(name, ''));
  if private.text_blocked(name) then perform private.fail('contest_name_blocked', '23514'); end if;
  if (wave is null) = (break_id is null) then perform private.fail('one_spot', '22023'); end if;
  if wave is not null then
    if not private.contest_wave(wave) then perform private.fail('no_such_wave', '22023'); end if;
    s := jsonb_build_object('wave', wave);
  else
    select br.id, br.name, br.ride into b from public.breaks br
      where br.id = create_contest.break_id and (br.owner = uid or br.visibility <> 'private');
    if not found then perform private.fail('no_such_break', '22023'); end if;
    if b.ride is null then perform private.fail('break_not_rideable', '22023'); end if;
    s := jsonb_build_object('break_id', b.id, 'name', b.name, 'ride', b.ride);
  end if;
  insert into public.contests (code, host, name, spot, seed, end_minutes, end_waves, max_entrants, visibility, format, heat_size, advance)
  values (private.contest_code(), uid, name, s, floor(random() * 2147483647)::int, create_contest.end_minutes,
          create_contest.end_waves, create_contest.max_entrants, create_contest.visibility,
          case when create_contest.max_entrants > 8 then 'bracket' else 'single' end,
          case when create_contest.max_entrants > 8 then 4 else 8 end, 2)
  returning * into c;
  return c;
end;
$$;

-- ---- start_contest: round 1 ----
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
  update public.entrants e set seed_rank = r.n
    from (select x.id, row_number() over (order by x.joined_at, x.id) as n from public.entrants x where x.contest_id = c.id) r
    where e.id = r.id;
  perform private.build_round(c.id, 1, array(select e.id from public.entrants e where e.contest_id = c.id order by e.seed_rank),
                              now() + interval '10 seconds'); -- (a countdown, so everyone drops in together)
  update public.contests x set state = 'running', started_at = now() where x.id = c.id;
  select * into h from public.heats x where x.contest_id = c.id and x.round = 1 order by x.number limit 1;
  return h;
end;
$$;

-- ---- close_heat: and, in a bracket, the next round ----
create or replace function public.close_heat(heat_id uuid)
returns setof public.heat_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  h public.heats;
  c public.contests;
  everyone_done boolean;
  heats_in_round int;
begin
  select x.contest_id into c.id from public.heats x where x.id = close_heat.heat_id;
  if c.id is null then perform private.fail('no_heat', 'P0002'); end if;
  -- (the contest first: two heats of a round closing at once would each think the other still on)
  select * into c from public.contests x where x.id = c.id for update;
  select * into h from public.heats x where x.id = close_heat.heat_id for update;
  if not (c.host = auth.uid() or exists (select 1 from public.entrants e where e.contest_id = c.id and e.user_id = auth.uid())) then
    perform private.fail('not_in_contest', '42501');
  end if;
  if h.state = 'live' then
    everyone_done := not exists (
      select 1 from public.heat_entries he
      where he.heat_id = h.id and he.finished_at is null
        and (c.end_waves is null
             or (select count(*) from public.rides r where r.heat_id = h.id and r.entrant_id = he.entrant_id) < c.end_waves));
    if not everyone_done and now() <= h.ends_at + private.ride_grace() then perform private.fail('heat_still_on', '55000'); end if;
    with best as (
      select he.entrant_id,
             (array_agg(r.score order by r.score desc) filter (where r.score is not null)) as s
      from public.heat_entries he left join public.rides r on r.heat_id = he.heat_id and r.entrant_id = he.entrant_id
      where he.heat_id = h.id
      group by he.entrant_id
    ), scored as (
      select entrant_id, coalesce(s[1], 0) + coalesce(s[2], 0) as total,
             rank() over (order by coalesce(s[1], 0) + coalesce(s[2], 0) desc, coalesce(s[1], 0) desc,
                                   coalesce(s[2], 0) desc, coalesce(s[3], 0) desc) as place
      from best
    )
    update public.heat_entries he set total = scored.total, place = scored.place,
           advanced = case when c.format = 'bracket' then scored.place <= c.advance end
      from scored where he.heat_id = h.id and he.entrant_id = scored.entrant_id;
    update public.heats x set state = 'done', closed_at = now() where x.id = h.id;

    if not exists (select 1 from public.heats x where x.contest_id = c.id and x.round = h.round and x.state = 'live') then
      select count(*) into heats_in_round from public.heats x where x.contest_id = c.id and x.round = h.round;
      if c.format = 'bracket' and heats_in_round > 1
         and not exists (select 1 from public.heats x where x.contest_id = c.id and x.round = h.round + 1) then
        -- the next round: who went through, by place, then total, then their first seed
        perform private.build_round(c.id, h.round + 1,
          array(select he.entrant_id from public.heat_entries he
                  join public.heats x on x.id = he.heat_id join public.entrants e on e.id = he.entrant_id
                 where x.contest_id = c.id and x.round = h.round and he.advanced
                 order by he.place, he.total desc, e.seed_rank),
          now() + private.round_break());
      else
        update public.contests x set state = 'done', ended_at = now() where x.id = c.id and x.state = 'running';
      end if;
    end if;
  end if;
  return query select * from public.heat_entries he where he.heat_id = h.id order by he.place, he.jersey;
end;
$$;
