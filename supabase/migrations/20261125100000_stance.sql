-- Regular or goofy (the user, 2026-11-25): profiles.stance, 'regular' (left foot forward) or 'goofy' (right foot
-- forward), null for each wave's own (frontside). Free for everyone, like the surfer's body. Worn in your rides and
-- carried in their recordings.
alter table public.profiles add column stance text constraint stance_foot check (stance is null or stance in ('regular', 'goofy'));
grant insert (stance) on public.profiles to authenticated;
grant update (stance) on public.profiles to authenticated;
