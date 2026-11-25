-- npm run test:db: contests on accounts (accounts plan task 10). Only Pro hosts (and within limits); the spot is a
-- snapshot; guests join by code with a nickname and read the spot (the contest pass); the heat runs on the server's
-- clock; rides are your own, in order, before the horn; places by best two with the WSL tie-breaks; outsiders see
-- nothing of an unlisted contest.
begin;
select plan(59);

insert into auth.users (id, email, aud, role, is_anonymous) values
  ('d0000000-0000-0000-0000-000000000001', 'host@example.com', 'authenticated', 'authenticated', false),
  ('d0000000-0000-0000-0000-000000000002', 'free@example.com', 'authenticated', 'authenticated', false),
  ('d0000000-0000-0000-0000-000000000003', null, 'authenticated', 'authenticated', true),
  ('d0000000-0000-0000-0000-000000000004', 'outsider@example.com', 'authenticated', 'authenticated', false),
  ('d0000000-0000-0000-0000-000000000005', null, 'authenticated', 'authenticated', true);
insert into public.profiles (id, handle) values
  ('d0000000-0000-0000-0000-000000000001', 'big_host'),
  ('d0000000-0000-0000-0000-000000000002', 'free_rider');
select private.grant_entitlement('host@example.com', 'pro', interval '30 days');
insert into public.breaks (id, owner, name, design, ride, visibility) values
  ('e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'Bombie', '{}', '{"peaks":[1]}', 'private'),
  ('e0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000001', 'Unfinished', '{}', null, 'private'),
  ('e0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000004', 'Not Yours', '{}', '{"peaks":[2]}', 'private');

create function pg_temp.act_as(uid uuid, anon boolean default false) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated', 'is_anonymous', anon)::text, true)
$$;
create temp table t (k text primary key, v text);
grant all on t to authenticated, anon;

-- 1. Who can host.
select pg_temp.act_as('d0000000-0000-0000-0000-000000000002');
select throws_ok($$ select public.create_contest('Free Comp', wave => 'reef', end_minutes => 10) $$, '42501', 'pro_needed', 'not Pro: can''t host');
select pg_temp.act_as('d0000000-0000-0000-0000-000000000003', true);
select throws_ok($$ select public.create_contest('Guest Comp', wave => 'reef', end_minutes => 10) $$, '42501', 'sign_in', 'a guest can''t host');
select pg_temp.act_as('d0000000-0000-0000-0000-000000000001');
select throws_ok($$ select public.create_contest('Comp', wave => 'nowhere', end_minutes => 10) $$, '22023', 'no_such_wave', 'only the game''s waves');
select throws_ok($$ select public.create_contest('Comp', wave => 'reef', break_id => 'e0000000-0000-0000-0000-000000000001', end_minutes => 10) $$,
  '22023', 'one_spot', 'a wave or a break, not both');
select throws_ok($$ select public.create_contest('Comp', wave => 'reef') $$, '23514', null, 'a timer or a wave count');
select throws_ok($$ select public.create_contest('Comp', wave => 'reef', end_minutes => 10, end_waves => 5) $$, '23514', null, '... not both');
select throws_ok($$ select public.create_contest('Comp', break_id => 'e0000000-0000-0000-0000-000000000002', end_waves => 5) $$,
  '22023', 'break_not_rideable', 'a break that makes no wave yet: no');
select throws_ok($$ select public.create_contest('Comp', break_id => 'e0000000-0000-0000-0000-000000000003', end_waves => 5) $$,
  '22023', 'no_such_break', 'someone else''s private break: no');
select throws_ok($$ select public.create_contest('shit comp', wave => 'reef', end_minutes => 10) $$, '23514', 'contest_name_blocked', 'names stay clean');
select throws_ok($$ select public.create_contest('Big One', wave => 'reef', end_minutes => 10, max_entrants => 16) $$, '22023', 'brackets_later', 'one heat of up to 8 for now');

insert into t select 'wave', (public.create_contest('  Pipe Masters ', wave => 'reef', end_minutes => 10)).id;
insert into t select 'break', (public.create_contest('Bombie Bash', break_id => 'e0000000-0000-0000-0000-000000000001', end_waves => 3, max_entrants => 3)).id;
select is((select name from public.contests where id = (select v::uuid from t where k = 'wave')), 'Pipe Masters', 'Pro hosts: a contest on Pipe (name trimmed)');
select matches((select code from public.contests where id = (select v::uuid from t where k = 'wave')), '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$', 'a six-letter code, no look-alikes');
select is((select spot from public.contests where id = (select v::uuid from t where k = 'wave')), '{"wave": "reef"}'::jsonb, 'the spot: the wave');
select is((select spot -> 'ride' from public.contests where id = (select v::uuid from t where k = 'break')), '{"peaks": [1]}'::jsonb, 'the spot: the break''s ride, copied');
select is((select state || '/' || visibility from public.contests where id = (select v::uuid from t where k = 'wave')), 'lobby/unlisted', 'in the lobby, unlisted');
reset role;
update public.breaks set ride = '{"peaks":[9]}' where id = 'e0000000-0000-0000-0000-000000000001';
select is((select spot -> 'ride' from public.contests where id = (select v::uuid from t where k = 'break')), '{"peaks": [1]}'::jsonb, 'editing the break doesn''t change the contest');
select pg_temp.act_as('d0000000-0000-0000-0000-000000000001');
select lives_ok($$ select public.create_contest('Third', wave => 'point', end_waves => 5) $$, 'a third open contest');
select throws_ok($$ select public.create_contest('Fourth', wave => 'point', end_waves => 5) $$, '23514', 'too_many_contests', 'at most 3 open at once');
select throws_ok($$ insert into public.contests (code, name, spot, seed, end_waves) values ('ABCDEF', 'Direct', '{}', 1, 3) $$, '42501', null, 'no writing the tables directly');

-- 2. Joining (the break contest: 3 places, 3 waves).
insert into t select 'code', code from public.contests where id = (select v::uuid from t where k = 'break');
select pg_temp.act_as('d0000000-0000-0000-0000-000000000003', true);
select is((select count(*)::int from public.contests), 0, 'a guest sees nothing of an unlisted contest before joining');
select is((select name || ' · ' || host_handle || ' · ' || spot_name || ' · ' || entrants from public.contest_by_code(lower((select v from t where k = 'code')))),
  'Bombie Bash · big_host · Bombie · 0', 'the code gives a preview (any case)');
select throws_ok($$ select public.join_contest((select v from t where k = 'code'), '') $$, '22023', 'bad_name', 'a guest needs a nickname');
select throws_ok($$ select public.join_contest((select v from t where k = 'code'), 'fuck') $$, '23514', 'name_blocked', 'nicknames stay clean');
select throws_ok($$ select public.join_contest('ZZZZZZ', 'Kai') $$, 'P0002', 'no_contest', 'a wrong code');
insert into t select 'guest', (public.join_contest((select v from t where k = 'code'), '  Kai  Lani ')).id;
select is((select name || '/' || guest from public.entrants where id = (select v::uuid from t where k = 'guest')), 'Kai Lani/true', 'a guest joins by nickname');
select is((select spot -> 'ride' from public.contests where code = (select v from t where k = 'code')), '{"peaks": [1]}'::jsonb, 'the contest pass: entrants read the spot');
select is((public.join_contest((select v from t where k = 'code'), 'Other')).id::text, (select v from t where k = 'guest'), 'joining again: the same entry');
select pg_temp.act_as('d0000000-0000-0000-0000-000000000002');
insert into t select 'free', (public.join_contest((select v from t where k = 'code'), 'ignored')).id;
select is((select name || '/' || guest from public.entrants where id = (select v::uuid from t where k = 'free')), 'free_rider/false', 'a member joins as their handle, no Pro needed');
select pg_temp.act_as('d0000000-0000-0000-0000-000000000001');
insert into t select 'host', (public.join_contest((select v from t where k = 'code'))).id;
select pg_temp.act_as('d0000000-0000-0000-0000-000000000005', true);
select throws_ok($$ select public.join_contest((select v from t where k = 'code'), 'Late') $$, '55000', 'contest_full', 'a full contest');

-- 3. Starting.
select pg_temp.act_as('d0000000-0000-0000-0000-000000000002');
select throws_ok($$ select public.start_contest((select id from public.contests where code = (select v from t where k = 'code'))) $$, '42501', 'not_host', 'only the host starts');
select pg_temp.act_as('d0000000-0000-0000-0000-000000000001');
insert into t select 'heat', (public.start_contest((select id from public.contests where code = (select v from t where k = 'code')))).id;
select is((select state from public.contests where code = (select v from t where k = 'code')), 'running', 'started');
select is((select count(distinct jersey)::int from public.heat_entries where heat_id = (select v::uuid from t where k = 'heat')), 3, 'three surfers, three different jerseys');
select ok((select starts_at > now() and ends_at = starts_at + interval '9 minutes' from public.heats where id = (select v::uuid from t where k = 'heat')),
  'the heat starts after a countdown; a 3-wave heat has 9 minutes');
select is((select array_agg(name order by seed_rank) from public.entrants where contest_id = (select id from public.contests where code = (select v from t where k = 'code'))),
  array['Kai Lani', 'free_rider', 'big_host'], 'seeded by who joined first');
select pg_temp.act_as('d0000000-0000-0000-0000-000000000005', true);
select throws_ok($$ select public.join_contest((select v from t where k = 'code'), 'Late') $$, '55000', 'contest_started', 'can''t join once it''s started');

-- 4. Riding.
select pg_temp.act_as('d0000000-0000-0000-0000-000000000003', true);
select throws_ok($$ select public.submit_ride((select v::uuid from t where k = 'heat'), 1, 7, array[7,7,7,7,7], 5) $$, '55000', 'heat_not_started', 'not before the start');
reset role;
update public.heats set starts_at = now() - interval '60 seconds', ends_at = now() + interval '5 minutes' where id = (select v::uuid from t where k = 'heat');
select pg_temp.act_as('d0000000-0000-0000-0000-000000000003', true);
select lives_ok($$ select public.submit_ride((select v::uuid from t where k = 'heat'), 1, 6, array[6,6,6,6,6], 10, replay_path => 'd0000000-0000-0000-0000-000000000003/h1/1.json') $$, 'a guest''s first wave');
select throws_ok($$ select public.submit_ride((select v::uuid from t where k = 'heat'), 3, 6, array[6,6,6,6,6], 20) $$, '22023', 'wave_out_of_order', 'waves come in order');
select throws_ok($$ select public.submit_ride((select v::uuid from t where k = 'heat'), 2, 6, array[6,6,6,6,6], 20, replay_path => 'someone-else/x.json') $$, '22023', 'bad_replay_path', 'replays only in your own folder');
select throws_ok($$ select public.submit_ride((select v::uuid from t where k = 'heat'), 2, 11, array[6,6,6,6,6], 20) $$, '23514', null, 'scores are 0 to 10');
select throws_ok($$ select public.submit_ride((select v::uuid from t where k = 'heat'), 2, 6, array[6,6,6,6,6], 600) $$, '22023', 'bad_time', 'not caught in the future');
select lives_ok($$ select public.submit_ride((select v::uuid from t where k = 'heat'), 2, 6, array[6,6,6,6,6], 20) $$, 'a second wave');
select lives_ok($$ select public.submit_ride((select v::uuid from t where k = 'heat'), 3, 3, array[3,3,3,3,3], 30) $$, 'a third');
select throws_ok($$ select public.submit_ride((select v::uuid from t where k = 'heat'), 4, 9, array[9,9,9,9,9], 40) $$, '55000', 'no_more_waves', 'three waves in a 3-wave heat');
select throws_ok($$ insert into public.rides (heat_id, entrant_id, wave_no, score, judges, caught_at) values
  ((select v::uuid from t where k = 'heat'), (select v::uuid from t where k = 'free'), 1, 10, array[10,10,10,10,10], now()) $$, '42501', null, 'no posting a ride directly (or as someone else)');
select pg_temp.act_as('d0000000-0000-0000-0000-000000000004');
select throws_ok($$ select public.submit_ride((select v::uuid from t where k = 'heat'), 1, 9, array[9,9,9,9,9], 10) $$, '42501', 'not_in_heat', 'an outsider can''t post');
select is((select count(*)::int from public.rides), 0, 'an outsider sees no rides');
select pg_temp.act_as('d0000000-0000-0000-0000-000000000002');
select lives_ok($$ select public.submit_ride((select v::uuid from t where k = 'heat'), 1, 7, array[7,7,7,7,7], 12);
                   select public.submit_ride((select v::uuid from t where k = 'heat'), 2, 5, array[5,5,5,5,5], 22) $$, 'free_rider: 7 and 5');
select is((select count(*)::int from public.rides), 5, 'entrants see everyone''s rides');
select throws_ok($$ select public.close_heat((select v::uuid from t where k = 'heat')) $$, '55000', 'heat_still_on', 'can''t close a heat that''s on');
-- the horn: a wave caught after it doesn't count
reset role;
update public.heats set starts_at = now() - interval '9 minutes 40 seconds', ends_at = now() - interval '40 seconds' where id = (select v::uuid from t where k = 'heat');
select pg_temp.act_as('d0000000-0000-0000-0000-000000000002');
select throws_ok($$ select public.submit_ride((select v::uuid from t where k = 'heat'), 3, 9, array[9,9,9,9,9], 570) $$, '55000', 'after_horn', 'caught after the horn: no');
select lives_ok($$ select public.submit_ride((select v::uuid from t where k = 'heat'), 3, 4, array[4,4,4,4,4], 530) $$, 'caught before it, in after: yes');

-- 5. Closing: Kai 6+6 = 12 (best 6), free_rider 7+5 = 12 (best 7), the host nothing.
reset role;
update public.heats set ends_at = now() - interval '3 minutes' where id = (select v::uuid from t where k = 'heat');
select pg_temp.act_as('d0000000-0000-0000-0000-000000000003', true);
select is((select array_agg(e.name || ' ' || he.place || ' ' || he.total order by he.place)
           from public.close_heat((select v::uuid from t where k = 'heat')) he join public.entrants e on e.id = he.entrant_id),
  array['free_rider 1 12.00', 'Kai Lani 2 12.00', 'big_host 3 0.00'], 'places: a tie on 12 goes to the best wave');
select is((select state from public.contests where code = (select v from t where k = 'code')), 'done', 'the last heat closed: the contest is done');
select throws_ok($$ select public.submit_ride((select v::uuid from t where k = 'heat'), 3, 9, array[9,9,9,9,9], 30) $$, '55000', 'heat_over', 'no rides after it closes');

-- 6. Public contests, and a lapsed host.
select pg_temp.act_as('d0000000-0000-0000-0000-000000000001');
insert into t select 'pub', (public.create_contest('Open Day', wave => 'trestles', end_waves => 5, visibility => 'public')).id;
select set_config('role', 'anon', true), set_config('request.jwt.claims', '{"role":"anon"}', true);
select is((select array_agg(name) from public.contests where host = 'd0000000-0000-0000-0000-000000000001'), array['Open Day'], 'signed out: only the public contest');
reset role;
update public.entitlements set status = 'canceled', expires_at = now() - interval '1 hour' where user_id = 'd0000000-0000-0000-0000-000000000001';
select pg_temp.act_as('d0000000-0000-0000-0000-000000000003', true);
select lives_ok($$ select public.join_contest((select code from public.contests where id = (select v::uuid from t where k = 'pub')), 'Kai') $$, 'a guest joins the public one');
select pg_temp.act_as('d0000000-0000-0000-0000-000000000001');
select throws_ok($$ select public.start_contest((select v::uuid from t where k = 'pub')) $$, '42501', 'pro_needed', 'Pro lapsed: the host can''t start it');
select lives_ok($$ select public.cancel_contest((select v::uuid from t where k = 'pub')) $$, '... but can cancel it');

select * from finish();
rollback;
