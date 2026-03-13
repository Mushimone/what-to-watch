import { Component, inject } from '@angular/core';
import {
  MatAutocompleteModule,
  MatAutocompleteSelectedEvent,
} from '@angular/material/autocomplete';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { debounceTime, filter, switchMap } from 'rxjs';
import { AsyncPipe } from '@angular/common';
import { SearchService } from '../../../core/services/search.service';
import { WatchlistService } from '../../../core/services/watchlist.service';
import { SearchResult } from '../../../core/models/watchlist-item.model';

@Component({
  selector: 'app-watchlist-add',
  imports: [
    MatAutocompleteModule,
    MatFormFieldModule,
    MatInputModule,
    ReactiveFormsModule,
    AsyncPipe,
  ],
  templateUrl: './watchlist-add.html',
  styleUrl: './watchlist-add.scss',
})
export class WatchlistAdd {
  private searchService = inject(SearchService);
  private watchlistService = inject(WatchlistService);
  private snackBar = inject(MatSnackBar);

  searchControl = new FormControl('');
  searchResults$ = this.searchControl.valueChanges.pipe(
    debounceTime(400),
    filter((query) => typeof query === 'string' && query.length > 2),
    switchMap((query) => this.searchService.searchTmdb(query as string)),
  );

  // tells mat-autocomplete how to show the selected value in the input
  displayWith(result: SearchResult | string | null): string {
    if (!result || typeof result === 'string') return '';
    return result.title;
  }

  async onResultSelected(event: MatAutocompleteSelectedEvent) {
    const result: SearchResult = event.option.value;
    const success = await this.watchlistService.addToWatchlist({ ...result, watched: false });
    if (success !== null) {
      this.snackBar.open(`"${result.title}" added to your watchlist!`, 'OK', { duration: 3000 });
    } else {
      this.snackBar.open('Something went wrong. Please try again.', 'Dismiss', { duration: 3000 });
    }
    this.searchControl.reset();
  }
}
