/**
 * One-off backfill: populates director / duration_minutes / overview for
 * watchlist_items that were added before those fields were fetched.
 *
 * Runs against ALL users' rows, so it uses the Supabase SERVICE ROLE key
 * (bypasses RLS). That key is admin-only — keep it out of the client app and
 * out of version control.
 *
 * Required env (via .env or platform vars):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TMDB_API_KEY
 *
 * Run:  npm run backfill
 */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Load .env if present (mirrors scripts/set-env.js)
const dotenvPath = path.join(__dirname, '../.env');
if (fs.existsSync(dotenvPath)) {
  fs.readFileSync(dotenvPath, 'utf8')
    .split('\n')
    .forEach((line) => {
      const [key, ...rest] = line.trim().split('=');
      if (key && rest.length) process.env[key] = rest.join('=').trim();
    });
}

const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'TMDB_API_KEY'];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Missing required env vars: ${missing.join(', ')}`);
  console.error('SUPABASE_SERVICE_ROLE_KEY is the admin key (Settings → API → service_role).');
  process.exit(1);
}

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TMDB_API_KEY } = process.env;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Same mapping as SearchService.mapToEnrichment, in plain JS. */
function mapDetails(details, type) {
  const duration_minutes =
    type === 'movie'
      ? (details.runtime ?? null)
      : (details.episode_run_time && details.episode_run_time[0]) || null;
  const director =
    type === 'movie'
      ? (details.credits?.crew?.find((m) => m.job === 'Director')?.name ?? null)
      : (details.created_by?.[0]?.name ?? null);
  return { duration_minutes, director, overview: details.overview || null };
}

async function fetchDetails(externalId, type) {
  const endpoint = type === 'movie' ? 'movie' : 'tv';
  const url =
    `https://api.themoviedb.org/3/${endpoint}/${externalId}` +
    `?api_key=${TMDB_API_KEY}&append_to_response=credits`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TMDB ${res.status} for ${type}/${externalId}`);
  return res.json();
}

async function main() {
  const { data: rows, error } = await supabase
    .from('watchlist_items')
    .select('id, external_id, type, director, duration_minutes, overview')
    .eq('external_source', 'tmdb')
    .or('director.is.null,duration_minutes.is.null,overview.is.null');

  if (error) {
    console.error('Failed to load rows:', error.message);
    process.exit(1);
  }

  console.log(`Found ${rows.length} item(s) needing backfill.`);
  let updated = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const details = await fetchDetails(row.external_id, row.type);
      const enrichment = mapDetails(details, row.type);
      const { error: updateError } = await supabase
        .from('watchlist_items')
        .update(enrichment)
        .eq('id', row.id);
      if (updateError) throw new Error(updateError.message);
      updated++;
      console.log(`✓ ${row.type}/${row.external_id} → ${enrichment.director ?? 'n/a'}, ${enrichment.duration_minutes ?? '?'}m`);
    } catch (err) {
      failed++;
      console.warn(`✗ ${row.type}/${row.external_id}: ${err.message}`);
    }
    await sleep(80); // be polite to the TMDB API
  }

  console.log(`\nDone. Updated ${updated}, failed ${failed}, total ${rows.length}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
