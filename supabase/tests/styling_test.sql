-- npm run test:db: surfer styling (accounts plan task 16). Pro sets it, from the known parts, colours and cuts only;
-- without Pro it can't be set; when Pro lapses it stays, can be cleared, and can't be changed. Which surfer (male or
-- female) is free for everyone.
begin;
select plan(13);

insert into auth.users (id, email, aud, role, is_anonymous) values
  ('a2000000-0000-0000-0000-000000000001', 'stylepro@example.com', 'authenticated', 'authenticated', false),
  ('a2000000-0000-0000-0000-000000000002', 'stylefree@example.com', 'authenticated', 'authenticated', false);
insert into public.profiles (id, handle) values ('a2000000-0000-0000-0000-000000000001', 'style_pro'), ('a2000000-0000-0000-0000-000000000002', 'style_free');
select private.grant_entitlement('stylepro@example.com', 'pro', interval '30 days');
create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true), set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true)
$$;

select pg_temp.act_as('a2000000-0000-0000-0000-000000000002');
select throws_ok($$ update public.profiles set styling = '{"suit":"red"}' where id = 'a2000000-0000-0000-0000-000000000002' $$, '23514', null, 'without Pro: no styling');

select pg_temp.act_as('a2000000-0000-0000-0000-000000000001');
select lives_ok($$ update public.profiles set styling = '{"suit":"red","shorts":"pink","pattern":"stripes","board":"yellow","nose":"teal"}' where id = 'a2000000-0000-0000-0000-000000000001' $$, 'Pro: the whole look');
select is((select styling ->> 'pattern' from public.profiles where id = 'a2000000-0000-0000-0000-000000000001'), 'stripes', '... saved');
select throws_ok($$ update public.profiles set styling = '{"suit":"#ff0000"}' where id = 'a2000000-0000-0000-0000-000000000001' $$, '23514', null, 'only the palette''s colours');
select throws_ok($$ update public.profiles set styling = '{"hat":"red"}' where id = 'a2000000-0000-0000-0000-000000000001' $$, '23514', null, 'only the known parts');
select throws_ok($$ update public.profiles set styling = '{"pattern":"plaid"}' where id = 'a2000000-0000-0000-0000-000000000001' $$, '23514', null, 'only the known patterns');

select lives_ok($$ update public.profiles set styling = '{"shorts":"pink","cut":"cheeky"}' where id = 'a2000000-0000-0000-0000-000000000001' $$, 'a cheeky bikini cut (Pro)');
select throws_ok($$ update public.profiles set styling = '{"cut":"thong"}' where id = 'a2000000-0000-0000-0000-000000000001' $$, '23514', null, 'only the known cuts');

-- Which surfer: free for everyone.
select pg_temp.act_as('a2000000-0000-0000-0000-000000000002');
select lives_ok($$ update public.profiles set surfer = 'girl' where id = 'a2000000-0000-0000-0000-000000000002' $$, 'without Pro: pick your surfer');
select is((select surfer from public.profiles where id = 'a2000000-0000-0000-0000-000000000002'), 'girl', '... saved');
select throws_ok($$ update public.profiles set surfer = 'shark' where id = 'a2000000-0000-0000-0000-000000000002' $$, '23514', null, 'male or female only');
select pg_temp.act_as('a2000000-0000-0000-0000-000000000001');

reset role;
update public.entitlements set status = 'canceled', expires_at = now() - interval '1 hour' where user_id = 'a2000000-0000-0000-0000-000000000001';
select pg_temp.act_as('a2000000-0000-0000-0000-000000000001');
select throws_ok($$ update public.profiles set styling = '{"suit":"blue"}' where id = 'a2000000-0000-0000-0000-000000000001' $$, '23514', null, 'Pro lapsed: no changes');
select lives_ok($$ update public.profiles set styling = '{}' where id = 'a2000000-0000-0000-0000-000000000001' $$, '... but you can clear it');

select * from finish();
rollback;
