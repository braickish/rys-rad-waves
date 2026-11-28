-- Open contests, step 1: the data (plans/2026-11-27-open-contests.md; the user's decisions, 2026-11-27).
--
-- An Open heat is a window, not a shared horn: each surfer in it surfs their heat once, on their own clock, whenever
-- they like before the window closes. Built on Live contests (20261125010000 on): the same tables and bracket.
--
-- * contests.mode           'live' (as before) or 'open'
-- * contests.open_format    'rounds' (a round a window); 'condensed' (every round in one window, played out at the
--                           close) comes in step 7, so for now it's refused
-- * contests.round_hours    each round's window, in hours (24 by default; more rounds than lengths: the last repeats)
-- * contests.entry          'invite' (the host invites by username) or 'open' (anyone with the link, while sign-up is on)
-- * contests.signup_ends_at when round 1 opens (the host can start it sooner, once 2 are in)
-- * heats.window_ends_at    the last moment to start your heat; heats.ends_at is then the latest horn (the window's
--                           end plus the heat's length)
-- * heat_entries.started_at your heat, started: one try (start_my_heat). Your horn is started_at plus the heat's length
-- * invites                 who the host asked (by username; by email in step 4)
--
-- Open entrants need an account (a free one is fine): no guests. Pro only to host, as Live.
-- Rivals' scores stay hidden in Open until the heat closes: an open heat's rides (and their logs and checks) are read
-- only by their own surfer until then, everywhere (the tables, watch_contest, Storage).
-- Nothing here closes heats on a schedule yet (step 2): close_heat closes an Open heat once everyone has finished, run
-- out of time, or missed the window.

alter table public.contests
  add column mode text not null default 'live' check (mode in ('live', 'open')),
  add column open_format text check (open_format in ('rounds', 'condensed')),
  add column round_hours numeric[] check (round_hours is null
    or (cardinality(round_hours) between 1 and 5 and 1 <= all (round_hours) and 168 >= all (round_hours))),
  add column entry text check (entry in ('invite', 'open')),
  add column signup_ends_at timestamptz,
  add constraint open_fields check ((mode = 'open') = (open_format is not null and round_hours is not null
                                                       and entry is not null and signup_ends_at is not null));
alter table public.heats add column window_ends_at timestamptz;
alter table public.heat_entries add column started_at timestamptz;

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  contest_id uuid not null references public.contests (id) on delete cascade,
  user_id uuid references auth.users (id) on delete cascade,
  email text check (email is null or email ~ '^[^@\s]+@[^@\s]+$'),
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  constraint invite_who check ((user_id is null) <> (email is null)),
  unique (contest_id, user_id),
  unique (contest_id, email)
);
create index invites_user on public.invites (user_id);
alter table public.invites enable row level security;
create policy "the host, or who's invited" on public.invites for select to authenticated
  using (user_id = (select auth.uid())
         or exists (select 1 from public.contests c where c.id = contest_id and c.host = (select auth.uid())));
revoke all on public.invites from anon, authenticated;
grant select on public.invites to authenticated;

-- ---- Helpers ----
-- A heat's length: its minutes, or a waves heat's time limit (as build_round).
create function private.heat_length(c public.contests)
returns interval
language sql
immutable
set search_path = ''
as $$ select coalesce(c.end_minutes * interval '1 minute', c.end_waves * interval '3 minutes') $$;
-- A round's window in an Open contest (the last length repeats).
create function private.round_window(c public.contests, rnd int)
returns interval
language sql
immutable
set search_path = ''
as $$ select c.round_hours[least(rnd, cardinality(c.round_hours))] * interval '1 hour' $$;
-- Are this heat's scores out? A Live heat's always are (the board shows them); an Open heat's once it's closed.
create function private.heat_scores_out(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.heats h join public.contests c on c.id = h.contest_id
                 where h.id = hid and (c.mode = 'live' or h.state = 'done'))
$$;
-- (is this entrant you?)
create function private.is_me(ent uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select exists (select 1 from public.entrants e where e.id = ent and e.user_id = auth.uid()) $$;
revoke all on function private.heat_length(public.contests), private.round_window(public.contests, int),
  private.heat_scores_out(uuid), private.is_me(uuid) from public;
grant execute on function private.heat_scores_out(uuid), private.is_me(uuid) to anon, authenticated;

-- Who can see a contest: as before, and whoever's invited to it.
create or replace function private.can_see_contest(cid uuid)
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
           or exists (select 1 from public.entrants e where e.contest_id = c.id and e.user_id = auth.uid())
           or exists (select 1 from public.invites i where i.contest_id = c.id and i.user_id = auth.uid()))
  )
