import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BehaviorSubject, of } from 'rxjs';

import { WatchlistAdd } from './watchlist-add';
import { SearchService } from '../../../core/services/search.service';
import { WatchlistService } from '../../../core/services/watchlist.service';
import { SearchResult, WatchlistItem } from '../../../core/models/watchlist-item.model';

const result = (id: string, title: string) =>
  ({
    external_id: id,
    external_source: 'tmdb',
    title,
    type: 'movie',
    genres: [],
    vote_average: 7.8,
  }) as unknown as SearchResult;

describe('WatchlistAdd', () => {
  let component: WatchlistAdd;
  let fixture: ComponentFixture<WatchlistAdd>;
  let saved: BehaviorSubject<WatchlistItem[]>;

  beforeEach(async () => {
    saved = new BehaviorSubject<WatchlistItem[]>([]);

    await TestBed.configureTestingModule({
      imports: [WatchlistAdd],
      providers: [
        {
          provide: SearchService,
          useValue: { searchTmdb: () => of([result('1', 'Dune'), result('2', 'Dune: Part Two')]) },
        },
        {
          provide: WatchlistService,
          useValue: {
            watchlistItems$: saved,
            getWatchlist: () => Promise.resolve([]),
            addToWatchlist: (item: WatchlistItem) => {
              saved.next([...saved.value, item]);
              return Promise.resolve(item);
            },
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(WatchlistAdd);
    component = fixture.componentInstance;
    await fixture.whenStable();
    // Zoneless project — no fakeAsync/tick; vitest's timers drive the debounce.
    // Installed after whenStable, which needs the real ones.
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('searches past the minimum length and keeps the results after an add', () => {
    component.searchControl.setValue('du');
    vi.advanceTimersByTime(300);
    expect(component.state().status).toBe('idle');

    component.searchControl.setValue('dune');
    vi.advanceTimersByTime(300);
    expect(component.state().status).toBe('success');
    expect(component.state().results.length).toBe(2);

    // An add pushes into the watchlist — the list must stay, the row must flip.
    saved.next([{ external_id: '1', external_source: 'tmdb' } as WatchlistItem]);
    expect(component.state().results.length).toBe(2);
    expect(component.isAdded(result('1', 'Dune'))).toBe(true);
    expect(component.isAdded(result('2', 'Dune: Part Two'))).toBe(false);
  });

  it('quick-adds without the dialog and leaves the rest of the list addable', async () => {
    component.searchControl.setValue('dune');
    vi.advanceTimersByTime(300);

    await component.quickAdd(result('1', 'Dune'));
    expect(component.isAdded(result('1', 'Dune'))).toBe(true);
    expect(component.adding()).toBe(null);
    expect(component.state().results.length).toBe(2);

    // A second add on the same row is a no-op, not a duplicate insert.
    await component.quickAdd(result('1', 'Dune'));
    expect(saved.value.length).toBe(1);

    await component.quickAdd(result('2', 'Dune: Part Two'));
    expect(saved.value.length).toBe(2);
  });

  it('clears the results as soon as the query is cleared', () => {
    component.searchControl.setValue('dune');
    vi.advanceTimersByTime(300);
    expect(component.state().status).toBe('success');

    component.clear();
    vi.advanceTimersByTime(0);
    expect(component.state().status).toBe('idle');
    expect(component.state().results.length).toBe(0);
  });
});
