-- Episode-level progress for shows TMDB flattens into one season (most anime).
-- `episode_count` (existing column) is repurposed to hold TMDB's real
-- number_of_episodes; `watched_episodes` is how far the owner has watched.
alter table public.watchlist_items
  add column watched_episodes int not null default 0;
