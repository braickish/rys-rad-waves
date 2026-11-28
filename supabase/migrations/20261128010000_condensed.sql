-- Open contests, step 7: Condensed (plans/2026-11-27-open-contests.md; the user, 2026-11-27: "Condensed scoring is
-- played out bracket (so if you don't make it through a round, your later rounds are essentially invalidated)").
--
-- One window for the whole contest. Round 1's heats are drawn when it opens, as in a rounds contest. Every later round's
-- heats depend on who goes through, so they can't be drawn yet: instead each surfer gets a session for each later round
-- (a heat of their own, heats.session_of = them, on that round's seed: the same waves the round's heats will have). You
-- surf them in order (round 2 once round 1's is over, and so on), each one try.
--
-- When the window closes (or everyone has surfed everything) and the rides are checked, the bracket is played out:
-- round 1's heats close as usual; round 2's heats are drawn from who went through, and each surfer's round 2 session
-- becomes their part of their round 2 heat (its start, its finish, its rides move over); they close; and so on to the
-- final. A session from a round you didn't reach doesn't count and isn't shown: it's left 'void' (only you see its
-- rides, as before the close).
--
-- * heats.session_of     the surfer a session belongs to (null: a heat of the bracket)
-- * heats.state 'void'   a session from a round its surfer didn't reach
-- * create_contest       open_format 'condensed' (one window: round_hours has one length)
-- * private.open_round_one, start_my_heat, close_heat_now, the tick, the emails, watch_contest: sessions

alter table public.heats add column session_of uuid references public.entrants (id) on delete cascade;
alter table public.heats drop constraint heats_state_check, add constraint heats_state_check check (state in ('live', 'done', 'void'));
create index heats_sessions on public.heats (contest_id, round) where session_of is not null;

-- How many rounds a bracket of n has (as build_round and close_heat_now draw it: heats of 2 to 4, the top 2 through,
-- 1 from a heat of 2).
-- (the snake: n surfers in k heats, sizes floor(n/k) and one more for n % k of them; through: least(2, size - 1))
create function private.bracket_rounds(n int)
returns int
language plpgsql
immutable
set search_path = ''
as $$
declare
  r int := 1;
  k int;
  small int;
  big int;
begin
  while n > 4 loop
    k := ceil(n / 4.0)::int;
    small := n / k; big := n % k; -- (big heats of small + 1, k - big of small)
    n := big * least(2, small) + (k - big) * least(2, small - 1);
    r := r + 1;
  end loop;
  return r;
end;
$$;
revoke all on function private.bracket_rounds(int) from public;

-- ---- create_contest: and Condensed ----
create or replace function public.create_contest(
  name text, wave text default null, break_id uuid default null,
  end_minutes numeric default null, end_waves int default null,
  max_entrants int default 8, visibility text default 'unlisted',
  mode text default 'live', open_format text default 'rounds', round_hours numeric[] default '{24}',
  entry text default 'invite', signup_hours numeric default 24
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
  open boolean := create_contest.mode = 'open';
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
  if create_contest.mode not in ('live', 'open') then perform private.fail('bad_mode', '22023'); end if;
  if open then
    if create_contest.open_format is null or create_contest.open_format not in ('rounds', 'condensed') then perform private.fail('bad_format', '22023'); end if;
    if create_contest.entry not in ('invite', 'open') or create_contest.entry is null then perform private.fail('bad_entry', '22023'); end if;
    if create_contest.round_hours is null or cardinality(create_contest.round_hours) not between 1 and 5
       or not (1 <= all (create_contest.round_hours) and 168 >= all (create_contest.round_hours))
       or (create_contest.open_format = 'condensed' and cardinality(create_contest.round_hours) <> 1) then -- (Condensed: one window)
      perform private.fail('bad_round_hours', '22023');
    end if;
    if create_contest.signup_hours is null or create_contest.signup_hours not between 1 and 168 then
      perform private.fail('bad_signup_hours', '22023');
    end if;
  end if;
  insert into public.contests (code, host, name, spot, seed, end_minutes, end_waves, max_entrants, visibility, format, heat_size, advance,
                               mode, open_format, round_hours, entry, signup_ends_at)
  values (private.contest_code(), uid, name, s, floor(random() * 2147483647)::int, create_contest.end_minutes,
          create_contest.end_waves, create_contest.max_entrants, create_contest.visibility,
          'bracket', 4, 2,
          create_contest.mode,
          case when open then create_contest.open_format end,
          case when open then create_contest.round_hours end,
          case when open then create_contest.entry end,
          case when open then now() + create_contest.signup_hours * interval '1 hour' end)
  returning * into c;
  return c;
end;
$$;

-- ---- Round 1, and (Condensed) everyone's sessions for the rounds after ----
create or replace function private.open_round_one(cid uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.contests;
  r1 public.heats;
  n int;
begin
  update public.entrants e set seed_rank = r.n
    from (select x.id, row_number() over (order by x.joined_at, x.id) as n from public.entrants x where x.contest_id = cid) r
    where e.id = r.id;
  perform private.build_round(cid, 1, array(select e.id from public.entrants e where e.contest_id = cid order by e.seed_rank), now());
  update public.contests x set state = 'running', started_at = now() where x.id = cid returning * into c;
  if c.open_format = 'condensed' then
    select * into r1 from public.heats x where x.contest_id = cid and x.round = 1 order by x.number limit 1;
    n := (select count(*)::int from public.entrants e where e.contest_id = cid);
    for rnd in 2..private.bracket_rounds(n) loop
      -- (a session's number: 100 + your seed, clear of the round's heats)
      insert into public.heats (contest_id, round, number, seed, starts_at, window_ends_at, ends_at, session_of)
      select cid, rnd, 100 + e.seed_rank, private.round_seed(c.seed, rnd), r1.starts_at, r1.window_ends_at, r1.ends_at, e.id
        from public.entrants e where e.contest_id = cid;
      insert into public.heat_entries (heat_id, entrant_id, jersey)
      select x.id, x.session_of, (select he.jersey from public.heat_entries he join public.heats y on y.id = he.heat_id
                                  where y.contest_id = cid and y.round = 1 and he.entrant_id = x.session_of)
        from public.heats x where x.contest_id = cid and x.round = rnd and x.session_of is not null;
    end loop;
  end if;
end;
$$;

-- ---- start_my_heat: Condensed sessions go in order ----
create or replace function public.start_my_heat(heat_id uuid)
returns public.heat_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  h public.heats;
  c public.contests;
  he public.heat_entries;
  prev public.heat_entries;
begin
  select * into h from public.heats x where x.id = start_my_heat.heat_id;
  select x.* into he from public.heat_entries x join public.entrants e on e.id = x.entrant_id
   where x.heat_id = h.id and e.user_id = auth.uid() for update of x;
  if auth.uid() is null or he.entrant_id is null then perform private.fail('not_in_heat', '42501'); end if;
  select * into c from public.contests x where x.id = h.contest_id;
  if c.mode <> 'open' then perform private.fail('not_open', '22023'); end if;
  if he.started_at is not null then return he; end if;
  if he.finished_at is not null then perform private.fail('heat_done', '55000'); end if;
  if h.state <> 'live' then perform private.fail('heat_over', '55000'); end if;
  if now() < h.starts_at then perform private.fail('heat_not_started', '55000'); end if;
  if now() >= h.window_ends_at then perform private.fail('window_closed', '55000'); end if;
  if c.open_format = 'condensed' and h.round > 1 then -- (the round before first: started, and finished or past its horn)
    select x.* into prev from public.heat_entries x join public.heats y on y.id = x.heat_id
     where y.contest_id = c.id and y.round = h.round - 1 and x.entrant_id = he.entrant_id;
    if prev.started_at is null or (prev.finished_at is null and now() < prev.started_at + private.heat_length(c)) then
      perform private.fail('surf_in_order', '55000');
    end if;
  end if;
  update public.heat_entries x set started_at = now() where x.heat_id = h.id and x.entrant_id = he.entrant_id returning * into he;
  return he;
end;
$$;

-- ---- Playing out: a round's heats from the sessions ----
-- Round rnd's heats are drawn (build_round); each surfer's session for rnd becomes their part of their heat.
create function private.fill_from_sessions(cid uuid, rnd int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.heat_entries he set started_at = s.started_at, finished_at = s.finished_at
    from public.heats x, public.heats sx, public.heat_entries s
   where x.id = he.heat_id and x.contest_id = cid and x.round = rnd and x.session_of is null
     and sx.contest_id = cid and sx.round = rnd and sx.session_of = he.entrant_id
     and s.heat_id = sx.id and s.entrant_id = he.entrant_id;
  update public.rides r set heat_id = x.id
    from public.heats sx, public.heat_entries he, public.heats x
   where r.heat_id = sx.id and sx.contest_id = cid and sx.round = rnd and sx.session_of is not null
     and he.entrant_id = sx.session_of and x.id = he.heat_id and x.contest_id = cid and x.round = rnd and x.session_of is null;
  -- (used: done, so its ride logs, which live under its id, read as the heat's do)
  update public.heats sx set state = 'done', closed_at = now()
   where sx.contest_id = cid and sx.round = rnd and sx.session_of is not null and sx.state = 'live'
     and exists (select 1 from public.heat_entries he join public.heats x on x.id = he.heat_id
                 where he.entrant_id = sx.session_of and x.contest_id = cid and x.round = rnd and x.session_of is null);
end;
$$;
revoke all on function private.fill_from_sessions(uuid, int) from public;

-- ---- close_heat_now: and Condensed ----
-- A Condensed contest's round 1 heats wait for the whole contest: every heat and session ready (the window over, or
-- everyone done with everything) and their rides checked. Then they close, and the last one plays out the rest: each
-- later round is drawn, filled from the sessions and closed at once, to the final.
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
  condensed boolean;
  first_ready timestamptz;
  x record;
begin
  select y.contest_id into c.id from public.heats y where y.id = hid;
  if c.id is null then perform private.fail('no_heat', 'P0002'); end if;
  -- (the contest first: two heats of a round closing at once would each think the other still on)
  select * into c from public.contests y where y.id = c.id for update;
  select * into h from public.heats y where y.id = hid for update;
  condensed := c.mode = 'open' and c.open_format = 'condensed';
  if h.state <> 'live' or h.session_of is not null then return false; end if; -- (a session closes with its round's heat)
  if condensed and h.round = 1 then
    if exists (select 1 from public.heats y where y.contest_id = c.id and y.state = 'live' and (y.round = 1 or y.session_of is not null)
               and not private.heat_ready(y, c)) then
      if by_tick then return false; end if;
      perform private.fail('heat_still_on', '55000');
    end if;
    update public.heats y set ready_at = now()
     where y.contest_id = c.id and y.state = 'live' and (y.round = 1 or y.session_of is not null) and y.ready_at is null;
    select min(y.ready_at), sum(private.checks_pending(y.id)) into first_ready, waiting
      from public.heats y where y.contest_id = c.id and y.state = 'live' and (y.round = 1 or y.session_of is not null);
    if waiting > 0 and now() < first_ready + interval '1 hour' then
      if not by_tick then perform private.fail('checks_pending', '55000'); end if;
      -- (asked once a tick: by the first heat)
      if h.number = (select min(y.number) from public.heats y where y.contest_id = c.id and y.round = 1 and y.state = 'live') then
        for x in select y.id, private.checks_pending(y.id) as n from public.heats y
                 where y.contest_id = c.id and y.state = 'live' and (y.round = 1 or y.session_of is not null) loop
          perform private.ask_for_checks(x.id, x.n);
        end loop;
      end if;
      return false;
    end if;
  elsif not condensed then -- (a Condensed round after the first is played out at once: its sessions were waited for)
    if not private.heat_ready(h, c) then
      if by_tick then return false; end if;
      perform private.fail('heat_still_on', '55000');
    end if;
    if c.mode = 'open' then
      if h.ready_at is null then update public.heats y set ready_at = now() where y.id = h.id returning * into h; end if;
      waiting := private.checks_pending(h.id);
      if waiting > 0 and now() < h.ready_at + interval '1 hour' then
        if by_tick then perform private.ask_for_checks(h.id, waiting); return false; end if;
        perform private.fail('checks_pending', '55000');
      end if;
    end if;
  end if;
  -- who goes through: the top `advance`, but never everyone (1 from a heat of 2); nobody from the final
  select count(*) into heats_in_round from public.heats y where y.contest_id = c.id and y.round = h.round and y.session_of is null;
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
  update public.heats y set state = 'done', closed_at = now() where y.id = h.id;

  if not exists (select 1 from public.heats y where y.contest_id = c.id and y.round = h.round and y.state = 'live' and y.session_of is null) then
    if heats_in_round > 1
       and not exists (select 1 from public.heats y where y.contest_id = c.id and y.round = h.round + 1 and y.session_of is null) then
      -- the next round: who went through, by place, then total, then their first seed
      perform private.build_round(c.id, h.round + 1,
        array(select he.entrant_id from public.heat_entries he
                join public.heats y on y.id = he.heat_id join public.entrants e on e.id = he.entrant_id
               where y.contest_id = c.id and y.round = h.round and he.advanced and y.session_of is null
               order by he.place, he.total desc, e.seed_rank),
        case when condensed then (select y.starts_at from public.heats y where y.contest_id = c.id and y.round = 1 order by y.number limit 1)
             else now() + case when c.mode = 'open' then interval '0' else private.round_break() end end);
      if condensed then -- (played out: filled from the sessions, and closed, which plays out the round after)
        perform private.fill_from_sessions(c.id, h.round + 1);
        for x in select y.id from public.heats y where y.contest_id = c.id and y.round = h.round + 1 and y.session_of is null order by y.number loop
          perform private.close_heat_now(x.id, true);
        end loop;
      end if;
    elsif heats_in_round = 1 then -- (the final)
      update public.contests y set state = 'done', ended_at = now() where y.id = c.id and y.state = 'running';
      -- (sessions from rounds their surfers didn't reach: they don't count, and aren't shown)
      update public.heats y set state = 'void', closed_at = now() where y.contest_id = c.id and y.session_of is not null and y.state = 'live';
    end if;
  end if;
  return true;
end;
$$;

-- ---- The tick: bracket heats only (a session closes with its round's heat) ----
create or replace function private.tick_open_contests()
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
  queued int := 0;
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
  -- heats over (a round at a time: closing a round's last heat builds the next, which waits for the next tick; in a
  -- Condensed contest it plays out the rest at once)
  for h in select x.id from public.heats x join public.contests y on y.id = x.contest_id
           where y.mode = 'open' and y.state = 'running' and x.state = 'live' and x.session_of is null and x.starts_at <= now()
           order by x.round, x.number loop
    begin
      if private.close_heat_now(h.id, true) then closed := closed + 1;
      elsif exists (select 1 from public.heats x where x.id = h.id and x.state = 'live') then waiting := waiting + 1; end if;
    exception when others then
      raise warning 'tick_open_contests: heat %: %', h.id, sqlerrm;
    end;
  end loop;
  -- the emails
  begin
    queued := private.queue_notices();
    if exists (select 1 from private.notices x where x.sent_at is null and x.tries < 3) then perform private.call_function('contest-notices'); end if;
  exception when others then
    raise warning 'tick_open_contests: notices: %', sqlerrm;
  end;
  return jsonb_build_object('started', started, 'cancelled', cancelled, 'closed', closed, 'waiting', waiting, 'queued', queued);
end;
$$;

-- ---- The emails: sessions ----
--   round_open    as before (round 1's heat: in Condensed, the whole contest's window)
--   closing_soon  Condensed: once a contest, for the first round you haven't surfed
--   results       not a session's; Condensed (all played out at once): only the heat you went out in, or the final
create or replace function private.queue_notices()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare n int;
begin
  with who as (
    select h.id as heat_id, h.contest_id, e.user_id, h.state, h.round, h.window_ends_at, h.starts_at, h.closed_at, h.session_of,
           he.started_at, he.finished_at, he.advanced, c.open_format
    from public.heat_entries he
    join public.heats h on h.id = he.heat_id
    join public.contests c on c.id = h.contest_id
    join public.entrants e on e.id = he.entrant_id
    join auth.users u on u.id = e.user_id and not coalesce(u.is_anonymous, false) and u.email is not null
    left join public.profiles p on p.id = e.user_id
    where c.mode = 'open' and c.state <> 'cancelled' and coalesce(p.contest_emails, true)
  ), due as (
    select heat_id, user_id, 'round_open' as kind from who
     where state = 'live' and round = 1 and session_of is null and started_at is null and now() < window_ends_at
    union all
    select heat_id, user_id, 'closing_soon' from who w
     where state = 'live' and started_at is null and finished_at is null and now() < window_ends_at
       and now() >= window_ends_at - least(interval '3 hours', (window_ends_at - starts_at) / 4)
       and (open_format <> 'condensed'
            or (not exists (select 1 from who w2 where w2.contest_id = w.contest_id and w2.user_id = w.user_id and w2.state = 'live'
                            and w2.started_at is null and w2.round < w.round)
                and not exists (select 1 from private.notices k join public.heats y on y.id = k.heat_id
                                where y.contest_id = w.contest_id and k.user_id = w.user_id and k.kind = 'closing_soon')))
    union all
    select heat_id, user_id, 'results' from who
     where state = 'done' and session_of is null and closed_at > now() - interval '1 day'
       and (open_format <> 'condensed' or advanced is not true)
  )
  insert into private.notices (heat_id, user_id, kind) select heat_id, user_id, kind from due
  on conflict (heat_id, user_id, kind) do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function public.take_notices(n int default 20)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare out jsonb;
begin
  with picked as (
    select x.id from private.notices x
    where x.sent_at is null and x.tries < 3
    order by x.created_at
    limit least(greatest(coalesce(n, 20), 1), 50)
    for update skip locked
  ), claimed as (
    update private.notices x set sent_at = now(), tries = x.tries + 1 from picked where x.id = picked.id
    returning x.*
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', k.id, 'kind', k.kind, 'email', u.email, 'handle', p.handle,
    'contest', jsonb_build_object('code', c.code, 'name', c.name, 'state', c.state, 'condensed', c.open_format = 'condensed',
      'rounds', (select max(y.round) from public.heats y where y.contest_id = c.id),
      'spot', coalesce(c.spot ->> 'name', c.spot ->> 'wave'), 'end_minutes', c.end_minutes, 'end_waves', c.end_waves),
    'heat', jsonb_build_object('id', h.id, 'round', h.round, 'number', h.number, 'window_ends_at', h.window_ends_at,
      'final', case when h.session_of is null
                    then (select count(*) from public.heats y where y.contest_id = c.id and y.round = h.round and y.session_of is null) = 1
                    else h.round = (select max(y.round) from public.heats y where y.contest_id = c.id) end), -- (a session: the last round's)
    'me', (select jsonb_build_object('place', he.place, 'total', he.total, 'advanced', he.advanced, 'surfed', he.started_at is not null)
           from public.heat_entries he join public.entrants e on e.id = he.entrant_id where he.heat_id = h.id and e.user_id = k.user_id),
    'winner', (select e.name from public.heat_entries he join public.entrants e on e.id = he.entrant_id
               where he.heat_id = h.id and he.place = 1 order by he.total desc nulls last limit 1),
    'next', case when c.open_format is distinct from 'condensed' then
            (select jsonb_build_object('round', y.round, 'window_ends_at', y.window_ends_at)
             from public.heats y join public.heat_entries he on he.heat_id = y.id join public.entrants e on e.id = he.entrant_id
             where y.contest_id = c.id and y.round = h.round + 1 and y.session_of is null and e.user_id = k.user_id limit 1) end
  )), '[]'::jsonb) into out
  from claimed k
  join auth.users u on u.id = k.user_id
  left join public.profiles p on p.id = k.user_id
  join public.heats h on h.id = k.heat_id
  join public.contests c on c.id = h.contest_id;
  return out;
end;
$$;

-- ---- watch_contest: the bracket's heats (no sessions) ----
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
      'visibility', c.visibility, 'created_at', c.created_at, 'started_at', c.started_at, 'ended_at', c.ended_at,
      'mode', c.mode, 'open_format', c.open_format, 'round_hours', c.round_hours, 'entry', c.entry,
      'signup_ends_at', c.signup_ends_at),
    'entrants', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name, 'guest', e.guest, 'seed_rank', e.seed_rank,
        'joined_at', e.joined_at) order by e.joined_at) from public.entrants e where e.contest_id = c.id), '[]'),
    'heats', coalesce((select jsonb_agg(jsonb_build_object('id', h.id, 'round', h.round, 'number', h.number, 'seed', h.seed,
        'starts_at', h.starts_at, 'ends_at', h.ends_at, 'window_ends_at', h.window_ends_at, 'state', h.state,
        'heat_entries', coalesce((select jsonb_agg(jsonb_build_object('entrant_id', he.entrant_id, 'jersey', he.jersey, 'place', he.place,
            'total', he.total, 'advanced', he.advanced, 'started_at', he.started_at, 'finished_at', he.finished_at))
            from public.heat_entries he where he.heat_id = h.id), '[]'))
        order by h.round, h.number) from public.heats h where h.contest_id = c.id and h.session_of is null), '[]'),
    'rides', coalesce((select jsonb_agg(jsonb_build_object('heat_id', r.heat_id, 'entrant_id', r.entrant_id, 'wave_no', r.wave_no,
        'score', r.score, 'caught_at', r.caught_at, 'replay_path', r.replay_path) order by r.caught_at)
        from public.rides r join public.heats h on h.id = r.heat_id
        where h.contest_id = c.id and h.session_of is null and (c.mode = 'live' or h.state = 'done')), '[]'),
    'recap', (select jsonb_build_object('video_path', r.video_path, 'seconds', r.seconds, 'made_at', r.made_at)
              from public.recaps r where r.contest_id = c.id)
  )
  from public.contests c
  where c.code = upper(btrim(watch_contest.code))
$$;
