-- Taking back free access given by hand (the other half of private.grant_entitlement; the user, 2026-11-25). Ends that
-- person's granted rows now, of one kind or (want null) both. Bought ones (Stripe, Apple) are never touched: refunds
-- and cancellations go through Stripe. Answers how many rows it ended (0: they had nothing granted that counted).
--
--   select private.revoke_grant('friend@example.com', 'pro');
--   select private.revoke_grant('friend@example.com');          -- every grant they have
create function private.revoke_grant(email text, want text default null)
returns int
language plpgsql
set search_path = ''
as $$
declare
  uid uuid;
  n int;
begin
  select id into uid from auth.users u where lower(u.email) = lower(revoke_grant.email);
  if uid is null then
    raise exception 'no user with email %', email;
  end if;
  -- (cancelled and ended now: a cancelled row counts until its end, and a Wave Pass has none)
  update public.entitlements e
     set status = 'canceled', expires_at = now(), note = coalesce(e.note, '') || ' (revoked ' || now()::date || ')'
   where e.user_id = uid and e.source = 'grant' and (want is null or e.kind = want) and private.entitlement_counts(e);
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function private.revoke_grant(text, text) from public, anon, authenticated;
