export type MediaType = 'movie' | 'series' | 'anime';
export type ExternalSource = 'tmdb' | 'anilist';

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
  added_at: string;
  release_date?: string;
  vote_average?: number;
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
}
