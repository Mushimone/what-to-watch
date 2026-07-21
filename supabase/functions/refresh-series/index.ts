// Nightly job (invoked by pg_cron) that re-checks every TMDB series/anime on
// any watchlist against TMDB. When a show the user had marked fully watched
// gains a new aired season (or new episodes, for shows TMDB keeps as one
// season), it is un-marked — so it resurfaces in Not Watched — and flagged
// with has_update so the UI can show a "New season" badge.
//
// Deploy with:  supabase functions deploy refresh-series --no-verify-jwt
// Gated by a shared secret (CRON_SECRET) instead of a user JWT.

import { createClient } from 'jsr:@supabase/supabase-js@2';

type Row = {
  id: string;
  external_id: string;
  type: string;
  season_count: number | null;
  episode_count: number | null;
  watched: boolean;
};

Deno.serve(async (req) => {
  const secret = Deno.env.get('CRON_SECRET');
  if (secret && req.headers.get('x-cron-secret') !== secret) {
    return new Response('forbidden', { status: 403 });
  }

  const tmdbKey = Deno.env.get('TMDB_API_KEY');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!tmdbKey || !supabaseUrl || !serviceKey) {
    return new Response('not configured', { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  const { data: items, error } = await supabase
    .from('watchlist_items')
    .select('id, external_id, type, season_count, episode_count, watched')
    .in('type', ['series', 'anime'])
    .eq('external_source', 'tmdb')
    .returns<Row[]>();
  if (error) return new Response(error.message, { status: 500 });

  // Fetch each distinct show from TMDB once (many users may share a title).
  const freshById = new Map<string, { seasons: number; episodes: number }>();
  for (const id of new Set(items.map((i) => i.external_id))) {
    try {
      const res = await fetch(`https://api.themoviedb.org/3/tv/${id}?api_key=${tmdbKey}`);
      if (!res.ok) continue;
      const d = await res.json();
      // Count only aired, non-special seasons — excludes renewed-but-unaired ones.
      const seasons = (d.seasons ?? []).filter(
        (s: { season_number: number; episode_count: number }) =>
          s.season_number >= 1 && s.episode_count > 0,
      ).length;
      freshById.set(id, { seasons, episodes: d.number_of_episodes ?? 0 });
    } catch {
      // Skip this show on a transient TMDB error; next run retries.
    }
  }

  let updated = 0;
  let resurfaced = 0;
  for (const item of items) {
    const fresh = freshById.get(item.external_id);
    if (!fresh) continue;

    const patch: Record<string, unknown> = {};
    if (fresh.seasons !== item.season_count) patch.season_count = fresh.seasons;
    if (fresh.episodes !== item.episode_count) patch.episode_count = fresh.episodes;

    // Only a *known* previous count can grow. A null baseline means we're
    // learning the count for the first time — record it, never treat it as new
    // content, or every un-backfilled row resurfaces on the first run.
    const grew =
      (item.season_count != null && fresh.seasons > item.season_count) ||
      (item.episode_count != null && fresh.episodes > item.episode_count);
    if (item.watched && grew) {
      patch.watched = false; // back to Not Watched; old watched_seasons/episodes make it "partial"
      patch.has_update = true;
    }

    if (Object.keys(patch).length === 0) continue;
    const { error: upErr } = await supabase.from('watchlist_items').update(patch).eq('id', item.id);
    if (!upErr) {
      updated++;
      if (patch.has_update) resurfaced++;
    }
  }

  return new Response(JSON.stringify({ checked: items.length, updated, resurfaced }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
