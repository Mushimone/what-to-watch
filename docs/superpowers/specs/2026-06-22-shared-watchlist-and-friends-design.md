# Shared Watchlist & Friends — Design

> Persistent friends connected by invite link, a "Shared" tab that merges two
> watchlists (overlap highlighted), and a this-or-that tournament to decide what
> to watch together.
> Date: 2026-06-22

---

## Goal

Extend What to Watch from a solo watchlist into a social picking tool. Two users
become durable "friends" via an invite link, can view each other's lists merged
into a shared view, and resolve "what should *we* watch tonight" with a
single-elimination this-or-that tournament.

This is delivered as **two layers**, built in order:

1. **Social foundation** — profiles (with a chosen username), link invites,
   friendships, and the RLS that lets friends read each other's watchlists.
2. **Picking engine** — the Shared tab UI (connection selector + merged list)
   and the client-side tournament.

---

## Scope

### In scope

- One-time **username** capture for every authenticated user (Google OAuth gives
  no handle).
- **Invite-by-link** friend connections (single-use, expiring tokens).
- **Persistent friendships** with friends able to read each other's full
  watchlist (read-only).
- A **Shared tab** on the watchlist page: select a connection, see both unwatched
  lists merged with overlap highlighted.
- A **this-or-that tournament** over the shared pool, with an overlap-only toggle.
- **Onboarding** for the Shared feature.

### Out of scope (deliberate YAGNI cuts)

- Per-title privacy / partial sharing — accepting a friend shares the whole list.
- Realtime co-present sessions (rejected in favour of durable friends).
- Group sizes > 2 in the tournament (pairwise only in v1).
- Unique usernames / find-by-username search — usernames are display-only.
- Persisting tournament results.

---

## Data Model (Supabase / Postgres)

### `profiles`

Display metadata for each user. Row created automatically on signup.

- `id` (uuid, pk, FK → `auth.users(id)` ON DELETE CASCADE)
- `username` (text, **nullable until set**, **not unique** — display label only)
- `avatar_url` (text, nullable — seeded from Google avatar if available)
- `created_at` (timestamptz, default now())

A trigger on `auth.users` insert creates the matching `profiles` row with
`username = null`. The username is filled in later via the one-time modal.

Usernames are intentionally non-unique: identity uniqueness comes from the
Google-backed `auth.users.id`. The UI disambiguates duplicate usernames via the
distinct `profiles.id` (and avatar).

### `friend_invites`

One row per generated invite link.

- `token` (text, pk — URL-safe random, e.g. 22+ chars)
- `inviter_id` (uuid, FK → `auth.users(id)` ON DELETE CASCADE)
- `created_at` (timestamptz, default now())
- `expires_at` (timestamptz — default now() + 7 days)
- `accepted_by` (uuid, nullable, FK → `auth.users(id)`)

Single-use: an invite is consumed when `accepted_by` is set.

### `friendships`

One row per relationship (symmetric).

- `id` (uuid, pk)
- `user_a_id` (uuid, FK → `auth.users(id)` ON DELETE CASCADE)
- `user_b_id` (uuid, FK → `auth.users(id)` ON DELETE CASCADE)
- `created_at` (timestamptz, default now())
- `UNIQUE (user_a_id, user_b_id)`

To make lookups order-independent, store the pair canonically (e.g. always
`user_a_id < user_b_id`) and query both columns. There is no `pending` status —
clicking an invite link *is* the acceptance, so friendships are created already
active.

### `watchlist_items` (existing — RLS change only)

No column changes. The SELECT policy is extended:

> A user may SELECT a `watchlist_items` row if `user_id = auth.uid()` **or**
> there exists a `friendships` row pairing `auth.uid()` with the row's `user_id`.

INSERT / UPDATE / DELETE remain owner-only (`user_id = auth.uid()`).

Add an index supporting the friendship subquery (on both `friendships` columns)
to keep the policy fast.

---

## Row-Level Security

- **`profiles`** — SELECT: a user can read their own profile and the profiles of
  their friends (same friendship check) so the connection selector can show
  names/avatars. UPDATE: own row only.
- **`friend_invites`** — INSERT: `inviter_id = auth.uid()`. SELECT: needed to
  validate a token on accept; expose via a narrow path (the accept flow reads by
  token). The invite token itself is the capability — anyone with the link can
  read/consume it once, which is the intended behaviour.
- **`friendships`** — SELECT: rows where `auth.uid()` is either member. INSERT:
  performed as part of the accept flow (see below). DELETE: either member may
  remove the friendship (un-friend).

> **Accept flow & RLS note:** creating the friendship + marking the invite
> consumed touches the inviter's invite row as a *different* user. This is
> cleanest as a single `accept_friend_invite(token)` **security-definer RPC**
> that validates the token (exists, unexpired, unused), rejects self-accept,
> creates the canonical `friendships` row (idempotent against the UNIQUE
> constraint), and sets `accepted_by`. This is the one place we step outside
> plain table RLS, and it's justified by the cross-user write.

