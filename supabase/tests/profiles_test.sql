-- npm run test:db: profiles (accounts plan task 5). RLS (read anyone's, write only your own), handle rules, look-alikes,
-- the reserved list, anonymous guests, and deleting your account.
begin;
select plan(24);

insert into auth.users (id, email, aud, role, is_anonymous) values
  ('11111111-1111-1111-1111-111111111111', 'ana@example.com', 'authenticated', 'authenticated', false),
  ('22222222-2222-2222-2222-222222222222', 'bo@example.com', 'authenticated', 'authenticated', false),
  ('33333333-3333-3333-3333-333333333333', null, 'authenticated', 'authenticated', true);

-- Acting as a user: the role and the JWT claims RLS reads.
create function pg_temp.act_as(uid uuid, anon boolean default false) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated', 'is_anonymous', anon)::text, true)
$$;
create function pg_temp.act_as_visitor() returns void language sql as $$
  select set_config('role', 'anon', true), set_config('request.jwt.claims', '{"role":"anon"}', true)
$$;

-- Ana makes hers.
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
select lives_ok($$ insert into public.profiles (id, handle, display_name, jersey) values ('11111111-1111-1111-1111-111111111111', 'ana_rides', 'Ana', 'teal') $$,
  'a member makes their own profile');
select throws_ok($$ insert into public.profiles (id, handle) values ('22222222-2222-2222-2222-222222222222', 'bo_by_ana') $$,
  '42501', null, '... but not someone else''s');
select throws_ok($$ insert into public.profiles (id, handle) values ('11111111-1111-1111-1111-111111111111', 'ana_again') $$,
  '23505', null, '... and only one');

-- Bo, and the handle rules.
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
select throws_ok($$ insert into public.profiles (id, handle) values ('22222222-2222-2222-2222-222222222222', 'bo') $$, '23514', null, 'too short');
select throws_ok($$ insert into public.profiles (id, handle) values ('22222222-2222-2222-2222-222222222222', 'b' || repeat('o', 20)) $$, '23514', null, 'too long');
select throws_ok($$ insert into public.profiles (id, handle) values ('22222222-2222-2222-2222-222222222222', 'Bo_Rides') $$, '23514', null, 'no capitals');
select throws_ok($$ insert into public.profiles (id, handle) values ('22222222-2222-2222-2222-222222222222', 'bo-rides') $$, '23514', null, 'no hyphens');
select throws_ok($$ insert into public.profiles (id, handle) values ('22222222-2222-2222-2222-222222222222', '9bo') $$, '23514', null, 'starts with a letter');
select throws_ok($$ insert into public.profiles (id, handle) values ('22222222-2222-2222-2222-222222222222', 'adm1n') $$, '23514', null, 'reserved, look-alikes too (adm1n)');
select throws_ok($$ insert into public.profiles (id, handle) values ('22222222-2222-2222-2222-222222222222', 'anarides') $$, '23505', null, 'a look-alike of a taken handle (anarides ~ ana_rides)');
select throws_ok($$ insert into public.profiles (id, handle) values ('22222222-2222-2222-2222-222222222222', 'ana_r1des') $$, '23505', null, '... (ana_r1des ~ ana_rides)');
select throws_ok($$ insert into public.profiles (id, handle, jersey) values ('22222222-2222-2222-2222-222222222222', 'bo_rides', 'purple') $$, '23514', null, 'jersey from the list');
select lives_ok($$ insert into public.profiles (id, handle) values ('22222222-2222-2222-2222-222222222222', 'bo_rides') $$, 'a good handle');

-- handle_problem, as the form asks.
select is(public.handle_problem('bo_rides'), null, 'handle_problem: your own handle is fine');
select is(array[public.handle_problem('ab'), public.handle_problem('Ab_c'), public.handle_problem('_abc'), public.handle_problem('support'), public.handle_problem('anarides'), public.handle_problem('new_one')],
  array['short', 'chars', 'start', 'reserved', 'taken', null], 'handle_problem: short, chars, start, reserved, taken, fine');

-- Editing: only your own, only some columns.
update public.profiles set display_name = 'Hacked' where id = '11111111-1111-1111-1111-111111111111';
select pg_temp.act_as_visitor();
select is((select display_name from public.profiles where handle = 'ana_rides'), 'Ana', 'Bo can''t change Ana''s profile (and a visitor reads it)');
select is((select count(*)::int from public.profiles where id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222')), 2, 'profiles are public');
select throws_ok($$ insert into public.profiles (id, handle) values ('11111111-1111-1111-1111-111111111111', 'visitor_x') $$, '42501', null, 'a visitor can''t make one');
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
select lives_ok($$ update public.profiles set display_name = 'Bo', jersey = 'yellow', handle = 'bo_charges' where id = '22222222-2222-2222-2222-222222222222' $$, 'Bo changes his name, jersey and handle');
select throws_ok($$ update public.profiles set styling = '{"x":1}' where id = '22222222-2222-2222-2222-222222222222' $$, '42501', null, 'styling isn''t yours to write (yet)');

-- An anonymous guest gets no profile.
select pg_temp.act_as('33333333-3333-3333-3333-333333333333', true);
select throws_ok($$ insert into public.profiles (id, handle) values ('33333333-3333-3333-3333-333333333333', 'guest_rider') $$, '42501', null, 'an anonymous guest can''t make a profile');

-- Deleting your account.
select pg_temp.act_as_visitor();
select throws_ok($$ select public.delete_my_account() $$, '42501', null, 'a visitor can''t delete anything');
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');
select public.delete_my_account();
reset role;
select is((select count(*)::int from auth.users where id = '22222222-2222-2222-2222-222222222222'), 0, 'delete_my_account: the user is gone ...');
select is((select count(*)::int from public.profiles where id = '22222222-2222-2222-2222-222222222222'), 0, '... and their profile with them');

select * from finish();
rollback;
