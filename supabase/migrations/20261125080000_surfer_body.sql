-- Which surfer you are, and the bikini's cut (the user, 2026-11-25; accounts plan task 16).
-- * profiles.surfer: 'guy' (male) or 'girl' (female), null for each wave's own. Free for everyone: it's who you are, not
--   a Pro extra. Worn in your rides and carried in their recordings.
-- * styling.cut: 'full' or 'cheeky' (the bikini; Pro, like the rest of styling).
alter table public.profiles add column surfer text constraint surfer_body check (surfer is null or surfer in ('guy', 'girl'));
grant insert (surfer) on public.profiles to authenticated;
grant update (surfer) on public.profiles to authenticated;

create or replace function private.styling_ok(s jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(s) = 'object'
     and not exists (select 1 from jsonb_each(s) e
                     where not (e.key in ('suit', 'shorts', 'board', 'nose')
                                and e.value #>> '{}' in ('black', 'charcoal', 'white', 'navy', 'blue', 'sky', 'teal', 'green',
                                                          'yellow', 'orange', 'red', 'pink', 'purple', 'sand'))
                       and not (e.key = 'pattern' and e.value #>> '{}' in ('stripes', 'floral'))
                       and not (e.key = 'cut' and e.value #>> '{}' in ('full', 'cheeky')))
$$;
