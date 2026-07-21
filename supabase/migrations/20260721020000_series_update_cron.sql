-- "New season" tracking: a nightly job un-marks finished shows that gained a
-- new aired season and flags them so the UI can badge them.

alter table public.watchlist_items
  add column has_update boolean not null default false;

-- Extensions for scheduling an HTTP call to the edge function.
-- ponytail: if these error under `db push`, enable pg_cron + pg_net once via
-- Dashboard → Database → Extensions, then re-run just the cron.schedule below.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Nightly at 06:00 UTC. URL + keys are read from Vault at run time (no secrets
-- committed here). One-time setup before this fires — run in the SQL editor:
--
--   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
--   select vault.create_secret('<publishable-or-anon-key>',          'anon_key');
--   select vault.create_secret('<a-long-random-string>',             'cron_secret');
--
-- and set the function's own secrets (service key + url are auto-injected):
--   supabase secrets set TMDB_API_KEY=<key> CRON_SECRET=<same-random-string>
--
-- Re-running cron.schedule with the same name updates the existing job.
select cron.schedule(
  'refresh-series-progress',
  '0 6 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
           || '/functions/v1/refresh-series',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'anon_key'),
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
