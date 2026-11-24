-- Ry's Rad Waves accounts (plan: plans/2026-11-23-accounts-and-paid-plans.md, task 4).
--
-- Sign-in is a magic link only (and anonymous sessions for contest guests). Supabase has no switch to turn
-- off email + password sign-in, so any password set by a sign-up, an admin or a password change is erased
-- before it is stored. Password sign-in then always fails.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create function private.strip_password()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.encrypted_password := '';
  return new;
end;
$$;

revoke all on function private.strip_password() from public, anon, authenticated;

create trigger strip_password before insert or update of encrypted_password on auth.users
  for each row execute function private.strip_password();
