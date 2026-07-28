import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { SearchService } from './search.service';

describe('SearchService.searchByDirector', () => {
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

  it('resolves the director, keeps only Director credits, dedups and sorts newest-first', async () => {
    let out: any;
    service.searchByDirector('Nolan').subscribe((r) => (out = r));

    // 1) person lookup — an actor named Nolan comes first, the real director second.
    const person = http.expectOne((r) => r.url.includes('/search/person'));
    person.flush({
      results: [
        { id: 1, name: 'Some Actor', known_for_department: 'Acting', popularity: 9 },
        { id: 42, name: 'Christopher Nolan', known_for_department: 'Directing', popularity: 8 },
      ],
    });

    // 2) credits for the chosen director (id 42).
    const credits = http.expectOne((r) => r.url.includes('/person/42/movie_credits'));
    credits.flush({
      crew: [
        { id: 100, title: 'Inception', job: 'Director', genre_ids: [], poster_path: null, release_date: '2010-07-16', vote_average: 8.4 },
        { id: 100, title: 'Inception', job: 'Producer', genre_ids: [], poster_path: null, release_date: '2010-07-16', vote_average: 8.4 },
        { id: 200, title: 'Oppenheimer', job: 'Director', genre_ids: [], poster_path: null, release_date: '2023-07-21', vote_average: 8.1 },
        { id: 300, title: 'The Wolf of Wall Street', job: 'Producer', genre_ids: [], poster_path: null, release_date: '2013-12-25', vote_average: 8.2 },
      ],
    });

    expect(out.totalPages).toBe(1);
    // Only the two Director credits, deduped, newest first.
    expect(out.results.map((r: any) => r.title)).toEqual(['Oppenheimer', 'Inception']);
    expect(out.results.every((r: any) => r.type === 'movie')).toBe(true);
  });

  it('returns empty when no person matches', async () => {
    let out: any;
    service.searchByDirector('zzzz').subscribe((r) => (out = r));
    http.expectOne((r) => r.url.includes('/search/person')).flush({ results: [] });

    expect(out.results).toEqual([]);
  });
});
