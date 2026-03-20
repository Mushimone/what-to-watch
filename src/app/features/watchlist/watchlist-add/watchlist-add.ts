import { Component, inject } from '@angular/core';
import {
  MatAutocompleteModule,
  MatAutocompleteSelectedEvent,
} from '@angular/material/autocomplete';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  filter,
  map,
  merge,
  startWith,
  Subject,
  switchMap,
} from 'rxjs';
import { AsyncPipe, DatePipe, DecimalPipe } from '@angular/common';
import { SearchService } from '../../../core/services/search.service';
import { WatchlistService } from '../../../core/services/watchlist.service';
import { SearchResult } from '../../../core/models/watchlist-item.model';
import { MatIcon } from '@angular/material/icon';

@Component({
  selector: 'app-watchlist-add',
  imports: [
    MatAutocompleteModule,
    MatFormFieldModule,
    MatInputModule,
    ReactiveFormsModule,
    AsyncPipe,
    DatePipe,
    MatIcon,
    DecimalPipe,
  ],
  templateUrl: './watchlist-add.html',
  styleUrl: './watchlist-add.scss',
})
export class WatchlistAdd {
  private searchService = inject(SearchService);
  private watchlistService = inject(WatchlistService);
  private snackBar = inject(MatSnackBar);

  searchControl = new FormControl('');
  private resetSearch$ = new Subject<void>();

  searchStatus$ = merge(
    this.searchControl.valueChanges.pipe(
      debounceTime(400),
      filter((query) => typeof query === 'string' && query.length > 2),
      map((query) => (query as string).trim()),
      filter((query) => query.length > 2),
      distinctUntilChanged(),
      switchMap((query) =>
        this.searchService.searchTmdb(query as string).pipe(
          map((results) =>
            results.length > 0
              ? { status: 'success', results }
              : { status: 'no-results', results: [] },
          ),
          startWith({ status: 'loading', results: [] }),
          catchError(() => [{ status: 'error', results: [] }]),
        ),
      ),
    ),
    this.resetSearch$.pipe(map(() => ({ status: 'idle', results: [] }))),
  ).pipe(startWith({ status: 'idle', results: [] }));

  // tells mat-autocomplete how to show the selected value in the input
  displayWith(result: SearchResult | string | null): string {
    if (!result || typeof result === 'string') return '';
    return result.title;
  }

  async onResultSelected(event: MatAutocompleteSelectedEvent) {
    const result: SearchResult = event.option.value;
    const item = { ...result, watched: false };
    const success = await this.watchlistService.addToWatchlist(item);
    if (success === 'duplicate') {
      this.snackBar.open(`"${result.title}" is already in your watchlist.`, 'OK', {
        duration: 3000,
      });
      this.searchControl.setValue('');
      this.resetSearch$.next();
    } else if (success !== null) {
      this.snackBar.open(`"${result.title}" added to your watchlist!`, 'OK', { duration: 3000 });
      this.searchControl.setValue('');
      this.resetSearch$.next();
    } else {
      this.snackBar.open('Something went wrong. Please try again.', 'Dismiss', { duration: 3000 });
    }
  }
}
