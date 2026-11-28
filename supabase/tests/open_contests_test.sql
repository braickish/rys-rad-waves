-- npm run test:db: Open contests, step 1 (plans/2026-11-27-open-contests.md). Pro hosts an Open contest; entry by
-- invite (by username) or open sign-up, members only; each surfer starts their own heat once and rides against their
-- own horn; rivals' scores stay hidden until the heat closes; the heat closes once everyone's done or missed the
-- window, no-shows last with 0.
begin;
select plan(50);

insert into auth.users (id, email, aud, role, is_anonymous) values
  ('c3000000-0000-0000-0000-000000000001', 'ohost@example.com', 'authenticated', 'authenticated', false),
  ('c3000000-0000-0000-0000-000000000002', 'oa@example.com', 'authenticated', 'authenticated', false),
  ('c3000000-0000-0000-0000-000000000003', 'ob@example.com', 'authenticated', 'authenticated', false),
  ('c3000000-0000-0000-0000-000000000004', 'oc@example.com', 'authenticated', 'authenticated', false),
  ('c3000000-0000-0000-0000-000000000005', 'od@example.com', 'authenticated', 'authenticated', false),
  ('c3000000-0000-0000-0000-000000000006', null, 'authenticated', 'authenticated', true);
insert into public.profiles (id, handle) values
  ('c3000000-0000-0000-0000-000000000001', 'ohost'), ('c3000000-0000-0000-0000-000000000002', 'olive'),
  ('c3000000-0000-0000-0000-000000000003', 'oscar'), ('c3000000-0000-0000-0000-000000000004', 'otis'),
  ('c3000000-0000-0000-0000-000000000005', 'ozzie');
select private.grant_entitlement('ohost@example.com', 'pro', interval '30 days');
create function pg_temp.as_user(i int) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', 'c3000000-0000-0000-0000-' || lpad(i::text, 12, '0'), 'role', 'authenticated')::text, true)
$$;
create temp table t (k text primary key, v text);
grant all on t to authenticated, anon;

-- ---- Hosting ----
select pg_temp.as_user(2);
select throws_ok($$ select public.create_contest('Nope', wave => 'point', end_minutes => 10, mode => 'open') $$, '42501', 'pro_needed', 'Pro only to host');
select pg_temp.as_user(1);
select throws_ok($$ select public.create_contest('C', wave => 'point', end_minutes => 10, mode => 'open', open_format => 'condensed') $$,
  '22023', 'condensed_later', 'condensed comes later');
select throws_ok($$ select public.create_contest('C', wave => 'point', end_minutes => 10, mode => 'open', round_hours => '{0}') $$,
  '22023', 'bad_round_hours', 'a round is at least an hour');
select throws_ok($$ select public.create_contest('C', wave => 'point', end_minutes => 10, mode => 'open', round_hours => '{24,24,24,24,24,24}') $$,
  '22023', 'bad_round_hours', '... and at most 5 lengths');
select throws_ok($$ select public.create_contest('C', wave => 'point', end_minutes => 10, mode => 'open', entry => 'secret') $$,
  '22023', 'bad_entry', 'invite or open entry');
insert into t select 'c1', (public.create_contest('Day Comp', wave => 'point', end_minutes => 10, mode => 'open', round_hours => '{24,12}')).id;
select is((select mode || '/' || open_format || '/' || entry || '/' || round_hours::text from public.contests where id = (select v::uuid from t where k = 'c1')),
  'open/rounds/invite/{24,12}', 'an Open contest: rounds, invite only by default, a length for each round');
select is((select signup_ends_at from public.contests where id = (select v::uuid from t where k = 'c1')), now() + interval '24 hours', 'sign-up: 24 hours by default');
insert into t select 'l1', (public.create_contest('Live One', wave => 'point', end_minutes => 10)).id;
select is((select mode || coalesce(entry, '-') from public.contests where id = (select v::uuid from t where k = 'l1')), 'live-', 'Live as before');
select is((select mode from public.contest_by_code((select code from public.contests where id = (select v::uuid from t where k = 'c1')))), 'open', 'the preview says it''s Open');

