-- npm run test:db: Open contests, step 7 (plans/2026-11-27-open-contests.md): Condensed. One window; round 1's heats and
-- a session for every later round, surfed in order; when the window closes the bracket is played out from the
-- sessions, and a session from a round you didn't reach doesn't count and isn't shown.
begin;
select plan(28);

insert into auth.users (id, email, aud, role, is_anonymous)
select ('c7000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, 'csurf' || i || '@example.com', 'authenticated', 'authenticated', false
from generate_series(0, 6) i;
select private.grant_entitlement('csurf0@example.com', 'pro', interval '30 days');
create function pg_temp.as_user(i int) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', 'c7000000-0000-0000-0000-' || lpad(i::text, 12, '0'), 'role', 'authenticated')::text, true)
$$;
create function pg_temp.uid(i int) returns uuid language sql as $$ select ('c7000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid $$;
create temp table t (k text primary key, v text);
grant select on t to authenticated;
create function pg_temp.cid() returns uuid language sql as $$ select v::uuid from t where k = 'c' $$;
-- surfer i's heat (or session) in round r
create function pg_temp.heat(i int, r int) returns uuid language sql as $$
  select he.heat_id from public.heat_entries he join public.entrants e on e.id = he.entrant_id join public.heats h on h.id = he.heat_id
   where e.user_id = pg_temp.uid(i) and h.contest_id = pg_temp.cid() and h.round = r
$$;
create function pg_temp.surf(i int, r int, scores numeric[]) returns void language plpgsql as $$
declare hid uuid := pg_temp.heat(i, r);
begin
  perform pg_temp.as_user(i);
  perform public.start_my_heat(hid);
  for w in 1..cardinality(scores) loop
    perform public.submit_ride(hid, w, scores[w], array[scores[w], scores[w], scores[w], scores[w], scores[w]], 0,
                               replay_path => pg_temp.uid(i) || '/' || hid || '/' || w || '.json');
  end loop;
  perform public.finish_heat(hid);
end $$;
create function pg_temp.tick() returns jsonb language sql as $$ select private.tick_open_contests() - 'queued' - 'started' - 'cancelled' $$;
create function pg_temp.board(r int) returns text language sql as $$
  select string_agg(e.name || ' ' || he.place || ' ' || he.total, ', ' order by h.number, he.place) from public.heat_entries he
    join public.entrants e on e.id = he.entrant_id join public.heats h on h.id = he.heat_id
   where h.contest_id = pg_temp.cid() and h.round = r and h.session_of is null
$$;

-- ---- How many rounds ----
select is(array[private.bracket_rounds(2), private.bracket_rounds(4), private.bracket_rounds(5), private.bracket_rounds(8),
                private.bracket_rounds(9), private.bracket_rounds(16), private.bracket_rounds(17), private.bracket_rounds(32)],
          array[1, 1, 2, 2, 3, 3, 4, 4], 'rounds for 2 to 32 in');

-- ---- Making one ----
select pg_temp.as_user(0);
select throws_ok($$ select public.create_contest('Two windows', wave => 'point', end_waves => 2, mode => 'open', open_format => 'condensed', round_hours => '{24,12}') $$,
  '22023', 'bad_round_hours', 'Condensed has one window');
insert into t select 'c', (public.create_contest('Quick Day', wave => 'point', end_waves => 2, mode => 'open', open_format => 'condensed', entry => 'open')).id;
select is((select open_format from public.contests where id = pg_temp.cid()), 'condensed', 'a Condensed contest');
select pg_temp.as_user(i), public.join_contest((select code from public.contests where id = pg_temp.cid()), 'S' || i) from generate_series(1, 6) i;
select pg_temp.as_user(0);
select public.start_contest(pg_temp.cid());
select is((select string_agg(n::text, ',' order by number) from (select h.number, (select count(*) from public.heat_entries he where he.heat_id = h.id) as n
           from public.heats h where h.contest_id = pg_temp.cid() and h.round = 1) x), '3,3', 'round 1: two heats of 3');
select is((select count(*)::int from public.heats where contest_id = pg_temp.cid() and round = 2 and session_of is not null), 6, '... and a round 2 session each');
select is((select count(distinct window_ends_at)::int from public.heats where contest_id = pg_temp.cid()), 1, '... all in the one window');
select is((select count(*)::int from public.heats where contest_id = pg_temp.cid() and round = 2 and seed <> private.round_seed((select seed from public.contests where id = pg_temp.cid()), 2)), 0,
  '... on round 2''s waves');
select is((select jsonb_array_length(public.watch_contest((select code from public.contests where id = pg_temp.cid())) -> 'heats')), 2, 'watchers see the bracket, not the sessions');

-- ---- Surfing, in order ----
select pg_temp.as_user(2);
select throws_ok(format('select public.start_my_heat(%L)', pg_temp.heat(2, 2)), '55000', 'surf_in_order', 'round 2 waits for your round 1');
select public.start_my_heat(pg_temp.heat(2, 1));
select throws_ok(format('select public.start_my_heat(%L)', pg_temp.heat(2, 2)), '55000', 'surf_in_order', '... until it''s over');
-- round 1, heat 1 (seeds 1, 4, 5) and heat 2 (seeds 2, 3, 6)
select pg_temp.surf(1, 1, '{9,9}');
select pg_temp.surf(4, 1, '{5,5}');
select pg_temp.surf(5, 1, '{3,3}');
select pg_temp.surf(2, 1, '{8,8}');
select pg_temp.surf(3, 1, '{7,7}');
select pg_temp.surf(6, 1, '{1,1}');
select is(pg_temp.tick(), '{"closed": 0, "waiting": 2}'::jsonb, 'round 1 surfed: it waits for the window (round 2 sessions to come)');

-- the last call: once, for the round you haven't surfed
update public.heats set starts_at = now() - interval '23 hours', window_ends_at = now() + interval '1 hour' where contest_id = pg_temp.cid();
select private.queue_notices();
select is((select count(*)::int from private.notices n join public.heats h on h.id = n.heat_id where h.contest_id = pg_temp.cid() and n.kind = 'closing_soon' and h.round = 2), 6,
  'the last call: each surfer''s round 2');
select private.queue_notices();
select is((select count(*)::int from private.notices n join public.heats h on h.id = n.heat_id where h.contest_id = pg_temp.cid() and n.kind = 'closing_soon'), 6, '... once');

-- round 2 sessions: S1 and S6 don't surf theirs; S5's 10s won't count (out in round 1)
select pg_temp.surf(4, 2, '{6,6}');
select pg_temp.surf(5, 2, '{10,10}');
select pg_temp.surf(2, 2, '{4,4}');
select pg_temp.surf(3, 2, '{2,2}');
select pg_temp.as_user(2);
set local role authenticated;
select is((select count(*)::int from public.rides r join public.heats h on h.id = r.heat_id where h.contest_id = pg_temp.cid()
           and r.entrant_id <> (select id from public.entrants where user_id = pg_temp.uid(2))), 0, 'nobody else''s waves show before the close');
reset role;
select is(pg_temp.tick(), '{"closed": 0, "waiting": 2}'::jsonb, 'S1 and S6 could still surf round 2: waiting');

-- ---- The window closes: played out ----
update public.heats set window_ends_at = now() - interval '1 second' where contest_id = pg_temp.cid();
select is(pg_temp.tick(), '{"closed": 0, "waiting": 2}'::jsonb, 'window over: it waits for the rides'' checks (sessions'' too)');
update public.ride_checks set status = 'ok' where ride_id in (select r.id from public.rides r join public.heats h on h.id = r.heat_id where h.contest_id = pg_temp.cid());
select is(pg_temp.tick() ->> 'waiting', '0', 'checked: the whole bracket is played out');
select is(pg_temp.board(1), 'S1 1 18.00, S4 2 10.00, S5 3 6.00, S2 1 16.00, S3 2 14.00, S6 3 2.00', 'round 1 from round 1');
select is(pg_temp.board(2), 'S4 1 12.00, S2 2 8.00, S3 3 4.00, S1 4 0.00', 'the final from the round 2 sessions (S1 didn''t surf theirs: 0)');
select is((select state from public.contests where id = pg_temp.cid()), 'done', 'the contest is over');
select is((select count(*)::int from public.rides r join public.heats h on h.id = r.heat_id where h.contest_id = pg_temp.cid() and h.round = 2 and h.session_of is null), 6,
  'the finalists'' session waves are the final''s now');
select ok((select he.started_at is not null from public.heat_entries he join public.heats h on h.id = he.heat_id
           where h.contest_id = pg_temp.cid() and h.round = 2 and h.session_of is null and he.entrant_id = (select id from public.entrants where user_id = pg_temp.uid(4))),
  '... with their start (the recap''s clock)');
select is((select string_agg(e.name || ' ' || h.state, ', ' order by e.name) from public.heats h join public.entrants e on e.id = h.session_of
           where h.contest_id = pg_temp.cid()), 'S1 done, S2 done, S3 done, S4 done, S5 void, S6 void', 'sessions used: done; not reached: void');
select pg_temp.as_user(2);
set local role authenticated;
select is((select count(*)::int from public.rides r where r.entrant_id = (select id from public.entrants where user_id = pg_temp.uid(5))), 2,
  'S5''s round 1 waves show; their round 2 session doesn''t');
select is((select count(*)::int from public.rides r join public.heats h on h.id = r.heat_id where h.contest_id = pg_temp.cid()), 18, '... everyone''s that counted: 12 in round 1, 6 in the final');
reset role;
select pg_temp.as_user(5);
set local role authenticated;
select is((select count(*)::int from public.rides r where r.entrant_id = (select id from public.entrants where user_id = pg_temp.uid(5))), 4, '... except to S5');
reset role;
select is((select jsonb_array_length(public.watch_contest((select code from public.contests where id = pg_temp.cid())) -> 'heats')), 3, 'watchers: round 1 and the final');

-- the results emails: only the heat you went out in, or the final
select private.queue_notices();
select is((select string_agg(e.name || ' r' || h.round, ', ' order by h.round, e.name) from private.notices n join public.heats h on h.id = n.heat_id
           join public.entrants e on e.user_id = n.user_id and e.contest_id = h.contest_id where h.contest_id = pg_temp.cid() and n.kind = 'results'),
  'S5 r1, S6 r1, S1 r2, S2 r2, S3 r2, S4 r2', 'results: where you went out, or the final');

select * from finish();
rollback;
