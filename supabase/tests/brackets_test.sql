-- npm run test:db: brackets (accounts plan task 13). Every heat has 2 to 4 surfers (the user); 4 or fewer is one heat;
-- 5 to 16 surfers make sensible rounds (the top 2 through, 1 from a heat of 2) and a final of 4 or fewer; round 1 is seeded in snake order; every heat of a round has the round's seed; the next
-- round is built when the last heat of one closes; ties go through by the best wave; the final ends the contest.
begin;
select plan(27);

-- A host and 16 surfers (members without profiles: they join by nickname).
insert into auth.users (id, email, aud, role, is_anonymous)
select ('b2000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, 'bsurfer' || i || '@example.com', 'authenticated', 'authenticated', false
from generate_series(0, 16) i;
-- (a host per contest: each can only have 3 open at once)
insert into auth.users (id, email, aud, role, is_anonymous)
select ('b2000000-0000-0000-0001-' || lpad(i::text, 12, '0'))::uuid, 'bhost' || i || '@example.com', 'authenticated', 'authenticated', false
from generate_series(1, 12) i;
select private.grant_entitlement('bhost' || i || '@example.com', 'pro', interval '30 days') from generate_series(1, 12) i;
create sequence pg_temp.hosts;
create function pg_temp.as_user(i int) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', 'b2000000-0000-0000-0000-' || lpad(i::text, 12, '0'), 'role', 'authenticated')::text, true)
$$;
create function pg_temp.uid(i int) returns uuid language sql as $$ select ('b2000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid $$;

-- A contest of n (2 waves a heat), started.
create function pg_temp.contest(n int, label text) returns uuid language plpgsql as $$
declare c public.contests;
begin
  perform set_config('test.host', ('b2000000-0000-0000-0001-' || lpad(nextval('pg_temp.hosts')::text, 12, '0')), true);
  perform set_config('request.jwt.claims', json_build_object('sub', current_setting('test.host'), 'role', 'authenticated')::text, true);
  c := public.create_contest(label, wave => 'point', end_waves => 2, max_entrants => 32);
  for i in 1..n loop perform pg_temp.as_user(i); perform public.join_contest(c.code, 'S' || i); end loop;
  perform set_config('request.jwt.claims', json_build_object('sub', c.host, 'role', 'authenticated')::text, true);
  perform public.start_contest(c.id);
  return c.id;
end $$;

-- Ride the live round: everyone rides both waves (score(seed rank, wave)), finishes, and the host closes each heat.
create function pg_temp.ride_round(cid uuid, score text) returns int language plpgsql as $$
declare rnd int; hh record; ee record; sc numeric;
begin
  select min(round) into rnd from public.heats where contest_id = cid and state = 'live';
  if rnd is null then return null; end if;
  update public.heats set starts_at = now() - interval '120 seconds', ends_at = now() + interval '5 minutes' where contest_id = cid and round = rnd;
  for hh in select id from public.heats where contest_id = cid and round = rnd order by number loop
    for ee in select e.user_id, e.seed_rank from public.heat_entries he join public.entrants e on e.id = he.entrant_id where he.heat_id = hh.id loop
      perform set_config('request.jwt.claims', json_build_object('sub', ee.user_id, 'role', 'authenticated')::text, true);
      for w in 1..2 loop
        execute format('select %s', replace(replace(score, '$r', ee.seed_rank::text), '$w', w::text)) into sc;
        perform public.submit_ride(hh.id, w, sc, array[sc, sc, sc, sc, sc], 10 * w);
      end loop;
      perform public.finish_heat(hh.id);
    end loop;
    perform set_config('request.jwt.claims', json_build_object('sub', (select host from public.contests where id = cid), 'role', 'authenticated')::text, true);
    perform public.close_heat(hh.id);
  end loop;
  return rnd;
end $$;

-- The shape: heats a round, and their sizes.
create function pg_temp.shape(cid uuid) returns text language sql as $$
  select string_agg(r, ' | ' order by round) from (
    select h.round, string_agg((select count(*) from public.heat_entries he where he.heat_id = h.id)::text, ',' order by h.number) as r
    from public.heats h where h.contest_id = cid group by h.round) x
$$;
-- (the better your seed, the better you surf: seed 1 scores 9.9 then 9.5, seed 2 9.6 and 9.2...)
create temp table t (k text primary key, v text);

-- 9 surfers.
insert into t select 'c9', pg_temp.contest(9, 'Nine');
select is((select format || '/' || heat_size from public.contests where id = (select v::uuid from t where k = 'c9')), 'bracket/4', 'contests run in heats of up to 4');
select is(pg_temp.shape((select v::uuid from t where k = 'c9')), '3,3,3', '9: round 1 is three heats of 3');
select is((select string_agg(e.seed_rank::text, ',' order by e.seed_rank) from public.heat_entries he join public.heats h on h.id = he.heat_id join public.entrants e on e.id = he.entrant_id
           where h.contest_id = (select v::uuid from t where k = 'c9') and h.number = 1), '1,6,7', 'snake seeding: heat 1 has seeds 1, 6, 7');
select is((select string_agg(e.seed_rank::text, ',' order by e.seed_rank) from public.heat_entries he join public.heats h on h.id = he.heat_id join public.entrants e on e.id = he.entrant_id
           where h.contest_id = (select v::uuid from t where k = 'c9') and h.number = 3), '3,4,9', '... heat 3 has seeds 3, 4, 9');
select is((select count(distinct seed)::int from public.heats where contest_id = (select v::uuid from t where k = 'c9')), 1, 'every heat of a round has the round''s seed');
select ok((select bool_and(n = 3) from (select count(distinct jersey) n from public.heat_entries he join public.heats h on h.id = he.heat_id where h.contest_id = (select v::uuid from t where k = 'c9') group by he.heat_id) x),
  'jerseys all different within each heat');
select is(pg_temp.ride_round((select v::uuid from t where k = 'c9'), '10 - $r * 0.1 - $w * 0.4'), 1, 'round 1 ridden');
select is(pg_temp.shape((select v::uuid from t where k = 'c9')), '3,3,3 | 3,3', 'the last heat closed: round 2 is built (6 through: two heats of 3)');
select ok((select starts_at > now() from public.heats where contest_id = (select v::uuid from t where k = 'c9') and round = 2 limit 1), '... after a break');
select isnt((select seed from public.heats where contest_id = (select v::uuid from t where k = 'c9') and round = 2 limit 1),
            (select seed from public.heats where contest_id = (select v::uuid from t where k = 'c9') and round = 1 limit 1), '... with its own seed');
select ok((select bool_and(has_winner) from (select bool_or(e.seed_rank <= 3) has_winner from public.heat_entries he join public.heats h on h.id = he.heat_id join public.entrants e on e.id = he.entrant_id
           where h.contest_id = (select v::uuid from t where k = 'c9') and h.round = 2 group by h.id) x), 'round 2 spreads the heat winners across its heats');
select pg_temp.ride_round((select v::uuid from t where k = 'c9'), '10 - $r * 0.1 - $w * 0.4');
select is(pg_temp.shape((select v::uuid from t where k = 'c9')), '3,3,3 | 3,3 | 4', 'then a final of 4');
select is((select state from public.contests where id = (select v::uuid from t where k = 'c9')), 'running', '... still running');
select pg_temp.ride_round((select v::uuid from t where k = 'c9'), '10 - $r * 0.1 - $w * 0.4');
select is((select state from public.contests where id = (select v::uuid from t where k = 'c9')), 'done', 'the final closed: the contest is done');
select is((select e.name from public.heat_entries he join public.heats h on h.id = he.heat_id join public.entrants e on e.id = he.entrant_id
           where h.contest_id = (select v::uuid from t where k = 'c9') and h.round = 3 and he.place = 1), 'S1', '... won by the best surfer');

-- 12 and 16.
insert into t select 'c12', pg_temp.contest(12, 'Twelve');
select pg_temp.ride_round((select v::uuid from t where k = 'c12'), '10 - $r * 0.1 - $w * 0.4');
select pg_temp.ride_round((select v::uuid from t where k = 'c12'), '10 - $r * 0.1 - $w * 0.4');
select is(pg_temp.shape((select v::uuid from t where k = 'c12')), '4,4,4 | 3,3 | 4', '12: three heats of 4, two of 3, a final of 4');
insert into t select 'c16', pg_temp.contest(16, 'Sixteen');
select pg_temp.ride_round((select v::uuid from t where k = 'c16'), '10 - $r * 0.1 - $w * 0.4');
select pg_temp.ride_round((select v::uuid from t where k = 'c16'), '10 - $r * 0.1 - $w * 0.4');
select is(pg_temp.shape((select v::uuid from t where k = 'c16')), '4,4,4,4 | 4,4 | 4', '16: four heats of 4, two of 4, a final of 4');

-- A tie for the last place through goes to the best wave: in a heat of seeds 1, 4, 5 (5 surfers: heats of 3 and 2),
-- seed 4 rides 8 + 4 and seed 5 rides 6 + 6: both 12, and 4 goes through.
insert into t select 'c5', pg_temp.contest(5, 'Five');
select is(pg_temp.shape((select v::uuid from t where k = 'c5')), '3,2', '5: heats of 3 and 2');
select pg_temp.ride_round((select v::uuid from t where k = 'c5'),
  'case $r when 1 then 9 when 4 then (case $w when 1 then 8 else 4 end) when 5 then 6 when 2 then 7 else 5 end');
select is((select string_agg(e.seed_rank || ':' || he.place || ':' || he.advanced, ' ' order by e.seed_rank) from public.heat_entries he join public.heats h on h.id = he.heat_id join public.entrants e on e.id = he.entrant_id
           where h.contest_id = (select v::uuid from t where k = 'c5') and h.round = 1 and h.number = 1), '1:1:true 4:2:true 5:3:false', 'tied on 12: the better best wave goes through');
select is((select string_agg(e.seed_rank || ':' || he.place || ':' || he.advanced, ' ' order by e.seed_rank) from public.heat_entries he join public.heats h on h.id = he.heat_id join public.entrants e on e.id = he.entrant_id
           where h.contest_id = (select v::uuid from t where k = 'c5') and h.round = 1 and h.number = 2), '2:1:true 3:2:false', 'a heat of 2: only its winner goes through');
select is(pg_temp.shape((select v::uuid from t where k = 'c5')), '3,2 | 3', '... into a final of 3');

-- 2 to 4 a heat, always: 4 is one heat (a final, nobody marked through); 6, 7 and 8.
insert into t select 'c4', pg_temp.contest(4, 'Four');
select is(pg_temp.shape((select v::uuid from t where k = 'c4')), '4', '4: one heat');
select pg_temp.ride_round((select v::uuid from t where k = 'c4'), '10 - $r * 0.1 - $w * 0.4');
select is((select c.state || '/' || count(*) filter (where he.advanced is not null) from public.contests c join public.heats h on h.contest_id = c.id join public.heat_entries he on he.heat_id = h.id
           where c.id = (select v::uuid from t where k = 'c4') group by c.state), 'done/0', '... it''s the final: done, nobody "through"');
insert into t select 'c6', pg_temp.contest(6, 'Six');
insert into t select 'c7', pg_temp.contest(7, 'Seven');
insert into t select 'c8', pg_temp.contest(8, 'Eight');
select is(pg_temp.shape((select v::uuid from t where k = 'c6')) || ' / ' || pg_temp.shape((select v::uuid from t where k = 'c7')) || ' / ' || pg_temp.shape((select v::uuid from t where k = 'c8')),
  '3,3 / 3,4 / 4,4', '6, 7, 8: two heats each (7: snake order puts the 7th seed in heat 2)');
select pg_temp.ride_round((select v::uuid from t where k = 'c8'), '10 - $r * 0.1 - $w * 0.4');
select is(pg_temp.shape((select v::uuid from t where k = 'c8')), '4,4 | 4', '8: a final of 4');
select is((select max(n)::int from (select count(*) n from public.heat_entries he join public.heats h on h.id = he.heat_id
           where h.contest_id in (select v::uuid from t where k like 'c%') group by he.heat_id) x), 4, 'no heat anywhere has more than 4');
select is((select min(n)::int from (select count(*) n from public.heat_entries he join public.heats h on h.id = he.heat_id
           where h.contest_id in (select v::uuid from t where k like 'c%') group by he.heat_id) x), 2, '... or fewer than 2');

select * from finish();
rollback;
