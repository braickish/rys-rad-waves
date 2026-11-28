-- npm run test:db: Open contests, step 4 (plans/2026-11-27-open-contests.md): invites by email. The host invites an
-- address; whoever signs in with it sees the contest and can join; claiming the email is the host's, once a day.
begin;
select plan(17);

insert into auth.users (id, email, aud, role, is_anonymous) values
  ('c5000000-0000-0000-0000-000000000001', 'ehost@example.com', 'authenticated', 'authenticated', false),
  ('c5000000-0000-0000-0000-000000000002', 'Friend@Example.com', 'authenticated', 'authenticated', false),
  ('c5000000-0000-0000-0000-000000000003', 'stranger@example.com', 'authenticated', 'authenticated', false);
insert into public.profiles (id, handle) values ('c5000000-0000-0000-0000-000000000001', 'ehost'), ('c5000000-0000-0000-0000-000000000002', 'efriend'),
  ('c5000000-0000-0000-0000-000000000003', 'estranger');
select private.grant_entitlement('ehost@example.com', 'pro', interval '30 days');
create function pg_temp.as_user(i int) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', 'c5000000-0000-0000-0000-' || lpad(i::text, 12, '0'), 'role', 'authenticated')::text, true)
$$;
create temp table t (k text primary key, v text);
grant all on t to authenticated;

select pg_temp.as_user(1);
insert into t select 'c', (public.create_contest('Mail Comp', wave => 'point', end_minutes => 10, mode => 'open')).id;
select throws_ok($$ select public.invite_by_email((select v::uuid from t where k = 'c'), 'not an email') $$, '22023', 'bad_email', 'an email address');
insert into t select 'i', (public.invite_by_email((select v::uuid from t where k = 'c'), '  FRIEND@example.COM ')).id;
select is((select email from public.invites where id = (select v::uuid from t where k = 'i')), 'friend@example.com', 'kept in lower case');
select is((public.invite_by_email((select v::uuid from t where k = 'c'), 'friend@example.com')).id, (select v::uuid from t where k = 'i'), 'again: the same invite');
select is((public.claim_invite_email((select v::uuid from t where k = 'i'))) ->> 'code', (select code from public.contests where id = (select v::uuid from t where k = 'c')), 'the host claims the email: what it says');
select ok((select emailed_at = now() from public.invites where id = (select v::uuid from t where k = 'i')), '... marked sent');
select throws_ok($$ select public.claim_invite_email((select v::uuid from t where k = 'i')) $$, '55000', 'emailed_already', 'once a day');
select public.invite_email_failed((select v::uuid from t where k = 'i'));
select lives_ok($$ select public.claim_invite_email((select v::uuid from t where k = 'i')) $$, 'a failed send can be tried again');

select pg_temp.as_user(3);
select throws_ok($$ select public.invite_by_email((select v::uuid from t where k = 'c'), 'x@example.com') $$, '42501', 'not_host', 'only the host invites');
select throws_ok($$ select public.claim_invite_email((select v::uuid from t where k = 'i')) $$, '42501', 'not_host', 'only the host sends');
set local role authenticated;
select is((select count(*)::int from public.contests where id = (select v::uuid from t where k = 'c')), 0, 'someone else can''t see it');
select is((select count(*)::int from public.invites), 0, '... nor the invites');
reset role;
select throws_ok($$ select public.join_contest((select code from public.contests where id = (select v::uuid from t where k = 'c'))) $$, '42501', 'invite_only', '... nor join');

select pg_temp.as_user(2);
set local role authenticated;
select is((select count(*)::int from public.contests where id = (select v::uuid from t where k = 'c')), 1, 'signed in with the invited email (any case): you see the contest');
select is((select count(*)::int from public.invites), 1, '... and your invite');
reset role;
select is((public.join_contest((select code from public.contests where id = (select v::uuid from t where k = 'c')))).name, 'efriend', 'and join, as your username');
select ok((select accepted_at is not null from public.invites where id = (select v::uuid from t where k = 'i')), 'the invite is taken');

select pg_temp.as_user(1);
select public.join_contest((select code from public.contests where id = (select v::uuid from t where k = 'c')));
select public.start_contest((select v::uuid from t where k = 'c'));
select throws_ok($$ select public.invite_by_email((select v::uuid from t where k = 'c'), 'late@example.com') $$, '55000', 'contest_started', 'no invites once it''s started');

select * from finish();
rollback;
