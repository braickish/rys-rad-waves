-- Entitlements (plan: plans/2026-11-23-accounts-and-paid-plans.md, task 6): what you've paid for. The database decides;
-- the client only follows.
--
--   wave_pass: $5 once, every non-Pro wave for life (expires_at null).
--   pro:       $3 a month: the Wave Pass and saving breaks, hosting contests, styling, recaps. expires_at is the end of the
--              paid period; a failed renewal keeps it for a 3-day grace period. Cancelled: it runs to the end of the
--              period, no grace. Refunded: never counts.
--
-- Only the database's own roles write it (the Stripe webhook later, and grants by hand now:
-- `select private.grant_entitlement('someone@example.com', 'pro', interval '30 days');`). You can read your own rows.

create table public.entitlements (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('wave_pass', 'pro')),
  source text not null check (source in ('stripe', 'apple', 'grant')),
  status text not null default 'active' check (status in ('active', 'past_due', 'canceled', 'refunded')),
  expires_at timestamptz, -- (null: for life; the Wave Pass)
  external_id text,       -- (Stripe's subscription or payment id, Apple's transaction id)
  note text,              -- (why it was granted by hand)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pro_expires check (kind <> 'pro' or expires_at is not null)
);

create index entitlements_user on public.entitlements (user_id);
create unique index entitlements_external on public.entitlements (source, external_id) where external_id is not null;

alter table public.entitlements enable row level security;

create policy "you read your own entitlements" on public.entitlements
  for select to authenticated using (user_id = (select auth.uid()));

revoke all on public.entitlements from anon, authenticated;
grant select on public.entitlements to authenticated;

create trigger entitlements_touch before update on public.entitlements
  for each row execute function private.touch_updated_at();

-- The grace period after a failed renewal.
create function private.entitlement_grace()
returns interval
language sql
immutable
set search_path = ''
as $$ select interval '3 days' $$;

-- Does this row count right now?
create function private.entitlement_counts(e public.entitlements)
returns boolean
language sql
stable
set search_path = ''
as $$
  select case
    when e.status = 'refunded' then false
    when e.expires_at is null then true
    when e.status = 'canceled' then e.expires_at > now()
    else e.expires_at + private.entitlement_grace() > now() -- (active or past_due: the grace period after the end)
  end
$$;

-- Pro counts as a Wave Pass. private.user_has_entitlement(uid, kind) is for the database's own checks (RLS and the
-- functions: saving a break, create_contest, ...); has_entitlement(kind) asks only about you.
create function private.user_has_entitlement(uid uuid, want text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select uid is not null and exists (
    select 1 from public.entitlements e
    where e.user_id = uid
      and (e.kind = want or (want = 'wave_pass' and e.kind = 'pro'))
      and private.entitlement_counts(e)
  )
$$;

revoke all on function private.user_has_entitlement(uuid, text) from public;
grant execute on function private.user_has_entitlement(uuid, text) to authenticated; -- (for RLS policies; only answers yes/no)

create function public.has_entitlement(want text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select private.user_has_entitlement(auth.uid(), want) $$;

revoke all on function public.has_entitlement(text) from public;
grant execute on function public.has_entitlement(text) to anon, authenticated;

-- Your plan, for the game: { wave_pass, pro, pro_until, grace } (signed out or a guest: all false).
create function public.my_plan()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'wave_pass', public.has_entitlement('wave_pass'),
    'pro', public.has_entitlement('pro'),
    'pro_until', (select max(e.expires_at) from public.entitlements e
                  where e.user_id = auth.uid() and e.kind = 'pro' and private.entitlement_counts(e)),
    'grace', exists (select 1 from public.entitlements e
                     where e.user_id = auth.uid() and e.kind = 'pro' and private.entitlement_counts(e)
                       and e.expires_at < now())
  )
$$;

revoke all on function public.my_plan() from public;
grant execute on function public.my_plan() to anon, authenticated;

-- Granting by hand (testers, friends, support), from the SQL editor or the CLI as the database owner. The Wave Pass is
-- for life; Pro takes how long (30 days if not said).
create function private.grant_entitlement(email text, want text, how_long interval default null, why text default null)
returns public.entitlements
language plpgsql
set search_path = ''
as $$
declare
  uid uuid;
  row public.entitlements;
begin
  select id into uid from auth.users u where lower(u.email) = lower(grant_entitlement.email);
  if uid is null then
    raise exception 'no user with email %', email;
  end if;
  insert into public.entitlements (user_id, kind, source, expires_at, note)
  values (uid, want, 'grant',
          case when want = 'pro' then now() + coalesce(how_long, interval '30 days') when how_long is not null then now() + how_long end,
          coalesce(why, 'granted by hand'))
  returning * into row;
  return row;
end;
$$;

revoke all on function private.grant_entitlement(text, text, interval, text) from public, anon, authenticated;
