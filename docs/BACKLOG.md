# Backlog

Ranked by what it costs against what it buys, not by what sounds exciting. Anything with a
clear reason to stay undone is in **Won't do** with the reason attached, so it doesn't get
re-litigated every few months.

See [STATUS.md](./STATUS.md) for where things stand today.

---

## Small — an hour or less each

- [ ] **Delete the merged `feat/list-import` branch** on origin once you're happy with the
      import feature in production.
- [ ] **Fold `npm run test:functions` into CI** (or into `npm test`), so the edge-function
      parser can't rot unnoticed. It's the piece most likely to break from the outside.
- [ ] **Trim the initial bundle back under 500 kB**, or raise the budget deliberately. It is
      1.13 kB over and drifting up with each feature; picking one is better than watching
      the warning scroll past forever.
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

- [ ] **Ask 👍/👎 after marking something watched.** The recommender is only as good as the
      reactions it can read.
- [ ] **Run `npm test` and `npm run test:functions` in CI** (already listed above; now wanted).

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
- **Redeploy `mimo-chat`** for the limits to take effect:
  `npx supabase functions deploy mimo-chat --project-ref dgjpkelrxttlivivzayl`

## Won't do

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
