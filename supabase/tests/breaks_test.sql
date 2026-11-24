-- npm run test:db: cloud breaks (accounts plan task 7). Only Pro saves or changes; private stays private, unlisted is
-- readable by id, public is listed; a lapsed Pro keeps, surfs and deletes their breaks but changes nothing.
begin;
select plan(22);

insert into auth.users (id, email, aud, role, is_anonymous) values
  ('b0000000-0000-0000-0000-000000000001', 'pro@example.com', 'authenticated', 'authenticated', false),
  ('b0000000-0000-0000-0000-000000000002', 'free@example.com', 'authenticated', 'authenticated', false),
  ('b0000000-0000-0000-0000-000000000003', 'other@example.com', 'authenticated', 'authenticated', false);
select private.grant_entitlement('pro@example.com', 'pro', interval '30 days');
select private.grant_entitlement('other@example.com', 'pro', interval '30 days');

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true)
$$;

-- Pro saves three breaks, one of each visibility.
select pg_temp.act_as('b0000000-0000-0000-0000-000000000001');
select lives_ok($$ insert into public.breaks (id, name, design, visibility) values
  ('c0000000-0000-0000-0000-000000000001', '  Secret Spot ', '{"blocks":[]}', 'private'),
  ('c0000000-0000-0000-0000-000000000002', 'Friends Only', '{"blocks":[]}', 'unlisted'),
  ('c0000000-0000-0000-0000-000000000003', 'Open Reef', '{"blocks":[]}', 'public') $$, 'Pro saves breaks');
select is((select name from public.breaks where id = 'c0000000-0000-0000-0000-000000000001'), 'Secret Spot', 'names are trimmed');
select is((select count(*)::int from public.breaks), 3, 'you see all of yours');
select throws_ok($$ insert into public.breaks (owner, name, design) values ('b0000000-0000-0000-0000-000000000003', 'Not mine', '{}') $$,
  '42501', null, 'you can''t save a break as someone else');
select throws_ok($$ insert into public.breaks (name, design) values ('shit break', '{}') $$, '23514', null, 'names stay clean');
select throws_ok($$ update public.breaks set version = 99 $$, '42501', null, 'the version isn''t yours to set');
update public.breaks set design = '{"blocks":[1]}' where id = 'c0000000-0000-0000-0000-000000000002';
select is((select version from public.breaks where id = 'c0000000-0000-0000-0000-000000000002'), 2, 'a changed design counts a save');

-- Someone else (Pro too).
select pg_temp.act_as('b0000000-0000-0000-0000-000000000003');
select is((select array_agg(name) from public.breaks), array['Open Reef'], 'others see only the public one listed');
select is((select count(*)::int from public.get_break('c0000000-0000-0000-0000-000000000001')), 0, 'a private break, even by id: nothing');
select is((select name from public.get_break('c0000000-0000-0000-0000-000000000002')), 'Friends Only', 'an unlisted one by id');
update public.breaks set name = 'Mine now' where id = 'c0000000-0000-0000-0000-000000000003';
select is((select name from public.get_break('c0000000-0000-0000-0000-000000000003')), 'Open Reef', 'you can''t change someone else''s');
delete from public.breaks where id = 'c0000000-0000-0000-0000-000000000003';
select is((select count(*)::int from public.get_break('c0000000-0000-0000-0000-000000000003')), 1, '... or delete it');

-- Signed out.
select set_config('role', 'anon', true), set_config('request.jwt.claims', '{"role":"anon"}', true);
select is((select array_agg(name) from public.breaks), array['Open Reef'], 'signed out: the public one');
select is((select name from public.get_break('c0000000-0000-0000-0000-000000000002')), 'Friends Only', 'signed out: an unlisted link works');
select throws_ok($$ insert into public.breaks (name, design) values ('Guest', '{}') $$, '42501', null, 'signed out: no saving');

-- Free: can't save.
select pg_temp.act_as('b0000000-0000-0000-0000-000000000002');
select throws_ok($$ insert into public.breaks (name, design) values ('My Break', '{}') $$, '42501', null, 'not Pro: can''t save');

-- Pro lapses: keep, see, delete; no changes.
reset role;
update public.entitlements set status = 'canceled', expires_at = now() - interval '1 hour'
  where user_id = 'b0000000-0000-0000-0000-000000000001';
select pg_temp.act_as('b0000000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.breaks where owner = 'b0000000-0000-0000-0000-000000000001'), 3, 'lapsed: your breaks are all still there');
select throws_ok($$ update public.breaks set name = 'Renamed' where id = 'c0000000-0000-0000-0000-000000000001' $$, '42501', null, 'lapsed: no changes');
select throws_ok($$ insert into public.breaks (name, design) values ('Another', '{}') $$, '42501', null, 'lapsed: no new ones');
delete from public.breaks where id = 'c0000000-0000-0000-0000-000000000001';
select is((select count(*)::int from public.breaks where owner = 'b0000000-0000-0000-0000-000000000001'), 2, 'lapsed: you can still delete');

-- Thumbnails: only in your own folder, only with Pro.
select pg_temp.act_as('b0000000-0000-0000-0000-000000000003');
select lives_ok($$ insert into storage.objects (bucket_id, name, owner_id) values ('breaks', 'b0000000-0000-0000-0000-000000000003/x.webp', 'b0000000-0000-0000-0000-000000000003') $$,
  'Pro writes a thumbnail in their folder');
select throws_ok($$ insert into storage.objects (bucket_id, name, owner_id) values ('breaks', 'b0000000-0000-0000-0000-000000000001/x.webp', 'b0000000-0000-0000-0000-000000000003') $$,
  '42501', null, '... not in someone else''s');

select * from finish();
rollback;
