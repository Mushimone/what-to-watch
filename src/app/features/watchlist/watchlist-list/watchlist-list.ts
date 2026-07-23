import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { WatchlistService } from '../../../core/services/watchlist.service';
import { toSignal } from '@angular/core/rxjs-interop';
import { InfiniteScroll } from '../../../core/directives/infinite-scroll';
import { WatchlistItem } from '../../../core/models/watchlist-item.model';
import { WatchlistDetailDialog } from '../watchlist-detail-dialog/watchlist-detail-dialog';
import { WatchlistTimePickerDialog } from '../watchlist-time-picker-dialog/watchlist-time-picker-dialog';

/** Cards rendered per scroll step — the whole list is already in memory. */
const PAGE = 24;

@Component({
  selector: 'app-watchlist-list',
  imports: [
    MatTabsModule,
    MatButtonModule,
    MatMenuModule,
    MatTooltipModule,
    DecimalPipe,
    MatIconModule,
    InfiniteScroll,
  ],
  templateUrl: './watchlist-list.html',
  styleUrl: './watchlist-list.scss',
})
export class WatchlistList {
  private watchlist = inject(WatchlistService);
  private dialog = inject(MatDialog);
  // The three type filters live behind the Filter button; "Not watched" stays out
  // as its own toggle since it's the default view and the one flipped most often.
  typeFilters = [
    { key: 'movie', label: 'Movies', icon: 'movie' },
    { key: 'series', label: 'Series', icon: 'live_tv' },
    { key: 'animation', label: 'Animation', icon: 'animation' },
  ];
  // Four sort dimensions; clicking the active one flips its direction.
  sortDimensions = [
    { key: 'added', label: 'Date added', icon: 'history' },
    { key: 'title', label: 'Title', icon: 'sort_by_alpha' },
    { key: 'rating', label: 'Rating', icon: 'star' },
    { key: 'duration', label: 'Duration', icon: 'hourglass_empty' },
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
  // Three independent narrowing dimensions — picking a type no longer silently
  // drops the unwatched-only view the way the old single-chip filter did.
  query = signal('');
  activeType = signal<string | null>(null);
  unwatchedOnly = signal(true);
  activeSort = signal('added_desc');
  isLoading = signal(true);

  get activeTypeLabel(): string | null {
    return this.typeFilters.find((t) => t.key === this.activeType())?.label ?? null;
  }

  private items = toSignal(this.watchlist.watchlistItems$, { initialValue: [] as WatchlistItem[] });
  /** Total count regardless of the active filter — drives empty-state messaging. */
  totalCount = computed(() => this.items().length);
  /** Everything matching the filters — what the "x of y" chip counts. */
  matched = computed(() =>
    this.sortItems(
      this.filterItems(this.items(), this.query(), this.activeType(), this.unwatchedOnly()),
      this.activeSort(),
    ),
  );
  // The full list is fetched once and filtered in memory, so paging here is
  // rendering only: cards are cheap to keep but not to paint all at once.
  // Any change to the narrowing starts the scroll over at the first page.
  private limit = linkedSignal({
    source: () => [this.query(), this.activeType(), this.unwatchedOnly(), this.activeSort()],
    computation: () => PAGE,
  });
  displayedItems = computed(() => this.matched().slice(0, this.limit()));
  hasMore = computed(() => this.limit() < this.matched().length);

  loadMore() {
    this.limit.update((count) => count + PAGE);
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
  /** Picking the active type again clears it — the menu doubles as its own reset. */
  applyType(key: string) {
    this.activeType.update((current) => (current === key ? null : key));
  }

  clearNarrowing() {
    this.query.set('');
    this.activeType.set(null);
    this.unwatchedOnly.set(false);
  }
  changeSort(key: string) {
    if (this.activeSortKey === key) {
      this.activeSort.set(`${key}_${this.activeSortDir === 'desc' ? 'asc' : 'desc'}`);
    } else {
      this.activeSort.set(`${key}_${this.defaultDir[key]}`);
    }
  }
  private filterItems(
    items: WatchlistItem[],
    query: string,
    type: string | null,
    unwatchedOnly: boolean,
  ): WatchlistItem[] {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      if (unwatchedOnly && item.watched) return false;
      if (type === 'movie' && item.type !== 'movie') return false;
      if (type === 'series' && item.type !== 'series') return false;
      if (type === 'animation' && !item.genres.includes('Animation')) return false;
      if (needle && !item.title.toLowerCase().includes(needle)) return false;
      return true;
    });
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
