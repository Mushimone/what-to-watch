import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import {
  TmdbDetails,
  TmdbEnrichment,
  TmdbSearchResponse,
  TmdbWatchProvider,
  TmdbWatchProvidersResponse,
} from '../models/tmdb.model';
import { map, Observable } from 'rxjs';
import { MediaType, SearchResult } from '../models/watchlist-item.model';
@Injectable({
  providedIn: 'root',
})
export class SearchService {
  constructor(private http: HttpClient) {
    this.getTmdbGenres();
  }
  url = 'https://api.themoviedb.org/3/search/multi';
  /** Region used for streaming-availability lookups. */
  readonly watchRegion = 'IT';
  tmdbTvGenreMap: Record<number, string> = {};
  tmdbMovieGenreMap: Record<number, string> = {};

  /**
   * One page of results — TMDB serves 20 per page and `page` is 1-based.
   * `totalPages` is what tells the caller whether another page exists.
   */
  searchTmdb(
    query: string,
    page = 1,
  ): Observable<{ results: SearchResult[]; totalPages: number }> {
    const params = {
      api_key: environment.tmdb.apiKey,
      query: query,
      page,
    };
    return this.http.get<TmdbSearchResponse>(this.url, { params }).pipe(
      map((response) => ({
        results: this.mapToSearchResults(
          (response.results || []).filter(
            (result) => result.media_type === 'movie' || result.media_type === 'tv',
          ),
        ),
        totalPages: response.total_pages ?? 1,
      })),
    );
  }
  mapToSearchResults(results: TmdbSearchResponse['results']): SearchResult[] {
    return results.map((result) => ({
      title: result.media_type === 'movie' ? (result.title ?? '') : (result.name ?? ''),
      type: result.media_type === 'movie' ? 'movie' : 'series',
      genres: result.genre_ids.map((id) => this.getGenreNameById(id, result.media_type)),
      duration_minutes: null, // TMDb doesn't provide runtime in search results, would need an additional API call to fetch details
      episode_count: null, // real count comes from the details endpoint (number_of_episodes)
      poster_url: result.poster_path
        ? `https://image.tmdb.org/t/p/w500${result.poster_path}`
        : null,
      external_id: result.id.toString(),
      external_source: 'tmdb',
      // TMDB sends "" for unreleased/unknown dates — Postgres rejects it as a date
      release_date:
        (result.media_type === 'movie' ? result.release_date : result.first_air_date) || undefined,
      vote_average: result.vote_average,
    }));
  }

  /**
   * Fetches runtime, director and overview for a single title from the TMDb
   * details endpoint — none of which are returned by `search/multi`.
   */
  getTmdbDetails(externalId: string, type: MediaType): Observable<TmdbEnrichment> {
    const endpoint = type === 'movie' ? 'movie' : 'tv';
    const url = `https://api.themoviedb.org/3/${endpoint}/${externalId}`;
    const params = {
      api_key: environment.tmdb.apiKey,
      append_to_response: 'credits',
    };
    return this.http.get<TmdbDetails>(url, { params }).pipe(
      map((details) => this.mapToEnrichment(details, type)),
    );
  }

  /**
   * Returns the "flatrate" (subscription) streaming providers for a title in
   * the configured region. Empty array when nothing is available there.
   */
  getWatchProviders(externalId: string, type: MediaType): Observable<TmdbWatchProvider[]> {
    const endpoint = type === 'movie' ? 'movie' : 'tv';
    const url = `https://api.themoviedb.org/3/${endpoint}/${externalId}/watch/providers`;
    const params = { api_key: environment.tmdb.apiKey };
    return this.http
      .get<TmdbWatchProvidersResponse>(url, { params })
      .pipe(map((response) => response.results?.[this.watchRegion]?.flatrate ?? []));
  }

  private mapToEnrichment(details: TmdbDetails, type: MediaType): TmdbEnrichment {
    const duration_minutes =
      type === 'movie'
        ? (details.runtime ?? null)
        : (details.episode_run_time?.[0] ?? null);
    const director =
      type === 'movie'
        ? (details.credits?.crew.find((member) => member.job === 'Director')?.name ?? null)
        : (details.created_by?.[0]?.name ?? null);
    const backdrop_url = details.backdrop_path
      ? `https://image.tmdb.org/t/p/w780${details.backdrop_path}`
      : null;
    // Count only aired, non-special seasons — TMDB's number_of_seasons includes
    // renewed-but-unaired seasons (0 episodes), which show up as phantom chips.
    const airedSeasons = details.seasons?.filter(
      (s) => s.season_number >= 1 && s.episode_count > 0,
    ).length;
    const season_count =
      type === 'movie' ? null : (airedSeasons ?? details.number_of_seasons ?? null);
    const episode_count = type === 'movie' ? null : (details.number_of_episodes ?? null);
    return {
      duration_minutes,
      director,
      overview: details.overview || null,
      backdrop_url,
      season_count,
      episode_count,
    };
  }

  private getGenreNameById(id: number, mediaType: 'movie' | 'tv'): string {
    if (mediaType === 'movie') {
      return this.tmdbMovieGenreMap[id] || 'Unknown';
    } else {
      return this.tmdbTvGenreMap[id] || 'Unknown';
    }
  }
  getTmdbGenres() {
    this.getTmdbTvGenres().subscribe((genres) => {
      this.tmdbTvGenreMap = genres.reduce(
        (acc: Record<number, string>, genre) => {
          acc[genre.id] = genre.name;
          return acc;
        },
        {} as Record<number, string>,
      );
    });
    this.getTmdbMovieGenres().subscribe((genres) => {
      this.tmdbMovieGenreMap = genres.reduce(
        (acc: Record<number, string>, genre) => {
          acc[genre.id] = genre.name;
          return acc;
        },
        {} as Record<number, string>,
      );
    });
  }
  //
  getTmdbTvGenres() {
    const url = 'https://api.themoviedb.org/3/genre/tv/list';
    const params = {
      api_key: environment.tmdb.apiKey,
    };
    return this.http
      .get<{ genres: { id: number; name: string }[] }>(url, { params })
      .pipe(map((response) => response.genres));
  }
  getTmdbMovieGenres() {
    const url = 'https://api.themoviedb.org/3/genre/movie/list';
    const params = {
      api_key: environment.tmdb.apiKey,
    };
    return this.http
      .get<{ genres: { id: number; name: string }[] }>(url, { params })
      .pipe(map((response) => response.genres));
  }
}
