import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import {
  TmdbDetails,
  TmdbEnrichment,
  TmdbMovieCreditsResponse,
  TmdbPersonResult,
  TmdbSearchResponse,
  TmdbSearchResult,
  TmdbWatchProvider,
  TmdbWatchProvidersResponse,
} from '../models/tmdb.model';
import { catchError, map, Observable, of, Subject, switchMap } from 'rxjs';
import { MediaType, SearchResult } from '../models/watchlist-item.model';
@Injectable({
  providedIn: 'root',
})
export class SearchService {
  constructor(private http: HttpClient) {
    this.getTmdbGenres();
  }
  url = 'https://api.themoviedb.org/3/search/multi';
  /**
   * A search asked for from somewhere that can't reach the Add pane — today the
   * detail sheet's director link. The shell brings the pane forward, the pane
   * runs the query. An event, not state: it fires inside the click that asked
   * for it, so nothing is left over to consume or re-fire later.
   */
  private searchRequestSubject = new Subject<string>();
  searchRequests$ = this.searchRequestSubject.asObservable();

  requestSearch(query: string): void {
    this.searchRequestSubject.next(query);
  }
  /** Region used for streaming-availability lookups. */
  readonly watchRegion = 'IT';
  tmdbTvGenreMap: Record<number, string> = {};
  tmdbMovieGenreMap: Record<number, string> = {};

  /**
   * One page of results — TMDB serves 20 per page and `page` is 1-based.
   * `totalPages` is what tells the caller whether another page exists.
   *
   * Searching a director's name is the same search: /search/multi already ranks
   * the person into the top few for a name, and returns none at all for a plain
   * title, so page 1 uses that to pull in the films they directed. One box, no
   * mode to pick.
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
      switchMap((response) => {
        const all = response.results || [];
        const titles = this.mapToSearchResults(
          all.filter(
            (result): result is TmdbSearchResult =>
              result.media_type === 'movie' || result.media_type === 'tv',
          ),
        );
        const totalPages = response.total_pages ?? 1;

        // Only the first page carries the filmography — later pages just
        // continue the title matches, and the caller dedups across pages.
        const person = page === 1 ? this.pickPerson(all) : undefined;
        if (!person) return of({ results: titles, totalPages });

        return this.directedBy(person.id).pipe(
          map((directed) => {
            const seen = new Set(directed.map((d) => `${d.type}:${d.external_id}`));
            return {
              results: [
                ...directed,
                ...titles.filter((t) => !seen.has(`${t.type}:${t.external_id}`)),
              ],
              totalPages,
            };
          }),
          // The title matches are already in hand — a failed credits lookup
          // must not take the whole search down with it.
          catchError(() => of({ results: titles, totalPages })),
        );
      }),
    );
  }

  /**
   * The person a name query most likely meant. TMDB's own ranking does the
   * work; "Directing" wins over an actor who happens to share the surname
   * (Hayao Miyazaki outranked by an actor named Miyazaki, say). Anyone who
   * directs is still worth asking about — Gerwig and Affleck are filed under
   * "Acting" — and a non-director simply comes back with no Director credits.
   */
  private pickPerson(results: TmdbSearchResponse['results']) {
    const people = results
      .slice(0, 5)
      .filter((r): r is TmdbPersonResult => r.media_type === 'person');
    return people.find((p) => p.known_for_department === 'Directing') ?? people[0];
  }

  /**
   * The movies a person directed, newest first. Movies only: TV credits a
   * series to created_by rather than a per-title Director. Credits come
   * unpaged, so this is the whole filmography in one response.
   */
  private directedBy(personId: number): Observable<SearchResult[]> {
    const url = `https://api.themoviedb.org/3/person/${personId}/movie_credits`;
    return this.http
      .get<TmdbMovieCreditsResponse>(url, { params: { api_key: environment.tmdb.apiKey } })
      .pipe(
        map((credits) => {
          // A director often holds a second credit on their own film (writer,
          // producer), which repeats the title — keep the first of each id.
          const seen = new Set<number>();
          const directed = (credits.crew ?? [])
            .filter((c) => c.job === 'Director')
            .filter((c) => (seen.has(c.id) ? false : seen.add(c.id)))
            .sort((a, b) => (b.release_date ?? '').localeCompare(a.release_date ?? ''))
            .map((c) => ({ ...c, media_type: 'movie' as const }));
          return this.mapToSearchResults(directed);
        }),
      );
  }

  mapToSearchResults(results: TmdbSearchResult[]): SearchResult[] {
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
    const airedSeasons = details.seasons
      ?.filter((s) => s.season_number >= 1 && s.episode_count > 0)
      .sort((a, b) => a.season_number - b.season_number);
    const season_count =
      type === 'movie' ? null : (airedSeasons?.length ?? details.number_of_seasons ?? null);
    const episode_count = type === 'movie' ? null : (details.number_of_episodes ?? null);
    // ponytail: index 0 = season 1, which drifts if a middle season aired nothing
    // and got filtered out. Key by season_number if that ever shows up in the wild.
    const season_episodes =
      type === 'movie' ? [] : (airedSeasons?.map((s) => s.episode_count) ?? []);
    return {
      duration_minutes,
      director,
      overview: details.overview || null,
      backdrop_url,
      season_count,
      episode_count,
      season_episodes,
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
