-- Cloud breaks (plan: plans/2026-11-23-accounts-and-paid-plans.md, task 7): My Breaks in the builder.
--
-- A break is the builder's design (`design`: its blocks, coast, swell, board, water... as the builder keeps it) and, when
-- the design makes a wave you can ride, the ride DROP IN hands the game (`ride`: src/builder/loop.js wavePayload), so
-- `index.html?break=<id>` surfs it without the builder. A map thumbnail goes in Storage (bucket `breaks`,
-- <owner>/<id>.webp).
--
-- Who sees one: `private` only you; `unlisted` anyone with its id (get_break); `public` anyone, and listed (your profile,
-- task 14). Saving, changing and making thumbnails need Pro. When Pro lapses nothing is deleted: you can still see,
-- surf and delete your breaks, and change nothing until you renew.

create table public.breaks (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null constraint break_name_length check (char_length(btrim(name)) between 1 and 40),
  design jsonb not null constraint design_size check (pg_column_size(design) < 200000),
  ride jsonb constraint ride_size check (ride is null or pg_column_size(ride) < 200000),
  visibility text not null default 'private' check (visibility in ('private', 'unlisted', 'public')),
  thumb_path text,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index breaks_owner on public.breaks (owner, updated_at desc);
create index breaks_public on public.breaks (owner) where visibility = 'public';

alter table public.breaks enable row level security;

create policy "your breaks, and public ones" on public.breaks
  for select to anon, authenticated
  using (owner = (select auth.uid()) or visibility = 'public');

create policy "Pro saves breaks" on public.breaks
  for insert to authenticated
  with check (owner = (select auth.uid()) and private.user_has_entitlement((select auth.uid()), 'pro'));

create policy "Pro changes their breaks" on public.breaks
  for update to authenticated
  using (owner = (select auth.uid()))
  with check (owner = (select auth.uid()) and private.user_has_entitlement((select auth.uid()), 'pro'));

create policy "you delete your breaks" on public.breaks
  for delete to authenticated
  using (owner = (select auth.uid()));

revoke all on public.breaks from anon, authenticated;
grant select on public.breaks to anon, authenticated;
grant insert (id, name, design, ride, visibility, thumb_path) on public.breaks to authenticated;
grant update (name, design, ride, visibility, thumb_path) on public.breaks to authenticated;
grant delete on public.breaks to authenticated;

-- Names stay clean (as handles do), the version counts saves, the time is the database's; and a limit on how many.
create function private.breaks_before()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.name := btrim(new.name);
  if private.text_blocked(new.name) then
    raise exception 'break_name_blocked' using errcode = '23514', constraint = 'break_name_blocked';
  end if;
  if tg_op = 'INSERT' then
    if (select count(*) from public.breaks b where b.owner = new.owner) >= 200 then
      raise exception 'too_many_breaks' using errcode = '23514', constraint = 'too_many_breaks';
    end if;
  else
    new.updated_at := now();
    if new.design is distinct from old.design or new.ride is distinct from old.ride then new.version := old.version + 1; end if;
  end if;
  return new;
end;
$$;

-- (the server's own role, service_role, runs these triggers too, for admin fixes and Edge Functions: it couldn't call the
-- name check, so it couldn't change a break or a profile)
grant usage on schema private to service_role;
grant execute on function private.text_blocked(text) to service_role;

create trigger breaks_before before insert or update on public.breaks
  for each row execute function private.breaks_before();

-- One break by id: yours, or anyone's unlisted or public one (an unlisted link works; a private one is nobody else's).
-- With its owner's handle, for "by @handle".
create function public.get_break(break_id uuid)
returns table (id uuid, owner uuid, handle text, name text, design jsonb, ride jsonb, visibility text, thumb_path text,
               version int, created_at timestamptz, updated_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select b.id, b.owner, p.handle, b.name, b.design, b.ride, b.visibility, b.thumb_path, b.version, b.created_at, b.updated_at
  from public.breaks b left join public.profiles p on p.id = b.owner
  where b.id = break_id and (b.owner = auth.uid() or b.visibility in ('unlisted', 'public'))
$$;

revoke all on function public.get_break(uuid) from public;
grant execute on function public.get_break(uuid) to anon, authenticated;

-- Thumbnails: a public bucket (a thumbnail's path has the break's id in it, so a private break's can't be guessed), images
-- only, small. You write only in your own folder, and only with Pro; you can delete yours any time.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('breaks', 'breaks', true, 300000, array['image/webp', 'image/png', 'image/jpeg'])
on conflict (id) do nothing;

create policy "break thumbnails: Pro writes in their folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'breaks' and (storage.foldername(name))[1] = (select auth.uid())::text
              and private.user_has_entitlement((select auth.uid()), 'pro'));

create policy "break thumbnails: Pro replaces theirs" on storage.objects
  for update to authenticated
  using (bucket_id = 'breaks' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'breaks' and (storage.foldername(name))[1] = (select auth.uid())::text
              and private.user_has_entitlement((select auth.uid()), 'pro'));

create policy "break thumbnails: you delete yours" on storage.objects
  for delete to authenticated
  using (bucket_id = 'breaks' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- (upsert reads the object first: let you see your own folder's rows; the public bucket serves the images to everyone)
create policy "break thumbnails: you see yours" on storage.objects
  for select to authenticated
  using (bucket_id = 'breaks' and (storage.foldername(name))[1] = (select auth.uid())::text);
