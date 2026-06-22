# Shared Watchlist & Friends Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let two users become durable friends via an invite link, view each other's watchlists merged into a "Shared" tab (overlap highlighted), and decide what to watch together with a this-or-that tournament.

**Architecture:** A Supabase migration adds `profiles`, `friend_invites`, and `friendships` tables, a signup trigger, extended RLS so friends can read each other's `watchlist_items`, and a security-definer `accept_friend_invite` RPC. The Angular app gains a `ProfileService` + one-time username modal, a `FriendsService`, an `/invite/:token` accept route, and a `WatchlistShared` tab whose merge and tournament logic live in pure, unit-tested functions.

**Tech Stack:** Angular 21 (standalone components, signals, RxJS), Angular Material, Supabase (Postgres + RLS + RPC), Vitest.

---

## File Structure

**Create:**
- `supabase/migrations/20260622090000_shared_watchlist_and_friends.sql` — all DB changes
- `src/app/core/models/profile.model.ts` — `Profile`
- `src/app/core/models/friend.model.ts` — `FriendInvite`, `AcceptInviteOutcome`
- `src/app/core/models/shared-pool.model.ts` — `SharedPoolEntry`, `PoolOwner`
- `src/app/core/services/profile.service.ts` — current user's profile state
- `src/app/core/services/friends.service.ts` — invites, friendships, friend watchlists
- `src/app/core/services/accept-invite.util.ts` (+ `.spec.ts`) — pure RPC-result mapper
- `src/app/features/watchlist/watchlist-shared/shared-pool.ts` (+ `.spec.ts`) — pure merge logic
- `src/app/features/watchlist/watchlist-shared/tournament.ts` (+ `.spec.ts`) — pure bracket logic
- `src/app/features/auth/username-dialog/username-dialog.{ts,html,scss}` — one-time username modal
- `src/app/features/watchlist/watchlist-shared/watchlist-shared.{ts,html,scss}` — Shared tab
- `src/app/features/watchlist/watchlist-tournament-dialog/watchlist-tournament-dialog.{ts,html,scss}` — tournament UI
- `src/app/features/invite/invite.{ts,html,scss}` — `/invite/:token` accept screen

**Modify:**
- `src/app/core/services/supabase.service.ts` — add optional `redirectTo` to `signInWithGoogle`
- `src/app/app.routes.ts` — add public `invite/:token` route
- `src/app/features/watchlist/watchlist.ts` — load profile + open username modal; add shared tab index handling
- `src/app/features/watchlist/watchlist.html` — Shared mobile tab + desktop column
- `src/app/features/watchlist/watchlist.scss` — third desktop column

---

## Supabase configuration prerequisite (manual, one-time)

In the Supabase dashboard → Authentication → URL Configuration → **Redirect URLs**, add the invite path for every origin the app runs on, e.g. `http://localhost:4200/invite/*` and `https://<your-prod-domain>/invite/*`. Without this, the post-login redirect back to an invite link is rejected. This is a dashboard action, not code.

---

## Task 1: Database migration

**Files:**
- Create: `supabase/migrations/20260622090000_shared_watchlist_and_friends.sql`

- [ ] **Step 1: Write the migration**

```sql
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
```

- [ ] **Step 2: Apply the migration**

Run it against your Supabase project — either `supabase db push` (if the CLI is linked) or paste the file contents into the Supabase dashboard SQL editor and run.
Expected: no errors; tables `profiles`, `friendships`, `friend_invites` exist, and `accept_friend_invite` appears under Database → Functions.

- [ ] **Step 3: Manually verify the signup trigger**

In the SQL editor: `select id, username, avatar_url from public.profiles;`
Expected: one row per existing auth user (the trigger only fires for *new* signups, so for pre-existing users run the backfill once):

```sql
insert into public.profiles (id, avatar_url)
select u.id, u.raw_user_meta_data->>'avatar_url'
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260622090000_shared_watchlist_and_friends.sql
git commit -m "feat(db): add profiles, friendships, friend_invites + RLS and accept RPC"
```

---

## Task 2: Models

**Files:**
- Create: `src/app/core/models/profile.model.ts`
- Create: `src/app/core/models/friend.model.ts`
- Create: `src/app/core/models/shared-pool.model.ts`

- [ ] **Step 1: Write `profile.model.ts`**

```typescript
export interface Profile {
  id: string;
  username: string | null;
  avatar_url: string | null;
  created_at: string;
}
```

- [ ] **Step 2: Write `friend.model.ts`**

```typescript
export interface FriendInvite {
  token: string;
  inviter_id: string;
  created_at: string;
  expires_at: string;
  accepted_by: string | null;
}

/** Result of accept_friend_invite — mirrors the RPC's return strings. */
export type AcceptInviteOutcome =
  | 'ok'
  | 'invalid'
  | 'used'
  | 'expired'
  | 'self'
  | 'unauthenticated'
  | 'error';
```

- [ ] **Step 3: Write `shared-pool.model.ts`**

```typescript
import { WatchlistItem } from './watchlist-item.model';

export type PoolOwner = 'me' | 'them' | 'both';

export interface SharedPoolEntry {
  item: WatchlistItem;
  owner: PoolOwner;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/core/models/profile.model.ts src/app/core/models/friend.model.ts src/app/core/models/shared-pool.model.ts
git commit -m "feat(models): add Profile, FriendInvite, SharedPoolEntry types"
```

---

## Task 3: Shared-pool merge logic (pure, TDD)

