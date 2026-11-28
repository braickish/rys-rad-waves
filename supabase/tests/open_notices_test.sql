-- npm run test:db: Open contests, step 6 (plans/2026-11-27-open-contests.md): reminder emails. The tick queues round 1
-- open, closing soon (not surfed), and results, once each, members who haven't turned them off; take_notices claims
-- them for the Edge Function (the service role only) with what each says; a failed one goes back.
begin;
select plan(13);

insert into auth.users (id, email, aud, role, is_anonymous)
select ('c6000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, 'nsurf' || i || '@example.com', 'authenticated', 'authenticated', false
from generate_series(0, 3) i;
insert into public.profiles (id, handle) select ('c6000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, 'nsurf' || i from generate_series(0, 3) i;
select private.grant_entitlement('nsurf0@example.com', 'pro', interval '30 days');
update public.profiles set contest_emails = false where handle = 'nsurf3';
create function pg_temp.as_user(i int) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', 'c6000000-0000-0000-0000-' || lpad(i::text, 12, '0'), 'role', 'authenticated')::text, true)
$$;
create function pg_temp.kinds() returns text language sql as $$
  select coalesce(string_agg(p.handle || ':' || n.kind, ' ' order by p.handle, n.kind), '') from private.notices n join public.profiles p on p.id = n.user_id
$$;
create temp table t (k text primary key, v text);

select pg_temp.as_user(0);
insert into t select 'c', (public.create_contest('Notice Me', wave => 'point', end_waves => 1, mode => 'open', entry => 'open', round_hours => '{8}')).id;
select pg_temp.as_user(i), public.join_contest((select code from public.contests where id = (select v::uuid from t where k = 'c'))) from generate_series(1, 3) i;
select is(private.queue_notices(), 0, 'sign-up: nothing to say yet');
select pg_temp.as_user(0);
select public.start_contest((select v::uuid from t where k = 'c'));
insert into t select 'h', id from public.heats where contest_id = (select v::uuid from t where k = 'c');
select is(private.queue_notices(), 2, 'round 1 opens: an email each');
select is(pg_temp.kinds(), 'nsurf1:round_open nsurf2:round_open', '... not to whoever turned them off');
select is(private.queue_notices(), 0, 'once each');

-- 8-hour window: closing soon is the last 2 hours (a quarter); nsurf1 surfs first
select pg_temp.as_user(1);
select public.start_my_heat((select v::uuid from t where k = 'h'));
update public.heats set starts_at = now() - interval '6 hours 30 minutes', window_ends_at = now() + interval '1 hour 30 minutes' where id = (select v::uuid from t where k = 'h');
select is(private.queue_notices(), 1, 'closing soon: only to who hasn''t surfed');
select ok(pg_temp.kinds() like '%nsurf2:closing_soon%', '... nsurf2');

-- the claim (the Edge Function, as the service role)
set local role authenticated;
select throws_ok($$ select public.take_notices(10) $$, '42501', null, 'nobody else can take them');
reset role;
set local role service_role;
select is(jsonb_array_length(public.take_notices(10)), 3, 'the service role takes the three');
select is(jsonb_array_length(public.take_notices(10)), 0, '... once');
reset role;
select is((select (public.take_notices(1)) from (select 1) x), '[]'::jsonb, '(nothing left)') ;
update private.notices set sent_at = null, tries = 1 where kind = 'closing_soon';
set local role service_role;
select is((public.take_notices(10) -> 0 ->> 'kind'), 'closing_soon', 'a failed one goes back, with what to say');
reset role;

-- results
select pg_temp.as_user(1);
select public.submit_ride((select v::uuid from t where k = 'h'), 1, 6, array[6,6,6,6,6]::numeric[], 0);
select public.finish_heat((select v::uuid from t where k = 'h'));
update public.heats set window_ends_at = now() - interval '1 second' where id = (select v::uuid from t where k = 'h');
select private.close_heat_now((select v::uuid from t where k = 'h'), true);
select is(private.queue_notices(), 2, 'the heat closes: results to both');
set local role service_role;
select is((select string_agg((x ->> 'handle') || ' ' || (x -> 'me' ->> 'place') || ' ' || (x -> 'heat' ->> 'final') || ' ' || coalesce(x ->> 'winner', '-'), ', ' order by x ->> 'handle')
           from jsonb_array_elements(public.take_notices(10)) x), 'nsurf1 1 true nsurf1, nsurf2 2 true nsurf1', 'what they say: your place, the final, the winner');
reset role;

select * from finish();
rollback;
