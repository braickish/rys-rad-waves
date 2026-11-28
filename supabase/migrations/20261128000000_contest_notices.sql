-- Open contests, step 6: reminder emails (plans/2026-11-27-open-contests.md). The tick queues them; the contest-notices
-- Edge Function sends them. Each is sent once (unique per heat, surfer and kind):
--   round_open    round 1 is open: surf your heat by its window's end (later rounds: the results email says so)
--   closing_soon  your heat closes soon and you haven't surfed it: 3 hours before (or a quarter of the window, if less)
--   results       your heat has closed: your place, through or out (or the winner), the recap, and the next round's
--                 window if you're through
-- Members only, and not when they've turned contest emails off (profiles.contest_emails, the account page).
--
-- * private.queue_notices()        the tick, every 5 minutes; then it asks contest-notices to send (pg_net)
-- * public.take_notices(n)         service_role (the Edge Function): claims up to n with what each email says
-- * public.notice_failed(id, err)  service_role: gives one back (up to 3 tries)

alter table public.profiles add column contest_emails boolean not null default true;
grant update (contest_emails) on public.profiles to authenticated;

create table private.notices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  heat_id uuid not null references public.heats (id) on delete cascade,
  kind text not null check (kind in ('round_open', 'closing_soon', 'results')),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  tries int not null default 0,
  error text,
  unique (heat_id, user_id, kind)
);
create index notices_waiting on private.notices (created_at) where sent_at is null;
revoke all on private.notices from public, anon, authenticated;

create function private.queue_notices()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare n int;
begin
  with who as (
    select h.id as heat_id, e.user_id, h.state, h.round, h.window_ends_at, h.starts_at, h.closed_at, he.started_at, he.finished_at
    from public.heat_entries he
    join public.heats h on h.id = he.heat_id
    join public.contests c on c.id = h.contest_id
    join public.entrants e on e.id = he.entrant_id
    join auth.users u on u.id = e.user_id and not coalesce(u.is_anonymous, false) and u.email is not null
    left join public.profiles p on p.id = e.user_id
    where c.mode = 'open' and c.state <> 'cancelled' and coalesce(p.contest_emails, true)
  ), due as (
    select heat_id, user_id, 'round_open' as kind from who
     where state = 'live' and round = 1 and started_at is null and now() < window_ends_at
    union all
    select heat_id, user_id, 'closing_soon' from who
     where state = 'live' and started_at is null and finished_at is null and now() < window_ends_at
       and now() >= window_ends_at - least(interval '3 hours', (window_ends_at - starts_at) / 4)
    union all
    select heat_id, user_id, 'results' from who
     where state = 'done' and closed_at > now() - interval '1 day'
  )
  insert into private.notices (heat_id, user_id, kind) select heat_id, user_id, kind from due
  on conflict (heat_id, user_id, kind) do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- What each email needs: the address, the contest, the heat, and for results the places and the next round.
create function public.take_notices(n int default 20)
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
    'contest', jsonb_build_object('code', c.code, 'name', c.name, 'state', c.state,
      'spot', coalesce(c.spot ->> 'name', c.spot ->> 'wave'), 'end_minutes', c.end_minutes, 'end_waves', c.end_waves),
    'heat', jsonb_build_object('id', h.id, 'round', h.round, 'number', h.number, 'window_ends_at', h.window_ends_at,
      'final', (select count(*) from public.heats y where y.contest_id = c.id and y.round = h.round) = 1),
    'me', (select jsonb_build_object('place', he.place, 'total', he.total, 'advanced', he.advanced, 'surfed', he.started_at is not null)
           from public.heat_entries he join public.entrants e on e.id = he.entrant_id where he.heat_id = h.id and e.user_id = k.user_id),
    'winner', (select e.name from public.heat_entries he join public.entrants e on e.id = he.entrant_id
               where he.heat_id = h.id and he.place = 1 order by he.total desc nulls last limit 1),
    'next', (select jsonb_build_object('round', y.round, 'window_ends_at', y.window_ends_at)
             from public.heats y join public.heat_entries he on he.heat_id = y.id join public.entrants e on e.id = he.entrant_id
             where y.contest_id = c.id and y.round = h.round + 1 and e.user_id = k.user_id limit 1)
  )), '[]'::jsonb) into out
  from claimed k
  join auth.users u on u.id = k.user_id
  left join public.profiles p on p.id = k.user_id
  join public.heats h on h.id = k.heat_id
  join public.contests c on c.id = h.contest_id;
  return out;
end;
$$;

create function public.notice_failed(notice_id uuid, err text default null)
returns void
language sql
security definer
set search_path = ''
as $$ update private.notices set sent_at = null, error = left(err, 500) where id = notice_id $$;

revoke all on function private.queue_notices(), public.take_notices(int), public.notice_failed(uuid, text) from public, anon, authenticated;
grant execute on function public.take_notices(int), public.notice_failed(uuid, text) to service_role;

-- Call one of the project's Edge Functions (private.settings functions_url and functions_key; none set: nothing).
create function private.call_function(fn text, body jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  url text := (select value from private.settings where key = 'functions_url');
  k text := (select value from private.settings where key = 'functions_key');
begin
  if url is null or k is null then return; end if;
  perform net.http_post(url := url || '/' || fn, body := body,
                        headers := jsonb_build_object('content-type', 'application/json', 'authorization', 'Bearer ' || k, 'apikey', k));
exception when others then
  raise warning 'call_function %: %', fn, sqlerrm;
end;
$$;
revoke all on function private.call_function(text, jsonb) from public;

-- The tick, again: and the emails.
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
