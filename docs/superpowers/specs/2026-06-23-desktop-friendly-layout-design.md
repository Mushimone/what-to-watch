# Desktop-Friendly Watchlist Layout — Design

> Replace the cramped three-column desktop layout with a left sidebar nav + a
> single full-width content pane showing the active section.
> Date: 2026-06-23

---

## Problem

On desktop (`min-width: 900px`) the watchlist page renders three fixed
side-by-side columns — List (~40%), Add (~28%), Shared (~32%) — each its own
scroll area. The primary activity (browsing the list) is squeezed into ~40% of
the width while a search box and the full Shared/tournament UI are permanently
docked, so everything feels cramped.

## Goal

A proper desktop-app shell: a left nav rail (Watchlist / Add / Shared + Sign out)
and ONE main pane showing the active section at full width. Mirrors the mobile
tab model (one active section at a time) but uses desktop chrome. Mobile is
unchanged.

## Scope

- **In:** the watchlist shell (`watchlist.ts` / `.html` / `.scss`).
- **Out:** internals of `watchlist-list`, `watchlist-add`, `watchlist-shared`,
  and the AI chat component — all reused as-is. (The list poster grid is already
  `minmax(150px, 1fr)`, so no grid change is needed.)

## Design

### State & structure (`watchlist.ts`, `watchlist.html`)

- Add `activeSection = signal<'list' | 'add' | 'shared'>('list')`.
- Add `setSection(section)` that sets `activeSection` and updates `chatMode`
  (`'add'` section → `'add'`; `'list'`/`'shared'` → `'list'`).
- Desktop branch (`@if (isDesktop())`): `<nav class="sidebar">` + a
  `<main class="content">` whose body is `@switch (activeSection())` rendering
  exactly one of `<app-watchlist-list>`, `<app-watchlist-add>`,
  `<app-watchlist-shared>`.
- Mobile branch: the existing `mat-tab-group` unchanged.
- The top `.page-header` (brand + logout) is shown only on mobile
  (`@if (!isDesktop())`); on desktop the brand and Sign out live in the sidebar.
- The AI chat FAB stays outside both branches; `chatMode` now follows
  `activeSection`.

### Sidebar & content visuals (`watchlist.scss`)

- `.desktop-shell`: `display: flex; height: 100dvh`.
- `.sidebar`: fixed width ~220px, full height, `border-right` using
  `--mat-sys-outline-variant`, surface background. Vertical layout: brand title
  at top, three nav buttons (icon + label), and **Sign out pinned to the
  bottom** (`margin-top: auto`).
- Nav item: full-width, left-aligned, icon + label. Active item gets a tinted
  background and primary-colored text/icon; non-active items get a hover state.
- `.content`: `flex: 1`, `overflow-y: auto`, comfortable padding, with
  `max-width: 1400px; margin-inline: auto` so it doesn't sprawl on ultra-wide
  screens.

## Verification

- `npm run build` succeeds.
- Unit test: `setSection('add')` sets `activeSection() === 'add'` and
  `chatMode === 'add'`; `setSection('shared')` leaves `chatMode === 'list'`.
- Manual visual check at desktop width: nav switches the single content pane;
  active item highlighted; Sign out at the bottom; mobile still shows tabs.
