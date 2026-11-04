# Backlog

Ranked by what it costs against what it buys, not by what sounds exciting. Anything with a
clear reason to stay undone is in **Won't do** with the reason attached, so it doesn't get
re-litigated every few months.

See [STATUS.md](./STATUS.md) for where things stand today.

---

## Small — an hour or less each

- [ ] **Delete the merged `feat/list-import` branch** on origin once you're happy with the
      import feature in production.
- [ ] **Refresh or delete `PLANNING.md`.** It's local-only and five months stale — it still
      names Gemini and AniList. Right now it's a trap for future-you.

## Worth doing

- [ ] **Import a member's watched films** — `letterboxd.com/<user>/films/`. One extra path in
      `listUrl()`, and because the app already has a `watched` flag those titles can come in
      already marked watched instead of joining the unwatched pile. This is the only import
      addition that gains a capability the app can actually express.
- [ ] **Paste raw text as a third import source** — a column of titles, or a block of `tt`
      ids. The resolver and the review sheet already exist; this is a tokenizer and roughly
      fifteen lines. Deferred during the import build only because nobody had asked for it.
- [ ] **Backfill details for imported titles.** An import can add 100 rows with sparse
      metadata, and enrichment currently happens when an item is opened. `scripts/
      backfill-details.js` exists — decide whether the import should trigger it, or whether
      lazy enrichment is genuinely fine (it probably is).

## Next — decided 2026-11-04, in this order

## Parked — only if it comes up

- Import a member's watched films (`letterboxd.com/<user>/films/`) — listed under Worth doing.
- Paste raw text as an import source — listed under Worth doing.
- Stream "More like this" like the chat does (it still uses the buffered `chat()`).

## Bigger — design it before building it

- [ ] **Keep a watchlist following a Letterboxd list.** Save the list URL, re-check it on a
      schedule, add what's new. The machinery is already there — `refresh-series` runs
      nightly off pg_cron and would be the model. What makes this a feature rather than an
      addition is the policy question: when someone *removes* a film from their list, does
      it leave yours? Answer that first.
- [ ] **Undo for a large import.** Adding 96 titles is one tap; taking them back is 96. A
      single "undo this import" needs an import batch id on the rows, which is a migration.
      Worth it only if a bad import actually happens to you.

## Done 2026-11-04 — initial bundle back under 500 kB

501.75 → 487.04 kB (raw; 127 kB over the wire). One cause: `app.config.ts` imported
`MAT_ICON_DEFAULT_OPTIONS` from `@angular/material/icon`, which dragged Material's whole icon module (~15 kB)
into the first load although icons are only used on lazy routes. The icon font is now chosen in CSS
(`mat-icon.material-icons` → Material Symbols Rounded in `styles.scss`) instead of a provider. Checked in the
browser: all 84 icons on the list page render from the Symbols font.

**Lesson, learned the hard way the same day.** The first version of that CSS copied the font family but not
`font-size: 24px` / `line-height: 1`, which Google's stylesheet had been supplying through the same class. Icons
with no size of their own then inherited the surrounding text (14px nav icons) and shipped that way until it was
spotted. The fix keeps those two properties in a **class-only** rule (`.material-icons`, specificity 0,1,0) and
leaves `display` and the FILL axis on `mat-icon.material-icons`. That specificity is deliberate: component
styles such as `.card-icon-btn mat-icon { font-size: … }` carry an attribute selector and must still outrank the
default, so only unsized icons get 24px.

When a stylesheet is replaced rather than moved, diff what it *computed*, not what it *declared*: dump
`getComputedStyle` (font-size, width, line-height) for every `mat-icon` on a page before and after, and compare.
That is how the fix was verified — 21 icon/parent combinations on the list page, zero differences. Dialog and
snackbar icons weren't covered; they use the same global rule.

Where the rest of the weight is, if the budget creeps up again (measured with `ng build --stats-json`):
Angular core 133 kB, **Supabase client ~165 kB** (auth 84, realtime 34, **storage 19 + iceberg 5 — never used
by the app**, postgrest 14), router 69, common 38, rxjs 22. The unused storage client is the only real fat
left, and shedding it means assembling the client from `@supabase/auth-js`, `postgrest-js`, `functions-js`
and `realtime-js` instead of `createClient` — a rewrite of `SupabaseService`, not worth it for ~30 kB today.

## Done 2026-11-04 — chat latency: turn MiMo's thinking off

