export interface TmdbSearchResult {
  id: number;
  title?: string;
  name?: string;
  media_type: 'movie' | 'tv';
  genre_ids: number[];
  runtime?: number | null;
  episode_run_time?: number[] | null;
  poster_path: string | null;
  release_date?: string;
  first_air_date?: string;
  overview: string;
  vote_average: number;
}

/**
 * A person row in /search/multi. TMDB ranks one into the top few whenever the
 * query is a name, and returns none at all for a plain title — which is what
 * lets a single search fold in a director's films without a second mode.
 */
export interface TmdbPersonResult {
  id: number;
  name: string;
  media_type: 'person';
  known_for_department?: string;
  popularity: number;
}

/**
 * /find/{external_id} — results split by kind instead of carrying media_type,
 * so the caller stamps it back on. Only the two kinds we track are declared.
 */
export interface TmdbFindResponse {
  movie_results?: Omit<TmdbSearchResult, 'media_type'>[];
  tv_results?: Omit<TmdbSearchResult, 'media_type'>[];
}

export interface TmdbSearchResponse {
  page: number;
  results: (TmdbSearchResult | TmdbPersonResult)[];
  total_pages: number;
  total_results: number;
}

/** /person/{id}/movie_credits — crew rows carry the same movie fields as search. */
export interface TmdbMovieCreditsResponse {
  crew: (Omit<TmdbSearchResult, 'media_type'> & { job: string })[];
}

export interface TmdbCrewMember {
  job: string;
  name: string;
}

export interface TmdbCreatedBy {
  name: string;
}

/** Shape of /movie/{id} and /tv/{id} with append_to_response=credits */
export interface TmdbDetails {
  id: number;
  overview: string;
  backdrop_path?: string | null;
  /** Movies only */
  runtime?: number | null;
  /** TV only */
  episode_run_time?: number[] | null;
  /** TV only */
  created_by?: TmdbCreatedBy[];
  /** TV only — excludes specials (season 0) */
  number_of_seasons?: number | null;
  /** TV only — total episodes across all seasons */
  number_of_episodes?: number | null;
  /** TV only — per-season breakdown, incl. specials (season 0) and unaired seasons */
  seasons?: { season_number: number; episode_count: number }[];
  credits?: { crew: TmdbCrewMember[] };
}

/** Enrichment fields fetched from the TMDb details endpoint */
export interface TmdbEnrichment {
  duration_minutes: number | null;
  director: string | null;
  overview: string | null;
  backdrop_url: string | null;
  /** Total seasons — series/anime only; null for movies */
  season_count: number | null;
  /** Total episodes — series/anime only; null for movies */
  episode_count: number | null;
  /**
   * Episodes per aired season, index 0 = season 1 — series/anime only, empty for
   * movies. Not persisted: it comes free with every details fetch and only the
   * detail sheet needs it, to cap the stepper at the season in progress.
   */
  season_episodes: number[];
}

export interface TmdbWatchProvider {
  provider_id: number;
  provider_name: string;
  logo_path: string | null;
}

interface TmdbRegionProviders {
  link?: string;
  flatrate?: TmdbWatchProvider[];
  rent?: TmdbWatchProvider[];
  buy?: TmdbWatchProvider[];
}

/** Shape of /{movie|tv}/{id}/watch/providers — results keyed by ISO country code */
export interface TmdbWatchProvidersResponse {
  results: Record<string, TmdbRegionProviders>;
}
