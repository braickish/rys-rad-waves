-- npm run test:db: magic link only, checked inside the database.
begin;
select plan(3);

select has_trigger('auth', 'users', 'strip_password', 'auth.users has the strip_password trigger');

insert into auth.users (id, email, encrypted_password, aud, role)
values ('00000000-0000-0000-0000-000000000001', 'pw@example.com', crypt('secret-pass-1', gen_salt('bf')), 'authenticated', 'authenticated');
select is((select encrypted_password from auth.users where email = 'pw@example.com'), '',
  'a password given at sign-up is not stored');

update auth.users set encrypted_password = crypt('another-pass-2', gen_salt('bf')) where email = 'pw@example.com';
select is((select encrypted_password from auth.users where email = 'pw@example.com'), '',
  'a password set later is not stored');

select * from finish();
rollback;
