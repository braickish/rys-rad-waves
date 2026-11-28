-- The check-rides Edge Function (accounts plan task 15) reads waiting checks with the service role and writes their
-- verdicts. On the cloud project service_role has no table privileges in public by default (the local stack grants it
-- everything, so the tests never saw it), and every call failed with "permission denied for table ride_checks".
-- Found 2026-11-27 while wiring the Open contests scheduler to it. Only what the function uses:
grant select on public.ride_checks, public.rides, public.heats, public.contests to service_role;
grant update (status, score, drift, reasons, note, checked_at) on public.ride_checks to service_role;
