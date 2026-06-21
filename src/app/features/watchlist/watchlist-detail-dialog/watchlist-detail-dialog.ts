import { DecimalPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { catchError, of, take } from 'rxjs';
import { OpenAiMessage } from '../../../core/models/openai.models';
import { TmdbWatchProvider } from '../../../core/models/tmdb.model';
import { OpenAiService } from '../../../core/services/openai.service';
import { SearchService } from '../../../core/services/search.service';
import { WatchlistService } from '../../../core/services/watchlist.service';
import { WatchlistItem } from '../../../core/models/watchlist-item.model';
import { MarkdownPipe } from '../../../shared/pipes/markdown.pipe';

@Component({
  selector: 'app-watchlist-detail-dialog',
  imports: [MatDialogModule, MatButtonModule, MatIconModule, DecimalPipe, MarkdownPipe],
  templateUrl: './watchlist-detail-dialog.html',
  styleUrl: './watchlist-detail-dialog.scss',
})
export class WatchlistDetailDialog {
  private watchlist = inject(WatchlistService);
  private search = inject(SearchService);
  private openai = inject(OpenAiService);
  private dialogRef = inject(MatDialogRef<WatchlistDetailDialog>);

  readonly logoBase = 'https://image.tmdb.org/t/p/w92';
  readonly region = this.search.watchRegion;

  item = signal(inject<WatchlistItem>(MAT_DIALOG_DATA));
  enriching = signal(false);

  // Where to watch
  providers = signal<TmdbWatchProvider[]>([]);
  providersLoading = signal(false);

  // More like this
  similar = signal<string | null>(null);
  similarLoading = signal(false);
  similarError = signal(false);

  constructor() {
    const current = this.item();
    // Older items added before enrichment may lack these fields — fetch and backfill.
    const needsDetails =
      current.external_source === 'tmdb' &&
      (current.duration_minutes == null || !current.director || !current.overview);
    if (needsDetails) {
      this.enriching.set(true);
      this.search
        .getTmdbDetails(current.external_id, current.type)
        .pipe(catchError(() => of(null)))
        .subscribe((details) => {
          this.enriching.set(false);
          if (!details) return;
          this.item.update((it) => ({ ...it, ...details }));
          this.watchlist.updateDetails(current.id, details);
        });
    }

    if (current.external_source === 'tmdb') {
      this.providersLoading.set(true);
      this.search
        .getWatchProviders(current.external_id, current.type)
        .pipe(catchError(() => of([])))
        .subscribe((providers) => {
          this.providers.set(providers);
          this.providersLoading.set(false);
        });
    }
  }

  /** Asks the AI for similar titles, excluding what's already in the user's list. */
  findSimilar(): void {
    if (this.similarLoading()) return;
    this.similarLoading.set(true);
    this.similarError.set(false);

    this.watchlist.watchlistItems$.pipe(take(1)).subscribe((items) => {
      const it = this.item();
      const owned = items.map((i) => i.title).join(', ') || 'none';
      const messages: OpenAiMessage[] = [
        {
          role: 'system',
          content:
            'You recommend movies and TV shows. Given one title the user likes, suggest 3 to 5 ' +
            'similar titles they would enjoy. Use your knowledge of plot, tone and themes — not ' +
            'just genre labels. Format as a markdown bullet list, each item "**Title** — one-line ' +
            'reason". Do not suggest any title that is already in the user\'s list. Be concise.',
        },
        {
          role: 'user',
          content:
            `I like "${it.title}" (${it.type}` +
            `${it.genres.length ? `, ${it.genres.join(', ')}` : ''}` +
            `${it.director ? `, directed by ${it.director}` : ''}). ` +
            `Recommend similar titles. Already in my list (do not suggest these): ${owned}.`,
        },
      ];

      this.openai.chat(messages).subscribe({
        next: (reply) => {
          this.similar.set(reply);
          this.similarLoading.set(false);
        },
        error: () => {
          this.similarError.set(true);
          this.similarLoading.set(false);
        },
      });
    });
  }

  get year(): string | null {
    return this.item().release_date?.slice(0, 4) || null;
  }

  /** Formats minutes as "2h 22m" / "45m". */
  get runtimeLabel(): string | null {
    const minutes = this.item().duration_minutes;
    if (minutes == null) return null;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h${mins ? ` ${mins}m` : ''}` : `${mins}m`;
  }

  toggleWatched(): void {
    const it = this.item();
    this.watchlist.toggleWatchedStatus(it.id, !it.watched);
    this.item.update((current) => ({ ...current, watched: !current.watched }));
  }

  remove(): void {
    this.watchlist.removeFromWatchlist(this.item().id);
    this.dialogRef.close();
  }
}
