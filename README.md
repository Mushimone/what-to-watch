# What to Watch

> Wanted a smarter watchlist. Built one.

**What to Watch** is a PWA for tracking movies, series and anime — with a built-in AI assistant that understands what you're in the mood for, not just what genre you want.

🔗 **[Live site](https://what-to-watch-tawny.vercel.app)**

---

## Features

|                |                                                                                                                                   |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 🔍 **Search**  | Find movies, series and anime via the TMDB API                                                                                    |
| ✅ **Track**   | Mark titles as watched / unwatched, filter and sort your list                                                                     |
| 🤖 **AI chat** | Context-aware assistant (MiMo) that knows your list and reasons about mood, tone and atmosphere — not just genre tags            |
| 📱 **PWA**     | Installable on mobile, works like a native app                                                                                    |
| 🔐 **Auth**    | Google OAuth via Supabase, per-user data with Row Level Security                                                                  |

---

## Tech stack

- **Framework** — Angular 21 (standalone components, signals, control flow)
- **UI** — Angular Material 3, dark theme, mobile-first
- **Reactive layer** — RxJS (`combineLatest`, `BehaviorSubject`, `takeUntilDestroyed`)
- **Backend / Auth** — Supabase (PostgreSQL + RLS + Google OAuth)
- **AI** — MiMo (OpenAI-compatible chat-completions API)
- **External APIs** — TMDB (movies & series)
- **Deploy** — Vercel + Angular service worker (PWA)

---

## Getting started

### Prerequisites

- Node.js ≥ 18
- A [Supabase](https://supabase.com) project with Google OAuth enabled
- A [TMDB](https://www.themoviedb.org/settings/api) API key
- A MiMo API key + model name

### Setup

```bash
git clone https://github.com/your-username/what-to-watch.git
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
│   └── services/        # SupabaseService, WatchlistService, SearchService, OpenAiService
├── features/
│   ├── home/            # Landing page (unauthenticated)
│   ├── auth/            # Login (Google OAuth)
│   └── watchlist/
│       ├── watchlist-list/     # Grid, filters, sort
│       ├── watchlist-add/      # Search + add flow
│       └── watchlist-ai-chat/  # FAB + AI chat panel
└── shared/
    └── pipes/           # MarkdownPipe (renders AI replies)
```

---

## Deployment

The app deploys automatically to Vercel on every push to `main`.

To inject keys at build time without committing them, set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `TMDB_API_KEY`, `MIMO_API_KEY` and `MIMO_MODEL` in your Vercel project environment variables — the `prebuild` script (`scripts/set-env.js`) generates `environment.prod.ts` from them before `ng build` runs.

A GitHub Actions workflow (`.github/workflows/supabase-keep-alive.yml`) pings the database daily to prevent Supabase free-tier pausing.

---

## License

MIT

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
