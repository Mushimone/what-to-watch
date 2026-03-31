/**
 * Generates environment.ts and environment.prod.ts from environment variables.
 *
 * Local dev:  keys are read from a .env file (never committed).
 * CI / Vercel: keys are set as environment variables in the platform settings.
 *
 * Run via:  node scripts/set-env.js
 * Add to package.json scripts so it runs before `ng serve` / `ng build`.
 */
const fs = require('fs');
const path = require('path');

// Load .env if it exists (local development only)
const dotenvPath = path.join(__dirname, '../.env');
if (fs.existsSync(dotenvPath)) {
  fs.readFileSync(dotenvPath, 'utf8')
    .split('\n')
    .forEach((line) => {
      const [key, ...rest] = line.trim().split('=');
      if (key && rest.length) process.env[key] = rest.join('=').trim();
    });
}

const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'TMDB_API_KEY', 'GEMINI_API_KEY'];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Missing required env vars: ${missing.join(', ')}`);
  console.error('Copy environment.example.ts and fill in values, or create a .env file.');
  process.exit(1);
}

const escape = (v) => v.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

const SUPABASE_URL = escape(process.env.SUPABASE_URL);
const SUPABASE_ANON_KEY = escape(process.env.SUPABASE_ANON_KEY);
const TMDB_API_KEY = escape(process.env.TMDB_API_KEY);
const GEMINI_API_KEY = escape(process.env.GEMINI_API_KEY);

const template = (production) => `\
export const environment = {
  production: ${production},
  supabase: {
    url: '${SUPABASE_URL}',
    anonKey: '${SUPABASE_ANON_KEY}',
  },
  tmdb: {
    apiKey: '${TMDB_API_KEY}',
    baseUrl: 'https://api.themoviedb.org/3',
    imageBaseUrl: 'https://image.tmdb.org/t/p/w500',
  },
  anilist: {
    apiUrl: 'https://graphql.anilist.co',
  },
  gemini: {
    apiKey: '${GEMINI_API_KEY}',
  },
};
`;

const envDir = path.join(__dirname, '../src/environments');
fs.writeFileSync(path.join(envDir, 'environment.ts'), template(false), 'utf8');
fs.writeFileSync(path.join(envDir, 'environment.prod.ts'), template(true), 'utf8');
console.log('✓ environment.ts and environment.prod.ts generated from env vars');
