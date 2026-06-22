-- Enable Realtime on friendships so both sides update live when a friendship is
-- created (invite accepted) or removed. RLS still scopes which rows each user
-- receives, so users only get change events for friendships they belong to.
alter publication supabase_realtime add table public.friendships;
