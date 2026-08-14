# Project status

Where **What to Watch** actually is, as of **2026-08-14** (commit `75ece49`).

The [README](../README.md) says what the app is and how to run it. This file says what
state it is in — what's built, what's deployed, what's known to be wrong. When the two
disagree, the README is the pitch and this is the truth.

> `PLANNING.md` (untracked, local only) was last touched 2026-03-19 and has since gone
> stale — it still names Gemini for AI and AniList for anime, neither of which shipped.
> Read it as history, not as a plan.

---

## Shape of the thing

Angular 21 standalone + signals, Supabase for auth and data, TMDB for metadata, MiMo for
chat. One authenticated route (`/watchlist`) holds four panes behind a section switch;
everything else is public or auth chrome.

```
/                 home (redirects to /watchlist when signed in)
/login            Google OAuth
/watchlist        the app — list · add · friends · profile panes
/invite/:token    one-time friend invite
/privacy /terms /delete-account   legal
```

State lives in root-provided services holding `BehaviorSubject` caches; components read
them through `toSignal`. There is no store library and no need for one.

## What is built

| Area | State |
| --- | --- |
| Auth | Google OAuth, guards on both sides, account deletion via edge function |
| Watchlist | add, remove, watched/unwatched, per-season and per-episode progress, reactions, filters, sorting |
| Search | TMDB title search with director fold-in, infinite scroll, detail sheet with providers |
| Friends | invite by one-time link, merged shared pool, realtime friendship updates |
| Deciding | knockout tournament, pick-by-time-available, AI chat over your own list |
| Import | **new** — CSV export or a public Letterboxd link, see below |
| PWA | installable, Angular service worker, plus an Android TWA (`public/.well-known/assetlinks.json`) |

## Data

Nine migrations in `supabase/migrations/`, baseline first. The table that matters is
`watchlist_items`, with `unique (user_id, external_id, external_source)` — that constraint
is what every duplicate check in the app ultimately leans on. RLS throughout.

`20260721020000_series_update_cron.sql` needs `pg_cron` + `pg_net` enabled once by hand;
it says so in the file.

## Edge functions

All in `supabase/functions/`, deployed individually with the Supabase CLI (there is no
`config.toml`; each file's header comment carries its own deploy line).

| Function | Does | Secrets |
| --- | --- | --- |
| `mimo-chat` | proxies the chat API so the key never ships to the browser | `MIMO_API_KEY`, `MIMO_MODEL` |
| `delete-account` | deletes the caller's own auth user, cascades everything | service role |
| `refresh-series` | nightly pg_cron job; un-marks shows that gained a season | `TMDB_API_KEY`, `CRON_SECRET` |
| `import-list` | reads a public Letterboxd list, returns raw `Title (Year)` strings | none |

`import-list` is deliberately thin: it fetches and reads HTML and nothing else. Matching
happens on the client so the import's progress can be counted honestly.

## The import feature, in more detail

Two ways in, because they have different costs:

- **CSV export** — no backend at all. IMDb's export carries the `tt` id, so those match
  exactly; Letterboxd's carries title and year.
- **Public Letterboxd link** — needs `import-list`, because letterboxd.com sends no CORS
  headers. `boxd.it` short links are resolved; view-mode tails (`/detail/`, `/by/rating/`,
  `/page/3/`) are normalised away.

**IMDb links are refused on purpose and this will not change.** Every imdb.com page
answers a server-side fetch with an AWS WAF challenge instead of HTML, and IMDb's
robots.txt forbids automated collection outright. The sheet says so and points at the
export, which matches better anyway.

The matcher (`src/app/features/watchlist/watchlist-import/list-import.ts`) was calibrated
against a real 1,056-title Letterboxd export rather than by guesswork:

- the year decides between films sharing a title; within one year, TMDB's own ranking does
- a one-year drift is absorbed (festival premiere vs release)
- an article or franchise prefix is reconciled *only* when the year agrees and the title is
  three or more words — ungated, that rule silently matched "Escape" to "Escape Fire"

Measured **98.9% matched automatically, zero wrong-year matches**. What's left is shown as
questions the user answers, never guessed at.

## Tests

```bash
npm test               # ng test — 20 files, 95 tests, all passing
npm run test:functions # vitest over supabase/ — the edge-function parser, 13 tests
```

**Use `npm test`, not `npx vitest run`.** Running vitest directly skips Angular's TestBed
bootstrap and every component spec fails with `Need to call TestBed.initTestEnvironment()`
— a harness artifact that looks exactly like a broken suite and isn't one.

`ng test` only walks `src/`, which is why the edge-function parser has its own command. Its
spec asserts against **verbatim saved markup** from a real Letterboxd page
(`supabase/functions/import-list/__fixtures__/`), so a redesign on their end fails loudly
here instead of silently in production.

## Known issues

- **Initial bundle is 1.13 kB over** the 500 kB warning budget (501.13 kB). Warning only;
  the error threshold is 1 MB.
- **Two component stylesheets exceed** the 6 kB style budget — the detail sheet by 2 kB,
  the import sheet by ~0.9 kB. Warnings only.
- **The edge-function tests don't run in `npm test`.** Separate command, easy to forget.
- **`scripts/set-env.js` generates `environment.ts` from `.env`** — both generated files are
  gitignored. A fresh clone must run `npm start` or `npm run build` before anything else
  works.

## Deployment

Vercel from `master`, service worker via `ngsw-config.json`. Edge functions are **not** part
of that deploy — they go up separately:

```bash
npx supabase functions deploy <name> --project-ref dgjpkelrxttlivivzayl
```