-- ---- Invites ----
select throws_ok($$ select public.invite_to_contest((select v::uuid from t where k = 'c1'), 'nobody_here') $$, 'P0002', 'no_such_surfer', 'invite someone who exists');
select throws_ok($$ select public.invite_to_contest((select v::uuid from t where k = 'l1'), 'olive') $$, '22023', 'not_open', 'invites are for Open contests');
select lives_ok($$ select public.invite_to_contest((select v::uuid from t where k = 'c1'), 'Olive'), public.invite_to_contest((select v::uuid from t where k = 'c1'), 'oscar') $$, 'the host invites two');
select lives_ok($$ select public.invite_to_contest((select v::uuid from t where k = 'c1'), 'olive') $$, 'again is fine');
select is((select count(*)::int from public.invites where contest_id = (select v::uuid from t where k = 'c1')), 2, '... still two invites');
select pg_temp.as_user(2);
select throws_ok($$ select public.invite_to_contest((select v::uuid from t where k = 'c1'), 'otis') $$, '42501', 'not_host', 'only the host invites');
set local role authenticated;
select is((select count(*)::int from public.contests where id = (select v::uuid from t where k = 'c1')), 1, 'invited: you can see the contest');
select is((select count(*)::int from public.invites), 1, '... and your own invite, not the others''');
reset role;

-- ---- Joining ----
select pg_temp.as_user(1);
select lives_ok($$ select public.join_contest((select code from public.contests where id = (select v::uuid from t where k = 'c1'))) $$, 'the host joins their own invite-only contest');
select public.leave_contest((select v::uuid from t where k = 'c1')); -- (and leaves again: the heat below is olive and oscar)
select pg_temp.as_user(6);
select throws_ok($$ select public.join_contest((select code from public.contests where id = (select v::uuid from t where k = 'c1')), 'Guesty') $$, '42501', 'account_needed', 'no guests in Open');
select pg_temp.as_user(4);
select throws_ok($$ select public.join_contest((select code from public.contests where id = (select v::uuid from t where k = 'c1'))) $$, '42501', 'invite_only', 'invite only: not without an invite');
select pg_temp.as_user(2);
select is((public.join_contest((select code from public.contests where id = (select v::uuid from t where k = 'c1')))).name, 'olive', 'invited: in, as your username');
select ok((select accepted_at is not null from public.invites i join public.profiles p on p.id = i.user_id where p.handle = 'olive'), '... the invite accepted');
select pg_temp.as_user(1);
select public.invite_to_contest((select v::uuid from t where k = 'c1'), 'ozzie');
select public.uninvite((select id from public.invites where user_id = 'c3000000-0000-0000-0000-000000000005'));
select is((select count(*)::int from public.invites where contest_id = (select v::uuid from t where k = 'c1')), 2, 'the host can take back an invite not yet taken');
select pg_temp.as_user(3);
select lives_ok($$ select public.join_contest((select code from public.contests where id = (select v::uuid from t where k = 'c1'))) $$, 'the second invite joins');

-- ---- Round 1 ----
select pg_temp.as_user(1);
select lives_ok($$ select public.start_contest((select v::uuid from t where k = 'c1')) $$, 'the host opens round 1 early');
insert into t select 'h1', id from public.heats where contest_id = (select v::uuid from t where k = 'c1');
select is((select window_ends_at - starts_at from public.heats where id = (select v::uuid from t where k = 'h1')), interval '24 hours', 'round 1''s window: 24 hours');
select is((select ends_at - window_ends_at from public.heats where id = (select v::uuid from t where k = 'h1')), interval '10 minutes', '... and the latest horn a heat after it');

select pg_temp.as_user(2);
select throws_ok($$ select public.submit_ride((select v::uuid from t where k = 'h1'), 1, 7, array[7,7,7,7,7]::numeric[], 30) $$, '55000', 'heat_not_started', 'no waves before you start');
select is((public.start_my_heat((select v::uuid from t where k = 'h1'))).started_at, now(), 'you start your heat: your horn starts now');
select is((public.start_my_heat((select v::uuid from t where k = 'h1'))).started_at, now(), '... one try: starting again carries on, never a new clock');
-- (11 minutes in: a minute past your horn, in the grace)
update public.heat_entries he set started_at = now() - interval '11 minutes' from public.entrants e
 where e.id = he.entrant_id and e.user_id = 'c3000000-0000-0000-0000-000000000002';
select lives_ok($$ select public.submit_ride((select v::uuid from t where k = 'h1'), 1, 7, array[7,7,7,7,7]::numeric[], 60) $$, 'a wave on your own clock');
select throws_ok($$ select public.submit_ride((select v::uuid from t where k = 'h1'), 2, 9, array[9,9,9,9,9]::numeric[], 650) $$, '55000', 'after_horn', 'not after your own horn');
select is((select caught_at from public.rides r join public.entrants e on e.id = r.entrant_id where e.user_id = 'c3000000-0000-0000-0000-000000000002'),
  now() - interval '10 minutes', 'caught_s counts from your own start');