**Files:**
- Create: `src/app/features/watchlist/watchlist-shared/shared-pool.ts`
- Test: `src/app/features/watchlist/watchlist-shared/shared-pool.spec.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { mergeWatchlists, overlapOnly } from './shared-pool';
import { WatchlistItem } from '../../../core/models/watchlist-item.model';

function mk(id: string): WatchlistItem {
  return {
    id: `row-${id}`,
    user_id: 'u',
    title: `Title ${id}`,
    type: 'movie',
    genres: [],
    duration_minutes: null,
    episode_count: null,
    poster_url: null,
    external_id: id,
    external_source: 'tmdb',
    watched: false,
    added_at: '2026-01-01',
  };
}

describe('mergeWatchlists', () => {
  it('tags items in both lists as "both", others as "me"/"them"', () => {
    const pool = mergeWatchlists([mk('A'), mk('B')], [mk('B'), mk('C')]);
    const byId = Object.fromEntries(pool.map((e) => [e.item.external_id, e.owner]));
    expect(byId).toEqual({ A: 'me', B: 'both', C: 'them' });
    expect(pool).toHaveLength(3);
  });

  it('dedupes so each title appears once', () => {
    const pool = mergeWatchlists([mk('A'), mk('A')], []);
    expect(pool).toHaveLength(1);
  });

  it('handles an empty "mine" list', () => {
    const pool = mergeWatchlists([], [mk('X')]);
    expect(pool).toEqual([{ item: expect.objectContaining({ external_id: 'X' }), owner: 'them' }]);
  });

  it('overlapOnly returns just the "both" entries', () => {
    const pool = mergeWatchlists([mk('A'), mk('B')], [mk('B')]);
    expect(overlapOnly(pool).map((e) => e.item.external_id)).toEqual(['B']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `shared-pool` module / `mergeWatchlists` not found.

- [ ] **Step 3: Write the implementation**

```typescript
import { WatchlistItem } from '../../../core/models/watchlist-item.model';
import { SharedPoolEntry } from '../../../core/models/shared-pool.model';

function keyOf(item: WatchlistItem): string {
  return `${item.external_source}:${item.external_id}`;
}

/**
 * Merge two unwatched lists into one deduped pool. Titles present in both are
 * tagged 'both' (the highlighted overlap); the current user's row instance wins
 * when a title is in both, so the entry carries the user's own WatchlistItem.
 */
export function mergeWatchlists(
  mine: WatchlistItem[],
  theirs: WatchlistItem[],
): SharedPoolEntry[] {
  const theirsKeys = new Set(theirs.map(keyOf));
  const entries: SharedPoolEntry[] = [];
  const seen = new Set<string>();

  for (const item of mine) {
    const key = keyOf(item);
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({ item, owner: theirsKeys.has(key) ? 'both' : 'me' });
  }
  for (const item of theirs) {
    const key = keyOf(item);
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({ item, owner: 'them' });
  }
  return entries;
}

