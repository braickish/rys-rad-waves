-- npm run test:db: entitlements (accounts plan task 6). You can't write your own, you read only yours, Pro is a Wave
-- Pass too, and an expired one stops counting after the grace period (a cancelled one at its end, a refund at once).
begin;
select plan(17);

insert into auth.users (id, email, aud, role, is_anonymous) values
  ('a0000000-0000-0000-0000-000000000001', 'pass@example.com', 'authenticated', 'authenticated', false),
  ('a0000000-0000-0000-0000-000000000002', 'pro@example.com', 'authenticated', 'authenticated', false),
  ('a0000000-0000-0000-0000-000000000003', 'free@example.com', 'authenticated', 'authenticated', false),
  ('a0000000-0000-0000-0000-000000000004', 'late@example.com', 'authenticated', 'authenticated', false);

select lives_ok($$ select private.grant_entitlement('PASS@example.com', 'wave_pass') $$, 'grant a Wave Pass by hand (any case email)');
select is((select expires_at from public.entitlements where user_id = 'a0000000-0000-0000-0000-000000000001'), null, '... for life');
select lives_ok($$ select private.grant_entitlement('pro@example.com', 'pro', interval '30 days', 'tester') $$, 'grant Pro for 30 days');
select throws_ok($$ select private.grant_entitlement('nobody@example.com', 'pro') $$, 'P0001', null, 'no such user');

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true)
$$;

-- What each one has.
select pg_temp.act_as('a0000000-0000-0000-0000-000000000001');
select is(public.my_plan() - 'pro_until', '{"wave_pass": true, "pro": false, "grace": false}'::jsonb, 'Wave Pass: waves, not Pro');
select is((select count(*)::int from public.entitlements), 1, 'you read only your own rows');
select throws_ok($$ insert into public.entitlements (user_id, kind, source) values ('a0000000-0000-0000-0000-000000000001', 'pro', 'grant') $$, '42501', null, 'you can''t grant yourself Pro');
select throws_ok($$ update public.entitlements set status = 'active' $$, '42501', null, '... or change your rows');
select throws_ok($$ select private.grant_entitlement('pass@example.com', 'pro') $$, '42501', null, '... or call the grant');

select pg_temp.act_as('a0000000-0000-0000-0000-000000000002');
select is(public.my_plan() - 'pro_until', '{"wave_pass": true, "pro": true, "grace": false}'::jsonb, 'Pro is a Wave Pass too');
select ok((public.my_plan() ->> 'pro_until')::timestamptz between now() + interval '29 days' and now() + interval '31 days', 'pro_until is the end of the period');

select pg_temp.act_as('a0000000-0000-0000-0000-000000000003');
select is(public.my_plan() - 'pro_until', '{"wave_pass": false, "pro": false, "grace": false}'::jsonb, 'free: nothing');

select set_config('role', 'anon', true), set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(public.my_plan() - 'pro_until', '{"wave_pass": false, "pro": false, "grace": false}'::jsonb, 'signed out: nothing');

-- Time running out (rows written as the database).
reset role;
insert into public.entitlements (user_id, kind, source, status, expires_at) values
  ('a0000000-0000-0000-0000-000000000004', 'pro', 'stripe', 'past_due', now() - interval '2 days');
select pg_temp.act_as('a0000000-0000-0000-0000-000000000004');
select is(public.my_plan() - 'pro_until', '{"wave_pass": true, "pro": true, "grace": true}'::jsonb, 'a failed renewal 2 days ago: still Pro, in the grace period');
reset role;
update public.entitlements set expires_at = now() - interval '4 days' where user_id = 'a0000000-0000-0000-0000-000000000004';
select pg_temp.act_as('a0000000-0000-0000-0000-000000000004');
select is(public.has_entitlement('pro'), false, '4 days: past the grace period, not Pro');
reset role;
update public.entitlements set status = 'canceled', expires_at = now() - interval '1 hour' where user_id = 'a0000000-0000-0000-0000-000000000004';
select pg_temp.act_as('a0000000-0000-0000-0000-000000000004');
select is(public.has_entitlement('pro'), false, 'cancelled: ends at the end of the period, no grace');
reset role;
update public.entitlements set status = 'refunded' where user_id = 'a0000000-0000-0000-0000-000000000001';
select pg_temp.act_as('a0000000-0000-0000-0000-000000000001');
select is(public.has_entitlement('wave_pass'), false, 'a refunded Wave Pass doesn''t count');

select * from finish();
rollback;
