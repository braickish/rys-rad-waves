-- No swearing, slurs, threats or vulgar words in handles or display names (the user, 2026-11-24).
--
-- The list lives in private.blocked_words (not readable by players; add rows to extend it, no code change). Matching:
--   - case and look-alike digits don't hide a word: 0 o, 1 i/l, 3 e, 4 a, 5 s, 7 t, 8 b, @ a, $ s
--   - stretched letters don't either (fuuuck), nor underscores or spaces between letters (f_u_c_k)
--   - `whole` words count only standing alone (a whole handle, or a part between underscores / spaces), because they
--     turn up inside innocent words: ass (grass, class), rape (grape), dick (Dickens), coon (raccoon), kill (skill).
-- Surf talk stays allowed: bomb (a big wave), kill it, killer waves, surf or die, Stab (the magazine).

create table private.blocked_words (
  word text primary key check (word ~ '^[a-z0-9]+$'),
  whole boolean not null default false
);
revoke all on private.blocked_words from public, anon, authenticated;

insert into private.blocked_words (word, whole) values
  -- swearing and vulgar
  ('fuck', false), ('fuk', true), ('fck', true), ('fcuk', false), ('shit', false), ('cunt', false), ('bitch', false),
  ('bastard', false), ('asshole', false), ('arsehole', false), ('dickhead', false), ('motherf', false), ('whore', false),
  ('slut', false), ('twat', false), ('wank', false), ('jizz', false), ('porn', false), ('pussy', false), ('bollocks', false),
  ('bellend', false), ('blowjob', false), ('handjob', false), ('orgasm', false), ('dildo', false), ('horny', false),
  ('milf', false), ('butthole', false), ('buttplug', false), ('boner', false), ('penis', false), ('vagina', false),
  ('erection', false), ('masturb', false), ('ejacul', false), ('piss', false), ('tits', true), ('titty', false),
  ('titties', false), ('boobs', true), ('ass', true), ('arse', true), ('asses', true), ('dick', true), ('dicks', true),
  ('cock', true), ('cocks', true), ('cum', true), ('sex', true), ('sexy', true), ('anal', true), ('anus', true),
  ('semen', true), ('clit', true), ('shag', true), ('prick', true), ('crap', true), ('damn', true), ('hell', true),
  ('hoe', true), ('hoes', true), ('nude', true), ('nudes', true), ('wtf', true), ('stfu', true), ('bj', true),
  -- slurs (racist, homophobic, ableist)
  ('nigger', false), ('nigga', false), ('niglet', false), ('faggot', false), ('fag', true), ('fags', true),
  ('retard', false), ('tranny', false), ('kike', false), ('wetback', false), ('beaner', false), ('towelhead', false),
  ('raghead', false), ('chink', true), ('chinks', true), ('spic', true), ('spics', true), ('gook', true), ('gooks', true),
  ('coon', true), ('coons', true), ('paki', true), ('pakis', true), ('dyke', true), ('homo', true), ('jigaboo', false),
  ('golliwog', false), ('kyke', false), ('zipperhead', false), ('cracker', true), ('gypsy', true),
  ('spaz', true), ('mong', true), ('nazi', false), ('hitler', false), ('heil', true), ('kkk', false), ('1488', false),
  ('whitepower', false), ('siegheil', false), ('jihad', false),
  -- threats and violence
  ('killyou', false), ('killu', true), ('murder', false), ('rape', true),
  ('raped', true), ('rapist', true), ('raping', false), ('molest', false), ('pedo', true), ('pedophile', false),
  ('paedo', true), ('kys', true), ('killyourself', false), ('suicide', false), ('shootup', false), ('shooter', true),
  ('terrorist', false), ('genocide', false), ('lynch', false), ('behead', false), ('gasthe', false);

-- The patterns: each letter may repeat (fuuuck). Kept as a function so the list stays plain words.
create function private.word_pattern(w text)
returns text
language sql
immutable
set search_path = ''
as $$ select regexp_replace(w, '(.)', '\1+', 'g') $$;

-- True when the text holds a blocked word. Runs as the database (players can't read the list).
create function private.text_blocked(t text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with forms as (
    -- the text in parts (anything not a letter or digit splits it), with look-alikes read both ways for 1 (i and l)
    select v from (values
      (regexp_replace(lower(coalesce(t, '')), '[^a-z0-9]+', '_', 'g')),
      (translate(regexp_replace(lower(coalesce(t, '')), '[^a-z0-9@$]+', '_', 'g'), '0134578@$', 'oieastbas')),
      (translate(regexp_replace(lower(coalesce(t, '')), '[^a-z0-9@$]+', '_', 'g'), '0134578@$', 'oleastbas'))
    ) f(v)
  )
  select exists (
    select 1 from private.blocked_words b, forms
    where case when b.whole
      then '_' || forms.v || '_' ~ ('_' || private.word_pattern(b.word) || '_')
        or replace(forms.v, '_', '') ~ ('^' || private.word_pattern(b.word) || '$')
      else replace(forms.v, '_', '') ~ private.word_pattern(b.word)
    end
  )
$$;

revoke all on function private.text_blocked(text) from public;
grant execute on function private.text_blocked(text) to anon, authenticated;

-- The gate: a blocked handle or name is refused (check_violation, so the client treats it like the other rules).
create function private.profiles_words()
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
  return new;
end;
$$;

create trigger profiles_words before insert or update of handle, display_name on public.profiles
  for each row execute function private.profiles_words();

-- handle_problem gains 'blocked' (before 'taken', so a blocked handle never says it exists).
create or replace function public.handle_problem(h text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when char_length(h) < 3 then 'short'
    when char_length(h) > 20 then 'long'
    when h !~ '^[a-z0-9_]+$' then 'chars'
    when h !~ '^[a-z]' then 'start'
    when private.handle_reserved(h) then 'reserved'
    when private.text_blocked(h) then 'blocked'
    when exists (select 1 from public.profiles p
                 where private.handle_key(p.handle) = private.handle_key(h) and p.id is distinct from auth.uid()) then 'taken'
  end
$$;

-- For the account page's name box: is this name OK to show?
create function public.name_blocked(n text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select private.text_blocked(n) $$;

revoke all on function public.name_blocked(text) from public;
grant execute on function public.name_blocked(text) to anon, authenticated;
