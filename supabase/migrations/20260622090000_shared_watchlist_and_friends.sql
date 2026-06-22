-- ── profiles ────────────────────────────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text,
  avatar_url text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Create a profile row automatically when a user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, avatar_url)
  values (new.id, new.raw_user_meta_data->>'avatar_url');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── friendships ───────────────────────────────────────────────────────────--
create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  user_a_id uuid not null references auth.users(id) on delete cascade,
  user_b_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_a_id, user_b_id),
  check (user_a_id < user_b_id)
);
alter table public.friendships enable row level security;
create index friendships_user_a_idx on public.friendships(user_a_id);
create index friendships_user_b_idx on public.friendships(user_b_id);

-- ── friend invites ──────────────────────────────────────────────────────────
create table public.friend_invites (
  token text primary key,
  inviter_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_by uuid references auth.users(id)
);
alter table public.friend_invites enable row level security;

-- ── RLS: profiles ─────────────────────────────────────────────────────────--
create policy "profiles_select_self_or_friend" on public.profiles
for select using (
  id = auth.uid()
  or exists (
    select 1 from public.friendships f
    where (f.user_a_id = auth.uid() and f.user_b_id = profiles.id)
       or (f.user_b_id = auth.uid() and f.user_a_id = profiles.id)
  )
);

create policy "profiles_update_self" on public.profiles
for update using (id = auth.uid()) with check (id = auth.uid());

-- ── RLS: friendships ──────────────────────────────────────────────────────--
create policy "friendships_select_member" on public.friendships
for select using (user_a_id = auth.uid() or user_b_id = auth.uid());

create policy "friendships_delete_member" on public.friendships
for delete using (user_a_id = auth.uid() or user_b_id = auth.uid());

-- ── RLS: friend_invites ───────────────────────────────────────────────────--
create policy "friend_invites_insert_self" on public.friend_invites
for insert with check (inviter_id = auth.uid());

create policy "friend_invites_select_inviter" on public.friend_invites
for select using (inviter_id = auth.uid());

-- ── RLS: watchlist_items (additive read for friends) ──────────────────────--
create policy "watchlist_items_select_friends" on public.watchlist_items
for select using (
  exists (
    select 1 from public.friendships f
    where (f.user_a_id = auth.uid() and f.user_b_id = watchlist_items.user_id)
       or (f.user_b_id = auth.uid() and f.user_a_id = watchlist_items.user_id)
  )
);

-- ── accept_friend_invite RPC ──────────────────────────────────────────────--
create or replace function public.accept_friend_invite(invite_token text)
returns text
language plpgsql
security definer set search_path = ''
as $$
declare
  inv public.friend_invites%rowtype;
  me uuid := auth.uid();
  a uuid;
  b uuid;
begin
  if me is null then
    return 'unauthenticated';
  end if;

  select * into inv from public.friend_invites where token = invite_token;
  if not found then
    return 'invalid';
  end if;
  if inv.accepted_by is not null then
    return 'used';
  end if;
  if inv.expires_at < now() then
    return 'expired';
  end if;
  if inv.inviter_id = me then
    return 'self';
  end if;

  -- Canonical ordering keeps the UNIQUE(user_a_id, user_b_id) pair stable.
  if inv.inviter_id < me then
    a := inv.inviter_id; b := me;
  else
    a := me; b := inv.inviter_id;
  end if;

  insert into public.friendships (user_a_id, user_b_id)
  values (a, b)
  on conflict (user_a_id, user_b_id) do nothing;

  update public.friend_invites set accepted_by = me where token = invite_token;

  return 'ok';
end;
$$;

grant execute on function public.accept_friend_invite(text) to authenticated;
