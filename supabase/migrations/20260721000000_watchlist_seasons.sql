-- Optional per-season progress for series/anime. Movies leave both null/empty.
-- `watched` stays the single source of truth for the Not Watched filter: a
-- partially-watched series keeps watched=false, so it still shows up there.
alter table public.watchlist_items
  add column season_count int,
  add column watched_seasons int[] not null default '{}';