$$;

-- ---- Hidden scores ----
drop policy "host, entrants, or public" on public.rides;
create policy "host, entrants, or public; an open heat's: yours" on public.rides for select to anon, authenticated
  using (private.can_see_heat(heat_id) and (private.heat_scores_out(heat_id) or private.is_me(entrant_id)));

drop policy "the contest's host" on public.ride_checks;
create policy "the contest's host, once the scores are out" on public.ride_checks for select to authenticated
  using (exists (select 1 from public.rides r join public.heats h on h.id = r.heat_id join public.contests c on c.id = h.contest_id
                 where r.id = ride_id and c.host = (select auth.uid()) and private.heat_scores_out(h.id)));

drop policy "ride logs: whoever can see the heat" on storage.objects;
create policy "ride logs: whoever can see the heat; an open heat's: yours" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'replays' and private.can_see_heat(private.path_heat(name))
         and (private.heat_scores_out(private.path_heat(name)) or (storage.foldername(name))[1] = (select auth.uid())::text));

-- (heat_entries.total and place are only written when a heat closes, so they need nothing more)

-- watch_contest: Open fields, and an open heat's rides left out until it closes.
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
        order by h.round, h.number) from public.heats h where h.contest_id = c.id), '[]'),
    'rides', coalesce((select jsonb_agg(jsonb_build_object('heat_id', r.heat_id, 'entrant_id', r.entrant_id, 'wave_no', r.wave_no,
        'score', r.score, 'caught_at', r.caught_at, 'replay_path', r.replay_path) order by r.caught_at)
        from public.rides r join public.heats h on h.id = r.heat_id
        where h.contest_id = c.id and (c.mode = 'live' or h.state = 'done')), '[]'),
    'recap', (select jsonb_build_object('video_path', r.video_path, 'seconds', r.seconds, 'made_at', r.made_at)
              from public.recaps r where r.contest_id = c.id)
  )
  from public.contests c
  where c.code = upper(btrim(watch_contest.code))
$$;

