-- Personal like/dislike on a watchlist item (null = no reaction yet).
alter table public.watchlist_items
  add column reaction text check (reaction in ('liked', 'disliked'));
