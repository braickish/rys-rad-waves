-- npm run test:db: Open contests, step 2 (plans/2026-11-27-open-contests.md): the scheduler. The tick closes sign-up
-- (round 1, or cancelled with fewer than 2), closes heats that are over (everyone done, or the window missed) once their
-- rides are checked (or an hour on), builds the next round with its own window, and ends the contest; an Open heat's
-- flagged waves don't count.
begin;
select plan(21);

insert into auth.users (id, email, aud, role, is_anonymous)
select ('c4000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, 'osurf' || i || '@example.com', 'authenticated', 'authenticated', false
from generate_series(0, 6) i;
select private.grant_entitlement('osurf0@example.com', 'pro', interval '30 days');
create function pg_temp.as_user(i int) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', 'c4000000-0000-0000-0000-' || lpad(i::text, 12, '0'), 'role', 'authenticated')::text, true)
$$;
create function pg_temp.uid(i int) returns uuid language sql as $$ select ('c4000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid $$;
create temp table t (k text primary key, v text);
-- Surfer i's heat in contest k: start it and ride these waves (logged: with a ride log, so its check waits).
create function pg_temp.surf(i int, cid uuid, scores numeric[], logged boolean default false) returns void language plpgsql as $$
declare hid uuid;
begin
  select he.heat_id into hid from public.heat_entries he join public.entrants e on e.id = he.entrant_id join public.heats h on h.id = he.heat_id
   where e.user_id = pg_temp.uid(i) and h.contest_id = cid and h.state = 'live';
  perform pg_temp.as_user(i);
  perform public.start_my_heat(hid);
  for w in 1..cardinality(scores) loop
    perform public.submit_ride(hid, w, scores[w], array[scores[w], scores[w], scores[w], scores[w], scores[w]], 0,
                               replay_path => case when logged then pg_temp.uid(i) || '/' || hid || '/' || w || '.json' end);
  end loop;
  perform public.finish_heat(hid);
end $$;
create function pg_temp.tick() returns jsonb language sql as $$ select private.tick_open_contests() - 'queued' $$; -- (the emails: open_notices_test)
create function pg_temp.shape(cid uuid) returns text language sql as $$
  select string_agg(r, ' | ' order by round) from (
    select h.round, string_agg((select count(*) from public.heat_entries he where he.heat_id = h.id)::text, ',' order by h.number) as r
    from public.heats h where h.contest_id = cid group by h.round) x
$$;

select is((select count(*)::int from cron.job where jobname = 'open-contests' and schedule = '*/5 * * * *'), 1, 'the tick runs every 5 minutes');

-- ---- Sign-up closes ----
select pg_temp.as_user(0);
insert into t select 'lonely', (public.create_contest('Lonely', wave => 'point', end_waves => 2, mode => 'open', entry => 'open')).id;
insert into t select 'c', (public.create_contest('Big Day', wave => 'point', end_waves => 2, mode => 'open', entry => 'open', round_hours => '{24,12}')).id;
select pg_temp.as_user(1);
select public.join_contest((select code from public.contests where id = (select v::uuid from t where k = 'lonely')), 'S1');
select pg_temp.as_user(i), public.join_contest((select code from public.contests where id = (select v::uuid from t where k = 'c')), 'S' || i)
  from generate_series(1, 5) i;
select is(pg_temp.tick() ->> 'started', '0', 'sign-up still on: nothing starts');
update public.contests set signup_ends_at = now() - interval '1 second' where id in (select v::uuid from t where k in ('lonely', 'c'));
select is(pg_temp.tick() - 'waiting', '{"closed": 0, "started": 1, "cancelled": 1}'::jsonb, 'sign-up over: one starts, one is cancelled');
select is((select state from public.contests where id = (select v::uuid from t where k = 'lonely')), 'cancelled', 'fewer than 2: cancelled');
select is((select state from public.contests where id = (select v::uuid from t where k = 'c')), 'running', '5 in: running');
select is(pg_temp.shape((select v::uuid from t where k = 'c')), '3,2', '... round 1: heats of 3 and 2');
select is((select min(window_ends_at - starts_at) from public.heats where contest_id = (select v::uuid from t where k = 'c')), interval '24 hours', '... round 1''s window: 24 hours');
select is(pg_temp.tick() - 'started' - 'cancelled', '{"closed": 0, "waiting": 2}'::jsonb, 'nobody''s surfed: both heats wait');

-- ---- Round 1 ----
-- heat 1 (seeds 1, 4, 5): seed 1's best wave has a log, so it waits for its check; heat 2 (seeds 2, 3): 3 doesn't show
select pg_temp.surf(1, (select v::uuid from t where k = 'c'), '{9.9,3}', true);
select pg_temp.surf(4, (select v::uuid from t where k = 'c'), '{6,5}');
select pg_temp.surf(5, (select v::uuid from t where k = 'c'), '{4,4}');
select pg_temp.surf(2, (select v::uuid from t where k = 'c'), '{7,7}');
select is(pg_temp.tick() - 'started' - 'cancelled', '{"closed": 0, "waiting": 2}'::jsonb, 'heat 2 waits while its no-show''s window is open');
update public.heats set window_ends_at = now() - interval '1 second' where contest_id = (select v::uuid from t where k = 'c') and number = 2;
select is(pg_temp.tick() - 'started' - 'cancelled', '{"closed": 1, "waiting": 1}'::jsonb, 'window over: heat 2 closes; heat 1 waits for its checks');
select ok((select ready_at = now() from public.heats where contest_id = (select v::uuid from t where k = 'c') and number = 1), '... ready, noted');
select pg_temp.as_user(4);
select throws_ok($$ select public.close_heat((select id from public.heats where contest_id = (select v::uuid from t where k = 'c') and number = 1)) $$,
  '55000', 'checks_pending', 'nobody closes it with checks waiting');
select is((select string_agg(e.name || ' ' || he.place || coalesce(' ' || he.advanced::text, ''), ', ' order by he.place) from public.heat_entries he
           join public.entrants e on e.id = he.entrant_id join public.heats h on h.id = he.heat_id
           where h.contest_id = (select v::uuid from t where k = 'c') and h.number = 2), 'S2 1 true, S3 2 false', 'heat 2: the no-show last, out');
insert into private.settings values ('drop_flagged', 'on'); -- (off by default: 20261127030000)
update public.ride_checks set status = 'flagged', reasons = '{score}'
 where ride_id in (select r.id from public.rides r join public.entrants e on e.id = r.entrant_id where e.user_id = pg_temp.uid(1) and r.wave_no = 1);
update public.ride_checks set status = 'ok'
 where ride_id in (select r.id from public.rides r join public.entrants e on e.id = r.entrant_id where e.user_id = pg_temp.uid(1) and r.wave_no = 2);
select is(pg_temp.tick() - 'started' - 'cancelled', '{"closed": 1, "waiting": 0}'::jsonb, 'checked: heat 1 closes');
select is((select string_agg(e.name || ' ' || he.total, ', ' order by he.place) from public.heat_entries he
           join public.entrants e on e.id = he.entrant_id join public.heats h on h.id = he.heat_id
           where h.contest_id = (select v::uuid from t where k = 'c') and h.number = 1 and h.round = 1), 'S4 11.00, S5 8.00, S1 3.00', 'a flagged wave doesn''t count');
select is(pg_temp.shape((select v::uuid from t where k = 'c')), '3,2 | 3', 'round 2 is built: the final of 3');
select is((select window_ends_at - starts_at from public.heats where contest_id = (select v::uuid from t where k = 'c') and round = 2), interval '12 hours', '... with its own window (12 hours)');

-- ---- The final: a check that never comes ----
select pg_temp.surf(4, (select v::uuid from t where k = 'c'), '{8,8}', true);
select pg_temp.surf(5, (select v::uuid from t where k = 'c'), '{5,5}');
select pg_temp.surf(2, (select v::uuid from t where k = 'c'), '{6,6}');
select is(pg_temp.tick() ->> 'waiting', '1', 'the final waits for its checks');
-- (drop_flagged off again: a flagged wave counts)
delete from private.settings where key = 'drop_flagged';
update public.ride_checks set status = 'flagged', reasons = '{score}'
 where ride_id in (select r.id from public.rides r join public.heats h on h.id = r.heat_id join public.entrants e on e.id = r.entrant_id
                   where e.user_id = pg_temp.uid(4) and h.round = 2 and r.wave_no = 1);
update public.heats set ready_at = now() - interval '61 minutes' where contest_id = (select v::uuid from t where k = 'c') and round = 2;
select is(pg_temp.tick() ->> 'closed', '1', 'an hour on, it closes anyway');
select is((select string_agg(e.name || ' ' || he.place, ', ' order by he.place) from public.heat_entries he
           join public.entrants e on e.id = he.entrant_id join public.heats h on h.id = he.heat_id
           where h.contest_id = (select v::uuid from t where k = 'c') and h.round = 2), 'S4 1, S2 2, S5 3', 'the final''s places (a pending wave counts, and with drop_flagged off a flagged one)');
select is((select state from public.contests where id = (select v::uuid from t where k = 'c')), 'done', 'the contest is over');

select * from finish();
rollback;