-- ---- create_contest: Live as before, or Open ----
drop function public.create_contest(text, text, uuid, numeric, int, int, text);
create function public.create_contest(
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
    if create_contest.open_format = 'condensed' then perform private.fail('condensed_later', '22023'); end if;
    if create_contest.open_format is distinct from 'rounds' then perform private.fail('bad_format', '22023'); end if;
    if create_contest.entry not in ('invite', 'open') or create_contest.entry is null then perform private.fail('bad_entry', '22023'); end if;
    if create_contest.round_hours is null or cardinality(create_contest.round_hours) not between 1 and 5
       or not (1 <= all (create_contest.round_hours) and 168 >= all (create_contest.round_hours)) then
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
revoke all on function public.create_contest(text, text, uuid, numeric, int, int, text, text, text, numeric[], text, numeric) from public;
grant execute on function public.create_contest(text, text, uuid, numeric, int, int, text, text, text, numeric[], text, numeric) to authenticated;

-- ---- contest_by_code: and what kind of contest it is ----
drop function public.contest_by_code(text);
create function public.contest_by_code(code text)
returns table (id uuid, code text, name text, host_handle text, spot_wave text, spot_name text, end_minutes numeric,
               end_waves int, state text, entrants int, max_entrants int,
               mode text, open_format text, round_hours numeric[], entry text, signup_ends_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.code, c.name, p.handle, c.spot ->> 'wave', c.spot ->> 'name', c.end_minutes, c.end_waves, c.state,
         (select count(*)::int from public.entrants e where e.contest_id = c.id), c.max_entrants,
         c.mode, c.open_format, c.round_hours, c.entry, c.signup_ends_at
  from public.contests c left join public.profiles p on p.id = c.host
  where c.code = upper(btrim(contest_by_code.code))
$$;
revoke all on function public.contest_by_code(text) from public;
grant execute on function public.contest_by_code(text) to anon, authenticated;

-- ---- invite_to_contest: the host asks someone by username ----
create function public.invite_to_contest(contest_id uuid, handle text)
returns public.invites
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.contests;
  who uuid;
  i public.invites;
begin
  select * into c from public.contests x where x.id = invite_to_contest.contest_id;
  if not found or c.host is distinct from auth.uid() then perform private.fail('not_host', '42501'); end if;
  if c.mode <> 'open' then perform private.fail('not_open', '22023'); end if;
  if c.state <> 'lobby' then perform private.fail('contest_started', '55000'); end if;
  select p.id into who from public.profiles p where p.handle = lower(btrim(coalesce(invite_to_contest.handle, '')));
  if who is null then perform private.fail('no_such_surfer', 'P0002'); end if;
  if (select count(*) from public.invites x where x.contest_id = c.id) >= 64 then perform private.fail('too_many_invites', '23514'); end if;
  insert into public.invites (contest_id, user_id) values (c.id, who)
  on conflict on constraint invites_contest_id_user_id_key do update set invited_at = public.invites.invited_at
  returning * into i;
  return i;
end;
$$;
create function public.uninvite(invite_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.invites i using public.contests c
   where i.id = uninvite.invite_id and c.id = i.contest_id and c.host = auth.uid() and c.state = 'lobby' and i.accepted_at is null;
end;
$$;
revoke all on function public.invite_to_contest(uuid, text), public.uninvite(uuid) from public;
grant execute on function public.invite_to_contest(uuid, text), public.uninvite(uuid) to authenticated;

-- ---- join_contest: Open needs an account, sign-up still on, and (invite only) an invite ----
create or replace function public.join_contest(code text, nickname text default null)
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
  if c.mode = 'open' then
    if not member then perform private.fail('account_needed', '42501'); end if;
    if now() >= c.signup_ends_at then perform private.fail('signup_over', '55000'); end if;
    if c.entry = 'invite' and not exists (select 1 from public.invites i where i.contest_id = c.id and i.user_id = uid) then
      perform private.fail('invite_only', '42501');
    end if;
  end if;
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
  update public.invites i set accepted_at = coalesce(i.accepted_at, now()) where i.contest_id = c.id and i.user_id = uid;
  return e;
end;
$$;

-- ---- build_round: an Open round is a window ----
create or replace function private.build_round(cid uuid, rnd int, ids uuid[], starts timestamptz)
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
  win timestamptz;
begin
  select * into c from public.contests x where x.id = cid;
  if n = 0 then return; end if;
  k := case when n <= 4 then 1 else ceil(n / 4.0)::int end; -- (2 to 4 a heat)
  s := private.round_seed(c.seed, rnd);
  win := case when c.mode = 'open' then starts + private.round_window(c, rnd) end;
  for i in 1..k loop
    insert into public.heats (contest_id, round, number, seed, starts_at, window_ends_at, ends_at)
    values (cid, rnd, i, s, starts, win, coalesce(win, starts) + private.heat_length(c))
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

-- ---- start_contest: an Open contest's host can open round 1 early, once 2 are in ----
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
  if c.mode = 'open' and (select count(*) from public.entrants e where e.contest_id = c.id) < 2 then
    perform private.fail('need_two', '55000');
  end if;
  update public.entrants e set seed_rank = r.n
    from (select x.id, row_number() over (order by x.joined_at, x.id) as n from public.entrants x where x.contest_id = c.id) r
    where e.id = r.id;
  perform private.build_round(c.id, 1, array(select e.id from public.entrants e where e.contest_id = c.id order by e.seed_rank),
                              case when c.mode = 'open' then now() else now() + interval '10 seconds' end); -- (Live: a countdown, so everyone drops in together)
  update public.contests x set state = 'running', started_at = now() where x.id = c.id;
  select * into h from public.heats x where x.contest_id = c.id and x.round = 1 order by x.number limit 1;
  return h;
end;
$$;

-- ---- start_my_heat: your one try at an Open heat ----
-- Starts your horn now (the heat's length from now). Again after that gives back the same start: a reload carries on
-- with the clock still running, never a new one.
create function public.start_my_heat(heat_id uuid)
returns public.heat_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  h public.heats;
  c public.contests;
  he public.heat_entries;
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
  update public.heat_entries x set started_at = now() where x.heat_id = h.id and x.entrant_id = he.entrant_id returning * into he;
  return he;
end;
$$;
revoke all on function public.start_my_heat(uuid) from public;
grant execute on function public.start_my_heat(uuid) to authenticated;

-- ---- submit_ride: in an Open heat, against your own horn ----
-- caught_s: when you caught it, in seconds from the heat's start (Live) or from your own start (Open).
create or replace function public.submit_ride(heat_id uuid, wave_no int, score numeric, judges numeric[], caught_s numeric,
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
  mine timestamptz;
  t0 timestamptz;
  horn timestamptz;
  caught timestamptz;
  r public.rides;
begin
  select * into h from public.heats x where x.id = submit_ride.heat_id for update;
  select e.id, he.started_at into ent, mine from public.heat_entries he join public.entrants e on e.id = he.entrant_id
    where he.heat_id = h.id and e.user_id = uid;
  if uid is null or ent is null then perform private.fail('not_in_heat', '42501'); end if;
  select * into c from public.contests x where x.id = h.contest_id;
  if h.state <> 'live' then perform private.fail('heat_over', '55000'); end if;
  if c.mode = 'open' then
    if mine is null then perform private.fail('heat_not_started', '55000'); end if;
    t0 := mine; horn := mine + private.heat_length(c);
  else
    if now() < h.starts_at then perform private.fail('heat_not_started', '55000'); end if;
    t0 := h.starts_at; horn := h.ends_at;
  end if;
  if caught_s is null or caught_s < 0 then perform private.fail('bad_time', '22023'); end if;
  caught := t0 + caught_s * interval '1 second';
  if caught > now() + interval '5 seconds' then perform private.fail('bad_time', '22023'); end if; -- (not in the future)
  if caught > horn then perform private.fail('after_horn', '55000'); end if;
  if now() > horn + private.ride_grace() then perform private.fail('too_late', '55000'); end if;
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

-- ---- close_heat: an Open heat closes once everyone has finished, run out of time, or missed the window ----
-- No-shows score 0 and come last (ties between them by seed); the next Open round opens at once, with its own window.
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
  through int;
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
             or (select count(*) from public.rides r where r.heat_id = h.id and r.entrant_id = he.entrant_id) < c.end_waves)
        and not (c.mode = 'open' and
                 case when he.started_at is null then now() >= h.window_ends_at
                      else now() > he.started_at + private.heat_length(c) + private.ride_grace() end));
    if not everyone_done and now() <= h.ends_at + private.ride_grace() then perform private.fail('heat_still_on', '55000'); end if;
    -- who goes through: the top `advance`, but never everyone (1 from a heat of 2); nobody from the final
    select count(*) into heats_in_round from public.heats x where x.contest_id = c.id and x.round = h.round;
    through := case when heats_in_round = 1 then 0
                    else least(c.advance, (select count(*) from public.heat_entries he where he.heat_id = h.id)::int - 1) end;
    with best as (
      select he.entrant_id, he.started_at is not null or c.mode = 'live' as showed,
             (array_agg(r.score order by r.score desc) filter (where r.score is not null)) as s
      from public.heat_entries he left join public.rides r on r.heat_id = he.heat_id and r.entrant_id = he.entrant_id
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
  end if;
  return query select * from public.heat_entries he where he.heat_id = h.id order by he.place, he.jersey;
end;
$$;
