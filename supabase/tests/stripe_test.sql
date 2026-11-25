-- npm run test:db: the Stripe side of entitlements (accounts plan task 8). Only service_role (the Edge Functions) can
-- call these; a payment or subscription is one row, kept in step; a refund sticks until a later period is paid; and
-- you can't delete your account while Pro is still renewing.
begin;
select plan(25);

insert into auth.users (id, email, aud, role, is_anonymous) values
  ('b0000000-0000-0000-0000-000000000001', 'buyer@example.com', 'authenticated', 'authenticated', false),
  ('b0000000-0000-0000-0000-000000000002', 'pro@example.com', 'authenticated', 'authenticated', false);

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true)
$$;
create function pg_temp.as_service() returns void language sql as $$
  select set_config('role', 'service_role', true), set_config('request.jwt.claims', '{"role":"service_role"}', true)
$$;
create function pg_temp.as_owner() returns void language sql as $$
  select set_config('role', 'postgres', true), set_config('request.jwt.claims', '', true)
$$;

-- Nobody but service_role.
select pg_temp.act_as('b0000000-0000-0000-0000-000000000001');
select throws_ok($$ select public.stripe_put_entitlement('b0000000-0000-0000-0000-000000000001', 'wave_pass', 'pi_x', 'active', null) $$,
  '42501', null, 'a player cannot write their own entitlement');
select throws_ok($$ select public.stripe_link_customer('b0000000-0000-0000-0000-000000000001', 'cus_x') $$, '42501', null, '... or link a customer');
select throws_ok($$ select public.stripe_refund('pi_x') $$, '42501', null, '... or refund');
select throws_ok($$ select public.stripe_customer_of('b0000000-0000-0000-0000-000000000002') $$, '42501', null, '... or look up customers');
set local role anon;
select throws_ok($$ select public.stripe_has_renewing_pro('b0000000-0000-0000-0000-000000000002') $$, '42501', null, 'nor can anon');

-- Customers.
select pg_temp.as_service();
select lives_ok($$ select public.stripe_link_customer('b0000000-0000-0000-0000-000000000001', 'cus_buyer') $$, 'link a customer');
select is(public.stripe_customer_of('b0000000-0000-0000-0000-000000000001'), 'cus_buyer', 'customer of the user');
select is(public.stripe_user_of('cus_buyer'), 'b0000000-0000-0000-0000-000000000001'::uuid, 'user of the customer');

-- A player this database doesn't have (another database's test, sharing the sandbox): nothing written, no error.
select is((public.stripe_put_entitlement('c0000000-0000-0000-0000-00000000000f', 'wave_pass', 'pi_elsewhere', 'active', null)).id, null,
  'a user who is not here: no row, no error');

-- A Wave Pass: once per payment, however many times the webhook comes.
select public.stripe_put_entitlement('b0000000-0000-0000-0000-000000000001', 'wave_pass', 'pi_1', 'active', null);
select public.stripe_put_entitlement('b0000000-0000-0000-0000-000000000001', 'wave_pass', 'pi_1', 'active', null);
select is((select count(*)::int from public.entitlements where external_id = 'pi_1'), 1, 'the same payment twice is one row');
select pg_temp.as_owner();
select ok(private.user_has_entitlement('b0000000-0000-0000-0000-000000000001', 'wave_pass'), 'the Wave Pass counts');

-- Refunded: it stops counting, and a late duplicate webhook doesn't bring it back.
select pg_temp.as_service();
select is(public.stripe_refund('pi_1'), 1, 'refund the payment');
select public.stripe_put_entitlement('b0000000-0000-0000-0000-000000000001', 'wave_pass', 'pi_1', 'active', null);
select pg_temp.as_owner();
select is((select status from public.entitlements where external_id = 'pi_1'), 'refunded', 'a repeat of the purchase webhook leaves it refunded');
select ok(not private.user_has_entitlement('b0000000-0000-0000-0000-000000000001', 'wave_pass'), 'a refunded Wave Pass does not count');

