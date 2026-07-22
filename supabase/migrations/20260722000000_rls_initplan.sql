-- RLS performance pass. Two changes, no behaviour change:
--
--   1. `auth.uid()` -> `(select auth.uid())`. Bare auth.uid() is re-evaluated
--      once per row; wrapped in a subquery the planner hoists it to an InitPlan
--      and evaluates it once per statement.
--   2. watchlist_items had two permissive SELECT policies (own + friends).
--      Postgres ORs them but still evaluates both per row, so they are merged
--      into one.
--
-- Policies are dropped by enumeration rather than by name: some of these were
-- created through the dashboard, so their names here are not authoritative.
do $$
declare p record;
begin
  for p in
    select policyname, tablename from pg_policies
    where schemaname = 'public'
      and tablename in ('watchlist_items', 'profiles', 'friendships', 'friend_invites')
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

-- ── watchlist_items ─────────────────────────────────────────────────────────
create policy "watchlist_items_select_own_or_friend" on public.watchlist_items
for select using (
  user_id = (select auth.uid())
  or exists (
    select 1 from public.friendships f
    where (f.user_a_id = (select auth.uid()) and f.user_b_id = watchlist_items.user_id)
       or (f.user_b_id = (select auth.uid()) and f.user_a_id = watchlist_items.user_id)
  )
);

create policy "watchlist_items_insert_own" on public.watchlist_items
for insert with check (user_id = (select auth.uid()));

create policy "watchlist_items_update_own" on public.watchlist_items
for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "watchlist_items_delete_own" on public.watchlist_items
for delete using (user_id = (select auth.uid()));

-- ── profiles ────────────────────────────────────────────────────────────────
create policy "profiles_select_self_or_friend" on public.profiles
for select using (
  id = (select auth.uid())
  or exists (
    select 1 from public.friendships f
    where (f.user_a_id = (select auth.uid()) and f.user_b_id = profiles.id)
       or (f.user_b_id = (select auth.uid()) and f.user_a_id = profiles.id)
  )
);

create policy "profiles_update_self" on public.profiles
for update using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- ── friendships ─────────────────────────────────────────────────────────────
-- No INSERT policy by design: rows are only created by accept_friend_invite,
-- which is security definer.
create policy "friendships_select_member" on public.friendships
for select using (user_a_id = (select auth.uid()) or user_b_id = (select auth.uid()));

create policy "friendships_delete_member" on public.friendships
for delete using (user_a_id = (select auth.uid()) or user_b_id = (select auth.uid()));

-- ── friend_invites ──────────────────────────────────────────────────────────
-- Reading an invite by token is done by accept_friend_invite (security
-- definer), so the accepter needs no SELECT grant here.
create policy "friend_invites_insert_self" on public.friend_invites
for insert with check (inviter_id = (select auth.uid()));

create policy "friend_invites_select_inviter" on public.friend_invites
for select using (inviter_id = (select auth.uid()));
