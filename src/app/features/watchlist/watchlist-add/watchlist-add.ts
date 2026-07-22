import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import {
  catchError,
  debounce,
  distinctUntilChanged,
  map,
  Observable,
  of,
  startWith,
  switchMap,
  timer,
} from 'rxjs';
import { DatePipe, DecimalPipe } from '@angular/common';
import { SearchService } from '../../../core/services/search.service';
import { WatchlistService } from '../../../core/services/watchlist.service';
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

@Component({
  selector: 'app-watchlist-add',
  imports: [
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    ReactiveFormsModule,
    DatePipe,
    MatIcon,
    DecimalPipe,
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
  readonly state = toSignal(
    this.searchControl.valueChanges.pipe(
      map((query) => (query ?? '').trim()),
      distinctUntilChanged(),
      // Only the network path is debounced: emptying the field clears the list
      // at once instead of 300ms later.
      debounce((query) => timer(query.length < MIN_QUERY ? 0 : 300)),
      switchMap(
        (query): Observable<SearchState> =>
          query.length < MIN_QUERY
            ? of({ status: 'idle', results: [] })
            : this.searchService.searchTmdb(query).pipe(
                map(
                  (results): SearchState => ({
                    status: results.length ? 'success' : 'no-results',
                    results,
                  }),
                ),
                startWith({ status: 'loading', results: [] } as SearchState),
                catchError(() => of<SearchState>({ status: 'error', results: [] })),
              ),
      ),
    ),
    { initialValue: { status: 'idle', results: [] } as SearchState },
  );

  /** Cached after the first load — the call is a no-op if a sibling pane loaded it. */
  private saved = toSignal(this.watchlistService.watchlistItems$, {
    initialValue: [] as WatchlistItem[],
  });
  private savedKeys = computed(() => new Set(this.saved().map((item) => this.key(item))));

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

  open(result: SearchResult): void {
    const dialogRef = WatchlistDetailDialog.open(this.dialog, { mode: 'preview', result });

    dialogRef.afterClosed().subscribe((status: DetailDialogStatus | undefined) => {
      // 'added' needs no snackbar: the row itself flips to "Added" in place.
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