---

## Services (Angular)

### `ProfileService` (new)

- `loadProfile()` → fetches the current user's `profiles` row into a
  `BehaviorSubject<Profile | null>`.
- `needsUsername()` → derived: true when profile loaded and `username` empty.
- `setUsername(name)` → updates own row.

### `FriendsService` (new)

- `getFriends()` → `BehaviorSubject<Profile[]>` of accepted friends (joins
  `friendships` → `profiles`), mirroring the existing `WatchlistService`
  subject pattern.
- `createInvite()` → inserts a `friend_invites` row, returns the share URL.
- `acceptInvite(token)` → calls the `accept_friend_invite` RPC.
- `getFriendWatchlist(friendId)` → selects that friend's rows (RLS permits).
- `removeFriend(friendshipId)`.

### `WatchlistService` (existing — unchanged)

Reused as-is for the current user's list.

---

## Data Flow

### Username capture

1. After auth resolves, the watchlist shell calls `ProfileService.loadProfile()`.
2. If `needsUsername()`, open a **non-dismissible** `mat-dialog`. The app is
   gated behind it.
3. On submit, `setUsername()` persists; dialog closes; app proceeds.

### Invite & accept

1. User taps **Invite a friend** → `createInvite()` → app opens the native share
   sheet (Web Share API, clipboard fallback) with `…/invite/<token>`.
2. Friend opens the link → `/invite/:token` route (auth-guarded; bounces to login
   and returns after).
3. Route calls `acceptInvite(token)`:
   - invalid / expired / already-used → friendly error screen + back action.
   - self-accept → friendly "that's your own link" message.
   - success → navigates to the Shared tab with the new friend pre-selected.

### Merged shared pool (client-side)

1. Shared tab loads the current user's unwatched items and
   `getFriendWatchlist(selectedFriendId)`'s unwatched items.
2. Merge keyed on `external_source + ':' + external_id`. Each entry tagged
   `owner: 'me' | 'them' | 'both'`. `both` = the highlighted overlap.
3. Render the union as a poster grid; overlap entries get a visual marker.

### Tournament (client-side, no backend)

1. Pool = full union, or overlap-only when the toggle is on.
2. Guard: needs ≥ 2 titles, else show a nudge.
3. Shuffle, run single-elimination with byes for odd counts. State is
   component-local; nothing persists.
4. Two posters at a time, tap the winner, advance until one remains.
5. Result screen shows the winner; reuse the existing detail dialog for
   info/actions.

---

## UI

- Watchlist page `mat-tab-group` gains a **third tab: "Shared"** (alongside List,
  Add). The existing AI-chat FAB behaviour is unaffected.
- **Connection selector** at the top of the Shared tab — a row of friend
  avatars / `mat-select`. Selecting one loads the merged view.
- **Empty state = onboarding** when the user has no connections: a three-step
  "How it works" — *1) Invite a friend with a link · 2) See your lists merged,
  with what you both want highlighted · 3) Run a tournament to decide tonight* —
  plus the **Invite a friend** button.
- **Returning users** (already have friends): a small **dismissible intro card**
  at the top of the Shared tab, shown once; dismissal persisted in
  `localStorage` (no DB column).
- **Overlap-only toggle** near the Tournament Pick button.

### New route

- `/invite/:token` — auth-guarded; resolves the invite, then redirects into the
  Shared tab.

---

## Error Handling

- Invite token invalid / expired / consumed → "This invite link is no longer
  valid" screen with a back action.
- Self-invite (own link) → graceful message, no friendship created.
- Friend mutations (invite create, accept, remove) → snackbar feedback
  consistent with the current app.
- Empty / too-small shared pool → tournament shows a nudge instead of starting.
- Username modal submit failure → inline error, modal stays open (app stays
  gated).

---

## Testing

- **Merge / overlap-tagging** — unit tests: disjoint lists, full overlap, partial
  overlap, empty inputs; correct `me/them/both` tagging.
- **Tournament bracket reducer** — unit tests: odd counts (byes), 2-item case,
  single winner termination, no infinite loops.
- **`acceptInvite` paths** — unit tests over the RPC wrapper: success, expired,
  used, self-accept.
- **RLS** — manual two-account check: friends can read each other's lists,
  non-friends cannot; writes stay owner-only.

---

## Build Order

1. `profiles` table + signup trigger + RLS; `ProfileService`; one-time username
   modal gating the authed shell.
2. `friend_invites`, `friendships`, RLS extension on `watchlist_items`,
   `accept_friend_invite` RPC; `FriendsService`; invite link generation +
   `/invite/:token` accept flow.
3. Shared tab: connection selector + merged-pool view (overlap highlighted) +
   onboarding empty state / intro card.
4. This-or-that tournament + overlap-only toggle + result screen.
