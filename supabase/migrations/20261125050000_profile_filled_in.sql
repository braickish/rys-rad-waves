-- The profile filled in (accounts plan task 14), and where people surf from (the user, 2026-11-25).
--
-- * profiles.country (ISO 3166-1 alpha-2), city, and the city's place on the map (lat/lng to 2 decimals, about a km:
--   the town's own coordinates from the geocoder, never the player's). All optional, all public (shown on your page).
-- * player_places(): how many surfers in each town (and each country), for the map. Counts only, no handles.
-- * profile_results(handle): a surfer's results in public contests that are over, for their page.

alter table public.profiles
  add column country text constraint country_code check (country is null or country ~ '^[A-Z]{2}$'),
  add column city text constraint city_length check (city is null or char_length(city) between 1 and 60),
  add column lat numeric(5, 2) constraint lat_range check (lat is null or lat between -90 and 90),
  add column lng numeric(5, 2) constraint lng_range check (lng is null or lng between -180 and 180),
  add constraint place_whole check ((lat is null) = (lng is null) and (lat is null or city is not null));

grant insert (country, city, lat, lng) on public.profiles to authenticated;
grant update (country, city, lat, lng) on public.profiles to authenticated;

-- Town names stay clean too, as names and handles do.
create or replace function private.profiles_words()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.text_blocked(new.handle) then
    raise exception 'handle_blocked' using errcode = '23514', constraint = 'handle_blocked';
  end if;
  if new.display_name is not null and private.text_blocked(new.display_name) then
    raise exception 'display_name_blocked' using errcode = '23514', constraint = 'display_name_blocked';
  end if;
  new.city := nullif(btrim(regexp_replace(coalesce(new.city, ''), '\s+', ' ', 'g')), '');
  if new.city is not null and private.text_blocked(new.city) then
    raise exception 'city_blocked' using errcode = '23514', constraint = 'city_blocked';
  end if;
  if new.city is null then new.lat := null; new.lng := null; end if;
  return new;
end;
$$;
drop trigger profiles_words on public.profiles;
create trigger profiles_words before insert or update of handle, display_name, city, lat, lng on public.profiles
  for each row execute function private.profiles_words();

-- The map: surfers per town (towns with a place), and per country (everyone who gave one).
create function public.player_places()
returns table (country text, city text, lat numeric, lng numeric, players int)
language sql
stable
security definer
set search_path = ''
as $$
  select p.country, min(p.city), p.lat, p.lng, count(*)::int
  from public.profiles p where p.lat is not null
  group by p.country, lower(p.city), p.lat, p.lng
  union all
  select p.country, null, null, null, count(*)::int
  from public.profiles p where p.country is not null
  group by p.country
$$;
revoke all on function public.player_places() from public;
grant execute on function public.player_places() to anon, authenticated;

-- A surfer's results in public contests that are over: the contest, when, how far they got (the last round they
-- surfed, and whether it was the final), their place and total there.
create function public.profile_results(handle text)
returns table (code text, name text, ended_at timestamptz, spot_wave text, spot_name text, entrants int,
               round int, final boolean, place int, total numeric)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select p.id from public.profiles p where p.handle = lower(profile_results.handle)),
  last_heat as (
    select distinct on (c.id) c.id as contest_id, h.round, he.place, he.total,
           (select count(*) from public.heats x where x.contest_id = c.id and x.round = h.round) = 1 as final
    from public.contests c
    join public.entrants e on e.contest_id = c.id and e.user_id = (select id from me)
    join public.heat_entries he on he.entrant_id = e.id
    join public.heats h on h.id = he.heat_id
    where c.visibility = 'public' and c.state = 'done'
    order by c.id, h.round desc
  )
  select c.code, c.name, c.ended_at, c.spot ->> 'wave', c.spot ->> 'name',
         (select count(*)::int from public.entrants x where x.contest_id = c.id), l.round, l.final, l.place, l.total
  from last_heat l join public.contests c on c.id = l.contest_id
  order by c.ended_at desc nulls last
  limit 50
$$;
revoke all on function public.profile_results(text) from public;
grant execute on function public.profile_results(text) to anon, authenticated;