**What the API actually is.** Production runs `mimo-v2.6-flash` (the `MIMO_MODEL` secret; the response's
`model` field says so). `mimo-v2.5-pro` and `mimo-v2.5` were retired 2026-10-21
([MiMo deprecations](https://mimo.mi.com/docs/en-US/updates/deprecate)), so nothing to migrate. MiMo has **no
`reasoning_effort`** — the field we used to send was silently ignored. Reasoning is `thinking: {type:
'enabled' | 'disabled'}`, **on by default** for the 2.6 models.

**What was slow.** Not the prompt: a 4,100-token prompt with an empty cache was the *fastest* to start, and the
provider already caches the prefix (4,096 tokens `cached` across turns and across a reload). Time is
generation, ~17-30 tokens/s, and in the chat roughly half of the tokens were thinking.

**Measured on the real chat prompt** (32-title list, 5 paired runs, same question per pair, order alternated):

| | first word | total | tokens out |
|---|---|---|---|
| thinking on (median / worst) | 10.9 s / 35.3 s | 17.8 s / 38.5 s | 510 / 1141 |
| thinking off (median / worst) | 3.2 s / 9.1 s | 9.6 s / 17.9 s | 192 / 236 |

Answers were not worse with it off: same picks, shorter, and the thinking-on ones had more slips (a mangled
title, "Obitario" for *Obituary*, which would have broken its link). Verified in the app afterwards: 0 reasoning
tokens, first word 4.6 s, total 12.1 s.

- `OpenAiService` now sends `thinking: 'disabled'` unless a caller passes `{ thinking: 'enabled' }`. The
  `reasoningEffort` option is gone. "More like this" and the chat run with it off.
- **Group pick keeps thinking on** (`'enabled'`): weighing two tastes may want it, and it wasn't measured. Worth
  the same 5-pair test if it feels slow.
- Prompt: added a one-line **critic's pick** ("a lesser-known or acclaimed title that fits my taste") and a
  120-word cap. It comes from the user's own UNWATCHED list in list mode.
- Kept the synopsis in the prompt lines: tried-and-checked, the model invents plots for mid-known titles
  (Tampopo: "a samurai") and only says "I don't know it" for truly obscure ones. Cutting them would not have
  made anything faster anyway.
- `[mimo]` console log (dev only): usage, cached and reasoning tokens, time to first thought / first word / total.
- **Deploy drift:** production runs the function version that accepts `thinking` and still forwards the
  (ignored) `reasoning_effort`. The repo version drops that line. Harmless; a plain redeploy of `mimo-chat`
  aligns them.
- **`mimo-v2.6-pro` tried, not adopted** (2026-11-04). Compared with flash on the same chat prompt, thinking off,
  5 paired runs: quality alike (same picks; pro once listed an already-watched title as an alternative), ~200
  tokens each, cost ~3x. Pro's first word was faster in that session (median 3.6 s vs 8.5 s) but flash had
  measured 3.2 s an hour earlier — provider load swings more than the gap between the models. No reason to
  switch; revisit only if flash gets consistently slow. The model is the Supabase secret `MIMO_MODEL`
  (not a Vercel variable — the client never sees it).
- The per-request `model` option used for that test was deployed once and is removed from the code; production
  still has it (harmless: two whitelisted names, ignored otherwise) until the next `mimo-chat` deploy.

## Done 2026-11-04 — CI

`.github/workflows/ci.yml` runs on every push to `master` and on every pull request:
`npm test`, `npm run test:functions`, then `npm run build` (type errors and the 1 MB bundle
ceiling only show up there). No secrets: `set-env.js` only checks the three variables exist, and
the workflow gives it dummy values. Checked from a clean copy of the tracked files, not just here.

- **It does not gate the deploy.** Vercel still publishes `master` on its own; CI turns the commit
  red, it doesn't stop Vercel. Making it block means a GitHub branch protection rule plus Vercel's
  "wait for checks" setting — a decision, not a default.
- Some specs build a real Supabase client; in CI it points at an invalid host and logs
  `fetch failed`. Noise, not failures.

## Parked: a canary for Letterboxd's markup

The `import-list` parser test reads a **saved** page, so it catches our regressions but cannot see
Letterboxd change their HTML (STATUS used to claim it could). Catching that needs a scheduled
workflow that fetches one stable public list and runs the parser on it. Worth it only if the
link import actually gets used.

## Done 2026-11-04 — taste without reactions, and asking for them

Only 10 of 115 watched titles in production had a 👍/👎 (14 users), so the recommender cannot
lean on them. Prompts now build a taste from what is always there:

- A **PROFILE** block counted over *every* watched title (top genres, directors seen twice or
  more, film/series mix, reactions given and an explicit "no reaction is not a dislike"), so a
  trimmed sample still carries the whole history. Solo and group-pick prompts both have it.
- Trimming keeps 👍/👎 first, then the **most recently added**; candidates are ranked by **genre
  fit** to the watched list, ★ only as a tiebreak. Before, no reactions meant "highest TMDB score".
- A show begun but not finished is tagged `[started: 2/5 seasons]` — interest without a button.
- The method text no longer treats ★ as the user's rating (it is TMDB's score).

And the reaction itself is now asked for: marking a title watched **from the card's eye** opens a
snackbar, "Watched · Title", with ♥ and 👎 (same glyphs as the sheet, 6 s, replaces itself).
Not asked when un-watching, when the title already has a reaction, or from the sheet.

## Done 2026-11-04 — new-season notice

The badge itself already existed (`has_update`, set by `refresh-series`, shown on the card,
cleared when the sheet opens). What was missing was being *told*:

- Flagged shows **float to the top of the list** whatever the sort, and their card has an accent
  ring on top of the existing "New season" / "New episodes" badge.
- **"My list" in the navigation carries a count** of flagged shows (rail pill on desktop, corner
  mark on the mobile bottom nav).
- **"New seasons (n)" in the filter menu**, with a chip when active. The entry appears only
  while something is flagged.
- Verified 2026-11-04 against production: the pg_cron job `refresh-series-progress` is active,
  runs 06:00 UTC and has been succeeding nightly; 9 of 141 series rows were flagged. (`succeeded`
  in `cron.job_run_details` only means the HTTP call was queued — the flagged rows are the proof.)
- Still true by design: only shows marked *fully watched* are flagged; a half-watched show that
  gains a season is left alone.

## Parked: push notifications for new seasons

Needs a `push_subscriptions` table, VAPID keys, a push handler in the service worker, a
permission prompt, and a sender at the end of `refresh-series`. iOS only delivers to an
*installed* PWA; the Android TWA works. Worth building only if people stop opening the app
between seasons.

## Done 2026-11-04 — clickable AI suggestions

`**Title (Year)**` in the chat, "More like this" and the group-pick result is a button
(`MarkdownPipe` → `title-link`; one `titleLinks` click handler on the container →
`TitleLinks.open()`). It resolves with `searchTitles()` + the import's `pickMatch`, then opens
the saved row if the title is on the list, otherwise the add-preview. No match → snackbar.
Titles already on the list carry a ✓. A link inside a detail sheet replaces that sheet.

- The prompts now put `Watch this:` *outside* the bold (`Watch this: **Title (Year)**`), so a
  translated prefix can't end up in the search. The pipe still tolerates the old form.
- The ✓ matches on normalised title + exact year; a model that is a year off shows no tick but
  still opens the right film.
- Not exercised in a browser (login is Google OAuth) — worth one click-through on a deployed build.
- TMDB `/recommendations` was left out on purpose; if wanted, it is its own entry.

## Done 2026-11-04 — architecture pass

- Chat prompt capped (`PROMPT_CAP` in `recommend.prompt.ts`): 60 watched, 150 candidates,
  👍 then 👎 then ★ first, with a "…and N more not shown" line. A 1,000-title import used to be
  re-sent whole on every message. Add mode lists the whole library as `Title (Year)` only, since
  that is the exclusion set. **Group-pick's shared pool is still uncapped** (only the two watched
  lists are).
