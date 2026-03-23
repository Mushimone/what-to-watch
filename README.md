# What to Watch

> Wanted a smarter watchlist. Built one.

**What to Watch** is a PWA for tracking movies, series and anime — with a built-in AI assistant that understands what you're in the mood for, not just what genre you want.

🔗 **[Live site](https://what-to-watch-tawny.vercel.app)**

---

## Features

|                |                                                                                                                                   |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 🔍 **Search**  | Find movies, series and anime via TMDB and AniList APIs                                                                           |
| ✅ **Track**   | Mark titles as watched / unwatched, filter and sort your list                                                                     |
| 🤖 **AI chat** | Context-aware assistant (Gemini 2.5 Flash) that knows your list and reasons about mood, tone and atmosphere — not just genre tags |
| 📱 **PWA**     | Installable on mobile, works like a native app                                                                                    |
| 🔐 **Auth**    | Google OAuth via Supabase, per-user data with Row Level Security                                                                  |

---

## Tech stack

- **Framework** — Angular 21 (standalone components, signals, control flow)
- **UI** — Angular Material 3, dark theme, mobile-first
- **Reactive layer** — RxJS (`combineLatest`, `BehaviorSubject`, `takeUntilDestroyed`)
- **Backend / Auth** — Supabase (PostgreSQL + RLS + Google OAuth)
- **AI** — Google Gemini 2.5 Flash REST API
- **External APIs** — TMDB (movies & series)
- **Deploy** — Vercel + Angular service worker (PWA)

---

## Getting started

### Prerequisites

- Node.js ≥ 18
- A [Supabase](https://supabase.com) project with Google OAuth enabled
- A [TMDB](https://www.themoviedb.org/settings/api) API key
- A [Gemini](https://aistudio.google.com/app/apikey) API key

### Setup

```bash
git clone https://github.com/your-username/what-to-watch.git
cd what-to-watch
npm install
```

Copy the environment template and fill in your keys:

```bash
cp src/environments/environment.example.ts src/environments/environment.ts
```

```ts
// src/environments/environment.ts
export const environment = {
  production: false,
  supabase: { url: 'YOUR_SUPABASE_URL', anonKey: 'YOUR_SUPABASE_ANON_KEY' },
  tmdb: { apiKey: 'YOUR_TMDB_KEY', baseUrl: '...', imageBaseUrl: '...' },
  gemini: { apiKey: 'YOUR_GEMINI_KEY' },
  anilist: { apiUrl: 'https://graphql.anilist.co' },
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
│   └── services/        # SupabaseService, WatchlistService, SearchService, GeminiService
├── features/
│   ├── home/            # Landing page (unauthenticated)
│   ├── auth/            # Login (Google OAuth)
│   └── watchlist/
│       ├── watchlist-list/     # Grid, filters, sort
│       ├── watchlist-add/      # Search + add flow
│       └── watchlist-ai-chat/  # FAB + AI chat panel
└── shared/
    └── pipes/           # MarkdownPipe (renders Gemini replies)
```

---

## Deployment

The app deploys automatically to Vercel on every push to `main`.

To inject the Gemini API key at build time without committing it, set `GEMINI_API_KEY` in your Vercel project environment variables — the `prebuild` script patches `environment.prod.ts` automatically before `ng build` runs.

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
