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

## Bigger — design it before building it

- [ ] **Keep a watchlist following a Letterboxd list.** Save the list URL, re-check it on a
      schedule, add what's new. The machinery is already there — `refresh-series` runs
      nightly off pg_cron and would be the model. What makes this a feature rather than an
      addition is the policy question: when someone *removes* a film from their list, does
      it leave yours? Answer that first.
- [ ] **Undo for a large import.** Adding 96 titles is one tap; taking them back is 96. A
      single "undo this import" needs an import batch id on the rows, which is a migration.
      Worth it only if a bad import actually happens to you.

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
