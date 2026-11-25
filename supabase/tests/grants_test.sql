-- npm run test:db: free access by hand (private.grant_entitlement / private.revoke_grant). Revoking ends granted rows
-- now (Pro and the Wave Pass, which has no end date), leaves bought ones alone, and only the database owner can do either.
begin;
select plan(9);

insert into auth.users (id, email, aud, role, is_anonymous) values
  ('f0000000-0000-0000-0000-000000000001', 'comped@example.com', 'authenticated', 'authenticated', false),
  ('f0000000-0000-0000-0000-000000000002', 'payer@example.com', 'authenticated', 'authenticated', false);
select private.grant_entitlement('comped@example.com', 'pro', interval '100 years', 'beta tester');
select private.grant_entitlement('comped@example.com', 'wave_pass');
insert into public.entitlements (user_id, kind, source, external_id, expires_at)
  values ('f0000000-0000-0000-0000-000000000002', 'pro', 'stripe', 'sub_test_1', now() + interval '20 days');

select ok(private.user_has_entitlement('f0000000-0000-0000-0000-000000000001', 'pro'), 'granted Pro counts');
select is(private.revoke_grant('COMPED@example.com', 'pro'), 1, 'revoke Pro (any case email): one row ended');
select ok(not private.user_has_entitlement('f0000000-0000-0000-0000-000000000001', 'pro'), '... Pro no longer counts');
select ok(private.user_has_entitlement('f0000000-0000-0000-0000-000000000001', 'wave_pass'), '... the granted Wave Pass still does');
select is(private.revoke_grant('comped@example.com'), 1, 'revoke the rest: the Wave Pass');
select ok(not private.user_has_entitlement('f0000000-0000-0000-0000-000000000001', 'wave_pass'), '... a revoked Wave Pass doesn''t count either');
select is(private.revoke_grant('payer@example.com'), 0, 'bought Pro isn''t a grant: nothing revoked');
select throws_ok($$ select private.revoke_grant('nobody@example.com') $$, 'P0001', null, 'no such user');

select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims', '{"sub":"f0000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok($$ select private.revoke_grant('payer@example.com') $$, '42501', null, 'players can''t call it');

select * from finish();
rollback;
