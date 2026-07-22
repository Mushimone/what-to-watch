import { AsyncPipe, DecimalPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { WatchlistService } from '../../../core/services/watchlist.service';
import { combineLatest, map } from 'rxjs';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { WatchlistItem } from '../../../core/models/watchlist-item.model';
import { WatchlistDetailDialog } from '../watchlist-detail-dialog/watchlist-detail-dialog';
import { WatchlistTimePickerDialog } from '../watchlist-time-picker-dialog/watchlist-time-picker-dialog';

@Component({
  selector: 'app-watchlist-list',
  imports: [
    MatTabsModule,
    MatButtonModule,
    MatChipsModule,
    MatMenuModule,
    MatTooltipModule,
    AsyncPipe,
    DecimalPipe,
    MatIconModule,
  ],
  templateUrl: './watchlist-list.html',
  styleUrl: './watchlist-list.scss',
})
export class WatchlistList {
  private watchlist = inject(WatchlistService);
  private dialog = inject(MatDialog);
  filterChips = ['Movies', 'Series', 'Animation', 'Not Watched'];
  // Four sort dimensions; clicking the active one flips its direction.
  sortDimensions = [
    { key: 'added', label: 'Date added' },
    { key: 'title', label: 'Title' },
    { key: 'rating', label: 'Rating' },
    { key: 'duration', label: 'Duration' },
  ];
  private defaultDir: Record<string, 'asc' | 'desc'> = {
    added: 'desc',
    title: 'asc',
    rating: 'desc',
    duration: 'desc',
  };

  get activeSortKey(): string {
    return this.activeSort().split('_')[0];
  }
  get activeSortDir(): 'asc' | 'desc' {
    return this.activeSort().split('_')[1] as 'asc' | 'desc';
  }
  get activeSortLabel(): string {
    return this.sortDimensions.find((d) => d.key === this.activeSortKey)?.label ?? 'Sort';
  }
  activeFilter = signal('Not Watched');
  activeSort = signal('added_desc');
  isLoading = signal(true);
  watchlistItems$ = this.watchlist.watchlistItems$;
  /** Total count regardless of the active filter — drives empty-state messaging. */
  totalCount = toSignal(this.watchlistItems$.pipe(map((items) => items.length)), {
    initialValue: 0,
  });
  displayedItems$ = combineLatest([
    this.watchlistItems$,
    toObservable(this.activeFilter),
    toObservable(this.activeSort),
  ]).pipe(
    map(([items, filter, sort]: [WatchlistItem[], string, string]) => {
      return this.applyFilterAndSort(items, filter, sort);
    }),
  );

  private applyFilterAndSort(
    items: WatchlistItem[],
    filter: string,
    sort: string,
  ): WatchlistItem[] {
    const filteredItems = this.filterItems(items, filter);
    return this.sortItems(filteredItems, sort);
  }

  async ngOnInit() {
    await this.watchlist.getWatchlist();
    this.isLoading.set(false);
  }

  removeFromWatchlist(id: string) {
    this.watchlist.removeFromWatchlist(id);
  }

  toggleWatched(item: WatchlistItem) {
    this.watchlist.toggleWatchedStatus(item.id, !item.watched);
  }
  /** Tapping the active reaction again clears it. */
  setReaction(item: WatchlistItem, reaction: 'liked' | 'disliked') {
    this.watchlist.setReaction(item.id, item.reaction === reaction ? null : reaction);
  }
  applyFilter(filterValue: string) {
    if (filterValue === this.activeFilter()) {
      this.activeFilter.set('All');
      return;
    }
    this.activeFilter.set(filterValue);
  }
  changeSort(key: string) {
    if (this.activeSortKey === key) {
      this.activeSort.set(`${key}_${this.activeSortDir === 'desc' ? 'asc' : 'desc'}`);
    } else {
      this.activeSort.set(`${key}_${this.defaultDir[key]}`);
    }
  }
  private filterItems(items: WatchlistItem[], filter: string): WatchlistItem[] {
    if (filter === 'Movies') {
      return items.filter((item) => item.type === 'movie');
    } else if (filter === 'Series') {
      return items.filter((item) => item.type === 'series');
    } else if (filter === 'Animation') {
      return items.filter((item) => item.genres.includes('Animation'));
    } else if (filter === 'Not Watched') {
      return items.filter((item) => !item.watched);
    }
    return items;
  }

  private sortItems(items: WatchlistItem[], sort: string): WatchlistItem[] {
    const sortedItems = [...items];
    if (sort === 'added_desc') {
      sortedItems.sort((a, b) => new Date(b.added_at).getTime() - new Date(a.added_at).getTime());
    } else if (sort === 'added_asc') {
      sortedItems.sort((a, b) => new Date(a.added_at).getTime() - new Date(b.added_at).getTime());
    } else if (sort === 'title_asc') {
      sortedItems.sort((a, b) => a.title.localeCompare(b.title));
    } else if (sort === 'title_desc') {
      sortedItems.sort((a, b) => b.title.localeCompare(a.title));
    } else if (sort === 'rating_desc') {
      sortedItems.sort((a, b) => (b.vote_average ?? 0) - (a.vote_average ?? 0));
    } else if (sort === 'rating_asc') {
      sortedItems.sort((a, b) => (a.vote_average ?? 0) - (b.vote_average ?? 0));
    } else if (sort === 'duration_desc') {
      sortedItems.sort((a, b) => this.compareDuration(a, b, 'desc'));
    } else if (sort === 'duration_asc') {
      sortedItems.sort((a, b) => this.compareDuration(a, b, 'asc'));
    }
    return sortedItems;
  }

  // Items without a known runtime always sort to the bottom, regardless of direction.
  private compareDuration(a: WatchlistItem, b: WatchlistItem, direction: 'asc' | 'desc'): number {
    const aMin = a.duration_minutes;
    const bMin = b.duration_minutes;
    if (aMin == null && bMin == null) return 0;
    if (aMin == null) return 1;
    if (bMin == null) return -1;
    return direction === 'desc' ? bMin - aMin : aMin - bMin;
  }

  openDetail(item: WatchlistItem) {
    WatchlistDetailDialog.open(this.dialog, item);
  }

  openTimePicker() {
    this.dialog.open(WatchlistTimePickerDialog, {
      width: '480px',
      maxWidth: '95vw',
      autoFocus: false,
    });
  }
}
