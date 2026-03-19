import { AsyncPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatTabsModule } from '@angular/material/tabs';
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
    MatFormFieldModule,
    MatSelectModule,
    AsyncPipe,
    MatIconModule,
  ],
  templateUrl: './watchlist-list.html',
  styleUrl: './watchlist-list.scss',
})
export class WatchlistList {
  private watchlist = inject(WatchlistService);
  filterChips = ['Movies', 'Series', 'Anime'];
  activeFilter = signal('All');
  activeSort = signal('added_desc');
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

  ngOnInit() {
    this.watchlist.getWatchlist();
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
      return items.filter((item) => item.type === 'anime');
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
    }
    return sortedItems;
  }
}
