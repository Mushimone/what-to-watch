import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';

import { WatchlistList } from './watchlist-list';
import { WatchlistService } from '../../../core/services/watchlist.service';
import { WatchlistItem } from '../../../core/models/watchlist-item.model';

const items = Array.from(
  { length: 30 },
  (_, i) =>
    ({
      id: `${i}`,
      title: `Title ${i}`,
      type: 'movie',
      genres: [],
      watched: false,
      added_at: new Date(2026, 0, i + 1).toISOString(),
    }) as unknown as WatchlistItem,
);

describe('WatchlistList', () => {
  let component: WatchlistList;
  let fixture: ComponentFixture<WatchlistList>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WatchlistList],
      providers: [
        {
          provide: WatchlistService,
          useValue: {
            watchlistItems$: new BehaviorSubject<WatchlistItem[]>(items),
            getWatchlist: () => Promise.resolve(items),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(WatchlistList);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('paints one page at a time and grows as the sentinel is reached', () => {
    expect(component.displayedItems().length).toBe(24);
    expect(component.hasMore()).toBe(true);

    component.loadMore();
    expect(component.displayedItems().length).toBe(30);
    expect(component.hasMore()).toBe(false);
  });

  it('scrolls back to the first page when the narrowing changes', () => {
    component.loadMore();
    expect(component.displayedItems().length).toBe(30);

    component.query.set('title');
    expect(component.matched().length).toBe(30);
    expect(component.displayedItems().length).toBe(24);
  });

  describe('shows with something new', () => {
    beforeEach(() => {
      // The two oldest rows were flagged by the nightly job.
      const flagged = items.map((it, n) => (n < 2 ? { ...it, has_update: true } : it));
      (TestBed.inject(WatchlistService).watchlistItems$ as BehaviorSubject<WatchlistItem[]>).next(
        flagged,
      );
    });

    it('float to the top whatever the sort, each group keeping its own order', () => {
      // added_desc would put Title 29 first; the flagged pair leads instead.
      expect(component.displayedItems().slice(0, 3).map((i) => i.title)).toEqual([
        'Title 1',
        'Title 0',
        'Title 29',
      ]);

      component.changeSort('title');
      expect(component.displayedItems().slice(0, 3).map((i) => i.title)).toEqual([
        'Title 0',
        'Title 1',
        'Title 10',
      ]);
    });

    it('can be filtered down to, and counted', () => {
      expect(component.updateCount()).toBe(2);
      component.updatesOnly.set(true);
      expect(component.matched().length).toBe(2);
    });
  });
});
