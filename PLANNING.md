# What to Watch — Project Planning

> A personal watchlist app for movies, series, and anime with AI-powered suggestions.
> Last updated: 2026-03-19

---

## Tech Stack

| Layer           | Choice                | Reason                                               |
| --------------- | --------------------- | ---------------------------------------------------- |
| Framework       | Angular (v21)         | Familiar, structured, enterprise-grade               |
| Auth + DB       | Supabase              | Familiar, Postgres under the hood, built-in auth     |
| Styling         | Angular Material      | Native Angular integration, consistent design system |
| State           | Services + RxJS       | Simpler approach, no boilerplate overhead            |
| Movie/Series DB | TMDB API              | Free tier, rich metadata, covers movies and series   |
| Anime DB        | AniList API (GraphQL) | Free, accurate, community-driven anime data          |
| AI Feature      | Google Gemini API     | Free tier, pairs well with Google login              |

---

## Core Features

### Authentication

- [x] Google login via Supabase Auth (OAuth)
- [x] User session persistence — `onAuthStateChange` as single source of truth (removed `getSession()` race condition)
- [x] Protected routes (AuthGuard + redirectIfAuthGuard)
  - Guards use `filter(user => user !== undefined)` to wait for real auth state before routing

### Add Title

- [x] Search bar with autocomplete (`mat-autocomplete` + `FormControl`)
  - `valueChanges` + `debounceTime(400)` + `distinctUntilChanged` + `switchMap` → `SearchService.searchTmdb()`
  - Stream exposes a state object `{ status, results }` via `merge()` + `startWith()`
  - States: `idle | loading | success | no-results | error` — single subscription in template
  - Shows poster thumbnail, title, year, vote average, type and genres in each option
  - `displayWith` function prevents `[object Object]` in input after selection
  - Mobile-first layout: full-width outlined field, `70dvh` autocomplete panel, `68px` min-height options
- [x] Selecting a result saves it to the user's Supabase list + shows snackbar feedback
- [x] Search and state reset after adding via `Subject` + `merge()`
- [x] Duplicate prevention — DB unique constraint on `(user_id, external_id, external_source)`, Postgres error code `23505` mapped to `'duplicate'` sentinel, distinct user-facing message
- [x] AniList skipped — TMDB covers movies, series and anime sufficiently
- [x] Metadata stored: title, type, genres, poster, release year, vote average, external ID, watched status
- [ ] `duration_minutes` / `episode_count` — requires a second TMDB detail API call per selection

### Browse & Filter

- [x] Display all titles in a responsive poster grid (`display: grid`, `auto-fill`, `aspect-ratio: 2/3`)
- [x] Filters: Type (Movie / Series / Anime) via chip listbox — toggle behaviour, deselects on second click
- [x] Sort: Recently Added, Oldest Added, Title A-Z, Title Z-A
- [x] Filter + sort implemented reactively via `combineLatest` + signals + `toObservable`
- [x] Toggle "watched" status on a title card (eye icon overlay)
- [x] Remove a title from the list
- [x] Netflix-style hover overlay showing title, type badge, genres, actions
- [ ] Watchlist loaded from real Supabase data on init — `getWatchlist()` exists but not yet called on load
- [ ] Distinguish empty watchlist vs no results for current filter
- [ ] Genre tag filter (filter by specific genre string)

### Random Pick

- [ ] Button that picks a random unwatched title from the current filtered view
- [ ] Optional: pick from a specific type or genre

### AI Suggestion (Gemini)

- [ ] Chat panel / modal (planned as a separate component)
- [ ] User describes what they feel like watching in natural language
- [ ] Gemini receives the user's message + the list of unwatched titles as context
- [ ] Suggests the best match(es) from the list
- [ ] Optional toggle: "suggest even outside my list" (Gemini answers freely)

---

## Component Architecture

```
AppComponent
└── router-outlet
    ├── HomeComponent         — landing page with nav buttons
    ├── LoginComponent        — Google OAuth login card
    └── WatchlistComponent    — tab shell (mat-tab-group)
        ├── WatchlistListComponent   — grid + filters + sort
        └── WatchlistAddComponent    — search input + autocomplete results
```

---

## Service Architecture

- **SupabaseService** — auth state (`BehaviorSubject<User | null | undefined>`), Supabase client access
- **WatchlistService** — CRUD operations + `BehaviorSubject<WatchlistItem[]>` as reactive state; all mutations update the subject directly so all subscribers stay in sync without re-fetching
- **SearchService** — TMDB `/search/multi` via `HttpClient`; genre maps fetched once at construction and kept in memory as `Record<number, string>`

---

## Data Model (Supabase / Postgres)

### `watchlist_items`

- `id` (uuid, primary key)
- `user_id` (uuid, FK → **auth.users(id)** ON DELETE CASCADE)
- `title` (text)
- `type` (enum: movie | series | anime)
- `genres` (text[])
- `duration_minutes` (int, nullable — **movies only**)
- `episode_count` (int, nullable — **series and anime only**)
- `poster_url` (text)
- `external_id` (text — TMDB or AniList ID)
- `external_source` (enum: tmdb | anilist)
- `watched` (boolean, default false)
- `added_at` (timestamp)

---

## Architecture Notes

### Search Strategy (current — TMDB only)

- TMDB `/search/multi` — filters out `media_type: "person"`, maps `tv` → `series`
- Genre IDs resolved to names via in-memory maps loaded at service construction
- `release_date` / `first_air_date` and `vote_average` included in `SearchResult`
- `duration_minutes` and `episode_count` are `null` — detail endpoint needed per selection
- AniList integration **dropped** — TMDB returns anime results adequately

### Search State Stream pattern

