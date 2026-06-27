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
import { SearchResult, WatchlistItem } from '../../../core/models/watchlist-item.model';
import { MarkdownPipe } from '../../../shared/pipes/markdown.pipe';

export type DetailDialogData =
  | WatchlistItem
  | { mode: 'preview'; result: SearchResult };

export type DetailDialogStatus = 'added' | 'duplicate' | 'error';

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
  private data = inject<DetailDialogData>(MAT_DIALOG_DATA);

  readonly logoBase = 'https://image.tmdb.org/t/p/w92';
  readonly region = this.search.watchRegion;
  readonly mode: 'saved' | 'preview' =
    'mode' in this.data && this.data.mode === 'preview' ? 'preview' : 'saved';

  item = signal<WatchlistItem>(this.buildItem());
  enriching = signal(false);
  backdrop = signal<string | null>(null);
  alreadyAdded = signal(false);
  adding = signal(false);

  providers = signal<TmdbWatchProvider[]>([]);
  providersLoading = signal(false);

  similar = signal<string | null>(null);
  similarLoading = signal(false);
  similarError = signal(false);

  constructor() {
    const current = this.item();

    if (this.mode === 'preview') {
      this.enriching.set(true);
      this.search
        .getTmdbDetails(current.external_id, current.type)
        .pipe(catchError(() => of(null)))
        .subscribe((details) => {
          this.enriching.set(false);
          if (!details) return;
          const { backdrop_url, ...itemFields } = details;
          this.item.update((it) => ({ ...it, ...itemFields }));
          if (backdrop_url) this.backdrop.set(backdrop_url);
        });

      const previewResult = (this.data as { mode: 'preview'; result: SearchResult }).result;
      this.watchlist.watchlistItems$.pipe(take(1)).subscribe((items) => {
        const exists = items.some(
          (i) =>
            i.external_id === previewResult.external_id &&
            i.external_source === previewResult.external_source,
        );
        this.alreadyAdded.set(exists);
      });
    } else {
      // Saved mode: always fetch details for backdrop; only backfill DB if the item is sparse.
      if (current.external_source === 'tmdb') {
        const needsDetails =
          current.duration_minutes == null || !current.director || !current.overview;
        this.enriching.set(true);
        this.search
          .getTmdbDetails(current.external_id, current.type)
          .pipe(catchError(() => of(null)))
          .subscribe((details) => {
            this.enriching.set(false);
            if (!details) return;
            const { backdrop_url, ...itemFields } = details;
            if (backdrop_url) this.backdrop.set(backdrop_url);
            if (needsDetails) {
              this.item.update((it) => ({ ...it, ...itemFields }));
              this.watchlist.updateDetails(current.id, itemFields);
            }
          });
      }
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

  private buildItem(): WatchlistItem {
    if ('mode' in this.data && this.data.mode === 'preview') {
      const r = this.data.result;
      return {
        id: '',
        user_id: '',
        added_at: '',
        watched: false,
        ...r,
      };
    }
    return this.data as WatchlistItem;
  }

  async add(): Promise<void> {
    if (this.adding() || this.alreadyAdded()) return;
    this.adding.set(true);
    const { id, user_id, added_at, watched, ...addPayload } = this.item();
    const status = await this.watchlist.addToWatchlist({ ...addPayload, watched: false });
    this.adding.set(false);
    if (status === 'duplicate') {
      this.dialogRef.close('duplicate' as DetailDialogStatus);
    } else if (status !== null) {
      this.dialogRef.close('added' as DetailDialogStatus);
    } else {
      this.dialogRef.close('error' as DetailDialogStatus);
    }
  }

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
            'You recommend movies and TV shows. Given one title the user likes, suggest exactly 4 ' +
            'similar titles they would enjoy, matching on plot, tone and themes — not just genre ' +
            'labels. Prefer well-known, findable titles.\n' +
            'Output ONLY a markdown bullet list, nothing before or after it. Each bullet must be ' +
            'exactly: "**Title (Year)** — reason." where the reason is a single sentence of at ' +
            'most 15 words. Never repeat the source title or any title in the exclusion list.',
        },
        {
          role: 'user',
          content:
            `Title I like: "${it.title}" (${it.type}` +
            `${it.release_date ? `, ${it.release_date.slice(0, 4)}` : ''}` +
            `${it.genres.length ? `, ${it.genres.join(', ')}` : ''}` +
            `${it.director ? `, directed by ${it.director}` : ''}).` +
            `${it.overview ? `\nFor reference, its plot: ${it.overview.slice(0, 240)}` : ''}\n` +
            `Do not suggest any of these (already in my list): ${owned}.`,
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
