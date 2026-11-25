-- Stripe (plan: plans/2026-11-23-accounts-and-paid-plans.md, task 8). The `checkout` Edge Function sends you to Stripe
-- Checkout (or the Customer Portal); the `stripe-webhook` Edge Function writes `entitlements` from what Stripe says.
-- Both run as service_role, and these functions are theirs alone: nobody else can call them.
--
--   Wave Pass: one row per payment (external_id: the PaymentIntent). A full refund marks it refunded.
--   Pro:       one row per subscription (external_id: the subscription), kept in step with Stripe:
--                active                    -> active,   expires_at = end of the paid period (3 days' grace after)
--                set to cancel at the end  -> canceled, expires_at = end of the paid period (no grace)
--                renewal failed (past_due) -> past_due, expires_at = START of the unpaid period, so the 3 days' grace
--                                             runs from when it should have renewed
--                ended                     -> canceled, expires_at = when it ended
--              A refunded Pro payment marks the row refunded; it comes back only when a later period is paid.

-- Who is which Stripe customer.
create table private.stripe_customers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  customer_id text not null unique,
  created_at timestamptz not null default now()
);

-- Every webhook event handled (for looking back; the handlers are safe to run twice anyway).
create table private.stripe_events (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now()
);

create function public.stripe_customer_of(uid uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$ select customer_id from private.stripe_customers where user_id = uid $$;

create function public.stripe_user_of(customer text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$ select user_id from private.stripe_customers where customer_id = customer $$;

create function public.stripe_link_customer(uid uuid, customer text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into private.stripe_customers (user_id, customer_id) values (uid, customer)
  on conflict (user_id) do update set customer_id = excluded.customer_id
$$;

-- Insert or update the row for this payment or subscription. A user that isn't here (deleted, or a test's from another
-- database sharing the Stripe sandbox) answers null, so the webhook can say so instead of failing and being retried.
create function public.stripe_put_entitlement(uid uuid, want text, external text, new_status text, until timestamptz)
returns public.entitlements
language plpgsql
security definer
set search_path = ''
as $$
declare
  row public.entitlements;
begin
  if not exists (select 1 from auth.users u where u.id = uid) then
    return null;
  end if;
  insert into public.entitlements as e (user_id, kind, source, status, expires_at, external_id)
  values (uid, want, 'stripe', new_status, until, external)
  on conflict (source, external_id) where external_id is not null do update
    set status = case
          -- (a refund sticks until a later period is paid)
          when e.status = 'refunded' and (excluded.expires_at is null or excluded.expires_at <= e.expires_at) then 'refunded'
          else excluded.status
        end,
        expires_at = excluded.expires_at
  returning * into row;
  return row;
end;
$$;

-- A full refund: the row for this payment (Wave Pass) or subscription (Pro) stops counting.
create function public.stripe_refund(external text)
returns int
language sql
security definer
set search_path = ''
as $$
  with r as (
    update public.entitlements set status = 'refunded'
    where source = 'stripe' and external_id = external
    returning 1
  )
  select count(*)::int from r
$$;

create function public.stripe_event_handled(event_id text, event_type text)
returns void
language sql
security definer
set search_path = ''
as $$ insert into private.stripe_events (id, type) values (event_id, event_type) on conflict (id) do nothing $$;

-- Does this user have a Stripe Pro that will renew (not cancelled)? Checkout won't sell a second one, and deleting
-- the account waits until it's cancelled, so nobody keeps paying for an account that's gone.
create function private.user_has_renewing_pro(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.entitlements e
    where e.user_id = uid and e.kind = 'pro' and e.source = 'stripe'
      and e.status in ('active', 'past_due') and private.entitlement_counts(e)
  )
$$;

create function public.stripe_has_renewing_pro(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select private.user_has_renewing_pro(uid) $$;

-- Already has it, so checkout won't sell it: a Wave Pass of any kind (bought or granted; Pro doesn't count here, since
-- Pro can lapse), or a Stripe Pro that still counts (cancelled but running: renew it in Manage billing instead).
create function public.stripe_already_has(uid uuid, want text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.entitlements e
    where e.user_id = uid and e.kind = want and private.entitlement_counts(e)
      and (want = 'wave_pass' or e.source = 'stripe')
  )
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.stripe_customer_of(uuid)', 'public.stripe_user_of(text)', 'public.stripe_link_customer(uuid, text)',
    'public.stripe_put_entitlement(uuid, text, text, text, timestamptz)', 'public.stripe_refund(text)',
    'public.stripe_event_handled(text, text)', 'public.stripe_has_renewing_pro(uuid)',
    'public.stripe_already_has(uuid, text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end;
$$;
revoke all on function private.user_has_renewing_pro(uuid) from public, anon, authenticated;

-- Deleting your account: not while Pro is still renewing (cancel it first, in Manage billing).
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if private.user_has_renewing_pro(auth.uid()) then
    raise exception 'cancel Pro first' using errcode = 'P0001', hint = 'pro_renewing';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;