-- Pro: bought, renewed, failed, cancelled.
select pg_temp.as_service();
select public.stripe_put_entitlement('b0000000-0000-0000-0000-000000000002', 'pro', 'sub_1', 'active', now() + interval '30 days');
select ok(public.stripe_has_renewing_pro('b0000000-0000-0000-0000-000000000002'), 'Pro renewing');
select public.stripe_put_entitlement('b0000000-0000-0000-0000-000000000002', 'pro', 'sub_1', 'active', now() + interval '60 days');
select pg_temp.as_owner();
select ok((select expires_at > now() + interval '59 days' from public.entitlements where external_id = 'sub_1'), 'renewed: the same row runs on');

-- Deleting the account waits while it renews.
select pg_temp.act_as('b0000000-0000-0000-0000-000000000002');
select throws_ok($$ select public.delete_my_account() $$, 'P0001', 'cancel Pro first', 'no deleting while Pro renews');

-- The renewal fails: past_due from the start of the unpaid period; 3 days' grace.
select pg_temp.as_service();
select public.stripe_put_entitlement('b0000000-0000-0000-0000-000000000002', 'pro', 'sub_1', 'past_due', now() - interval '1 day');
select pg_temp.as_owner();
select ok(private.user_has_entitlement('b0000000-0000-0000-0000-000000000002', 'pro'), 'past due a day: still Pro (grace)');
select pg_temp.as_service();
select public.stripe_put_entitlement('b0000000-0000-0000-0000-000000000002', 'pro', 'sub_1', 'past_due', now() - interval '4 days');
select pg_temp.as_owner();
select ok(not private.user_has_entitlement('b0000000-0000-0000-0000-000000000002', 'pro'), 'past due four days: not Pro');

-- Paid after all, then set to cancel at the end of the period: Pro to the end, and the account can go.
select pg_temp.as_service();
select public.stripe_put_entitlement('b0000000-0000-0000-0000-000000000002', 'pro', 'sub_1', 'canceled', now() + interval '20 days');
select ok(not public.stripe_has_renewing_pro('b0000000-0000-0000-0000-000000000002'), 'cancelled: not renewing');
select pg_temp.as_owner();
select ok(private.user_has_entitlement('b0000000-0000-0000-0000-000000000002', 'pro'), '... but Pro to the end of the period');

-- A refunded month: Pro stops, a repeat of the same period doesn't undo it, a later paid period does.
select pg_temp.as_service();
select public.stripe_put_entitlement('b0000000-0000-0000-0000-000000000002', 'pro', 'sub_1', 'active', now() + interval '20 days');
select public.stripe_refund('sub_1');
select public.stripe_put_entitlement('b0000000-0000-0000-0000-000000000002', 'pro', 'sub_1', 'active', now() + interval '20 days');
select pg_temp.as_owner();
select ok(not private.user_has_entitlement('b0000000-0000-0000-0000-000000000002', 'pro'), 'refunded Pro does not count, even after a repeat sync');
select pg_temp.as_service();
select public.stripe_put_entitlement('b0000000-0000-0000-0000-000000000002', 'pro', 'sub_1', 'active', now() + interval '50 days');
select pg_temp.as_owner();
select ok(private.user_has_entitlement('b0000000-0000-0000-0000-000000000002', 'pro'), 'a later paid period brings it back');

-- Ended; then the account can be deleted, and its customer link goes with it.
select pg_temp.as_service();
select public.stripe_put_entitlement('b0000000-0000-0000-0000-000000000002', 'pro', 'sub_1', 'canceled', now());
select public.stripe_link_customer('b0000000-0000-0000-0000-000000000002', 'cus_pro');
select pg_temp.act_as('b0000000-0000-0000-0000-000000000002');
select lives_ok($$ select public.delete_my_account() $$, 'ended: the account can be deleted');
select pg_temp.as_service();
select is(public.stripe_user_of('cus_pro'), null, '... and the customer link is gone with it');

select * from finish();
rollback;
