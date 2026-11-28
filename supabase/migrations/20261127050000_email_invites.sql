-- Open contests, step 4: invites by email (plans/2026-11-27-open-contests.md). The host invites someone by their email,
-- account or not; the contest-invite Edge Function emails them the link. Whoever signs in with that address is invited:
-- they see the contest, and can join it.
--
-- * invite_by_email(contest, email)  the host, an Open contest in its lobby: the invite (again: the same one)
-- * claim_invite_email(invite)       the host (the Edge Function, as them): what the email says, and marks it sent;
--                                    at most once a day per invite (a resend), and 50 emails a day per host
-- * invite_email_failed(invite)      the host: the send failed, so it can be tried again at once
-- An invite by email never says whether the address has an account. Joining marks every invite of yours accepted (by
-- your user or your email).

alter table public.invites add column emailed_at timestamptz;

create function private.my_email()
returns text
language sql
stable
security definer
set search_path = ''
as $$ select lower(u.email) from auth.users u where u.id = auth.uid() and not coalesce(u.is_anonymous, false) $$;
revoke all on function private.my_email() from public;
grant execute on function private.my_email() to anon, authenticated;

-- (is this invite yours, by your user or your email?)
create function private.invited_me(cid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.invites i where i.contest_id = cid
                 and (i.user_id = auth.uid() or (i.email is not null and i.email = private.my_email())))
$$;
revoke all on function private.invited_me(uuid) from public;
grant execute on function private.invited_me(uuid) to anon, authenticated;

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
           or private.invited_me(c.id))
  )
$$;

drop policy "the host, or who's invited" on public.invites;
create policy "the host, or who's invited" on public.invites for select to authenticated
  using (user_id = (select auth.uid()) or (email is not null and email = (select private.my_email()))
         or exists (select 1 from public.contests c where c.id = contest_id and c.host = (select auth.uid())));

-- ---- invite_by_email ----
create function public.invite_by_email(contest_id uuid, email text)
returns public.invites
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.contests;
  addr text := lower(btrim(coalesce(invite_by_email.email, '')));
  i public.invites;
begin
  select * into c from public.contests x where x.id = invite_by_email.contest_id;
  if not found or c.host is distinct from auth.uid() then perform private.fail('not_host', '42501'); end if;
  if c.mode <> 'open' then perform private.fail('not_open', '22023'); end if;
  if c.state <> 'lobby' then perform private.fail('contest_started', '55000'); end if;
  if addr !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(addr) > 254 then perform private.fail('bad_email', '22023'); end if;
  select * into i from public.invites x where x.contest_id = c.id and x.email = addr;
  if found then return i; end if;
  if (select count(*) from public.invites x where x.contest_id = c.id) >= 64 then perform private.fail('too_many_invites', '23514'); end if;
  insert into public.invites (contest_id, email) values (c.id, addr) returning * into i;
  return i;
end;
$$;

-- ---- claim_invite_email / invite_email_failed ----
create function public.claim_invite_email(invite_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  i public.invites;
  c public.contests;
begin
  select x.* into i from public.invites x where x.id = claim_invite_email.invite_id for update;
  select * into c from public.contests x where x.id = i.contest_id;
  if i.id is null or c.host is distinct from auth.uid() then perform private.fail('not_host', '42501'); end if;
  if i.email is null then perform private.fail('not_an_email_invite', '22023'); end if;
  if c.state <> 'lobby' then perform private.fail('contest_started', '55000'); end if;
  if i.emailed_at > now() - interval '1 day' then perform private.fail('emailed_already', '55000'); end if;
  if (select count(*) from public.invites x join public.contests y on y.id = x.contest_id
      where y.host = auth.uid() and x.emailed_at > now() - interval '1 day') >= 50 then
    perform private.fail('too_many_emails', '23514');
  end if;
  update public.invites x set emailed_at = now() where x.id = i.id;
  return jsonb_build_object('email', i.email, 'code', c.code, 'name', c.name,
    'host', (select p.handle from public.profiles p where p.id = c.host),
    'spot', coalesce(c.spot ->> 'name', c.spot ->> 'wave'), 'signup_ends_at', c.signup_ends_at,
    'end_minutes', c.end_minutes, 'end_waves', c.end_waves, 'round_hours', c.round_hours);
end;
$$;

create function public.invite_email_failed(invite_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.invites i set emailed_at = null from public.contests c
   where i.id = invite_email_failed.invite_id and c.id = i.contest_id and c.host = auth.uid();
end;
$$;
revoke all on function public.invite_by_email(uuid, text), public.claim_invite_email(uuid), public.invite_email_failed(uuid) from public;
grant execute on function public.invite_by_email(uuid, text), public.claim_invite_email(uuid), public.invite_email_failed(uuid) to authenticated;

-- ---- join_contest: an invite by your email counts ----
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
    if c.entry = 'invite' and c.host is distinct from uid and not private.invited_me(c.id) then
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
  update public.invites i set accepted_at = coalesce(i.accepted_at, now())
   where i.contest_id = c.id and (i.user_id = uid or (i.email is not null and i.email = private.my_email()));
  return e;
end;
$$;
