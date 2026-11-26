-- A third bikini cut between full and cheeky (the user, 2026-11-25): 'classic', a standard bikini.
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
                       and not (e.key = 'cut' and e.value #>> '{}' in ('full', 'classic', 'cheeky')))
$$;
