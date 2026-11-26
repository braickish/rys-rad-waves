-- Surfer styling (accounts plan task 16, Pro): profiles.styling (there since task 5, empty) becomes yours to set while
-- you have Pro: { suit, shorts, board, nose: colour ids; pattern: stripes | floral } (src/styling.js). Only those keys
-- and values; anything else is refused. When Pro lapses it stays saved (the game just stops wearing it) and can be
-- cleared, but not changed.
create function private.styling_ok(s jsonb)
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
                       and not (e.key = 'pattern' and e.value #>> '{}' in ('stripes', 'floral')))
$$;

create function private.profiles_styling()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.styling is distinct from (case when tg_op = 'UPDATE' then old.styling else '{}'::jsonb end) then
    if not private.styling_ok(new.styling) then
      raise exception 'styling_bad' using errcode = '23514', constraint = 'styling_bad';
    end if;
    if new.styling <> '{}'::jsonb and not private.user_has_entitlement(new.id, 'pro') then
      raise exception 'styling_pro' using errcode = '23514', constraint = 'styling_pro';
    end if;
  end if;
  return new;
end;
$$;
create trigger profiles_styling before insert or update of styling on public.profiles
  for each row execute function private.profiles_styling();

grant update (styling) on public.profiles to authenticated;