-- ---- Hidden scores ----
select pg_temp.as_user(3);
set local role authenticated;
select is((select count(*)::int from public.rides where heat_id = (select v::uuid from t where k = 'h1')), 0, 'a rival can''t see your waves while the heat is on');
reset role;
select pg_temp.as_user(1);
set local role authenticated;
select is((select count(*)::int from public.rides where heat_id = (select v::uuid from t where k = 'h1')), 0, '... nor the host');
select is((select count(*)::int from public.ride_checks), 0, '... nor their checks');
reset role;
select pg_temp.as_user(2);
set local role authenticated;
select is((select count(*)::int from public.rides where heat_id = (select v::uuid from t where k = 'h1')), 1, 'you see your own');
reset role;
select is(jsonb_array_length(public.watch_contest((select code from public.contests where id = (select v::uuid from t where k = 'c1'))) -> 'rides'), 0, 'watching: no scores yet');

select pg_temp.as_user(3);
select throws_ok($$ select public.close_heat((select v::uuid from t where k = 'h1')) $$, '55000', 'heat_still_on', 'the heat waits for anyone who hasn''t surfed, while the window''s open');
select public.start_my_heat((select v::uuid from t where k = 'h1'));
select public.submit_ride((select v::uuid from t where k = 'h1'), 1, 5, array[5,5,5,5,5]::numeric[], 0);
select public.finish_heat((select v::uuid from t where k = 'h1'));
select throws_ok($$ select public.close_heat((select v::uuid from t where k = 'h1')) $$, '55000', 'heat_still_on', '... and for anyone still in the grace after their horn');
select pg_temp.as_user(2);
select public.finish_heat((select v::uuid from t where k = 'h1'));
select lives_ok($$ select public.close_heat((select v::uuid from t where k = 'h1')) $$, 'everyone''s finished: it closes');
select is((select string_agg(e.name || ' ' || he.place, ', ' order by he.place) from public.heat_entries he join public.entrants e on e.id = he.entrant_id
           where he.heat_id = (select v::uuid from t where k = 'h1')), 'olive 1, oscar 2', 'places');
select is((select state from public.contests where id = (select v::uuid from t where k = 'c1')), 'done', 'one heat: the final, and the contest is over');
set local role authenticated;
select is((select count(*)::int from public.rides where heat_id = (select v::uuid from t where k = 'h1')), 2, 'closed: now the rivals'' scores are out');
reset role;

-- ---- Open entry, and a no-show ----
select pg_temp.as_user(1);
insert into t select 'c2', (public.create_contest('Anyone', wave => 'point', end_waves => 3, mode => 'open', entry => 'open', signup_hours => 2)).id;
select pg_temp.as_user(4);
select lives_ok($$ select public.join_contest((select code from public.contests where id = (select v::uuid from t where k = 'c2'))) $$, 'open entry: anyone with the link');
select pg_temp.as_user(1);
select throws_ok($$ select public.start_contest((select v::uuid from t where k = 'c2')) $$, '55000', 'need_two', 'an Open contest needs two');
select pg_temp.as_user(5);
select public.join_contest((select code from public.contests where id = (select v::uuid from t where k = 'c2')));
update public.contests set signup_ends_at = now() - interval '1 second' where id = (select v::uuid from t where k = 'c2');
select pg_temp.as_user(2);
select throws_ok($$ select public.join_contest((select code from public.contests where id = (select v::uuid from t where k = 'c2'))) $$, '55000', 'signup_over', 'not after sign-up closes');
select pg_temp.as_user(1);
select public.start_contest((select v::uuid from t where k = 'c2'));
insert into t select 'h2', id from public.heats where contest_id = (select v::uuid from t where k = 'c2');
select pg_temp.as_user(4);
select public.start_my_heat((select v::uuid from t where k = 'h2'));
select public.submit_ride((select v::uuid from t where k = 'h2'), 1, 2, array[2,2,2,2,2]::numeric[], 0);
select public.finish_heat((select v::uuid from t where k = 'h2'));
update public.heats set window_ends_at = now() - interval '1 second' where id = (select v::uuid from t where k = 'h2');
select pg_temp.as_user(5);
select throws_ok($$ select public.start_my_heat((select v::uuid from t where k = 'h2')) $$, '55000', 'window_closed', 'missed the window: no starting');
select lives_ok($$ select public.close_heat((select v::uuid from t where k = 'h2')) $$, 'the window''s over and the one who surfed is done: it closes');
select is((select string_agg(e.name || ' ' || he.place || ' ' || he.total, ', ' order by he.place) from public.heat_entries he join public.entrants e on e.id = he.entrant_id
           where he.heat_id = (select v::uuid from t where k = 'h2')), 'otis 1 2.00, ozzie 2 0.00', 'a no-show scores 0 and comes last');

select * from finish();
rollback;
