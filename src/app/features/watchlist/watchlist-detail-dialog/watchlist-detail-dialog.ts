import { DecimalPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogModule,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { catchError, of, take } from 'rxjs';
import { OpenAiMessage } from '../../../core/models/openai.models';
import { TmdbWatchProvider } from '../../../core/models/tmdb.model';
import { OpenAiService } from '../../../core/services/openai.service';
import { SearchService } from '../../../core/services/search.service';
import { SupabaseService } from '../../../core/services/supabase.service';
import { WatchlistService } from '../../../core/services/watchlist.service';
import { SearchResult, WatchlistItem } from '../../../core/models/watchlist-item.model';
import { MarkdownPipe } from '../../../shared/pipes/markdown.pipe';

export type DetailDialogData =
  | WatchlistItem
  | { mode: 'preview'; result: SearchResult };

/** A successful add no longer closes the sheet — it switches it to saved mode. */
export type DetailDialogStatus = 'duplicate' | 'error';

@Component({
  selector: 'app-watchlist-detail-dialog',
  imports: [MatDialogModule, MatButtonModule, MatIconModule, DecimalPipe, MarkdownPipe],
  templateUrl: './watchlist-detail-dialog.html',
  styleUrl: './watchlist-detail-dialog.scss',
})
export class WatchlistDetailDialog {
  /**
   * Single entry point for every call site: consistent sheet config, plus the
   * back-button wiring. A history entry is pushed on open so the hardware/browser
   * Back gesture closes the sheet instead of leaving the page; closing any other
   * way (drag, X, action) pops that entry back off.
   */
  static open(
    dialog: MatDialog,
    data: DetailDialogData,
  ): MatDialogRef<WatchlistDetailDialog, DetailDialogStatus | undefined> {
    const ref = dialog.open<WatchlistDetailDialog, DetailDialogData, DetailDialogStatus>(
      WatchlistDetailDialog,
      { data, panelClass: 'detail-sheet', width: '680px', maxWidth: '95vw', autoFocus: false },
    );

    history.pushState({ detailSheet: true }, '');
    const onPop = () => ref.close();
    addEventListener('popstate', onPop);
    ref.afterClosed().subscribe(() => {
      removeEventListener('popstate', onPop);
      if (history.state?.detailSheet) history.back();
    });

    return ref;
  }

  private watchlist = inject(WatchlistService);
  private search = inject(SearchService);
  private supabase = inject(SupabaseService);
  private openai = inject(OpenAiService);
  private dialogRef = inject(MatDialogRef<WatchlistDetailDialog>);
  private data = inject<DetailDialogData>(MAT_DIALOG_DATA);

  readonly logoBase = 'https://image.tmdb.org/t/p/w92';
  readonly region = this.search.watchRegion;
  /**
   * Not readonly: a successful add flips the open sheet from preview to saved,
   * so the user lands on Remove / seasons / episodes without reopening it.
   */
  readonly mode = signal<'saved' | 'preview'>(
    'mode' in this.data && this.data.mode === 'preview' ? 'preview' : 'saved',
  );

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

    if (this.mode() === 'preview') {
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
      // Seen it — drop the "new season" badge.
      if (this.isOwn && current.has_update) {
        this.item.update((it) => ({ ...it, has_update: false }));
        this.watchlist.clearUpdateFlag(current.id);
      }
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
            // Backfill sparse enrichment; always refresh season/episode counts
            // since they grow over time as new episodes air (and are stale/null
            // in rows added before this was tracked).
            const patch: Partial<
              Pick<
                WatchlistItem,
                'duration_minutes' | 'director' | 'overview' | 'season_count' | 'episode_count'
              >
            > = needsDetails ? { ...itemFields } : {};
            if (current.type !== 'movie') {
              if (itemFields.season_count != null && itemFields.season_count !== current.season_count) {
                patch.season_count = itemFields.season_count;
              }
              if (itemFields.episode_count != null && itemFields.episode_count !== current.episode_count) {
                patch.episode_count = itemFields.episode_count;
              }
            }
            if (Object.keys(patch).length) {
              this.item.update((it) => ({ ...it, ...patch }));
              this.watchlist.updateDetails(current.id, patch);
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

  // ─── Drag to dismiss ────────────────────────────────────────────────────────
  // Only the grip strip at the top of the sheet is draggable (touch-action: none
  // there), so the scrolling body below keeps native scrolling untouched.
  dragY = signal(0);
  dragging = signal(false);
  private grabY = 0;
  private lastY = 0;
  private lastT = 0;

  onDragStart(event: PointerEvent): void {
    this.dragging.set(true);
    this.grabY = this.lastY = event.clientY;
    this.lastT = event.timeStamp;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  onDragMove(event: PointerEvent): void {
    if (!this.dragging()) return;
    this.dragY.set(Math.max(0, event.clientY - this.grabY));
    this.lastY = event.clientY;
    this.lastT = event.timeStamp;
  }

  onDragEnd(event: PointerEvent): void {
    if (!this.dragging()) return;
    this.dragging.set(false);
    // px/ms since the last move — a fast flick dismisses even on a short drag.
    const velocity = (event.clientY - this.lastY) / Math.max(1, event.timeStamp - this.lastT);
    if (this.dragY() > 120 || velocity > 0.5) this.dialogRef.close();
    else this.dragY.set(0);
  }

  /** True only for a saved item the current user owns — friend items (opened from
   * Shared) are read-only, so mutating actions and reactions are hidden. */
  get isOwn(): boolean {
    return this.mode() === 'saved' && this.item().user_id === this.supabase.getCurrentUser()?.id;
  }

  /** Tapping the active reaction again clears it. */
  setReaction(reaction: 'liked' | 'disliked'): void {
    if (!this.isOwn) return;
    const next = this.item().reaction === reaction ? null : reaction;
    this.item.update((it) => ({ ...it, reaction: next }));
    this.watchlist.setReaction(this.item().id, next);
  }

  /** Multi-season shows are tracked by whole season; flat ones (most anime) by episode. */
  get hasSeasons(): boolean {
    return (this.item().season_count ?? 0) >= 2;
  }
  get hasEpisodes(): boolean {
    return !this.hasSeasons && (this.item().episode_count ?? 0) > 1;
  }

  /** Season numbers to render (1…n), empty for movies or unknown counts. */
  get seasons(): number[] {
    const count = this.item().season_count;
    return count ? Array.from({ length: count }, (_, i) => i + 1) : [];
  }

  get watchedEpisodes(): number {
    return this.item().watched_episodes ?? 0;
  }
  get episodeTotal(): number {
    return this.item().episode_count ?? 0;
  }

  /** Live preview while dragging the slider — no DB write. */
  previewEpisodes(count: number): void {
    if (!this.isOwn) return;
    const total = this.episodeTotal;
    const clamped = Math.max(0, Math.min(count, total));
    this.item.update((it) => ({
      ...it,
      watched_episodes: clamped,
      watched: total > 0 && clamped >= total,
    }));
  }

  /** Commit on slider release or a +/- tap. */
  setEpisodes(count: number): void {
    if (!this.isOwn) return;
    this.previewEpisodes(count);
    this.watchlist.setWatchedEpisodes(this.item().id, this.watchedEpisodes);
  }

  isSeasonWatched(season: number): boolean {
    return (this.item().watched_seasons ?? []).includes(season);
  }

  toggleSeason(season: number): void {
    if (!this.isOwn) return;
    const set = new Set(this.item().watched_seasons ?? []);
    set.has(season) ? set.delete(season) : set.add(season);
    const watchedSeasons = [...set].sort((a, b) => a - b);
    const count = this.item().season_count;
    this.item.update((it) => ({
      ...it,
      watched_seasons: watchedSeasons,
      watched: count != null && watchedSeasons.length >= count,
    }));
    this.watchlist.setWatchedSeasons(this.item().id, watchedSeasons);
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
      // Stay open on the saved row the insert returned: the user keeps the
      // context they were reading and gets Remove / progress in place.
      this.item.set(status);
      this.mode.set('saved');
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

      this.openai.chat(messages, { reasoningEffort: 'low' }).subscribe({
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
    const watched = !it.watched;
    // Mirror the service's whole-series sync so the chips/stepper update in place.
    const patch: Partial<WatchlistItem> = { watched };
    if ((it.season_count ?? 0) >= 2) {
      patch.watched_seasons = watched ? this.seasons : [];
    } else if ((it.episode_count ?? 0) > 1) {
      patch.watched_episodes = watched ? it.episode_count! : 0;
    }
    this.item.update((current) => ({ ...current, ...patch }));
    this.watchlist.toggleWatchedStatus(it.id, watched);
  }

  remove(): void {
    this.watchlist.removeFromWatchlist(this.item().id);
    this.dialogRef.close();
  }
}