export function overlapOnly(pool: SharedPoolEntry[]): SharedPoolEntry[] {
  return pool.filter((e) => e.owner === 'both');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS — all `mergeWatchlists` specs green.

- [ ] **Step 5: Commit**

```bash
git add src/app/features/watchlist/watchlist-shared/shared-pool.ts src/app/features/watchlist/watchlist-shared/shared-pool.spec.ts
git commit -m "feat(shared): merge two watchlists with overlap tagging"
```

---

## Task 4: Tournament bracket logic (pure, TDD)

**Files:**
- Create: `src/app/features/watchlist/watchlist-shared/tournament.ts`
- Test: `src/app/features/watchlist/watchlist-shared/tournament.spec.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { createTournament, choose, TournamentState } from './tournament';
import { WatchlistItem } from '../../../core/models/watchlist-item.model';

function mk(id: string): WatchlistItem {
  return {
    id: `row-${id}`,
    user_id: 'u',
    title: `Title ${id}`,
    type: 'movie',
    genres: [],
    duration_minutes: null,
    episode_count: null,
    poster_url: null,
    external_id: id,
    external_source: 'tmdb',
    watched: false,
    added_at: '2026-01-01',
  };
}

// Deterministic identity shuffle so tests are stable.
const noShuffle = <T>(a: T[]) => a;

// Always pick the left side until a winner emerges; count the matchups.
function playToEnd(state: TournamentState): { winner: WatchlistItem; matchups: number } {
  let matchups = 0;
  while (state.current) {
    matchups++;
    state = choose(state, 'a');
  }
  return { winner: state.winner!, matchups };
}

describe('tournament', () => {
  it('starts with a matchup of the first two and no winner', () => {
    const s = createTournament([mk('A'), mk('B')], () => 0, noShuffle);
    expect(s.current).toEqual({ a: expect.objectContaining({ external_id: 'A' }), b: expect.objectContaining({ external_id: 'B' }) });
    expect(s.winner).toBeNull();
  });

  it('crowns the chosen title in a 2-item bracket', () => {
    let s = createTournament([mk('A'), mk('B')], () => 0, noShuffle);
    s = choose(s, 'a');
    expect(s.current).toBeNull();
    expect(s.winner?.external_id).toBe('A');
  });

  it('runs N-1 matchups for N titles (power of two)', () => {
    const s = createTournament([mk('A'), mk('B'), mk('C'), mk('D')], () => 0, noShuffle);
    expect(playToEnd(s).matchups).toBe(3);
  });

  it('handles odd counts with byes and still ends with one winner', () => {
    const s = createTournament([mk('A'), mk('B'), mk('C')], () => 0, noShuffle);
    const result = playToEnd(s);
    expect(result.matchups).toBe(2);
    expect(result.winner).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `tournament` module / `createTournament` not found.

- [ ] **Step 3: Write the implementation**

```typescript
import { WatchlistItem } from '../../../core/models/watchlist-item.model';

export interface Matchup {
  a: WatchlistItem;
  b: WatchlistItem;
}

export interface TournamentState {
  /** Contenders still to play in the current round. */
  queue: WatchlistItem[];
  /** Winners collected for the next round. */
  nextRound: WatchlistItem[];
  /** The pair currently being voted on, or null when finished. */
  current: Matchup | null;
  /** Set when exactly one contender remains. */
  winner: WatchlistItem | null;
}

/** Fisher–Yates shuffle using an injectable RNG (defaults to Math.random). */
export function shuffle<T>(arr: T[], rng: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Build a tournament from a pool. `rng` seeds the shuffle; `shuffleFn` is an
 * optional override used by tests to disable shuffling entirely.
 */
export function createTournament(
  items: WatchlistItem[],
  rng: () => number = Math.random,
  shuffleFn: (a: WatchlistItem[]) => WatchlistItem[] = (a) => shuffle(a, rng),
): TournamentState {
  return advance({ queue: shuffleFn(items), nextRound: [], current: null, winner: null });
}

/** Pull the next matchup, resolving byes and round transitions. */
function advance(state: TournamentState): TournamentState {
  let queue = [...state.queue];
  let nextRound = [...state.nextRound];

  while (true) {
    if (queue.length >= 2) {
      const a = queue.shift()!;
      const b = queue.shift()!;
      return { queue, nextRound, current: { a, b }, winner: null };
    }
    if (queue.length === 1) {
      nextRound.push(queue.shift()!); // bye: lone contender advances
    }
    if (nextRound.length === 1) {
      return { queue: [], nextRound: [], current: null, winner: nextRound[0] };
    }
    if (nextRound.length === 0) {
      return { queue: [], nextRound: [], current: null, winner: null };
    }
    queue = nextRound; // start the next round
    nextRound = [];
  }
}

/** Record the winner of the current matchup and produce the next state. */
export function choose(state: TournamentState, side: 'a' | 'b'): TournamentState {
  if (!state.current) return state;
  const winner = side === 'a' ? state.current.a : state.current.b;
  return advance({
    queue: state.queue,
    nextRound: [...state.nextRound, winner],
    current: null,
    winner: null,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS — all `tournament` specs green.

- [ ] **Step 5: Commit**

```bash
git add src/app/features/watchlist/watchlist-shared/tournament.ts src/app/features/watchlist/watchlist-shared/tournament.spec.ts
git commit -m "feat(shared): single-elimination tournament bracket logic"
```

---

## Task 5: Accept-invite result mapper (pure, TDD)

**Files:**
- Create: `src/app/core/services/accept-invite.util.ts`
- Test: `src/app/core/services/accept-invite.util.spec.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { toAcceptOutcome } from './accept-invite.util';

describe('toAcceptOutcome', () => {
  it('passes through known status strings', () => {
    expect(toAcceptOutcome('ok', null)).toBe('ok');
    expect(toAcceptOutcome('expired', null)).toBe('expired');
    expect(toAcceptOutcome('self', null)).toBe('self');
  });

  it('returns "error" when the RPC errored', () => {
    expect(toAcceptOutcome('ok', { message: 'boom' })).toBe('error');
  });

  it('returns "error" for unrecognised data', () => {
    expect(toAcceptOutcome('weird', null)).toBe('error');
    expect(toAcceptOutcome(null, null)).toBe('error');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `toAcceptOutcome` not found.

- [ ] **Step 3: Write the implementation**

```typescript
import { AcceptInviteOutcome } from '../models/friend.model';

const KNOWN: AcceptInviteOutcome[] = [
  'ok',
  'invalid',
  'used',
  'expired',
  'self',
  'unauthenticated',
];

/** Map the raw accept_friend_invite RPC response into a typed outcome. */
export function toAcceptOutcome(data: unknown, error: unknown): AcceptInviteOutcome {
  if (error) return 'error';
  return (KNOWN as string[]).includes(data as string) ? (data as AcceptInviteOutcome) : 'error';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/core/services/accept-invite.util.ts src/app/core/services/accept-invite.util.spec.ts
git commit -m "feat(friends): typed mapper for accept-invite RPC result"
```

---

## Task 6: Add redirectTo to signInWithGoogle

**Files:**
- Modify: `src/app/core/services/supabase.service.ts:29-38`

- [ ] **Step 1: Replace the `signInWithGoogle` method**

```typescript
  public signInWithGoogle(redirectTo: string = `${window.location.origin}/`) {
    return this.supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        // Defaults to the app root; callers (e.g. the invite flow) can pass an
        // explicit URL so OAuth returns the user to where they started.
        redirectTo,
      },
    });
  }
```

- [ ] **Step 2: Build to verify it compiles**

Run: `npm run build`
Expected: build succeeds (existing `loginWithGoogle()` call with no args still type-checks).

- [ ] **Step 3: Commit**

```bash
git add src/app/core/services/supabase.service.ts
git commit -m "feat(auth): allow custom OAuth redirect target"
```

---

## Task 7: ProfileService

**Files:**
- Create: `src/app/core/services/profile.service.ts`
- Test: `src/app/core/services/profile.service.spec.ts`

- [ ] **Step 1: Write the service**

```typescript
import { Injectable, inject } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { Profile } from '../models/profile.model';

@Injectable({ providedIn: 'root' })
export class ProfileService {
  private supabase = inject(SupabaseService);

  private _profile$ = new BehaviorSubject<Profile | null>(null);
  profile$ = this._profile$.asObservable();

  /** Loads the current user's profile row into the subject. */
  async loadProfile(): Promise<Profile | null> {
    const userId = this.supabase.getCurrentUser()?.id;
    if (!userId) return null;
    const { data, error } = await this.supabase
      .getClient()
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (error) {
      console.error('Error loading profile:', error);
      return null;
    }
    this._profile$.next(data);
    return data;
  }

  /** Persists a chosen username (display label, not unique). */
  async setUsername(username: string): Promise<boolean> {
    const userId = this.supabase.getCurrentUser()?.id;
    if (!userId) return false;
    const { data, error } = await this.supabase
      .getClient()
      .from('profiles')
      .update({ username })
      .eq('id', userId)
      .select()
      .single();
    if (error) {
      console.error('Error setting username:', error);
      return false;
    }
    this._profile$.next(data);
    return true;
  }
}
```

- [ ] **Step 2: Write a creation test**

```typescript
import { TestBed } from '@angular/core/testing';
import { ProfileService } from './profile.service';

describe('ProfileService', () => {
  let service: ProfileService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ProfileService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
```

- [ ] **Step 3: Run test to verify it passes**

Run: `npm test`
Expected: PASS — `ProfileService should be created`.

- [ ] **Step 4: Commit**

```bash
git add src/app/core/services/profile.service.ts src/app/core/services/profile.service.spec.ts
git commit -m "feat(profile): profile state service with username update"
```

---

## Task 8: FriendsService

**Files:**
- Create: `src/app/core/services/friends.service.ts`
- Test: `src/app/core/services/friends.service.spec.ts`

- [ ] **Step 1: Write the service**

```typescript
import { Injectable, inject } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { Profile } from '../models/profile.model';
import { AcceptInviteOutcome } from '../models/friend.model';
import { WatchlistItem } from '../models/watchlist-item.model';
import { toAcceptOutcome } from './accept-invite.util';

@Injectable({ providedIn: 'root' })
export class FriendsService {
  private supabase = inject(SupabaseService);

  private _friends$ = new BehaviorSubject<Profile[]>([]);
  friends$ = this._friends$.asObservable();

  /** Loads accepted friends (the other member of each friendship) as profiles. */
  async getFriends(): Promise<Profile[]> {
    const me = this.supabase.getCurrentUser()?.id;
    if (!me) return [];
    const client = this.supabase.getClient();

    const { data: links, error } = await client
      .from('friendships')
      .select('user_a_id, user_b_id')
      .or(`user_a_id.eq.${me},user_b_id.eq.${me}`);
    if (error) {
      console.error('Error loading friendships:', error);
      return [];
    }

    const friendIds = (links ?? []).map((l) => (l.user_a_id === me ? l.user_b_id : l.user_a_id));
    if (friendIds.length === 0) {
      this._friends$.next([]);
      return [];
    }

    const { data: profiles, error: pErr } = await client
      .from('profiles')
      .select('*')
      .in('id', friendIds);
    if (pErr) {
      console.error('Error loading friend profiles:', pErr);
      return [];
    }
    this._friends$.next(profiles ?? []);
    return profiles ?? [];
  }

  /** Creates a single-use invite and returns its shareable URL. */
  async createInvite(): Promise<string | null> {
    const me = this.supabase.getCurrentUser()?.id;
    if (!me) return null;
    const token = crypto.randomUUID().replace(/-/g, '');
    const { error } = await this.supabase
      .getClient()
      .from('friend_invites')
      .insert({ token, inviter_id: me });
    if (error) {
      console.error('Error creating invite:', error);
      return null;
    }
    return `${window.location.origin}/invite/${token}`;
  }

  /** Consumes an invite token via the security-definer RPC. */
  async acceptInvite(token: string): Promise<AcceptInviteOutcome> {
    const { data, error } = await this.supabase
      .getClient()
      .rpc('accept_friend_invite', { invite_token: token });
    return toAcceptOutcome(data, error);
  }

  /** A friend's full watchlist (RLS permits reads of friends' rows). */
  async getFriendWatchlist(friendId: string): Promise<WatchlistItem[]> {
    const { data, error } = await this.supabase
      .getClient()
      .from('watchlist_items')
      .select('*')
      .eq('user_id', friendId);
    if (error) {
      console.error('Error loading friend watchlist:', error);
      return [];
    }
    return data ?? [];
  }

  /** Removes the friendship in either canonical order. */
  async removeFriend(friendId: string): Promise<boolean> {
    const me = this.supabase.getCurrentUser()?.id;
    if (!me) return false;
    const { error } = await this.supabase
      .getClient()
      .from('friendships')
      .delete()
      .or(
        `and(user_a_id.eq.${me},user_b_id.eq.${friendId}),and(user_a_id.eq.${friendId},user_b_id.eq.${me})`,
      );
    if (error) {
      console.error('Error removing friend:', error);
      return false;
    }
    await this.getFriends();
    return true;
  }
}
```

- [ ] **Step 2: Write a creation test**

```typescript
import { TestBed } from '@angular/core/testing';
import { FriendsService } from './friends.service';

describe('FriendsService', () => {
  let service: FriendsService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(FriendsService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
```

- [ ] **Step 3: Run test to verify it passes**

Run: `npm test`
Expected: PASS — `FriendsService should be created`.

- [ ] **Step 4: Commit**

```bash
git add src/app/core/services/friends.service.ts src/app/core/services/friends.service.spec.ts
git commit -m "feat(friends): invites, friendships, and friend watchlist reads"
```

---

## Task 9: Username dialog

**Files:**
- Create: `src/app/features/auth/username-dialog/username-dialog.ts`
- Create: `src/app/features/auth/username-dialog/username-dialog.html`
- Create: `src/app/features/auth/username-dialog/username-dialog.scss`

- [ ] **Step 1: Write `username-dialog.ts`**

```typescript
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { ProfileService } from '../../../core/services/profile.service';

@Component({
  selector: 'app-username-dialog',
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule],
  templateUrl: './username-dialog.html',
  styleUrl: './username-dialog.scss',
})
export class UsernameDialog {
  private profile = inject(ProfileService);
  private dialogRef = inject(MatDialogRef<UsernameDialog>);

  username = signal('');
  saving = signal(false);
  error = signal<string | null>(null);

  get usernameValue(): string {
    return this.username();
  }
  set usernameValue(value: string) {
    this.username.set(value);
    this.error.set(null);
  }

  async save(): Promise<void> {
    const name = this.username().trim();
    if (name.length < 2) {
      this.error.set('Please enter at least 2 characters.');
      return;
    }
    this.saving.set(true);
    const ok = await this.profile.setUsername(name);
    this.saving.set(false);
    if (!ok) {
      this.error.set('Could not save. Please try again.');
      return;
    }
    this.dialogRef.close(name);
  }
}
```

- [ ] **Step 2: Write `username-dialog.html`**

```html
<h2 mat-dialog-title>Pick a username</h2>
<mat-dialog-content>
  <p>This is how friends will see you when you share watchlists.</p>
  <mat-form-field appearance="outline" style="width: 100%">
    <mat-label>Username</mat-label>
    <input
      matInput
      [(ngModel)]="usernameValue"
      maxlength="30"
      (keyup.enter)="save()"
      autocomplete="off"
    />
  </mat-form-field>
  @if (error()) {
    <p class="error">{{ error() }}</p>
  }
</mat-dialog-content>
<mat-dialog-actions align="end">
  <button mat-flat-button color="primary" (click)="save()" [disabled]="saving()">
    {{ saving() ? 'Saving…' : 'Save' }}
  </button>
</mat-dialog-actions>
```

- [ ] **Step 3: Write `username-dialog.scss`**

```scss
.error {
  color: var(--mat-sys-error);
  margin: 0;
  font-size: 0.875rem;
}
```

- [ ] **Step 4: Build to verify it compiles**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/app/features/auth/username-dialog
git commit -m "feat(profile): one-time username dialog"
```

---

## Task 10: Gate the watchlist shell behind the username modal

**Files:**
- Modify: `src/app/features/watchlist/watchlist.ts:1-54`

- [ ] **Step 1: Add the profile load + dialog open on init**

Replace the imports and class body so the component implements `OnInit`, injects `ProfileService` and `MatDialog`, and opens the username modal when the profile has no username. The full updated file:

```typescript
import { Component, OnInit, inject, signal } from '@angular/core';
import { BreakpointObserver } from '@angular/cdk/layout';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatTabsModule, MatTabChangeEvent } from '@angular/material/tabs';
import { MatDialog } from '@angular/material/dialog';
import { WatchlistList } from './watchlist-list/watchlist-list';
import { WatchlistAdd } from './watchlist-add/watchlist-add';
import { WatchlistShared } from './watchlist-shared/watchlist-shared';
import { WatchlistAiChatComponent, ChatMode } from './watchlist-ai-chat/watchlist-ai.chat';
import { UsernameDialog } from '../auth/username-dialog/username-dialog';
import { SupabaseService } from '../../core/services/supabase.service';
import { ProfileService } from '../../core/services/profile.service';

@Component({
  selector: 'app-watchlist',
  imports: [
    MatTabsModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    WatchlistList,
    WatchlistAdd,
    WatchlistShared,
    WatchlistAiChatComponent,
  ],
  templateUrl: './watchlist.html',
  styleUrl: './watchlist.scss',
})
export class Watchlist implements OnInit {
  private supabase = inject(SupabaseService);
  private profile = inject(ProfileService);
  private dialog = inject(MatDialog);
  private router = inject(Router);

  isDesktop = signal(false);
  chatMode: ChatMode = 'list';

  constructor() {
    inject(BreakpointObserver)
      .observe('(min-width: 900px)')
      .pipe(takeUntilDestroyed())
      .subscribe((state) => {
        this.isDesktop.set(state.matches);
        // On desktop both panels are always visible — list context is always correct.
        if (state.matches) this.chatMode = 'list';
      });
  }

  async ngOnInit(): Promise<void> {
    const profile = await this.profile.loadProfile();
    if (profile && !profile.username) {
      this.dialog.open(UsernameDialog, {
        disableClose: true,
        width: '420px',
        maxWidth: '95vw',
        autoFocus: true,
      });
    }
  }

  onTabChange(event: MatTabChangeEvent): void {
    // index 1 = Add (use 'add' chat context); index 0 = List, 2 = Shared.
    this.chatMode = event.index === 1 ? 'add' : 'list';
  }

  async logout(): Promise<void> {
    await this.supabase.signOut();
    this.router.navigate(['/']);
  }
}
```

- [ ] **Step 2: Build to verify it compiles**

Run: `npm run build`
Expected: build fails — `WatchlistShared` does not exist yet. This is expected; it is created in Task 12. Proceed and revisit the build there.

> Note: this task is committed together with Task 12 + 13, since the `WatchlistShared` import only resolves once that component exists. Do not commit a non-building tree on its own.

---

## Task 11: Tournament dialog component

**Files:**
- Create: `src/app/features/watchlist/watchlist-tournament-dialog/watchlist-tournament-dialog.ts`
- Create: `src/app/features/watchlist/watchlist-tournament-dialog/watchlist-tournament-dialog.html`
- Create: `src/app/features/watchlist/watchlist-tournament-dialog/watchlist-tournament-dialog.scss`

- [ ] **Step 1: Write `watchlist-tournament-dialog.ts`**

```typescript
import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { WatchlistItem } from '../../../core/models/watchlist-item.model';
import { WatchlistDetailDialog } from '../watchlist-detail-dialog/watchlist-detail-dialog';
import { createTournament, choose, TournamentState } from '../watchlist-shared/tournament';

@Component({
  selector: 'app-watchlist-tournament-dialog',
  imports: [MatDialogModule, MatButtonModule, MatIconModule],
  templateUrl: './watchlist-tournament-dialog.html',
  styleUrl: './watchlist-tournament-dialog.scss',
})
export class WatchlistTournamentDialog {
  private dialog = inject(MatDialog);
  private dialogRef = inject(MatDialogRef<WatchlistTournamentDialog>);
  private items = inject<WatchlistItem[]>(MAT_DIALOG_DATA);

  state = signal<TournamentState>(createTournament(this.items));

  pick(side: 'a' | 'b'): void {
    this.state.set(choose(this.state(), side));
  }

  restart(): void {
    this.state.set(createTournament(this.items));
  }

  openWinner(item: WatchlistItem): void {
    this.dialogRef.close();
    this.dialog.open(WatchlistDetailDialog, {
      data: item,
      width: '680px',
      maxWidth: '95vw',
      autoFocus: false,
    });
  }
}
```

- [ ] **Step 2: Write `watchlist-tournament-dialog.html`**

```html
<h2 mat-dialog-title>Pick tonight's title</h2>
<mat-dialog-content>
  @if (state(); as s) {
    @if (s.current) {
      <p class="prompt">Which one?</p>
      <div class="matchup">
        <button class="contender" (click)="pick('a')">
          @if (s.current.a.poster_url) {
            <img [src]="s.current.a.poster_url" [alt]="s.current.a.title" />
          }
          <span class="contender-title">{{ s.current.a.title }}</span>
        </button>
        <span class="vs">vs</span>
        <button class="contender" (click)="pick('b')">
          @if (s.current.b.poster_url) {
            <img [src]="s.current.b.poster_url" [alt]="s.current.b.title" />
          }
          <span class="contender-title">{{ s.current.b.title }}</span>
        </button>
      </div>
    } @else if (s.winner) {
      <div class="winner">
        <p class="prompt">Tonight you're watching</p>
        <button class="contender contender--winner" (click)="openWinner(s.winner)">
          @if (s.winner.poster_url) {
            <img [src]="s.winner.poster_url" [alt]="s.winner.title" />
          }
          <span class="contender-title">{{ s.winner.title }}</span>
        </button>
      </div>
    }
  }
</mat-dialog-content>
<mat-dialog-actions align="end">
  <button mat-button (click)="restart()">
    <mat-icon>replay</mat-icon>
    Restart
  </button>
  <button mat-button mat-dialog-close>Close</button>
</mat-dialog-actions>
```

- [ ] **Step 3: Write `watchlist-tournament-dialog.scss`**

```scss
.prompt {
  text-align: center;
  margin: 0 0 12px;
  color: var(--mat-sys-on-surface-variant);
}

.matchup {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.vs {
  font-weight: 600;
  color: var(--mat-sys-on-surface-variant);
}

.contender {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--mat-sys-outline-variant);
  border-radius: 12px;
  background: transparent;
  padding: 8px;
  cursor: pointer;
  flex: 1;
  max-width: 220px;

  img {
    width: 100%;
    aspect-ratio: 2 / 3;
    object-fit: cover;
    border-radius: 8px;
  }
}

.contender--winner {
  margin: 0 auto;
}

.contender-title {
  font-size: 0.9rem;
  text-align: center;
}

.winner {
  text-align: center;
}
```

- [ ] **Step 4: Build to verify it compiles**

Run: `npm run build`
Expected: build still fails on the not-yet-created `WatchlistShared` (Task 12). This component itself is now correct; do not commit yet.

---

## Task 12: Shared tab component

**Files:**
- Create: `src/app/features/watchlist/watchlist-shared/watchlist-shared.ts`
- Create: `src/app/features/watchlist/watchlist-shared/watchlist-shared.html`
- Create: `src/app/features/watchlist/watchlist-shared/watchlist-shared.scss`

- [ ] **Step 1: Write `watchlist-shared.ts`**

```typescript
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Profile } from '../../../core/models/profile.model';
import { SharedPoolEntry } from '../../../core/models/shared-pool.model';
import { WatchlistService } from '../../../core/services/watchlist.service';
import { FriendsService } from '../../../core/services/friends.service';
import { mergeWatchlists, overlapOnly } from './shared-pool';
import { WatchlistTournamentDialog } from '../watchlist-tournament-dialog/watchlist-tournament-dialog';
import { WatchlistDetailDialog } from '../watchlist-detail-dialog/watchlist-detail-dialog';

@Component({
  selector: 'app-watchlist-shared',
  imports: [AsyncPipe, MatButtonModule, MatIconModule, MatSelectModule, MatSlideToggleModule],
  templateUrl: './watchlist-shared.html',
  styleUrl: './watchlist-shared.scss',
})
export class WatchlistShared implements OnInit {
  private friends = inject(FriendsService);
  private watchlist = inject(WatchlistService);
  private dialog = inject(MatDialog);
  private snackbar = inject(MatSnackBar);

  friends$ = this.friends.friends$;

  selectedFriend = signal<Profile | null>(null);
  overlapOnlyView = signal(false);
  pool = signal<SharedPoolEntry[]>([]);
  loading = signal(false);
  introDismissed = signal(localStorage.getItem('sharedIntroDismissed') === 'true');

  displayedPool = computed(() =>
    this.overlapOnlyView() ? overlapOnly(this.pool()) : this.pool(),
  );

  async ngOnInit(): Promise<void> {
    await this.friends.getFriends();
  }

  async selectFriend(friend: Profile): Promise<void> {
    this.selectedFriend.set(friend);
    this.loading.set(true);
    const mineAll = await this.watchlist.getWatchlist();
    const theirsAll = await this.friends.getFriendWatchlist(friend.id);
    const mine = mineAll.filter((i) => !i.watched);
    const theirs = theirsAll.filter((i) => !i.watched);
    this.pool.set(mergeWatchlists(mine, theirs));
    this.loading.set(false);
  }

  dismissIntro(): void {
    this.introDismissed.set(true);
    localStorage.setItem('sharedIntroDismissed', 'true');
  }

  async invite(): Promise<void> {
    const url = await this.friends.createInvite();
    if (!url) {
      this.snackbar.open('Could not create invite link.', 'Dismiss', { duration: 4000 });
      return;
    }
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Watch together', text: 'Let’s pick something to watch', url });
        return;
      } catch {
        // user cancelled the share sheet — fall through to clipboard
      }
    }
    await navigator.clipboard.writeText(url);
    this.snackbar.open('Invite link copied to clipboard.', 'Dismiss', { duration: 4000 });
  }

  startTournament(): void {
    const items = this.displayedPool().map((e) => e.item);
    if (items.length < 2) {
      this.snackbar.open('Need at least 2 titles to run a tournament.', 'Dismiss', {
        duration: 4000,
      });
      return;
    }
    this.dialog.open(WatchlistTournamentDialog, {
      data: items,
      width: '680px',
      maxWidth: '95vw',
      autoFocus: false,
    });
  }

  openDetail(entry: SharedPoolEntry): void {
    this.dialog.open(WatchlistDetailDialog, {
      data: entry.item,
      width: '680px',
      maxWidth: '95vw',
      autoFocus: false,
    });
  }
}
```

- [ ] **Step 2: Write `watchlist-shared.html`**

```html
<div class="shared">
  @if (friends$ | async; as friends) {
    @if (friends.length === 0) {
      <!-- Empty state doubles as onboarding -->
      <div class="onboarding">
        <h3>Watch together</h3>
        <ol>
          <li>Invite a friend with a link.</li>
          <li>See your lists merged — what you both want is highlighted.</li>
          <li>Run a tournament to decide what to watch tonight.</li>
        </ol>
        <button mat-flat-button color="primary" (click)="invite()">
          <mat-icon>person_add</mat-icon>
          Invite a friend
        </button>
      </div>
    } @else {
      @if (!introDismissed()) {
        <div class="intro-card">
          <span>Pick a friend to see your shared list, then run a tournament to decide.</span>
          <button mat-icon-button aria-label="Dismiss" (click)="dismissIntro()">
            <mat-icon>close</mat-icon>
          </button>
        </div>
      }

      <div class="controls">
        <mat-form-field appearance="outline" class="friend-select">
          <mat-label>Friend</mat-label>
          <mat-select
            [value]="selectedFriend()"
            (selectionChange)="selectFriend($event.value)"
          >
            @for (f of friends; track f.id) {
              <mat-option [value]="f">{{ f.username || 'Friend' }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <button mat-stroked-button (click)="invite()">
          <mat-icon>person_add</mat-icon>
          Invite
        </button>
      </div>

      @if (selectedFriend()) {
        <div class="actions">
          <mat-slide-toggle
            [checked]="overlapOnlyView()"
            (change)="overlapOnlyView.set($event.checked)"
            >Only what you both want</mat-slide-toggle
          >
          <button mat-flat-button color="primary" (click)="startTournament()">
            <mat-icon>emoji_events</mat-icon>
            Tournament pick
          </button>
        </div>

        @if (loading()) {
          <p class="hint">Loading…</p>
        } @else if (displayedPool().length === 0) {
          <p class="hint">No shared titles to show. Try turning off the overlap filter.</p>
        } @else {
          <div class="grid">
            @for (entry of displayedPool(); track entry.item.id) {
              <button class="poster" (click)="openDetail(entry)">
                @if (entry.item.poster_url) {
                  <img [src]="entry.item.poster_url" [alt]="entry.item.title" />
                }
                @if (entry.owner === 'both') {
                  <span class="badge badge--both">Both</span>
                } @else if (entry.owner === 'them') {
                  <span class="badge badge--them">Theirs</span>
                }
              </button>
            }
          </div>
        }
      }
    }
  }
</div>
```

- [ ] **Step 3: Write `watchlist-shared.scss`**

```scss
.shared {
  padding: 12px 16px 80px;
}

.onboarding {
  max-width: 420px;
  margin: 32px auto;
  text-align: center;

  ol {
    text-align: left;
    margin: 16px 0 24px;
    line-height: 1.6;
  }
}

.intro-card {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--mat-sys-surface-container);
  border-radius: 12px;
  padding: 8px 8px 8px 16px;
  margin-bottom: 12px;
  font-size: 0.9rem;
}

.controls {
  display: flex;
  align-items: center;
  gap: 12px;

  .friend-select {
    flex: 1;
  }
}

.actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.hint {
  color: var(--mat-sys-on-surface-variant);
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  gap: 12px;
}

.poster {
  position: relative;
  border: none;
  padding: 0;
  background: transparent;
  cursor: pointer;

  img {
    width: 100%;
    aspect-ratio: 2 / 3;
    object-fit: cover;
    border-radius: 8px;
  }
}

.badge {
  position: absolute;
  top: 6px;
  left: 6px;
  font-size: 0.7rem;
  padding: 2px 6px;
  border-radius: 6px;
  color: #fff;

  &--both {
    background: var(--mat-sys-primary);
  }
  &--them {
    background: rgba(0, 0, 0, 0.6);
  }
}
```

- [ ] **Step 4: Build to verify it compiles**

Run: `npm run build`
Expected: build still fails until the watchlist template/route wiring in Task 13 references everything consistently — but the `WatchlistShared` import in `watchlist.ts` (Task 10) now resolves. Proceed to Task 13, then build.

---

## Task 13: Wire Shared into the watchlist page + invite route

**Files:**
- Modify: `src/app/features/watchlist/watchlist.html:9-29`
- Modify: `src/app/features/watchlist/watchlist.scss:13-26`
- Create: `src/app/features/invite/invite.ts`
- Create: `src/app/features/invite/invite.html`
- Create: `src/app/features/invite/invite.scss`
- Modify: `src/app/app.routes.ts:5-22`

- [ ] **Step 1: Add the Shared tab (mobile) and column (desktop) to `watchlist.html`**

Replace the desktop layout + mobile tab block (lines 9–29) with:

```html
  @if (isDesktop()) {
    <!-- ── Desktop: side-by-side columns ─────────────────────────── -->
    <div class="desktop-layout">
      <div class="desktop-col desktop-col--list">
        <app-watchlist-list></app-watchlist-list>
      </div>
      <div class="desktop-col desktop-col--add">
        <app-watchlist-add></app-watchlist-add>
      </div>
      <div class="desktop-col desktop-col--shared">
        <app-watchlist-shared></app-watchlist-shared>
      </div>
    </div>
  } @else {
    <!-- ── Mobile: tab group ──────────────────────────────────────── -->
    <mat-tab-group (selectedTabChange)="onTabChange($event)">
      <mat-tab label="Watchlist">
        <app-watchlist-list></app-watchlist-list>
      </mat-tab>
      <mat-tab label="Add">
        <app-watchlist-add></app-watchlist-add>
      </mat-tab>
      <mat-tab label="Shared">
        <app-watchlist-shared></app-watchlist-shared>
      </mat-tab>
    </mat-tab-group>
  }
```

- [ ] **Step 2: Add the third column to `watchlist.scss`**

Replace the `.desktop-layout` and `.desktop-col` rules (lines 13–26) with:

```scss
.desktop-layout {
  display: grid;
  grid-template-columns: 2fr 1.4fr 1.6fr;
  height: calc(100dvh - 56px); // fill below header
  border-top: 1px solid var(--mat-sys-outline-variant);
}

.desktop-col {
  overflow-y: auto;

  &--add,
  &--shared {
    border-left: 1px solid var(--mat-sys-outline-variant);
  }
}
```

- [ ] **Step 3: Write `invite.ts`**

```typescript
import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { filter, firstValueFrom, take } from 'rxjs';
import { SupabaseService } from '../../core/services/supabase.service';
import { FriendsService } from '../../core/services/friends.service';

type InviteStatus = 'working' | 'ok' | 'invalid' | 'used' | 'expired' | 'self' | 'error';

@Component({
  selector: 'app-invite',
  imports: [RouterLink, MatButtonModule, MatProgressSpinnerModule],
  templateUrl: './invite.html',
  styleUrl: './invite.scss',
})
export class Invite implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private supabase = inject(SupabaseService);
  private friends = inject(FriendsService);

  status = signal<InviteStatus>('working');

  async ngOnInit(): Promise<void> {
    const token = this.route.snapshot.paramMap.get('token');
    if (!token) {
      this.status.set('invalid');
      return;
    }

    // Wait for a resolved auth state (never the initial `undefined`).
    const user = await firstValueFrom(
      this.supabase.currentUser$.pipe(
        filter((u) => u !== undefined),
        take(1),
      ),
    );

    if (!user) {
      // Bounce through Google login and return to this exact invite URL.
      this.supabase.signInWithGoogle(window.location.href);
      return;
    }

    const outcome = await this.friends.acceptInvite(token);
    switch (outcome) {
      case 'unauthenticated':
        this.supabase.signInWithGoogle(window.location.href);
        return;
      case 'ok':
        await this.friends.getFriends();
        this.status.set('ok');
        return;
      case 'invalid':
      case 'used':
      case 'expired':
      case 'self':
        this.status.set(outcome); // each case narrows to a valid InviteStatus
        return;
      default:
        this.status.set('error');
    }
  }

  goToWatchlist(): void {
    this.router.navigate(['/watchlist']);
  }
}
```

- [ ] **Step 4: Write `invite.html`**

```html
<div class="invite">
  @switch (status()) {
    @case ('working') {
      <mat-spinner diameter="48"></mat-spinner>
      <p>Adding your friend…</p>
    }
    @case ('ok') {
      <h2>You're connected! 🎉</h2>
      <p>You can now see each other's watchlists in the Shared tab.</p>
      <button mat-flat-button color="primary" (click)="goToWatchlist()">Go to my watchlist</button>
    }
    @case ('self') {
      <h2>That's your own invite link</h2>
      <p>Send it to a friend instead.</p>
      <button mat-button routerLink="/watchlist">Back to watchlist</button>
    }
    @default {
      <h2>This invite link is no longer valid</h2>
      <p>It may have expired or already been used. Ask your friend for a new one.</p>
      <button mat-button routerLink="/watchlist">Back to watchlist</button>
    }
  }
</div>
```

- [ ] **Step 5: Write `invite.scss`**

```scss
.invite {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  text-align: center;
  padding: 24px;
}
```

- [ ] **Step 6: Add the public invite route to `app.routes.ts`**

Insert this route object immediately before the `{ path: '**', ... }` entry:

```typescript
  {
    path: 'invite/:token',
    loadComponent: () => import('./features/invite/invite').then((m) => m.Invite),
  },
```

- [ ] **Step 7: Build to verify the whole feature compiles**

Run: `npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 8: Run the full test suite**

Run: `npm test`
Expected: PASS — all specs green (merge, tournament, accept-invite util, service creation tests).

- [ ] **Step 9: Commit (Tasks 10–13 together)**

```bash
git add src/app/features/watchlist/watchlist.ts \
        src/app/features/watchlist/watchlist.html \
        src/app/features/watchlist/watchlist.scss \
        src/app/features/watchlist/watchlist-shared \
        src/app/features/watchlist/watchlist-tournament-dialog \
        src/app/features/invite \
        src/app/app.routes.ts
git commit -m "feat(shared): Shared tab, tournament dialog, invite route, username gate"
```

---

## Task 14: Manual end-to-end verification

**Files:** none (manual QA)

- [ ] **Step 1: Username modal**

Run: `npm start`, log in as a user whose `profiles.username` is null.
Expected: a non-dismissible "Pick a username" modal appears; saving a name closes it and it does not reappear on reload.

- [ ] **Step 2: Invite + accept across two accounts**

As user A, open the Shared tab → **Invite a friend** → copy the link. Open it in a separate browser/profile logged in as user B.
Expected: B sees "You're connected"; both A and B now appear in each other's friend selector.

- [ ] **Step 3: Merged pool + overlap**

As A, select B in the friend selector.
Expected: the grid shows the union of both unwatched lists; titles on both lists show a "Both" badge; B-only titles show "Theirs". Toggling "Only what you both want" narrows to the "Both" set.

- [ ] **Step 4: Tournament**

With ≥2 titles in the active pool, tap **Tournament pick**, choose through the rounds.
Expected: one winner is crowned; tapping it opens the detail dialog. With <2 titles, a snackbar nudge appears instead.

- [ ] **Step 5: RLS spot check**

In the Supabase SQL editor as B's session (or via the app), confirm B can read A's `watchlist_items` only while the friendship exists, and cannot write to them.
Expected: reads succeed for friends; non-friends get zero rows; writes to another user's rows are rejected.

- [ ] **Step 6: Invalid invite**

Open `/invite/some-garbage-token` while logged in.
Expected: "This invite link is no longer valid" screen.
```
