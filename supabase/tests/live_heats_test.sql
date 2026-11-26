-- npm run test:db: live heats (accounts plan task 12). finish_heat marks only your own entry; a heat closes as soon as
-- everyone has finished (before the horn's grace); the server's clock; ride logs only in your own folder of a heat you're
-- in, read by whoever can see the heat.
begin;
select plan(11);

insert into auth.users (id, email, aud, role, is_anonymous) values
  ('a1000000-0000-0000-0000-000000000001', 'lhost@example.com', 'authenticated', 'authenticated', false),
  ('a1000000-0000-0000-0000-000000000002', null, 'authenticated', 'authenticated', true),
  ('a1000000-0000-0000-0000-000000000003', 'lout@example.com', 'authenticated', 'authenticated', false);
insert into public.profiles (id, handle) values ('a1000000-0000-0000-0000-000000000001', 'live_host');
select private.grant_entitlement('lhost@example.com', 'pro', interval '30 days');
create function pg_temp.act_as(uid uuid, anon boolean default false) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated', 'is_anonymous', anon)::text, true)
$$;
create temp table t (k text primary key, v text);
grant all on t to authenticated, anon;

select pg_temp.act_as('a1000000-0000-0000-0000-000000000001');
insert into t select 'c', (public.create_contest('Live', wave => 'point', end_minutes => 10)).code;
select public.join_contest((select v from t where k = 'c'));
select pg_temp.act_as('a1000000-0000-0000-0000-000000000002', true);
select public.join_contest((select v from t where k = 'c'), 'Kai');
select pg_temp.act_as('a1000000-0000-0000-0000-000000000001');
insert into t select 'h', (public.start_contest((select id from public.contests where code = (select v from t where k = 'c')))).id;
reset role;
update public.heats set starts_at = now() - interval '60 seconds', ends_at = now() + interval '9 minutes' where id = (select v::uuid from t where k = 'h');

select ok(abs(extract(epoch from public.server_time() - clock_timestamp())) < 1, 'server_time: the server''s clock');

-- finishing
select pg_temp.act_as('a1000000-0000-0000-0000-000000000003');
select throws_ok($$ select public.finish_heat((select v::uuid from t where k = 'h')) $$, '42501', 'not_in_heat', 'an outsider can''t finish');
select pg_temp.act_as('a1000000-0000-0000-0000-000000000002', true);
select public.submit_ride((select v::uuid from t where k = 'h'), 1, 6.5, array[6.5,6.5,6.5,6.5,6.5], 20);
select lives_ok($$ select public.finish_heat((select v::uuid from t where k = 'h')) $$, 'the guest finishes');
select throws_ok($$ select public.close_heat((select v::uuid from t where k = 'h')) $$, '55000', 'heat_still_on', 'the host hasn''t: still on');
select pg_temp.act_as('a1000000-0000-0000-0000-000000000001');
select public.finish_heat((select v::uuid from t where k = 'h'));
select is((select count(*)::int from public.close_heat((select v::uuid from t where k = 'h'))), 2, 'everyone finished: it closes before the horn');
select is((select state from public.contests where code = (select v from t where k = 'c')), 'done', '... and the contest with it');

-- ride logs
select pg_temp.act_as('a1000000-0000-0000-0000-000000000002', true);
select lives_ok(format($$ insert into storage.objects (bucket_id, name, owner_id) values ('replays', 'a1000000-0000-0000-0000-000000000002/%s/1.json', 'a1000000-0000-0000-0000-000000000002') $$, (select v from t where k = 'h')),
  'a ride log in your own folder of your heat');
select throws_ok(format($$ insert into storage.objects (bucket_id, name, owner_id) values ('replays', 'a1000000-0000-0000-0000-000000000001/%s/1.json', 'a1000000-0000-0000-0000-000000000002') $$, (select v from t where k = 'h')),
  '42501', null, 'not in someone else''s folder');
select throws_ok($$ insert into storage.objects (bucket_id, name, owner_id) values ('replays', 'a1000000-0000-0000-0000-000000000002/00000000-0000-0000-0000-000000000000/1.json', 'a1000000-0000-0000-0000-000000000002') $$,
  '42501', null, 'not for a heat you''re not in');
select pg_temp.act_as('a1000000-0000-0000-0000-000000000001');
select is((select count(*)::int from storage.objects where bucket_id = 'replays' and name like '%' || (select v from t where k = 'h') || '%'), 1, 'others in the contest can read it');
select pg_temp.act_as('a1000000-0000-0000-0000-000000000003');
select is((select count(*)::int from storage.objects where bucket_id = 'replays' and name like '%' || (select v from t where k = 'h') || '%'), 0, 'an outsider can''t');

select * from finish();
rollback;
