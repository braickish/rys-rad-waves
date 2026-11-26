-- Score checks (accounts plan task 15). Every submitted wave gets a check: its ride log is ridden again on the server
-- (the check-rides Edge Function, src/ride-check.js) and compared with what was submitted. For now it only flags:
-- nothing is changed or removed, and only the contest's host sees the flags (on the contest page).
--
--   status   pending (waiting), ok, flagged (see reasons), no_log (submitted without a ride log), error (couldn't run)
--   reasons  short codes: drift (the ride doesn't follow its own log), score (a different score), log_score (the log's
--            own score differs), wrong_wave / wrong_break / wrong_sea / wrong_judges (not this contest's wave, sea or
--            judges), settings (unusual physics settings), wont_run (not a ride log the game can play)

create table public.ride_checks (
  ride_id uuid primary key references public.rides (id) on delete cascade,
  status text not null check (status in ('pending', 'ok', 'flagged', 'no_log', 'error')),
  score numeric(4, 2),       -- (the re-run's judged score)
  drift numeric,             -- (the largest gap from the log at a checkpoint)
  reasons text[] not null default '{}',
  note text,
  checked_at timestamptz
);
create index ride_checks_pending on public.ride_checks (ride_id) where status = 'pending';

alter table public.ride_checks enable row level security;
create policy "the contest's host" on public.ride_checks for select to authenticated
  using (exists (select 1 from public.rides r join public.heats h on h.id = r.heat_id join public.contests c on c.id = h.contest_id
                 where r.id = ride_id and c.host = (select auth.uid())));
revoke all on public.ride_checks from anon, authenticated;
grant select on public.ride_checks to authenticated;

-- A check for every wave as it comes in.
create function private.ride_check_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.ride_checks (ride_id, status) values (new.id, case when new.replay_path is null then 'no_log' else 'pending' end)
  on conflict (ride_id) do nothing;
  return new;
end;
$$;
create trigger rides_check after insert on public.rides for each row execute function private.ride_check_row();

-- (waves already in: checked from now on, those with logs)
insert into public.ride_checks (ride_id, status)
select r.id, case when r.replay_path is null then 'no_log' else 'pending' end from public.rides r
on conflict (ride_id) do nothing;
