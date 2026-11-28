-- Open contests, step 3: the host of an invite-only contest joins it without an invite (they surf too, as in Live).
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
    if c.entry = 'invite' and c.host is distinct from uid and not exists (select 1 from public.invites i where i.contest_id = c.id and i.user_id = uid) then
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
