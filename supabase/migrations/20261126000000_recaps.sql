-- Recaps (accounts plan task 17, step 1): a contest's recap video, made once by its host (on the device, from the ride
-- logs: src/recap-player.js) and kept with the contest, for everyone who can see the contest (its page, and the results
-- on the profiles of everyone in it).
--
-- * recaps: one a contest (the latest kept), the video's path in the public `recaps` bucket (<contest id>/recap.mp4: the
--   contest's id is in it, so an unlisted contest's video can't be guessed), how long it runs.
-- * save_recap(contest, path, seconds): the host, once the contest is over.
-- * profile_results gains the recap's video.

create table public.recaps (
  contest_id uuid primary key references public.contests (id) on delete cascade,
  video_path text not null,
  seconds numeric not null check (seconds > 0 and seconds < 1200),
  made_by uuid references auth.users (id) on delete set null,
  made_at timestamptz not null default now()
);
alter table public.recaps enable row level security;
create policy "whoever can see the contest" on public.recaps for select to anon, authenticated using (private.can_see_contest(contest_id));
revoke all on public.recaps from anon, authenticated;
grant select on public.recaps to anon, authenticated;

create function public.save_recap(contest_id uuid, video_path text, seconds numeric)
returns public.recaps
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.contests;
  r public.recaps;
begin
  select * into c from public.contests x where x.id = save_recap.contest_id;
  if not found or c.host is distinct from auth.uid() then perform private.fail('not_host', '42501'); end if;
  if c.state <> 'done' then perform private.fail('contest_not_over', '55000'); end if;
  if video_path is distinct from c.id::text || '/recap.mp4' then perform private.fail('bad_path', '22023'); end if;
  insert into public.recaps (contest_id, video_path, seconds, made_by) values (c.id, video_path, seconds, auth.uid())
  on conflict on constraint recaps_pkey do update set video_path = excluded.video_path, seconds = excluded.seconds, made_by = excluded.made_by, made_at = now()
  returning * into r;
  return r;
end;
$$;
revoke all on function public.save_recap(uuid, text, numeric) from public;
grant execute on function public.save_recap(uuid, text, numeric) to authenticated;

-- The videos: public to read (the path carries the contest's id); written only by the contest's host, once it's over.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recaps', 'recaps', true, 150000000, array['video/mp4'])
on conflict (id) do nothing;

create function private.hosts_finished(cid text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.contests c where c.id::text = cid and c.host = auth.uid() and c.state = 'done')
$$;
revoke all on function private.hosts_finished(text) from public;
grant execute on function private.hosts_finished(text) to authenticated;

create policy "recaps: the host writes theirs" on storage.objects for insert to authenticated
  with check (bucket_id = 'recaps' and private.hosts_finished((storage.foldername(name))[1]));
create policy "recaps: the host replaces theirs" on storage.objects for update to authenticated
  using (bucket_id = 'recaps' and private.hosts_finished((storage.foldername(name))[1]))
  with check (bucket_id = 'recaps' and private.hosts_finished((storage.foldername(name))[1]));
create policy "recaps: the host sees theirs" on storage.objects for select to authenticated
  using (bucket_id = 'recaps' and private.hosts_finished((storage.foldername(name))[1]));

-- profile_results, with the recap's video when there is one.
drop function public.profile_results(text);
create function public.profile_results(handle text)
returns table (code text, name text, ended_at timestamptz, spot_wave text, spot_name text, entrants int,
               round int, final boolean, place int, total numeric, recap_path text)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select p.id from public.profiles p where p.handle = lower(profile_results.handle)),
  last_heat as (
    select distinct on (c.id) c.id as contest_id, h.round, he.place, he.total,
           (select count(*) from public.heats x where x.contest_id = c.id and x.round = h.round) = 1 as final
    from public.contests c
    join public.entrants e on e.contest_id = c.id and e.user_id = (select id from me)
    join public.heat_entries he on he.entrant_id = e.id
    join public.heats h on h.id = he.heat_id
    where c.visibility = 'public' and c.state = 'done'
    order by c.id, h.round desc
  )
  select c.code, c.name, c.ended_at, c.spot ->> 'wave', c.spot ->> 'name',
         (select count(*)::int from public.entrants x where x.contest_id = c.id), l.round, l.final, l.place, l.total,
         (select r.video_path from public.recaps r where r.contest_id = c.id)
  from last_heat l join public.contests c on c.id = l.contest_id
  order by c.ended_at desc nulls last
  limit 50
$$;
revoke all on function public.profile_results(text) from public;
grant execute on function public.profile_results(text) to anon, authenticated;
