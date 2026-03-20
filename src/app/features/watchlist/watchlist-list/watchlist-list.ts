import { AsyncPipe, DecimalPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { WatchlistService } from '../../../core/services/watchlist.service';
import { combineLatest, map } from 'rxjs';
import { toObservable } from '@angular/core/rxjs-interop';
import { WatchlistItem } from '../../../core/models/watchlist-item.model';

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
  filterChips = ['Movies', 'Series', 'Anime', 'Not Watched'];
  sortOptions = [
    { value: 'added_desc', label: 'Recently Added' },
    { value: 'added_asc', label: 'Oldest Added' },
    { value: 'title_asc', label: 'Title (A–Z)' },
    { value: 'title_desc', label: 'Title (Z–A)' },
    { value: 'rating_desc', label: 'Rating (High to Low)' },
    { value: 'rating_asc', label: 'Rating (Low to High)' },
  ];

  get activeSortLabel(): string {
    return this.sortOptions.find((o) => o.value === this.activeSort())?.label ?? 'Sort';
  }
  activeFilter = signal('All');
  activeSort = signal('added_desc');
  isLoading = signal(true);
  watchlistItems$ = this.watchlist.watchlistItems$;
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
  applyFilter(filterValue: string) {
    if (filterValue === this.activeFilter()) {
      this.activeFilter.set('All');
      return;
    }
    this.activeFilter.set(filterValue);
  }
  changeSort(sortValue: string) {
    this.activeSort.set(sortValue);
  }
  private filterItems(items: WatchlistItem[], filter: string): WatchlistItem[] {
    if (filter === 'Movies') {
      return items.filter((item) => item.type === 'movie');
    } else if (filter === 'Series') {
      return items.filter((item) => item.type === 'series');
    } else if (filter === 'Anime') {
      return items.filter((item) => item.type === 'series' && item.genres.includes('Animation'));
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
    }
    return sortedItems;
  }
}
