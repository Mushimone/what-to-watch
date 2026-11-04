# Project status

Where **What to Watch** actually is, as of **2026-11-04** (master after `bc9bf29`).

The [README](../README.md) says what the app is and how to run it. This file says what
state it is in — what's built, what's deployed, what's known to be wrong. When the two
disagree, the README is the pitch and this is the truth.

---

## Shape of the thing

Angular 21 standalone + signals, Supabase for auth and data, TMDB for metadata, MiMo
(`mimo-v2.6-flash`) for chat. One authenticated route (`/watchlist`) holds four panes behind a section switch;
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
| New seasons | the nightly job flags finished shows that gained a season; flagged cards lead the list, carry a strip and a border, "My list" shows a count, the filter menu has "New seasons (n)"; marking watched or opening the sheet clears it |
| Search | TMDB title search with director fold-in, infinite scroll, detail sheet with providers |
| Friends | invite by one-time link, merged shared pool, realtime friendship updates |
| Deciding | knockout tournament, pick-by-time-available, AI chat over your own list, AI pick for two friends |
| Assistant | chat in two threads (your list / something new) plus "More like this"; every `**Title (Year)**` it names is a button that opens the saved row or the add-preview, with a ✓ when already listed. See below |
| Reactions | ♥ / 👎 in the detail sheet, and a snackbar after the card's eye marks a title watched |
| Import | CSV export or a public Letterboxd link, see below |
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
| `mimo-chat` | proxies the chat API so the key never ships to the browser; bounds a call (40 messages, 60k characters, `max_tokens` ≤ 4,000) and forwards `thinking` | `MIMO_API_KEY`, `MIMO_MODEL` |
| `delete-account` | deletes the caller's own auth user, cascades everything | service role |
| `refresh-series` | nightly pg_cron job (06:00 UTC); un-marks shows that gained a season and sets `has_update` | `TMDB_API_KEY`, `CRON_SECRET` |
| `import-list` | reads a public Letterboxd list, returns raw `Title (Year)` strings | none |

`import-list` is deliberately thin: it fetches and reads HTML and nothing else. Matching
happens on the client so the import's progress can be counted honestly.

**The secrets live in Supabase, not Vercel.** `MIMO_MODEL` is read by `mimo-chat` on Supabase
(`supabase secrets set …`); a variable of the same name on Vercel is never read. Vercel's
variables only feed the Angular build (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `TMDB_API_KEY`).

## The assistant, in more detail

All prompts are in `src/app/features/watchlist/recommend.prompt.ts`; components only call them.

- **Size is capped, not unbounded:** 60 watched and 150 candidate titles (👍 then 👎 then most
  recent for the watched; genre fit to what was watched for the candidates), with a
  "…and N more" line. A 1,000-title import used to be re-sent whole on every message.
- **Taste doesn't depend on reactions.** Only ~9% of watched titles had a 👍/👎 when measured, so each
  prompt carries a PROFILE counted over *all* watched titles (genres, directors seen twice, film/series
  mix), marks shows that were started but not finished, and says a missing reaction is not a dislike.
- **MiMo has no `reasoning_effort`.** Thinking is `thinking: {type}` and is on by default for the 2.6
  models. `OpenAiService` sends `disabled` unless a caller asks otherwise: on the real chat prompt that
  took the median first word from ~10.9 s to ~3.2 s with no loss in picks. Only the two-friend pick keeps
  it on, unmeasured. Numbers and method are in [BACKLOG.md](./BACKLOG.md).
- **The prompt isn't the slow part.** The provider already caches the prefix (4,096 tokens `cached`);
  time is generation at ~17-30 tokens/s. The model invents plots for mid-known titles, so synopses stay in
  the prompt lines.
- **Dev-only `[mimo]` log** in the browser console: usage, cached and reasoning tokens, time to first
  thought / first word / total.

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
npm test               # ng test — 22 files, 117 tests, all passing
npm run test:functions # vitest over supabase/ — the edge-function parser, 14 tests
```

**Use `npm test`, not `npx vitest run`.** Running vitest directly skips Angular's TestBed
bootstrap and every component spec fails with `Need to call TestBed.initTestEnvironment()`
— a harness artifact that looks exactly like a broken suite and isn't one.

`ng test` only walks `src/`, which is why the edge-function parser has its own command. Its
spec asserts against **verbatim saved markup** from a real Letterboxd page
(`supabase/functions/import-list/__fixtures__/`). That pins our parser against regressions; it
cannot notice Letterboxd changing their HTML, because the fixture never changes.

Both commands, plus a build, run in GitHub Actions on every push and PR (`.github/workflows/ci.yml`).
They do not block the Vercel deploy.

## Known issues

- **Initial bundle is 487 kB**, under the 500 kB budget (was 501 before the icon font moved to CSS).
- **Two component stylesheets exceed** the 6 kB style budget — the detail sheet by 2 kB,
  the import sheet by ~0.9 kB. Warnings only.
- **The edge-function tests don't run in `npm test`.** Separate command; CI runs both.
- **CI doesn't gate the deploy.** A red commit still ships to Vercel.
- **Production `mimo-chat` is one deploy behind the repo:** it still accepts a per-request `model`
  that the code no longer has (two whitelisted names, harmless). A plain redeploy aligns it.
- **Some specs build a real Supabase client**; in CI it points at an invalid host and logs `fetch failed`.
  Noise, not failures.
- **Running locally:** `npm start` needs a `.env` (it regenerates the environment files first). With the
  generated `src/environments/environment.ts` already present, `npx ng serve` works without it.
- **`scripts/set-env.js` generates `environment.ts` from `.env`** — both generated files are
  gitignored. A fresh clone must run `npm start` or `npm run build` before anything else
  works.

## Deployment

Vercel from `master`, service worker via `ngsw-config.json`. An open app checks for a new build every
60 s and reloads itself when one is ready, so a phone picks up a deploy within a minute or two; a closed
app gets it on the next launch. Edge functions are **not** part
of that deploy — they go up separately:

```bash
npx supabase functions deploy <name> --project-ref dgjpkelrxttlivivzayl
```
