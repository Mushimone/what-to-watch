export type MediaType = 'movie' | 'series' | 'anime';
export type ExternalSource = 'tmdb';

export interface WatchlistItem {
  id: string;
  user_id: string;
  title: string;
  type: MediaType;
  genres: string[];
  /** Minutes — populated for movies only */
  duration_minutes: number | null;
  /** Episode count — populated for series and anime only */
  episode_count: number | null;
  poster_url: string | null;
  external_id: string;
  external_source: ExternalSource;
  watched: boolean;
  /** Total seasons — series/anime only; null for movies or when unknown */
  season_count?: number | null;
  /** Season numbers the owner has marked watched — series/anime only */
  watched_seasons?: number[];
  /** How many episodes watched — used for shows TMDB flattens to one season */
  watched_episodes?: number;
  /** Set by the nightly job when a finished show gained a new season/episodes */
  has_update?: boolean;
  /** Owner's personal reaction; null/undefined = not rated */
  reaction?: 'liked' | 'disliked' | null;
  added_at: string;
  release_date?: string;
  vote_average?: number;
  director?: string | null;
  overview?: string | null;
}

/** Shape of a search result before it is saved to the watchlist */
export interface SearchResult {
  title: string;
  type: MediaType;
  genres: string[];
  duration_minutes: number | null;
  episode_count: number | null;
  poster_url: string | null;
  external_id: string;
  external_source: ExternalSource;
  release_date?: string;
  vote_average?: number;
  director?: string | null;
  overview?: string | null;
}
