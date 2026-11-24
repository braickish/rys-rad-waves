-- Profiles (plan: plans/2026-11-23-accounts-and-paid-plans.md, task 5).
--
-- One row a member (anonymous contest guests have none until they claim an email). Public: anyone can read a profile,
-- which is what profile.html?u=<handle> shows. Only you can make or change yours.
--
-- Handles: 3-20 characters, lowercase letters, digits and _, starting with a letter. Two handles that look alike are
-- the same handle: 0/o, 1/l/i and 5/s count as one letter and _ is ignored (so ry_rad clashes with ryrad, and kai1
-- with kail and kai_i). A reserved list keeps official-looking names free (compared the same way: adm1n is admin).

-- The look-alike key: what a handle collides on.
create function private.handle_key(h text)
returns text
language sql
immutable
set search_path = ''
as $$ select translate(lower(h), '01i5_', 'olls') $$;

create function private.handle_reserved(h text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select private.handle_key(h) in (select private.handle_key(r) from unnest(array[
    'admin', 'administrator', 'root', 'support', 'help', 'howdy', 'hello', 'staff', 'team', 'mod', 'moderator',
    'official', 'ry', 'rys', 'rysradwaves', 'radwaves', 'rrw', 'api', 'www', 'mail', 'email', 'account', 'accounts',
    'profile', 'profiles', 'settings', 'contest', 'contests', 'heat', 'heats', 'break', 'breaks', 'builder', 'login',
    'signin', 'signup', 'logout', 'signout', 'billing', 'pro', 'pass', 'wavepass', 'null', 'undefined', 'anonymous',
    'guest', 'you', 'me', 'everyone', 'system', 'supabase', 'stripe', 'apple', 'judge', 'judges', 'bot', 'bots'
  ]::text[]) r)
$$;

grant usage on schema private to anon, authenticated;
grant execute on function private.handle_key(text), private.handle_reserved(text) to anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  handle text not null
    constraint handle_format check (handle ~ '^[a-z][a-z0-9_]{2,19}$')
    constraint handle_not_reserved check (not private.handle_reserved(handle)),
  display_name text
    constraint display_name_length check (display_name is null or char_length(display_name) between 1 and 30),
  jersey text not null default 'red'
    constraint jersey_colour check (jersey in ('red', 'white', 'blue', 'yellow', 'green', 'black', 'pink', 'teal')),
  styling jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index profiles_handle_key on public.profiles (private.handle_key(handle));

alter table public.profiles enable row level security;

create policy "profiles are public" on public.profiles
  for select to anon, authenticated using (true);

-- (auth.jwt() ->> 'is_anonymous': a contest guest's session; they get a profile when they claim an email)
create policy "members make their own profile" on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid()) and coalesce((select auth.jwt() ->> 'is_anonymous')::boolean, false) = false);

create policy "members change their own profile" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Columns a member may write; id, styling (Pro, later) and the times are the database's.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to anon, authenticated;
grant insert (id, handle, display_name, jersey) on public.profiles to authenticated;
grant update (handle, display_name, jersey) on public.profiles to authenticated;

create function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function private.touch_updated_at();

-- Why a handle can't be used, for the form as you type: null when it's fine, else one of
-- 'short' | 'long' | 'chars' | 'start' | 'reserved' | 'taken'. Your own current handle is fine.
create function public.handle_problem(h text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when char_length(h) < 3 then 'short'
    when char_length(h) > 20 then 'long'
    when h !~ '^[a-z0-9_]+$' then 'chars'
    when h !~ '^[a-z]' then 'start'
    when private.handle_reserved(h) then 'reserved'
    when exists (select 1 from public.profiles p
                 where private.handle_key(p.handle) = private.handle_key(h) and p.id is distinct from auth.uid()) then 'taken'
  end
$$;

revoke all on function public.handle_problem(text) from public;
grant execute on function public.handle_problem(text) to anon, authenticated;

-- Deleting your account (Apple requires it in-app; the web has it too): the auth user goes, and with it the profile
-- and everything else that references it (on delete cascade).
create function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
