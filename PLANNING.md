# What to Watch — Project Planning

> A personal watchlist app for movies, series, and anime with AI-powered suggestions.
> Last updated: 2026-02-25

---

## Tech Stack

| Layer           | Choice                | Reason                                               |
| --------------- | --------------------- | ---------------------------------------------------- |
| Framework       | Angular (v17+)        | Familiar, structured, enterprise-grade               |
| Auth + DB       | Supabase              | Familiar, Postgres under the hood, built-in auth     |
| Styling         | Angular Material      | Native Angular integration, consistent design system |
| State           | Services + RxJS       | Simpler approach, no boilerplate overhead            |
| Movie/Series DB | TMDB API              | Free tier, rich metadata, covers movies and series   |
| Anime DB        | AniList API (GraphQL) | Free, accurate, community-driven anime data          |
| AI Feature      | Google Gemini API     | Free tier, pairs well with Google login              |

---

## Core Features

### Authentication

- [ ] Google login via Supabase Auth (OAuth)
- [ ] User session persistence
- [ ] Protected routes (AuthGuard)

### Add Title

- [ ] Search bar with autocomplete
  - Queries TMDB (movies + series) and AniList (anime) in parallel
  - Shows type badge: Movie / Series / Anime
- [ ] Selecting a result saves it to the user's Supabase list
- [ ] Metadata stored: title, type, genres, duration, poster, external ID (tmdb/anilist), watched status

### Browse & Filter

- [ ] Display all titles in a card grid
- [ ] Filters:
  - Type: Movie / Series / Anime
  - Genre (tag-based)
  - Duration: ascending / descending
  - Title: alphabetical search
- [ ] Toggle "watched" status on a title card
- [ ] Remove a title from the list

### Random Pick

- [ ] Button that picks a random unwatched title from the current filtered view
- [ ] Optional: pick from a specific type or genre

### AI Suggestion (Gemini)

- [ ] Chat panel / modal
- [ ] User describes what they feel like watching in natural language
- [ ] Gemini receives the user's message + the list of unwatched titles as context
- [ ] Suggests the best match(es) from the list
- [ ] Optional toggle: "suggest even outside my list" (Gemini answers freely)

---

## Data Model (Supabase / Postgres)

### `profiles`

> **Not needed for this project.** Supabase manages users in its internal `auth.users` table.
> Only create a `profiles` table if you later need to store extra user data (display name, custom avatar, etc.).

### `watchlist_items`

- `id` (uuid, primary key)
- `user_id` (uuid, FK → **auth.users(id)** ON DELETE CASCADE)
- `title` (text)
- `type` (enum: movie | series | anime)
- `genres` (text[])
- `duration_minutes` (int, nullable — **movies only**)
- `episode_count` (int, nullable — **series and anime only**; duration is inferred, not stored)
- `poster_url` (text)
- `external_id` (text — TMDB or AniList ID)
- `external_source` (enum: tmdb | anilist)
- `watched` (boolean, default false)
- `added_at` (timestamp)

---

## Architecture Notes

### Dual API Search Strategy

When the user types in the search bar:

1. Debounce the input (e.g. 400ms) to avoid flooding APIs
2. Fire both a TMDB search and an AniList search simultaneously (forkJoin / combineLatest)
3. Merge and deduplicate results (a title might appear in both)
4. Display with source/type badge

### Gemini Integration

- Send a prompt that includes the list of unwatched titles (title + type + genres)
- Keep the prompt concise — Supabase stores the list, the Angular service builds the prompt
- Consider rate limits on the free tier: avoid sending requests on every keystroke

### Supabase Row-Level Security (RLS)

- Enable RLS on `watchlist_items`
- Policy: users can only SELECT/INSERT/UPDATE/DELETE their own rows
- This is critical since Supabase keys are exposed client-side

---

## Possible Future Developments

- **Social features**: share your list with a link (public profile page)
- **Ratings**: let users rate titles they've watched (1–5 stars)
- **Streaming availability**: integrate a "where to watch" API (e.g. JustWatch via TMDB)
- **Progress tracking**: for series/anime, track which episode you're on
- **Notifications / reminders**: "you haven't added anything in a while"
- **Import from Letterboxd / MAL**: import watching history from external platforms
- **Dark/light mode toggle**: Angular Material theming makes this straightforward
- **PWA support**: make it installable on mobile
- **Statistics page**: charts showing your watched/unwatched ratio, favorite genres, etc.
- **Collaborative lists**: shared lists between multiple users (e.g. for couples deciding what to watch)

---

## Open Questions / Decisions to Revisit

- [x] ~~How to handle duration for anime?~~ → Store `episode_count` only; no duration calculation
- [ ] Store Gemini conversation history client-side or in Supabase?
- [ ] How many results to show in autocomplete? (TMDB + AniList can each return 20+)
- [ ] Should "watched" items be hidden by default or just filterable?
- [ ] Pagination or infinite scroll for large lists?
- [ ] TMDB requires attribution — plan for a small footer note

---

## External API References

- TMDB API docs: https://developer.themoviedb.org/docs
- AniList GraphQL playground: https://anilist.co/graphiql
- Supabase docs: https://supabase.com/docs
- Gemini API (Google AI Studio): https://aistudio.google.com
- Angular Material: https://material.angular.io