- `WatchlistAdd` uses `merge(valueChanges pipe, resetSearch$)` to produce one `searchStatus$` observable
- Each emission is a state object `{ status: 'idle' | 'loading' | 'success' | 'no-results' | 'error', results: [] }`
- Template subscribes once with `@if (searchStatus$ | async; as state)` and branches on `state.status`
- `resetSearch$` is a private `Subject<void>` — fired after add or duplicate to force idle state

### Duplicate Prevention

- DB: unique constraint `(user_id, external_id, external_source)` on `watchlist_items`
- Service: Postgres error code `23505` mapped to return value `'duplicate' as const`
- Component: checks `=== 'duplicate'` before `!== null` to show distinct snackbar messages

### Gemini Integration (implemented)

- FAB button (bottom-right, `position: fixed`) opens a chat overlay panel
- Single `WatchlistAiChatComponent` placed outside the `mat-tab-group` — floats over both tabs
- `@Input() mode: 'list' | 'add'` controls which system prompt is used:
  - `list` mode: suggest from UNWATCHED titles using knowledge of tone/atmosphere, not just genre tags
  - `add` mode: suggest NEW titles not already in the list, based on WATCHED taste profile
- Context rebuilt each time the panel **opens** (setter pattern) — avoids empty-on-init race condition
- Conversation history stored in component as `GeminiContent[]` (API array) + `displayMessages` signal (display array)
- `thinkingBudget: 0` set in `generationConfig` to disable chain-of-thought for fast chat responses
- Model: `gemini-2.5-flash` (current stable alias)
- `ngOnChanges` resets `displayMessages` when mode changes (tab switch) — fresh conversation per context

### Supabase Row-Level Security (RLS)

- Enable RLS on `watchlist_items`
- Policy: users can only SELECT/INSERT/UPDATE/DELETE their own rows

---

## Security Notes

- **Supabase anon key** is safe to be in source — RLS enforces per-user access at the DB layer
- **TMDB key** exposure is low risk (free tier, quota abuse at worst)
- **Gemini key** is billing-linked — keep `environment.ts` out of public repos (add to `.gitignore` before making repo public, commit `environment.example.ts` as template)
- **OAuth redirect** uses explicit `window.location.origin + '/'` — update to hardcoded production URL before deploying
- **XSS** — no risk: Angular `{{ }}` interpolation escapes all Gemini responses; `innerHTML` is not used anywhere
- **CSRF** — not applicable: Supabase auth uses JWT bearer tokens, not cookies

---

## Open Questions / Decisions to Revisit

- [x] ~~How to handle duration for anime?~~ → Store `episode_count` only
- [x] ~~Auth race condition on OAuth redirect~~ → Fixed: `onAuthStateChange` only, guards filter `undefined`
- [x] ~~AniList integration~~ → Dropped; TMDB covers anime sufficiently
- [x] ~~Store Gemini conversation history client-side or in Supabase?~~ → Client-side only (in-memory, resets on close)
- [ ] Fetch `duration_minutes` / `episode_count` via TMDB detail endpoint on selection or skip entirely?
- [ ] How many results to show in autocomplete? (currently returns all TMDB page 1 results, no client-side cap)
- [ ] Should "watched" items be hidden by default or just filterable?
- [ ] Pagination or infinite scroll for large lists?

---

## What's Left to Build

### Remaining core features

- [ ] **Watched filter** — toggle to hide/show watched items in browse (add `showWatched` signal to `combineLatest` chain)
- [ ] **Genre filter** — chip-based filter by genre string; genres are already stored on each item
- [ ] **Mobile card actions** — hover overlay is invisible on touch; replace with always-visible bottom strip or tap-to-reveal
- [ ] **Random Pick** — button that picks a random unwatched title from the current filtered view

### Nice to have

- [ ] **Markdown rendering in chat** — Gemini returns bullet points as `* text`; render them properly instead of raw text
- [ ] **Auto-scroll chat to bottom** — messages panel should scroll to latest message after each reply
- [ ] **Scroll to new message** — use `ViewChild` + `scrollIntoView` or `ElementRef.nativeElement.scrollTop`
- [ ] **`duration_minutes` / `episode_count`** — second TMDB detail call per add (GET `/movie/{id}` or `/tv/{id}`)
- [ ] **Deploy** — update OAuth redirect URL to production domain before going live
- [ ] TMDB requires attribution — plan for a small footer note

---

## Next Phase: Real Data + Browse Polish

1. **Call `getWatchlist()` on init** — `WatchlistListComponent.ngOnInit` should call `watchlistService.getWatchlist()` so the grid shows real Supabase data instead of an empty subject
2. **Empty state UX** — distinguish "your list is empty" from "no items match the current filter"
3. **Watched filter** — add a toggle to hide/show watched items in the browse grid
4. **Genre filter** — chip-based filter by genre tag

---

## Possible Future Developments

- **Detail API calls** — fetch runtime/episode count after selection
- **Social features** — share list via public profile page
- **Ratings** — 1–5 stars on watched titles
- **Streaming availability** — JustWatch via TMDB
- **Progress tracking** — current episode for series/anime
- **Import from Letterboxd / MAL**
- **Dark/light mode toggle** — Angular Material theming
- **PWA support** — installable on mobile
- **Statistics page** — watched/unwatched ratio, favourite genres
- **Collaborative lists** — shared between multiple users

---

## External API References

- TMDB API docs: https://developer.themoviedb.org/docs
- Supabase docs: https://supabase.com/docs
- Gemini API (Google AI Studio): https://aistudio.google.com
- Angular Material: https://material.angular.io
- Gemini API (Google AI Studio): https://aistudio.google.com
- Angular Material: https://material.angular.io
