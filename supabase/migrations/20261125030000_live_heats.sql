-- Live heats (accounts plan task 12; the live contests plan's phase 4).
--
-- * server_time(): the server's clock, so every screen runs the heat clock from the heat's starts_at (each measures its
--   offset once) and the horn sounds for everyone together.
-- * finish_heat(heat): you're done (the horn and you're off your wave, or you've ridden all your waves). A heat closes as
--   soon as everyone in it has finished, instead of waiting out the grace after the horn.
-- * Ride logs: each scored wave's replay goes in the private Storage bucket `replays` at <your id>/<heat id>/<wave>.json
--   (rides.replay_path), written only by you while you're in that heat, read by whoever can see the heat (task 15
--   re-runs them).

create function public.server_time()
returns timestamptz
language sql
volatile
set search_path = ''
as $$ select clock_timestamp() $$;
revoke all on function public.server_time() from public;
grant execute on function public.server_time() to anon, authenticated;

alter table public.heat_entries add column finished_at timestamptz;

create function public.finish_heat(heat_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.heat_entries he set finished_at = coalesce(he.finished_at, now())
    from public.entrants e
   where he.heat_id = finish_heat.heat_id and e.id = he.entrant_id and e.user_id = auth.uid();
  if not found then perform private.fail('not_in_heat', '42501'); end if;
end;
$$;
revoke all on function public.finish_heat(uuid) from public;
grant execute on function public.finish_heat(uuid) to authenticated;

-- close_heat, again: also once everyone has finished.
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
begin
  select * into h from public.heats x where x.id = close_heat.heat_id for update;
  if not found then perform private.fail('no_heat', 'P0002'); end if;
  select * into c from public.contests x where x.id = h.contest_id;
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
    if not exists (select 1 from public.heats x where x.contest_id = c.id and x.state = 'live') then
      update public.contests x set state = 'done', ended_at = now() where x.id = c.id and x.state = 'running';
    end if;
  end if;
  return query select * from public.heat_entries he where he.heat_id = h.id order by he.place, he.jersey;
end;
$$;

-- ---- Ride logs ----
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('replays', 'replays', false, 2000000, array['application/json'])
on conflict (id) do nothing;

-- (the path's heat folder, as a uuid, or null when it isn't one)
create function private.path_heat(name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case when (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then ((storage.foldername(name))[2])::uuid end
$$;
create function private.in_heat(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.heat_entries he join public.entrants e on e.id = he.entrant_id
                 where he.heat_id = hid and e.user_id = auth.uid())
$$;
revoke all on function private.path_heat(text), private.in_heat(uuid) from public;
grant execute on function private.path_heat(text), private.in_heat(uuid) to anon, authenticated;

create policy "ride logs: yours, in your heat" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'replays' and (storage.foldername(name))[1] = (select auth.uid())::text
              and private.in_heat(private.path_heat(name)));

create policy "ride logs: whoever can see the heat" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'replays' and private.can_see_heat(private.path_heat(name)));
