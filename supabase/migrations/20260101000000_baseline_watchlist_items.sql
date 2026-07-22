-- Baseline: watchlist_items and its enums, which predate this migration folder
-- (they were created via the dashboard). Reconstructed from the live schema so
-- `supabase db reset` produces a working database. The columns added later
-- (reaction, season_count, watched_seasons, watched_episodes, has_update) are
-- deliberately absent here — their own migrations add them on top.
--
-- Already applied in production; mark it so rather than re-running:
--   supabase migration repair --status applied 20260101000000

create type public.media_type as enum ('movie', 'series', 'anime');
create type public.external_source as enum ('tmdb', 'anilist');

create table public.watchlist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  type public.media_type not null,
  genres text[] not null,
  duration_minutes int,
  episode_count int,
  poster_url text,
  external_id text not null,
  external_source public.external_source not null,
  watched boolean not null default false,
  -- ponytail: `timestamp` (not timestamptz) mirrors production as-is. Migrating
  -- it to timestamptz is a separate, deliberate change — see notes.
  added_at timestamp not null default now(),
  release_date date,
  vote_average real,
  director text,
  overview text,
  constraint watchlist_items_unique_per_user unique (user_id, external_id, external_source)
);

alter table public.watchlist_items enable row level security;

-- ponytail: no separate index on user_id — the unique constraint above is a
-- btree with user_id leading, so `where user_id = ?` already uses it.

-- Owner-only access, as a single FOR ALL policy. A friend-readable SELECT
-- policy is layered on in 20260622090000; 20260722000000 then splits this into
-- explicit per-command policies so the two SELECT paths can be merged.
create policy "Users can manage their own watchlist" on public.watchlist_items
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