- `mimo-chat` bounds one call: 40 messages, 60k characters, `max_tokens` ≤ 4,000. The client sends
  the system prompt plus the last 30 turns.
- All prompts now live in `recommend.prompt.ts` (`buildListPrompt`, `buildAddPrompt`,
  `buildSimilarMessages`), not in components.
- `WatchlistAiChatComponent` is signals: `input()`, `viewChild()`, `isOpen` signal with
  `toggle()` / `close()`. The shell calls `chat.toggle()`.
- `mimo-chat` redeployed 2026-11-04 (function version 5, `verify_jwt` on), so the limits are live.

## Won't do

- **A "rate what you've watched" pass.** One card at a time over the watched titles that have no
  reaction. Dropped 2026-11-04: not wanted. The snackbar after "watched" and the taste profile built
  from what was watched (which doesn't need reactions) cover the same need without a separate flow.

- **IMDb import by link.** Every imdb.com page answers a server fetch with an AWS WAF
  challenge, and their robots.txt forbids automated collection in as many words. Getting
  round either means defeating a countermeasure they put up deliberately. The CSV export
  path already covers IMDb and matches *better*, by `tt` id. Verified 2026-08-14.
- **Accepting `boxd.*` as Letterboxd.** Only `boxd.it` is theirs — `boxd.me` redirects to a
  Brazilian delivery company, `boxd.net` and `boxd.com` belong to others again. Wildcarding
  the TLD would let anyone who registers one make the edge function fetch their host.
  Verified 2026-08-14.
- **Caching or rate-limiting `import-list`.** One user, occasional imports, JWT-gated. The
  1.4s round trip is Letterboxd's, not ours.
- **A state management library.** Services holding `BehaviorSubject`s plus `toSignal` cover
  everything the app does. Adding a store would be ceremony.

## Deliberate shortcuts already in the code

Marked with `ponytail:` comments — simplifications taken on purpose, each naming its own
ceiling. Grep for them (`grep -rn "ponytail:" src supabase`) before assuming any is a bug:

| Where | Shortcut |
| --- | --- |
| `migrations/20260101…_baseline` | `timestamp` not `timestamptz`, mirroring production as-is |
| `migrations/20260101…_baseline` | no separate `user_id` index — the unique constraint covers it |
| `migrations/20260721…_cron` | needs `pg_cron` + `pg_net` enabled by hand once |
| `core/services/search.service.ts` | season index 0 = season 1, drifts if a middle season aired nothing |
| `core/directives/infinite-scroll.ts` | observer only re-fires once the sentinel has left |
| `watchlist-detail-dialog.ts` | watched-state derived, not stored, so out-of-order viewing works |
| `styles.scss` | one hover signal — background, not scale |
