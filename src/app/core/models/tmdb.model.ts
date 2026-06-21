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

export interface TmdbSearchResponse {
  page: number;
  results: TmdbSearchResult[];
  total_pages: number;
  total_results: number;
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
  /** Movies only */
  runtime?: number | null;
  /** TV only */
  episode_run_time?: number[] | null;
  /** TV only */
  created_by?: TmdbCreatedBy[];
  credits?: { crew: TmdbCrewMember[] };
}

/** Enrichment fields fetched from the TMDb details endpoint */
export interface TmdbEnrichment {
  duration_minutes: number | null;
  director: string | null;
  overview: string | null;
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
