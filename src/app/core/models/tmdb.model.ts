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
