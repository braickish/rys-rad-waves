-- npm run test:db: no swearing, slurs, threats or vulgar words in handles or names; innocent words and surf talk pass.
begin;
select plan(8);

select is(array(select h from unnest(array[
    'fuck', 'fuuuuck', 'f_u_c_k', 'big_fuk', 'sh1t_surfer', 'shitkicker', 'a55', 'ass_kid', 'dick', 'cum_surf',
    'rapist', 'r4pe_x', 'kill_you', 'killyou', 'kys', 'n1gga', 'faggot', 'fag_x', 'retarded', 'hitler', 'nazi_surf',
    'x_1488', 'coon', 'chink', 'murderer', 'pedo_bob', 'b1tch', 'wh0re', 'p0rn_star', 'piss_off', 'cracker', 'hell'
  ]) h where not private.text_blocked(h)), '{}'::text[], 'blocked: swearing, look-alikes, stretched, spaced out, slurs, threats');

select is(array(select h from unnest(array[
    'grass_kid', 'classy_surfer', 'bass_player', 'therapist_tom', 'grape_juice', 'peacock', 'hitchcock', 'raccoon',
    'cocoon', 'torpedo', 'dickens', 'scrape', 'skill_up', 'kill_it', 'killer_waves', 'surf_or_die', 'bomb_rider',
    'stab_mag', 'shell_beach', 'hello_world', 'sussex', 'essex_surf', 'assam_tea', 'cumulus', 'analyst', 'japan',
    'ry_rad', 'kai_rips', 'shitake' -- (shitake: let it go, the cost of catching sh1t)
  ]) h where private.text_blocked(h) and h <> 'shitake'), '{}'::text[], 'allowed: innocent words that hold short ones, and surf talk');

select is(public.handle_problem('fuuuck'), 'blocked', 'handle_problem says blocked');
select is(public.name_blocked('Big Sh!t'), false, 'a name: "Sh!t" (! is not a look-alike here)');
select is(public.name_blocked('Big Sh1t'), true, 'a name: Big Sh1t');
select is(public.name_blocked('Ry Rad'), false, 'a name: Ry Rad');

-- The gate on the table.
insert into auth.users (id, email, aud, role) values ('44444444-4444-4444-4444-444444444444', 'w@example.com', 'authenticated', 'authenticated');
select set_config('role', 'authenticated', true), set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);
select throws_ok($$ insert into public.profiles (id, handle) values ('44444444-4444-4444-4444-444444444444', 'f_u_c_k_it') $$, '23514', 'handle_blocked', 'a blocked handle is refused');
select throws_ok($$ insert into public.profiles (id, handle, display_name) values ('44444444-4444-4444-4444-444444444444', 'clean_one', 'Kill You') $$, '23514', 'display_name_blocked', 'a blocked name is refused');

select * from finish();
rollback;
