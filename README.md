# What to Watch

> Wanted a smarter watchlist. Built one.

**What to Watch** is a PWA for tracking movies, series and anime — with a built-in AI assistant that understands what you're in the mood for, not just what genre you want.

🔗 **[Live site](https://what-to-watch-tawny.vercel.app)**

---

## Features

|                 |                                                                                                                       |
| --------------- | --------------------------------------------------------------------------------------------------------------------- |
| 🔍 **Search**   | Find movies, series and anime via the TMDB API                                                                        |
| ✅ **Track**    | Mark titles watched / unwatched, follow seasons and episodes, filter and sort your list                               |
| 👥 **Friends**  | Invite by one-time link, then see both lists merged with what you each already want                                   |
| 🎲 **Decide**   | Pick tonight's title by knockout tournament, by how much time you have, or by asking the AI                           |
| 🤖 **AI chat**  | Context-aware assistant (MiMo) that knows your list and reasons about mood, tone and atmosphere — not just genre tags |
| 📱 **PWA**      | Installable on mobile, works like a native app                                                                        |
| 🔐 **Auth**     | Google OAuth via Supabase, per-user data with Row Level Security                                                      |

---

## Tech stack

- **Framework** — Angular 21 (standalone components, signals, control flow)
- **UI** — Angular Material 3 bridged onto a project token system (see [Design](#design)), dark, mobile-first
- **Reactive layer** — RxJS (`combineLatest`, `BehaviorSubject`, `takeUntilDestroyed`)
- **Backend / Auth** — Supabase (PostgreSQL + RLS + Google OAuth)
- **AI** — MiMo (OpenAI-compatible chat-completions API)
- **External APIs** — TMDB (movies & series)
- **Deploy** — Vercel + Angular service worker (PWA)

---

## Getting started

### Prerequisites

- Node.js `^20.19` · `^22.12` · `≥24` (Angular 21's supported range)
- A [Supabase](https://supabase.com) project with Google OAuth enabled
- A [TMDB](https://www.themoviedb.org/settings/api) API key
- A MiMo API key + model name

### Setup

```bash
git clone https://github.com/Mushimone/what-to-watch.git
cd what-to-watch
npm install
```

Create a `.env` file in the project root with your keys (read by `scripts/set-env.js`, which generates `environment.ts` / `environment.prod.ts` on `npm start` / `npm run build`):

```bash
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
TMDB_API_KEY=...
MIMO_API_KEY=...
MIMO_MODEL=...
# MIMO_BASE_URL is optional (defaults to the MiMo endpoint)
```

`environment.example.ts` shows the generated shape for reference.

```ts
// src/environments/environment.ts
export const environment = {
  production: false,
  supabase: { url: 'YOUR_SUPABASE_URL', anonKey: 'YOUR_SUPABASE_ANON_KEY' },
  tmdb: { apiKey: 'YOUR_TMDB_KEY', baseUrl: '...', imageBaseUrl: '...' },
  mimo: { apiKey: 'YOUR_MIMO_API_KEY', model: 'YOUR_MIMO_MODEL', baseUrl: '...' },
};
```

### Run locally

```bash
npm start        # dev server at http://localhost:4200
npm run build    # production build → dist/
npm test         # unit tests (Vitest)
```

---

## Project structure

```
src/app/
├── core/
│   ├── guards/          # auth.guard, redirect-if-auth.guard
│   ├── models/          # TypeScript interfaces
│   └── services/        # Supabase, Watchlist, Search, Friends, Profile, OpenAi
├── features/
│   ├── home/            # Landing page (unauthenticated)
│   ├── auth/            # Login (Google OAuth) + username dialog
│   ├── invite/          # Accepts a friend's one-time invite link
│   └── watchlist/
│       ├── watchlist-list/           # Grid, filters, sort
│       ├── watchlist-add/            # Search + add flow
│       ├── watchlist-shared/         # Friends roster, shared pool, tournament
│       ├── watchlist-detail-dialog/  # Title sheet (details, seasons, reactions)
│       ├── watchlist-ai-chat/        # FAB + AI chat panel
│       └── watchlist-*-dialog/       # Time picker, group pick, tournament
└── shared/
    └── pipes/           # MarkdownPipe (renders AI replies)

supabase/
├── functions/           # mimo-chat, refresh-series (edge functions)
└── migrations/          # Schema, RLS policies, cron
```

---

## Design

One token system, declared at the top of `src/styles.scss`. Nothing in the app
declares a raw colour, duration, easing or z-index — if a value is needed, it
gets a name there first.

- **Palette** — near-black tinted toward evergreen, malachite accent
- **Type** — Bricolage Grotesque (display) + Roboto (body) + system mono
- **Spacing** — 4pt scale
- **Motion** — three named easings; `prefers-reduced-motion` collapses it

Angular Material's M3 colour roles are pointed at those tokens in a single
`:root` bridge block rather than restyled component by component, so Material
components and hand-built ones draw from one palette. `mat.theme()` still
generates the ramp; the bridge overrides its colours (a `:root` selector
outranks the `html` one the mixin emits).

---

## Deployment

The app deploys automatically to Vercel on every push to `master`.

To inject keys at build time without committing them, set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `TMDB_API_KEY`, `MIMO_API_KEY` and `MIMO_MODEL` in your Vercel project environment variables — the `prebuild` script (`scripts/set-env.js`) generates `environment.prod.ts` from them before `ng build` runs.

A GitHub Actions workflow (`.github/workflows/supabase-keep-alive.yml`) pings the database daily to prevent Supabase free-tier pausing.

---

## License

MIT
