import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { SearchService } from './search.service';

/** A /search/multi movie row — only the fields the mapper reads. */
const movie = (id: number, title: string, date = '2000-01-01') => ({
  id,
  title,
  media_type: 'movie',
  genre_ids: [],
  poster_path: null,
  release_date: date,
  vote_average: 7,
});

const person = (id: number, name: string, known_for_department: string) => ({
  id,
  name,
  media_type: 'person',
  known_for_department,
  popularity: 5,
});

describe('SearchService.searchTmdb', () => {
  let service: SearchService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(SearchService);
    http = TestBed.inject(HttpTestingController);
    // The constructor kicks off the two genre-list calls — drain them.
    http.match((r) => r.url.includes('/genre/')).forEach((r) => r.flush({ genres: [] }));
  });

  afterEach(() => http.verify());

  it('folds in the films of the director a name query matched, newest first', () => {
    let out: any;
    service.searchTmdb('Nolan').subscribe((r) => (out = r));

    // An actor shares the surname and outranks him — "Directing" wins.
    http.expectOne((r) => r.url.includes('/search/multi')).flush({
      results: [
        person(1, 'Jeanette Nolan', 'Acting'),
        person(42, 'Christopher Nolan', 'Directing'),
        movie(900, "Interstellar: Nolan's Odyssey"),
      ],
      total_pages: 1,
    });

    http.expectOne((r) => r.url.includes('/person/42/movie_credits')).flush({
      crew: [
        { ...movie(100, 'Inception', '2010-07-16'), job: 'Director' },
        // Second credit on his own film — must not repeat the title.
        { ...movie(100, 'Inception', '2010-07-16'), job: 'Producer' },
        { ...movie(200, 'Oppenheimer', '2023-07-21'), job: 'Director' },
        { ...movie(300, 'The Wolf of Wall Street', '2013-12-25'), job: 'Producer' },
      ],
    });

    // Directed films first, newest first, then the leftover title match.
    expect(out.results.map((r: any) => r.title)).toEqual([
      'Oppenheimer',
      'Inception',
      "Interstellar: Nolan's Odyssey",
    ]);
  });

  it('leaves a plain title search untouched — no person, no second call', () => {
    let out: any;
    service.searchTmdb('Inception').subscribe((r) => (out = r));

    http.expectOne((r) => r.url.includes('/search/multi')).flush({
      results: [movie(100, 'Inception'), movie(101, 'Bikini Inception')],
      total_pages: 3,
    });

    // http.verify() in afterEach proves no credits call was made.
    expect(out.results.map((r: any) => r.title)).toEqual(['Inception', 'Bikini Inception']);
    expect(out.totalPages).toBe(3);
  });

  it('drops a film from the title matches when the director already supplied it', () => {
    let out: any;
    service.searchTmdb('Gerwig').subscribe((r) => (out = r));

    // Tagged "Acting", but still the person to ask about — she directs.
    http.expectOne((r) => r.url.includes('/search/multi')).flush({
      results: [person(7, 'Greta Gerwig', 'Acting'), movie(500, 'Barbie', '2023-07-19')],
      total_pages: 1,
    });
    http.expectOne((r) => r.url.includes('/person/7/movie_credits')).flush({
      crew: [{ ...movie(500, 'Barbie', '2023-07-19'), job: 'Director' }],
    });

    expect(out.results.map((r: any) => r.title)).toEqual(['Barbie']);
  });

  it('keeps the title matches when the credits lookup fails', () => {
    let out: any;
    service.searchTmdb('Nolan').subscribe((r) => (out = r));

    http.expectOne((r) => r.url.includes('/search/multi')).flush({
      results: [person(42, 'Christopher Nolan', 'Directing'), movie(900, 'Facing Nolan')],
      total_pages: 1,
    });
    http
      .expectOne((r) => r.url.includes('/person/42/movie_credits'))
      .flush('boom', { status: 500, statusText: 'Server Error' });

    expect(out.results.map((r: any) => r.title)).toEqual(['Facing Nolan']);
  });

  it('does not re-fetch the filmography on later pages', () => {
    let out: any;
    service.searchTmdb('Nolan', 2).subscribe((r) => (out = r));

    http.expectOne((r) => r.url.includes('/search/multi')).flush({
      results: [person(42, 'Christopher Nolan', 'Directing'), movie(901, 'Nolan Doc')],
      total_pages: 3,
    });

    // http.verify() proves page 2 made no credits call.
    expect(out.results.map((r: any) => r.title)).toEqual(['Nolan Doc']);
  });
});
