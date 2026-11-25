-- Contests on accounts (plan: plans/2026-11-23-accounts-and-paid-plans.md, task 10; the live contests plan's phase 2).
--
-- A Pro member hosts a contest on a spot: one of the game's waves, or a snapshot of a break (its ride, copied when the
-- contest is made, so editing the break doesn't change a running contest). Anyone signed in joins by its code, guests
-- (anonymous sessions) with a nickname and members as their handle. Joining is the contest pass: entrants read the
-- contest, so they surf its spot without owning it or having a Wave Pass.
--
-- Everything that changes a contest goes through the functions below, never the tables:
--   create_contest   Pro only; at most 3 open (lobby or running) at once; a single round of up to 8 for now (brackets:
--                    task 13)
--   contest_by_code  the lobby's preview, for anyone with the code (no spot)
--   join_contest     in the lobby; a rejoin gives back your entry
--   leave_contest    in the lobby
--   start_contest    the host (still Pro): the heat, its seed, its clock (from the server's time) and its jerseys
--   submit_ride      an entrant's own scored wave: in order, caught before the horn, in time
--   close_heat       anyone in the contest, once the heat is over: totals (best two), places (ties by best wave, then
--                    second, then third, as the WSL), and the contest ends with its last heat
--   cancel_contest   the host
--
-- Who reads what: a contest, its entrants, heats and rides are read by its host and entrants, and by everyone when it's
-- public (results on profiles, task 14). Unlisted is the default.
--
-- Scores are the client's for now: task 15 re-runs the ride logs (rides.replay_path) to check them.

create table public.contests (
  id uuid primary key default gen_random_uuid(),
  code text not null unique constraint contest_code check (code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$'),
  host uuid references auth.users (id) on delete set null,
  name text not null constraint contest_name_length check (char_length(name) between 1 and 40),
  -- {"wave": "<id>"} or {"break_id": "<id>", "name": "<its name>", "ride": {...}}
  spot jsonb not null constraint spot_size check (pg_column_size(spot) < 200000),
  seed int not null,
  end_minutes numeric constraint end_minutes_range check (end_minutes is null or end_minutes between 1 and 30),
  end_waves int constraint end_waves_range check (end_waves is null or end_waves between 1 and 10),
  format text not null default 'single' check (format in ('single', 'bracket')),
  heat_size int not null default 8 check (heat_size between 2 and 8),
  advance int not null default 2 check (advance between 1 and 4),
  max_entrants int not null default 8 check (max_entrants between 2 and 32),
  visibility text not null default 'unlisted' check (visibility in ('unlisted', 'public')),
  state text not null default 'lobby' check (state in ('lobby', 'running', 'done', 'cancelled')),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  ended_at timestamptz,
  constraint one_end check ((end_minutes is null) <> (end_waves is null))
);
create index contests_host on public.contests (host, state);
create index contests_public on public.contests (created_at desc) where visibility = 'public';

create table public.entrants (
  id uuid primary key default gen_random_uuid(),
  contest_id uuid not null references public.contests (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null, -- (a deleted account's results stay, by name)
  name text not null constraint entrant_name check (char_length(name) between 1 and 20),
  guest boolean not null default false,
  seed_rank int,
  joined_at timestamptz not null default clock_timestamp(),
  unique (contest_id, user_id)
);
create index entrants_user on public.entrants (user_id);

create table public.heats (
  id uuid primary key default gen_random_uuid(),
  contest_id uuid not null references public.contests (id) on delete cascade,
  round int not null default 1,
  number int not null default 1,
  seed int not null,
  state text not null default 'live' check (state in ('live', 'done')),
  starts_at timestamptz not null,
  ends_at timestamptz not null, -- (the horn; a waves heat's time limit)
  closed_at timestamptz,
  unique (contest_id, round, number)
);

create table public.heat_entries (
  heat_id uuid not null references public.heats (id) on delete cascade,
  entrant_id uuid not null references public.entrants (id) on delete cascade,
  jersey text not null check (jersey in ('red', 'white', 'blue', 'yellow', 'green', 'black', 'pink', 'teal')),
  total numeric(5, 2),
  place int,
  advanced boolean,
  primary key (heat_id, entrant_id),
  unique (heat_id, jersey)
);

create table public.rides (
  id uuid primary key default gen_random_uuid(),
  heat_id uuid not null references public.heats (id) on delete cascade,
  entrant_id uuid not null references public.entrants (id) on delete cascade,
  wave_no int not null check (wave_no between 1 and 60),
  score numeric(4, 2) not null check (score between 0 and 10),
  judges numeric(4, 2)[] not null check (cardinality(judges) = 5 and 0 <= all (judges) and 10 >= all (judges)),
  sheet jsonb not null default '{}'::jsonb check (pg_column_size(sheet) < 8000),
  caught_at timestamptz not null,
  replay_path text, -- (the ride's input log in Storage, <user id>/...: task 12 uploads it, task 15 re-runs it)
  sim_version int not null default 1,
  created_at timestamptz not null default now(),
  unique (heat_id, entrant_id, wave_no)
);

-- ---- Who reads what ----
create function private.can_see_contest(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.contests c
    where c.id = cid
      and (c.visibility = 'public' or c.host = auth.uid()
           or exists (select 1 from public.entrants e where e.contest_id = c.id and e.user_id = auth.uid()))
  )
$$;
create function private.can_see_heat(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_see_contest((select h.contest_id from public.heats h where h.id = hid))
$$;
revoke all on function private.can_see_contest(uuid), private.can_see_heat(uuid) from public;
grant execute on function private.can_see_contest(uuid), private.can_see_heat(uuid) to anon, authenticated;

alter table public.contests enable row level security;
alter table public.entrants enable row level security;
alter table public.heats enable row level security;
alter table public.heat_entries enable row level security;
alter table public.rides enable row level security;

create policy "host, entrants, or public" on public.contests for select to anon, authenticated using (private.can_see_contest(id));
create policy "host, entrants, or public" on public.entrants for select to anon, authenticated using (private.can_see_contest(contest_id));
create policy "host, entrants, or public" on public.heats for select to anon, authenticated using (private.can_see_contest(contest_id));
create policy "host, entrants, or public" on public.heat_entries for select to anon, authenticated using (private.can_see_heat(heat_id));
create policy "host, entrants, or public" on public.rides for select to anon, authenticated using (private.can_see_heat(heat_id));

revoke all on public.contests, public.entrants, public.heats, public.heat_entries, public.rides from anon, authenticated;
grant select on public.contests, public.entrants, public.heats, public.heat_entries, public.rides to anon, authenticated;

-- ---- Helpers ----
create function private.is_member(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select uid is not null and exists (select 1 from auth.users u where u.id = uid and not coalesce(u.is_anonymous, false))
$$;

create function private.contest_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  letters constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- (no I, L, O, 0 or 1)
  c text;
begin
  loop
    c := '';
    for i in 1..6 loop c := c || substr(letters, 1 + floor(random() * length(letters))::int, 1); end loop;
    exit when not exists (select 1 from public.contests where code = c);
  end loop;
  return c;
end;
$$;

-- Errors carry a short code in their message (and hint) for the game to put into words.
create function private.fail(code text, sqlstate_code text default 'P0001')
returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception '%', code using errcode = sqlstate_code, hint = code;
end;
$$;

-- The game's waves a contest can be on (src/waves/index.js WAVES).
create function private.contest_wave(w text)
returns boolean
language sql
immutable
set search_path = ''
as $$ select w in ('point', 'raglanPlus', 'reef', 'queens', 'trestles', 'dynamic') $$;

-- How long late a ride caught before the horn can still come in (the ride, then the judges).
create function private.ride_grace()
returns interval
language sql
immutable
set search_path = ''
as $$ select interval '2 minutes' $$;

-- ---- create_contest ----
create function public.create_contest(
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
  if max_entrants > 8 then perform private.fail('brackets_later', '22023'); end if; -- (one heat of up to 8 for now)
  insert into public.contests (code, host, name, spot, seed, end_minutes, end_waves, max_entrants, visibility, heat_size)
  values (private.contest_code(), uid, name, s, floor(random() * 2147483647)::int, create_contest.end_minutes,
          create_contest.end_waves, create_contest.max_entrants, create_contest.visibility, 8)
  returning * into c;
  return c;
end;
$$;

-- ---- The lobby's preview: what a code is, before joining ----
create function public.contest_by_code(code text)
returns table (id uuid, code text, name text, host_handle text, spot_wave text, spot_name text, end_minutes numeric,
               end_waves int, state text, entrants int, max_entrants int)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.code, c.name, p.handle, c.spot ->> 'wave', c.spot ->> 'name', c.end_minutes, c.end_waves, c.state,
         (select count(*)::int from public.entrants e where e.contest_id = c.id), c.max_entrants
  from public.contests c left join public.profiles p on p.id = c.host
  where c.code = upper(btrim(contest_by_code.code))
$$;

-- ---- join_contest / leave_contest ----
create function public.join_contest(code text, nickname text default null)
returns public.entrants
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  c public.contests;
  e public.entrants;
  member boolean := private.is_member(uid);
  n text;
begin
  if uid is null then perform private.fail('sign_in', '42501'); end if;
  select * into c from public.contests x where x.code = upper(btrim(join_contest.code)) for update;
  if not found then perform private.fail('no_contest', 'P0002'); end if;
  select * into e from public.entrants x where x.contest_id = c.id and x.user_id = uid;
  if found then return e; end if; -- (a rejoin: the same entry)
  if c.state <> 'lobby' then perform private.fail('contest_started', '55000'); end if;
  if (select count(*) from public.entrants x where x.contest_id = c.id) >= c.max_entrants then
    perform private.fail('contest_full', '55000');
  end if;
  if member then select p.handle into n from public.profiles p where p.id = uid; end if;
  if n is null then -- (a guest, or a member before picking a handle)
    n := regexp_replace(btrim(coalesce(nickname, '')), '\s+', ' ', 'g');
    if char_length(n) not between 1 and 20 or n !~ '^[A-Za-z0-9][A-Za-z0-9 _.''-]*$' then perform private.fail('bad_name', '22023'); end if;
    if private.text_blocked(n) then perform private.fail('name_blocked', '23514'); end if;
  end if;
  if exists (select 1 from public.entrants x where x.contest_id = c.id and lower(x.name) = lower(n)) then
    perform private.fail('name_taken', '23505');
  end if;
  insert into public.entrants (contest_id, user_id, name, guest) values (c.id, uid, n, not member) returning * into e;
  return e;
end;
$$;

create function public.leave_contest(contest_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.contests c where c.id = leave_contest.contest_id and c.state <> 'lobby') then
    perform private.fail('contest_started', '55000');
  end if;
  delete from public.entrants e where e.contest_id = leave_contest.contest_id and e.user_id = auth.uid();
end;
$$;

-- ---- start_contest: the host starts the heat ----
create function public.start_contest(contest_id uuid)
returns public.heats
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  c public.contests;
  h public.heats;
  starts timestamptz := now() + interval '10 seconds'; -- (a countdown, so everyone drops in together)
begin
  select * into c from public.contests x where x.id = start_contest.contest_id for update;
  if not found or c.host is distinct from uid then perform private.fail('not_host', '42501'); end if;
  if not private.user_has_entitlement(uid, 'pro') then perform private.fail('pro_needed', '42501'); end if;
  if c.state <> 'lobby' then perform private.fail('contest_started', '55000'); end if;
  if not exists (select 1 from public.entrants e where e.contest_id = c.id) then perform private.fail('no_entrants', '55000'); end if;
  -- seed ranks by who joined first
  update public.entrants e set seed_rank = r.n
    from (select x.id, row_number() over (order by x.joined_at, x.id) as n from public.entrants x where x.contest_id = c.id) r
    where e.id = r.id;
  insert into public.heats (contest_id, round, number, seed, starts_at, ends_at)
  values (c.id, 1, 1, c.seed, starts,
          starts + coalesce(c.end_minutes * interval '1 minute', c.end_waves * interval '3 minutes'))
  returning * into h;
  -- Jerseys: drawn from the heat's seed, all different (the user, 2026-11-24), stored so every screen shows the same.
  insert into public.heat_entries (heat_id, entrant_id, jersey)
  select h.id, e.id, j.jersey
  from (select x.id, row_number() over (order by md5(h.seed::text || x.id::text)) as n
        from public.entrants x where x.contest_id = c.id) e
  join (select jersey, row_number() over (order by md5(h.seed::text || jersey)) as n
        from unnest(array['red', 'white', 'blue', 'yellow', 'green', 'black', 'pink', 'teal']) as jersey) j on j.n = e.n;
  update public.contests x set state = 'running', started_at = now() where x.id = c.id;
  return h;
end;
$$;

-- ---- submit_ride: your scored wave ----
-- caught_s: when you caught it, in seconds from the heat's start (the client runs its clock from starts_at).
create function public.submit_ride(heat_id uuid, wave_no int, score numeric, judges numeric[], caught_s numeric,
                                   sheet jsonb default '{}'::jsonb, replay_path text default null, sim_version int default 1)
returns public.rides
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  h public.heats;
  c public.contests;
  ent uuid;
  caught timestamptz;
  r public.rides;
begin
  select * into h from public.heats x where x.id = submit_ride.heat_id for update;
  select e.id into ent from public.heat_entries he join public.entrants e on e.id = he.entrant_id
    where he.heat_id = h.id and e.user_id = uid;
  if uid is null or ent is null then perform private.fail('not_in_heat', '42501'); end if;
  select * into c from public.contests x where x.id = h.contest_id;
  if h.state <> 'live' then perform private.fail('heat_over', '55000'); end if;
  if now() < h.starts_at then perform private.fail('heat_not_started', '55000'); end if;
  if caught_s is null or caught_s < 0 then perform private.fail('bad_time', '22023'); end if;
  caught := h.starts_at + caught_s * interval '1 second';
  if caught > now() + interval '5 seconds' then perform private.fail('bad_time', '22023'); end if; -- (not in the future)
  if caught > h.ends_at then perform private.fail('after_horn', '55000'); end if;
  if now() > h.ends_at + private.ride_grace() then perform private.fail('too_late', '55000'); end if;
  if c.end_waves is not null and wave_no > c.end_waves then perform private.fail('no_more_waves', '55000'); end if;
  if wave_no is distinct from 1 + (select count(*) from public.rides x where x.heat_id = h.id and x.entrant_id = ent) then
    perform private.fail('wave_out_of_order', '22023');
  end if;
  if replay_path is not null and replay_path !~ ('^' || uid::text || '/[A-Za-z0-9._/-]{1,200}$') then
    perform private.fail('bad_replay_path', '22023');
  end if;
  insert into public.rides (heat_id, entrant_id, wave_no, score, judges, sheet, caught_at, replay_path, sim_version)
  values (h.id, ent, wave_no, score, judges, coalesce(sheet, '{}'::jsonb), caught, replay_path, coalesce(sim_version, 1))
  returning * into r;
  return r;
end;
$$;

-- ---- close_heat: totals, places; the contest ends with its last heat ----
create function public.close_heat(heat_id uuid)
returns setof public.heat_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  h public.heats;
  c public.contests;
  everyone_rode boolean;
begin
  select * into h from public.heats x where x.id = close_heat.heat_id for update;
  if not found then perform private.fail('no_heat', 'P0002'); end if;
  select * into c from public.contests x where x.id = h.contest_id;
  if not (c.host = auth.uid() or exists (select 1 from public.entrants e where e.contest_id = c.id and e.user_id = auth.uid())) then
    perform private.fail('not_in_contest', '42501');
  end if;
  if h.state = 'live' then
    everyone_rode := c.end_waves is not null and not exists (
      select 1 from public.heat_entries he
      where he.heat_id = h.id
        and (select count(*) from public.rides r where r.heat_id = h.id and r.entrant_id = he.entrant_id) < c.end_waves);
    if not everyone_rode and now() <= h.ends_at + private.ride_grace() then perform private.fail('heat_still_on', '55000'); end if;
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
    if not exists (select 1 from public.heats x where x.contest_id = c.id and x.state = 'live') then
      update public.contests x set state = 'done', ended_at = now() where x.id = c.id and x.state = 'running';
    end if;
  end if;
  return query select * from public.heat_entries he where he.heat_id = h.id order by he.place, he.jersey;
end;
$$;

-- ---- cancel_contest ----
create function public.cancel_contest(contest_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.contests c set state = 'cancelled', ended_at = now()
    where c.id = cancel_contest.contest_id and c.host = auth.uid() and c.state in ('lobby', 'running');
  if not found then perform private.fail('not_host_or_over', '42501'); end if;
  update public.heats h set state = 'done', closed_at = now() where h.contest_id = cancel_contest.contest_id and h.state = 'live';
end;
$$;

revoke all on function public.create_contest(text, text, uuid, numeric, int, int, text), public.contest_by_code(text),
  public.join_contest(text, text), public.leave_contest(uuid), public.start_contest(uuid),
  public.submit_ride(uuid, int, numeric, numeric[], numeric, jsonb, text, int), public.close_heat(uuid),
  public.cancel_contest(uuid) from public;
grant execute on function public.contest_by_code(text) to anon, authenticated;
grant execute on function public.create_contest(text, text, uuid, numeric, int, int, text), public.join_contest(text, text),
  public.leave_contest(uuid), public.start_contest(uuid), public.submit_ride(uuid, int, numeric, numeric[], numeric, jsonb, text, int),
  public.close_heat(uuid), public.cancel_contest(uuid) to authenticated;
revoke all on function private.is_member(uuid), private.contest_code(), private.fail(text, text), private.contest_wave(text),
  private.ride_grace() from public;
