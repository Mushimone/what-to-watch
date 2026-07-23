import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { debounce, distinctUntilChanged, map, timer } from 'rxjs';
import { DatePipe, DecimalPipe } from '@angular/common';
import { SearchService } from '../../../core/services/search.service';
import { WatchlistService } from '../../../core/services/watchlist.service';
import { InfiniteScroll } from '../../../core/directives/infinite-scroll';
import { SearchResult, WatchlistItem } from '../../../core/models/watchlist-item.model';
import { MatIcon } from '@angular/material/icon';
import {
  DetailDialogStatus,
  WatchlistDetailDialog,
} from '../watchlist-detail-dialog/watchlist-detail-dialog';

interface SearchState {
  status: 'idle' | 'loading' | 'error' | 'no-results' | 'success';
  results: SearchResult[];
}

const MIN_QUERY = 3;
const IDLE: SearchState = { status: 'idle', results: [] };

@Component({
  selector: 'app-watchlist-add',
  imports: [
    MatButtonModule,
    MatProgressSpinnerModule,
    ReactiveFormsModule,
    DatePipe,
    MatIcon,
    DecimalPipe,
    InfiniteScroll,
  ],
  templateUrl: './watchlist-add.html',
  styleUrl: './watchlist-add.scss',
})
export class WatchlistAdd {
  private searchService = inject(SearchService);
  private snackBar = inject(MatSnackBar);
  private dialog = inject(MatDialog);
  private watchlistService = inject(WatchlistService);

  searchControl = new FormControl('');

  /**
   * Results render inline under the field, so the list has to survive an add —
   * that's the whole point of adding several in a row. Nothing here resets on
   * add; only clearing the query empties the list.
   */
  readonly state = signal<SearchState>(IDLE);

  /** Query the pages on screen belong to — guards against a stale response. */
  private query = '';
  /** Last page loaded, 0 before the first one lands. */
  private page = signal(0);
  private totalPages = signal(0);
  readonly loadingMore = signal(false);
  readonly hasMore = computed(() => this.page() > 0 && this.page() < this.totalPages());

  /** Cached after the first load — the call is a no-op if a sibling pane loaded it. */
  private saved = toSignal(this.watchlistService.watchlistItems$, {
    initialValue: [] as WatchlistItem[],
  });
  private savedKeys = computed(() => new Set(this.saved().map((item) => this.key(item))));

  /** Key of the row mid-add, so only that row shows a spinner. */
  readonly adding = signal<string | null>(null);

  readonly statusMessage = computed(() => {
    const { status, results } = this.state();
    if (status === 'loading') return 'Searching';
    if (status === 'error') return 'Search failed';
    if (status === 'no-results') return 'No results';
    if (status === 'success') return `${results.length} results`;
    return '';
  });

  constructor() {
    this.watchlistService.getWatchlist();
    this.searchControl.valueChanges
      .pipe(
        map((query) => (query ?? '').trim()),
        distinctUntilChanged(),
        // Only the network path is debounced: emptying the field clears the list
        // at once instead of 300ms later.
        debounce((query) => timer(query.length < MIN_QUERY ? 0 : 300)),
        takeUntilDestroyed(),
      )
      .subscribe((query) => this.startSearch(query));
  }

  private startSearch(query: string): void {
    this.query = query;
    this.page.set(0);
    this.totalPages.set(0);
    this.loadingMore.set(false);
    if (query.length < MIN_QUERY) {
      this.state.set(IDLE);
      return;
    }
    this.state.set({ status: 'loading', results: [] });
    this.fetchNextPage();
  }

  /** Appends the next page — called by the sentinel at the end of the list. */
  loadMore(): void {
    if (this.loadingMore() || !this.hasMore()) return;
    this.loadingMore.set(true);
    this.fetchNextPage();
  }

  private fetchNextPage(): void {
    const query = this.query;
    const page = this.page() + 1;
    this.searchService.searchTmdb(query, page).subscribe({
      next: ({ results, totalPages }) => {
        if (query !== this.query) return; // a newer query already won
        this.page.set(page);
        this.totalPages.set(totalPages);
        this.loadingMore.set(false);
        this.state.update(({ results: loaded }) => {
          // TMDB repeats the odd title across pages; duplicate @for keys throw.
          const seen = new Set(loaded.map((item) => this.key(item)));
          const merged =
            page === 1
              ? results
              : [...loaded, ...results.filter((item) => !seen.has(this.key(item)))];
          return { status: merged.length ? 'success' : 'no-results', results: merged };
        });
      },
      error: () => {
        if (query !== this.query) return;
        this.loadingMore.set(false);
        // A failed first page is the error state; a failed page N keeps what's
        // on screen and stops paging, so the sentinel can't retry in a loop.
        if (page === 1) this.state.set({ status: 'error', results: [] });
        else this.totalPages.set(this.page());
      },
    });
  }

  key(item: { external_source: string; external_id: string | number }): string {
    return `${item.external_source}:${item.external_id}`;
  }

  /** Drives the row's "Added" state — derived from the list, so an add updates it. */
  isAdded(result: SearchResult): boolean {
    return this.savedKeys().has(this.key(result));
  }

  clear(): void {
    this.searchControl.setValue('');
  }

  /**
   * Straight to the list, no sheet: adding several titles in a row shouldn't
   * cost a dialog round-trip each. The row still opens the sheet for anyone who
   * wants the details first. Sparse fields are backfilled when the item is
   * opened later, so the raw search result is enough to save.
   */
  async quickAdd(result: SearchResult): Promise<void> {
    if (this.adding() || this.isAdded(result)) return;
    this.adding.set(this.key(result));
    const status = await this.watchlistService.addToWatchlist({ ...result, watched: false });
    this.adding.set(null);

    if (status === 'duplicate') {
      this.snackBar.open(`"${result.title}" is already in your watchlist.`, 'OK', {
        duration: 3000,
      });
    } else if (status === null) {
      this.snackBar.open('Something went wrong. Please try again.', 'Dismiss', { duration: 3000 });
    }
    // Success is silent — the row flips to "Added" where the user is looking.
  }

  open(result: SearchResult): void {
    const dialogRef = WatchlistDetailDialog.open(this.dialog, { mode: 'preview', result });

    dialogRef.afterClosed().subscribe((status: DetailDialogStatus | undefined) => {
      // A successful add doesn't close the sheet — it switches to saved mode
      // there — and the row behind it flips to "Added" on its own.
      if (status === 'duplicate') {
        this.snackBar.open(`"${result.title}" is already in your watchlist.`, 'OK', {
          duration: 3000,
        });
      } else if (status === 'error') {
        this.snackBar.open('Something went wrong. Please try again.', 'Dismiss', {
          duration: 3000,
        });
      }
    });
  }
}
