# Preview-before-add modal — Design

**Date:** 2026-06-25
**Status:** Approved

## Summary

Today, selecting a search result in `watchlist-add` immediately enriches it and
adds it to the watchlist. This change inserts a **preview modal** between the
click and the add: the user sees the title's useful info (poster, year, rating,
runtime, director, genres, overview, where-to-watch) and an explicit **Add to
watchlist** action. The modal reuses the existing `WatchlistDetailDialog` via a
new **preview mode**, and the shared body gains a **backdrop hero header** that
benefits both the preview and the existing saved-item dialog.

## Goals

- Show useful info about a clicked search result before committing it to the list.
- Reuse the existing detail dialog (one source of truth for the layout).
- Add a backdrop hero header to the shared body.
- Surface a clear "already in your watchlist" state in the preview.

## Non-goals

- No trailer, cast, or tagline enhancements (deferred).
- No database schema change — the backdrop is display-only.
- No changes to the four existing call sites that open the saved dialog.

## User-facing behavior

1. In `watchlist-add`, selecting a result **no longer adds immediately**. It
   opens `WatchlistDetailDialog` in **preview mode**, passing the `SearchResult`.
2. The modal lazily fetches details (overview / runtime / director / backdrop)
   and where-to-watch providers — the same calls the saved dialog already makes.
3. Preview footer: **Add to watchlist** + **Cancel**.
   - If the title is already in the list, the Add button is replaced by a
     disabled **✓ Already in your watchlist** indicator.
4. On **Add**: the dialog adds the item, closes, and returns a status string.
   `watchlist-add` reacts to the status — shows the existing snackbar
   (`"<title>" added to your watchlist!` / error) and clears the search box.
5. On **Cancel** or click-outside: dialog returns `undefined`, no snackbar, the
   search box keeps its text.

The "more like this" AI feature remains available in the modal (it works off the
title/genres/overview, all present on a `SearchResult`).

## Architecture (Approach A — backward-compatible mode flag)

### Dialog data shape

The dialog accepts a union. The legacy bare-`WatchlistItem` shape continues to
mean "saved mode", so the four existing call sites (`watchlist-list`,
`watchlist-time-picker-dialog`, `watchlist-tournament-dialog`,
`watchlist-shared`) need **no changes**.

```ts
export type DetailDialogData =
  | WatchlistItem                                // legacy → saved mode
  | { mode: 'preview'; result: SearchResult };   // new → preview mode
```

### `WatchlistDetailDialog` changes

- Derive `mode: 'saved' | 'preview'` from the injected data (preview when
  `data` has `mode === 'preview'`).
- Normalize both inputs into one `item` signal. In preview mode, build an
  item-like object from the `SearchResult` with `watched: false` and no `id`.
- Add a `backdrop = signal<string | null>(null)` populated from the details
  fetch.
- **Preview mode:**
  - Fetch details for **display only** — skip `watchlist.updateDetails(...)`
    (there is no row yet).
  - Compute `alreadyAdded` by matching the result's `external_id` +
    `external_source` against `watchlist.watchlistItems$` (take 1).
  - `add()` calls `watchlist.addToWatchlist(item)` and
    `dialogRef.close(status)`, where status is `'added' | 'duplicate' | 'error'`.
  - `toggleWatched()` / `remove()` are not shown.
- **Saved mode:** unchanged behavior, except it now also reads `backdrop_path`
  from the details response to populate the hero header (see trade-off below).
- Template selects the preview footer vs. the saved footer via
  `@if (mode === 'preview')`. The shared body markup (poster, meta, overview,
  providers, "more like this") is untouched aside from the hero header.

### `watchlist-add` changes

- Inject `MatDialog`.
- `onResultSelected` opens `WatchlistDetailDialog` with
  `{ mode: 'preview', result }` instead of enriching + adding inline.
- Subscribe to `afterClosed()`; on a defined status, show the existing snackbar
  and reset the search (`searchControl.setValue('')`, `resetSearch$.next()`).
- The inline enrichment (`getTmdbDetails`) and `addToWatchlist` logic moves into
  the dialog's `add()`.

## Backdrop hero header

- `tmdb.model.ts`: add `backdrop_path?: string | null` to `TmdbDetails`; add
  `backdrop_url: string | null` to `TmdbEnrichment`.
- `SearchService.mapToEnrichment`: build `backdrop_url` as
  `https://image.tmdb.org/t/p/w780${backdrop_path}` (null when `backdrop_path`
  is absent).
- Template: when a backdrop is present, render it as a banner behind the title
  with a gradient fade into the dialog background and the poster on top.
  **Fall back to the current poster-only header** when there is no backdrop.
- SCSS: add hero/banner styles to the detail dialog stylesheet.

### Display-only trade-off (accepted)

The backdrop is **not persisted** (`updateDetails` only writes
`duration_minutes / director / overview`, and we are not adding a DB column). To
show the backdrop consistently on saved items as well, saved mode fetches
details on open even when the item is already enriched — **one extra lightweight
TMDB details call per open** for already-enriched items (today such items make
zero detail calls). This is accepted as a fair cost for a consistent header.

## Error handling

- All fetches keep the existing `catchError(() => of(...))` fallbacks. A failed
  details / providers / backdrop call degrades gracefully (poster-only header,
  "not available" providers) and never blocks the Add action.
- Cancel / click-outside returns `undefined` → no snackbar, search text retained.

## Testing

- `watchlist-add.spec.ts`: selecting a result **opens the dialog** rather than
  adding directly; the snackbar fires based on the status returned from
  `afterClosed()`.
- Detail-dialog spec: preview-mode cases — Add button calls `addToWatchlist` and
  closes with the status; already-added state renders the disabled indicator;
  backdrop falls back to poster-only when absent; saved mode still renders the
  watched/remove actions.

## Affected files

- `src/app/core/models/tmdb.model.ts` — backdrop fields.
- `src/app/core/services/search.service.ts` — `backdrop_url` in enrichment.
- `src/app/features/watchlist/watchlist-detail-dialog/watchlist-detail-dialog.ts`
  — mode flag, preview logic, backdrop, add/cancel.
- `.../watchlist-detail-dialog.html` — hero header, preview footer.
- `.../watchlist-detail-dialog.scss` — hero styles.
- `src/app/features/watchlist/watchlist-add/watchlist-add.ts` — open dialog,
  react to status.
- Specs: `watchlist-add.spec.ts` and the detail-dialog spec.
